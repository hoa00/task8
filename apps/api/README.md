# Backend local D1/R2

Đọc [AGENTS.md](AGENTS.md), [chuẩn backend](../../docs/engineering/BACKEND_STANDARDS.md), [kế hoạch refactor](../../docs/engineering/BACKEND_REFACTOR_PLAN.md) và [PROGRESS](../../docs/poc/PROGRESS.md) trước khi sửa. Contract/schema trong `@studio/contracts/api` quyết định input/output, status/error, limits và semantics. Trạng thái nghiệm thu mới nhất nằm trong PROGRESS/evidence; lịch sử WU không chứng minh code mới đã PASS.

## Owners và dependency direction

`src/app.ts` compose repository/storage/middleware/error/routes; `src/index.ts` export production app. Một request đi qua HTTP route → application use-case → pure domain/policy và typed persistence/storage → pure DTO mapper. Application không nhận Hono context hoặc raw binding; domain/mapper không query DB. Cross-feature imports chỉ qua public entry dưới đây, không deep-import implementation.

| Owner | Trách nhiệm | Public entries dưới `src/modules` |
| --- | --- | --- |
| workspaces | Workspace DTO/update, trusted workspace date, workspace selection | `workspaces/index.ts`, `projections.ts`, `routes.ts` |
| members | Principal/membership, directory/profile và summary | `members/index.ts`, `projections.ts`, `routes.ts` |
| teams | Team administration, CAS/Undo và workload summary | `teams/index.ts`, `projections.ts`, `routes.ts` |
| projects | Access/lifecycle, catalogue/detail/summary, copy/template, personal order/favorites/saved views | `projects/index.ts`, `access.ts`, `projections.ts`, `routes.ts`, `personal-routes.ts` |
| tasks | Task reads/commands, ordering/bulk/recurrence, subtasks/promotion và task Undo | `tasks/index.ts`, `aggregate.ts`, `projections.ts`, `routes.ts`, `subtask-routes.ts` |
| comments | Comments/reactions, parent authorization và comment Undo | `comments/index.ts`, `projections.ts`, `routes.ts` |
| activity | Scoped history feed và current parent/actor visibility | `activity/index.ts`, `routes.ts` |
| notifications | Recipient/current-parent list, unread counts và same-batch read state | `notifications/index.ts`, `visibility.ts`, `routes.ts` |
| preferences | Personal preference documents, merge supplied keys | `preferences/index.ts`, `routes.ts` |
| files | File metadata/bytes commands, CAS/Undo, scoped projections và outcome handling | `files/index.ts`, `plans.ts`, `projections.ts`, `routes.ts` |
| projections | Bootstrap/Home/Overview/search/calendar/archive SQL reads và selected-ID hydration | `projections/index.ts`, `routes.ts` |
| undo | Exhaustive dispatch cho 11 supported kinds, owned handlers và current replay authorization | `undo/index.ts`, `routes.ts` |

`index.ts` là operation API; `projections.ts` là named read/mapper surface; `projects/access.ts`, `tasks/aggregate.ts` và `files/plans.ts` là finite policy/command fragments có consumer thực. Public facade vẫn giữ layer của symbol được export: persistence không thể gọi application qua facade. Import guard kiểm tra layer, public entry, primitives, cycles, external/dynamic/frontend imports và reject flat compatibility module. Legacy allowlist hiện có **0 entries/0 cycles**.

HTTP parsing/errors/correlation/capabilities thuộc `src/http`; principal middleware ở `src/middleware.ts`. Cursor codec và page finalization thuộc `src/shared`, còn normalization/comparator/query thuộc owner. `src/db/client.ts` sở hữu native/Drizzle execution và accounting; không export raw binding/client. `src/storage/r2.ts` là typed R2 adapter được composition inject vào request. Clock/UUIDv7 inject vào commands, request không giữ mutable singleton state.

## Invariants khi mở rộng

Giữ final SQL access/version/lifecycle/exact-set guards cùng fresh marker và mọi effects/final result trong một native D1 batch. SQL zero-row không tự rollback. Multi-root plans không được commit từng item hoặc dùng first page thay complete graph/column set. Limits hiện hành: 50 statements/request, 100 parameters/statement, 50 statements/batch trong remaining budget, bulk20, Undo128 targets/65536 UTF-8 bytes, upload10MiB. Copy/order/recurrence scope bounds giữ theo DATA_MODEL/contract.

