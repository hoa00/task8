# Chuẩn backend bắt buộc

Ngày xác lập: **12/10/2026**. Phạm vi: `apps/api`, các thay đổi backend liên quan trong `packages/contracts`, `packages/domain`, migrations, tests và tooling.

**POC giới hạn tính năng, không giảm chất lượng kiến trúc, code, dữ liệu hoặc kiểm thử.** Một tính năng đã triển khai phải có cấu trúc cho phép mở rộng, sửa lỗi và kiểm chứng mà không phải viết lại nền tảng.

Tài liệu này là yêu cầu cho code mới và phần code được sửa, không phải tuyên bố code hiện tại đã đạt chuẩn. Lộ trình chuyển code hiện có nằm trong [BACKEND_REFACTOR_PLAN.md](BACKEND_REFACTOR_PLAN.md). Trạng thái triển khai từng phase được ghi trong kế hoạch và PROGRESS; tooling BR-01 không đồng nghĩa các feature owners đã chuyển sang kiến trúc đích.

## 1. Nguồn chuẩn và cách áp dụng

Đọc [AGENTS.md](../../AGENTS.md), [apps/api/AGENTS.md](../../apps/api/AGENTS.md), [PROGRESS.md](../poc/PROGRESS.md), tài liệu này và read-set của nhiệm vụ trước khi sửa.

| Nội dung | Nguồn chuẩn |
| --- | --- |
| Phạm vi và chỉ dẫn trực tiếp | Yêu cầu hiện tại của Hòa và AGENTS |
| Operation, DTO, lỗi, filter/sort | [API_CONTRACT.md](../poc/API_CONTRACT.md) và schema thực trong `packages/contracts` |
| Persistence, lifecycle, concurrency, Undo, limits | [DATA_MODEL.md](../poc/DATA_MODEL.md), decisions hiện hành và migrations đã áp dụng |
| Capability và dịch vụ đang có | [BACKEND_SCOPE.md](../poc/BACKEND_SCOPE.md) và capability manifest thực |
| Cấu trúc code và workflow bảo trì | Tài liệu này |
| Thứ tự refactor và các khoản nợ hiện tại | [BACKEND_REFACTOR_PLAN.md](BACKEND_REFACTOR_PLAN.md) |
| Bằng chứng đã chạy | PROGRESS, command result và artifact thực |

Nếu code và tài liệu khác nhau, xác định hành vi canonical bằng contract/decision/test hiện hành, ghi rõ conflict và sửa trong phạm vi được giao. Không tự đổi semantics để dễ refactor hoặc lấy lỗi hiện tại làm chuẩn mới.

Code mới và phần sửa tuân thủ ngay các quy tắc dưới đây. Phần legacy chưa chuyển được ghi bằng đường dẫn và phase chịu trách nhiệm; không tạo thêm code theo mẫu legacy. Một bug fix nhỏ không buộc chuyển toàn bộ module trước: sửa đúng boundary liên quan, giữ phạm vi hữu hạn và ghi phần còn lại.

Thay đổi cấu trúc và thay đổi hành vi được tách thành commit hoặc bước nghiệm thu riêng. Việc sửa error classification/cursor phải có test thể hiện lỗi trước và kết quả sau. Không tự triển khai phase tiếp theo chỉ vì phase hiện tại hoàn tất.

## 2. BE-01 — Module và dependency direction

Giữ một ứng dụng Hono Worker chia theo nghiệp vụ, cùng pnpm/Turborepo, TypeScript strict, Drizzle/D1 và R2. Không đổi stack hoặc thêm DI container, generic CRUD framework, message bus hay package mới chỉ để gom vài file.

Luồng chuẩn:

1. HTTP route đọc request đã xác thực và workspace context.
2. Application use-case điều phối một thao tác nghiệp vụ hoặc một read query.
3. Domain/policy thuần tính quyết định từ dữ liệu đầu vào.
4. Persistence adapter thực thi scoped queries hoặc guarded D1 batch.
5. Mapper chuyển projection thành DTO; HTTP boundary xác thực response.

