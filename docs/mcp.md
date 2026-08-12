# MCP — `apps/api/src/mcp`

The CRM as a tool an AI assistant can pick up. One Streamable HTTP endpoint,
`POST /api/mcp`, authenticated by a workspace key. Read with `api.md`: every rule
there about tenancy and thin routers holds here too, because the tools call the
same services the tRPC routers do.

## The key is the workspace

Better Auth's `api-key` plugin, configured `references: "organization"`. So the
key's `referenceId` **is** the `organizationId` — the same boundary every service
already filters on, arriving the same way a session's would. There is no tenant
argument on any tool and no way for a client to name a workspace.

- **A key belongs to the workspace, not to a rep.** It outlives whoever pressed
  the button. `canManageMcpKeys` (`@crm/auth`) is **owner-only**, deliberately
  narrower than `isWorkspaceAdmin`: Better Auth's own
  `checkOrgApiKeyPermission` grants `apiKey` actions to the creator role and no
  other, so an admin would be refused by the plugin after passing ours. One
  answer, not two.
- **The human is kept in `metadata.createdByUserId`**, and is what the agent's
  writes are attributed to — the author on a logged call, the `userId` behind a
  stage change. `createdByUserId` (`mcp-keys.service.ts`) is the one reader, and
  takes the object or the string, because the store has handed back both.
- **Membership is rechecked on every request**, not just at creation. Someone
  removed from the workspace stops the key working, which is the difference
  between revoking a person and remembering to revoke their key too.
- **The plaintext is returned once, by the create mutation, and never again.**
  Only a SHA-256 hash is stored; `start` holds the first few characters so two
  keys can be told apart in Settings → MCP.
- **Revoking goes through `auth.api.deleteApiKey`, not Prisma**, so the plugin
  invalidates whatever it is caching. Listing is a plain Prisma read because a
  stale *list* is cosmetic and a stale *key* is not.

## Read and write, but never delete

`contacts.delete`, `companies.delete` and `deals.delete` have no tool, and there
is a test that fails if one appears under any name. An assistant can create,
update, move a deal, log an activity and tick off a task. It cannot remove a
record, and it cannot lift a suppression.

- **Tools are annotated** — `readOnlyHint` on the reads, `destructiveHint: false`
  on the writes, `openWorldHint: false` on all of them. A client that asks before
  writing has what it needs to ask.
- **The enrichment tools are also absent.** `companies.research` spends the
  workspace's Context key at a vendor; that is a person's decision, not a
  turn in a conversation.
- **A list tool takes the friendly subset and parses it through the router's own
  contract** (`companyListInput.parse(args)`), so defaults, caps and validation
  stay in one place and the tool cannot drift from the UI.

## Stateless, because it deploys to Vercel

`sessionIdGenerator: undefined` and `enableJsonResponse: true`. Every POST builds
its own `McpServer`, answers, and is closed on `res.close`. There is no session
to pin to a container, which is the only shape that survives a serverless
deployment with no affinity.

- **`GET` and `DELETE` answer 405** with a JSON-RPC error saying so, rather than
  404, which reads as "wrong URL" and sends people looking in the wrong place.
- **The body is already parsed, so hand it to the transport.**
  `create-app.ts` sets `bodyParser: false`, but
  `@thallesp/nestjs-better-auth` installs its own `express.json()` on every path
  that is not `/api/auth/*`. So `req.body` is populated and the stream is spent
  by the time the controller runs: `handleRequest(req, res, req.body)`. Letting
  the transport read the stream instead returns "Parse error: Invalid JSON" on
  every call, which looks like a client bug and is not one. **Do not add a body
  parser here** — a second one on the same route is what actually breaks it.
- **`@AllowAnonymous()` on the controller** — the Better Auth guard is looking
  for a session cookie, and this route deliberately has none. The key check in
  `McpIdentityService` is the guard.

## `key.ts` holds the pure half, and must keep holding it

`readKey` and `createdByUserId` live in `key.ts` with no import but a type, and
`mcp.spec.ts` imports only from there. Move either back beside the services and
the whole suite changes answer: `auth.e2e.spec.ts` sets `GOOGLE_CLIENT_ID`
through a `fallback()` before dynamically importing `AppModule`, so any spec
that reaches `@crm/auth` through a *static* import first freezes `env` with no
Google credentials, and a test about the sign-in page fails somewhere else
entirely. Keep the parsing dependency-free and the trap never arms.

## Connecting

Settings → MCP prints the command with the key already in it:

```
claude mcp add --transport http crm <API_URL>/api/mcp --header "Authorization: Bearer <key>"
```

Any other client wants the same URL with the key as a bearer token; `x-api-key`
is accepted too, because some clients only send that.

**The endpoint is on the API deployment, not the app.** `mcpEndpointUrl()`
(`@crm/auth`) builds it from `API_URL`, the same variable the SSO callback is
built from — so a self-hoster who sets that one variable correctly gets both
right.

## Rate limiting

240 requests a minute per key, from the plugin. A tool-using model burst is
dozens of calls in a few seconds, and the plugin's own default is ten a *day*,
which would have looked exactly like a broken server.
