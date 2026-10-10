# Local D1 API (WU-30 / WU-31 / WU-32 / WU-33)

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

Storage/codecs support the11 contracted Undo kinds with128 targets/65536 UTF-8 bytes; only archive-completed-column permits empty targets. WU-31 executes `project.archive`, `project.delete` and `team.delete`. WU-32 adds `task.complete`, `task.archive`, `task.delete`, `tasks.bulkDelete`, `tasks.completeColumn` and `tasks.archiveCompletedColumn`; WU-33 executes `comment.delete`, while `file.delete` remains unavailable until WU-35. Undo guards all post-versions/lifecycles, ABA and normalized-name reuse, restores only recorded fields and consumes an immutable result once. Retry reauthorizes and returns that result; independent child/lifecycle tombstones stay intact. There is no public journal, cleanup or whole-workspace inverse.

Only `teams` becomes `implemented`. The coarse `projects` capability stays `unavailable`: the contract associates it with18 operations, and seven favorites/order/saved-view operations belong to WU-34. WU-33 completes the nested task operation group: `tasks` and `comments` capabilities are `implemented`. Preferences/projections, files/R2, provisioning, invitations, provider, CI and production deployment remain unavailable.

WU-32 implements task list/summary/detail/key reads, create/PATCH/move/bulk/duplicate, dedicated completion, archive/delete/restore and member task favorites. Queries share domain filters/sorts/date-only semantics, full authorized totals and tuple cursors. Creation hashes normalized intent under the server actor's clientRequestId, replays the current authorized DTO, and rejects changed intent or a moved/lifecycle-changed scope. Project numbers/sequences and all effects allocate atomically, including move plus recurrence. Neighbor scope and adjacency are guarded; exhausted integer gaps resequence at most128 rows in the same batch. Bulk/column commands accept at most20 items and exact full-column ID/version sets, including empty scoped columns. Larger recurrence copies are bounded to512 combined new task/subtask/label/dependency rows before writes.

Create/PATCH use the shared parse5 HTML5 sanitizer inside the Worker, preserve the allowlist, derive descriptionText and check normalized HTML length before writes. Writable fields cannot set actor/version/timestamps/inverse snapshots. Scope/labels/assignees/children/dependencies/self/cycles are checked immediately. Nonremoved invited assignees remain valid within the workspace, matching the canonical Mock; invited principals cannot log in. Implicit copies filter inactive/inaccessible dependencies, while explicit changes are validated strictly. Incoming dependency add/remove touches destination versions, preventing ABA Undo after an edge is removed. Cross-project move updates linked file metadata atomically.

Dedicated completion has a single-task Undo; status PATCH and bulk field editing have none. Calendar-month recurrence shares the domain helper. Single completion Undo retains successor and original complete/create history and appends a reopen event. Column Undo restores snapshot timestamps, retracts its own events and cancels only untouched new successors after exact child/label/dependency/reference guards. It does not rewind IDs or project sequences. Task records insert actual final task postVersions by SQL after all domain writes in the same guarded batch. Known own-record forbidden Undo returns403 and every retry reauthorizes its current project scope.

Current verification from repository root:

```sh
pnpm --filter @studio/api test:wu31 unique-d1-attempt
node apps/api/tests/wu31/guards.mjs unique-guards-attempt
pnpm --filter @studio/api test:wu32 unique-task-attempt
pnpm --filter @studio/api test:wu33 unique-nested-attempt
```

Each finite attempt uses separate `/tmp/task8-wu31-<label>` storage/config and immutable evidence in `docs/poc/evidence/WU-31/attempts`. Test-only `/__wu31/*`, SQL/race/failure injection and query-count headers are confined to a separate Worker entry; production restart verifies their absence. Rollback snapshots cover all23 application tables plus Wrangler ledger. Worker processes stop with planned SIGTERM/null exitCode, never fabricated0. Canonical comparisons are test-only; production imports only contracts/domain and server modules. Named Instant parity accepts `Z`/`.000Z` by epoch; copy/date-only/IDs/counts/order remain strict. The older WU-30 harness is a historical foundation check expecting all capabilities unavailable, not a current WU-31 capability test.

WU-32 uses separate `/tmp/task8-wu32-<label>` storage/config, immutable `docs/poc/evidence/WU-32/attempts`, and a test-only `/__wu32/*` entry. Its required316 HTTP probes cover query/schema parity, actual Worker sanitizer/relations, concurrent allocation/replay, recurrence, native FK failures and full24-table zero-effects snapshots, inverse guards, scope/role changes and production restart. Exact executed task/core/Mock/domain/contract bytes are captured before invocation. Final selected report and source equality are linked by `docs/poc/evidence/WU-32/verification.json`; original failures and earlier-byte passes remain preserved.

WU-33 adds scoped subtask CRUD/promotion, plain-text comments, retained reactions and bounded comment-delete Undo, plus authorized activity with stable tuple cursors. Task/comment capabilities are implemented; dependencies/labels use the existing task PATCH. Notification state, preferences/saved views and R2 remain later-unit capabilities. `pnpm --filter @studio/api test:wu33 <attempt-label>` exercises isolated persisted local Worker/D1 storage.
