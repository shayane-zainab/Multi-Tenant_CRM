# API Rules

## Logging

`apps/api/src/logging`. `new Logger(Thing.name)` picks up `ContextLogger`. **Never
`console.log`.** Format follows `NODE_ENV` and is not configurable.

- **One object, not extra arguments** — `logger.log({ message: "Saved", userId })`;
  Nest prints a line per argument.
- **Errors pass the stack second** — `logger.error({ message }, err.stack)`. Passing
  the error object drops the trace.
- **Never log headers, query strings, or bodies** — cookies and personal data.
- **`LoggingModule` stays first in `AppModule`'s imports**, and Better Auth routes log
  via its own `middleware` option — it mounts before `MiddlewareConsumer`, so
  `/api/auth/*` never reaches ours.
- `requestId` from `RequestLoggerMiddleware` via `AsyncLocalStorage`;
  `UserContextInterceptor` adds `userId`. Prisma statements are opt-in
  (`PRISMA_LOG_QUERIES`).

## Intelligence never lives in the API

The API serves HTTP, auth, tRPC and the Google sync. It does **not** research, enrich,
score, summarise, match identities or decide anything about a person or company — not
as a fallback, not behind a flag. That is the eve agent in `apps/agent`, which owns
the vendor clients, the confidence model and the writes.

Nest's half is to report *that something happened*: `AgentTriggerService` writes an
`AgentTask` row. A row, not an HTTP call — the agent already leases from that table,
so the row survives the agent being down.

About to add a vendor client to `apps/api`? You want `apps/agent/agent/lib`. One
documented exception, for timing: the exchange-rate fetcher, below.

## Multi-Tenant Architecture

The CRM is multi-tenant. The tenancy boundary is the `Organization` (Workspace). `organizationId` flows through every API service and database model.

- **The id comes from the session.** A function taking an `organizationId` parameter gets it from `ctx.organizationId` (provided by `AuthMiddleware`), never from the request body or parameters.
- **Data Isolation:** All database reads and writes must explicitly filter by `organizationId`.
- **Signing in is the join; no invite flow.** `ensureOrganizationMembership` runs in `databaseHooks.session.create.before`. A user with no membership gets a **brand-new organization** and the `owner` role — it never joins them to an existing one, so two colleagues signing up independently land in separate workspaces.
- **Permissions come from `@crm/auth`** — `canRenameWorkspace`, `canChangeRole` — enforced by the service *and* used to disable the UI control.
- **The Google sync exception.** The `gmail-sync` and `calendar-sync` services run via cron and are not behind `AuthMiddleware`. They must derive `organizationId` from the `MailboxSync` row, not a session.
- **The name starts as `DEFAULT_WORKSPACE_NAME` (`CRM`), a placeholder not an answer.** The header renders `<name> CRM`.
- **The website queues the agent's `workspace-profile` task** and goes through `normalizeDomain`.

### Gates in `proxy.ts`

Onboarding, then `/onboarding/research` for the Context key. Asked server-side every
request.

- **`getSessionCookie()` decides signed-in**; pages still resolve the real session via
  `requireGoogleAccess()`.
- **Nothing is cached in a cookie** — both facts revert on a database reset while a
  year-long marker insists the gate passed. Cache in the API if cost ever matters.
- **Both reads run concurrently**, but order decides which is *asked* — the research
  read is never made while onboarding is open.
- **An unreachable API fails open** (`unknown` lets the request through).
- **`/sign-in`, `/grant-access`, `/eve` are ungated.** `/sign-in` is the only path a
  stranger may read; `/` joins it only when `IS_MARKETING` is set.
- **There is no way past the key gate but to answer** — Skip stranded installs, every
  later company sitting `PENDING` with nothing saying so.

### The name is also the URL

Served under the workspace slug (`/comp-ai/companies`). **Cosmetic, not tenancy** —
every query still resolves through `ctx.organizationId` (from the session).

- **The slug is the plugin's column**, written by `workspaceSlug(name)`
  (`@crm/db/workspace`) on rename and create. **Never derive it on read.**
- `RESERVED_SLUGS` prevents collision with a real route (a collision gets `-crm`).
- **The proxy is the only thing that puts the slug on.** Missing or stale slugs are
  redirected with the query string intact, not 404'd; `[slug]/layout.tsx` is the
  backstop.
- `appPath` in `proxy.ts` is the one place `/` resolves for a signed-in rep, which
  keeps every `callbackURL` correct without knowing about slugs.
- **Renaming moves the URL**, so `workspace-form.tsx` replaces the location onto the
  slug `workspace.update` returns.

## SSO is a row, not a deployment

An `ssoProvider` row via Better Auth's `sso` plugin, on Settings → SSO, because a
self-hoster's admin cannot redeploy.

- **OpenID Connect only** — issuer, client id, secret; endpoints from discovery. No
  SAML UI: it needs an X.509 cert and SP signing key we have nowhere to keep.
