# Environment

Setup, DB commands, Google Cloud and the `vercel env pull` hazard: `docs/setup.md`.

## One `.env`, at the repo root

`.env.example` **is the documentation** — every variable the repo reads, with a note,
and nothing that is not read. `packages/env` walks up to the workspace root and reads
`.env`, then `.env.local` on top.

- **Real environment variables always win** — the loader never overwrites
  `process.env`, so Vercel/Docker/CI takes precedence.
- **Never add a per-package `.env`.** Four once existed with duplicate
  `DATABASE_URL`/`BETTER_AUTH_SECRET`; when they drifted the API minted a cookie the
  app could not verify and the browser bounced between `/sign-in` and `/` forever.
- **The root marker is a `package.json` declaring `workspaces`** — stopping at the
  first `turbo.json` resolves the API's root to `apps/api`.

## Required

`DATABASE_URL`, `BETTER_AUTH_SECRET`. Everything else has a localhost default or is
genuinely optional.

**`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`** are the sign-in button *and* the
Gmail/Calendar sync — optional, so an SSO-only install needn't create a Google project,
but **set together or not at all** (`packages/auth/src/env.ts` throws on one).

**Sign-up is open, and no variable narrows it.** Anyone who completes the Google (or
SSO) flow gets an account and their own organization. Who may sign in is decided at the
identity provider — the OAuth consent screen's publishing status and user type — not by
this repo. **Which addresses count as internal is per-organization**, derived from that
org's own member emails in `google-match.service.ts`; there is no global list, because a
global one would make org A's domain read as internal inside org B.

## Where things are

- **`API_URL`** (`:3001`) mints session cookies and serves `/api/auth/*`;
  `next.config.ts` republishes it as `NEXT_PUBLIC_API_URL`, so one variable does both
  sides. `BETTER_AUTH_URL` is a legacy fallback.
- **`APP_URL`** (`:3000`) is also the trusted-origin and `callbackURL` allow-list.
- **`AUTH_COOKIE_DOMAIN`** only for API and app on different subdomains of one parent.
- **`AGENT_URL`** is the agent's deployment, server-side only, and **must include the
  scheme** — validated at boot, or it throws when a task is queued instead.
- **`AUTH_COOKIE_PREFIX` is `crm`** (`@crm/auth/cookies`), set on **both**
  `advanced.cookiePrefix` in `auth.ts` and `getSessionCookie(request, { cookiePrefix })`
  in `proxy.ts` — one alone redirects every signed-in request. Better Auth's default
  collides with any neighbour on a shared parent domain, silently: sign-in completes,
  the row is written, every reader resolves `null`. **Changing it signs everybody out.**

## `IS_MARKETING` — landing page flag, off by default

`"true"` serves `app/(landing)` at `/`; anything else sends a signed-out visitor to
`/sign-in`, because the page markets *this* product.

- **Only the literal `true`** (same shape as `PRISMA_LOG_QUERIES`).
- **It decides one thing**: what a stranger at `/` sees.
- **`isMarketing()` (`apps/app/lib/env.ts`) reads per request**, so a config change
  needs no rebuild. Declared in `apps/app/turbo.json` `passThroughEnv`.

## Typed, validated env

`apps/api/src/config/env.validation.ts` runs via `ConfigModule.forRoot({ validate })`,
and lists every variable the API reads and nothing else.

- **Validation runs while `AppModule` is evaluated** — a test must set variables before
  importing it (see the dynamic `import()` in `test/auth.e2e.spec.ts`).
- **The schema is the API's, not the repo's** — `@crm/auth` and the agent read their own.

## Optional: what the agent can do

Every outside source is optional and the agent runs with none. A missing key removes a
place to look; **never an error, never throws**. `agent/lib/capabilities.ts` is the
single place that knows what is set.

| Variable | What it adds |
| --- | --- |
| `PERPLEXITY_API_KEY` | Open-web research with citations; finds a LinkedIn slug |
| `RAPIDAPI_KEY` | LinkedIn profiles via LinkDAPI |
| `GITHUB_TOKEN` | Raises the GitHub rate limit from 60/hour |
| `BLOB_READ_WRITE_TOKEN` | Mirrors logos and photos into Blob |
| `AI_GATEWAY_API_KEY` | The model. Not needed on Vercel (OIDC) |
| `AGENT_BRIDGE_SECRET` | The rep-facing Agent panel — see `agent.md` |

`BLOB_READ_WRITE_TOKEN` is also in `env.validation.ts` and `apps/api/turbo.json`
because the API and the seed write pictures too. The Next.js app is deliberately
excluded — recognising our URL for the image optimizer needs no token.

### The Context key is asked for, not configured

**`CONTEXT_DEV_API_KEY` is not a variable here and must not become one.** The key lives
in `OrgSetting` (it is per-organization), is asked for at `/onboarding/research`, and changes on Settings →
General — an admin who cannot redeploy cannot set a variable.

