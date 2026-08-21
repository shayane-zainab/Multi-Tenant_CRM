import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db } from "../src/index";

const file = process.argv[2];

if (!file) {
	console.error(
		"usage: bun scripts/dry-run-migration.ts <path-to-migration.sql>",
	);
	process.exit(1);
}

const sql = readFileSync(file, "utf8");

const statements = sql
	.split(/;\s*\n/)
	.map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
	.filter((statement) => statement.length > 0);

const LEGACY_STAGES = [
	["DEMO_BOOKED", "Demo booked"],
	["QUALIFIED_TO_BUY", "Qualified to buy"],
	["DECISION_MAKER_BOUGHT_IN", "Decision maker in"],
	["CONTRACT_SENT", "Contract sent"],
	["CLOSED_WON", "Closed won"],
	["CLOSED_LOST", "Closed lost"],
	["UNQUALIFIED_TO_BUY", "Unqualified"],
] as const;

class Rollback extends Error {}

const counts: Record<string, number> = {};
const wrong: string[] = [];

try {
	await db.$transaction(
		async (tx) => {
			const org = `dryrun-org-${randomUUID()}`;
			const user = `dryrun-user-${randomUUID()}`;
			const company = `dryrun-company-${randomUUID()}`;

			await tx.$executeRawUnsafe(
				`INSERT INTO "organization" ("id","name","slug","createdAt")
				 VALUES ($1,'Dry run','${`dryrun-${randomUUID()}`}',CURRENT_TIMESTAMP)`,
				org,
			);

			await tx.$executeRawUnsafe(
				`INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt")
				 VALUES ($1,'Dry run',$2,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
				user,
				`${user}@dryrun.test`,
			);

			await tx.$executeRawUnsafe(
				`INSERT INTO "company" ("id","name","organizationId","createdAt","updatedAt")
				 VALUES ($1,'Dry run co',$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
				company,
				org,
			);

			for (const [legacy] of LEGACY_STAGES) {
				await tx.$executeRawUnsafe(
					`INSERT INTO "deal"
					 ("id","name","companyId","ownerId","organizationId","stage","stageChangedAt","createdAt","updatedAt")
					 VALUES ($1,$2,$3,$4,$5,$6::"DealStage",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
					`dryrun-deal-${legacy}-${randomUUID()}`,
					`Deal in ${legacy}`,
					company,
					user,
					org,
					legacy,
				);
			}

			for (const statement of statements) {
				await tx.$executeRawUnsafe(statement);
			}

			const scalar = async (query: string): Promise<number> => {
				const [row] = await tx.$queryRawUnsafe<{ n: bigint }[]>(query);
				return Number(row?.n ?? 0);
			};

			counts.pipelines = await scalar(
				'SELECT COUNT(*)::bigint AS n FROM "pipeline"',
			);
			counts.stages = await scalar(
				'SELECT COUNT(*)::bigint AS n FROM "pipeline_stage"',
			);
			counts.deals = await scalar('SELECT COUNT(*)::bigint AS n FROM "deal"');
			counts.dealsMapped = await scalar(
				'SELECT COUNT(*)::bigint AS n FROM "deal" WHERE "stageId" IS NOT NULL',
			);
			counts.crossTenant = await scalar(
				`SELECT COUNT(*)::bigint AS n FROM "deal" d
				 JOIN "pipeline" p ON p."id" = d."pipelineId"
				 WHERE p."organizationId" <> d."organizationId"`,
			);

			const mappings = await tx.$queryRawUnsafe<
				{ legacy: string; stagename: string; kind: string }[]
			>(
				`SELECT d."stage"::text AS legacy, ps."name" AS stagename, ps."kind"::text AS kind
				 FROM "deal" d
				 JOIN "pipeline_stage" ps ON ps."id" = d."stageId"
				 WHERE d."organizationId" = $1`,
				org,
			);

			const expectedKind: Record<string, string> = {
				DEMO_BOOKED: "OPEN",
				QUALIFIED_TO_BUY: "OPEN",
				DECISION_MAKER_BOUGHT_IN: "OPEN",
				CONTRACT_SENT: "OPEN",
				CLOSED_WON: "WON",
				CLOSED_LOST: "LOST",
				UNQUALIFIED_TO_BUY: "LOST",
			};

			const byLegacy = new Map(
				LEGACY_STAGES.map(([legacy, name]) => [legacy, name]),
			);

			for (const row of mappings) {
				const expectedName = byLegacy.get(row.legacy as never);
				if (row.stagename !== expectedName) {
					wrong.push(
						`${row.legacy} -> "${row.stagename}", expected "${expectedName}"`,
					);
				}
				if (row.kind !== expectedKind[row.legacy]) {
					wrong.push(
						`${row.legacy} kind ${row.kind}, expected ${expectedKind[row.legacy]}`,
					);
				}
			}

			counts.seededMapped = mappings.length;

			throw new Rollback();
		},
		{ maxWait: 30_000, timeout: 180_000 },
	);
} catch (error) {
	if (!(error instanceof Rollback)) {
		console.error("\nDRY RUN FAILED — nothing was written.\n");
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

console.log(
	`\nDry run applied ${statements.length} statements, then rolled back.\n`,
);
console.log(`  pipelines created     ${counts.pipelines}`);
console.log(`  stages created        ${counts.stages}`);
console.log(`  deals total           ${counts.deals}`);
console.log(`  deals mapped          ${counts.dealsMapped}`);
console.log(
	`  seeded deals mapped   ${counts.seededMapped} of ${LEGACY_STAGES.length}`,
);
console.log(`  cross-tenant rows     ${counts.crossTenant}`);

const problems: string[] = [...wrong];

if (counts.deals !== counts.dealsMapped) {
	problems.push(`${counts.deals - counts.dealsMapped} deal(s) got no stage`);
}

if (counts.seededMapped !== LEGACY_STAGES.length) {
	problems.push(
		`only ${counts.seededMapped} of ${LEGACY_STAGES.length} seeded deals mapped`,
	);
}

if (counts.crossTenant !== 0) {
	problems.push(
		`${counts.crossTenant} deal(s) landed on another org's pipeline`,
	);
}

if (problems.length > 0) {
	console.error("\nPROBLEMS:");
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error("");
	process.exit(1);
}

console.log(
	"\nEvery legacy stage mapped to the right stage and kind. Nothing was written.\n",
);
