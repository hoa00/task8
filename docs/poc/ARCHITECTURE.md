# Kiến trúc chuyển đổi

## 1. Quyết định cốt lõi

Chuyển theo **component và feature**, giữ một thiết kế nguồn, một bộ domain data và một contract. Mỗi route chỉ ghép những phần sẵn có. React sở hữu DOM; TanStack Router sở hữu URL; TanStack Query sở hữu cache dữ liệu API. Style của component React dùng Tailwind từ lúc tạo.

Source đã có các hàm chung như `listHtml`, `boardHtml`, `tableHtml`, `calendarHtml`, `timelineHtml`, `commentHtml`, `viewToolbar`. Vì vậy đây là một cuộc chuyển renderer/state ownership, không phải vẽ lại từng screenshot độc lập. Bằng chứng: [task-list.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/components/task-list.js), [view-engine.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/view-engine.js), [project.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/project.js).

## 2. Cấu trúc đích

| Đường dẫn | Trách nhiệm | Không được phụ thuộc |
| --- | --- | --- |
| `apps/web/src/app` | Bootstrap, provider, router, session, shell, adapter chọn một lần | DB tables/Cloudflare bindings |
| `apps/web/src/routes` | File routes, path/search validation, route-level loading/error, ghép feature page | SQL, business mutations inline |
| `apps/web/src/features/tasks` | Task fields, views, detail, form, hooks/commands; dùng lại cho workspace/project/my tasks | Clone riêng theo route |
| `apps/web/src/features/calendar`, `timeline` | Rendering riêng, controlled geometry, chung Task DTO và intents | Task store độc lập |
| `apps/web/src/features/{projects,people,teams,files,comments,...}` | Business composite và controller của domain | Query logic copy giữa pages |
| `apps/web/src/data` | `StudioApi`, HTTP adapter, query keys, feature repository hooks | DOM rendering |
| `apps/web/src/mocks` | Seed mapper, deterministic fixture, mock adapter, capability scenarios | Được bundle vào mode HTTP production |
| `apps/api/src` | Hono app, middleware principal/workspace, module routes/services/repositories | React, DOM, web app imports |
| `apps/api/src/db` | Drizzle schema, migrations, query helpers, D1 batch implementation | UI/DTO tự suy ra từ table |
| `packages/contracts/src` | Zod runtime schemas, inferred DTO, enums, request/response/error contracts | Hono, Drizzle, React, Query, Router |
| `packages/domain/src` | Pure date/filter/order/group/progress semantics cần mock và server dùng giống nhau | DOM, storage, network, framework |
| `packages/ui/src` | Tokens và primitive/component thuần, ref/controlled props/callbacks | Workspace/Task DTO, router, data hooks, app stores |
| `tests/visual` | Capture source, target compare, scenario mapping, geometry assertions | Tự update baseline để pass |
| `.reference/gr8r-studio` | Checkout bất biến của source | Không thuộc target bundle; không nhận edit |

Workspace package names tạm: `@studio/ui`, `@studio/contracts`, `@studio/domain`; tất cả private. Không tạo thêm api-client/fixtures/db package trong POC: các thư mục đã có chủ sở hữu rõ, tránh sinh package chỉ để bọc một file. Khi có consumer thứ hai thật mới tách tiếp.

## 3. Chiều phụ thuộc

| Consumer | Import được |
| --- | --- |
| UI primitives | React, dependency headless đã chọn, local tokens/icons/utils |
| Domain | Contracts kiểu thuần nếu cần, các pure utilities |
| API | Contracts, domain, Hono/Drizzle/D1/R2 |
| Web data layer | Contracts, domain dùng cho mock, TanStack Query, fetch |
| Feature controlled views | UI, domain presentation helpers, typed models/callbacks |
| Feature controllers/routes | Feature views, hooks/data layer, Router |

Không có mũi tên từ package chung quay về app. Không dùng barrel export của cả app để xử lý import cycle. Contract không trở thành `export type AppType = typeof honoApp` kéo server implementation vào browser; nếu dùng Hono RPC về sau, chỉ là cơ chế client phụ trợ, DTO/runtime schema vẫn độc lập.

## 4. Component dùng lại ở mức nào

### Ba mức

