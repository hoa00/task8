# Kế hoạch điều chỉnh backend để phát triển lâu dài

Ngày lập: **12/10/2026**. Chuẩn bắt buộc: [BACKEND_STANDARDS.md](BACKEND_STANDARDS.md).

**Mục tiêu:** code của các tính năng đã có phải đạt chất lượng để tiếp tục bổ sung/sửa chữa; phạm vi POC chỉ giới hạn tính năng. Tài liệu gốc đã có yêu cầu này trong [AGENTS.md](../../AGENTS.md), [ARCHITECTURE.md](../poc/ARCHITECTURE.md) và [BACKEND_SCOPE.md](../poc/BACKEND_SCOPE.md). Kế hoạch này cụ thể hóa cách khắc phục các khoảng cách trong implementation.

Phạm vi phiên lập kế hoạch là docs và chỉ dẫn AI coder. **BR-00 hoàn tất tài liệu; BR-01 DONE_TOOLING (baseline/active tests/guardrails/format); BR-02 DONE; BR-03…BR-08 chưa triển khai.** Không mở lại hoặc thay đổi kết quả nghiệm thu lịch sử WU-00…36, không tự bắt đầu code phase tiếp theo.

## 1. Baseline và hiệu chỉnh đề xuất review

Code được đọc tại commit `6c25611a3b0346635e2ba3df336a2de9d24b2edd` trước thay đổi tài liệu. Đây là baseline khảo sát, không phải commit refactor.

