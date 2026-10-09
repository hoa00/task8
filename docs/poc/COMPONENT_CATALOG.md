# Component catalog và hợp đồng tái sử dụng

## 1. Quyết định chính

Chuyển source thành **React components thật**, sử dụng TypeScript và Tailwind ngay từ component đầu tiên. Cấu trúc thị giác, hierarchy, typography, spacing, color, icon, responsive layout và các hành vi POC đang có được lấy từ source đã ghim commit. Không tạo bản markup riêng cho từng route chỉ vì route khác nhau.

Nguồn: [gr8r-studio tại commit 904205c626918ee96054eb35495c394a60c0c601](https://github.com/gr8rstudio/gr8r-studio/tree/904205c626918ee96054eb35495c394a60c0c601). Danh mục màn hình đầy đủ nằm trong [SCREEN_INVENTORY.md](./SCREEN_INVENTORY.md). Đây là thiết kế triển khai từ audit source; chưa phải kết quả pixel diff của bản React đã hoàn thành.

Source đã có khả năng tái sử dụng: `listHtml/taskRow/miniRow`, `boardHtml/kcard`, `tableHtml`, `calendarHtml`, `timelineHtml`, task property cells, avatar/progress/status helpers và activity rows. Bản React giữ và làm rõ các ranh giới này. [Shared list source][c-list], [project view composition][c-project], [workspace task composition][c-tasks].

### Nguyên tắc phân rã

1. **UI primitives** thuộc `packages/ui`: không có task store, router, fetch, tenant/workspace ID hoặc dữ liệu seed.
2. **DTO/types dùng giữa web và API** thuộc `packages/contracts`; không chứa React hoặc trình bày.
3. **Tính toán thuần** thuộc `packages/domain`: filter/sort/group/date/progress/timeline geometry nhận input rõ ràng; không đọc DOM, localStorage hoặc gọi network.
4. **Feature composites/controllers** thuộc `apps/web/src/features`: lấy dữ liệu qua repository/query layer, kết hợp domain và UI, phát typed actions.
5. **Route components** chọn context, layout và điều hướng. Một route không tự sao chép task row/card/property menu.
6. **API** thuộc `apps/api`, không import React/UI; không đưa code API vào component package chỉ vì cùng monorepo.

Tách trách nhiệm trên là yêu cầu kỹ thuật, không phải yêu cầu tạo framework nhiều tầng. Mỗi package chỉ chứa phần đã có consumer cụ thể trong POC.

## 2. Ownership và dependency

| Layer | Được sở hữu | Không được sở hữu |
|---|---|---|
| `packages/contracts` | Entity IDs, DTOs, request/response schemas, discriminated unions chia sẻ | React nodes, DOM refs, CSS, store singleton |
| `packages/domain` | Task filters/sort/groups, progress, date grouping, calendar/timeline calculations, permission rules theo scope POC | `window`, `document`, localStorage, React, hooks, fetch |
| `packages/ui` | Tailwind-styled primitives, tokens, icons chung, controlled interfaces, focus/keyboard của primitive | Workspace/task lookup, app router, API client, fixture IDs, domain-specific task form |
| `apps/web/src/app` | Providers, AppShell, route composition, global overlay host, preference application | Tự sinh nội dung từng feature bằng switch khổng lồ |
| `apps/web/src/features/*` | Domain view models, query/action hooks, feature layouts, forms, shared domain components | Copy-paste renderer theo route; import trực tiếp internals của API |
| `apps/api` | Repository/data mutation/API behavior được chốt cho POC | Frontend presentation, theme, screen state |

Theo đường dependency: web → ui/contracts/domain; api → contracts/domain. UI không import web/domain/API. Domain có thể import contracts; contracts không import domain/UI. Các tên package là trách nhiệm tương ứng trong monorepo pnpm/Turborepo; dùng chính package names mà scaffold đã chốt trong tài liệu kiến trúc.

## 3. Component catalog

Các tên bên dưới là tên triển khai đề xuất. Được đổi tên để hợp project conventions, nhưng không đổi owner hoặc làm mất reuse. Không cần một file cho mỗi thẻ DOM; chỉ tách khi có API/state/behavior/visual invariant đáng bảo vệ.

### 3.1. Primitives trong `packages/ui`

| Component ID | Unit đề xuất | Props/contracts quan trọng | Nguồn |
|---|---|---|---|
| UI-01 | `Button`, `IconButton` | variant, size, loading, disabled, type; forward ref; icon slot/accessible label; hover/focus/pressed | [Buttons][c-components] |
| UI-02 | `Input`, `Textarea`, `Field` | controlled value, onChange, error, hint, label, description; normal/error/disabled; textarea resize/autosize theo consumer | [Fields][c-components] |
| UI-03 | `Checkbox`, `Toggle` | checked/indeterminate/disabled/onCheckedChange; round visual variant riêng | [Controls][c-components] |
| UI-04 | `Select` | options, value, onValueChange, trigger; listbox keyboard/focus; không enhance DOM sau render | [Select][c-select] |
| UI-05 | `Tabs`, `SegmentedControl` | value/items/onValueChange; count/icon slots; tabs điều hướng dùng adapter của app | [Tabs][c-components] |
| UI-06 | `Badge`, `ColorDot`, `AvatarBase`, `AvatarStackBase` | generic label/initials/tone/CSS color; không nhận memberId rồi lookup | [Tokens/components][c-components] |
| UI-07 | `Panel`, `PanelHeader`, `PanelBody` | heading/actions/content slots; preserve padding/border/radius | [Panels][c-panels] |
| UI-08 | `ProgressBar`, `StackedBar`, `Meter` | numeric values, segments, accessible label; dynamic width/transform; variants theo source | [Progress][c-components] |
| UI-09 | `EmptyState`, `Alert`, `Skeleton` | heading/description/action/icon/tone/size; page-level heading do caller chọn | [States][c-states] |
| UI-10 | `Dialog`, `DialogHeader`, `DialogBody`, `DialogFooter` | open, onOpenChange, size, initial/return focus; controlled dismiss; layer registration | [Dialog][c-overlays] |
| UI-11 | `Popover`, `Menu`, `MenuItem`, `MenuGroup`, `MenuSeparator` | open/anchor/placement, selection, keyboard; no app command registry | [Menus][c-overlays] |
| UI-12 | `Tooltip`, `Toast`, `ToastViewport`, `KeyHint` | label/position, timer/action, label/focus; Undo callback do feature cung cấp | [Overlays][c-overlays] |
| UI-13 | `Icon`, `VisuallyHidden`, `BrandLogo` | explicit size/stroke; generic Lucide subset; brand SVG source; accessible title nếu cần | [Icons][c-icons] |

Nguồn UI primitives: [components.css][c-components], [panels.css][c-panels], [states.css][c-states], [overlays.css][c-overlays], [ui/select.js][c-select], [icons.js][c-icons]. Từng component UI-01…UI-13 phải liên kết được với gallery state thực tế ở `/dev/design-system` hoặc `/dev/system-states`.

Không thay giao diện bằng skin ReUI/shadcn hoặc theme mặc định từ thư viện khác. Headless primitives có thể hỗ trợ hành vi nếu đã được dependency plan chọn; style và geometry vẫn lấy từ nguồn. Sở hữu ReUI PRO không làm thay đổi yêu cầu fidelity riêng của dự án này.

### 3.2. App shell

| Component ID | Owner / unit | Contract | Consumers/source |
|---|---|---|---|
| SH-01 | `app/shell/AppShell` | Sidebar/content/topbar/outlet slots; collapsed/mobile navigation state | Mọi workspace route và hai dev galleries với current-workspace provider; [layout.js28–39][c-shell] |
| SH-02 | `Sidebar`, `NavigationItem`, `ProjectNavItem`, `TeamNavItem` | Typed destination + selected + counts; project expand/reorder/context actions | Một instance trong shell; [layout.js74–159][c-shell] |
| SH-03 | `Topbar`, `Breadcrumbs` | Route metadata + actions; typed router links do app tạo | [layout.js162–200][c-shell] |
| SH-04 | `MobileNavigation`, `NavigationScrim` | Same destinations, state; dismiss/focus return | [layout.js202–210][c-shell] |
| SH-05 | `ContentViewport`, `OfflineBanner` | Nested scroll region, route identity, offline/retry local-demo state | [layout.js28–39][c-shell] |
| SH-06 | `OverlayHost`, `DialogStack` | Typed registrations, topmost dismiss, layer/focus ownership | [drawer.js15–26][c-drawer]; [render focus restore][c-render] |

`packages/ui` có Dialog/Popover primitive; `OverlayHost` của app mới biết task drawer, project form, invite, palette. TanStack Router được dùng ở app adapter, không trong shared Button/Tabs.

### 3.3. Task entities, fields và shared views

| Component ID | Owner / unit | Reuse bắt buộc | Nguồn |
|---|---|---|---|
| TK-01 | `features/tasks/atoms/TaskStatusIcon`, `PriorityIcon`, `TaskKey`, `TaskDue`, `TaskLabel` | Board/List/Table/Drawer/Calendar/Search | [helpers21–53][c-helpers] |
| TK-02 | `features/people/MemberAvatar`, `MemberIdentity` | Adapts member data vào AvatarBase; mọi task/member surface | [helpers7–19][c-helpers] |
| TK-03 | `features/tasks/fields/*` | Status, Assignee, Priority, Date, Labels, Project, Recurrence, Estimate, Dependency fields; shared selector behavior | [cells12–40][c-list], [table cells21–50][c-table], [drawer66–77][c-drawer], [inbox81][c-inbox] |
| TK-04 | `TaskViewToolbar`, `FilterChipBar`, `FilterBuilder`, `SortMenu`, `GroupMenu`, `ColumnMenu` | Workspace+project+saved views; My Tasks giữ fixed grouping | [view-engine8–190][c-viewengine] |
| TK-05 | `TaskList`, `TaskListRow`, `TaskListHeader`, `TaskGroupHeader`, `TaskListComposer` | Tasks/My Tasks/Project/Saved List; khác columns, selection, grouping bằng typed config | [list42–111][c-list] |
| TK-06 | `BulkActionBar` | Selection trên shared TaskList; status/assignee/priority/delete/clear | [list113–121][c-list] |
| TK-07 | `TaskBoard`, `TaskColumn`, `TaskCard`, `TaskCardComposer` | Workspace/Project/Saved Board; workspace thêm project indicator | [board9–50][c-board] |
| TK-08 | `TaskTable`, `TaskTableHeader`, `TaskTableCell`, `TaskTableMobileCard` | Workspace/Project/Saved Table; một column registry; mobile renderer khác desktop | [table8–80][c-table] |
| TK-09 | `TaskMiniRow` | Home/Favorites/Member/Team/Project Overview; explicit project/avatar variants | [list136–147][c-list] |
| TK-10 | `TaskFormDialog` | New/Edit từ mọi page; property controls tái dùng; Create more | [modals65–92][c-modals] |
| TK-11 | `TaskContextMenu` | List/Board/Table/Calendar/Timeline/Search/Favorites/Drawer | [context10–29][c-context] |

Tránh các anti-pattern sau:

- `ProjectTaskRow`, `WorkspaceTaskRow`, `MyTaskRow` chứa markup gần như trùng nhau. Đúng là một TaskListRow với cấu hình trường/selection.
- `TaskCard` cố dùng chung cho Kanban card và compact row/table cell. Đúng là renderer riêng chia sẻ atoms/field controls.
- Một `UniversalRecordView` hiểu projects, tasks, people, files và layout qua 80 boolean. Đúng là view engine theo domain + vài surface primitives.
- Đưa `S`, `D()`, `proj()` hoặc `mem()` vào UI package để tiện lookup. Đúng là controller resolve view model.

### 3.4. Calendar và Timeline

| Component ID | Owner / unit | Contract và invariants | Consumers |
|---|---|---|---|
| CA-01 | `features/calendar/CalendarView` | tasks/legendTasks/events, scope, date, mode, weekStart, onDateChange/onModeChange, onTaskDrop, onTaskOpen | Workspace, Project, My Tasks |
| CA-02 | `CalendarToolbar`, `MonthGrid`, `MonthCell`, `WeekColumns` | 35/42 cells, max 3 items+more; mobile bar chips/week stacking | CA-01 |
| CA-03 | `TaskChip`, `EventChip`, shared Week card presentation, `DayOverflow` | Task and event differ; event time/read-only details; task date drag | CA-01 |
| TL-01 | `features/timeline/TimelineView` | Precomputed rows/geometry, zoom, scroll callbacks, onTaskOpen/onDateChange | Workspace, Project |
| TL-02 | `TimelineTaskRail`, `TimelineHeader`, `TimelineTaskBar` | Row 36px; rail 300px → 170px → hidden; day width 32/11px; header 52px | TL-01 |
| TL-03 | `MilestoneLane`, `DependencyLayer` | Merge milestones same date; collision-aware labels; exact SVG paths/dashed reverse edges | TL-01 |

Nguồn [Calendar][c-calendar] và [Timeline][c-timeline]. `packages/domain` giữ phép tính startOfWeek/date cells/timeline coordinates/row ordering, JSX chỉ vẽ kết quả. Giữ dynamic geometry qua style properties hoặc SVG attributes. Không tự thêm scheduler/Gantt dependency để thay một renderer có geometry đã xác định. Dependencies hiện là dữ liệu liên kết và đường vẽ; không thêm cascade rescheduling/critical-path engine.

### 3.5. Drawer, comments, subtasks và files

| Component ID | Owner / unit | Shared contract / consumers | Nguồn |
|---|---|---|---|
| DT-01 | `features/tasks/detail/TaskDrawer` | taskId + controlled presentation side/full; shared global host | [drawer30–130][c-drawer] |
| DT-02 | `TaskDetailsBody`, `TaskPropertyGrid`, `TaskHeader` | Field components; edit actions; normal/overdue/done | [drawer64–77][c-drawer] |
| DT-03 | `TaskDescriptionEditor` | Description HTML hiện có; 6 format commands; stable focus/selection; blur/input save theo contract | [drawer79–91][c-drawer] |
| DT-04 | `SubtaskList`, `SubtaskDetail` | Task+subtask typed identity; previous/next/note/promote/delete | [drawer94–96][c-drawer]; [subtasks][c-subtasks] |
| CM-01 | `features/comments/CommentList`, `CommentItem`, `CommentComposer` | Same comment model/action contract; Drawer+Inbox | [drawer104–144][c-drawer]; [inbox69–86][c-inbox] |
| CM-02 | `MentionMenu`, `ReactionBar` | Mention/reaction state; current-user highlighting; proper keyboard handling | [drawer118–144][c-drawer] |
| FL-01 | `features/files/FileTypeIcon`, `FilePreviewArt`, `FileCard`, `FileRow` | Typed file metadata; same file-type art in Files/Drawer/Preview | [helpers74–111][c-helpers]; [files7–55][c-files] |
| FL-02 | `AttachmentCard`, `AttachmentList`, `FileDropzone`, `UploadProgress` | Draft/task/project upload target via callbacks; no real storage implied | [drawer99–101][c-drawer]; [files38–53][c-files] |
| FL-03 | `FilePreviewDialog`, `FileContextMenu` | Image-like type art, metadata, task link/copy/close; rename/duplicate/delete | [modals283–289][c-modals]; [context74–82][c-context] |

Description source có HTML và browser editing API; port chỉ cần tái tạo tính năng đó. Không dùng `dangerouslySetInnerHTML` để nhét toàn page, route hoặc source renderer vào React. Nếu dùng HTML insertion cho description, giới hạn ở một adapter có input/allowlist contract rõ ràng và kiểm tra editing; React DOM vẫn sở hữu toàn bộ layout. SVG icons/logo được chuyển thành React SVG components, không dùng generator string cho UI mới.

File art hiện tại là CSS/SVG tạo theo type; giữ đúng hình nguồn. Không thay thành stock thumbnail/ảnh tạo mới, không thêm thư mục, preview PDF engine, asset manager hoặc network uploader chỉ để hoàn thiện một nút demo.

### 3.6. Projects, dashboards, people, notifications và settings

| Component ID | Owner / units | Reuse / ranh giới |
|---|---|---|
| PJ-01 | `features/projects/ProjectIdentity`, `ProjectStatus`, `ProjectCard`, `ProjectRow`, `ProjectTable` | Card reuse Projects+Favorites; identity/status/progress dùng trong sidebar/dashboard; 3 layouts giữ riêng |
| PJ-02 | `ProjectHeader`, `ProjectTabs`, `ProjectFormDialog`, `ProjectShareDialog`, `SaveViewDialog` | One project wrapper; 8 fixed tabs+saved views; 3 saved-layout choices |
| PJ-03 | `ProjectOverview` | Composition riêng About/Progress/Coming up/Details/Milestones/Activity; reuse shared smaller units |
| DB-01 | `StatGroup`, `StatItem`, `ProjectProgressTable`, `TaskStatusBreakdown`, `WorkloadSummary` | Home và WorkspaceOverview dùng chung primitives/progress/identity; dashboard layout không gộp thành giant config |
| AC-01 | `features/activity/ActivityItem`, `ActivityFeed`, `ActivityDayGroup` | Home/project/member/workspace; di chuyển logical ownership của `actHtml` ra khỏi task-list |
| NT-01 | `features/notifications/NotificationContent`, `NotificationAvatar`, `ReadToggle` | Inbox+Notifications chung nội dung, actions, state |
| NT-02 | `InboxListItem`, `InboxPreview`, `NotificationRow`, `NotificationDayGroup` | Giữ separate layouts; Inbox 420px split/mobile fullscreen |
| SR-01 | `features/search/SearchPage`, `SearchResultContent`, `CommandPalette` | Chung search selectors/highlight/result models; palette có commands/workspaces riêng |
| PE-01 | `features/people/MemberIdentity`, `MemberTable`, `MemberStatus`, `RolePicker` | Directory dùng MemberTable; Settings Members dùng compact rows chia sẻ Identity/RolePicker. Task fields/sharing dùng cùng identity; quyền thuộc domain/controller. |
| PE-02 | `TeamCard`, `TeamGrid`, `TeamFormDialog`, `MemberDetail`, `TeamDetail` | TeamGrid reuse Members/Teams/Settings; TeamDetail dùng compact ProjectRow/Identity/Status/Progress và task mini rows; giữ composition riêng. |
| PE-03 | `PermissionMatrix` | Cùng matrix ở Members và Settings; không copy 4 role columns |
| AR-01 | `features/archive/ArchivedTaskRow`, `ArchivedProjectRow` | Reuse compact surface/action buttons; restore/purge entity-specific |
| ST-01 | `features/settings/SettingsLayout`, `SettingsBlock`, `SettingRow`, `SectionHeading` | 21 sections; desktop sidebar/mobile horizontal nav; controls reusable |
| ST-02 | `ThemePreviewCard`, `AccentSwatches`, `DensitySelector` | Appearance; theme previews thể hiện màu nguồn |
| ST-03 | `SessionRow`, `PasswordStrength`, `PlanCard`, `UsageMeter`, `InvoiceTable` | Settings-specific views; PasswordStrength share với Auth; Payment Update/Edit vẫn demo toast |
| AU-01 | `features/auth/AuthLayout`, `SocialAuthButtons`, `PasswordInput`, `AuthMessage` | 7 Auth screens giữ riêng controllers; layout/social/password/error shared |
| ON-01 | `features/onboarding/OnboardingLayout`, `StepProgress`, `ChoiceCard`, `TemplateCard`, `OnboardingNavigation`, `SummaryRow` | 6 steps; draft xuyên steps; reuse template card với project form khi thật sự đồng hình thức |

Nguồn: [Projects][c-projects], [Project Overview][c-projectoverview], [Home][c-home], [Workspace Overview][c-overview], [Members/Teams][c-members], [Settings][c-settings], [Auth/Onboarding][c-auth], [Notifications][c-notifications], [Search][c-search], [Palette][c-palette], [Archive][c-archive].

Không gộp `ProjectCard` và `TeamCard` chỉ vì source dùng `.pcard`; có thể cùng `Panel`/`EntityCardSurface`, còn content có domain riêng. `.mini` cũng là CSS surface dùng cho task/search/archive/member/project; đó không phải bằng chứng chúng là cùng một business component.

## 4. Hợp đồng TypeScript minh họa

Các ví dụ mô tả trách nhiệm và discriminated unions, không thay thế DTO/API contract của toàn app. Definitions thực tế phải lấy types từ `packages/contracts` và share một implementation trong domain.

### 4.1. Scope và view state

```ts
type TaskScope = { workspaceId: WorkspaceId } & (
  | { kind: 'workspace' }
  | { kind: 'project'; projectId: ProjectId }
  | { kind: 'assignee'; memberId: MemberId }
);

type TaskViewKey =
  | `workspace:${string}:tasks`
  | `workspace:${string}:my-tasks`
  | `workspace:${string}:project:${string}`
  | `workspace:${string}:saved-view:${string}`;

interface TaskCollection {
  readonly scope: TaskScope;
  readonly viewKey: TaskViewKey;
  readonly taskIds: readonly TaskId[];
  readonly totalBeforeFilters: number;
  readonly groups: readonly TaskGroup[];
}

type TaskListSelection =
  | {
      kind: 'bulk';
      selectedIds: ReadonlySet<TaskId>;
      onToggle: (taskId: TaskId) => void;
      onToggleAll: (taskIds: readonly TaskId[]) => void;
    }
  | {
      kind: 'completion';
      onToggleComplete: (taskId: TaskId) => void;
    }
  | { kind: 'none' };
```

Source keys `tasks`, `mytasks`, `p:<id>`, `sv:<id>` được map qua adapter một lần; thêm workspace prefix để tránh dữ liệu view rò giữa workspaces. Không lấy index hàng làm ID. My Tasks có 4 groups cố định và không row drag; không phải cùng một filter config status-group mặc định như Workspace Tasks. [My Tasks source][c-mytasks].

### 4.2. Shared renderer có props rõ ràng

```ts
interface TaskListProps {
  collection: TaskCollection;
  rows: ReadonlyMap<TaskId, TaskRowModel>;
  columns: readonly ListColumnId[];
  selection: TaskListSelection;
  drag:
    | { kind: 'none' }
    | {
        kind: 'manual-order-and-group';
        onMove: (intent: MoveTaskIntent) => void;
      };
  onOpenTask: (taskId: TaskId) => void;
  onEditField: (intent: EditTaskFieldIntent) => void;
  composer: TaskComposerController;
  emptyState: React.ReactNode;
}

function MyTasksList({ model, actions }: MyTasksListProps) {
  return (
    <TaskList
      collection={model.collection}
      rows={model.rows}
      columns={['project', 'status', 'priority', 'due']}
      selection={{
        kind: 'completion',
        onToggleComplete: actions.toggleComplete,
      }}
      drag={{ kind: 'none' }}
      onOpenTask={actions.openTask}
      onEditField={actions.editField}
      composer={model.composer}
      emptyState={<TaskEmptyState scope="mine" />}
    />
  );
}
```

Một controller có thể sở hữu query/mutations, một view có thể nhận composed props. Không bắt buộc truyền một bus framework qua mọi component. Không để renderer mutating view store trong render như source từng làm với `_projHidden`/view defaults: normalize state trong initializer/controller.

### 4.3. Một selector/editor phục vụ nhiều vị trí

```ts
type FieldTarget =
  | { kind: 'task'; taskId: TaskId }
  | { kind: 'draft'; draftId: string }
  | { kind: 'bulk'; taskIds: readonly TaskId[] }
  | {
      kind: 'subtask';
      taskId: TaskId;
      subtaskId: SubtaskId;
    };

interface TaskStatusFieldProps {
  value: TaskStatus;
  presentation: 'list-pill' | 'table-cell' | 'drawer-property' | 'form-chip';
  onChange: (value: TaskStatus) => void;
  disabled?: boolean;
}
```

TaskStatusField không cần biết global store nếu nhận callback đã bind target. Target identity dùng trong controller/overlay state; không giữ source sentinel string `__form` trong mọi UI component. DateField cho task/subtask/draft dùng chung date picker, nhưng ngày/tháng/selected/clear intent luôn thuộc đúng target.

### 4.4. Domain calculation tách khỏi visual

```ts
interface ViewEvaluationInput {
  tasks: readonly Task[];
  view: TaskViewState;
  now: number;
  today: DateOnly;
  lookups: TaskLookupData;
}

interface TimelineGeometryInput {
  tasks: readonly Task[];
  milestones: readonly Milestone[];
  zoom: 'week' | 'month';
  grouping: 'status' | 'assignee' | 'project' | 'none';
  today: DateOnly;
  weekStart: 0 | 1 | 6;
}
```

`evaluateTaskView`, `groupMyTasks`, `buildCalendarCells`, `buildTimelineGeometry` là pure functions. `now/today/weekStart` truyền vào thay vì đọc môi trường. Dùng DateOnly theo contracts; không đổi date-only thành UTC timestamp khi port nếu semantics nguồn là calendar date.

### 4.5. Dynamic style có type, static style bằng Tailwind

```ts
type TaskGridStyle = React.CSSProperties & {
  '--task-columns': string;
};

function TaskGridRow({ columnTemplate, children }: TaskGridRowProps) {
  const style: TaskGridStyle = {
    '--task-columns': columnTemplate,
  };

  return (
    <div
      className="grid min-h-[var(--row-h)] grid-cols-[var(--task-columns)] items-center"
      style={style}
    >
      {children}
    </div>
  );
}
```

Tọa độ timeline, chiều rộng column resize, progress values, project/member color và anchored overlay positions là dynamic data hợp lệ. Không dùng dynamic class interpolation như `bg-${color}` hoặc `left-[${x}px]`; build không thể bảo đảm thấy các class runtime đó. Static styles không chuyển sang inline styles hàng loạt để né yêu cầu Tailwind.

## 5. Design tokens và geometry cần giữ

Nguồn xác định các values dưới đây: [tokens.css][c-tokens], [base.css][c-base], [shell.css][c-shellcss], [board.css][c-boardcss], [panels.css][c-panels], [overlays.css][c-overlays], [responsive.css][c-responsive], [timeline source][c-timeline].

| Nhóm | Giá trị chính xác / quy tắc |
|---|---|
| Font | Geist; Geist Mono cho keys/numeric metadata; body 13.5px, line-height 1.45, `ss01`/`cv11`, antialias |
| Type scale | 11, 12, 12.5, 13.5, 14.5, 16, 19, 23px; không làm tròn thành 12/14/16 toàn bộ |
| Font loading | Source request Geist 400/500/600, Mono 400; CSS có 450; giữ font matching/metrics thực tế |
| Spacing scale | 4, 8, 12, 16, 20, 24, 32, 40, 48px; component-specific 6, 7, 10, 14, 18px vẫn tồn tại |
| Radius | 4, 6, 8, 10, 999px; full drawer 12px; mobile modal top 14px |
| Controls | 22/26/30/36px; phone topbar minimum 40px |
| Shell | Sidebar 252px, collapsed 52px, mobile 280px; topbar 46 → 50px; gutter 24 → 16px |
| Task list | Row 40 → 34px khi compact; header 32px; group 36px; column widths theo registry riêng |
| Board | Column 284px, collapsed 44px; gap 12px; card padding dọc/ngang 10/12px → 8/10px khi compact |
| Table | Title 314px; status 132px; priority 112px; assignee 156px; due/start 112px; labels 180px; deps 150px; estimate 92px; created 112px; project 156px |
| Page | Centered max 1160px; padding 28px / gutter / 72px; wide/flush variants riêng |
| Dashboard | Grid ratio 1.55fr:1fr; gap 16px; stats 4 cột → 2; số 22px |
| Drawer | Side min(620px, 100vw); full min(980px, 100vw − 48px), top/bottom 24px; mobile fullviewport |
| Modal | 560px default, 420px small, 720px large; mobile bottom sheet max 92vh |
| Popover | Min 200px, max 320px, padding 4px, max-height min(420px, 70vh); menu item min 30px |
| Inbox | 420px list rail desktop; preview becomes fixed fullscreen<=900 |
| Timeline | Rail 300px → 170px → hidden; header 52px, row 36px; day width 32px ở Weeks / 11px ở Months |
| Auth | Max 380px; onboarding 560px, completion 440px |

### 5.1. Palette và theme

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#fbfaf8` | `#1a1a19` |
| `--bg-side` | `#f4f3f0` | `#151514` |
| `--surface` | `#ffffff` | `#1d1d1c` |
| `--surface-2` | `#f6f5f2` | `#252524` |
| `--surface-3` | `#eeede9` | `#2d2d2b` |
| `--sunken` | `#f7f6f3` | `#181817` |
| `--border` | `#e9e7e2` | `#2c2b29` |
| `--border-strong` | `#dad7d0` | `#3a3936` |
| `--divider` | `#f0eeea` | `#252523` |
| `--text` | `#1d1c1a` | `#eceae5` |
| `--text-2` | `#57544e` | `#b5b2ab` |
| `--text-3` | `#6b6760` | `#9a968f` |
| `--text-4` | `#8c8880` | `#6f6c66` |
| Default accent | `#4b5bd6` | `#8e9af3` |
| On accent | `#ffffff` | `#12131c` |

Giữ6 accent variants indigo/blue/violet/teal/rose/graphite với light/dark pairs trong [tokens source][c-tokens]. Semantic colors và5 status colors cũng có dark values riêng. Không dùng CSS invert hoặc thay palette bằng zinc/slate mặc định. `color-mix(in srgb, ...)` xuất hiện trong tints/shadows/project colors; giữ phép trộn màu và nền liên quan.

### 5.2. Icons và font fidelity

- Lucide source dùng stroke-width **1.8**, viewBox24, round caps/joins. Default stroke2 của icon component khác tạo sai khác nhìn thấy. Dùng explicit strokeWidth1.8 và cùng icon geometry/version source. [Icon source][c-icons].
- TaskStatusIcon/PriorityIcon là custom SVG14×14; không thay bằng các Lucide circle/bar gần giống. [helpers21–42][c-helpers].
- Logo là SVG path nguồn; Avatar là initials với color; File previews là CSS/SVG art. Không cần tạo asset mới bằng AI hoặc lấy ảnh ngoài. [helpers][c-helpers].
- Source [index.html][c-index] chỉ request font faces400/500/600 dù CSS dùng450. Khi self-host hoặc chuyển font package, kiểm tra actual glyph widths và weight matching. Một variable font phủ400–600 có thể render450 khác resource setup cũ; đó là rủi ro phải xác minh ở baseline, không khẳng định chỉ cùng tên font là đủ.

## 6. Quy tắc Tailwind ngay từ đầu

### 6.1. Điều bắt buộc

- Component đầu tiên và mọi component tiếp theo dùng Tailwind làm cách viết static layout/typography/colors/states chính.
- CSS custom properties giữ exact semantic tokens. Tailwind theme mapping trỏ tới các tokens này; chọn config đúng major version được khóa trong scaffold.
- Custom CSS chỉ cho token definitions, source-equivalent base reset, font-face, keyframes, scrollbar, rich-text descendant rules hoặc visual effect không nên diễn đạt bằng một chuỗi utilities khó kiểm soát. Mỗi nhóm ngoại lệ có tên owner/source reference.
- Không import nguyên bộ `src/styles/*.css` upstream trong React app rồi tuyên bố đã chuyển Tailwind. Source checkout phục vụ baseline độc lập.
- Không trì hoãn mobile, dark, density đến cuối: mỗi component WU có variants tương ứng.
- App build phải nhận classes từ `packages/ui` trong monorepo; kiểm tra cả production build để tránh classes chỉ xuất hiện ở dev.

### 6.2. Preflight và cascade

Chốt một chiến lược duy nhất ở foundation:

**Quyết định đã chốt:** dùng Tailwind utilities/theme ngay từ đầu, tắt Preflight và giữ một base reset nhỏ đối chiếu đúng source; sau đó translate toàn component CSS sang utilities. Đây không phải giữ legacy component CSS. Cách này giữ browser defaults mà source đang dựa vào trong headings/contentEditable/lists và giảm số sai khác toàn app phải bù.

Không bật Preflight trong scaffold của handoff này. Cấu hình canonical nằm ở [TOOLCHAIN.md](TOOLCHAIN.md); muốn đổi sau phải có yêu cầu mới và đánh giá lại baseline, không vá từng page bằng selectors toàn cục.

Source thứ tự import là tokens→base→components→shell→panels→views→overlays→states→settings→auth→motion→responsive. `motion.css` và `responsive.css` thay đổi một số values trước đó; migrate **computed result**, không lấy declaration đầu tiên rồi bỏ overrides. [Import order][c-styleindex].

### 6.3. Breakpoints và scroll

Nguồn dùng `max-width:1100px`, `900px`, `640px`, đều inclusive. Dùng exact custom variants/media rules; Tailwind min-width640/768/1024 không tương đương. Tại640px mobile card đang phải hiển thị; tại641px renderer desktop trở lại. [Responsive source][c-responsive].

Body overflow hidden; app full height; nested content/sidebar/board columns/table/timeline có scroller riêng. Giữ `min-width:0`, `min-height:0`, `minmax(0, 1fr)`, sticky containing blocks và z-index. Không cho body scroll thay content scroll để chữa overflow nhanh.

Những UI nhất thiết đổi renderer ở mobile: TaskTable→mobile cards; CalendarWeek→stacked columns; TaskList→wrapped cards; InboxPreview→fullscreen; TaskDrawer→fullviewport; Dialog→bottom sheet. Chỉ thêm `overflow-x-auto` cho toàn desktop screen không đạt fidelity mobile.

### 6.4. Layer và motion

Giá trị source: topbar5, bottomnav45, inbox preview48, drawer scrim49, drawer50, modal scrim60+2i/wrap61+2i, mobile scrim69/sidebar70, popover80, palette scrim89/palette90, toast100. [Shell/inbox][c-shell], [Drawer layers][c-drawer], [Overlay styles][c-overlays]. Giữ quan hệ hiển thị và topmost dismissal; không cấp `z-50` cho tất cả.

Source có one-shot route/tab/drawer/popover/completion/add/drop animations; React mount/re-render không được replay ngoài ý muốn. CSS keyframes nhỏ dùng chung phù hợp; không cần thêm animation framework cho POC. Preserve reduced-motion variant; baseline screenshot phải capture settled frame. Nguồn có inconsistency `motion=full` khi systemreduce vì root attribute bị remove; ghi decision cụ thể trước khi sửa semantics. [theme.js][c-theme], [render.js80][c-render], [motion.css][c-motion].

## 7. Tiêu chí nghiệm thu reuse và fidelity

### 7.1. Reuse phải được chứng minh

| Kiểm tra | Kết quả đạt |
|---|---|
| TaskList dùng ở3 context chính | Cùng implementation; columns/groups/selection là config; không có3 copies markup |
| TaskBoard ởworkspace/project | Cùng TaskCard/TaskColumn; chỉ scope và project indicator khác |
| TaskTable ởworkspace/project/saved | Cùng column registry/resize/edit logic; mobile card reuse |
| Status/Assignee/Date field trên list/drawer/form | Cùng selector contract; chỉnh một nơi cập nhật dataset chung và mọi consumer |
| Comment UI ởdrawer/inbox | Cùng CommentItem/Composer; khác surrounding layout |
| Avatar/status/project identity | Không có màu, initials, SVG copy theo page |
| Theme change | Toàn app+overlays đổi qua tokens; không chỉ route đang xem |
| Component gallery | Render chính primitive đang dùng; không dựng gallery version khác để screenshot đẹp |

### 7.2. Verification vừa đủ nhưng có ý nghĩa

- Unit tests cho pure filter/group/date/timeline logic và field-target dispatch nếu rủi ro mất dữ liệu/nhầm target; không test một utility class bằng snapshot JS chỉ để tăng test count.
- Interaction tests cho keyboard/focus, bulk selection, inline edit, drawer open/close, drag transitions, shared persistence và browser routing.
- Screenshot comparison cho screen/state IDs trong inventory; foundation values được chốt trước khi nhân sang toàn app.
- Mỗi component WU cập nhật progress bằng source anchors, screenshots đã so sánh, interaction đã chạy, remaining mismatches. Không đổi `done` khi chỉ compile hoặc render được.
- Known source behavior bugs được ghi rõ preserve/fix/defer, có visual consequence và test; không dùng “giống source” để bỏ qua lỗi React mới.

## 8. Source anchors

[c-list]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/components/task-list.js#L12-L147
[c-project]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/project.js#L19-L105
[c-tasks]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/tasks.js#L9-L32
[c-mytasks]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/my-tasks.js#L9-L53
[c-components]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/components.css
[c-panels]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/panels.css
[c-states]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/states.css
[c-overlays]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/overlays.css
[c-select]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/ui/select.js#L10-L129
[c-icons]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/core/icons.js#L1-L24
[c-shell]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/layout.js#L28-L211
[c-drawer]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/drawer.js#L15-L144
[c-render]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/render.js#L79-L205
[c-helpers]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/ui/helpers.js#L7-L111
[c-table]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/table.js#L8-L80
[c-inbox]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/inbox.js#L9-L86
[c-viewengine]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/view-engine.js#L8-L190
[c-board]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/board.js#L9-L50
[c-modals]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/modals.js#L28-L290
[c-context]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/context-menu.js#L6-L87
[c-calendar]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/calendar.js#L9-L106
[c-timeline]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/timeline.js#L9-L189
[c-subtasks]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/features/subtasks.js#L7-L30
[c-files]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/files.js#L7-L55
[c-projects]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/projects.js#L8-L83
[c-projectoverview]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/views/project-overview.js#L10-L71
[c-home]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/home.js#L9-L110
[c-overview]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/overview.js#L8-L69
[c-members]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/members.js#L11-L148
[c-settings]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/settings.js
[c-auth]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/auth.js#L9-L155
[c-notifications]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/notifications.js#L8-L46
[c-search]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/search.js#L7-L99
[c-palette]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/palette.js#L14-L238
[c-archive]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/features/archive.js#L8-L49
[c-tokens]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/tokens.css
[c-base]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/base.css
[c-shellcss]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/shell.css
[c-boardcss]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/views/board.css
[c-responsive]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/responsive.css
[c-index]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/index.html#L9-L16
[c-styleindex]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/index.css#L1-L18
[c-theme]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/core/theme.js#L5-L22
[c-motion]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/motion.css

### WU-10 ownership checkpoint

`features/tasks/detail/TaskOverlayHost` owns global task URL/render intents (AppShell
provides canonical route intent), per-task transient draft/scroll, shared form/context
menu/confirmation/preview orchestration. TaskDrawer + TaskDetailsBody +
TaskPropertyGrid are single controlled owners using WU08 fields. TaskFormDialog uses
TaskSubmission metadata+File intents and EditTaskCommit confirmed move/PATCH phases;
TanStack Query remains the only DTO cache. Header Newtask opens this form, inline
Addtask remains WU09 shared composer.

`features/files/FileFoundation.tsx` exports named Props and FileTypeIcon,
FilePreviewArt, AttachmentCard, Dropzone, UploadProgress, FilePreviewDialog. Files
catalogue22 reuses these exports; bytes35 implements transport behind typed operation.
WU11 extends the existing detail/form boundary for rich description, child CRUD and
Comments/Activity; existing edit children currently read-only, create drafts atomic.
No future owner should replace these forms or duplicate the Drawer controller.

TaskDetailsBody owns chrome/title/properties and exposes controlled section composition;
production defaults remain its existing sections. WU11 extends this owner and same
TaskFormDialog via canonical scoped child operations, rich editor and Comments/Activity,
including full-body comparison in both source collaboration states. Do not duplicate
Drawer/controller/properties/file foundation. Snapshot-only initial settled overlay
state is independent of default motion/focus verification.


### WU-11 ownership checkpoint

TaskDetailsBody now composes one DescriptionEditor/editor adapter, SubtaskList,
SubtaskDetail, the existing FileFoundation and TaskConversation. The same
useSubtaskCommands connects the existing EditTaskForm child controls to scoped
canonical CRUD; Task PATCH remains scalar. No replacement completion owner.

`features/comments/Comments.tsx` exports named CommentListProps, CommentItemProps,
CommentComposerProps, ReactionBarProps and MentionMenuProps. These presentation
components receive members, current actor, clock/value/pending/error and typed
callbacks; Inbox WU-19 reuses this boundary. CommentText renders React text/mention
spans. Surrounding Drawer timeline and pagination composition remain feature-owned.
`comments/queries.ts` owns Query infinite-query keys/options, not another cache.
Composer files call the existing TaskOverlayHost upload controller/FileFoundation.

### WU-12 ownership checkpoint

TaskBoard, TaskBoardColumn, TaskBoardCard and TaskCardComposer provide five source
status columns, 284px/44px collapse, independent vertical/global horizontal scroll,
source column/card actions and native drop intents. Existing fields, metadata
formatters, commands, confirmation/Undo and complete Drawer/form/files remain the
shared owners. No card selection or List bulk bar. Workspace uses the actual page;
Project/saved Board variants use controlled harnesses until full wrappers WU16.

### WU-13 delivered Table owners

TaskTable, TaskTableHeader, TaskTableRow and TaskTableMobileCard use the existing
11-entry domain taskColumns registry. Row cell renderers reuse field selectors
through table-cell/custom trigger props. The Table has native colgroup/table
layout, source314/132/112/156/112/112/180/150/92/112/156 default widths,34px headers,
36px rows and32px group rows independent of List density. Title stays sticky and
visible; defaults hide start/created/deps. Project initializes hidden project once
and permits later re-show. Resize measures actual rendered geometry, commits
rounded width≥64 and suppresses header clicks60ms. The mobile flat card preserves
source duplicate-class browser interpretation, due/estimate content and panel
radius10. Workspace actual page and Project/saved feature harnesses share this
owner; full ProjectPage remains WU-16.

TaskTableFieldCell owns a stable TD ref; the existing field owner receives optional
popupAnchorRef for source cell placement and retains its own button for focus.
Choice query and Date month initialize on every open transition. Shared Date uses
one source calendar-only body for List/Drawer/form/Table, with canonical mutation
validation and failed draft retention. Plain Choice search and8px/radius3 menu
dots belong to this field owner, not a Table-only copy or global ColorDot change.


### WU-14 delivered Calendar owners

- `features/calendar/CalendarView` receives typed scope, complete range tasks,
  full-filtered legend tasks, events, date/mode/weekStart and explicit intents.
  `CalendarToolbar`, `MonthGrid`, `MonthCell`, `WeekColumns`, `TaskChip`, `EventChip`
  and `DayOverflow` are shared across the three contexts; event preview is private
  and read-only, using the existing Popover/Menu and project-open intent.
- `CalendarPanel` owns complete due-range queries, full-scope legend composition,
  read-only event queries and existing task PATCH feedback. Workspace Calendar
  and My Tasks are real pages; Project remains a controlled feature harness.
- `domain/calendar.ts` owns startOfCalendarWeek, 35/42 cells, navigation and
  rescheduleDateOnly; no React/DOM/network dependency. Day add passes typed
  `tasks/field-types.ts:TaskFormDefaults` into the existing full form owner.
- Source min-height640 and inline row minmax112 remain actual geometry even
  on mobile; <=640 task bars and Week stacked columns follow original source.
  The full legend wraps at641 and covers the mode control pointer center in
  both renderers; recorded trusted pointer failure and native keyboard success
  are separate from image parity.

### WU-15 delivered Timeline owners

- `features/timeline/TimelineView` owns rail/header/bars, dependency SVG and
  milestone lane across Workspace/Project. It receives one typed model and
  task-open/date-change intents; no legacy HTML or delegated action registry.
- `TimelinePage/Panel` own shared toolbar, complete overlap Query dataset,
  Bootstrap authorized milestones, PATCH feedback and per-scope/zoom UI scroll.
  Workspace is a real AppShell route; Project is a feature harness until WU16.
- `domain/timeline.ts` owns 91/238-day ranges,32/11px widths,36px rows, inclusive
  bars/progress, forward/backward paths, collision-aware same-day milestones
  and signed pointer/scroll rounding. Equal-date presentation reverses incoming
  ordinal as source; API stable-ID comparator and original dependency paint
  input order remain unchanged. DateOnly reschedule reuses the Calendar helper.
- Rail/header/bar MemberIdentity, status/project atoms, task menu, Drawer/form,
  query loader and canonical commands are reused from their existing owners.
  Custom Timeline CSS owns source milestone tooltip/keyframes and bar progress
  effect; static geometry uses Tailwind and typed dynamic style/SVG coordinates.

## WU-16 delivered ownership

PJ-01/02: `features/projects/ProjectComponents.tsx` exports ProjectIcon,
ProjectStatus, ProjectMemberStack, ProjectCard, catalogue ProjectRow/ProjectTable
and controlled CompactProjectRow. Full membership remains in Query records; the
Card owns the original overflow-avatar/Options CSS collision through the optional
AvatarStack overflow slot, with other consumers preserving their default slot.
PJ-03/04: ProjectOverview and separate ProjectActivity compose shared Panel/
ActivityFeed/TaskMiniRow; Recent uses activities only, Activity includes comments.
PJ-05/06: ProjectFormDialog, ProjectOverlayHost and ShareDialog compose shared
Dialog/fields, typed operations and the capability-controlled demo service.
ProjectHeader/Layout hosts eight fixed tabs plus explicit saved List/Board/Table
views and reuses the five existing feature renderers on actual routes. Files body
PR-07 remains pending WU-22. AC-01 shared ActivityItem/ActivityFeed exports its
record type and actor/entity/day formatting; no later consumer page is implemented.

- `useProjectSharing`: ProjectHeader/menu exposure and ShareDialog share canonical
  project-member, complete member-catalogue, session and local demo query keys.
  Query remains authoritative; Bootstrap display DTO is a pending identity
  fallback only. It does not delay dialog opening or copy server state.

## WU-17 delivered ownership

DB-01 lives in `features/dashboards`: HomePage and WorkspaceOverview are separate compositions, with shared StatGroup/StatItem, ProjectProgressTable, TaskStatusBreakdown and WorkloadSummary. Both reuse project icons/status/member stacks, TaskMiniRow, ActivityFeed, MemberIdentity, Progress and StackedBar exports. Domain `dashboard.ts` owns task tabs, deadline groups and rolling completed count; mock reads own complete authorized aggregates. Query/cursor reads remain the server-state owner; previews do not determine workspace totals.

Home My tasks uses SegmentedControl with optional tab semantics; default radio semantics are unchanged. Selected Home tab is UI-only state in the workspace transient provider, retained across navigation and reset on reload/workspace change. StatItem preserves source520ms cubic first-entry count-up and reduced policy through production/development StrictMode; passive start/readiness attributes support chronology verification.

- Home owns responsive PanelHeader composition through existing className slots; shared PanelHeader defaults remain. TaskMiniRow title uses source flex1/min-width0 so long text allocates width faithfully with the exported ProjectIdentity.
- Home task/activity/deadline/form callbacks consume finite entry through existing typed projectSurfaceOpened before the shared workspace task intent, verified against real Source openers.

## WU-18 delivered ownership (qualified technical PASS)

AC-01 exports ActivityItem/ActivityFeed/ActivityDayGroup; WorkspaceActivity extends their person/type/project filters and canonical task/project fallback. Grouped feeds use direct day/feed siblings to match Source ownership; non-grouped defaults remain. Home/Project are concrete affected consumers. Actor profile remains WU-20.

SR-01 SearchPage/CommandPalette share one typed search API operation and five result models. Mock read ownership validates canonical private/lifecycle/workspace parents; Query owns debounce, cancellation, cursor completeness and current-query isolation. SearchResultContent owns result composition; Highlight has Source plain-mark page geometry and explicit Palette treatment. One UI-only recent owner in SearchOverlayHost namespaces workspace/member and follows Source ViewAll-only insertion/order semantics.

SearchOverlayHost composes existing task/project intents and OverlayProvider. Command definitions and shortcut groups are exported for WU-23; one global listener reuses local form/editor/composer owners. Shared Dialog adds optional Palette mode with Source z90/scrim89; default modal/drawer style and focus/Escape controller stay unchanged. Shortcuts keeps existing entryRevision; FilePreviewDialog adds optional entryRevision supplied only by Search, with real Copy action consuming native entry. Project notice adds optional kind/duration options while preserving existing default2200/Undo5000 timing and undo callback. Canonical Files/deep-link owner remains WU-22; other future command owners are recorded in COMMAND_INTEGRATIONS.md.


### WU-19 implemented notifications composition

`features/notifications/queries.ts` owns the shared records query; `NotificationContent`, `NotificationAvatar`, `NotificationSnippet` and `ReadToggle` own content and read controls for both layouts. `InboxPage` owns categories, local selection and task-keyed drafts, `InboxPreview` composes the existing task fields and Comments, and `NotificationsPage` owns separate day groups and All/Unread layout. No Inbox message DTO or duplicated server-state store was introduced.

`CommentComposer` accepts `presentation="inbox"`; its default Drawer presentation retains avatar, mention menu, auto-sizing and attachment chooser. Inbox uses the Source reply textarea and MOD submit with the same canonical name-to-member-ID parser and operation. `AvatarBase` now renders supplied children before initials; consumers without children and empty/presence/default geometry retain their existing behavior. Notification system avatars use this composition for clock/triangle glyphs.


### WU-20 implemented people ownership

`features/people/catalogue.ts` owns the complete cursor-read member catalogue; projects reexports the same query owner. `MemberTable`, `MemberStatus`, `RolePicker`, `PermissionMatrix`, `MemberDetail`, and `InviteDialog` compose shared UI primitives and the existing `MemberIdentity`, `TaskMiniRow`, `CompactProjectRow`, and `ActivityFeed`. Thin Members/profile routes delegate to these controllers. `PeopleOverlayHost` owns typed cross-feature intents and directory demo overlays; TanStack Query remains the sole server/demo read cache.

`features/people/index.ts` exports Identity/props, Status/props, RolePicker/props, PermissionMatrix and four-role metadata for Settings WU24. RolePicker takes a DirectoryMember, controlled optional open/anchor and typed Admin|Member|Guest callback; Owner/current read-only policy is supplied by the capability-aware controller. PermissionMatrix owns the exact Source four-role/static permission catalogue, no ACL editor. Actual Settings compact rows and Teams grid/detail are separate later owners.

`CompactProjectRow.membershipLabel` opts a member profile into Source min-height38/name weight400/glyph14 and Lead|Member label. Default project/dashboard consumers retain min-height40/weight500/glyph15 and their status/progress composition. Project icon remains the measured Source28px. `MemberIdentity.presence` is optional and defaults false, preserving its task consumers.
