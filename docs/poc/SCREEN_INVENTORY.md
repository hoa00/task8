# Danh mục màn hình, trạng thái và route

## 1. Phạm vi và mức độ xác minh

Nguồn tham chiếu: [gr8rstudio/gr8r-studio tại commit 904205c626918ee96054eb35495c394a60c0c601](https://github.com/gr8rstudio/gr8r-studio/tree/904205c626918ee96054eb35495c394a60c0c601). Mọi source anchor trong tài liệu trỏ đến commit này, không trỏ đến `main` đang thay đổi.

Tài liệu này là **inventory đã đối chiếu mã nguồn** để triển khai React/TypeScript/Vite/TanStack Router/Tailwind. Phiên phân tích chưa có bộ ảnh baseline đầy đủ cho từng màn hình/trạng thái và chưa thực hiện pixel diff React so với nguồn. WU-00 phải tạo bộ baseline từ source chạy thật trước khi bắt đầu chuyển giao diện. Không được coi việc đọc CSS hoặc build thành công là bằng chứng pixel-perfect.

Kiểm đếm chính xác từ [router nguồn][s-router] và [project tabs][s-project]:

- `ROUTE_NAMES`: **20** keys; không có key `project`.
- `renderPage()` mapping: **21** route keys, đã bao gồm `project`.
- Project: **8** tabs cố định; saved views là tab bổ sung ngoài 8 tabs.
- Form tạo saved view: **3** layout lựa chọn: List, Board, Table.
- Settings: **21** sections.
- Auth: **7** screen states, cộng **6** bước onboarding.
- Modal switch: **10** types; popover switch: **28** types, chưa tính select menu và mention menu độc lập.

Các con số trên mô tả những loại surface khác nhau; không cộng tất cả để công bố một “tổng số màn hình” giả chính xác. Một route có thể chứa nhiều layout, tabs, overlay và trạng thái dữ liệu. Danh mục giữ cả màn bình thường, lỗi, rỗng, loading và các màn demo có sẵn.

## 2. Quy ước route đích

Route đích dưới đây là **quyết định thiết kế cho bản React**, không phải URL nguồn đã hỗ trợ. Browser canonical root cho workspace là `/w/$workspaceId`. `$workspaceId`, `$projectId`, `$memberId`, `$teamId`, `$savedViewId` là các tham số TanStack Router; không được hardcode dữ liệu seed trong component.

Các page component chỉ phối hợp dữ liệu và shared components. Đổi route không remount toàn bộ AppShell. Back/Forward, mở URL trực tiếp, refresh, selected navigation, title, scroll restoration và overlay focus phải có hành vi nhất quán.

`/w/$workspaceId` redirect đến trang launch preference hợp lệ, mặc định `/w/$workspaceId/home`. `/w/$workspaceId/projects/$projectId` redirect đến `/w/$workspaceId/projects/$projectId/board`; `/w/$workspaceId/settings` redirect đến `/w/$workspaceId/settings/appearance`. Route với ID không tồn tại đi vào NotFound; private project đi vào AccessDenied theo bộ quy tắc dữ liệu POC. UI kiểm tra quyền không thay thế quy tắc của API.

### 2.1. 21 route keys của shell

| Screen ID | Legacy route + params | Canonical path React | Surface và state bắt buộc | Nguồn |
|---|---|---|---|---|
| SC-01 | `home` | `/w/$workspaceId/home` | Greeting/date; stats; My Tasks upcoming/overdue/completed; project progress; deadlines; activity; empty task tabs | [Home][s-home] |
| SC-02 | `inbox` | `/w/$workspaceId/inbox` | All/Mentions/Assignments/Comments/Updates, unread-only, selected/unselected, task conversation/project notice; desktop split/mobile preview | [Inbox][s-inbox] |
| SC-03 | `mytasks` | `/w/$workspaceId/my-tasks` | List/Calendar; fixed Overdue/Today/Upcoming/Completed groups; completion mode; empty groups | [My Tasks][s-mytasks] |
| SC-04 | `favorites` | `/w/$workspaceId/favorites` | Favorite project grid + favorite task mini rows; independent empty states | [Favorites][s-favorites] |
| SC-05 | `notifications` | `/w/$workspaceId/notifications` | All/Unread, day buckets, unread highlight/count, mark-all-read disabled state | [Notifications][s-notifications] |
| SC-06 | `search` | `/w/$workspaceId/search` | Query/recent, all/tasks/projects/people/files/comments, highlighted matches, no results | [Search][s-search] |
| SC-07 | `overview` | `/w/$workspaceId/overview` | Portfolio, stats, status chart, workload, upcoming milestones | [Overview][s-overview] |
| SC-08 | `projects` | `/w/$workspaceId/projects` | Grid/List/Table, query/status/sort, empty, no results, restricted private cards | [Projects][s-projects] |
| SC-09 | `project`, `{id, tab}` | `/w/$workspaceId/projects/$projectId/$view` | ProjectHeader + 8 tabs; shared task views hoặc project-specific content; denied/404 | [Project][s-project] |
| SC-10 | `tasks` | `/w/$workspaceId/tasks` | Shared List/Board/Table theo workspace scope; filter/sort/group/columns | [Tasks][s-tasks] |
| SC-11 | `calendar` | `/w/$workspaceId/calendar` | Shared Month/Week calendar, workspace tasks+events, navigation/day overflow | [Calendar][s-calendar] |
| SC-12 | `timeline` | `/w/$workspaceId/timeline` | Shared timeline, workspace tasks+milestones, default grouping theo project khi khởi tạo | [Timeline][s-timeline] |
| SC-13 | `members` | `/w/$workspaceId/members` | Members/Teams/Roles & permissions; query/role; invited/active/deactivated | [Members][s-members] |
| SC-14 | `member`, `{id}` | `/w/$workspaceId/members/$memberId` | Profile, metrics, Assigned/Completed, active projects/activity; invited/presence; 404 | [Member detail][s-member] |
| SC-15 | `teams` | `/w/$workspaceId/teams` | Team grid, empty, new-team action | [Teams][s-teams] |
| SC-16 | `team`, `{id}` | `/w/$workspaceId/teams/$teamId` | Team identity, projects, tasks, members, edit/invite actions; 404 | [Team detail][s-teams] |
| SC-17 | `activity` | `/w/$workspaceId/activity` | All/status/comments/projects + person filters, day groups, empty | [Activity][s-activity] |
| SC-18 | `settings`, `{sec}` | `/w/$workspaceId/settings/$section` | SettingsLayout + 21 sections bên dưới, own scroller, mobile navigation | [Settings][s-settings] |
| SC-19 | `system` | `/dev/design-system` | Gallery dùng chính React primitives/composites đã triển khai; demo controls reachable | [Design system][s-design] |
| SC-20 | `states` | `/dev/system-states` | Empty/loading/error/confirmation gallery; offline demo | [System states][s-states] |
| SC-21 | `archive` | `/w/$workspaceId/archive` | Tasks/Projects tabs, restore/delete permanently, empty states | [Archive][s-archive] |

`/dev/design-system` và `/dev/system-states` thuộc chế độ phát triển của POC và dùng cùng AppShell/current-workspace provider như source. Giữ đường đi từ Help & resources; direct entry phải resolve workspace hợp lệ từ session/launch preference hoặc fixture trước khi render. Không tạo page trắng thiếu sidebar/topbar cho hai gallery. Chế độ build/distribution của gallery theo cấu hình POC trong tài liệu kiến trúc.

Các query params được validate bằng TanStack Router. Cần tối thiểu query/shareable state cho Search (`q`, `category`), view mode của Tasks/My Tasks/Projects, task drawer (`taskId`) và file preview (`fileId` trên route Files). Không đưa DOM anchor, transient hover, password, textarea draft hay tọa độ popover lên URL. Query key và persistence cụ thể phải dùng cùng contract của app, không mỗi màn tự đặt tên.

### 2.2. Project tabs và saved views

| Screen ID | Legacy `tab` | Path React sau `/w/$workspaceId/projects/$projectId` | Thành phần |
|---|---|---|---|
| PR-01 | `overview` | `/overview` | Project Overview composition: About, Progress, Coming up, Details, Milestones, Activity |
| PR-02 | `board` | `/board` | Shared TaskBoard + project toolbar |
| PR-03 | `list` | `/list` | Shared TaskList + project toolbar |
| PR-04 | `table` | `/table` | Shared TaskTable + project toolbar |
| PR-05 | `calendar` | `/calendar` | Shared CalendarView, tasks + project events |
| PR-06 | `timeline` | `/timeline` | Shared TimelineView, project milestones |
| PR-07 | `files` | `/files` | Project Files grid/list + filter/upload/preview |
| PR-08 | `activity` | `/activity` | Project ActivityFeed có activity + comment records |
| PR-SV | `v:<savedViewId>` | `/views/$savedViewId` | Layout đã lưu: List, Board hoặc Table + filters |

Nguồn: [8 tabs, state keys và task-view composition][s-project]; [3 lựa chọn saved-view layout][s-modals]. `$view` là union của 8 giá trị cố định. Nhánh static `/views/$savedViewId` được khai báo riêng để tránh dùng prefix `v:` trong canonical URL.

Project views mặc định dùng chung key `p:<projectId>`; saved view dùng `sv:<savedViewId>`. Trạng thái filters đang truyền qua các tab trong source. Giữ quyết định đó ở controller; không vô tình tạo view state mới mỗi lần đổi tab. Không thêm lưu Calendar/Timeline vào saved view chỉ vì renderer chung có thể hỗ trợ: giao diện tạo saved view nguồn chỉ có 3 lựa chọn.

File preview link là `/w/$workspaceId/projects/$projectId/files?fileId=$fileId`. Kiểm tra ownership của cả ba ID và quyền trước khi mở. Case bắt buộc: copy link, mở tab mới, reload, Back/Forward, Close từ direct entry và file đã bị xóa/không được phép xem. Dùng cùng FilePreviewDialog với drawer attachments; link từ drawer đến Files phải giữ file identity.

### 2.3. 21 Settings sections

Tất cả paths ở bảng này nằm sau `/w/$workspaceId/settings/`; legacy là `route=settings`, `params.sec=<section>`. [Nguồn menu và renderer Settings][s-settings].

| Screen ID | Group | Section / suffix | Các state cần kiểm tra |
|---|---|---|---|
| SE-01 | General | `workspace` | Name/URL/icon color, save, delete workspace confirmation |
| SE-02 | General | `appearance` | Light/Dark/System; 6 accents; sidebar density 2; task density 2; motion system/reduce/full |
| SE-03 | General | `language` | Language select + spellcheck toggle; giữ selection behavior nguồn, không tự thêm bản dịch |
| SE-04 | General | `datetime` | Timezone/date format/time format/week start controls hiện có |
| SE-05 | Workspace | `members` | Current membership summary, action đến Members, invite; dùng people components |
| SE-06 | Workspace | `teams` | Reuse TeamGrid; điều hướng từ team cards |
| SE-07 | Workspace | `projects` | Project list/settings actions trong Settings surface |
| SE-08 | Workspace | `permissions` | Role/permission matrix dùng chung với Members |
| SE-09 | Notifications | `notif-email` | Email toggles hiện có |
| SE-10 | Notifications | `notif-push` | Push toggles hiện có |
| SE-11 | Notifications | `notif-mentions` | Mentions preferences hiện có |
| SE-12 | Notifications | `notif-assign` | Assignment preferences hiện có |
| SE-13 | Personal | `profile` | Avatar initials, name/title fields, validation/save |
| SE-14 | Personal | `preferences` | Launch page, task side/full view, confirm-delete preference |
| SE-15 | Personal | `shortcuts` | Shortcut groups/keys đồng nhất với ShortcutsDialog |
| SE-16 | Security | `password` | Normal/error/success, password strength, save |
| SE-17 | Security | `sessions` | Current session vs other sessions; sign out confirm |
| SE-18 | Security | `2fa` | Disabled/setup/invalid code/enabled/disable confirm; đây là demo |
| SE-19 | Billing | `plan` | Current plan, usage meters, Free/Team/Business cards, upgrade/downgrade confirm |
| SE-20 | Billing | `payment` | Static card/billing details; Update/Edit chỉ phản hồi toast trong nguồn |
| SE-21 | Billing | `invoices` | Invoice table readonly, horizontal scroll khi cần |

Không thêm annual/monthly toggle, card-entry form hoặc invoice-download vào scope: những điều đó không tồn tại trong [Billing source][s-billing]. Giá/renewal/usage là nội dung demo để giữ baseline, không phải đề xuất bảng giá của sản phẩm đích.

### 2.4. Auth và onboarding

Auth nằm ngoài workspace AppShell và dùng AuthLayout. Mapping dưới đây dùng query `state` chỉ cho các màn kết quả vốn có trong nguồn; data tài khoản/demo state nằm trong flow controller. [Auth source][s-auth].

| Screen ID | Legacy `S.ui.auth` | Path React | State bắt buộc |
|---|---|---|---|
| AU-01 | `login` | `/login` | Email/password, show/hide, remember, social buttons, validation/loading/login error |
| AU-02 | `signup` | `/signup` | Name/email/password, strength, validation/loading, social buttons |
| AU-03 | `forgot` | `/forgot-password` | Email form, validation/loading |
| AU-04 | `forgot-sent` | `/forgot-password?state=sent` | Confirmation, resend, demo reset-link button |
| AU-05 | `reset` | `/reset-password` | Password+confirm, strength, validation/loading |
| AU-06 | `reset-done` | `/reset-password?state=done` | Success notice và Sign in |
| AU-07 | `verify` | `/verify-email` | Waiting status, verified action, resend timer/disabled/change email |

Trong source, `forgot-sent` và `reset-done` là internal screen states, không nằm trong hash parser khởi tạo. URL React là cải tiến khả năng định tuyến có chủ đích, phải giữ UI tương ứng; invalid `state` được normalize về form chính.

Onboarding dùng `/onboarding?step=<0..5>`, validate range, lấy dữ liệu từ cùng onboarding draft. Direct entry với prerequisite chưa có phải quay về bước hợp lệ trước đó; screenshot fixture được phép thiết lập draft đầy đủ để chụp mỗi bước. Đây là 6 bước đã có, không thêm bước mới. [Onboarding source][s-onboarding].

| Screen ID | Legacy `S.ui.onb` | Nội dung |
|---|---|---|
| ON-01 | `0` | Use case: Product/Design/Marketing/Engineering/Personal/Other |
| ON-02 | `1` | Workspace name + URL; validation; availability hint demo |
| ON-03 | `2` | Boards/Lists/Timelines/Tables; team size |
| ON-04 | `3` | First project name + templates |
| ON-05 | `4` | 3 invite fields, copy invite link, skip/send |
| ON-06 | `5` | Workspace/project/invite summary; Open workspace |

Giữ Back, Continue, Skip for now, Exit setup và progress indicator đúng từng bước. Social login, password recovery, verification, invite và 2FA tiếp tục theo phạm vi POC đã xác định; giao diện này không yêu cầu tích hợp thêm nhà cung cấp thật.

### 2.5. Legacy aliases và khác biệt với source

Source [main.js][s-main] đọc hash **một lần khi boot**, chấp nhận `#login`, `#signup`, `#forgot`, `#reset`, `#verify`, `#onboarding` và các keys có trong `ROUTE_NAMES`. Hàm [go()][s-go] thay đổi `S.ui`, không cập nhật browser location/history. Vì vậy:

- Viết adapter startup cho các aliases hash được nguồn hỗ trợ; resolve workspace mặc định rồi redirect `replace` sang canonical route.
- `#mytasks` → `/w/<workspaceId>/my-tasks`; `#settings` → `/w/<workspaceId>/settings/appearance`; `#system`/`#states` → gallery dev; 6 auth aliases theo bảng trên.
- Không mô tả `#project/<id>`, project tab hashes, hoặc hash changes sau boot như tính năng source đang hoạt động. Nếu hỗ trợ thêm, ghi là routing improvement của bản React.
- Source `copyLink` tạo URL mẫu `https://gr8rstudio.com/<workspace-slug>/task/<task-key>` hoặc project/file; nó không xây deep link của app nguồn. Bản React phải tạo URL canonical của chính app sau khi routing contract đã chốt, không tiếp tục copy domain mẫu. [Copy link source][s-copylink].
- Với legacy key cần ID (`member`, `team`) nhưng alias không cung cấp ID, normalize về list tương ứng hoặc NotFound theo route adapter; không tạo entity giả.

## 3. View engines và state contracts

Các engines sau được dùng chung giữa nhiều pages. Mỗi engine có một owner triển khai; page chỉ truyền scope/columns/state/actions. Xem [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md).

| Engine ID | Contexts thực tế | Các state/behavior giữ lại | Nguồn |
|---|---|---|---|
| VW-LIST | Tasks, My Tasks, Project List, Saved List | Query/filter/sort/group; header selection checked/partial; completion checkbox cho My Tasks; expandable subtasks; title inline edit; group collapse; composer; bulkbar; drag before/after/regroup; done/added; mobile stacked cards | [Shared task list][s-list] |
| VW-BOARD | Tasks, Project Board, Saved Board | 5 status columns; column collapse; cards with labels/subtask-progress/comments/attachments; hover actions; add composer; manual order/status drag; workspace project dot; empty columns | [Board][s-board] |
| VW-TABLE | Tasks, Project Table, Saved Table | 11 columns, hidden/resize/sort/group; sticky title+header; title/estimate edit; property popovers; empty filter results; alternate mobile cards | [Table][s-table] |
| VW-CAL | Workspace Calendar, Project Calendar, My Tasks Calendar | Month/Week, previous/next/today, weekStart, 35/42 cells; today/out-of-month; task and event rendering, max 3 + overflow, drag task date | [Calendar][s-calendar] |
| VW-TL | Workspace Timeline, Project Timeline | Weeks/Months scale, grouping, fixed rail/rows, bars/progress, labels inside/outside, dependencies, milestones collisions, today scroll, empty, date drag | [Timeline][s-timeline] |
| VW-FILE | Project Files | Grid/List, type/query/sort, dropzone, upload progress simulation, 8 file types, preview/context menu, empty/no results | [Files][s-files] |
| VW-PROJECT | Project catalogue; ProjectCard reuse in Favorites | Grid/List/Table distinct layouts, identity/status/lead/team/progress/dates; locked/private card; empty/no results | [Projects][s-projects] |
| VW-MINI | Home, Member, Team, Project Overview, Favorites | Shared TaskMiniRow with explicit display variants, completion action; no per-page copy | [Mini row][s-list] |
| VW-ACT | Home, Project Overview/Activity, Member, Workspace Activity | Shared ActivityItem, optional project label, grouped dates where needed; preserve exact composition per context | [Activity helper][s-list]; [Project Activity][s-project-overview] |

Trường bảng task: `title, status, priority, assignee, due, start, labels, deps, estimate, created, project`. Mặc định hidden `start, created, deps`; project context tự hidden `project`. List dùng widths khác bảng và có selection/grip/expand columns riêng; không ép List thành Table để giảm số component. [Table definitions][s-table] và [List definitions][s-list].

Các tính toán cần deterministic: due-date grouping, completed grouping, relative times, greeting, status counts/progress, current calendar date, timeline start window, chart ordering. Truyền `now`, `today`, date preferences và dataset rõ ràng từ controller/domain; không để presentation gọi `new Date()` ở nhiều nơi rồi cho kết quả khác nhau.

## 4. Overlay và transient state inventory

### 4.1. Task drawer

| State ID | Nội dung / phép kiểm |
|---|---|
| DR-01 | Side panel, full centered panel, mobile viewport; open từ List/Board/Table/Calendar/Search/Inbox dùng cùng TaskDrawer |
| DR-02 | Normal/overdue/completed notice; title edit; favorite; copy link; context menu; close; mark complete/reopen |
| DR-03 | 10 properties: status, priority, assignee, due, start, project, labels, repeat, estimate, dependencies |
| DR-04 | Description hiện có: contentEditable và 6 format commands bold/italic/unordered/ordered/heading/link; giữ HTML behavior vừa đủ cho source |
| DR-05 | Subtask list và detail; completion, title, assignee, due, note, parent backlink; previous/next disabled ở biên; convert-to-task; delete |
| DR-06 | Attachment cards, empty dropzone, simulated upload progress, remove, preview |
| DR-07 | Comments/Activity tabs; empty comments; comment draft/post/delete của mình; mention menu; reaction toggle/count |
| DR-08 | Popover trên drawer; modal trên drawer; nested confirm; focus return; scroll position không mất khi edit |

Nguồn: [Drawer][s-drawer], [Subtask detail][s-subtask]. Không thêm một rich-text editor platform, nested subtask hierarchy, dependency scheduling automation hoặc file storage service dưới danh nghĩa chuyển giao diện. Giữ các thao tác hiện hữu của prototype.

### 4.2. 10 modal types

| Modal ID | Legacy type | State / nội dung |
|---|---|---|
| MD-01 | `task` | New/Edit, validation, title/description/property chips, subtasks, attachments, Create more, submit loading |
| MD-02 | `project` | New/Edit, name/description, icons/colors, team/lead/target date, templates chỉ khi new |
| MD-03 | `share` | Project visibility, members, permissions, search/add member or email, copy link |
| MD-04 | `invite` | Multiple-email textarea, role/team, validation; local-demo result |
| MD-05 | `confirm` | Normal/destructive, optional typed-name requirement, disabled confirm until match |
| MD-06 | `prompt` | Label/value/confirm/cancel; rename targets |
| MD-07 | `shortcuts` | 4 shortcut groups, large dialog |
| MD-08 | `team` | New/Edit team fields, members behavior hiện có |
| MD-09 | `filePreview` | Type art tỷ lệ 16:9, metadata, optional attached task link, copy link, close |
| MD-10 | `saveView` | Name, List/Board/Table layout, current-filter count/no-filter hint |

Nguồn: [Modal dispatch và bodies][s-modals]. Generic Dialog chứa header/body/footer/focus/layer; form và actions thuộc feature owner, không đưa toàn bộ 10 forms vào `packages/ui`.

### 4.3. Popovers, select, menu

28 switch types trong [popovers source][s-popovers], nhóm theo owner:

| Popover group | Legacy types | State cần cover |
|---|---|---|
| Workspace/shell | `create, ws, user, help` | Menu content, selection, workspace/profile/help commands |
| Task properties | `status, priority, assignee, labels, project, recur, estimate, deps, date` | Single/multiple choice, unassigned/none, search, current, clear; date quick choices+calendar |
| Subtask | `subassignee` và `date` với `field=subdue` | Correct subtask target, không nhầm index sau reorder |
| Project/people | `pstatus, role` | Status/role options, current, Owner restrictions |
| View controls | `sort, group, cols, filter, fvals` | Sort direction, group options, column visibility, AND filters/is/is-not, multi values, clear/reset |
| Calendar | `daylist, event` | Overflow-day tasks/events; event details/project action |
| Comment | `emoji` | Reaction choices/toggle |
| Context | `ctx` | Task/project/column/member/file/savedview action lists |
| Bulk | `bulk-status, bulk-priority, bulk-assignee` | Apply to selected task IDs only |

Ngoài 28 types: Select control dùng native hidden select + custom popup trong nguồn; mention menu và command palette có renderer riêng. Bản React dùng Select/Popover primitives chung, không giữ `enhanceSelects()` post-render DOM replacement. [Select source][s-select]. Context menu có 6 targets: task, project, column, member, file, savedview. [Context menus][s-context].

Command palette modes `cmd/search/ws`, six search scopes, recent commands/results, keyboard highlight/up/down/enter, Tab/backspace switching và full search action. Toast queue gồm action Undo khi source có; tooltip giữ vị trí/visibility/focus theo component. [Palette][s-palette], [Keyboard][s-keyboard].

## 5. Ma trận adaptive, theme và chất lượng ảnh

Các giá trị CSS gốc nằm trong [tokens][s-tokens], [responsive rules][s-responsive], [shell CSS][s-shellcss], [overlay CSS][s-overlaycss]. Không thay breakpoint nguồn bằng `sm/md/lg` mặc định.

| Dimension ID | Biến thể | Surface đại diện / điểm cần check |
|---|---|---|
| DIM-01 | >1100px | Sidebar 252px, topbar 46px, gutter 24px; dashboard 2 cột tỷ lệ 1.55:1 |
| DIM-02 | <=1100px | Dashboard one column, topbar search hide text/key |
| DIM-03 | <=900px | Sidebar offcanvas 280px, gutter 16px, stats 2 cột, Settings horizontal nav, Inbox preview fullscreen, timeline rail 170px |
| DIM-04 | <=640px | Bottom nav, topbar 50px, stacked List, mobile Table cards, drawer 100vw, modal bottom sheet, calendar chip bars/weekstack, timeline rail hidden |
| DIM-05 | Light/Dark/System | Palette explicitly redefined; theme follow system, 6 accent pairs |
| DIM-06 | Sidebar comfortable/compact | Row 30/26px; độc lập Task display density |
| DIM-07 | Task comfortable/compact | List row 40/34px; Board card padding 10/8px; không assume mọi table row đổi giống list |
| DIM-08 | Sidebar expanded/collapsed | 252/52px; selected nav/tooltips/project collapse; thử persisted collapsed khi chuyển viewport |
| DIM-09 | Motion system/reduce/full | Settled image baseline và targeted animation/focus check; source full override nuance cần decision |
| DIM-10 | Date prefs | Week start, format, current date fixed; long labels, overdue/done/no-date |

WU-00 phải tạo manifest gồm screen ID, state ID, route, source commit, fixture/version, timestamp frozen, timezone/locale, browser/version, viewport, DPR, font assets/theme/accent/densities, scroll/overlay state và file screenshot. Base screenshots cover mọi screen family; các modifier chọn theo component risk, không cần nhân toàn bộ Cartesian product. Boundary probes tối thiểu 640/641, 900/901, 1100/1101 xác nhận điều kiện inclusive đúng nguồn.

Phải chờ `document.fonts.ready`, ảnh/SVG render xong và motion ổn định. Giữ typography/labels/counters trong phép so sánh; không mask cả panel hoặc text ngày tháng để làm diff pass. Mask chỉ vùng được xác định là nondeterministic ngoài kiểm soát sau khi đã cố định dữ liệu/thời gian. Ưu tiên baseline từ source cùng môi trường renderer với React.

## 6. Các điểm không được vô tình mở rộng hoặc “sửa cho đẹp”

1. Source không có folder tree/entity folder. Project/Files có icon folder nhưng không phải một File Explorer.
2. Calendar Month/Week và Timeline là renderer riêng; không thay bằng calendar/Gantt library có style/geometry khác.
3. Board hiện sort theo `order` bên trong renderer sau filter engine; filter toolbar sort có thể không thay thứ tự board. Ghi behavioral decision nếu sửa; không giả định source đã sort đúng ý nghĩa của toolbar. [Board][s-board].
4. Calendar `daylist` hiện lấy tasks/events toàn workspace theo date, không giới hạn project/current filter như `calendarHtml` đang hiển thị. Đây là source nuance cần ghi vào decision log và fixture; không tự tuyên bố project-specific overflow parity. [Popover daylist][s-popovers].
5. Một số mobile CSS bị inline styles chi phối, ví dụ calendar explicit rows 112px so với mobile grid-auto-rows 72px. WU-00 phải đo computed result, không đọc một rule rồi suy ra ảnh. [Calendar][s-calendar], [Responsive][s-responsive].
6. Source không phải real auth/payment service. 2FA accepts demo code; payment buttons chỉ toast; invoices readonly. Giữ phạm vi đã chốt ở tài liệu API/POC.
7. Giữ English UI copy trong baseline; tài liệu bàn giao dùng tiếng Việt. Đổi copy làm thay đổi line wraps và không thuộc yêu cầu chuyển công nghệ.

## 7. Source anchors

[s-router]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/layout.js#L41-L70
[s-go]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/render.js#L15-L77
[s-main]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/main.js#L61-L79
[s-copylink]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/actions/actions.js#L452-L465
[s-home]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/home.js#L9-L110
[s-inbox]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/inbox.js#L9-L86
[s-mytasks]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/my-tasks.js#L9-L53
[s-favorites]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/favorites.js#L7-L22
[s-notifications]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/notifications.js#L8-L46
[s-search]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/search.js#L7-L99
[s-overview]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/overview.js#L8-L69
[s-projects]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/projects.js#L8-L83
[s-project]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/project.js#L19-L105
[s-tasks]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/tasks.js#L9-L32
[s-calendar]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/calendar.js#L9-L106
[s-timeline]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/timeline.js#L9-L189
[s-members]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/members.js#L11-L79
[s-member]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/members.js#L114-L148
[s-teams]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/members.js#L81-L112
[s-activity]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/activity.js#L7-L44
[s-settings]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/settings.js#L12-L374
[s-billing]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/settings.js#L375-L423
[s-design]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/design-system.js#L12-L144
[s-states]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/design-system.js#L145-L175
[s-archive]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/features/archive.js#L8-L49
[s-auth]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/auth.js#L9-L77
[s-onboarding]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/auth.js#L81-L155
[s-list]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/components/task-list.js#L12-L147
[s-board]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/board.js#L9-L50
[s-table]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/table.js#L8-L80
[s-files]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/files.js#L7-L55
[s-project-overview]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/project-overview.js#L10-L71
[s-drawer]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/drawer.js#L15-L144
[s-subtask]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/features/subtasks.js#L7-L30
[s-modals]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/modals.js#L28-L290
[s-popovers]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/popovers.js#L93-L398
[s-select]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/ui/select.js#L10-L129
[s-context]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/context-menu.js#L6-L87
[s-palette]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/palette.js#L14-L238
[s-keyboard]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/actions/keyboard.js
[s-tokens]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/tokens.css
[s-responsive]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/responsive.css
[s-shellcss]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/shell.css
[s-overlaycss]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/overlays.css
