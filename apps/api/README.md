# Local D1 API (WU-30 / WU-31 / WU-32 / WU-33 / WU-34 / WU-35)

## Quy tắc phát triển và trạng thái kế hoạch

Đọc [AGENTS.md](AGENTS.md) và [BACKEND_STANDARDS.md](../../docs/engineering/BACKEND_STANDARDS.md) trước khi thêm/sửa backend. POC giới hạn tính năng, không giảm chất lượng kiến trúc/code/kiểm thử. [BACKEND_REFACTOR_PLAN.md](../../docs/engineering/BACKEND_REFACTOR_PLAN.md) là kế hoạch điều chỉnh có thứ tự và tiêu chí nghiệm thu. BR-01 hiện thực tooling/active tests bên dưới; BR-04A đã PASS acceptance cho task core; các owners còn lại và SQL optimization thuộc BR-04B…08. BR-03 đã có DB execution/accounting và policy owner. BR-02 đã có HTTP helpers, error boundary và tuple cursors. Cấu trúc thư mục đích vẫn là target.

Các mục WU dưới đây ghi implementation và verification lịch sử; trạng thái/code/commands hiện hành phải đối chiếu [PROGRESS.md](../../docs/poc/PROGRESS.md) và package.json, không suy ra PASS của code mới từ evidence cũ.

## Task core owner (BR-04A)

`src/modules/tasks/index.ts` là public surface cho create/update/completion/lifecycle/duplicate/favorite và task reads. Application use-cases không dựng SQL; `persistence/commands.ts` giữ toàn guarded batch cùng final SELECT, `persistence/reads.ts` giữ shared projection, `mapper.ts` giữ pure Task DTO. `domain/model.ts` và `domain/completion.ts` dùng canonical TaskStatus, explicit now; command signatures nhận injected ID generator với production UUIDv7 default. PATCH và dedicated completion dùng discriminated intents; chỉ dedicated entering-done tạo single completion Undo.

`modules/tasks.ts` tạm giữ move/bulk thuộc BR-04B; task-read/task-relations là compatibility surfaces sẽ gỡ sau chuyển consumers. Full command/read datasets vẫn có legacy SQL pagination debt thuộc BR-07A/B; BR-04A không claim đã tối ưu paging. Member directory và workspace date được đưa về owner vì task core có consumer thật.

## Kiểm thử và tooling hiện hành (BR-01)

Dùng Node `24.13.0`, pnpm `11.19.0`, `pnpm install --frozen-lockfile`. Chạy `pnpm build` sau lần cài đầu để có exports contracts/domain. Cài Chromium cho file/TaskForm integration bằng `pnpm exec playwright install chromium`; Linux cần các thư viện hệ thống Playwright. Không đổi lockfile/toolchain khi môi trường thiếu dependency.

```sh
pnpm --filter @studio/api test:unit
pnpm --filter @studio/api test:integration
pnpm --filter @studio/api test:integration --feature tasks
pnpm --filter @studio/api test
pnpm --filter @studio/api format:check
pnpm --filter @studio/api lint
pnpm --filter @studio/api typecheck
pnpm test
```

`pnpm test` ở root gọi API qua Turbo, build dependencies trước test và truyền lỗi API lên root. API chạy unit rồi native integration **serial**, đủ bảy owners:

| Feature | Active suite | Trách nhiệm |
| --- | --- | --- |
| db | tests/integration/db.mjs | Native/Drizzle accounting, budgets, typed boundary và policy parity |
| http | tests/integration/http.mjs | Request/error/correlation và cursor anchor mutation regression |
| core | tests/integration/core.mjs | Workspace/profile/project/member/team, policy/CAS/Undo và production restart |
| tasks | tests/integration/tasks.mjs | Task fields/ordering/recurrence/bulk/idempotency/native rollback/Undo |
| collaboration | tests/integration/collaboration.mjs | Subtasks/promotion/comments/reactions/activity và parent guards |
| projections | tests/integration/projections.mjs | Bootstrap/Home/Overview/search/calendar/archive/preferences/notifications/saved views; full-view HTTP consumer |
| files | tests/integration/files.mjs | Actual R2+D1 fault outcomes/checksum/replay; Chromium upload/download và partial TaskForm retry |

`--feature` chỉ chấp nhận một trong bảy tên trên. Unit owners ở `tests/unit` kiểm tra paging semantics, import guard và lifecycle của harness. Các Workers active import production `src/index.ts`; không có implementation API fork. Core/task/collaboration/projection tái dùng fault injectors lịch sử, typecheck cả dependency đó. `tests/support/files.worker.ts` là injector active đã sửa type narrowing; WU-35 cũ bất biến. Các adapter/Mock dùng trong expected parity là consumer độc lập, không được production import.

`tests/support/harness.mjs` cấp unique output/run ID, storage/config trong `/tmp`, ephemeral HTTP port và inspector port, quản lý đúng process group. Timeout, early exit, spawn failure đều được ghi exitCode/signal thật và cleanup. Output mặc định là `test-results/api/<feature>-<unique>/`; có thể đặt `API_TEST_OUTPUT_DIR` (Turbo truyền biến này). Storage riêng được giữ sau chạy để điều tra, không reset local DB của người dùng. Report ghi đường dẫn storage và command logs. Routine runs không ghi/copy code vào historical docs/evidence. Chromium preview dùng server/port riêng và proxy tới Worker của đúng suite; suite đặt English trong DB test để chạy assertions hiện hành, không đổi locale sản phẩm.

