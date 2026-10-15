# Rà soát và kế hoạch điều chỉnh ngoài apps/api

Ngày rà soát: **15/10/2026**. Baseline: branch `work`, commit `55c7f7192b30cb5a5dfe502ebbc1355f89f6bc17`; đối chiếu lại bằng `git rev-parse HEAD` khi bắt đầu triển khai, không suy trạng thái remote từ tài liệu. Phạm vi: `apps/web`, ba package dùng chung, test/tooling và tài liệu liên quan. **Không khảo sát implementation hoặc sửa `apps/api`.**

## 1. Kết luận và giới hạn khảo sát

Nền tảng phù hợp để phát triển tiếp, nhưng implementation ngoài API **chưa thực thi đầy đủ** các ranh giới và yêu cầu chất lượng đã ghi trong AGENTS/ARCHITECTURE. Không cần viết lại toàn frontend. Cần sửa các lỗi hành vi cụ thể, củng cố owner/quality gates, rồi chuyển code theo từng phần có regression.

Điểm nên giữ:

- Workspace/stack, strict TypeScript, runtime Zod và operation manifest tách khỏi framework.
- Query giữ server state; HTTP/mock chọn ở bootstrap, không fallback HTTP sang mock.
- Routes phần lớn mỏng; List/Board/Table/Calendar/Timeline chia sẻ field, DTO và domain semantics; UI package không phụ thuộc app/router/data.
- Clock seam, sanitized rich text, CAS/version/idempotency, bounded inverse Undo và staged mock transaction đã có.
- Có nhiều kiểm tra browser, error/retry/draft, contract và HTTP bundle isolation; không phải dự án chưa có test.

Những nền tảng đó chưa ngăn được module đa trách nhiệm, quy tắc nghiệp vụ lặp trong JSX, sai lệch URL/state và lỗ hổng trong runner. Việc đủ chức năng POC không phải bằng chứng đạt chuẩn bảo trì.

Ngữ cảnh chat được cung cấp không chứa nguyên văn “đề xuất bên trên”. Kế hoạch này đối chiếu yêu cầu hiện tại với AGENTS, ARCHITECTURE, các README, I18N, WORK_UNIT_PROMPT và mã thực tại baseline; không giả định đã thấy một đề xuất khác. Không đọc lại source copies trong historical evidence để đánh giá như mã hiện hành.

Khảo sát dùng static code review và các probe hẹp ở mục 8. Chưa có full adapter/browser/typecheck/build baseline trong phiên tài liệu này: Node có sẵn `24.19.0` khác pin `24.13.0`; workspace dependencies chưa đầy đủ (`typescript`, package links). Các kết luận browser/consumer được đánh dấu là luồng code cần regression xác nhận, không là bằng chứng chạy browser thành công.

## 2. Phát hiện có dẫn chứng

P1: có thể làm sai/mất trạng thái hoặc ngăn sử dụng dữ liệu hợp lệ, xử lý sớm. P2: sai lệch/coupling/gate làm tăng rủi ro sửa tính năng. P3: ownership cần hoàn thiện sau các rủi ro trước. Các số dòng là tọa độ **tại baseline**, có thể thay đổi khi refactor.

