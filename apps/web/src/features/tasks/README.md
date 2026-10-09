# Shared task fields, query, List, Drawer and Board ownership (WU-08..12)

`TaskFields` composes the same controlled editors in row, detail and draft
contexts. `TaskFieldTarget` distinguishes a record `{workspaceId, taskId}` from
a draft `{draftId}`. The controller owns open state and retains attempted values
after a validation or transport error; a draft never invokes the API. There is
one `MemberIdentity` adapter from AvatarBase and one small `ProjectIdentity`
adapter for later project consumers.

`useTaskFieldCommands` captures the starting DTO and target for each mutation.
Its optimistic `getTask` cache value preserves the existing response envelope;
rollback only removes the value that this transaction owns. Responses cannot
clear another task's draft or overwrite a newer cached version. Successful
commands invalidate scoped projections. `setTaskCompletion` and bulk Delete expose their
canonical Undo descriptors; ordinary field/status patches do not. Undo calls
`undoCommand`, never restores a workspace snapshot.

`TaskViewToolbar` and its filter/sort/group/column controls receive a controlled
`TaskViewState`. URL configuration is normalized separately from named saved
view DTOs; changing the current view does not persist a saved definition.
`packages/domain` owns normalization, filter/sort/group/progress, data-only row
models and column definitions. Due Today/Next 7 days overlap and source null
ordering are preserved; equal sort values use the API's ascending ID tie-breaker.

WU-09 extends scoped mock operations with createTask, title updateTask,
bulkMutateTasks patch/delete and updateSubtask done-only aggregate completion.
WU-11 extends these same owners with sanitized rich description, full subtask CRUD/detail and collaboration. All mutable
relations validate immediately through the shared domain helper. Dependency
cycles return409, invalid scope/self/date values400, stale versions409; rejected
commands commit no state. Changed incoming dependency references bump the
referenced task versions. Project field moves allocate a monotonic destination
key and migrate attachment project/version ownership atomically.

The standalone `task-fields.html` gallery and race probe are QA entry points,
excluded from the HTTP app graph. They test two contexts for the same record,
an independent draft and pending response races. WU-10 owns drawer content/description/forms; WU-11 extends the existing
subtask completion seam into CRUD/detail; WU-16 extends the project wrapper.
WU-12 adds Board below; Table and later query surfaces keep their own work units.

`TaskList` owns row/group/composer/selection/drag UI; `TaskListRow`,
`TaskGroupHeader`, `TaskMiniRow` and `BulkActionBar` are shared components.
`TaskListScope` and `TaskListModel` specify context and behavior. WorkspaceTasks
and MyTasksList are canonical pages; Project and saved List use the same feature
harness until WU-16. My Tasks uses fixed groups, completion and no row drag.
The typed composer handle lets the page header start creation even when filtered
empty; creation requires an accessible project. UI draft/attempt/selection stays
local, while complete cursor-loaded DTOs stay in Query. Placeholder query data
keeps the toolbar mounted while a new query resolves, with explicit busy/coverage
state. There is no virtualization or infinite-scroll UI.

List commands capture task versions, invalidate shared projections and preserve
error drafts. Reorder sends normalized scope/neighbors/groupPatch, then changes
the current sort to manual on success. Ordinary bulk patches/reorder have no
Undo. Bulk Delete confirms, retains internal tombstones/associations and returns
a bounded actor-owned canonical inverse. Undo guards every target's post-version
and lifecycle atomically, retracts only its delete events, and replays idempotently.
It never restores a workspace snapshot or overwrites later edits. Tombstones,
request fingerprints and inverse records are adapter metadata, absent from DTOs.
Inactive dependency targets project out of active DTOs; retained relations survive
scalar patches, explicit replacement rejects deleted targets, and explicit removal
bumps the referenced version to guard Undo. Create retries dedupe by actor/request.

Canonical page view changes use Router search and keep `view` through task-open/
close/reload. The decoder accepts raw feature-harness JSON and Router-quoted JSON. `onTaskOpen` uses the WU-07 workspace intent; double-click title editing
closes that intent before focus/select. Full Drawer and source-visible More use the shared WU-10/11 TaskOverlayHost. QA initial List
state/prefetch only prepares symmetric screenshots; actual mouse/keyboard probes
exercise ordinary state updates. `task-list.html` is excluded from HTTP builds.