| Thành phần | Được phụ thuộc | Không được phụ thuộc |
| --- | --- | --- |
| Routes/middleware | Hono, HTTP helpers, contracts, application public entry | Tự dựng SQL, thực hiện business writes hoặc gọi R2 trực tiếp |
| Application | Contracts, domain, policy, mapper, typed persistence/storage dependencies | Hono Context/Request/Response, frontend, truy cập trực tiếp env binding |
| Domain/policy thuần | Kiểu nghiệp vụ, pure helpers, contracts nếu cần | Drizzle row types, D1/R2, Hono, network/storage, clock/random global |
| Persistence/storage adapters | Drizzle/D1/R2, module internal models, predicate/command primitives | Hono request parsing, frontend, tự quyết định UX |
| Mappers | Typed read projections, contracts, pure date helpers | Query DB/R2 hoặc thực hiện mutation |
| Shared HTTP/DB primitives | Contracts và dependency của chính adapter | Import module nghiệp vụ để tránh dependency cycle |
| packages/contracts | Zod và types/schema canonical | Hono, Drizzle, React hoặc app implementation |
| packages/domain | Contracts và dependency thuần đã cho phép | App implementation, DB rows, Hono, React/DOM/storage/network |

Nghiệp vụ thuần chỉ có backend consumer nằm trong domain nội bộ module. Chỉ đưa vào `packages/domain` khi cần chia sẻ semantics thực sự với mock/web hoặc có consumer chung rõ ràng; không dùng package này làm kho mọi service.

Module khác chỉ import public entry được liệt kê của module chủ sở hữu. Không deep-import mapper/repository/use-case nội bộ của module khác. Read projection cho dashboard/search có chủ sở hữu rõ, được dùng scoped predicate public và SQL read-only; không gọi route nội bộ hoặc copy policy.

Các command cần cập nhật chéo task/file/activity/Undo phải có một owner điều phối và tạo một batch. Module liên quan cung cấp typed plan fragments; không tự commit fragment riêng.

Giữ module nhỏ ở dạng phẳng khi phù hợp. Chỉ tạo thư mục application/domain/persistence cho module đủ phức tạp. Không tạo file/interface/base class nếu chưa có trách nhiệm hoặc consumer cụ thể.

**Gate:** import check phát hiện chiều sai, deep import và cycles; có negative fixtures chứng minh rule thực sự reject. Legacy allowlist chỉ chứa đường dẫn cụ thể, có phase gỡ bỏ; cấm wildcard miễn kiểm tra.

## 3. BE-02 — Dễ đọc, types và dependency injection

- Một câu lệnh trên một dòng; block có format rõ; SQL dài dùng multiline và tên fragment thể hiện intent. Không viết handler/use-case dồn thành một dòng.
- Formatter có config/version khóa trong repo và check command. Format phạm vi backend trong commit riêng; không format lại evidence, generated files, source tham chiếu hoặc toàn frontend.
- Tên biến/hàm nói rõ nghiệp vụ; dùng `repository`, `scope`, `task`, `expectedVersion` thay tên một ký tự trong luồng phức tạp. Callback ngắn cục bộ được dùng tên ngắn khi nghĩa rõ.
- Public input/output có tên và kiểu cụ thể. Dùng discriminated union cho các command plan khác nhau; không cho một object nhiều optional fields đại diện các trạng thái không hợp lệ.
- Không `any`, `as unknown as`, non-null assertion hoặc cast để che invariant chưa kiểm tra. SQL result casts bắt buộc có projection type cụ thể và kiểm tra shape tại mapper/adapter phù hợp.
- DB row types thuộc persistence. Domain model dùng canonical enum/date/entity types; không dùng `status: string` khi đã có TaskStatus.
- Inject clock và ID generator bằng object/function nhỏ; production adapter dùng server clock, crypto và UUIDv7. Không dùng global mutable test clock hoặc singleton chứa request state.
- Một command lấy `now` một lần và truyền cùng instant cho các hiệu ứng cần đồng nhất. Mỗi attempt vẫn có mutation marker mới; retry giữ logical request ID theo contract.
- Lỗi có type/code rõ và cause nội bộ khi cần. Không catch rồi trả success/default giả hoặc bỏ qua lỗi ghi.

