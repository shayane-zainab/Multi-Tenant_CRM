import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { db, StageKind } from "@crm/db";
import { PipelinesService } from "../src/pipelines/pipelines.service";

const suffix = process.env.TEST_RUN_ID ?? "pipelines-spec";
const orgA = `org-pipe-a-${suffix}`;
const orgB = `org-pipe-b-${suffix}`;
const admin = `user-pipe-admin-${suffix}`;
const plain = `user-pipe-member-${suffix}`;

setDefaultTimeout(120_000);

async function refuses(
	promise: Promise<unknown>,
	pattern: RegExp,
): Promise<void> {
	let message: string | null = null;

	try {
		await promise;
	} catch (error) {
		message = error instanceof Error ? error.message : String(error);
	}

	expect(message).not.toBeNull();
	expect(message ?? "").toMatch(pattern);
}

const pipelines = new PipelinesService(db);

const orgs = [orgA, orgB];
const users = [admin, plain];

async function clean() {
	await db.deal.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.company.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.pipeline.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.member.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.organization.deleteMany({ where: { id: { in: orgs } } });
	await db.user.deleteMany({ where: { id: { in: users } } });
}

beforeAll(async () => {
	await clean();
	const now = new Date();

	await db.organization.createMany({
		data: orgs.map((id, index) => ({
			id,
			name: `Pipe ${index}`,
			slug: `pipe-${index}-${suffix}`,
			createdAt: now,
		})),
	});

	await db.user.createMany({
		data: [
			{
				id: admin,
				name: "Admin",
				email: `${admin}@pipes.test`,
				createdAt: now,
				updatedAt: now,
			},
			{
				id: plain,
				name: "Member",
				email: `${plain}@pipes.test`,
				createdAt: now,
				updatedAt: now,
			},
		],
	});

	await db.member.createMany({
		data: [
			{
				id: randomUUID(),
				organizationId: orgA,
				userId: admin,
				role: "owner",
				createdAt: now,
			},
			{
				id: randomUUID(),
				organizationId: orgA,
				userId: plain,
				role: "member",
				createdAt: now,
			},
			{
				id: randomUUID(),
				organizationId: orgB,
				userId: admin,
				role: "owner",
				createdAt: now,
			},
		],
	});
}, 120_000);

afterAll(async () => {
	await clean();
}, 120_000);

describe("creating a pipeline", () => {
	it("comes with usable stages and at least one open one", async () => {
		const created = await pipelines.create(orgA, admin, {
			name: `Real estate ${suffix}`,
		});

		expect(created.stages.length).toBeGreaterThan(0);
		expect(created.stages.some((s) => s.kind === StageKind.OPEN)).toBe(true);
		expect(created.stages.map((s) => s.position)).toEqual(
			created.stages.map((_, index) => index),
		);
	});

	it("accepts stages the customer defines", async () => {
		const created = await pipelines.create(orgA, admin, {
			name: `Professional services ${suffix}`,
			stages: [
				{ name: "Enquiry", kind: StageKind.LEAD },
				{ name: "Scoping", kind: StageKind.OPEN },
				{ name: "Signed", kind: StageKind.WON },
			],
		});

		expect(created.stages.map((s) => s.name)).toEqual([
			"Enquiry",
			"Scoping",
			"Signed",
		]);
	});

	it("refuses a pipeline with no open stage", async () => {
		await refuses(
			pipelines.create(orgA, admin, {
				name: `No open ${suffix}`,
				stages: [{ name: "Only lead", kind: StageKind.LEAD }],
			}),
			/at least one open stage/i,
		);
	});

	it("refuses a duplicate name in the same workspace", async () => {
		await refuses(
			pipelines.create(orgA, admin, { name: `Real estate ${suffix}` }),
			/already has a pipeline/i,
		);
	});

	it("lets a different workspace reuse the same name", async () => {
		const created = await pipelines.create(orgB, admin, {
			name: `Real estate ${suffix}`,
		});

		expect(created.name).toBe(`Real estate ${suffix}`);
	});

	it("refuses somebody who is not an owner or admin", async () => {
		await refuses(
			pipelines.create(orgA, plain, { name: `Member made ${suffix}` }),
			/owner or an admin/i,
		);
	});
});

describe("stages keep the pipeline reportable", () => {
	it("refuses to remove the last open stage", async () => {
		const pipeline = await pipelines.create(orgA, admin, {
			name: `Single open ${suffix}`,
			stages: [
				{ name: "Start", kind: StageKind.LEAD },
				{ name: "Live", kind: StageKind.OPEN },
			],
		});

		const open = pipeline.stages.find((s) => s.kind === StageKind.OPEN);

		await refuses(
			pipelines.removeStage(orgA, admin, { stageId: open?.id ?? "" }),
			/at least one open stage/i,
		);
	});

	it("refuses to retype the last open stage away", async () => {
		const pipeline = await pipelines.create(orgA, admin, {
			name: `Retype ${suffix}`,
			stages: [
				{ name: "Start", kind: StageKind.LEAD },
				{ name: "Live", kind: StageKind.OPEN },
			],
		});

		const open = pipeline.stages.find((s) => s.kind === StageKind.OPEN);

		await refuses(
			pipelines.updateStage(orgA, admin, {
				stageId: open?.id ?? "",
				kind: StageKind.LOST,
			}),
			/at least one open stage/i,
		);
	});

	it("reorders only when every stage is listed once", async () => {
		const pipeline = await pipelines.create(orgA, admin, {
			name: `Reorder ${suffix}`,
		});

		const ids = pipeline.stages.map((s) => s.id);
		const reversed = [...ids].reverse();

		const after = await pipelines.reorderStages(orgA, admin, {
			pipelineId: pipeline.id,
			stageIds: reversed,
		});

		expect(after.stages.map((s) => s.id)).toEqual(reversed);

		await refuses(
			pipelines.reorderStages(orgA, admin, {
				pipelineId: pipeline.id,
				stageIds: ids.slice(1),
			}),
			/every stage/i,
		);
	});
});

describe("one workspace cannot reach another's pipelines", () => {
	it("refuses to rename a pipeline it does not own", async () => {
		const mine = await pipelines.create(orgB, admin, {
			name: `Owned by B ${suffix}`,
		});

		await refuses(
			pipelines.rename(orgA, admin, {
				pipelineId: mine.id,
				name: "Stolen",
			}),
			/no longer exists/i,
		);
	});

	it("refuses to add a stage to a pipeline it does not own", async () => {
		const mine = await pipelines.create(orgB, admin, {
			name: `Also owned by B ${suffix}`,
		});

		await refuses(
			pipelines.addStage(orgA, admin, {
				pipelineId: mine.id,
				name: "Sneaky",
				kind: StageKind.OPEN,
			}),
			/no longer exists/i,
		);
	});

	it("lists only its own pipelines", async () => {
		const listed = await pipelines.list(orgA);
		const names = listed.map((p) => p.name);

		expect(names).not.toContain(`Owned by B ${suffix}`);
		expect(names).toContain(`Real estate ${suffix}`);
	});
});
