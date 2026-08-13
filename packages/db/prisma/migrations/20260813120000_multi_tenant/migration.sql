-- The multi-tenant columns were written into schema.prisma without a migration.
-- This is that migration, written to survive a database that already has rows:
-- every organizationId is added nullable, backfilled onto the oldest
-- organization, and only then made NOT NULL.

-- Every existing row belongs to whichever organization was there first. On an
-- install that has none yet, one is created so the backfill has a target.
INSERT INTO "organization" ("id", "name", "slug", "createdAt")
SELECT 'org-default', 'CRM', 'workspace', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "organization");

-- CreateTable
CREATE TABLE "orgSetting" (
    "organizationId" TEXT NOT NULL,
    "agentModelId" TEXT,
    "agentModelContextWindow" INTEGER,
    "contextDevApiKey" TEXT,
    "reportingCurrency" TEXT,
    "ratesRefreshedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orgSetting_pkey" PRIMARY KEY ("organizationId")
);

-- appSetting was one row for the whole install. Its contents — the agent model,
-- the Context key, the reporting currency — move onto the first organization
-- rather than being dropped with the table.
INSERT INTO "orgSetting" (
    "organizationId",
    "agentModelId",
    "agentModelContextWindow",
    "contextDevApiKey",
    "reportingCurrency",
    "ratesRefreshedAt",
    "updatedAt"
)
SELECT
    (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1),
    "agentModelId",
    "agentModelContextWindow",
    "contextDevApiKey",
    "reportingCurrency",
    "ratesRefreshedAt",
    "updatedAt"
FROM "appSetting"
ORDER BY "updatedAt" DESC
LIMIT 1
ON CONFLICT ("organizationId") DO NOTHING;

-- DropTable
DROP TABLE "appSetting";

-- AlterTable
ALTER TABLE "activity" ADD COLUMN "organizationId" TEXT;
UPDATE "activity" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "activity" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "agentConversation" ADD COLUMN "organizationId" TEXT;
UPDATE "agentConversation" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "agentConversation" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "agentTask" ADD COLUMN "organizationId" TEXT;
UPDATE "agentTask" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "agentTask" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "calendarEvent" ADD COLUMN "organizationId" TEXT;
UPDATE "calendarEvent" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "calendarEvent" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "company" ADD COLUMN "organizationId" TEXT;
UPDATE "company" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "company" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "contact" ADD COLUMN "organizationId" TEXT;
UPDATE "contact" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "contact" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "deal" ADD COLUMN "organizationId" TEXT;
UPDATE "deal" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "deal" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "emailThread" ADD COLUMN "organizationId" TEXT;
UPDATE "emailThread" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "emailThread" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "mailboxSync" ADD COLUMN "organizationId" TEXT;
UPDATE "mailboxSync" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "mailboxSync" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "suppressedContact" ADD COLUMN "organizationId" TEXT;
UPDATE "suppressedContact" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "suppressedContact" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "suppressedDomain" ADD COLUMN "organizationId" TEXT;
UPDATE "suppressedDomain" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "suppressedDomain" ALTER COLUMN "organizationId" SET NOT NULL;

-- workspaceProfile becomes one row per organization, keyed on it. Any extra
-- rows from the single-tenant era are collapsed to the most recently refreshed
-- one, because the new primary key cannot hold two.
ALTER TABLE "workspaceProfile" ADD COLUMN "organizationId" TEXT;
UPDATE "workspaceProfile" SET "organizationId" = (SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;

DELETE FROM "workspaceProfile" a
USING "workspaceProfile" b
WHERE a."organizationId" = b."organizationId"
  AND a."refreshedAt" < b."refreshedAt";

DELETE FROM "workspaceProfile" a
USING "workspaceProfile" b
WHERE a."organizationId" = b."organizationId"
  AND a."refreshedAt" = b."refreshedAt"
  AND a."id" > b."id";

ALTER TABLE "workspaceProfile" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "workspaceProfile" DROP CONSTRAINT "workspaceProfile_pkey";
ALTER TABLE "workspaceProfile" DROP COLUMN "id";
ALTER TABLE "workspaceProfile" ADD CONSTRAINT "workspaceProfile_pkey" PRIMARY KEY ("organizationId");

-- Uniqueness is now per organization, not per install.
DROP INDEX "calendarEvent_iCalUid_originalStartTime_key";
DROP INDEX "company_domain_key";
DROP INDEX "contact_email_key";
DROP INDEX "emailMessage_rfcMessageId_key";
DROP INDEX "emailThread_rootMessageId_key";

-- CreateIndex
CREATE INDEX "activity_organizationId_idx" ON "activity"("organizationId");
CREATE INDEX "agentConversation_organizationId_idx" ON "agentConversation"("organizationId");
CREATE INDEX "agentTask_organizationId_idx" ON "agentTask"("organizationId");
CREATE INDEX "calendarEvent_organizationId_idx" ON "calendarEvent"("organizationId");
CREATE UNIQUE INDEX "calendarEvent_organizationId_iCalUid_originalStartTime_key" ON "calendarEvent"("organizationId", "iCalUid", "originalStartTime");
CREATE INDEX "company_organizationId_idx" ON "company"("organizationId");
CREATE UNIQUE INDEX "company_organizationId_domain_key" ON "company"("organizationId", "domain");
CREATE INDEX "contact_organizationId_idx" ON "contact"("organizationId");
CREATE UNIQUE INDEX "contact_organizationId_email_key" ON "contact"("organizationId", "email");
CREATE INDEX "deal_organizationId_idx" ON "deal"("organizationId");
CREATE UNIQUE INDEX "emailMessage_threadId_rfcMessageId_key" ON "emailMessage"("threadId", "rfcMessageId");
CREATE INDEX "emailThread_organizationId_idx" ON "emailThread"("organizationId");
CREATE UNIQUE INDEX "emailThread_organizationId_rootMessageId_key" ON "emailThread"("organizationId", "rootMessageId");
CREATE INDEX "mailboxSync_organizationId_idx" ON "mailboxSync"("organizationId");
CREATE INDEX "suppressedContact_organizationId_idx" ON "suppressedContact"("organizationId");
CREATE INDEX "suppressedDomain_organizationId_idx" ON "suppressedDomain"("organizationId");

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact" ADD CONSTRAINT "contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity" ADD CONSTRAINT "activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mailboxSync" ADD CONSTRAINT "mailboxSync_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emailThread" ADD CONSTRAINT "emailThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendarEvent" ADD CONSTRAINT "calendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppressedDomain" ADD CONSTRAINT "suppressedDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppressedContact" ADD CONSTRAINT "suppressedContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orgSetting" ADD CONSTRAINT "orgSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspaceProfile" ADD CONSTRAINT "workspaceProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