Không dùng giới hạn số dòng file/hàm máy móc làm tiêu chí chất lượng. Tách khi có nhiều trách nhiệm hoặc nhiều lý do thay đổi.

**Gate:** formatter, lint, typecheck cả source và Worker test entries hiện hành; review không còn business state bất hợp lệ do optional fields/casts.

## 4. BE-03 — HTTP và xử lý lỗi đúng boundary

Route chỉ xác định operation, đọc path/query/body, parse request schema, gọi application và serialize response đúng status. Middleware chỉ resolve principal/workspace và các HTTP concerns.

Một HTTP helper sở hữu JSON/content-type, repeated query fields, number/boolean/null decoding và body restrictions. Các field/giới hạn cụ thể do schema operation quyết định; không có parser tự phát trong từng route.

Input parser chuyển lỗi Zod của request thành typed validation failure. Error handler không được biến mọi ZodError thành 400: lỗi DTO/read projection/Undo payload nội bộ là server error 500. Không trả thông tin SQL, stack hoặc giá trị nhạy cảm ra client.

Response phải được validate. Domain/mapper kiểm tra dữ liệu có thể kiểm tra trước commit ngay trước khi ghi; response-schema failure sau commit không được tuyên bố command đã rollback hoặc yêu cầu client tạo request ID mới.

Giữ method/path, success status, error code, fieldErrors được contract cho phép, 404/403 distinction và capability 501. Named unavailable operations không được tạo success giả.

Request body lớn phải có giới hạn thực trên stream/bytes ở HTTP adapter theo operation; không chỉ tin Content-Length. Giữ upload cap và multipart overhead hiện hành; không tự thay đổi limit của API.

Log lỗi tối thiểu có request ID, operation, error code/type, phase và duration phù hợp. Các field được allowlist; không log toàn request/body, file bytes, credential, profile email hoặc SQL parameters. Cause/stack chỉ ở server log đã được kiểm soát. Không cần dịch vụ observability mới để đạt yêu cầu này.

**Gate:** invalid input → đúng 4xx; invalid internal response → 500; log đủ tương quan và không lộ payload; valid requests/capabilities giữ nguyên contract.

## 5. BE-04 — Policy, scope và mapping một chủ sở hữu

Policy owner định nghĩa semantics đọc/ghi/lifecycle; persistence predicate cùng owner dùng semantics đó ở SQL. Quyết định thuần và điều kiện SQL phải được kiểm chứng bằng cùng permission matrix.

- Principal chỉ từ trusted server configuration theo identity mode hiện hành; client không chọn actor/role.
- Mọi child read/write, search, counts, activity, notifications và dependencies đều giữ workspace/project/lifecycle scope.
- Private view grant khác edit grant; Owner không có bypass tự phát.
- Invited assignee không đồng nghĩa invited principal được login. Giữ policy active principal/nonremoved assignee đã chốt.
- Detail, active list, archive và restore có lifecycle mode được đặt tên rõ; không truyền nhiều boolean dễ nhầm.
- Preflight hỗ trợ thông báo lỗi, final SQL guard mới bảo vệ quyền tại thời điểm ghi.

Mapper có một owner cho mỗi DTO/projection. Cùng DTO file/project/task được gọi từ list/detail/search/bootstrap bằng mapper chung; restricted DTO có mapper riêng theo allowlist. Các projection khác nhau chỉ dùng chung conversion tương ứng, không ép thành mapper đa năng nhiều boolean.

Mapper là hàm thuần: không query và không kiểm tra quyền bằng I/O. Query phải cung cấp dữ liệu đã scope; mapper không được lọc bớt một full-scope total rồi coi là tổng đúng.

**Gate:** quyền/DTO nhất quán ở mọi consumer; không lộ internal fields; null, ISO instant, date-only, label insertion sequence và restricted fields giữ đúng semantics.

## 6. BE-05 — D1 execution và guarded commands

