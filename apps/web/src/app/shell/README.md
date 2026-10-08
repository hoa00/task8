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
this unit does not render drawer content or fake a successful task read.
Workspace changes cancel old requests, clear scoped selection and replace stale
task intent in the destination URL. The router's navigation scope is a transient
route identity, never a copy of session or bootstrap server data.

ContentViewport is the nested scroll host. TanStack restoration uses its stable
`main-content` ID; normal navigation starts at zero and history restores the
saved position. Title/live region, first-tab skip control, mobile focus trap,
Escape/scrim focus return and closed offcanvas inertness belong to the shell.
Mobile and desktop keep the source inclusive 900/640 boundaries, dimensions and
safe-area CSS. Emulated viewport checks do not prove physical device insets.

## Pending feature and action ledger

| Surface/action | Owner | Current behavior |
|---|---|---|
| Home / Workspace Overview content | WU-17 | Pending route outlet, excluded from shell crops |
| Task fields/filter engine | WU-08 | Shared controlled fields/domain engine and standalone QA gallery implemented; page consumers remain with their owners |
| Workspace/Project/My Tasks lists | WU-09 | Pending route outlet |
| Task drawer/forms | WU-10/11 | Single overlay slot; no drawer business UI |
| Board / Table / Calendar / Timeline | WU-12/13/14/15 | Fixed route hosts |
| ProjectHeader, tabs, ProjectPage, project CRUD/reorder/options, Favorites/saved-view composition | WU-16 | Minimal project context/outlet; identity read only; action controls aria-disabled |
| Palette / Search / Activity | WU-18 | Search link resolves Search; palette remains pending |
| Inbox / Notifications | WU-19 | Navigation and aggregate badges only |
| Member/profile/account / Teams/new team | WU-20/21 | Entity route validation; future action controls aria-disabled |
| Files / preview `fileId` | WU-22 | Validated identity search seam; content pending |
| Settings/preferences/security/billing | WU-23/24/25 | Validated section hosts |
| Auth / Onboarding | WU-26/27 | Routes/search validation; content pending |
| Archive, Design system/System states, shortcuts/help extras | WU-28 | Reachable route hosts; gallery content/extra commands pending |
| Topbar New/Create | WU-10/16/21/28 | Visible source control, aria-disabled; no fake success toast |

`ShellHarness` and `shell-harness.html` contain only controlled test fixtures.
The latter supplies a synthetic empty second workspace and delayed old response
through the same validated StudioClient/Query/Router. They do not change the
ordinary mock adapter, which returns404 for catalog workspaces lacking data.
The harness HTML is excluded from the main/HTTP-only entry graph.