**Primitive:** Button, IconButton, Input, Field, Select, Checkbox, Toggle, Tabs, AvatarBase, Badge, Panel, EmptyState, Skeleton, Dialog, Popover/Menu, Tooltip, Toast. Chúng không biết task hay project.

**Business composite:** TaskStatusField, AssigneeField, TaskList, TaskBoard, TaskTable, TaskMiniRow, TaskDrawer, CommentList, FileCard, ProjectCard, MemberTable, PermissionMatrix. Các component này hiểu nghiệp vụ nhưng nhận dữ liệu/callback thay vì tìm global store.

**Page composition:** HomePage, WorkspaceTasksPage, MyTasksPage, ProjectPage, InboxPage. Ghép các business composite, cung cấp scope và quyền phù hợp. Mỗi page không tự định nghĩa lại row/card/task editor.

### Ranh giới chủ ý

- TaskListRow, TaskBoardCard, TaskTableRow và TaskMiniRow là bốn presentation khác nhau; chia sẻ field display/editor/intents, không gom vào một `UniversalTask` với nhiều boolean.
- Home, Workspace Overview và Project Overview chia sẻ Metric/Panel/Progress/Activity nhưng giữ ba bố cục riêng.
- Settings Members dùng compact member rows, chia sẻ MemberIdentity/RolePicker với directory; không nhét nguyên MemberTable vào bố cục khác. Settings Teams dùng TeamGrid, Settings Permissions dùng PermissionMatrix đã có.
- TeamDetail dùng compact ProjectRow với ProjectIdentity/ProjectStatus/Progress; không thay hàng dự án nhỏ bằng ProjectCard của trang Projects.
- Task drawer và Inbox dùng chung comment body/composer/reactions. Drawer root chỉ tồn tại một lần ở app layout.
- Calendar và Timeline là component tùy chỉnh theo source. Không thay bằng FullCalendar hoặc Gantt library mặc định rồi chấp nhận khác geometry.

### Ví dụ contract component TypeScript

Đây là ví dụ kiến trúc, implementation sẽ dùng types canonical từ WU-02, không sao chép định nghĩa thành nguồn thứ hai.

```ts
type TaskScope = { workspaceId: string } & (
  | { kind: 'workspace' }
  | { kind: 'project'; projectId: string }
  | { kind: 'assignee'; memberId: string }
);

type TaskViewIntent =
  | { type: 'open'; taskId: string }
  | { type: 'setStatus'; taskId: string; status: TaskStatus }
  | { type: 'setCompletion'; taskId: string; completed: boolean }
  | { type: 'setAssignee'; taskId: string; assigneeId: string | null }
  | { type: 'move'; taskId: string; beforeId: string | null;
      afterId: string | null; groupPatch?: TaskGroupPatch }
  | { type: 'reschedule'; taskId: string;
      startDate: DateOnly | null; dueDate: DateOnly | null };

```

Props chi tiết của TaskList nằm trong COMPONENT_CATALOG, mục 4.2. Workspace Tasks và Project List truyền selection kiểu `bulk`; My Tasks truyền kiểu `completion` và drag kiểu `none` theo source. Discriminated union giúp mỗi mode chỉ nhận callback phù hợp; UI chung không kiểm tra `location.pathname` sâu trong TaskRow.

## 5. State ownership

| Loại state | Chủ sở hữu | Ví dụ |
| --- | --- | --- |
| Dữ liệu nghiệp vụ | API; TanStack Query giữ cache ở web | Task, project, member, team, comment, file, unread, saved views |
| Dữ liệu mock | Một mock adapter duy nhất, schema giống API | Fixture xác định; persistence riêng khi chạy demo |
| URL | Router | workspace/project/member ID, tab/view, settings section, query/filter/sort/group, task deep link, calendar date/mode |
| Preference đã lưu | Preference API + local cache chống flash | theme/accent/density/weekStart/sidebar/view widths |
| Transient UI | Feature state hoặc app overlay controller nhỏ | hover, selection, drag preview, open popover, dialog stack |
| Form draft | Component/form hook có ID, chỉ submit qua typed command | task/project form, comment draft, title đang edit |
| Dữ liệu suy ra | Pure selectors/projection | progress, filtered groups, date positions, readable labels |