Request DB execution adapter chịu trách nhiệm query budget, parameter budget, batch size, instrumentation và native execution. Không public binding/raw Drizzle client để caller quên reserve hoặc đi vòng kiểm tra. Drizzle và native prepared SQL đều qua execution paths có accounting nhất quán.

Mỗi batch có typed result và named guard/marker. Raw SQL được phép khi cần json_each, recursive relations hoặc exact-set guard; table/column identifiers chỉ từ allowlist nội bộ, dữ liệu luôn bind parameters.

Các bất biến bắt buộc:

1. Native D1 batch; không transaction callback/BEGIN/COMMIT tùy ý hoặc Promise.all cho command nguyên tử.
2. Final root guard có workspace, identity, quyền, lifecycle, expected versions và association/neighbor/graph conditions cần thiết.
3. Root marker mới cho mỗi attempt. Mọi sequence increment, child write, file association, activity, Undo và result selection đều được gate trong cùng batch.
4. UPDATE 0 row là no-op/conflict, không phải SQL rollback; không được để side effect xảy ra rồi mới kiểm tra changes.
5. Multi-root command kiểm tra toàn bộ expected set trước khi bật writes; không commit từng item.
6. Sequence cấp trong SQL cùng batch. Dependency cycle và exact association set kiểm tra lại ở final boundary.
7. Actual final postVersions cho Undo lấy bằng SQL sau các domain writes trong cùng batch.
8. Command vượt limit trả lỗi trước effects; không chia thành nhiều commit rồi gọi là atomic.

Giới hạn hiện tại theo contract/DATA_MODEL/manifest và implementation: 50 statements/request, 100 parameters/statement, 50 batch statements với remaining budget, bulk 20, Undo 128 targets/65536 UTF-8 bytes, upload 10 MiB. Các bound copy/children/resequence hiện hành vẫn giữ. Không phân tán magic numbers mới hoặc tự tăng giới hạn để test pass.

**Gate:** actual local D1 tests cho zero-row guard, native SQL failure, permission race, exact-set change, sequence allocation và zero partial effects. Fake repository không thay được các gate này.

## 7. BE-06 — Pagination, queries và chi phí đọc

Cursor codec/fingerprint dùng chung; query normalization và comparator thuộc operation/feature. Encode/decode dùng format canonical, loại cursor khỏi fingerprint và xử lý limit theo contract. Cursor phải gắn workspace/member/scope/filter/sort, không tái dùng cho query khác.

Continuation so sánh sort tuple và ID, không yêu cầu anchor row vẫn tồn tại. Direction của giá trị chính và ID tie-break phải khớp comparator của từng feed: task ID tăng dần kể cả sort desc; các history feeds giữ direction đã chốt. Không gộp mọi feed vào một comparator mặc định làm đổi order.

SQL ORDER BY, seek predicate, null sentinel, normalized text, computed sort value và cursor comparator phải đồng nhất. SQLite collation/lower/LIKE không mặc nhiên tương đương JS comparator/toLowerCase/includes: kiểm chứng Unicode, literal %, _, escape và tie/null cases trước khi chuyển.

List endpoints dùng SQL filtering/ordering/keyset pagination và LIMIT theo scope. Counts/group summaries là aggregate trên toàn authorized predicate, không LIMIT; response tổng không dựa vào rows của trang.

Không tải toàn workspace để lấy một page. Existing full-load reads là migration debt của BR-07, không là mẫu cho endpoint mới. Nếu một query hiện hành chưa chuyển được mà vẫn bảo toàn contract, ghi path, lý do, chi phí/row bound và bước giải quyết cụ thể; không thêm fallback full-load âm thầm hoặc trả dữ liệu bị cắt như complete.

Command planning cần graph/neighbor/association đầy đủ phải có scope và bound rõ theo semantics nguyên tử, khác paged reads. Không dùng first page để kiểm tra cycle/exact column hoặc thực hiện bulk.

Home/read models có contract full preview phải trả đủ selected set hoặc lỗi theo contract; không tự thêm preview LIMIT. Reuse scoped projections và aggregate, tránh N+1 hoặc lặp tải dataset chỉ để tính summary.