- `SsoService` passes `organizationId` explicitly to every method to enforce isolation.
- **Management is tRPC (`sso.*`); signing in is `authClient.signIn.sso()`.**
- **`sso.signInOptions` is the one public procedure in the app.** Every other `sso.*`
  takes `AuthMiddleware` at the *method*, which is what leaves it open. A client
  secret is never read back out.
- **It is the API's answer, not the app's** — the API serves `/api/auth/*`.
- **An install with neither Google nor a provider says so**, naming the two variables;
  a read that *fails* falls back to offering Google.
- **A provider hides the Google button, it does not disable it** —
  `/sign-in?method=google` still works, so a mistyped issuer cannot lock an admin out.
- **Signing in with an IdP does not cost you Gmail.** `needsGoogleGrant` (`@crm/auth`)
  walls only an account whose sole sign-in row is Google.
- **Sign-up is open for SSO too** — there is no allow-list hook. Completing the flow
  creates the account and its organization.
- `organizationProvisioning: { disabled: true }` — `ensureOrganizationMembership` already
  does the join.

## tRPC is the data surface; REST is auth and health only

- **One router per module**, `*.router.ts` (the codegen glob), with
  `@Router({ alias })` and `@UseMiddlewares(AuthMiddleware)`. **No `AuthMiddleware`
  means public — there is no other guard.**
- **Routers are thin**: zod in, service call out; Prisma lives in `*.service.ts`.
- Services throw Nest's `HttpException` family; `DomainErrorMiddleware` maps them.
- **Filter, sort and paginate in Prisma.** List procedures take `listInput` and return
  `{ rows, total, facetCounts }`. Never filter a whole table in the browser; never
  interpolate `sort` into a field name — use `resolveOrderBy`.
- **A schema's exported name is global.** The generator resolves `input:` schemas by
  *symbol name* across the whole project, not per module — so two `*.contracts.ts`
  files both exporting `setAutoCreateInput` silently give one procedure the other's
  type, and the error surfaces in an unrelated component. Prefix anything that is not
  obviously unique (`setWhatsAppAutoCreateInput`, `whatsAppThreadInput`).
- **`src/generated/server.ts` is generated *and committed*, and `build` must never
  regenerate it** — the generator needs GLIBC 2.39, newer than Vercel's build image.
  Only `check-types` and `dev` run it. If the app cannot see a new procedure, it has
  not run.

## WhatsApp is a webhook, and the number is the tenancy key

`apps/api/src/whatsapp`. Meta posts to `POST /internal/whatsapp/webhook`; there is no
polling and no cron. Requires **Coexistence**, so the rep keeps using the WhatsApp
Business app and Meta mirrors both sides here.

- **`phoneNumberId` resolves the workspace, not a session.** The webhook is anonymous,
  so `WhatsAppConnection.phoneNumberId` (unique) is the only path to `organizationId` —
  the same rule as `MailboxSync` for the Google cron. **An event for a number no
  workspace has connected is logged and dropped**, never guessed at.
- **Every body is verified before it is read.** `X-Hub-Signature-256` HMAC against
  `WHATSAPP_APP_SECRET`, compared with `timingSafeEqual`. Unset **fails closed** (503),
  because the alternative is a public endpoint that writes to the CRM.
- **The route needs the raw bytes**, so `WhatsAppModule` applies `express.raw` to that
  one path. The app runs `bodyParser: false`; re-serialising a parsed body changes it
  and the HMAC stops matching.
- **Ingest is idempotent and a failure re-throws** — `@@unique([threadId, waMessageId])`
  plus `skipDuplicates`, so Meta's retry is free and swallowing an error would lose the
  message instead.
- **`message_echoes` is what the rep sent from their phone.** It is threaded by `to`,
  not `from`, or every echo lands in a thread keyed by our own number.
- **Matching is by phone and nothing else.** `phoneVariants` covers how the row may
  have been typed; anything past an exact match is the agent's job, so a created
  contact gets an `identify` task rather than a guessed name. Auto-create is off by
  default, **never fires on an echo** — a number the rep messaged first is not inbound
  interest — and **respects `SuppressedPhone`**, or deleting a contact would last until
  their next message.
- **Sending needs a token that may not exist.** Per-connection `accessToken` first,
  `WHATSAPP_ACCESS_TOKEN` second, and neither is a 503 that names both — inbound keeps
  working regardless.
- **Groups and status updates never arrive.** Meta does not send them under
  Coexistence. Do not build anything that assumes a group thread can exist.
- **The token is written and never read back**, like an SSO client secret.
  `whatsapp.status` returns `canSend`, a boolean, and no call returns `accessToken`.
- **A conversation is an `Activity` with a `whatsAppThread`**, so it lands in the
  existing timeline beside email and meetings rather than in a tab of its own.
  `purgeSyncedData` deletes the threads and recomputes `lastActivityAt` on every
  record they touched; disconnecting cascades the same way.

