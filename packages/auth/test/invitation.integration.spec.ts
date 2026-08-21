import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import { ensureOrganizationMembership } from "../src/organization";

const suffix = process.env.TEST_RUN_ID ?? "invitation-spec";
const inviterOrg = `org-inviter-${suffix}`;
const inviterId = `user-inviter-${suffix}`;
const joinerId = `user-joiner-${suffix}`;
const joinerEmail = `joiner@invite-${suffix}.test`;

async function clean() {
	await db.invitation.deleteMany({ where: { organizationId: inviterOrg } });
	await db.member.deleteMany({
		where: { userId: { in: [inviterId, joinerId] } },
	});
	const strays = await db.member.findMany({
		where: { organizationId: { startsWith: "org-" } },
		select: { organizationId: true },
	});
	await db.organization.deleteMany({
		where: { id: { in: [inviterOrg, ...strays.map((s) => s.organizationId)] } },
	});
	await db.user.deleteMany({ where: { id: { in: [inviterId, joinerId] } } });
}

async function seed() {
	const now = new Date();

	await db.organization.create({
		data: {
			id: inviterOrg,
			name: "Inviting Workspace",
			slug: `inviting-${suffix}`,
			createdAt: now,
		},
	});

	await db.user.createMany({
		data: [
			{
				id: inviterId,
				name: "Inviter",
				email: `inviter@invite-${suffix}.test`,
				createdAt: now,
				updatedAt: now,
			},
			{
				id: joinerId,
				name: "Joiner",
				email: joinerEmail,
				createdAt: now,
				updatedAt: now,
			},
		],
	});

	await db.member.create({
		data: {
			id: randomUUID(),
			organizationId: inviterOrg,
			userId: inviterId,
			role: "owner",
			createdAt: now,
		},
	});
}

async function invite(email: string, expiresAt: Date, role = "member") {
	return db.invitation.create({
		data: {
			id: randomUUID(),
			organizationId: inviterOrg,
			email,
			role,
			status: "pending",
			inviterId,
			expiresAt,
		},
		select: { id: true },
	});
}

beforeEach(async () => {
	await clean();
	await seed();
}, 120_000);

afterAll(async () => {
	await clean();
}, 120_000);

describe("an invited person joins the workspace that invited them", () => {
	it("joins instead of being given a new workspace", async () => {
		await invite(joinerEmail, new Date(Date.now() + 60_000));

		const organizationId = await ensureOrganizationMembership(joinerId);

		expect(organizationId).toBe(inviterOrg);

		const memberships = await db.member.findMany({
			where: { userId: joinerId },
			select: { organizationId: true, role: true },
		});

		expect(memberships).toHaveLength(1);
		expect(memberships[0]?.organizationId).toBe(inviterOrg);
		expect(memberships[0]?.role).toBe("member");
	});

	it("matches the address regardless of case", async () => {
		await invite(joinerEmail.toUpperCase(), new Date(Date.now() + 60_000));

		expect(await ensureOrganizationMembership(joinerId)).toBe(inviterOrg);
	});

	it("honours the role the invitation was sent with", async () => {
		await invite(joinerEmail, new Date(Date.now() + 60_000), "admin");

		await ensureOrganizationMembership(joinerId);

		const member = await db.member.findFirst({
			where: { userId: joinerId },
			select: { role: true },
		});

		expect(member?.role).toBe("admin");
	});

	it("marks the invitation accepted so it cannot be reused", async () => {
		const created = await invite(joinerEmail, new Date(Date.now() + 60_000));

		await ensureOrganizationMembership(joinerId);

		const row = await db.invitation.findUnique({
			where: { id: created.id },
			select: { status: true },
		});

		expect(row?.status).toBe("accepted");
	});
});

describe("an invitation that should not be honoured", () => {
	it("ignores an expired invitation and creates their own workspace", async () => {
		await invite(joinerEmail, new Date(Date.now() - 60_000));

		const organizationId = await ensureOrganizationMembership(joinerId);

		expect(organizationId).toBeDefined();
		expect(organizationId).not.toBe(inviterOrg);
	});

	it("ignores an invitation addressed to somebody else", async () => {
		await invite(
			`someone.else@invite-${suffix}.test`,
			new Date(Date.now() + 60_000),
		);

		const organizationId = await ensureOrganizationMembership(joinerId);

		expect(organizationId).not.toBe(inviterOrg);
	});

	it("leaves an existing member where they already are", async () => {
		await ensureOrganizationMembership(joinerId);
		const first = await ensureOrganizationMembership(joinerId);

		await invite(joinerEmail, new Date(Date.now() + 60_000));

		expect(await ensureOrganizationMembership(joinerId)).toBe(first);
	});
});