**Gate:** parity với domain/mock, multi-page traversal, anchor bị remove/restore/read/update, cross-scope cursor rejection, aggregate đúng; đo rows returned/read và query plan cho endpoint được chuyển, không chỉ số statement.

## 8. BE-07 — Lifecycle, idempotency và Undo

Giữ nguyên null/omitted PATCH, date-only vs instant, UUIDv7, key allocation, task identity khi move, recurrence và các khác biệt completion/status PATCH/bulk đã chốt.

Logical request key/hash độc lập mutation marker. Retry cùng intent trả kết quả đã được reauthorize; changed intent/moved lifecycle xử lý đúng conflict. Không mở rộng idempotency tự phát cho operation chưa có contract.

Undo là bounded inverse theo whitelist, owner và actual postconditions; không workspace snapshot rollback hay generalized event-sourcing journal. Retry consumed record vẫn kiểm tra current quyền/lifecycle theo semantics hiện hành; consumption/result trong cùng batch.

Registry/discriminated handlers có dispatch exhaustive cho kinds đã hỗ trợ. Mỗi handler chịu payload version/shape, authorize, plan inverse và commit theo cùng primitives; không đổi inverse fields hoặc xóa child/reference mới chỉ để Undo dễ chạy.

Single recurring completion Undo giữ successor/history theo contract; column inverse chỉ cancel successor chưa bị thay đổi, với child/label/dependency/incoming-reference guards. Giữ ABA protection và actor-owned restore.

**Gate:** replay, changed intent, stale/ABA/lifecycle/permission conflicts, one-shot consumption, recurring successors và child reference changes.

## 9. BE-08 — R2/D1 outcome và file boundaries

Application điều phối file intent; R2 adapter sở hữu head/get/put/delete và object metadata; HTTP adapter sở hữu multipart và download headers/stream. Typed storage dependency phục vụ test; không giả vờ D1/R2 có chung transaction.

Phân biệt confirmed success, confirmed rollback/loser và unconfirmed outcome. Mỗi upload/copy attempt có owned object key riêng; chỉ cleanup object được chứng minh không phải committed winner. Timeout/negative read không chứng minh rollback.

Giữ request intent/hash, current authorization, winner identity, checksum, parent/file postVersions và partial-failure semantics. Tombstone giữ bytes; restore/Undo xác minh object; sample metadata không được coi có original bytes.

Unconfirmed outcomes và cleanup failures phải trả lỗi đúng, giữ identity/log cần retry. Không tạo queue, purge, reconciler hoặc tuyên bố orphan-free trong refactor này. Các dịch vụ đó cần nhiệm vụ sản phẩm riêng.

**Gate:** actual local R2+D1 checksum, race winner, commit acknowledgement loss, confirmed native rollback, cleanup failure, missing bytes, reload và partial TaskForm retry.

## 10. BE-09 — Migrations và schema

Wrangler là applied-migrations ledger duy nhất; Drizzle sinh SQL/metadata để review. Không sửa migration đã áp dụng, không schema push/parallel migrator, không tạo table trong request.

Refactor tổ chức code không được thay schema/fixture/ID map. Nếu query parity cần schema mới, lập một bước migration riêng có giải thích, test fresh DB và upgrade từ trạng thái cũ có mutations; không reset local DB người dùng.

Enum/type reuse không thay constraint đã chốt; scoped composite FKs, unique request keys, tombstone/check constraints và canonical sequence/order được giữ.

**Gate:** fresh migration, migration rerun và upgrade/preservation khi có schema change; dry-run build không phải deployment.

## 11. BE-10 — Kiểm thử và các lệnh nghiệm thu

Tổ chức active tests theo feature/behavior; lịch sử WU/evidence bất biến vẫn được giữ. Framework hiện có đủ dùng; không thêm test stack chỉ để đổi tên suite.

Ba mức có mục đích riêng:

- Unit: rule thuần/comparator/normalization/planner, clock/ID cố định; expected result độc lập, không copy implementation.
- HTTP integration: input/output/status, middleware, capability và policy trên app boundary.
- Native integration: actual Wrangler local D1/R2 cho atomicity, FK, concurrency, compensation; mock chỉ để điều khiển unit scenarios.

