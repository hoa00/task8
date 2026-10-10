# Local D1 API (WU-30 / WU-31)

Run from repository root with pinned Node24.13.0/pnpm11.19.0:

```sh
pnpm --filter @studio/api db:migrate:local
pnpm --filter @studio/api db:seed:local
pnpm --filter @studio/api dev
```

Wrangler is the sole applied-migrations ledger (`d1_migrations`). Drizzle Kit generates committed SQLite SQL/metadata in `src/db/migrations`; do not run a parallel migrator or schema push. DB uses a local placeholder ID. No remote database or deployment was created. Seed imports the locked fixture/ID map, preserves keys/content and canonical positions (`order*100`), and derives taskSequence as max(200, seed number). Sample files have no bytes. The second test scope has disjoint UUIDv7 identities. Seed uses `ON CONFLICT DO NOTHING`, preserving mutations. `db:reset:local` explicitly deletes only default local D1 storage; seed accepts only an optional `--persist-to PATH` and always uses `--local`.

The server principal comes only from local Worker `STUDIO_ENV`, `LOCAL_USER_ID` and `LOCAL_WORKSPACE_ID`. Missing, malformed, invited, removed or nonlocal identity returns401. Browser identity headers are ignored; query/body fields cannot select actor or permission. Middleware derives active membership in the path workspace. Named future operations return501, unknown routes404. WU-30's four GET session/workspaces/bootstrap/catalogs reads remain; catalogs are also in Bootstrap. The contract has no standalone catalog operation and remains unchanged.

WU-31 adds workspace GET/PATCH, current-user profile GET/PATCH, all11 core project operations, member directory/detail/summary, all6 team operations and scoped Undo. Templates create complete small task fixtures atomically. Duplicate returns200, allocates new UUIDv7 project/task/subtask IDs and keys, remaps copied internal dependencies and creates fresh creation activities. It preserves recurrence patterns but clears recurrence slots, request keys, completion/lifecycle metadata and favorites; comments, old activities and files/bytes are not copied. The finite copy scope is128 tasks and512 combined task/subtask/label/dependency rows; larger scopes return `VIEW_SCOPE_TOO_LARGE`409 before writes. Primary-team transfers bump affected members and prior teams. Profile CAS bumps all memberships of the current user in the same batch while profile fields stay normalized in `users`.

| Operation | Server permission |
| --- | --- |
| Workspace PATCH; team create/update/delete/Undo | Active Owner/Admin |
| Current profile PATCH | Current configured active user only |
| Project create/duplicate | Active Owner/Admin/Member |
| Existing project PATCH/lifecycle/Undo | Active membership; private project requires an edit grant |
| Restore deleted project | Deleting actor plus current access |
| Private project reads | View or edit grant; Owner has no bypass |

The existing canonical Mock permits Guest edits to existing workspace-visible projects; WU-31 preserves that matrix. Server additionally distinguishes persisted private `view` versus `edit` grants; current Mock fixture representation contains edit grants only. ACL editing remains unavailable. Restricted catalog DTOs expose no private child counts/content; inaccessible private detail403 and children404. Team administration may clear restricted project associations internally without returning private content.

`RequestRepository` bounds planned queries to50 including middleware/guard/history/Undo/final reads, parameters to100 per statement, and batch size to the remaining query budget. Every multi-row command gates all side effects on a fresh successful root marker in the same native D1 batch. A zero-row UPDATE alone does not roll back SQL. Team delete guards the exact association set including archived/deleted rows, then writes root tombstone, versioned null associations and bounded Undo record atomically.

Storage/codecs support the11 contracted Undo kinds with128 targets/65536 UTF-8 bytes; only archive-completed-column permits empty targets. WU-31 executes `project.archive`, `project.delete` and `team.delete`; other kinds return501. Undo guards all post-versions/lifecycles, ABA and normalized-name reuse, restores only recorded fields and consumes an immutable result once. Retry reauthorizes and returns that result; independent child/lifecycle tombstones stay intact. There is no public journal, cleanup or whole-workspace inverse.

Only `teams` becomes `implemented`. The coarse `projects` capability stays `unavailable`: the contract associates it with18 operations, and seven favorites/order/saved-view operations belong to WU-34. Task CRUD, discussions, preferences/projections, files/R2, provisioning, invitations, provider, CI and production deployment remain unavailable despite the listed core routes.

Current verification from repository root:

```sh
pnpm --filter @studio/api test:wu31 unique-d1-attempt
node apps/api/tests/wu31/guards.mjs unique-guards-attempt
```

Each finite attempt uses separate `/tmp/task8-wu31-<label>` storage/config and immutable evidence in `docs/poc/evidence/WU-31/attempts`. Test-only `/__wu31/*`, SQL/race/failure injection and query-count headers are confined to a separate Worker entry; production restart verifies their absence. Rollback snapshots cover all23 application tables plus Wrangler ledger. Worker processes stop with planned SIGTERM/null exitCode, never fabricated0. Canonical comparisons are test-only; production imports only contracts/domain and server modules. Named Instant parity accepts `Z`/`.000Z` by epoch; copy/date-only/IDs/counts/order remain strict. The older WU-30 harness is a historical foundation check expecting all capabilities unavailable, not a current WU-31 capability test.