Private view khác edit grant; Owner không có bypass. Trusted active principal khác nonremoved invited assignee. Default active reads, detail, archive và restore có lifecycle modes rõ. Child reads/search/counts luôn kiểm canonical current parent/workspace. PATCH omitted giữ field, null xóa; date-only khác UTC instant. Single completion Undo giữ recurrence successor/history theo contract; exact-set/ABA/actor-owned restore và replay reauthorization vẫn bắt buộc.

File application phân biệt confirmed winner/loser/rollback và unconfirmed outcome. Mỗi upload/copy attempt sở hữu object key riêng; unknown acknowledgement hoặc negative read không authorize cleanup winning bytes. Tombstone giữ bytes; Undo/restore kiểm object. Sample metadata không có original bytes. Không có purge/reconciler/queue hoặc chung transaction D1/R2.

## SQL reads và migration

Task/project/member/file/comment/activity/notification pages dùng scoped SQL filters/count/keyset/LIMIT+1; full totals không lấy từ page. Search dùng literal matching và category totals trước pagination, hydrate chỉ selected IDs qua owned mappers. Archive task primary DESC/ID ASC, project insertion rank và nondeleted archived-child summaries giữ canonical behavior. Project/member/team statistics dùng scoped/grouped aggregate. Home myTasks/deadlines/projects và Overview projects trả complete selected set, recent activity có full total; command taskDataset giữ complete planning scope.

SQLite BINARY/NOCASE/lower không tương đương comparator Unicode canonical. [Thiết kế SQL/text](../../docs/engineering/BACKEND_SQL_READ_DESIGN.md) và [encoder provenance/reproduction](tooling/collation/README.md) ghi pinned ICU4C78.2 Chromium en-US Wasm, riêng UTF16/fold keys và Workerd/D1 surrogate behavior. SQL sorting/search có thể cần scoped scans/temp sorting; không có promise mọi query constant-cost. Native two-workspace reports ghi actual rows returned/read/plans và full DTO parity.

Wrangler là applied-migrations ledger duy nhất; Drizzle chỉ generate reviewable SQL/metadata. Forward0001 thêm derived readKeys,0002 thêm scoped indexes;0000 immutable. Với **storage đã có dữ liệu**, apply migrations rồi backfill:

```sh
pnpm --filter @studio/api db:migrate:local
pnpm --filter @studio/api db:backfill:local --persist-to /absolute/path/to/storage
```

Backfill chỉ đổi derived fields bằng bounded source-byte CAS; rerun idempotent, giữ mutations/ledger. Missing key version trả internal read failure cho đến khi backfill xong, không fallback full-load. Seed provisioning owner ở `scripts/fixture.ts`/`seed-data.mjs` dùng locked source JSON/ID map; production runtime không import fixture. Seed giữ visible keys/content, positions `order*100` và sequence max(200,seed number); `ON CONFLICT DO NOTHING` giữ mutations.

## Commands hiện hành

Node24.13.0/pnpm11.19.0; dùng `pnpm install --frozen-lockfile`, build dependencies sau cài. Cài Chromium bằng `pnpm exec playwright install chromium` trong môi trường có Linux libraries tương ứng. Từ root:

```sh
pnpm build
pnpm --filter @studio/api db:migrate:local
pnpm --filter @studio/api db:seed:local
pnpm --filter @studio/api dev
```

Wrangler local dùng placeholder DB ID, storage mặc định `apps/api/.wrangler/state`; restart giữ D1/R2. Seed nhận optional `--persist-to PATH`, luôn local. `db:reset:local` xóa default local D1 storage một cách explicit; không dùng để upgrade/preservation. Principal lấy `STUDIO_ENV`, `LOCAL_USER_ID`, `LOCAL_WORKSPACE_ID` từ trusted server config; missing/malformed/invited/removed/nonlocal trả401. Browser identity headers không chọn actor. Named future operations501, unknown route404. Dry-run build không deploy.

```sh
pnpm --filter @studio/api format:check
pnpm --filter @studio/api typecheck
pnpm --filter @studio/api lint
pnpm --filter @studio/api test:unit
pnpm --filter @studio/api test:integration
pnpm --filter @studio/api test:integration --feature tasks
pnpm --filter @studio/api test
pnpm typecheck
pnpm lint
pnpm contracts:consumers
pnpm build
pnpm test
```

Root `pnpm test` qua Turbo build dependencies, chạy API và truyền lỗi API lên root. Native suites chạy serial; `--feature` nhận một tên trong bảng:

| Feature | Active suite trong `tests/integration` | Evidence |
| --- | --- | --- |
| db | `db.mjs` | Native/Drizzle budgets/accounting, typed boundary/policy parity |
| http | `http.mjs` | Request/response/errors/correlation và cursor anchor mutation |
| core | `core.mjs` | Workspace/profile/project/member/team, policy/CAS/Undo/restart |
| tasks | `tasks.mjs` | Ordering/recurrence/bulk/idempotency/native rollback/Undo |
| collaboration | `collaboration.mjs` | Subtasks/promotion/comments/reactions/activity/parent guards |
| projections | `projections.mjs` | Bootstrap/Home/Overview/search/calendar/archive/preferences/notifications; actual full-view HTTP consumer |
| files | `files.mjs` | Native R2+D1 outcomes/checksum/replay và Chromium TaskForm partial retry |
| collation-encoder | `collation-encoder.mjs` | Current Workerd locale/fold/UTF16/date corpus và D1 surrogate storage |
| read-keys-migration | `read-keys-migration.mjs` | Old ledger/mutations preservation, bounded backfill/rerun |
| reads | `reads.mjs` | Seven paged owners, full DTO/count/Unicode/traversal/anchor/plan parity |
| projection-reads | `projection-reads.mjs` | Search/category totals/archive rank/child summaries/literal Unicode/full traversal/plans |

Active Workers import current production app. `tests/support/native-fault-worker.ts` sở hữu shared native SQL/batch injectors; `files.worker.ts` sở hữu R2 fault control; readonly complete-set oracle SQL chỉ ở `tests/support/read-oracle-sql.ts`. Không có API implementation fork hoặc mock DB thay native proof. Unit Node loader dùng đúng production Wasm. Typecheck bao gồm active Workers/support và provisioning TS; frozen WU entries không thuộc active dependency graph.

Harness cấp unique run/output/storage, ephemeral HTTP+inspector ports, cleanup đúng owned process group và giữ exitCode/signal thật. Artifacts ở `test-results/api/<feature>-<unique>` hoặc `API_TEST_OUTPUT_DIR`; owned storage giữ để điều tra. Local Node requests đóng socket sau mỗi response để CLI/build đồng bộ không tái dùng keepalive quá hạn; không retry mutations. Native browser preview proxy tới đúng Worker; test English preference không đổi locale sản phẩm. Routine runs không ghi vào historical evidence hoặc reset user storage.

Prettier3.6.2 pin tại API; formatter/lint bao phủ active backend/scripts/tooling, loại generated/migrations/historical WU. Root lint kiểm toàn repo. Negative import/layer/cycle fixtures nằm trong unit suite. Gate self-check chạy độc lập, không đồng thời với formatter/typecheck/tests:

```sh
node apps/api/tooling/verify-gates.mjs
```

Lệnh này chứng minh active Worker type error và API failure làm root test fail, rồi cleanup probes trong finally. `verify-format.mjs BASELINE_SHA` là verifier lịch sử cho formatter-only diff; không áp dụng cho refactor runtime đã đổi AST/paths.

## Workflow cho một feature

1. Đọc standards/contract/schema/progress, xác định owner và operation/invariants/input/output.
2. Mở rộng use-case/policy/query/mapper hiện hữu; cross-feature chỉ qua named public surface. Pure shared helper chỉ khi có consumer thực.
3. Route parse/serialize; application điều phối; adapter giữ scoped SQL/guarded batch/storage outcomes; mapper thuần validate projection.
4. Chọn regression theo trigger/risk: pure rule → unit; HTTP schema/error → app boundary; SQL/CAS/Undo/R2 → actual native bindings. Giữ counts/privacy/full previews và cursor directions.
5. Chạy gates liên quan, review migration/fixture/evidence scope, cập nhật PROGRESS/README và commit/push theo AGENTS.

## Evidence lịch sử

[BR evidence](../../docs/engineering/evidence), [WU progress](../../docs/poc/PROGRESS.md), [API contract](../../docs/poc/API_CONTRACT.md), [DATA_MODEL](../../docs/poc/DATA_MODEL.md) và [BACKEND_SCOPE](../../docs/poc/BACKEND_SCOPE.md) giữ quyết định/acceptance đã chốt. `tests/runtime`, `tests/wu31`…`wu36` và POC evidence là archived sources tại SHA tương ứng; một số imports/commands cũ không còn tồn tại ở runtime hiện hành. Muốn tái tạo lịch sử dùng checkout SHA ghi trong report, không thêm compatibility wrapper trở lại hoặc overwrite evidence. Npm WU test aliases đã gỡ; dùng active runner cho code hiện tại.

Không suy ra production deploy/full visual/new capability từ native local PASS. Các visual/environment/scope limits lịch sử và capability chưa triển khai vẫn theo PROGRESS/BACKEND_SCOPE.
