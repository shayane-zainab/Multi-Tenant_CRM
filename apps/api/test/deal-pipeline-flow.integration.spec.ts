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
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { PipelinesService } from "../src/pipelines/pipelines.service";

setDefaultTimeout(180_000);

const suffix = process.env.TEST_RUN_ID ?? "dealflow-spec";
const orgA = `org-df-a-${suffix}`;
const orgB = `org-df-b-${suffix}`;
const admin = `user-df-${suffix}`;
const orgs = [orgA, orgB];

const pipelines = new PipelinesService(db);
const conversion = new ConversionService(db);
const deals = new DealsService(db, new ActivityStampService(db), conversion);

let companyA = "";
let companyB = "";
let realEstate: Awaited<ReturnType<typeof pipelines.create>>;
let services: Awaited<ReturnType<typeof pipelines.create>>;

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

async function clean() {
	await db.activity.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.deal.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.company.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.pipeline.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.member.deleteMany({ where: { organizationId: { in: orgs } } });
	await db.organization.deleteMany({ where: { id: { in: orgs } } });
	await db.user.deleteMany({ where: { id: admin } });
}

function stageOf(pipeline: typeof realEstate, name: string) {
	const stage = pipeline.stages.find((row) => row.name === name);
	if (!stage) throw new Error(`no stage called ${name}`);
	return stage;
}

beforeAll(async () => {
	await clean();
	const now = new Date();

	await db.organization.createMany({
		data: orgs.map((id, index) => ({
			id,
			name: `Deal flow ${index}`,
			slug: `df-${index}-${suffix}`,
			createdAt: now,
		})),
	});

	await db.user.create({
		data: {
			id: admin,
			name: "Admin",
			email: `${admin}@dealflow.test`,
			createdAt: now,
			updatedAt: now,
		},
	});

	await db.member.createMany({
		data: orgs.map((id) => ({
			id: randomUUID(),
			organizationId: id,
			userId: admin,
			role: "owner",
			createdAt: now,
		})),
	});

	const a = await db.company.create({
		data: { name: `Buyer ${suffix}`, organizationId: orgA },
		select: { id: true },
	});
	companyA = a.id;

	const b = await db.company.create({
		data: { name: `Other buyer ${suffix}`, organizationId: orgB },
		select: { id: true },
	});
	companyB = b.id;

	realEstate = await pipelines.create(orgA, admin, {
		name: `Real estate ${suffix}`,
		stages: [
			{ name: "Enquiry", kind: StageKind.LEAD },
			{ name: "Viewing", kind: StageKind.OPEN },
			{ name: "Offer", kind: StageKind.OPEN },
			{ name: "Completed", kind: StageKind.WON },
			{ name: "Fell through", kind: StageKind.LOST },
		],
	});

	services = await pipelines.create(orgA, admin, {
		name: `Services ${suffix}`,
		stages: [
			{ name: "Scoping", kind: StageKind.OPEN },
			{ name: "Signed", kind: StageKind.WON },
		],
	});
});

afterAll(async () => {
	await clean();
});