Không dùng `useEffect` để copy query data vào store khác. Khi chuyển workspace, hủy request cũ phù hợp, đóng drawer/selection gắn workspace cũ, sử dụng queryKey chứa workspaceId. Không để response chậm từ workspace A ghi vào màn B.

Form/edit state sống ổn định qua render. Lỗi API phải giữ draft và focus, hiển thị validation/error theo thiết kế, rollback optimistic state đúng entity. Không toàn app rerender/innerHTML như source.

## 6. Hướng API và mock

Mọi feature gọi một interface `StudioApi` qua controller/hook. `createHttpApi()` gọi REST; `createMockApi()` xử lý cùng request/response schemas và invariants trong memory. Chọn adapter một lần khi bootstrap. Mỗi feature WU bổ sung mock operation liên quan, không viết trước tất cả behavior của unit tương lai trong WU nền tảng.

Cache keys dạng `['workspace', workspaceId, 'tasks', normalizedQuery]` hoặc `['workspace', workspaceId, 'task', taskId]`. Query DTO phải đủ cho các view; detail/comments/history có read riêng. Một mutation có thể ảnh hưởng nhiều projection: TaskDetail, lists/board/table, calendar/timeline, project summary, Home, My Tasks, member workload, search, activity. Dùng invalidation map theo operation; không sao chép response vào từng page bằng tay.

**Toàn bộ dữ liệu và dữ liệu phân trang phải được phân biệt:** list endpoint có cursor, totals là số trên toàn bộ scope được phép. Board/Calendar/Timeline trong POC phải lấy đủ tập dữ liệu cần render trước khi tuyên bố ready; không chỉ lấy page đầu rồi tính các cột/statistics. Dataset không hoàn chỉnh phải có trạng thái rõ theo contract; không hiển thị count tưởng là tổng thật. Giữ scroll/list presentation nguồn, chưa tự thêm infinite-scroll UI.

## 7. Routing

Canonical app prefix `/w/$workspaceId`; source route keys map trong SCREEN_INVENTORY. Root `/` chuyển đến workspace/current home hợp lệ. Project route giữ 8 tab và saved view riêng. Settings section được validate theo allowlist.

Chọn browser history với file-based routing. Source chỉ đọc hash khi init và `go()` không viết URL: không có một hệ deep link cũ hoàn chỉnh phải copy. Tạo bảng redirect cho hash nguồn thực sự hỗ trợ (`#home`, `#mytasks`, `#login`, v.v.), dùng replace để không thêm history rác; không phỏng đoán `#project/p1` là URL cũ.

Task drawer liên màn hình có search param `taskId`; panel mode/tab là UI preference/search nếu cần phục hồi. Khi task được mở bằng click thì Back đóng drawer về đúng state trước; mở trực tiếp URL phải tải scope/task rồi hiện drawer. Action Close không gọi browser back mù nếu URL được mở trực tiếp. Test reload và Back/Forward riêng.

File preview có canonical deep link `/w/$workspaceId/projects/$projectId/files?fileId=$fileId`. Loader phải kiểm tra file thuộc đúng workspace/project và principal được đọc trước khi mở dialog. Copy link, refresh, Back/Forward và Close giữ đúng Files view/filter/scroll trước đó. Khi mở trực tiếp URL, Close chỉ bỏ `fileId` bằng replace; khi mở từ grid/list, history có thể quay về state trước theo dấu điều hướng do app quản lý. Không gọi back mù hoặc để một file của project khác hiện trong dialog.

Hai route `/dev/design-system` và `/dev/system-states` dùng **cùng AppShell và current-workspace provider** như source. Direct entry phải resolve workspace từ session/launch preference hoặc workspace seed hợp lệ trước khi render gallery; không tạo shell trắng riêng. Gallery chỉ bật trong mode POC/dev đã cấu hình; WU-04/05 có thể dùng harness cô lập trước khi AppShell ra đời, WU-07 ghép vào shell và WU-28 nghiệm thu đầy đủ.

Các search param nghiệp vụ được parse/validate/normalize; malformed param trở về default an toàn hoặc validation state định nghĩa, không crash. Luồng list filter chưa Save view chỉ đổi URL/current config; không PATCH named saved view ngầm. Copy link dùng canonical URL thật thay chuỗi giả trong source.

## 8. Tương tác và side effects

