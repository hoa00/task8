# Local D1 foundation (WU-30)

Run from the repository root with pinned Node24.13.0/pnpm11.19.0:

```sh
pnpm --filter @studio/api db:generate
pnpm --filter @studio/api types
pnpm --filter @studio/api db:migrate:local
pnpm --filter @studio/api db:seed:local
pnpm --filter @studio/api dev
```

Wrangler is the sole applied-migrations ledger (`d1_migrations`). Drizzle Kit generates the committed SQLite SQL and metadata in `src/db/migrations`; do not run a parallel Drizzle migrator or schema push. Binding DB uses a local-only placeholder database ID. No remote database or deployment was created.

The production entry implements GET `/api/v1/session`, `/api/v1/workspaces`, `/api/v1/workspaces/:workspaceId/bootstrap`, and `/api/v1/workspaces/:workspaceId/catalogs`. The additive catalogs read validates `CatalogsSchema`; catalogs also remain in Bootstrap. The existing StudioApi manifest has no separate catalog operation, so it remains unchanged. Named future operations return501; unknown routes return404. All feature capabilities remain `unavailable` until their actual operations are implemented in later work units. Bootstrap navigation reads do not advertise project/task/team CRUD or file bytes.

Development principal is configured only through Worker local `STUDIO_ENV`, `LOCAL_USER_ID`, and `LOCAL_WORKSPACE_ID` (optional `.dev.vars` overrides shown in the example). No auth provider/session token is implemented. Missing, malformed, invited, removed, or nonlocal principal returns401. `x-user-id` and Authorization headers are ignored; the four GET reads reject query/body fields. Workspace middleware derives membership from the configured user; browser input cannot select an actor. Private projects require a membership grant even for Owner. Restricted navigation returns only the contracted catalog shell; task/association/summary reads are scoped.

Seed imports locked `docs/poc/reference/source-fixture.json` and `source-identities`, validates normalized DTOs, preserves source visible keys/content and the existing canonical integer positions (`order*100`), and derives taskSequence as max(200, seed number). Profile names/title stay in users; preferences exclude them. Files are single normalized sample identities without bytes. A finite second scope derives disjoint UUIDv7 IDs from the same normalized fixture for isolation tests. Primary user has no secondary membership; the HTTP workspace chooser returns only authorized workspaces. Seed inserts missing rows with `ON CONFLICT DO NOTHING` and preserves existing mutations. It is deterministic and repeatable; it is not a fixture overwrite/reset command.

`pnpm --filter @studio/api db:reset:local` explicitly deletes only this API's default `.wrangler/state/v3/d1`, then requires migrate+seed again. No arguments or remote flags are accepted. Seed accepts only an optional `--persist-to PATH` for isolated local test storage and always passes `--local`.

`RequestRepository` bounds total planned statements to50 including middleware, individual parameters to100, and batch size to the remaining50-query budget. Scoped FK identities and private/access predicates are reusable foundations. `taskVersionGate` uses a caller-provided fresh command UUID and all side effects must gate the matching root marker in the same native D1 batch; SQL zero-row UPDATE alone is not rollback. The later command owner must plan the whole batch before writes and use a fresh UUID for every attempt. WU30 includes no business dispatcher.

Undo storage and runtime payload/result codecs support the11 contracted kinds,128 targets and65536 UTF-8 bytes. Empty targets are permitted only for the contracted archive-completed-column no-op. Records/idempotency slots are foundations; WU30 implements no Undo execution/replay, journal listing, mutation endpoints, cleanup, R2, CI, provider, or production deployment.

Verification:

```sh
pnpm --filter @studio/api test:d1 d1-new-attempt
```

Each unique label uses a separate `/tmp/task8-wu30-<label>` actual Wrangler D1 database, records command stdout/stderr/status and HTTP receipts, and refuses to overwrite a completed report. Test-only `/__verify/*` routes are in a separate Wrangler entry and absent from the production entry. Worker processes are intentionally stopped with SIGTERM and recorded as signal shutdown, not fabricated exit0. The harness compares exact normalized rows, canonical Bootstrap semantics, scoped FK rollback, CAS markers, bounded codecs and principal modes. Timestamp parity compares only schema Instant fields by epoch; stored `.000Z` and fixture `Z` are not byte-identical JSON. Date-only, copy, IDs, counts and project navigation order remain strict. The completed D1 receipts can be checked with the narrower assertion by `node apps/api/tests/runtime/parity-receipts.mjs d1-03` from root.