Bulk selection may exceed the POC20-task command limit; such an attempt reports
canonical PAYLOAD_TOO_LARGE413 before writes and keeps selection unchanged.
The client never chunks one purported atomic command into multiple commits.


`TaskBoard`, `TaskBoardColumn` and `TaskBoardCard` own one shared Board renderer.
Workspace Tasks switches List/Board through Router mode search; My Tasks keeps
its List. Project/saved Board use the same controlled feature until WU-16.
Five status columns are284px open/44px collapsed, with per-column vertical and
Board horizontal scroll. No card selection or List bulk bar is rendered.

The filtered view and complete unfiltered column dataset read the same Query
records. The column loader follows every cursor and checks an independently
matching summary count before declaring complete coverage. Column complete,
archive and priority sort submit one full ID/version set to `bulkMutateTasks`;
the20-item limit rejects atomically, without browser chunking. Priority sort
returns no Toast/Undo and computes safe integer100 gaps in the adapter. These
preserve per-column priority order, while global manual List interleaving may
differ from the source fractional .001 positions (explicit WU-12 decision).

Trusted native drag submits full destination scope, status and canonical
neighbors. Toolbar filters remain unchanged, so a status transition can remove
the card from the view. Collapsed columns reject drops. Escape, invalid drop or
command failure changes no canonical record; drag-end suppresses click and
clears drop marks. Timers are cleaned up on unmount. Pending creation locks
composer cancel/switch until completion; recoverable draft/request identity
stays local. Reused fields, completion, column Undo and TaskOverlayHost invalidate
the same records used by List/Drawer/My Tasks. Real mock attachment IDs persist,
with bytes honestly unavailable until the HTTP/R2 owner in WU-35.

`task-board.html` is a QA entry excluded from the HTTP application graph. Snapshot
composer state explicitly queries one real Backlog task on both sides, so the
card and input are inside the accepted viewport; native unfiltered composer,
focus/scroll, persistence and the actual AppShell M1 journey are separate probes.

WU-13 adds TaskTable/TaskTableHeader/TaskTableRow/TaskTableMobileCard. Workspace
Tasks enables Table in the existing mode switch; /task-table.html is controlled
feature evidence for Workspace/Project/saved variants. Full Project wrapper is
still WU-16. Registry/sort/group remain domain-owned; shared field/task commands
keep cache records consistent with List/Board/Drawer. Local personal column
preferences use task8.ui.task-columns.v1 scoped workspace/project/saved IDs;
Reset widths does not reset visibility. Native HTML table, measured resize64px
minimum and60ms sort suppression; mobile flat cards at≤640. No bulk UI/grid
framework. Editors validate existing task schema, keep draft/error and focus once
per edit intent; estimate clear=null.

Commands: pnpm visual:task-table, pnpm test:task-table:interactions,
pnpm verify:task-table. A gate invocation with --retain-table-visual re-verifies
frozen41/82 hashes from the separately executed successful full Table matrix,
without pretending to rerun it; normal verify reproduces the full matrix.

Table fields pass a stable TD popupAnchorRef while retaining the internal button
for return focus. Padding click toggles, and field owners reset query/month on
open transitions. Shared Date uses the original calendar-only body everywhere;
failed picker attempts keep draft/error while schema/range validation stays in
canonical commands. Choice search uses the source plain input, and printable
Menu typeahead permits normal typing into text editors.

Focused commands: node tests/visual/task-table/popovers.mjs (five Table anchors
and actual Drawer Due), node tests/visual/task-table/supplemental-gates.mjs.
The six accepted pairs do not cover the extra Workspace/Project List Date raster
diagnostics retained as explicit M2 parity debt.


WU-14 reuses `loadTaskViewDataset` as a pure canonical loader (the Board hook
reexports it) for Calendar due-range data and full-scope legend. It strips
caller paging state, consumes all cursors and checks summary count; chips/count/
overflow never use the first200 as a whole scope. Calendar rescheduling reuses
updateTask/version guards/cache and domain rescheduleDateOnly; no date Undo.
Typed TaskFormDefaults belongs to tasks, and Calendar day add seeds the existing
full form through TaskOverlayHost/AppShell. Fresh seeded open resets cancelled
fields while busy/frozen submissions preserve original payload/recovery identity.
My Tasks exposes List/Calendar; Workspace Tasks keeps List/Board/Table, with
Workspace Calendar on its dedicated existing route. Event preview is read-only.