Sửa bug phải có regression cho trigger cụ thể. Sửa SQL/mutation/policy phải chạy native scenarios liên quan và snapshot zero effects khi failure. Test cross-feature khi command thay dependency/files/activity/projections; không chỉ happy path.

Các lệnh chuẩn dưới đây được hiện thực ở BR-01; package.json và [API README](../../apps/api/README.md) là nguồn command usage hiện hành:

| Lệnh hiện hành | Trách nhiệm |
| --- | --- |
| pnpm --filter @studio/api test:unit | Các unit tests hiện hành |
| pnpm --filter @studio/api test:integration | Active HTTP và native D1/R2 suites |
| pnpm --filter @studio/api test | Tổng hợp unit + integration; root pnpm test không bỏ qua API |
| pnpm --filter @studio/api format:check | Kiểm tra format backend đã khóa |
| pnpm --filter @studio/api lint | Lint backend và import boundaries theo owner |
| pnpm --filter @studio/api typecheck | Cả source và active test Worker entries |

Integration harness nhận output/storage/port có owner, cleanup trong finally kể cả startup timeout, giữ exitCode/signal thật. Chạy riêng port/storage cho mỗi suite hoặc chạy serial rõ ràng; không dừng process không thuộc test.

Routine artifacts ra test-results hoặc /tmp có unique run ID; acceptance evidence lưu theo PROGRESS với executed input và command thực. Không sửa/xóa/ghi đè historical acceptance evidence hoặc tạo bản code fork duy trì riêng trong test.

Không hạ assertion, sửa baseline, tăng tolerance, dùng outdated capability test hoặc mock SQLite để giả chứng minh native pass. Missing dependency/environment là NOT_RUN/BLOCKED, không PASS.

## 12. BE-11 — Definition of Done cho mọi thay đổi backend

Trước khi báo hoàn tất:

1. Nêu operation/module bị ảnh hưởng, contract và invariant phải giữ, owner của code mới.
2. Code mới/phần sửa tuân thủ BE-01…10; legacy còn lại có đường dẫn/phase cụ thể.
3. Format/lint/typecheck/import gates liên quan đạt; tests theo risk matrix của kế hoạch đạt bằng actual command.
4. DTO, error/status, permission, cursor/count, idempotency/Undo/R2 và frontend invalidation giữ đúng semantics chịu ảnh hưởng.
5. Migrations/fixtures/lockfile chỉ thay khi nằm trong scope; không vô tình thay source/evidence/generated files.
6. Public module docs, command usage và PROGRESS cập nhật; ghi NOT_RUN và blocker thật nếu chưa đủ.
7. Report changed files, results/evidence, decisions/conflicts, commit/push thật theo AGENTS. Không báo DONE cho code phase thiếu gate.

Thay đổi docs-only cần kiểm tra links, tính nhất quán nguồn chuẩn, phạm vi diff và git diff --check; không cần chạy lại visual/native runtime không bị tác động. Docs hoàn tất không đồng nghĩa runtime refactor hoàn tất.

## 13. BE-12 — Thêm tính năng và sửa lỗi sau refactor

Mỗi AI coder thực hiện tuần tự:

1. Đọc read-set bắt buộc, code hiện tại và trạng thái phase; xác định feature owner.
2. Tìm use-case/policy/mapper/query gần nhất để mở rộng; không copy một phiên bản khác.
3. Chốt invariant và trigger test. Với feature mới, cập nhật contract/capability/migration chỉ khi yêu cầu thực sự cần.
4. Đưa kế hoạch 3–7 bước, sửa đúng scope ngay; không tự gom thêm phase backlog.
5. Kiểm chứng unit/HTTP/native theo tác động, review dependency direction và partial-effect safety.
6. Cập nhật docs/PROGRESS, báo kết quả có evidence và dừng tại nhiệm vụ được giao.

Checklist này áp dụng cả khi POC đã DONE. Không viện lý do “POC”, “chỉ demo”, “đang gấp” hoặc “code cũ cũng vậy” để bỏ quality gates.
