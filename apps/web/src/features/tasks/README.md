# WU-08 task field and view seam

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
commands invalidate scoped projections. Only `setTaskCompletion` exposes the
canonical Undo descriptor; ordinary field/status patches do not. Undo calls
`undoCommand`, never restores a workspace snapshot.

`TaskViewToolbar` and its filter/sort/group/column controls receive a controlled
`TaskViewState`. URL configuration is normalized separately from named saved
view DTOs; changing the current view does not persist a saved definition.
`packages/domain` owns normalization, filter/sort/group/progress, data-only row
models and column definitions. Due Today/Next 7 days overlap and source null
ordering are preserved; equal sort values use the API's ascending ID tie-breaker.

Mock adds only getTask/listTasks/getTaskSummary/updateTask/moveTask/
setTaskCompletion/undoCommand. UpdateTask currently accepts these fields only;
title/description editing remains unavailable for its owning unit. All mutable
relations validate immediately through the shared domain helper. Dependency
cycles return409, invalid scope/self/date values400, stale versions409; rejected
commands commit no state. Changed incoming dependency references bump the
referenced task versions. Project field moves allocate a monotonic destination
key and migrate attachment project/version ownership atomically.

The standalone `task-fields.html` gallery and race probe are QA entry points,
excluded from the HTTP app graph. They test two contexts for the same record,
an independent draft and pending response races. WU-09 owns list rendering and
drag interaction; WU-10/11 owns drawer/forms and task text/CRUD; WU-16 extends
the existing project adapter. No complete List/Board/Table or custom query
platform is supplied here.
