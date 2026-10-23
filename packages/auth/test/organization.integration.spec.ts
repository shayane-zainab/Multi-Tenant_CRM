import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ensureOrganizationMembership } from "../src/organization";

const suffix = process.env.TEST_RUN_ID ?? "organization-spec";

const emailOf = (label: string) => `${label}.${suffix}@example.test`;

const userIds: string[] = [];

const seedUser = async (label: string): Promise<string> => {
	const id = `${suffix}-${label}`;

	await db.user.create({
		data: {
			id,
			name: label,
			email: emailOf(label),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});

	userIds.push(id);
	return id;
};

const membershipsOf = (userId: string) =>
	db.member.findMany({
		where: { userId },
		select: { organizationId: true, role: true },
	});

const clear = async () => {
	const members = await db.member.findMany({
		where: { userId: { in: userIds } },
		select: { organizationId: true },
	});

	await db.member.deleteMany({ where: { userId: { in: userIds } } });
	await db.organization.deleteMany({
		where: { id: { in: members.map((member) => member.organizationId) } },
	});
	await db.user.deleteMany({
		where: { email: { endsWith: `.${suffix}@example.test` } },
	});

	userIds.length = 0;
};

beforeEach(clear);
afterEach(clear);

describe("ensureOrganizationMembership", () => {
	it("gives a new user their own workspace, owned by them", async () => {
		const userId = await seedUser("first");

		const organizationId = await ensureOrganizationMembership(userId);

		expect(organizationId).toBeString();

		const memberships = await membershipsOf(userId);
		expect(memberships).toHaveLength(1);
		expect(memberships[0]?.organizationId).toBe(organizationId as string);
		expect(memberships[0]?.role).toBe("owner");
	});

	it("is idempotent, so signing in again neither duplicates nor re-roles", async () => {
		const userId = await seedUser("repeat");

		const first = await ensureOrganizationMembership(userId);

		await db.member.updateMany({
			where: { userId },
			data: { role: "admin" },
		});

		expect(await ensureOrganizationMembership(userId)).toBe(first as string);
		expect(await ensureOrganizationMembership(userId)).toBe(first as string);

		const memberships = await membershipsOf(userId);
		expect(memberships).toHaveLength(1);
		expect(memberships[0]?.role).toBe("admin");
	});

	it("keeps two sign-ups in separate workspaces", async () => {
		const one = await seedUser("one");
		const two = await seedUser("two");

		const first = await ensureOrganizationMembership(one);
		const second = await ensureOrganizationMembership(two);

		expect(first).toBeString();
		expect(second).toBeString();
		expect(second).not.toBe(first as string);
	});

	it("does not collide when the default slug is already taken", async () => {
		const one = await seedUser("slug-one");
		const two = await seedUser("slug-two");

		const first = await ensureOrganizationMembership(one);
		const second = await ensureOrganizationMembership(two);

		const organizations = await db.organization.findMany({
			where: { id: { in: [first as string, second as string] } },
			select: { slug: true },
		});

		expect(organizations).toHaveLength(2);
		expect(organizations[0]?.slug).not.toBe(organizations[1]?.slug);
	});
});