| ID | Ưu tiên và bằng chứng | Tác động / điều chỉnh | Phase |
| --- | --- | --- | --- |
| F01 | **P1** — [notifications.ts](../../apps/web/src/data/mock/notifications.ts):25–35 ghi trực tiếp; [mock adapter](../../apps/web/src/data/adapters/mock.ts):81 bypass queue; [transaction.ts](../../apps/web/src/data/mock/transaction.ts):7 stage cả dataset rồi commit | Notification read/unread có thể bị task transaction đang await fingerprint ghi đè. Một write/transaction owner cho aggregate; test interleaving và persistence. Probe hàm transaction thực đã tái hiện lost update; chưa chạy full adapter suite. | FR-02A |
| F02 | **P1** — [task-fields.ts](../../apps/web/src/data/mock/task-fields.ts):95,165,346 dùng `btoa(JSON.stringify(...))` cho cursor chứa tên/title/DTO | Chuỗi tiếng Việt/emoji hợp lệ làm phân trang lỗi khi có next cursor. Codec UTF-8/base64url có validate shape/size; scope gồm operation/workspace/principal/query. Task/activity fingerprint tại :257,341 chưa gắn scope đầy đủ như file/search. Primitive Unicode đã tái hiện exception. | FR-02A |
| F03 | **P1** — [TaskListPages.tsx](../../apps/web/src/features/tasks/TaskListPages.tsx):30–39 và [CalendarPages.tsx](../../apps/web/src/features/calendar/CalendarPages.tsx):57,65–67 chỉ init local view từ URL; wrapper không truyền controlled view | Same-route navigation có `view` mới nhưng toolbar/query có thể giữ state cũ; trigger là Search Overdue → `/tasks?view=...` tại [SearchOverlayHost.tsx](../../apps/web/src/features/search/SearchOverlayHost.tsx):50. Route/controller phải truyền canonical view mỗi render. Timeline wrapper :65 đã có mẫu controlled. Kết luận từ code, chưa browser reproduction. | FR-02B |
| F04 | **P2** — [invalidation.ts](../../apps/web/src/data/invalidation.ts):8–10,15–17 thiếu notification projections; [notifications.ts](../../apps/web/src/data/mock/notifications.ts):16–19 phụ thuộc lifecycle/parent access | Badge bootstrap có thể đổi nhưng Notifications/Inbox cache vẫn cũ sau delete/restore/move. Lập matrix mutation → reads và test query keys/refetch đúng scope. | FR-02A |
| F05 | **P2** — [AppShell.tsx](../../apps/web/src/app/shell/AppShell.tsx):63,67–71,89 giữ `form/taskMenu/opener` ở parent không reset theo workspace | Host mới vẫn nhận task/default project ID hoặc anchor của workspace cũ. Không kết luận API cho phép commit chéo scope. Controller transient có workspace/generation, đóng intent cũ và chặn late UI effects. | FR-02B |
| F06 | **P2** — [TaskPropertyGrid.tsx](../../apps/web/src/features/tasks/detail/TaskPropertyGrid.tsx):16, [TaskTableCell.tsx](../../apps/web/src/features/tasks/TaskTableCell.tsx):46, [TaskListRow.tsx](../../apps/web/src/features/tasks/TaskListRow.tsx):33, [TaskFields.tsx](../../apps/web/src/features/tasks/TaskFields.tsx):6 | Quy tắc sửa start/due lặp và khác nhau; Table đẩy due khi start vượt, Drawer xử lý khác. Chốt policy đối chiếu source/contract rồi dùng pure date-patch helper chung; giữ reschedule intent riêng nếu semantics khác. | FR-04 |
| F07 | **P2** — [TaskOverlayHost.tsx](../../apps/web/src/features/tasks/detail/TaskOverlayHost.tsx):33, [useTaskListDataset.ts](../../apps/web/src/features/tasks/useTaskListDataset.ts):6, [loadTaskViewDataset.ts](../../apps/web/src/features/tasks/loadTaskViewDataset.ts):10 | Root host drain task catalogue khi chưa mở task UI; hai complete loaders có key/coverage guarantees khác nhau. Dùng một loader/key policy; chỉ enable catalogue khi consumer cần; giữ cursor-loop/summary guards. | FR-04 |
| F08 | **P2** — [project-intents.ts](../../apps/web/src/features/projects/project-intents.ts):4, [ProjectOverlayHost.tsx](../../apps/web/src/features/projects/ProjectOverlayHost.tsx):25, [NotificationsPage.tsx](../../apps/web/src/features/notifications/NotificationsPage.tsx):22–27, [project-motion.ts](../../apps/web/src/features/projects/project-motion.ts):20 | Toast/surface/motion dùng chung nằm trong Projects; nhiều feature phụ thuộc ProjectIntents vì dịch vụ UI. Chuyển dịch vụ nhỏ về app owner, giữ project commands tại Projects, không tạo event bus. | FR-04 |
| F09 | **P2** — [notification queries](../../apps/web/src/features/notifications/queries.ts):20, [NotificationsPage.tsx](../../apps/web/src/features/notifications/NotificationsPage.tsx):28, [InboxPage.tsx](../../apps/web/src/features/notifications/InboxPage.tsx):39 | N+1 task-detail reads và một task error làm feed cùng chờ/lỗi. Tách feed availability khỏi enrichment, lazy detail hoặc enrich từng item hữu hạn; không đòi backend DTO mới trong kế hoạch loại API này. | FR-04 |
| F10 | **P2** — [ProjectLayout.tsx](../../apps/web/src/features/projects/ProjectLayout.tsx):23 gọi [project-view.ts](../../apps/web/src/features/projects/project-view.ts):9 trong render; hàm có `localStorage.setItem` | Render/selector có side effect persistence. Tách decode/default/migration thuần khỏi storage write; persist ở action/effect idempotent sau khi dữ liệu cần thiết sẵn sàng. | FR-04 |
| F11 | **P2** — [task-fields.ts](../../apps/web/src/data/mock/task-fields.ts):11,13,94,107,441 và [projects.ts](../../apps/web/src/data/mock/projects.ts):7, [teams.ts](../../apps/web/src/data/mock/teams.ts):7, [search.ts](../../apps/web/src/data/mock/search.ts):8 | Task owner chứa tasks/subtasks/comments/files/activity/member reads/Undo và shared ID/fingerprint. Chuyển generic helpers trước, tách owner theo operation, giữ transaction chung và typed dispatch mỏng. | FR-03 |
| F12 | **P2** — [task-view.ts](../../packages/domain/src/task-view.ts):4–23 chứa nhãn cột/pixel widths/hidden columns cùng query semantics; mock gọi normalize UI view tại task-fields.ts:336 | Domain query bị buộc vào UI table preferences. Tách normalize query thuần và web view/column preferences; giữ filter/sort/group/date/progress canonical. Đây là điều chỉnh ownership có chủ đích so với checkpoint kiến trúc POC cũ. | FR-03/04 |
| F13 | **P2** — [controls.tsx](../../packages/ui/src/controls.tsx):40–46 và consumer [ProjectFormDialog.tsx](../../apps/web/src/features/projects/ProjectFormDialog.tsx):15, [OnboardingPage.tsx](../../apps/web/src/features/onboarding/OnboardingPage.tsx):59 | Direct children có thể bỏ label/error ID props; Field không đảm bảo accessible name/description. Chuẩn hóa composition/render-prop và migrate consumer; test DOM relations thực. | FR-05 |
| F14 | **P2** — [appearance-fields.tsx](../../packages/ui/src/appearance-fields.tsx):5; [overlay-context.ts](../../packages/ui/src/overlay-context.ts):20; [overlays.tsx](../../packages/ui/src/overlays.tsx):59–63 | Radio roles thiếu arrow/roving focus; tabbable selector vẫn nhận button `tabIndex=-1`. Một owner keyboard group và helper Tab order; kiểm chứng trong overlay, disabled/hidden/inert và focus return. | FR-05 |
| F15 | **P2** — [controls.tsx](../../packages/ui/src/controls.tsx):44–46, [display.tsx](../../packages/ui/src/display.tsx):54,58, [toasts.tsx](../../packages/ui/src/toasts.tsx):24–25 tự dịch caller strings; [catalog.test.mjs](../../tests/i18n/catalog.test.mjs):24 chỉ bắt literal | Translation ownership trộn; dynamic keys không được gate literal bao phủ. Primitive giữ text caller, chỉ dịch nhãn nội bộ; typed descriptor nếu cần, kiểm cả hai locale/plural/interpolation. | FR-05 |
| F16 | **P2** — [boundaries.mjs](../../tests/workspace/boundaries.mjs):8–12,29–47 chỉ kiểm shared packages; dynamic relative imports thiếu kiểm target như static | Tài liệu có rule nhưng frontend layer/deep import/cycle chưa được bảo vệ; dynamic import có thể thoát package. Shared resolver + negative fixtures; thêm frontend rules với exact legacy allowlist có phase gỡ. | FR-01 |
| F17 | **P2** — [web package](../../apps/web/package.json):11 chỉ discover env/data tests; [root package](../../package.json):13–16,31–97 có nhiều suite riêng, lint chưa gồm visual/reference | Test mới trong feature có thể không chạy; không có affected-regression entry rõ. Manifest suite owner/command/mode/scenario, discoverability và failure propagation, không bắt mọi edit chạy hết pixel suite. | FR-01/06 |
| F18 | **P2** — [http-bundle.mjs](../../tests/data/http-bundle.mjs):6–9,24–25 mặc định ghi WU-06; [verify.mjs](../../tests/data/verify.mjs):6,19–33 ghi report/số test cố định; [people gates](../../tests/visual/people/gates.mjs):15–18, [teams gates](../../tests/visual/teams/gates.mjs):15–18 splice theo vị trí | Active runner có thể ghi đè lịch sử; `--affected --skip-tests` bỏ build và vẫn báo passed trong scope còn lại. Dùng output riêng, lấy kết quả thật, chọn checks theo ID và report skips. Probe trên command declarations/filters thật xác nhận bỏ build; không chạy runner ghi evidence. | FR-01/06 |
| F19 | **P2/P3** — [people HTTP harness](../../tests/visual/people/http.mjs):10–32, [teams HTTP harness](../../tests/visual/teams/http.mjs):11–33 lặp infrastructure; [domain package](../../packages/domain/package.json):12–15 chưa có test entry | Tách support server/session/intercept/report tối thiểu. Domain **đã có tests** trong web/data; chuyển dần test thuần về owner, giữ integration ở web. Source/controller JSX nén nhiều trách nhiệm cũng cần format trước diff, không dùng LOC làm thước đo chất lượng. | FR-01/06 |

