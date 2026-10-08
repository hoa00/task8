# Shared task fields, query and List ownership (WU-08/09)

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
Description and full subtask CRUD/detail remain unavailable for later owners. All mutable
relations validate immediately through the shared domain helper. Dependency
cycles return409, invalid scope/self/date values400, stale versions409; rejected
commands commit no state. Changed incoming dependency references bump the
referenced task versions. Project field moves allocate a monotonic destination
key and migrate attachment project/version ownership atomically.

The standalone `task-fields.html` gallery and race probe are QA entry points,
excluded from the HTTP app graph. They test two contexts for the same record,
an independent draft and pending response races. WU-10 owns drawer content/description/forms; WU-11 extends the existing
subtask completion seam into CRUD/detail; WU-16 extends the project wrapper.
Board/Table/custom query platforms remain with their later owners.

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
closes that intent before focus/select. Drawer content is pending WU-10, and
source-visible More is explicitly unavailable until that owner. QA initial List
state/prefetch only prepares symmetric screenshots; actual mouse/keyboard probes
exercise ordinary state updates. `task-list.html` is excluded from HTTP builds.

Bulk selection may exceed the POC20-task command limit; such an attempt reports
canonical PAYLOAD_TOO_LARGE413 before writes and keeps selection unchanged.
The client never chunks one purported atomic command into multiple commits.