describe("a deal lives in a pipeline stage", () => {
	it("lands in the stage it was created in", async () => {
		const viewing = stageOf(realEstate, "Viewing");

		const created = await deals.create(orgA, {
			name: `Flat ${suffix}`,
			companyId: companyA,
			ownerId: admin,
			amountCents: 100_000,
			stageId: viewing.id,
		});

		const row = await db.deal.findUnique({
			where: { id: created.id },
			select: { stageId: true, pipelineId: true },
		});

		expect(row?.stageId).toBe(viewing.id);
		expect(row?.pipelineId).toBe(realEstate.id);
	});

	it("takes the default pipeline when no stage is named", async () => {
		const created = await deals.create(orgA, {
			name: `Defaulted ${suffix}`,
			companyId: companyA,
			ownerId: admin,
			amountCents: 100,
		});

		const row = await db.deal.findUnique({
			where: { id: created.id },
			select: { stageId: true, pipelineId: true },
		});

		expect(row?.stageId).not.toBeNull();
		expect(row?.pipelineId).not.toBeNull();
	});

	it("moves to another pipeline, carrying the deal with it", async () => {
		const created = await deals.create(orgA, {
			name: `Mover ${suffix}`,
			companyId: companyA,
			ownerId: admin,
			amountCents: 5_000,
			stageId: stageOf(realEstate, "Enquiry").id,
		});

		const scoping = stageOf(services, "Scoping");
		await deals.setStage(orgA, { id: created.id, stageId: scoping.id }, admin);

		const row = await db.deal.findUnique({
			where: { id: created.id },
			select: { stageId: true, pipelineId: true },
		});

		expect(row?.stageId).toBe(scoping.id);
		expect(row?.pipelineId).toBe(services.id);
	});

	it("refuses a stage belonging to another workspace", async () => {
		const foreign = await pipelines.create(orgB, admin, {
			name: `Theirs ${suffix}`,
		});

		await refuses(
			deals.create(orgA, {
				name: `Bad ${suffix}`,
				companyId: companyA,
				ownerId: admin,
				amountCents: 1,
				stageId: foreign.stages[0]?.id,
			}),
			/not in this workspace/i,
		);
	});

	it("demands a reason before a deal is marked lost", async () => {
		const created = await deals.create(orgA, {
			name: `Loser ${suffix}`,
			companyId: companyA,
			ownerId: admin,
			amountCents: 1_000,
			stageId: stageOf(realEstate, "Viewing").id,
		});

		await refuses(
			deals.setStage(
				orgA,
				{ id: created.id, stageId: stageOf(realEstate, "Fell through").id },
				admin,
			),
			/why it was lost/i,
		);
	});
});

describe("prospecting stages stay out of the numbers", () => {
	it("leaves lead deals out of the open count", async () => {
		await deals.create(orgA, {
			name: `Cold ${suffix}`,
			companyId: companyA,
			ownerId: admin,
			amountCents: 999_999,
			stageId: stageOf(realEstate, "Enquiry").id,
		});

		const leads = await db.deal.count({
			where: { organizationId: orgA, pipelineStage: { kind: StageKind.LEAD } },
		});

		const open = await db.deal.count({
			where: { organizationId: orgA, pipelineStage: { kind: StageKind.OPEN } },
		});

		const all = await db.deal.count({ where: { organizationId: orgA } });

		expect(leads).toBeGreaterThan(0);
		expect(open + leads).toBeLessThanOrEqual(all);
		expect(open).toBeLessThan(all);
	});
});

describe("moving many deals at once", () => {
	it("moves them and records a stage change for each", async () => {
		const enquiry = stageOf(realEstate, "Enquiry");
		const made = [];

		for (let index = 0; index < 3; index += 1) {
			made.push(
				await deals.create(orgA, {
					name: `Bulk ${index} ${suffix}`,
					companyId: companyA,
					ownerId: admin,
					amountCents: 100,
					stageId: enquiry.id,
				}),
			);
		}

		const ids = made.map((deal) => deal.id);
		const viewing = stageOf(realEstate, "Viewing");

		const result = await deals.moveMany(
			orgA,
			{ dealIds: ids, stageId: viewing.id },
			admin,
		);

		expect(result.moved).toBe(3);

		const moved = await db.deal.count({
			where: { id: { in: ids }, stageId: viewing.id },
		});

		expect(moved).toBe(3);

		const recorded = await db.activity.count({
			where: {
				organizationId: orgA,
				dealId: { in: ids },
				type: "STAGE_CHANGE",
			},
		});

		expect(recorded).toBe(3);
	});

	it("will not touch deals from another workspace", async () => {
		const theirs = await deals.create(orgB, {
			name: `Not yours ${suffix}`,
			companyId: companyB,
			ownerId: admin,
			amountCents: 1,
		});

		await refuses(
			deals.moveMany(
				orgA,
				{
					dealIds: [theirs.id],
					stageId: stageOf(realEstate, "Viewing").id,
				},
				admin,
			),
			/none of those deals/i,
		);
	});
});

describe("a workspace with no pipeline heals itself", () => {
	it("creates a default pipeline rather than refusing the deal", async () => {
		await db.deal.deleteMany({ where: { organizationId: orgB } });
		await db.pipeline.deleteMany({ where: { organizationId: orgB } });

		const created = await deals.create(orgB, {
			name: `Healed ${suffix}`,
			companyId: companyB,
			ownerId: admin,
			amountCents: 1,
		});

		const row = await db.deal.findUnique({
			where: { id: created.id },
			select: { stageId: true, pipelineId: true },
		});

		expect(row?.stageId).not.toBeNull();
		expect(row?.pipelineId).not.toBeNull();
	});
});