## 3. Quyết định đích và phạm vi giữ nguyên

Chuẩn bắt buộc nằm trong [FRONTEND_STANDARDS](FRONTEND_STANDARDS.md). Các quyết định triển khai của kế hoạch này:

1. Refactor tại chỗ, giữ shared controlled views và operation contracts; không đổi stack, làm lại UI hoặc sinh framework nhiều tầng.
2. Production route sở hữu URL; reusable view nhận typed model/intents. Harness standalone có URL adapter riêng; không tiếp tục dùng global location/history trong component runtime.
3. Một transaction owner cho mock aggregate. Tách handlers/shared primitives theo nghiệp vụ; task module không sở hữu mọi domain.
4. Tách semantic query/date/filter/order khỏi pixel/column/view preference metadata. Domain giữ quy tắc cần các consumer dùng giống nhau; UI metadata về feature web. Không đổi persisted values/query semantics khi chỉ chuyển owner.
5. App sở hữu dịch vụ toast/motion/surface nhỏ; feature sở hữu commands. Một translation owner cho từng text, một keyboard/focus owner cho primitive.
6. Active regression có entry/scope/output rõ; evidence lịch sử bất biến. Không làm lại toàn bộ harness WU cùng lúc và không thêm CI/CD.

Phải bảo toàn: canonical DTO/errors/null-versus-omission/date-only/UTC; session-generation/capture intent; CAS/idempotency/relationships/recurrence/Undo; localStorage namespaces/migration; permission/lifecycle visibility; source SHA/tokens/layout và các giới hạn nghiệm thu visual đã có. Shared package changes có backend consumer phải kiểm impact/types theo phạm vi; không sửa `apps/api` ngầm để qua gate. Nếu cần API change thật, tách thành nhiệm vụ được giao riêng.