- DnD board/list dùng cùng move intent có scope/neighbors; calendar/timeline dùng reschedule intent. Không có mutable array riêng trong mỗi view.
- Completion checkbox/mark-complete dùng completion command riêng để giữ toast/Undo nguồn; status field PATCH và bulk field edit giữ semantics riêng của chúng. Undo nhận opaque descriptor từ adapter, được server áp theo phạm vi/version đã ghi; UI không gửi workspace snapshot làm payload.
- Sidebar project reorder là preference theo user/workspace, không thay thứ tự task hoặc project key. AppShell có controlled reorder callback từ WU-07; WU-16 nối đầy đủ operation/persistence và kiểm tra reload.
- State machine overlay nhỏ quy định opener/focus return/Escape/stack. Có thể dùng primitive headless đã kiểm chứng; không tự phát triển một framework overlay tổng quát.
- Global shortcuts chỉ đăng ký một lần, bỏ qua textbox/contentEditable khi thích hợp, cleanup listener đúng. Giữ Mod key theo platform.
- Rich text nằm trong editor adapter phạm vi nhỏ, chỉ 6 lệnh nguồn; không thêm cộng tác realtime/editor plugin system. Chỉ canonical sanitized content được render. Source markup/layout là chuẩn screenshot, implementation không bị ép giữ `execCommand` cũ.
- Date geometry/domain helpers không phụ thuộc `new Date()` global trong component; nhận clock/today để fixture xác định.
- CSS custom properties trong `style` được phép cho tọa độ timeline, color swatch, width resize và các giá trị động. Static styles không dùng nối class kiểu `bg-${color}` khiến Tailwind không sinh CSS.

## 9. Cách ngăn component trùng lặp

Mỗi WU phải tìm component gần nhất trong COMPONENT_CATALOG trước khi tạo mới. Nếu cần biến thể, phân biệt đó là cùng behavior/layout hay presentation khác. Component có một consumer vẫn được phép khi đó là phần nghiệp vụ độc lập; không chia vụn từng `div` thành file. Khi một row/editor lặp ở consumer thứ hai, ưu tiên nâng component/props hiện có thay copy markup.

Gate M1 chứng minh cùng TaskStatusField/AssigneeField và cùng task mutation được dùng ở List, Drawer, Board. Gate M2 chứng minh reuse ở Settings Members, Inbox Comments, Calendar ba scope và Timeline hai scope. Review dựa trên import/ownership và hành vi, không dựa trên số lượng file component.

## 10. Kiểm chứng và giới hạn

Chiến lược ảnh/geometry trong VISUAL_PARITY là bắt buộc ở mỗi UI WU. Typecheck/build không thay bằng chứng visual. API contract test và D1 local integration test không thay nhau: fake DB không chứng minh binding, FK hay batch rollback thật.

Handoff này chưa quyết định provider auth production hoặc topology deployment. Vite proxy local `/api` → Hono Worker dev đủ cho M3. Mở rộng Cloudflare sau có thể dùng Worker static assets/R2 production; không phải nhiệm vụ platform của POC.

WU-10 controller checkpoint: AppShell mounts one TaskOverlayHost, passes canonical
Router taskId/form/menu intents and opener ref. Controller queries details/files,
invalidates shared workspace/task keys and stores only UI draft/scroll/File intents;
DTOs remain Query cache. Serialized staged mock command owner from WU09 continues
with create children, description canonicalization, lifecycle/file metadata operations
and guarded bounded inverse. Pure domain adds DOM-less parse5 allowlist normalization;
web and later Worker owners share this helper, without React/DOM/storage dependencies.


WU-11 extends that same controller with per-child recoverable title/note drafts,
subtask detail intent and comment revision. Late post success invalidates its
original canonical scope, while clearing the UI draft requires the captured
revision to match the current per-task draft. Escape uses the registered Dialog
dismiss reason so a disabled child editor cannot accidentally dismiss its parent.
Child edits disable overlapping controls during the canonical parent-CAS command;
failed drafts stay recoverable. Comments/activity stay in Query infinite pages.
The same pure parse5 tree normalizer runs before editor HTML enters the DOM and
after each command/paste/drop, preserving logical selection offsets and direction.
Native drop default is prevented before insertion; the same normalization handles
external HTML/plain text. A same-editor live Range preserves internal move/copy
text and the browser point caret, without an additional editor platform.