| Phát hiện đã đối chiếu code | Bằng chứng | Hành động |
| --- | --- | --- |
| Một file task gom nhiều use-case, plan và SQL batch | [tasks.ts](../../apps/api/src/modules/tasks.ts), đặc biệt execute/create/update/move/bulk | Tách theo trách nhiệm, giữ guarded batch |
| Route vẫn chứa query/aggregate/SQL | [features.ts](../../apps/api/src/modules/features.ts), [task-routes.ts](../../apps/api/src/modules/task-routes.ts), [file-routes.ts](../../apps/api/src/modules/file-routes.ts) | Route mỏng; HTTP adapter + application owner |
| Request parser lặp, limit decoding khác nhau | task/file/collaboration/projection routes và features | Shared parsing mechanism + operation schemas |
| Mọi ZodError thành 400 kể cả mapper/response lỗi | [errors.ts tại baseline](https://github.com/hoa00/task8/blob/6c25611a3b0346635e2ba3df336a2de9d24b2edd/apps/api/src/errors.ts) | Phân biệt input validation và server failure |
| Project/member cursor cần anchor vẫn tồn tại với sort value cũ | [shared.ts](../../apps/api/src/modules/shared.ts), helper page | Tuple continuation, preserve query binding/order |
| List task/file/comment/notification và search full-load rồi slice/filter | [task-read.ts](../../apps/api/src/modules/task-read.ts), files/comments/notifications/projections | Scoped SQL reads, keyset, aggregate và parity tests |
| RequestRepository public db/binding, reserve thủ công cho Drizzle | [repository.ts](../../apps/api/src/db/repository.ts), middleware/bootstrap/routes | Một execution/accounting boundary cho mọi query |
| Project/File DTO được dựng lại nhiều nơi; write policy nằm ở read-model | bootstrap/read-model/task-read/projections/files | Mapper và policy có một owner |
| API chưa có script test cho Turbo/root; regression chủ yếu theo WU | [package.json](../../apps/api/package.json), [regression.mjs](../../apps/api/tests/wu36/regression.mjs) | Active feature suites và command tổng hợp |
| API tsconfig chỉ include runtime test Worker trực tiếp | [tsconfig.json](../../apps/api/tsconfig.json) | Include/typecheck toàn active test entries |
| Format dồn gây diff khó review | 38 source files, 402 dòng >200 ký tự, 66 dòng >500 ký tự tại baseline | Formatter khóa version, format-only commit |
| Existing import guard tập trung packages, chưa bảo vệ nội bộ API | [boundaries.mjs](../../tests/workspace/boundaries.mjs) | API import matrix, cycle/deep-import negative checks |

Review trước xác nhận cú pháp 38 file, chưa chạy được lint/typecheck do dependencies chưa đầy đủ và pnpm lỗi store. **Không suy ra runtime PASS từ syntax hoặc evidence của commit cũ.** BR-01 phải establish baseline bằng command thật trong môi trường đúng Node/pnpm.

Điều chỉnh so với đề xuất ban đầu:

- Chất lượng kiến trúc là yêu cầu hiện tại; không chờ đến khi mở rộng tính năng mới bắt đầu tổ chức đúng.
- Chỉ pure semantics thực sự dùng chung vào packages/domain; backend-specific rules có domain nội bộ module.
- Shared cursor codec không có nghĩa mọi feed dùng cùng comparator/direction.
- SQL optimization phải chứng minh tương đương JS/domain/mock; không thay collation/text/null/date/order bằng mặc định SQLite.
- Giữ raw SQL khi cần D1 guards/json_each/recursive graph; tránh generic repository/transaction framework che mất atomicity.
- Baseline/regression và guardrails được thiết lập trước refactor lớn. Formatter có bước/commit riêng; correctness fixes có regression riêng.

## 2. Phạm vi và các bất biến

Giữ Hono Worker, pnpm/Turborepo, TypeScript strict, contracts/domain, Drizzle/D1 và R2 local. Không thêm tính năng, auth provider, invitation/email, realtime, deployment, CI/CD, queue, generalized journal hoặc storage purge.

Các bất biến phải có bằng chứng trước/sau:

1. Method/path/DTO/status/error/capability và frontend invalidation semantics của operations đang có.
2. Trusted principal, active membership, private view/edit grants, child privacy và owner/no-bypass policy.
3. Date-only/UTC instant, omitted/null PATCH, label sequence, task sort/tie/null semantics.
4. UUIDv7, sequence/key uniqueness, request key/hash, retry và current authorized result.
5. Native D1 final guards/marker, SQL0 no-op, native rollback, exact-set/graph/neighbor guard và zero partial effects.
6. Actual final Undo postVersions, bounds, one-shot replay, ABA, recurring successor/child/reference rules.
7. R2 owned attempt/winner/checksum, confirmed vs unconfirmed commit, compensation và partial file retry.
8. Migration ledger, fixture/ID mapping, existing schema constraints và persisted mutations.

Error classification và cursor anchor behavior được sửa có chủ đích ở BR-02; không đổi các invariants khác hoặc schema cursor công khai. Nếu phát hiện thay đổi contract thực sự cần, nêu trigger và impact, ghi decision và cập nhật consumers/tests trong scope trước khi triển khai.

## 3. Kiến trúc đích và ownership

Sơ đồ thư mục là target cho các trách nhiệm đã có, không yêu cầu tạo mọi thư mục/file cho module nhỏ:

```text
apps/api/
  AGENTS.md
  src/
    index.ts                       # export Worker app
    app.ts                         # compose routes/middleware/dependencies
    runtime.ts                     # bindings và request context types
    http/
      request.ts                   # parsing mechanism
      error-handler.ts
      middleware/
    shared/
      errors.ts                    # typed errors, không Hono
      cursor.ts                    # codec/fingerprint, không default business sort
      clock.ts
      ids.ts
    db/
      client.ts                    # request execution + budgets
      commands.ts                  # guarded batch primitives
      schema.ts
      migrations/
    storage/
      r2.ts                        # R2 adapter
    modules/
      tasks/
        index.ts                   # explicit public entry
        routes.ts
        application/
          queries.ts
          create-task.ts
          update-task.ts
          complete-task.ts
          move-task.ts
          bulk-tasks.ts
        domain/
          model.ts
          completion.ts
        persistence/
          reads.ts
          commands.ts
        mapper.ts
      projects/
      workspaces/
      members/
      teams/
      comments/
      activity/
      notifications/
      preferences/
      files/
      projections/
      undo/
  tests/
    unit/
    integration/
    support/
    runtime/                       # historical compatibility khi còn cần
    wu31/ ... wu36/                # lịch sử giữ nguyên
```

| Owner đích | Code hiện tại cần chuyển/hợp nhất | Boundary public cần có |
| --- | --- | --- |
| tasks | tasks/task-read/task-relations/task-children/task-undo/task-routes | routes; scoped task read/planning dependencies cần consumer thật; task Undo handler |
| projects | projects/project-personal/saved-views và project phần features/read-model/bootstrap | routes; named read/write access predicates; scoped catalog/projection; project Undo handler |
| workspaces/members/teams | workspace/teams, profile/member/team phần features và middleware liên quan | application reads/commands, permission semantics rõ |
| comments/activity/notifications | comments/activity/notifications/collaboration-routes | routes/read projections; comment Undo handler; notification predicate dùng cho Bootstrap |
| preferences | member-settings và preference phần projection-routes | current-member scoped reads/commands |
| files + storage/r2 | files/file-routes, file mapping ở task-read/projections | file application API/plan fragments/Undo; typed R2 adapter |
| projections | bootstrap/projections, home/overview/search/calendar/archive | composition/read-only queries; không là owner của task/project mutations |
| undo | undo-command và dispatch tới handlers nghiệp vụ | exhaustive registry; handlers public của module, không deep-import |
| HTTP/shared/DB | errors/middleware/routes/shared/db repository/commands/guards | primitives không import ngược business modules |

Các `index.ts` chỉ export public surfaces cần thiết, không export mọi file hoặc dùng barrel che cycle. Public query/policy có input/output named types và scope rõ. Read projections được phép join nhiều bảng, nhưng chỉ write owner được điều phối command chéo và commit một batch.

## 4. Trình tự phase và trạng thái

| Phase | Prerequisite | Deliverable | Trạng thái |
| --- | --- | --- | --- |
| BR-00 | Review + chỉ dẫn của Hòa | Chuẩn, kế hoạch, AGENTS và doc links | DONE_DOCS; links/consistency/scope đã kiểm tra, Git thực tế xem PROGRESS |
| BR-01 | BR-00 | Baseline, active tests, format/type/import guardrails | DONE_TOOLING — [evidence](evidence/BR-01/verification.json) |
| BR-02 | BR-01 | HTTP parsing/error và cursor fixes có regression | DONE — [evidence](evidence/BR-02/verification.json) |
| BR-03 | BR-02 | D1 execution/accounting, policy ownership và typed primitives | NOT_STARTED |
| BR-04A | BR-03 | Task core use-cases, domain model, mapper/read boundary | NOT_STARTED |
| BR-04B | BR-04A | Move/bulk/subtasks/Undo và cross-aggregate commands | NOT_STARTED |
| BR-05 | BR-04B | Các modules workspace/member/team/project/personal/collaboration/projections | NOT_STARTED |
| BR-06 | BR-05 | File application/R2 adapter và outcome handling rõ | NOT_STARTED |
| BR-07A | BR-06 | Scoped SQL paged reads + counts | NOT_STARTED |
| BR-07B | BR-07A | Search/dashboard/summary optimization đúng semantics | NOT_STARTED |
| BR-08 | BR-07B | Audit cuối, bỏ legacy paths/allowlists, current docs và regression | NOT_STARTED |

Mỗi phase có thể chia nhiều commit theo bảng việc dưới, nhưng chỉ báo DONE khi mọi gate phase đủ. Không làm đồng thời các phase thay cùng code ownership. Không ghi số ngày ước đoán trước khi baseline/runtime constraints được xác lập.

### BR-01 — Baseline và tooling bảo trì

Read-set: source hiện hành, package/tsconfig/eslint/turbo, boundary tests, README, WU36 current regression + adapted feature suites, BACKEND_STANDARDS.

Các bước:

1. Đối chiếu HEAD/working tree và toolchain Node24.13.0/pnpm11.19.0; cài frozen dependencies trong workspace bằng config store được hỗ trợ. Không đổi lockfile/version để né lỗi môi trường.
2. Chạy các regression hiện hành WU36 cho task/collaboration/projection/files theo README và các contract/data consumers liên quan. Phân biệt foundation WU30 outdated capability expectations với active tests.
3. Tạo active suite owners theo feature, tái dùng test support và import current production code; không duy trì bản implementation fork. Historical tests/evidence giữ nguyên.
4. Tạo test:unit/test:integration/test tổng hợp cho API; root pnpm test phải thực sự chạy API. Feature filtering qua runner để một thay đổi nhỏ có command xác định.
5. Parameterize unique storage/output/run IDs và owned ports; cleanup kể cả startup fail. Routine output không cần copy toàn code tree vào docs.
6. Typecheck tất cả active Worker entries. Cài formatter đã pin/config và API format/lint commands; format backend trong commit riêng với zero behavior diff.
7. Mở import guard nội bộ API bằng AST/rules phù hợp, kèm negative fixtures. Chốt exact legacy allowlist và phase gỡ cho từng path, không miễn toàn modules directory.

Nghiệm thu: baseline thực có command/exit/artifact; code-only failures sửa/ghi blocker riêng trước refactor; root test chứng minh API được chạy và lỗi API làm root fail; active Worker type error bị reject; formatter repeat idempotent; negative import/cycle checks reject. Existing tests tiếp tục pass sau format.

Kết quả BR-01 ngày 12/10/2026: baseline native task/collaboration/projection/files PASS trên Node24.13.0/pnpm11.19.0; active suite core bổ sung với expectations capabilities hiện hành. Root `pnpm test` thực chạy API: 23 API unit tests, năm native suites/1.047 HTTP probes, tổng 302 unit/contract/data/reference/workspace/i18n tests. File/R2 suite chạy lại sau explicit test-injector grant guard, 140 probes/20 checks PASS. Số polling probes có thể khác giữa runs; scenario/assertion sets được giữ.

Format/lint/typecheck/consumers/build dry-run PASS; active Worker type error và API/root failure propagation đã được inject và reject thật; import/cycle negative tests và cleanup timeout/early-exit/ENOENT PASS. Prettier3.6.2 pin; 63 files format repeat không đổi byte, 39 production/config files AST tương đương. Format-only commit `9965c97c6f41ccecb4726b339d4485400fe7951b`. Import allowlist có 50 exact violations và một type-dependency cycle với phase gỡ; không miễn toàn directory. [API README](../../apps/api/README.md) ghi command/owners/harness và legacy references. Chưa sửa error/cursor/D1/policy/module ownership/SQL semantics của các phase sau.

### BR-02 — HTTP và cursor correctness

Read-set: tất cả route groups, errors/runtime/middleware, shared/projection-page/collaboration-page/task-read, contract errors/cursors/operations, domain comparator và related frontend adapters.

Các bước:

1. Thêm regression input-invalid 400 và internal DTO/response-invalid 500; thực hiện explicit request parse wrapper và typed error boundary.
2. Gom transport decoding/JSON/query/body restrictions vào HTTP helpers; mỗi operation vẫn có schema riêng. Chạy method/status/repeated field/null/boolean/limit/filter cases.
3. Tách cursor codec/fingerprint và comparator chiến lược của từng feed. Thay anchor lookup của project/member bằng tuple seek; không tự đổi tie-break hoặc sort value format.
4. Kiểm chứng cursor giữa trang khi anchor bị delete/archive/restore/rename/marked-read; reject cursor query/scope/filter/sort khác. Không yêu cầu snapshot pagination khi contract chưa có.
5. Thêm request correlation và allowlisted server error log; giữ response schema/status và không log raw payload.

Nghiệm thu: trigger regression fail ở baseline và pass sau fix; các request valid/cursor đang hợp lệ còn đọc được; task/history/project/member directions giữ nguyên; contract + HTTP/native feed scenarios pass. Hai sửa hành vi được ghi decision và có diff/test tách khỏi structural moves.

### BR-03 — D1 boundary, policy và typed command foundations

Read-set: repository/commands/guards/schema/undo, middleware/bootstrap/routes, shared/read-model, task-relations và mutation callers.

Các bước:

1. Một request DB adapter sở hữu native/Drizzle execution, reserve/accounting, parameter/batch budgets và actual instrumentation. Không để caller tiếp tục public db/binding rồi reserve thủ công.
2. Tách typed error/clock/UUID/cursor khỏi HTTP và shared nghiệp vụ. `fitBatch` và manifest dùng một internal limit source được đối chiếu contract; không đổi giá trị limit.
3. Policy project active/read/write/restore có tên mode rõ và public predicate types; actor policy giữ active/admin/creator matrix. Không giữ write predicate trong read-model owner.
4. Dùng typed SqlPredicate/guarded batch/result plans; hạn chế Record<string,unknown> ở nơi plan xác định shape. Exact-set/gatedInsert chỉ nhận internal allowlisted identifiers.
5. Migrate execution callers theo nhóm nhỏ; giữ order/final guards/fresh marker/postVersion selects. Không gộp refactor primitive với đổi SQL nghiệp vụ.

Nghiệm thu: mọi actual statement được account một lần, cả middleware/Drizzle batches/final reads/retry; parameter và remaining budget limits giữ nguyên; native SQL0/noop/failure/authorization race snapshots đúng; import layer checks và mapper/policy type checks pass.

### BR-04A — Task core pilot và use-cases

Read-set: tasks/task-read/task-relations/task-routes, schema/Undo payload, domain recurrence/description/clock, current task tests và frontend operations.

Các bước:

1. Pilot complete-task: tách pure completion decision khỏi TaskRow, application orchestration và SQL plan/execution; inject now/IDs thay global calls.
2. Giữ dedicated completion, status PATCH và bulk completion semantics khác nhau; recurring creation và single-completion Undo không bị gom sai.
3. Chuyển create/update/lifecycle/duplicate/favorite lần lượt; typed plans biểu diễn rõ operations, không tạo universal service nhiều flags.
4. Tách task projection/pure mapper, preserve labels insertion order và hidden dependency projection; reads/final batch reads dùng cùng projection semantics.
5. Shared pure rule chỉ đưa vào packages/domain khi mock/server cùng cần; không chuyển D1 row types hoặc application services vào package.

Nghiệm thu: concurrency key allocation; normalized create replay/changed intent; sanitizer runs trong Worker; PATCH null/date validity; statuses/timestamps/favorite no-op/lifecycle; recurrence month-end/leap; no private child leak; dedicated Undo đầy đủ. Completion pilot phải PASS trước chuyển các use-case tiếp theo.

### BR-04B — Task ordering, bulk, children và Undo

Read-set: move/bulk task plans, task-children/task-undo, exactSet/relations, file association side effects, comment/file parent touches và Undo codecs.

Các bước:

1. Tách move/order planning với scope/adjacent neighbors và bounded resequence. Đổi project vẫn cấp key và cập nhật linked file metadata cùng batch.
2. Tách bulk/column plans với full exact ID/version set, recurrence/children và actual final postVersions; không dùng paged read dataset thay full command scope.
3. Tách subtask CRUD/promotion theo aggregate root; promotion sequence/new task/removal/history cùng marker.
4. Task-owned Undo handler có typed payload/discriminated branches; public handler cho registry. Giữ activity retraction/reopen và untouched successor guards.
5. Các module liên quan cung cấp plan fragments để task coordinator dựng một command; fragment không tự gọi batch.

Nghiệm thu: move conflict/rebalance and recurrence; exact column including empty scopes; bulk SQL rollback; parent-child identity/version; promotion rollback; Undo ABA/incoming references/successor edits; file metadata changes đúng khi move. Snapshot all affected tables ở failed commands.

### BR-05 — Các feature owners còn lại

Read-set: features/read-model/bootstrap/projects/teams/workspace/project-personal/saved-views/member-settings/comments/activity/notifications/projections và route groups.

Các bước:

1. Di chuyển từng group vào owner đích ở mục 3. Route không còn SQL/summary computation; không ghép một mega-service thay features.ts.
2. Hợp nhất mapper project/file/member/team và typed read projections; restricted mapping giữ allowlist riêng.
3. Public project policy và notification visibility predicate phục vụ Bootstrap/counts/search; không copy lại predicates ở mỗi endpoint.
4. Đưa project/team/comment Undo handlers về module chủ sở hữu; registry trung tâm dispatch exhaustive. Consumption/replay reauthorization giữ nguyên.
5. Profiles vẫn normalize ở users; preferences update supplied keys; favorites/order/member associations giữ actor/workspace scoping. Projection owner chỉ compose reads.

Nghiệm thu: current core/collaboration/projection regression; profile CAS across memberships; team exact association/Undo; private read/view/edit matrix; preference concurrent merge; favorites/order full-set guard; summary/bootstrap/search DTO parity và no child leak.

### BR-06 — File use-cases và R2

Read-set: files/file-routes, file/parent Undo schema, task move effects, domain file helpers, HTTP uploader/TaskSubmission, active file regression.

Các bước:

1. Tách multipart/content transport, pure mapper/byte validation, application upload/change/Undo và R2 adapter.
2. Làm outcome branches explicit/typed: confirmed winner, confirmed loser/rollback, unconfirmed commit/write và cleanup failure.
3. Giữ per-attempt object identity, same-intent hash/checksum/replay, current actor and parent authorization; không đổi creation/retry status.
4. Giữ tombstone bytes, missing-byte checks, safe download headers và actual size bounds.
5. Xóa mapping lặp tại task detail/search bằng pure FileDto mapper qua module public contract.

Nghiệm thu: native R2+D1 race/acknowledgement loss/native FK rollback/cleanup failure; checksum/content; sample unavailable bytes; file parent versions/restore/Undo; restart persistence; TaskForm partial attachments và same-intent retry. Không cần thêm orphan cleaner/purge/queue.

### BR-07A — SQL pagination cho reads

Read-set: TaskQuery/domain task-view, project/member/file/comment/activity/notification reads, cursor helpers, indexes/schema và current multi-page fixtures.

Các bước:

1. Inventory từng operation với authorized predicate, filters, normalized sort expression/null sentinel, primary direction, ID tie-break, query fingerprint và total semantics.
2. Xây finite typed SQL filter/sort compiler theo contract allowlist; không interpolate user field/column identifiers. Đối chiếu normalization Unicode, JS comparison, literal search và date/timezone.
3. Chuyển task/member/project/file/comment/activity/notification list từng endpoint sang seek + limit+1 theo needs; count/unread/category summary là query riêng full scope.
4. Có test page/summary equality dưới cùng state và multi-page traversal. Khi dữ liệu thay giữa requests, chỉ đảm bảo continuation semantics đã chốt, không hứa snapshot consistency.
5. Dùng EXPLAIN QUERY PLAN và actual D1 rows_read/rows returned khi có để kiểm chứng query scope; chỉ thêm index/migration nếu evidence cần, trong bước riêng.

Nghiệm thu: mọi supported filter/sort/null/date/literal combinations trong matrix parity; tie IDs không lặp/mất trang trên dataset tĩnh; removed anchor continuation; private/lifecycle predicates ở count giống page; không full-load toàn workspace để slice. Giới hạn runtime/request giữ nguyên.

Nếu SQL hiện hành không thể đạt comparator/text parity bằng release đang cài, ghi endpoint/trigger rõ và thiết kế deterministic normalization/collation hoặc migration riêng. Phase đó chưa DONE; không dùng default SQLite semantics hay hidden full-load để báo đạt.

### BR-07B — Search, dashboard và summaries

Read-set: projections/bootstrap/read-model và Home/Overview/archive/search contracts; domain dashboard; active HTTP projection tests.

Các bước:

1. Project/member/team statistics dùng grouped aggregates và scoped read sets, tránh lặp activeTasks/projectCatalog trong cùng request.
2. Global search dùng literal matching, category + stable ID order, category totals trước pagination; comment/file joins giữ parent scope sau move/lifecycle.
3. Home full myTasks/deadlines/projects preview và recentActivity total giữ contract; không tự cắt preview hoặc dùng count trang.
4. Archive task roots/project insertion rank và archived-child summary giữ ordering/visibility hiện hành.
5. Ghi query-count/rows/cost trước-sau trên dataset multi-page có hai workspace/private scopes; không dựng benchmark campaign hoặc cache service mới.

Nghiệm thu: projection/search/bootstrap/calendar/archive regression; full authorized totals; typed payload parity; no N+1/no duplicate broad dataset reads; representative query plans đúng scope và body completeness.

### BR-08 — Audit và bàn giao

Read-set: tất cả changed modules/public entries, active tooling/tests, standards/plan, current README/PROGRESS, historical acceptance để phân biệt scope.

Các bước:

1. Import checks fully enforce target matrix; legacy allowlist hết entry đã chuyển. Không còn active compatibility wrappers/duplicate parsers/cursor codec/mappers hoặc orphan exports sau migration.
2. Typecheck active Worker entries và domain/contracts consumers; lint/format; build dry-run; root test chạy active API suites.
3. Chạy tổng regression core/tasks/collaboration/projections/files và HTTP journey liên quan; UI visual chỉ khi behavior/data output tác động visual và đúng qualified environment.
4. Update apps/api README theo implementation hiện hành: module owners/public imports, commands, example feature workflow và legacy evidence references riêng.
5. Record final phase statuses/evidence/remaining constraints, actual Git checkpoint và commit/push theo AGENTS.

Nghiệm thu: toàn gate dưới đủ actual PASS hoặc phase không DONE; không claim production/full visual/new capability; mọi path/doc/command target tồn tại.

## 5. Risk matrix bắt buộc

| Tác động | Cases phải kiểm chứng | Phases chính |
| --- | --- | --- |
| Request/response | Valid/invalid schema, malformed JSON, repeated query, status, internal output 500 | BR-02,08 |
| Identity/access | Foreign workspace, private view/edit, Owner no-bypass, invited/removed principal/assignee | BR-03…08 |
| CAS/atomicity | Stale version, SQL0, native statement failure, race after preflight; no side effects | BR-03…08 |
| Allocation/replay | Concurrent create/move, same intent retry, changed intent/lifecycle; UUID/key uniqueness | BR-04A/B,06,08 |
| Dates/description | Omitted/null PATCH, timezone date-only, month-end/leap recurrence, Worker sanitizer | BR-04A,07,08 |
| Order/bulk | Neighbor adjacency, exhausted gap, bounded resequence, exact column full set | BR-04B,08 |
| Nested entities | Child/parent mismatch, promotion failure, comments/reactions idempotent no-op | BR-04B,05,08 |
| Undo | PostVersion after all writes, ABA, new child/reference, consumed retry/current auth | BR-04B…06,08 |
| Pagination | Every feed direction, ties/nulls, cross-query cursor, anchor gone/updated/read, complete traversal | BR-02,07,08 |
| Aggregates/privacy | Same predicate counts/page, archived/deleted parents, private snippets/counts, category totals | BR-05,07,08 |
| Personal state | Profile normalized/CAS, concurrent preference merge, favorite no-op/order guard | BR-05,08 |
| R2 outcomes | Put failure/unknown ack, D1 commit unknown, winner/loser, cleanup failure, missing bytes | BR-06,08 |
| Persistence | Native D1/R2 restart, schema/constraints and upgrade preservation nếu có migration | BR-03,06,07,08 |
| Cross-feature | Task move/lifecycle ảnh hưởng files/activity/Undo/projections/cache | BR-04B…08 |
| Tooling | Root API failure propagation, active Worker type errors, negative import/cycle checks, cleanup | BR-01,08 |

Chọn cases theo diff thực tế, không chạy lại toàn bộ visual/UI cho mỗi format/docs change. Native D1/R2 gates không được thay bằng pure unit tests.

## 6. Thực hiện một phase và lưu bằng chứng

Một session chỉ nhận phase hoặc phần phase có scope rõ. Prompt mẫu:

```text
Implement BR-01 from docs/engineering/BACKEND_REFACTOR_PLAN.md.
Read root AGENTS.md, apps/api/AGENTS.md, docs/poc/PROGRESS.md
and docs/engineering/BACKEND_STANDARDS.md first.
Inspect current code and run prerequisites/baseline.
Give a concise 3–7 step plan, then implement only the assigned scope.
Preserve API/data/D1/R2 invariants; do not begin later phases.
Run actual required checks, update phase status and PROGRESS with
changed files, commands/results/artifacts and decisions/blockers.
Commit/push according to the current repository instructions and stop.
Respond in Vietnamese.
```

Mỗi entry phase ghi: baseline HEAD; scope; changed files; tests/commands và exitCode; artifact paths; preserved/changed semantics; decisions/conflicts; blockers; actual commit/push; next permitted scope.

Refactor structure dùng behavior-preserving commits; error/cursor corrections và migration/index changes có evidence riêng. Nếu thất bại, giữ artifacts/failure và không nâng phase. Môi trường thiếu dependency chỉ chặn gate code, không chặn lưu tài liệu.

## 7. Hoàn tất toàn kế hoạch nghĩa là gì

- Feature mới có thể thêm contract/use-case/policy/query/mapper/tests ở đúng owner, không sửa một mega-file hoặc copy handlers.
- Sửa nghiệp vụ thuần được unit test độc lập; mutation có native integration chứng minh final guards/atomicity.
- Read page không tải toàn workspace; aggregate/cursor/privacy đúng semantics canonical.
- Root test, formatter/lint/typecheck/import guards chạy được và thật sự bắt lỗi.
- Docs/AGENTS là yêu cầu bắt buộc đang được tooling hỗ trợ; còn nợ/limit phải được ghi cụ thể.
- Historical POC evidence giữ nguyên; code quality remediation chỉ được gọi hoàn tất sau BR-08 đủ gate.