## 4. Trình tự và trạng thái

| Phase | Prerequisite | Deliverable | Trạng thái |
| --- | --- | --- | --- |
| FR-00 | Yêu cầu review/kế hoạch của Hòa | Review, chuẩn, plan, AGENTS và liên kết docs | **DONE_DOCS**; verification ở mục 8/PROGRESS; không có runtime refactor |
| FR-01 | FR-00 | Baseline non-API, guardrails/format/readability và safe check runner nền | **DONE**; [acceptance](evidence/FR-01/verification.json), [entry](../../tests/frontend/README.md), [case matrix](FRONTEND_REGRESSION_MATRIX.md) |
| FR-02A | FR-01 | Sửa transaction/cursor/notification invalidation | **NOT_STARTED** |
| FR-02B | FR-01 | URL ownership và workspace transient intent | **NOT_STARTED** |
| FR-03 | FR-02A | Mock module ownership, semantic query boundary | **NOT_STARTED** |
| FR-04 | FR-02B + FR-03 | Controller/dataset/date/UI services/persistence | **NOT_STARTED** |
| FR-05 | FR-04 | Field/keyboard/focus và translation ownership | **NOT_STARTED** |
| FR-06 | FR-03 + FR-04 + FR-05 | Active test ownership/harness migration và documentation commands | **NOT_STARTED** |
| FR-07 | FR-06 | Audit cuối, gỡ allowlist/seams, current docs và regression | **NOT_STARTED** |

FR-02A và FR-02B có thể giao song song ở workspace/file ownership tách biệt sau baseline; integration có một owner kiểm lại shared client/keys. Các phase còn lại đi tuần tự prerequisite. Không chạy phase kế tiếp chỉ vì phase trước đã format/build. Không cam kết ngày công khi chưa có baseline và số consumer thực tế.

## 5. Công việc và tiêu chí nghiệm thu từng phase

### FR-01 — Baseline và guardrails trước refactor

Read-set: chuẩn frontend, AGENTS/PROGRESS, package scripts, tsconfig/eslint/turbo/Vite, tests/workspace/data/i18n và active visual suites của các feature sẽ chạm. Không đọc cả archive WU như code đang chạy.

1. Ghi HEAD/branch/dirty scope, Node/pnpm, dependency readiness và existing failures. Dùng Node24.13.0/pnpm11.19.0, frozen lockfile; không đổi versions/lockfile để né lỗi môi trường. Cài dependencies đúng thiết lập registry hiện hành khi triển khai runtime, không dump token/env.
2. Chạy baseline scoped mục 7. Tạo bảng case cho F01…F19: regression đang có, case thiếu, suite owner, command và output. Phân biệt static finding/chưa tái hiện với lỗi đã chạy; chưa sửa behavior ở bước format.
3. Chốt public feature surfaces và import matrix từ graph hiện hành. Bổ sung AST/static resolver dùng chung cho import/export/dynamic import/require; negative tests cho cross-package escape, package→app, data→view/router, view→data và feature deep import/cycle theo owner. Không cấm mọi cross-feature import một cách máy móc.
4. Allowlist nợ cũ theo exact path/symbol/edge, lý do và phase gỡ FR-03…05; gate phải reject vi phạm mới. Không cho allowlist tự tăng hoặc regex miễn toàn web.
5. Bổ sung safe frontend check entry/manifest nền: chọn command ID, mode/output rõ, unique run destination; routine checks không ghi historical evidence. Sửa selection flags F18 qua test tổ hợp options, không chỉ đổi `splice` đơn lẻ. Tạo contract consumer entry/tsconfig non-API riêng: alias `contracts:consumers` hiện có include `apps/api/tests/contracts.*.ts` qua tests/contracts/tsconfig.json, không dùng alias đó cho baseline loại API.
6. Chốt formatter cho non-API tại workspace; pin/config và ignore generated/reference/evidence. Format file sẽ refactor theo batch riêng, chứng minh repeat idempotent và không đổi AST/behavior; không format `apps/api`.