## Not every address on a thread is a person

`externalParticipants` (`google/participants.ts`) is the one gate, discarding **us**
(allow-list domains, `User` table), **rep decisions** (`SuppressedContact`,
`SuppressedDomain`), and **addresses no human reads**.

- **`isMachineDomain` (`companies/domain.ts`) sits beside `FREE_EMAIL_DOMAINS`**;
  `domainFromEmail` returns null for both, and `companyForEmail` is the only path from
  address to company — so a caller ignorant of the rule still cannot create one.
  `.calendar.google.com` covers shared calendars, rooms and ICS feeds.
- **Matches the host, never a substring** — `calendar.acme.com` is a real company.
- **`isMachineAddress` also catches opaque local parts** (24 hex chars, UUIDs),
  deliberately narrow: a false positive is a real customer never filed.
- **It leaves no row** — a rep may still type these into quick-add; only the *inbox*
  is barred from deciding. `syncAttendees` filters the same addresses beside
  `attendee.resource`.
- **`isAutomatedAddress` is a separate list about the local part** (`sales@`,
  `noreply@`), which is why `support@acme.com` never becomes a lead.

## Deleting a record

`contacts.delete`, `companies.delete`, `deals.delete`. No soft delete, no archive.

- **A deleted contact is suppressed by address**, or the sync recreates them from the
  next thread. `ContactsService.delete` writes `SuppressedContact`, and
  `externalParticipants` drops it like a `SuppressedDomain` — one filter covering
  contact creation, company auto-creation and attribution.
- **And by phone, for the same reason.** A WhatsApp contact has no address to suppress,
  so `SuppressedPhone` is the equivalent — written by the same delete, checked by
  `WhatsAppMatchService` before auto-creating, and lifted by `allowPhoneAgain` on
  `contacts.create` and `.update` beside the email one. Keyed on `normalizePhone`
  output, so `+92 333 6104114` and `923336104114` are the same suppression.
- **Keyed lower case.** `normalizeEmail` (`crm/values.ts`) is the one canonicaliser,
  on `contacts.create`, `.update` and the suppression; conflict checks and `allowAgain`
  match case-insensitively.
- **The address comes from the delete itself**
  (`tx.contact.delete({ select: { email: true } })`), not a read before it — and the
  404 is that statement's own `P2025` through `translate`.
- **Adding them back lifts the suppression** via `allowAgain` **inside the write's
  transaction**. Never automatic.
- **Deleting a company does not suppress its domain** — its people survive with no
  company, and domain suppression stays the explicit Settings → Connections control.
- **Clear `AgentTask` and `AgentEvent` yourself** — they carry `contactId`/`companyId`
  with no foreign key, so nothing cascades.
- **Recompute `lastActivityAt` on exactly the records the delete reached.**
  `ActivityStampService.targetsOf(where)` collects them *inside* the transaction (the
  evidence is what gets deleted); `recomputeMany` restamps. A company's `where` must
  follow its deals: `{ OR: [{ companyId }, { deal: { companyId } }] }`.
  `recomputeAll()` is for a purge only.
- **Recompute after commit, logging rather than throwing** — the row is already gone,
  and a raised error makes the browser skip invalidation and retry into a 404.

## Money

A deal is sold in one currency and reported in another, and **only `baseAmount` may
ever be summed**. The rules — `baseCurrency`, `countedWhere`/`pendingWhere`, frozen
rates, the ten supported currencies, the keyless feed, and why the fetcher is the one
documented exception to *no intelligence in the API* — are in **`docs/currency.md`**.
Read it before touching any amount, total, chart or rate.

## Freshness: invalidate the query, don't disable the cache

- **Invalidate in `onSuccess` through `useCrmCache()`** (`lib/trpc/cache.ts`), never by
  listing keys at the call site. Say what changed — `cache.deal(id)`,
  `cache.company(id)`, `cache.contact(id)`, `cache.activity()`. **A new mutation adds a
  call there, not a new list of keys.**
- **A deletion is `cache.removed(ref)`** — one wide fan-out, and the only place
  `refetchType: "none"` is right: the deleted record's `byId` query is still mounted
  while the sheet animates shut, so refetching reads a 404 into the closing sheet,
  while leaving it alone serves 30s of a dead record from cache.
- **`{ settle: "record" }`** for inline editors, so the field's spinner clears without
  waiting for the table.
- **Infinite queries need `pathKey()`, not `queryKey()`** — the latter stamps
  `{ type: "query" }` and silently cannot match `{ type: "infinite" }`.
  `activities.timeline` is read both ways.
- **`cache-manager` is per-value and opt-in**, not an interceptor;
  `AuthService.getProfile` is the model.
- **Background writes need polling, not invalidation** — `refetchInterval` while
  `PENDING`/`RUNNING`, via `isEnriching()` and `ENRICHMENT_POLL_MS`. **Lists poll too,
  not just the sheet.**
