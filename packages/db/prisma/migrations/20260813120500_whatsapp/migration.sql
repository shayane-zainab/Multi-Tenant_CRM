-- CreateEnum
CREATE TYPE "WhatsAppDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppSyncStatus" AS ENUM ('IDLE', 'NEEDS_RECONNECT', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'WHATSAPP';

-- AlterEnum
ALTER TYPE "RecordSource" ADD VALUE 'WHATSAPP';

-- CreateTable
CREATE TABLE "whatsAppConnection" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT,
    "displayPhone" TEXT,
    "verifiedName" TEXT,
    "accessToken" TEXT,
    "status" "WhatsAppSyncStatus" NOT NULL DEFAULT 'IDLE',
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "lastEventAt" TIMESTAMP(3),
    "lastError" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "whatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsAppThread" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "profileName" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "whatsAppThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsAppMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "direction" "WhatsAppDirection" NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "caption" TEXT,
    "mediaId" TEXT,
    "mediaMime" TEXT,
    "fromWaId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "status" "WhatsAppDeliveryStatus",
    "statusAt" TIMESTAMP(3),
    "failedCode" INTEGER,
    "failedTitle" TEXT,
    "sentByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressedPhone" (
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "suppressedPhone_pkey" PRIMARY KEY ("phone")
);

-- AlterTable
ALTER TABLE "activity" ADD COLUMN "whatsAppThreadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "whatsAppConnection_phoneNumberId_key" ON "whatsAppConnection"("phoneNumberId");
CREATE INDEX "whatsAppConnection_organizationId_idx" ON "whatsAppConnection"("organizationId");
CREATE INDEX "whatsAppConnection_ownerId_idx" ON "whatsAppConnection"("ownerId");
CREATE INDEX "whatsAppThread_companyId_lastMessageAt_idx" ON "whatsAppThread"("companyId", "lastMessageAt");
CREATE INDEX "whatsAppThread_contactId_lastMessageAt_idx" ON "whatsAppThread"("contactId", "lastMessageAt");
CREATE INDEX "whatsAppThread_organizationId_lastMessageAt_idx" ON "whatsAppThread"("organizationId", "lastMessageAt");
CREATE UNIQUE INDEX "whatsAppThread_connectionId_waId_key" ON "whatsAppThread"("connectionId", "waId");
CREATE INDEX "whatsAppMessage_threadId_sentAt_idx" ON "whatsAppMessage"("threadId", "sentAt");
CREATE INDEX "whatsAppMessage_waMessageId_idx" ON "whatsAppMessage"("waMessageId");
CREATE UNIQUE INDEX "whatsAppMessage_threadId_waMessageId_key" ON "whatsAppMessage"("threadId", "waMessageId");
CREATE INDEX "suppressedPhone_organizationId_idx" ON "suppressedPhone"("organizationId");
CREATE UNIQUE INDEX "activity_whatsAppThreadId_key" ON "activity"("whatsAppThreadId");

-- AddForeignKey
ALTER TABLE "whatsAppConnection" ADD CONSTRAINT "whatsAppConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsAppConnection" ADD CONSTRAINT "whatsAppConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsAppThread" ADD CONSTRAINT "whatsAppThread_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsAppThread" ADD CONSTRAINT "whatsAppThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsAppThread" ADD CONSTRAINT "whatsAppThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsAppThread" ADD CONSTRAINT "whatsAppThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsAppMessage" ADD CONSTRAINT "whatsAppMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "whatsAppThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsAppMessage" ADD CONSTRAINT "whatsAppMessage_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity" ADD CONSTRAINT "activity_whatsAppThreadId_fkey" FOREIGN KEY ("whatsAppThreadId") REFERENCES "whatsAppThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppressedPhone" ADD CONSTRAINT "suppressedPhone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