Nghiệm thu: baseline có command/exit/scope thật; negative boundary fixtures fail đúng, allowed imports pass; feature test mới được discover hoặc có entry rõ; tool error/child exit khác0 làm runner fail; selection/skips báo đúng; không ghi historical evidence. Format-only diff tách riêng. Existing code failure được sửa trong phạm vi hoặc ghi blocker trước phase phụ thuộc, không chuyển thành baseline “được phép fail” mơ hồ.

### FR-02A — Sửa lỗi data trước tách owner

Read-set: adapters/mock, mock transaction/dataset/persistence/notifications/task-fields/project access, query-keys/invalidation; tests data task/project/files/notifications/foundation/auth và contracts cursor/operation schemas.

1. Thêm regression interleaving F01 qua `StudioClient` thực: giữ task create/upload fingerprint pending, enqueue read/unread/read-all, release; kiểm final task/notification/bootstrap và persisted reload. Test rejected handler/persist không partial commit và command sau không kẹt queue.
2. Đưa notification writes qua transaction owner chung; giữ reads không mutation. Rà tất cả operation lists để không còn canonical direct write bypass. Giữ persistence ordering/durability semantics hiện hành, ghi rõ commit point.
3. Tạo UTF-8/base64url codec giới hạn size + typed shape decode. Migrate mock cursor owners, fingerprint operation/workspace/principal/normalized query; loại cursor/limit có chủ đích. Chỉ áp dụng mock, cursor vẫn opaque; không đổi public schema/backend. Nếu cursor mock đã phát hành không tương thích, cho lỗi validation/restart feed có chủ đích, không reset dataset.
4. Test nhiều trang title/member/project/file names có dấu, emoji/Japanese; đủ IDs không mất/trùng, malformed/oversized/mismatched scope/query rejected. Giữ tuple seek/order/tie-break/anchor mutation behavior đã có.
5. Lập mutation→projection matrix có notification visibility; bổ sung lifecycle/move/restore/Undo invalidation và coverage từ manifest. Test bootstrap và feed cache cùng đổi sau refetch, workspace khác không bị invalidation ngoài ý định.

Nghiệm thu: tests trigger F01/F02/F04 fail với code cũ và pass với code mới; existing command/version/Undo/lifecycle/auth-generation tests còn đạt. HTTP bundle không chứa mock. Không “sửa” bằng tắt concurrency hoặc invalidate toàn app cho mọi mutation.

### FR-02B — URL và transient scope

Read-set: TaskListPages/current-view, CalendarPages/TimelinePages, navigation/routes, AppShell/transient context, TaskOverlayHost, SearchOverlayHost, auth lifecycle và browser route cases.

1. Thêm same-route `/tasks?view=...` từ Search Overdue và external navigation; đối chiếu URL/toolbar/query/rows. Thêm Back/Forward/reload cho Task/MyTasks/Calendar. Ghi rõ Calendar date/mode hiện chưa theo URL contract; chốt schema/default/normalization trong navigation trước sửa.
2. Wrapper production đọc Router search mỗi render, truyền controlled view/mode/date. Tách URL adapter của standalone harness; bỏ global location/history khỏi reusable runtime components. Không dùng effect mirror URL sang local state.
3. Gắn toàn bộ form/menu/opener/selection transient intent với workspace+generation hoặc workspace-owned controller. Chuyển scope đóng các intent cũ; key child không thay việc reset parent intent.
4. Test mở create với project default/edit/menu tại A rồi sang B/Back/Forward; pending response của A không xóa draft hoặc mở overlay của B. Giữ session/account generation guards và deep link Close behavior.

Nghiệm thu: URL, controller và query có một source of truth; navigation không stale view; không còn task/project ID/anchor A trong overlay B. Browser reproduction và regression thật, không chỉ unit test decoder. Các query/command/auth behavior khác không đổi.

### FR-03 — Mock module và shared semantic ownership

Read-set: adapters/mock, mock operation handlers, shared contracts/domain task query/view, registry dispatch và tests đã đạt FR-02A.

1. Chuyển ID/fingerprint/codec/errors/access helpers về owners nhỏ; cập nhật imports để project/team/search không phụ thuộc task implementation. Không trộn việc chuyển file với đổi behavior F01/F02 đã chốt.
2. Tách task reads/commands, subtasks, comments, files, activity/member reads, Undo dispatch theo operation subsets typed. Adapter chỉ resolve handler/capability/transaction/persistence, không chứa business switch mới.
3. Một queue/transaction coordinator tiếp tục ghép cross-domain writes atomic; explicit domain public functions xử lý touch/version/activity/Undo. Không tạo queue độc lập cho từng feature chia sẻ dataset.
4. Tách normalize task query thuần khỏi web column/view preference metadata F12. Lập consumer map và giữ compatibility seam chính xác trong khi migrate web ở FR-04; không export UI widths qua domain API mới. Nếu shared consumer cần API change ngoài scope, tách blocker thay vì sửa API.
5. Gỡ đúng boundary allowlist của phần đã chuyển; test registry coverage, missing handler trả lỗi đúng capability, không success giả.