- **An install that had the variable is asked again**: no migration, no fallback, and
  **the gate cannot be dismissed**.
- **Nothing is lost while waiting.** A keyless `brand` task settles `SKIPPED` *before*
  anything marks the row `RUNNING`, and `settle` only overwrites `RUNNING` — so the
  company stays `PENDING`, which the sweep re-queues
  (`test/keyless-brand.integration.spec.ts`).
- **Saving the key runs the company sweep immediately** (fire-and-forget).
- **`readContextDevKey` (`@crm/db/settings`) is the only reader**, read live with no
  cache. An unreadable database is a capability that is off, not an exception.
- **The key is never read back** — only whether one is set, and its last four.
- **The agent checks it, not the API** (a vendor client in the API is a bug):
  `settings.setResearchKey` calls `POST /internal/crm/verify-key` and writes unless the
  answer is *invalid*. **`401` is the only answer meaning the key is wrong**, and **a
  check that cannot be made is not a failed check** — `unknown` saves anyway and logs it
  unverified.

## Gmail and Calendar sync

Always on, on the existing Google provider, so there is no extra redirect URI. Scopes
are requested at sign-in and gated by `requireGoogleAccess()`, because granular consent
lets a user untick one and still sign in.

**An SSO rep is not gated** — `needsGoogleGrant` (`@crm/auth`) walls only an account
whose *sole* sign-in row is Google. It cannot be "has the scopes": an SSO rep has no
Google account to grant on, and `revoke()` keeps the `account` row, so trying the
optional feature and revoking would lock them out. They connect from Settings →
Connections, posting the same `linkSocial` call.

**Sync is forward-only** — Gmail records the current `historyId` on its first pass and
imports nothing; Calendar reads from `now`.

**`CRON_SECRET`** (min 16 chars) guards `POST /internal/sync/google` and
`/internal/sync/rates`; both **fail closed when unset**. **Crons live in
`apps/api/vercel.json`** — Google `*/5 * * * *`, rates daily. Minute-level schedules
need a Pro plan; on Hobby it silently becomes daily.

Deliberate absences: **no `GOOGLE_SYNC_ENABLED`** (a switch that can disable a mandatory
feature is only ever wrong), **no `GOOGLE_WORKSPACE_DOMAIN`** (an organization's own
member emails already say who is internal — two sources is how a colleague becomes a
lead), **no `GMAIL_BACKFILL_DAYS`**, **no rate provider variable**.

## WhatsApp

**`WHATSAPP_VERIFY_TOKEN`** and **`WHATSAPP_APP_SECRET`** together turn the feature on;
either missing and `/internal/whatsapp/webhook` answers 503 and nothing else changes.
The verify token is echoed once during Meta's subscription handshake; the app secret
signs every body afterwards and **fails closed** when unset.

**`WHATSAPP_ACCESS_TOKEN` is a fallback, not the source.** Which number belongs to
which workspace is a `whatsAppConnection` row — one deployment serves every tenant, and
a self-hoster's admin cannot redeploy to add a number. The row's `accessToken` wins;
the variable exists for a single-tenant install that would rather keep it in the
environment. Unset, inbound still works and only replying from the CRM is unavailable.

Deliberate absences: **no `WHATSAPP_PHONE_NUMBER_ID`** (it is the tenancy key, so it
has to be a row), and **no `WHATSAPP_ENABLED`** — presence of the two required values
is the switch.

## Telemetry is on, and turning it off is one variable

`CRM_TELEMETRY_DISABLED="1"` — or `DO_NOT_TRACK=1`, honoured identically — and nothing
is sent. No client is constructed, so there is no queue waiting to flush later.

- **Server side only**, `posthog-node` in the API and the agent. **`posthog-js`
  appears once, on the `trycrm.ai` landing page**, and nowhere a record can be
  reached: autocapture on a CRM would lift contact names and deal amounts out of
  somebody else's database. That one import is gated on
  `window.location.hostname`, not on `IS_MARKETING` — turning the landing page on
  for your own domain never loads it. `docs/telemetry.md`.
- **There is no variable for the destination.** The project key and host are
  constants in `packages/telemetry/src/project.ts`. A `phc_` key is write-only —
  it can send events and read nothing back — so making it configurable would
  only imply it were a secret. Edit the constants to point somewhere else.
- **The install ID is a row, not a file** — `install`, one row, UUID written by
  the migration. Vercel's filesystem is ephemeral, so `~/.crm/telemetry-id`
  would count containers.
- Declared in `env.validation.ts` as optional, like everything else here. Every
  event and the never-sent list are in **`docs/telemetry.md`**.

## Not env vars

- **Cache TTL** — `DEFAULT_TTL_MS` (60s) in `cache.module.ts`; `CACHE_TTL_MS` overrides.
- **Redis** — optional; without `REDIS_URL` the cache is per-instance in-memory, which
  is wrong for multi-instance.
- **Sign-in method** — Google is in code; an IdP is a row (SSO, in `api.md`).
