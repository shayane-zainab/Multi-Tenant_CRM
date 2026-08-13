# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Bun + Turborepo. Every command runs from the repo root; scope with `--filter=<workspace>`
(`app`, `api`, `agent`, `@crm/db`, `@crm/auth`, `@crm/env`, `@crm/telemetry`, `@crm/ui`).

| | |
| --- | --- |
| `bun run dev` | app :3000, api :3001, agent :2000 |
| `bun run check-types` | `tsc --noEmit` everywhere |
| `bun run lint` / `bun run format` | Biome (tabs, double quotes) |
| `bun run test` | Every workspace's `bun test` |
| `bun run db:migrate` / `db:push` / `db:reset` / `db:seed` | Guarded by `require-local-db.ts`; `ALLOW_REMOTE_DB=1` overrides |
| `bun run db:deploy` | `prisma migrate deploy` — unguarded on purpose |
| `bun run --filter=api trpc:generate` | Regenerate `apps/api/src/generated/server.ts` |
| `bun run --filter=agent dispatch` | Run both agent lanes now — `eve dev` never fires schedules |
| `bun run --filter=api dev:session` | Print a session cookie for a local user |

CI (`.github/workflows/ci.yml`) runs exactly `check-types`, `lint`, `test` against a
real Postgres. Run those three before claiming work is done.

### One test

Tests are `bun test`, in each workspace's `test/` directory. There is no per-file
turbo task, so run them from inside the workspace:

```sh
cd apps/api   && bun test test/workspace.spec.ts   # one file
cd apps/agent && bun test -t "identity"            # one test by name
```

`*.integration.spec.ts` in `apps/agent` and `apps/api` need `DATABASE_URL` pointing at
a live Postgres; the plain `*.spec.ts` files do not.

## Architecture

Three independently deployed processes and one Postgres. They share nothing but the
database, `DATABASE_URL` and `BETTER_AUTH_SECRET` — the API mints the session cookie
and the app verifies it, so a secret mismatch is a redirect loop, not an error.

```
apps/app (Next.js :3000) ──tRPC──> apps/api (NestJS :3001) ──> Postgres <── apps/agent (eve :2000)
        └──────────── HTTP + AGENT_BRIDGE_SECRET ────────────> apps/agent
```

**The type chain is the point.** Prisma generates the row types in `packages/db`;
NestJS `*.router.ts` files are compiled by `nestjs-trpc` into the committed
`apps/api/src/generated/server.ts`; `apps/app` imports that as `api/app-router`. A new
procedure the app cannot see means `trpc:generate` has not run. `build` must never
regenerate it — the generator needs a newer GLIBC than the build image.

**The API and the agent talk through a table, not HTTP.** Nest writes an `AgentTask`
row; `apps/agent/agent/lib/tasks.ts` leases it with `FOR UPDATE SKIP LOCKED`. The row
survives the agent being down, which is why the boundary is a row. The one HTTP path
in the other direction is the bridge (the record sheet's Agent tab), gated on
`AGENT_BRIDGE_SECRET`; unset, the tab reports itself unconfigured and the agent keeps
running its own schedule.

**`apps/agent` is filesystem-first eve.** A tool is a file in `agent/tools/`, a skill
is markdown in `agent/skills/`, the single schedule is `agent/schedules/dispatch.ts`,
and vendor clients live in `agent/lib/`. Adding a capability means adding a file, not
wiring a registry.

### Multi-tenant — and the README contradicts it

`README.md` is upstream's and still says *"There are no organizations. Single tenant,
deliberately."* **That is no longer true of this fork.** `Organization` is the tenancy
boundary and `organizationId` flows through every service and model. `docs/api.md`
§*Multi-Tenant Architecture* is the authority; the README is not. Two rules that
follow from it and are easy to get wrong:

- `organizationId` comes from `ctx.organizationId` (set by `AuthMiddleware` from the
  session's `activeOrganizationId`), **never** from input. The Google sync services are
  the exception — they run under cron with no session and derive it from the
  `MailboxSync` row.
- The workspace slug in the URL (`/acme/companies`) is **cosmetic**. `proxy.ts` is the
  only thing that puts it there. It is not a tenancy check and must never be read as
  one.

Membership is joined at sign-in (`ensureOrganizationMembership` in
`databaseHooks.session.create.before`), not by invitation. `scripts/create-org.ts`
creates an org for an already-signed-in user.

### Per-client isolated deployments

`clients/` is a separate, fork-specific tenancy model layered on top: PowerShell
provisioning (`provision.ps1`, `list.ps1`, `destroy.ps1`) that gives each customer its
own database, container group, subdomain and secrets, tracked in `registry.json`. See
`clients/README.md`. `clients/instances/` holds real secrets and is gitignored.

## Conventions worth knowing before the first edit

- **Read the doc listed in `AGENTS.md` for the area you are touching, and check
  `.agents/skills/` for a matching skill.** Both are large and neither is loaded for
  you. Tell the user which you read.
- **Nested `CLAUDE.md` files exist** — `apps/app/CLAUDE.md` warns that this Next.js is
  ahead of training data and that `node_modules/next/dist/docs/` is the reference.
  eve's own docs likewise ship in `apps/agent/node_modules/eve/docs`.
- **Biome, not Prettier or ESLint.** Tabs, double quotes, import organisation on.
  `src/generated`, `packages/ui/src/components` and `.agents` are excluded.
- **`.env.local` wins over `.env` and `vercel env pull` writes production credentials
  into it by default.** Pull to `.env.vercel` instead. This has already put eleven
  migrations onto the production database from a laptop.