Prettier `3.6.2` được pin tại API cùng `.prettierrc.json`; `format`/`format:check` chỉ bao phủ backend hiện hành. Migrations/generated bindings và WU tests/evidence được loại trừ. Root lint còn kiểm tra toàn repo; API lint thêm AST import boundary. [Legacy allowlist](tooling/legacy-imports.json) có 36 import violations cụ thể và không còn cycle, từng entry có phase gỡ; entry stale hoặc edge/cycle mới đều fail. Không miễn toàn modules directory. Matrix gồm routes/application/domain/policy/persistence/storage/mapper/shared, public module entry và cấm frontend/dynamic imports. Production source hiện vẫn có ownership debt theo kế hoạch; BR-01 không tuyên bố đã đạt target architecture.

Hai lệnh phục vụ acceptance riêng (chạy độc lập khi không có formatter/typecheck/root test khác đang chạy):

```sh
node apps/api/tooling/verify-gates.mjs
node apps/api/tooling/verify-format.mjs 5a779b758345441d1072cfcd3501b9f77eded21c
```

`verify-gates` tạo test/Worker probe hữu hạn, chứng minh active Worker type error bị reject và API failure làm root test fail, rồi xóa probes trong finally; không overwrite file đã tồn tại. `verify-format` so AST/literals với commit baseline rõ ràng (bỏ parentheses dư/quote của object key), không thay thế native regression. [Evidence BR-01](../../docs/engineering/evidence/BR-01/verification.json) ghi baseline, source hashes, commands và native reports. Các mục WU dưới đây vẫn là lịch sử, không phải lệnh kiểm thử thường ngày.

## Chạy local và phạm vi đã triển khai

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

WU-34 completes the project operation group with favorites/order/saved views, so `projects` joins `teams`, `tasks`, `comments` and `notificationState` as `implemented`. Files/R2, provisioning, invitations, provider, CI and production deployment remain unavailable.

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

WU-33 adds scoped subtask CRUD/promotion, plain-text comments, retained reactions and bounded comment-delete Undo, plus authorized activity with stable tuple cursors. Task/comment capabilities are implemented; dependencies/labels use the existing task PATCH. Notification state and preferences/saved views are completed by WU-34; R2 remains unavailable until WU-35. `pnpm --filter @studio/api test:wu33 <attempt-label>` exercises isolated persisted local Worker/D1 storage.

WU-34 adds Home/Overview, global literal search (including scoped sample-file metadata), calendar events/milestones and Archive reads; all counts use the full authorized scope. Board/Calendar/Timeline retain the complete cursor loader from WU-32. Home task previews are complete and recent activity has an explicit full total. Archive excludes archived-parent task roots, includes nondeleted children in archived-project summaries, and preserves project insertion order independently of Sidebar preferences. WU-34 search uses category then stable ID order; scoped tuple cursors do not require a removed/restored anchor to exist.

Notification list/read/unread/read-all and Bootstrap badges share one recipient/current-parent predicate; Inbox excludes update-type notifications. Same-batch actor authorization distinguishes valid idempotent no-ops from a revoked membership. Personal preference PATCH merges only supplied keys in SQL, preserving concurrent unrelated keys and the other preference document. Shared saved views use project read/edit grants, live lifecycle and CAS; filter definitions retain the existing shape-only contract. Favorites are idempotent and personal. Project order accepts active known catalog roots (including restricted cards), rejects duplicate/foreign/lifecycle IDs, and preserves omitted roots with guarded set equality.

`pnpm --filter @studio/api test:wu34 <unique-attempt>` uses finite isolated actual local Worker/D1, 235 extra tasks in each of two disjoint workspaces, the real HTTP adapter/full-view loader and test-only SQL/batch failure hooks. Executed finite input maps and content-addressed original bytes are captured before each command. Four bounded dev processes end by planned SIGTERM with null exitCode; CLI results retain their actual status. No source fixture/lock/schema/migration or inherited evidence is edited, and no new delivery/search provider is installed.

WU-35 implements the eight file operations and advertises `fileMetadata`/`fileBytes: implemented`. Native `FILES: R2Bucket` is local; multipart is bounded by actual body/file bytes (10 MiB) and stores only controlled metadata/digests in D1. Project Files and TaskDetail use the same IDs. Download rechecks workspace/project/task visibility and streams private content with nosniff/no-store; only PNG/JPEG/GIF/WebP can be inline. Sample artwork never implies original file bytes. Rename retains content identity; duplicate creates an independent object; delete tombstones retain bytes for bounded, current-authorized one-shot Undo.

R2 and D1 have independent outcomes. Every upload attempt owns a fresh object key and the native D1 unique intent chooses one winner. Only a confirmed SQL rollback/no-op/loser permits owned-object cleanup. Lost acknowledgement or a negative verification read preserves bytes and logs the internal file/object/request identity for inspection; retry uses the same upload key/hash. A cleanup failure returns an error and records the unresolved object. Duplicate uncertainty also records its independent copy identity; there is no duplicate request-key contract, queue, physical purge or promise that temporary unresolved objects cannot exist. TaskForm retains one created task and each attachment intent until the whole batch is confirmed. HTTP fetch displays indeterminate upload state and waits for the server response.

`node apps/api/tests/wu35/verify.mjs <unique-attempt>` runs isolated real Wrangler local R2+D1 and the current HTTP build in Chromium. Fault wrappers are test-only and not imported by production. Checks cover actual byte linkage/checksum, native rollback, lost ACK after commit, pending ambiguity and late commit, concurrent intent winner/loser, current actor invalidation, missing bytes Undo/Restore, and native UI partial attachment retry. No remote bucket/database or deployment is created.
