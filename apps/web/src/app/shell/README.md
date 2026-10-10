# WU-07 shell and navigation ownership

One pathless `_shell` route keeps AppShell mounted across workspace pages,
project outlets and both `/dev` galleries. WorkspaceContext carries only the
workspace ID. Components subscribe to the WU-06 Query bootstrap; no DTO is copied
into context or a UI store. Query keys, cancellation and the typed StudioClient
remain the data boundary.

The POC Vite build includes `/dev/design-system` and `/dev/system-states`.
Their direct entry resolves the session workspace; Help preserves the current
workspace through validated `workspaceId` search. Gallery content belongs to
WU-28. Standalone WU-03/04/05 harnesses retain their existing verification role.

Canonical builders and exact source startup aliases live in `navigation.ts`.
Unknown fragments, prototype keys and `#project/<id>` are never interpreted.
Aliases replace history before Router initialization. Root/workspace/project/
settings indexes use a complete destination and replace the intermediate entry.
The project `$view` allowlist contains exactly eight tabs. Static `views` is a
separate route and validates saved-view ownership through `listSavedViews`.

Router owns `taskId`. `useWorkspaceIntents().openTask/closeTask` is the typed
contract for WU-09/10. There is one overlay provider and one task overlay slot;
TaskOverlayHost renders the shared drawer and task forms against canonical reads.
Workspace changes cancel old requests, clear scoped selection and replace stale
task intent in the destination URL. The router's navigation scope is a transient
route identity, never a copy of session or bootstrap server data.

ContentViewport is the nested scroll host. TanStack restoration uses its stable
`main-content` ID; normal navigation starts at zero and history restores the
saved position. Title/live region, first-tab skip control, mobile focus trap,
Escape/scrim focus return and closed offcanvas inertness belong to the shell.
Mobile and desktop keep the source inclusive 900/640 boundaries, dimensions and
safe-area CSS. Emulated viewport checks do not prove physical device insets.

## Integrated feature and action ownership

| Surface/action | Owner | Current behavior |
|---|---|---|
| Home / Workspace Overview content | WU-17 | Separate dashboard compositions with complete canonical aggregates/cursor reads; content acceptance independent of shell crops |
| Task fields/filter engine | WU-08 | Shared controlled fields/domain engine and standalone QA gallery implemented; composed by task pages, drawer, Inbox and project consumers |
| Workspace/Project/My Tasks lists | WU-09 | Shared task list renderer with canonical workspace/project/my-task scope |
| Task drawer/forms | WU-10/11 | Single overlay slot with shared drawer, comments, files and canonical task forms |
| Board / Table / Calendar / Timeline | WU-12/13/14/15 | Shared view engines composed by workspace, project and My Tasks consumers |
| ProjectHeader, tabs, ProjectPage, project CRUD/reorder/options, Favorites/saved-view composition | WU-16 | Full project wrapper, header, fixed/saved tabs and canonical project commands |
| Palette / Search / Activity | WU-18 | Canonical search/activity pages and shared command palette |
| Inbox / Notifications | WU-19 | Canonical notification pages, Inbox task preview and shared comments |
| Member/profile/account / Teams/new team | WU-20/21 | Canonical people/team pages, forms and shared identity components |
| Files / preview `fileId` | WU-22 | Shared project/task files, preview and typed file commands |
| Settings/preferences/security/billing | WU-23/24/25 | Preferences and workspace settings with typed capability boundaries |
| Auth / Onboarding | WU-26/27 | Complete auth/onboarding presentation with canonical session/setup flows |
| Archive, Design system/System states, shortcuts/help extras | WU-28 | Archive and both dev galleries with implemented commands |
| Topbar New/Create | WU-10/16/21/28 | Task/project/team forms and canonical extras |

`ShellHarness` and `shell-harness.html` contain only controlled test fixtures.
The latter supplies a synthetic empty second workspace and delayed old response
through the same validated StudioClient/Query/Router. They do not change the
ordinary mock adapter, which returns404 for catalog workspaces lacking data.
The harness HTML is excluded from the main/HTTP-only entry graph.

WU-09 List pages preserve their feature-owned normalized `view` search string
through canonical task-open/close navigation. The shell validates its bounded
string shape; task features own decoding. Title edit closes the task intent before
focusing the inline input. TaskOverlayHost renders the shared drawer for that task intent.