Nghiệm thu: không còn project/team/search→task-fields chỉ để lấy generic helper; handlers có owner/public surface rõ, không cycle; operation/CAS/recurrence/relations/Undo/concurrency tests pass. Không chỉ chấm theo số dòng giảm. Seam F12 nếu còn phải có đúng consumer/phase gỡ FR-04.

### FR-04 — Feature controllers và reusable policies

Read-set: task fields/list/table/detail/forms/loaders, notifications/Inbox, project intents/motion/view/layout, app services; standards state/query/i18n boundaries.

1. Đối chiếu nguồn và contract để ghi decision về chỉnh start/due cho record/draft/null. Tạo pure patch policy dùng ở List/Table/Drawer/Form, giữ reschedule khác biệt có chủ ý. Table-driven semantic tests và browser consumer checks; không “thống nhất” bằng đổi behavior ngầm.
2. Hợp nhất complete dataset loader/key owner và guards; overlay chỉ tải catalogue khi editor/form cần, drawer get-by-ID. Request-count check trên Home/Settings và feature cần full dataset; cursor loop/coverage mismatch vẫn bị phát hiện.
3. Notifications feed render độc lập với unavailable linked task. Enrichment theo item/lazy hoặc dùng fields hiện có; 403/404/500 của một task không làm mất feed khác. Giữ visibility/privacy, không render dữ liệu đã mất quyền; không thêm backend endpoint trong phase này.
4. Chuyển toast/motion/surface services từ Projects về app owner nhỏ. ProjectIntents chỉ còn project intents; các feature khác không import Projects chỉ để notice/motion. Giữ provider order/focus/animation/reduced-motion semantics.
5. Project view decode/default/migration thuần; persistence ở action/effect có scope/revision. Test render không ghi storage, malformed state, saved-view async load và không overwrite draft preference mới.
6. Hoàn tất chuyển column metadata/view preference về feature, gỡ compatibility export/allowlist FR-03; routes ghép controller, controlled views không tự đọc storage/URL/query.

Nghiệm thu: F06…F12 có policy/owner và regression nêu trên; query/loader không duplicate catalogue cùng scope vô cớ; reusable view không phụ thuộc Router/data. List/Board/Table/Drawer/Calendar/Timeline vẫn chia sẻ fields và commands; ảnh/interaction phạm vi bị sửa giữ thiết kế.

### FR-05 — UI accessibility và translation boundary

Read-set: UI controls/appearance/overlay/display/toast/translation, feature forms/choice groups và i18n catalog/presentation helpers; current controls/overlay/form browser suites.

1. Chốt Field composition API bảo đảm label/control/error/hint association. Migrate input và Select consumers, không chỉ sửa UI package rồi bỏ consumers; kiểm IDs/accessible name/description và focus sau submit lỗi.
2. Một generic keyboard choice owner cho radio/swatch/card; giữ presentation riêng. Sửa tabbable helper phân biệt Tab order và programmatic focus, audit toàn selector branch. Test Dialog chứa Tabs/RadioGroup, disabled/hidden/inert controls, Escape/stack và opener đã rời DOM.
3. Primitive render caller text nguyên trạng, UI translator chỉ xử lý nhãn nội bộ. Migrate callers đồng bộ; message descriptor typed chỉ khi lifecycle yêu cầu, không tạo thư viện message framework.
4. Bổ sung dynamic key/enum coverage và plural/interpolation. Kiểm vi mặc định/en chuyển hai chiều, reload và error/toast đang hiển thị theo contract đã chọn; không dịch user content.
5. Format/split controls theo trách nhiệm thực khi cần để review, giữ public exports/ref/props compatibility hoặc migrate rõ trong cùng phase. Không thay token/layout để tiện primitive API mới.

Nghiệm thu: F13…F15 có browser keyboard/DOM relations tests ở consumer, controls/overlays/lifecycle/motion regression và ảnh phạm vi bị ảnh hưởng. Không double-translate arbitrary caller string; hai locale không mất nhãn/plural hoặc overflow. Không đổi baseline/tolerance để qua gate.

### FR-06 — Test ownership, active runners và harness support

Read-set: manifest/runner FR-01, tests/data/workspace/i18n, visual suites đã dùng FR-02…05, package scripts và feature READMEs.

