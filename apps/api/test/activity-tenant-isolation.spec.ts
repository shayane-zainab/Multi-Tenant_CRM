import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversationService } from "../src/google/conversation.service";

const suffix = process.env.TEST_RUN_ID ?? "activity-isolation-spec";
const orgA = `org-a-${suffix}`;
const orgB = `org-b-${suffix}`;
const userId = `user-${suffix}`;
const email = `tester@isolation-${suffix}.test`;

const stamp = new ActivityStampService(db);
const activities = new ActivitiesService(db, stamp);
const conversations = new ConversationService(db);

let companyB = "";
let contactB = "";
let dealB = "";
let threadB = "";
let eventB = "";

async function clean() {
	const orgs = { organizationId: { in: [orgA, orgB] } };

	await db.activity.deleteMany({ where: orgs });
	await db.emailThread.deleteMany({ where: orgs });
	await db.calendarEvent.deleteMany({ where: orgs });
	await db.deal.deleteMany({ where: orgs });
	await db.contact.deleteMany({ where: orgs });
	await db.company.deleteMany({ where: orgs });
	await db.member.deleteMany({ where: orgs });
	await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	const now = new Date();

	await db.organization.createMany({
		data: [
			{
				id: orgA,
				name: "Tenant A",
				slug: `tenant-a-${suffix}`,
				createdAt: now,
			},
			{
				id: orgB,
				name: "Tenant B",
				slug: `tenant-b-${suffix}`,
				createdAt: now,
			},
		],
	});

	await db.user.create({
		data: {
			id: userId,
			name: "Isolation Tester",
			email,
			createdAt: now,
			updatedAt: now,
		},
	});

	const company = await db.company.create({
		data: { organizationId: orgB, name: "Tenant B Corp" },
		select: { id: true },
	});
	companyB = company.id;

	const contact = await db.contact.create({
		data: { organizationId: orgB, firstName: "Bee", companyId: companyB },
		select: { id: true },
	});
	contactB = contact.id;

	const deal = await db.deal.create({
		data: {
			organizationId: orgB,
			name: "Tenant B's confidential deal",
			companyId: companyB,
			ownerId: userId,
		},
		select: { id: true },
	});
	dealB = deal.id;

	const thread = await db.emailThread.create({
		data: {
			organizationId: orgB,
			rootMessageId: `root-${suffix}`,
			subject: "Tenant B's private thread",
			firstMessageAt: now,
			lastMessageAt: now,
		},
		select: { id: true },
	});
	threadB = thread.id;

	const event = await db.calendarEvent.create({
		data: {
			organizationId: orgB,
			iCalUid: `ical-${suffix}`,
			originalStartTime: now,
			title: "Tenant B's private meeting",
			startsAt: now,
			endsAt: now,
			status: "confirmed",
		},
		select: { id: true },
	});
	eventB = event.id;
}, 120_000);

afterAll(async () => {
	await clean();
}, 120_000);

describe("one tenant cannot attach an activity to another tenant's records", () => {
	it("refuses a deal belonging to someone else", async () => {
		await expect(
			activities.create(orgA, { type: "NOTE", dealId: dealB }, userId),
		).rejects.toThrow(`No deal with id ${dealB}.`);
	});

	it("refuses a contact belonging to someone else", async () => {
		await expect(
			activities.create(orgA, { type: "NOTE", contactId: contactB }, userId),
		).rejects.toThrow(`No contact with id ${contactB}.`);
	});

	it("refuses a company belonging to someone else", async () => {
		await expect(
			activities.create(orgA, { type: "NOTE", companyId: companyB }, userId),
		).rejects.toThrow(`No company with id ${companyB}.`);
	});

	it("writes nothing into the other tenant's data", async () => {
		const activity = await db.activity.findFirst({
			where: { organizationId: orgA },
			select: { id: true },
		});

		expect(activity).toBeNull();

		const deal = await db.deal.findUnique({
			where: { id: dealB },
			select: { lastActivityAt: true },
		});

		expect(deal?.lastActivityAt).toBeNull();
	});
});

describe("email and calendar detail never crosses organizations", () => {
	it("refuses an email thread belonging to someone else", async () => {
		await expect(conversations.thread(orgA, threadB)).rejects.toThrow(
			`No email thread with id ${threadB}.`,
		);
	});

	it("refuses a calendar event belonging to someone else", async () => {
		await expect(conversations.event(orgA, eventB)).rejects.toThrow(
			`No calendar event with id ${eventB}.`,
		);
	});

	it("still returns them to the organization that owns them", async () => {
		const thread = await conversations.thread(orgB, threadB);
		const event = await conversations.event(orgB, eventB);

		expect(thread.subject).toBe("Tenant B's private thread");
		expect(event.title).toBe("Tenant B's private meeting");
	});
});

describe("stamping never reaches outside the organization", () => {
	it("leaves another tenant's timestamps alone", async () => {
		const at = new Date();

		await stamp.touch(
			orgA,
			{ companyId: companyB, contactId: contactB, dealId: dealB },
			at,
		);

		const [company, contact, deal] = await Promise.all([
			db.company.findUnique({
				where: { id: companyB },
				select: { lastActivityAt: true },
			}),
			db.contact.findUnique({
				where: { id: contactB },
				select: { lastActivityAt: true },
			}),
			db.deal.findUnique({
				where: { id: dealB },
				select: { lastActivityAt: true },
			}),
		]);

		expect(company?.lastActivityAt).toBeNull();
		expect(contact?.lastActivityAt).toBeNull();
		expect(deal?.lastActivityAt).toBeNull();
	});

	it("still stamps records the organization does own", async () => {
		const at = new Date();

		const own = await db.company.create({
			data: { organizationId: orgA, name: "Tenant A Corp" },
			select: { id: true },
		});

		await stamp.touch(orgA, { companyId: own.id }, at);

		const company = await db.company.findUnique({
			where: { id: own.id },
			select: { lastActivityAt: true },
		});

		expect(company?.lastActivityAt).toEqual(at);
	});
});
