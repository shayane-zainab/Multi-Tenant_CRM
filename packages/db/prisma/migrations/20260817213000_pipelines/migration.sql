-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('LEAD', 'OPEN', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "pipeline" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StageKind" NOT NULL DEFAULT 'OPEN',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_organizationId_idx" ON "pipeline"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_organizationId_name_key" ON "pipeline"("organizationId", "name");

-- CreateIndex
CREATE INDEX "pipeline_stage_pipelineId_idx" ON "pipeline_stage"("pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stage_pipelineId_name_key" ON "pipeline_stage"("pipelineId", "name");

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "deal" ADD COLUMN "pipelineId" TEXT;
ALTER TABLE "deal" ADD COLUMN "stageId" TEXT;

-- CreateIndex
CREATE INDEX "deal_pipelineId_idx" ON "deal"("pipelineId");

-- CreateIndex
CREATE INDEX "deal_stageId_idx" ON "deal"("stageId");

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one default pipeline per organization
INSERT INTO "pipeline" ("id", "organizationId", "name", "position", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", 'Default', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organization" o
ON CONFLICT ("organizationId", "name") DO NOTHING;

-- Backfill: the seven stages this CRM shipped with, in their existing order
INSERT INTO "pipeline_stage" ("id", "pipelineId", "name", "kind", "position", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", s."name", s."kind"::"StageKind", s."position", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "pipeline" p
CROSS JOIN (
    VALUES
        ('Demo booked', 'OPEN', 0),
        ('Qualified to buy', 'OPEN', 1),
        ('Decision maker in', 'OPEN', 2),
        ('Contract sent', 'OPEN', 3),
        ('Closed won', 'WON', 4),
        ('Closed lost', 'LOST', 5),
        ('Unqualified', 'LOST', 6)
) AS s("name", "kind", "position")
WHERE p."isDefault" = true
ON CONFLICT ("pipelineId", "name") DO NOTHING;

-- Backfill: point every existing deal at the stage it already had
UPDATE "deal" d
SET "pipelineId" = p."id", "stageId" = ps."id"
FROM "pipeline" p
JOIN "pipeline_stage" ps ON ps."pipelineId" = p."id"
JOIN (
    VALUES
        ('DEMO_BOOKED', 'Demo booked'),
        ('QUALIFIED_TO_BUY', 'Qualified to buy'),
        ('DECISION_MAKER_BOUGHT_IN', 'Decision maker in'),
        ('CONTRACT_SENT', 'Contract sent'),
        ('CLOSED_WON', 'Closed won'),
        ('CLOSED_LOST', 'Closed lost'),
        ('UNQUALIFIED_TO_BUY', 'Unqualified')
) AS m("legacy", "stageName") ON m."stageName" = ps."name"
WHERE p."organizationId" = d."organizationId"
  AND p."isDefault" = true
  AND m."legacy" = d."stage"::text
  AND d."stageId" IS NULL;
