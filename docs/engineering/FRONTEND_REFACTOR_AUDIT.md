# Frontend refactor — final implementation audit

Phạm vi FR-01…07: web/UI/contracts/domain và tooling liên quan, không sửa hoặc nghiệm thu `apps/api`. Findings và tọa độ baseline giữ tại [plan](FRONTEND_REFACTOR_PLAN.md); bảng này đối chiếu implementation hiện tại với commit và bằng chứng chạy thật. Không dùng build pass hoặc số file làm bằng chứng ownership.

| Finding | Resolution và owner hiện tại | Commit / regression evidence |
| --- | --- | --- |
| F01 | Notification writes cùng aggregate transaction queue; configured durable save trước live commit; rejected handler/save không partial write | b699f657; FR-02A frontend-correctness interleaving/persistence red→green; [evidence](evidence/FR-02A/verification.json) |
| F02 | cursor-codec UTF-8 bounded v2 + scoped fingerprint, mọi cursor owner migrate; old/malformed/mismatched cursor validation/restart-feed, không reset state | b699f657; actual multi-page Unicode/emoji/Japanese task/file tests và scope cases, FR-02A |
| F03 | Router supplies controlled view/date/mode mỗi render, QA URL adapter riêng | 07dae9b6; browser-url same-route/Search Overdue/Back/Forward/reload; baseline4cases fail, [FR-02B](evidence/FR-02B/verification.json) |
| F04 | Invalidation matrix bao gồm notifications khi lifecycle/access thay đổi, workspace isolation và mutation coverage | b699f657; actual Query delete/Undo refetch + mapping tests, FR-02A |
| F05 | Workspace-owned transient instance/generation, cancel old queries và guard late UI effects; create intent mới có revision | 07dae9b6; menu/default/create A→B và held A response không xóa draft B, browser-url |
| F06 | task/date-patch owns record endpoint clamp/null semantics; draft độc lập; domain reschedule giữ duration | 040e89fb; table-driven policy + browser List/Table/Drawer/draft; source/contract decision in [FR-04](evidence/FR-04/verification.json) |
| F07 | useTaskDataset + one complete key/loader; List selects items; raw coverage Board/Table; overlay enabled only when catalogue needed | 040e89fb; request counts Home/Settings/drawer/editor + cursor loop/coverage mismatch tests; final alias removed FR-07 |
| F08 | Notification feed độc lập linked task errors; each enrichment excludes errored cached task | 040e89fb; browser-controllers403/404/500 giữ feed, FR-04 |
| F09 | app/services owns toast/Undo/surface/motion; ProjectIntents business-only; provider lifetime outside business providers | 040e89fb; browser project share/focus/notice/Undo + existing motion/overlay; FR-04 |
| F10 | Project decode/restore pure; persistence explicit action; URL mới thắng saved definition tải chậm | 040e89fb; no-write storage regression + saved-route browser regression, FR-04 |
| F11 | primitives/access/cursor/ID/hash independent; typed operation-registry with task/subtask/comment/file/activity/member/Undo owners; one queue | 4f9ef3bc; registry/owner guards + command/version/recurrence/relations/Undo suites; [FR-03](evidence/FR-03/verification.json); temporary facade removed FR-07 |
| F12 | Domain normalizes semantic query/evaluation; web task-view owns columns/labels/widths/preferences; no presentation export in domain | 4f9ef3bc/040e89fb; mock no-UI normalization regression, web metadata + consumers/types/graph; no backend runtime change |
| F13 | Field required render callback/control bindings; migrated all consumers; FieldGroup collection semantics; negative consumer gate | 3e324861; real Project/Onboarding accessible name/description/error-submit focus + Select/Field browser tests; [FR-05](evidence/FR-05/verification.json) |
| F14 | Shared useChoiceGroup roving keyboard; overlay Tab order filters every branch; validated initial/return focus and missing opener | 3e324861; browser dialog Tabs/radio, disabled/hidden/inert/negative tabindex, nested Escape/missing opener, reduced motion and actual theme/template/onboarding consumers |
| F15 | Feature owns business translation, primitives render caller text; internal labels live, event messages language snapshot; categories translated during render | 3e324861; dynamic catalog/enum/auth/password/settings/onboarding tests, plural/interpolation, live vi↔en/Dismiss/toast/browser layouts; eight independent source control pairs0pixel |
| F16 | Shared AST resolver/export rules/frontend layers/public symbols/view-controller guard/runtime cycles; no legacy exemption mechanism after FR-07 | ac6012ff/040e89fb + FR-07; negative static/dynamic/require/type/private/cycle/role fixtures and actual graph; [FR-01](evidence/FR-01/verification.json) |
| F17 | Recursive web discovery and domain entry; owner/mode/check IDs; risk matrix; lint covers active visual/reference helpers | ac6012ff/004eb1e4; runner discovery/selection/failure propagation, actual TAP/scenarios; [FR-06](evidence/FR-06/verification.json) |
| F18 | Exclusive test-results outputs; no default WU writes in active data/People/Teams entries; build retained with affected/skip-tests; reports actual skips/failure/counts | ac6012ff/004eb1e4; option combinations + overwrite/symlink/spawn/timeout/failure/incomplete browser report tests; real remaining selection5skips→partial |
| F19 | Small browser session/server/request decoder/report/output owners used by People/Teams/accessibility; domain has own test/typecheck/discovery | 004eb1e4; actual People6/Teams7 + negative startup/port/launch/timeout/cancel;4pure date cases moved once with syntax proof, integration remains web |

