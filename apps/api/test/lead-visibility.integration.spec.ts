import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { LeadVisibilityService } from "../src/crm/lead-visibility.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";

setDefaultTimeout(180_000);

const suffix = process.env.TEST_RUN_ID ?? "visibility-spec";
const org = `org-vis-${suffix}`;
const owner = `user-vis-owner-${suffix}`;
const repA = `user-vis-a-${suffix}`;
const repB = `user-vis-b-${suffix}`;
const users = [owner, repA, repB];

const visibility = new LeadVisibilityService(db);
const deals = new DealsService(
	db,
	new ActivityStampService(db),
	new ConversionService(db),
	visibility,
);

let companyId = "";

const listInput = {
	q: "",
	page: 1,
	pageSize: 50,
	sort: "createdAt",
	dir: "desc" as const,
	status: "all",
	owner: "all",
	stage: "all",
	pipeline: "all",
	closing: "all",
};

async function clean() {
	await db.activity.deleteMany({ where: { organizationId: org } });
	await db.deal.deleteMany({ where: { organizationId: org } });
	await db.company.deleteMany({ where: { organizationId: org } });
	await db.pipeline.deleteMany({ where: { organizationId: org } });
	await db.orgSetting.deleteMany({ where: { organizationId: org } });
	await db.member.deleteMany({ where: { organizationId: org } });
	await db.organization.deleteMany({ where: { id: org } });
	await db.user.deleteMany({ where: { id: { in: users } } });
}

beforeAll(async () => {
	await clean();
	const now = new Date();

	await db.organization.create({
		data: {
			id: org,
			name: "Visibility",
			slug: `vis-${suffix}`,
			createdAt: now,
		},
	});

	await db.user.createMany({
		data: users.map((id) => ({
			id,
			name: id,
			email: `${id}@vis.test`,
			createdAt: now,
			updatedAt: now,
		})),
	});

	await db.member.createMany({
		data: [
			{
				id: randomUUID(),
				organizationId: org,
				userId: owner,
				role: "owner",
				createdAt: now,
			},
			{
				id: randomUUID(),
				organizationId: org,
				userId: repA,
				role: "member",
				createdAt: now,
			},
			{
				id: randomUUID(),
				organizationId: org,
				userId: repB,
				role: "member",
				createdAt: now,
			},
		],
	});

	const company = await db.company.create({
		data: { name: `Shared co ${suffix}`, organizationId: org },
		select: { id: true },
	});
	companyId = company.id;

	for (const [rep, label] of [
		[repA, "A"],
		[repB, "B"],
	] as const) {
		await deals.create(org, {
			name: `Lead of ${label} ${suffix}`,
			companyId,
			ownerId: rep,
			amountCents: 1_000,
		});
	}
});

afterAll(async () => {
	await clean();
});

describe("when leads are shared", () => {
	it("defaults to everyone seeing everything", async () => {
		expect(await visibility.setting(org)).toBe("everyone");

		const seen = await deals.list(org, listInput, repA);
		expect(seen.total).toBe(2);
	});
});

describe("when leads are private", () => {
	it("shows a rep only their own", async () => {
		await visibility.set(org, "own");

		const seenByA = await deals.list(org, listInput, repA);
		const seenByB = await deals.list(org, listInput, repB);

		expect(seenByA.total).toBe(1);
		expect(seenByB.total).toBe(1);
		expect(seenByA.rows[0]?.name).toContain("Lead of A");
		expect(seenByB.rows[0]?.name).toContain("Lead of B");
	});

	it("still shows an owner everything", async () => {
		const seen = await deals.list(org, listInput, owner);
		expect(seen.total).toBe(2);
	});

	it("refuses to open another rep's lead by id", async () => {
		const theirs = await db.deal.findFirst({
			where: { organizationId: org, ownerId: repB },
			select: { id: true },
		});

		let message = "";
		try {
			await deals.byId(org, theirs?.id ?? "", repA);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message).toMatch(/no deal with id/i);
	});

	it("lets a rep open their own lead by id", async () => {
		const mine = await db.deal.findFirst({
			where: { organizationId: org, ownerId: repA },
			select: { id: true },
		});

		const found = await deals.byId(org, mine?.id ?? "", repA);
		expect(found.name).toContain("Lead of A");
	});

	it("counts only a rep's own leads in the facets", async () => {
		const seen = await deals.list(org, listInput, repA);
		const ownerCounts = seen.facetCounts.owner ?? {};

		expect(ownerCounts[repB] ?? 0).toBe(0);
		expect(ownerCounts[repA] ?? 0).toBe(1);
	});

	it("exports only a rep's own leads", async () => {
		const exported = await deals.exportRows(org, listInput, repA);
		expect(exported.rows).toHaveLength(1);
		expect(exported.rows[0]?.name).toContain("Lead of A");
	});

	it("refuses a plain member changing the setting", async () => {
		let message = "";
		try {
			await visibility.requireManager(org, repA);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message).toMatch(/owner or an admin/i);
	});

	it("goes back to shared when switched off", async () => {
		await visibility.set(org, "everyone");
		const seen = await deals.list(org, listInput, repA);
		expect(seen.total).toBe(2);
	});
});
