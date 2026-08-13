-- DropIndex
DROP INDEX "calendarEvent_iCalUid_originalStartTime_key";

-- DropIndex
DROP INDEX "company_domain_key";

-- DropIndex
DROP INDEX "contact_email_key";

-- DropIndex
DROP INDEX "emailMessage_rfcMessageId_key";

-- DropIndex
DROP INDEX "emailThread_rootMessageId_key";

-- AlterTable
ALTER TABLE "activity" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "agentConversation" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "agentTask" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "calendarEvent" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "emailThread" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "mailboxSync" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "suppressedContact" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "suppressedDomain" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "workspaceProfile" DROP CONSTRAINT "workspaceProfile_pkey",
DROP COLUMN "id",
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD CONSTRAINT "workspaceProfile_pkey" PRIMARY KEY ("organizationId");

-- DropTable
DROP TABLE "appSetting";

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

-- CreateIndex
CREATE INDEX "activity_organizationId_idx" ON "activity"("organizationId");

-- CreateIndex
CREATE INDEX "agentConversation_organizationId_idx" ON "agentConversation"("organizationId");

-- CreateIndex
CREATE INDEX "agentTask_organizationId_idx" ON "agentTask"("organizationId");

-- CreateIndex
CREATE INDEX "calendarEvent_organizationId_idx" ON "calendarEvent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "calendarEvent_organizationId_iCalUid_originalStartTime_key" ON "calendarEvent"("organizationId", "iCalUid", "originalStartTime");

-- CreateIndex
CREATE INDEX "company_organizationId_idx" ON "company"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "company_organizationId_domain_key" ON "company"("organizationId", "domain");

-- CreateIndex
CREATE INDEX "contact_organizationId_idx" ON "contact"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_organizationId_email_key" ON "contact"("organizationId", "email");

-- CreateIndex
CREATE INDEX "deal_organizationId_idx" ON "deal"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "emailMessage_threadId_rfcMessageId_key" ON "emailMessage"("threadId", "rfcMessageId");

-- CreateIndex
CREATE INDEX "emailThread_organizationId_idx" ON "emailThread"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "emailThread_organizationId_rootMessageId_key" ON "emailThread"("organizationId", "rootMessageId");

-- CreateIndex
CREATE INDEX "mailboxSync_organizationId_idx" ON "mailboxSync"("organizationId");

-- CreateIndex
CREATE INDEX "suppressedContact_organizationId_idx" ON "suppressedContact"("organizationId");

-- CreateIndex
CREATE INDEX "suppressedDomain_organizationId_idx" ON "suppressedDomain"("organizationId");

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailboxSync" ADD CONSTRAINT "mailboxSync_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailThread" ADD CONSTRAINT "emailThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarEvent" ADD CONSTRAINT "calendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressedDomain" ADD CONSTRAINT "suppressedDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressedContact" ADD CONSTRAINT "suppressedContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orgSetting" ADD CONSTRAINT "orgSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaceProfile" ADD CONSTRAINT "workspaceProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