1. Chuyển dần pure domain tests từ web/data về package domain với test entry riêng; web giữ adapter/cache/consumer integration. Manifest phải đảm bảo test được discover, không tăng số test báo cáo bằng chạy trùng.
2. Tách support nhỏ server/session/intercept/report/output; dùng first consumers people/teams và suites vừa sửa. Parameterize URL/mode/runDir/owned ports; cleanup cả startup fail/timeout/cancel. Assertions nghiệp vụ ở suite, không hidden trong helper tổng quát.
3. Active http-bundle/data verification nhận output directory mới và không default WU. Kiểm overwrite rejection, child-failure propagation, command-selection, scenario IDs/skips và actual totals. Không sửa lại evidence WU để “chuẩn hóa”.
4. Hoàn thiện manifest/check matrix theo feature/risk cho UI/data/contracts/domain/graph. Thêm documented scoped non-API commands; root suites vẫn có semantics rõ nhưng không dùng chúng cho nhiệm vụ cấm API.
5. Lint/test coverage gồm shared visual/reference harness và active support; historical scripts chỉ chuyển khi cần consumer, còn lại đánh dấu reproduction-only rõ. Không rewrite toàn bộ visual suite trong một lần.

Nghiệm thu: coder có một đường chọn checks theo thay đổi, report đúng suite/scenario/output thật; test mới không âm thầm bị bỏ; failure hoặc skip không thành PASS toàn diện; không command active nào mặc định ghi historical evidence. Resource cleanup có negative tests thực. Tests domain tiếp tục giữ semantic cases hiện có.

### FR-07 — Audit cuối và tài liệu hiện hành

1. Đối chiếu F01…F19 với implementation/commit/evidence; finding chưa tái hiện được phải có kết luận và lý do, không bỏ khỏi bảng âm thầm.
2. Gỡ allowlist/seams của các phase đã hoàn tất; boundary negative tests vẫn reject và public import graph không cycle. Không để “tạm thời” không owner/phase.
3. Chạy active non-API regression matrix đầy đủ đã chốt FR-01/06, scoped typecheck/lint/build, contract consumer entry non-API tạo ở FR-01, i18n/browser/affected visual và HTTP graph isolation. Không gọi đây là full backend validation.
4. Cập nhật README/ARCHITECTURE/COMPONENT_CATALOG và các feature/data/UI README theo implementation thật: owner, public imports, test commands, state/persistence. Giữ WU evidence và visual debt lịch sử nguyên trạng.
5. Ghi checklist phát triển tính năng mới và bug fix trong AGENTS/WORK_UNIT_PROMPT; review một luồng task và một luồng ngoài task từ route→controller→client→handler/cache để chứng minh rules thực sự áp dụng.

Nghiệm thu: mỗi finding có resolution hoặc blocker cụ thể được báo rõ; code mới tuân chuẩn, gates bảo vệ rule chính, docs mô tả implementation thực thay vì cấu trúc mong muốn. Không báo “production-ready”, hết visual debt hoặc backend đạt chuẩn từ đợt review ngoài API.

## 6. Cách chia PR/commit và rollback

- Một behavior fix có trigger/regression riêng; format-only và structural moves không che behavior diff. Mỗi phase có thể nhiều commit/PR nhỏ, không cần một PR khổng lồ mới review được.
- Commit theo owner: shared helper→consumer→gỡ seam. Không di chuyển cả web một lần; không tạo public barrel export mọi implementation.
- Structural change không được đổi dữ liệu persist. Nếu đổi shape preference/mock metadata là bắt buộc, có version/migration/backward-read và rollback note; không xóa localStorage hoặc reset dataset.
- Rollback structural commit phải dùng lại persisted data hiện có. Không rollback bằng overwrite evidence, đổi baseline hoặc ép dependency version khác.
- Sau mỗi phase cập nhật PROGRESS với gates/exit/artifact/remaining risks và phase được phép tiếp. Chỉ phase đã có evidence đủ mới DONE; lỗi ở shared prerequisites chặn phase phụ thuộc.

## 7. Ma trận command khi triển khai runtime

Các lệnh dưới là **gate dự kiến cho phase triển khai**, không phải kết quả đã chạy trong FR-00. Dùng đúng toolchain và dependencies trước. Không gọi `pnpm typecheck/build/lint/test` ở root khi nhiệm vụ yêu cầu loại API: các lệnh root có thể điều phối `apps/api`.

| Gate | Command hiện có / entry cần có | Khi cần |
| --- | --- | --- |
| Typecheck | `pnpm --filter @studio/web --filter @studio/ui --filter @studio/contracts --filter @studio/domain typecheck` | Mọi runtime refactor trong các owners này |
| Lint + existing package boundaries | `pnpm exec eslint apps/web packages tests/workspace tests/data tests/i18n tests/contracts tests/visual eslint.config.mjs` và `node tests/workspace/boundaries.mjs` | Scoped baseline; FR-01 sửa rule/coverage và thêm frontend gate, không hạ rule để pass |
| Unit/integration hiện có non-API | `pnpm --filter @studio/web test`, `pnpm test:contracts`, `pnpm test:workspace`, `pnpm test:i18n` | Chọn theo owner/risk; FR-01 tạo contract consumer entry non-API, FR-06 bổ sung domain entry; alias `contracts:consumers` hiện có chạm API nên ngoài scope |
| Build | `pnpm --filter @studio/web --filter @studio/ui --filter @studio/contracts --filter @studio/domain build` | Runtime/module/export graph đổi |
| HTTP bundle | `pnpm --filter @studio/web build:http` + graph checker nhận explicit safe output sau FR-01 | Adapter/bootstrap/import graph đổi; hiện **không** chạy alias `verify:data:http-bundle` mà không xử lý output vì nó ghi WU-06 |
| Browser/visual | Suite entry của feature + controls/overlays/routes theo phạm vi | Dùng manifest FR-01/06; tham khảo alias ở package hiện hành nhưng audit child commands/output trước chạy |
| Reference integrity | `pnpm reference:check` nếu checkout tham chiếu sẵn sàng | Khi thay UI/style/capture; không download/đổi source để né thiếu baseline |

