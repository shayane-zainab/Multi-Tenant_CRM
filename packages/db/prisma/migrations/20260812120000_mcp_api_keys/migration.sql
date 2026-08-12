-- API keys, so a machine can hold a credential the way a person holds a
-- session. The one caller today is the MCP server (`apps/api/src/mcp`), which
-- is how Claude and any other MCP client reach the CRM.
--
-- Written by Better Auth's api-key plugin, configured with
-- `references: "organization"` — so "referenceId" is an organization id, not a
-- user id, and the tenancy boundary is the same one every service already
-- filters on. A key is the workspace's, not a rep's: it outlives whoever
-- pressed the button, and any owner can revoke it. The human who created it is
-- kept in "metadata" for authorship on the rows the agent writes.
--
-- No foreign key to "organization", because the plugin owns this table through
-- its own adapter and never joins. Organizations cannot be deleted
-- (`disableOrganizationDeletion`), so nothing is orphaned by the omission.
--
-- "key" is a SHA-256 hash, never the key itself — the plaintext is returned
-- once, at creation, and is unrecoverable afterwards. "start" holds the first
-- few characters so the UI can tell two keys apart.
CREATE TABLE "apikey" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "start" TEXT,
    "referenceId" TEXT NOT NULL,
    "prefix" TEXT,
    "key" TEXT NOT NULL,
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP(3),
    "enabled" BOOLEAN DEFAULT true,
    "rateLimitEnabled" BOOLEAN DEFAULT true,
    "rateLimitTimeWindow" INTEGER DEFAULT 60000,
    "rateLimitMax" INTEGER DEFAULT 240,
    "requestCount" INTEGER DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissions" TEXT,
    "metadata" TEXT,

    CONSTRAINT "apikey_pkey" PRIMARY KEY ("id")
);

-- Verification hashes the presented key and looks it up by "key", on every
-- single MCP request. The other two carry the listing and the revoke.
CREATE INDEX "apikey_configId_idx" ON "apikey"("configId");

CREATE INDEX "apikey_referenceId_idx" ON "apikey"("referenceId");

CREATE INDEX "apikey_key_idx" ON "apikey"("key");