Tất cả findings có resolution trong phạm vi. FR-07 gỡ `mock/task-fields.ts`, `useTaskBoardDataset.ts`, empty legacy allowlist và ceiling. Historical WU reproduction scripts có thể nhắc owner cũ: dùng checkout lịch sử, không chạy chúng như active gates. Role/public-surface policy vẫn là guard lâu dài, không phải exemption. Public API có consumer thật; không dùng wildcard miễn kiểm tra.

## Walkthrough task: sửa due date từ List

1. Route `_shell.w.$workspaceId.tasks.tsx` compose `WorkspaceTasks`; wrapper lấy workspace và canonical Router search qua app navigation/current-view. Same-route navigation không dựa vào initializer state.
2. `TaskListPage` compose `useTaskListDataset`/`useTaskDataset` qua một complete loader/key. `TaskList` và row controller nhận scope, DTO và commands; `TaskListView`/`TaskListRowView` render typed model/slots, phát patch intent.
3. `TaskFields`/`date-patch` tạo typed endpoint patch: crossing record clamp đầu còn lại, null chỉ xóa field chọn. Draft giữ input để schema xác nhận. `useTaskFieldCommands` captures scope/entity/session intent; pending/rollback không ghi đè draft/cache mới hơn.
4. `StudioClient` validates updateTask input/output. HTTP mode gửi canonical request và không fallback; mock mode dispatch operation-registry→task command handler→shared transaction. Relation/date/CAS guards và persist phải thành công trước live commit.
5. Query invalidation cập nhật scoped detail/list/summary/bootstrap và affected projections. UI effects kiểm captured intent; Undo chỉ có cho canonical command có descriptor, không tự snapshot restore.
6. Bằng chứng: web date/command/CAS tests, browser-controllers List/Table/Drawer/draft, URL late-scope cases và HTTP bundle isolation. Không suy backend correctness từ mock/intercepted browser.

## Walkthrough ngoài task: Teams create/update/delete và Undo

1. Routes `_shell.w.$workspaceId.teams*` validate teamId và compose directory/detail controller. `TeamDetail` queries team/summary; transient editor thuộc workspace TeamOverlayHost.
2. `TeamFormDialog` render controlled values, required Field bindings và typed submit; TeamOverlayHost giữ draft/confirmation. Existing public `useProjectCommands` is the CAS-refresh wrapper around shared command lifecycle; this is an explicit cross-feature public import, not a separate DTO cache or hidden view data import.
3. Typed createTeam/updateTeam/deleteTeam passes StudioClient schemas; adapter dispatches `mock/teams.ts`. Same aggregate `transactMock` preserves team/member/project relationships and bounded lifecycle inverse. A stale version returns409 and commits nothing.
4. Controller retains attempted values after500/409 and refreshes canonical version for real retry; success invalidates team/member/project/bootstrap projections. Undo calls undoCommand with descriptor; failed Undo retains retry, never pretends restored state.
5. `teams-http` runs real dist-http with intercepted canonical operations backed by mock client: loading, summary500, create500, actual stale409, delete500, Undo500/retry, removed selector choices and deleted detail404. All7case IDs and request audit appear in FR-06/final reports; no email/backend/live service claims.

## Verification and limits

[Active manifest](../../tests/frontend/manifest.mjs), [commands](../../tests/frontend/README.md), [risk matrix](FRONTEND_REGRESSION_MATRIX.md), [final evidence](evidence/FR-07/verification.json). Checks cover current non-API types/consumers/lint/import graph, unit/adapter/contracts/domain/i18n, mock/HTTP builds, HTTP graph, six browser suites and affected independent source visuals. Source pinned904205c626918ee96054eb35495c394a60c0c601; tokens/tolerances/masks/baselines and WU evidence untouched.

Pure tests migrate gradually: domain owns4date/range cases moved without duplicate runs; web still owns seed-based geometry/adapter/cache integration. Historical M2/whole-app source pixel debt remains as recorded. No API/D1/R2/live acceptance or production-ready claim. Full clean install still depends on private API registry access from the environment; already-installed scoped frontend dependencies pass the actual gates without bypassing registry policy.

Rollback: revert each phase behavior/structural commit with its consumers; current persisted namespaces/shapes are compatible. Keep format-only commits and evidence. Do not delete localStorage, mutate pinned source, regenerate goldens or overwrite WU reports as rollback.