Các harness cũ có thể gọi root commands hoặc ghi WU paths; không mặc định coi chúng an toàn chỉ vì tên là frontend. FR-01 phải cung cấp active output/selection phù hợp trước khi dùng trong phase sau. Nếu runtime task có phạm vi rộng hơn được giao riêng, bổ sung backend consumer checks theo BACKEND_STANDARDS; không tự mở scope ở đây.

## 8. Verification thực tế của FR-00

Đã đọc code hiện hành và phối hợp review độc lập bốn khu vực web/data/shared UI/tooling. Chỉ tạo/sửa tài liệu, root AGENTS và hướng dẫn frontend; không thay runtime/package scripts/lockfile hoặc `apps/api`. Không chạy harness có thể overwrite lịch sử.

Các probe read-only chạy bằng Node24.19.0, exit0:

1. `btoa(JSON.stringify({sortValue:'000 Tiếng Việt'}))` ném **InvalidCharacterError**. Probe codec primitive, không thay cho pagination test qua adapter.
2. Import **hàm thực** `transactMock`, giữ staged command pending trên aggregate tối thiểu, direct-write notification `readAt`, release commit: `readAt` trở lại `null`. Probe chứng minh cơ chế lost update, không là full task/notification/persistence suite.
3. Đọc command declarations và hai `splice` thật của people/teams gates rồi đánh giá trong VM read-only với `--affected --skip-tests`: chỉ còn `lint,http-build,http-bundle,reference`, **build bị bỏ**. Không execute gate hoặc ghi evidence.

`node --test tests/workspace/boundaries.test.mjs` bị chặn trước khi tests chạy bởi **ERR_MODULE_NOT_FOUND: typescript**. Probe full adapter cũng không resolve `@studio/contracts` do workspace dependencies thiếu. Không suy lỗi ứng dụng từ thiếu môi trường và không ghi chúng là PASS.

Docs verification cần đủ trước kết thúc: relative links của các file sửa/tạo tồn tại, diff không whitespace error, scope chỉ docs/instructions và không chạm historical evidence/source/API. Kết quả thực tế cùng Git checkpoint ghi tại entry FR-00 trong [PROGRESS](../poc/PROGRESS.md). Tại checkpoint FR-00, toàn bộ runtime phases FR-01…07 còn **NOT_STARTED**. Trạng thái triển khai mới xem bảng mục 4 và entry PROGRESS riêng.

## 9. Checkpoint triển khai FR-01 — 15/10/2026

FR-01 **DONE** trên baseline actual `edda6111`; format-only commit `204822a3` tách khỏi guardrails. [Verification](evidence/FR-01/verification.json) và [ma trận F01…F19](FRONTEND_REGRESSION_MATRIX.md) giữ command/exit/scenario/gaps thật. Active entry `pnpm frontend:check` có output unique, types/consumer/lint/import/unit/build/HTTP graph; browser-smoke/reference chọn bằng ID. Các flag selection báo skips/partial, không còn splice làm mất build; legacy visual harness khác chưa migrate không được chạy vào WU evidence.

Actual acceptance: Node24.13.0/pnpm11.19.0, 305Node tests + 8browser probes, 6target-before/after-format screenshot pairs byte-equal, scoped types/lint/consumer/build/HTTP/reference đều exit0. Import graph2157edges/cycles0, 33public surfaces, 91feature roles; ceiling91exact legacy entries chỉ giảm, 2gỡ FR-03 và89gỡ FR-04. Không gọi guardrails là resolution của behavior findings còn lại.

Full install vẫn gặp401 ở policy metadata package auth API dù filter frontend; các dependencies frontend đã linked và chạy toàn bộ checks thật. Không bypass trust policy, đổi package versions hoặc dùng credential khác. Root thêm direct Prettier3.6.2 đã có trong lock (importer3lines), không thay resolution/API importer. Backend/source/fixture/historical evidence không đổi; chưa có source pixel acceptance mới.

Next permitted: FR-02A hoặc FR-02B sau đọc đúng read-set; session này dừng tại FR-01 theo AGENTS. Rollback: revert tooling/config commit và format-only commit, giữ persisted state và evidence.
