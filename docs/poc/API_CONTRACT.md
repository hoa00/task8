# API contract cho Gr8r React POC

## 1. Trạng thái, mục tiêu và ranh giới

Đây là đặc tả để Codex triển khai, **chưa phải API đã chạy**. Thiết kế được đối chiếu với Gr8r Studio tại commit `904205c626918ee96054eb35495c394a60c0c601`.

Mục tiêu gồm ba milestone: M1 chứng minh một luồng task hoàn chỉnh tại WU-12; M2 hoàn tất toàn bộ UI trên mock tại WU-29; M3 triển khai backend Hono + Drizzle + D1 ở WU-30–WU-36, bao gồm upload bytes thật vào R2 local ở WU-35 và tích hợp/kiểm chứng tại WU-36. React, TanStack Router và TanStack Query được dùng từ đầu. Mọi view task dùng cùng contract và domain operations.

**Quy ước triển khai của bản đặc tả:**

- Một seed workspace cho backend POC. Dữ liệu có `workspaceId`, mọi resource API phải xác minh workspace và quyền xem private project từ server.
- Principal phát triển cố định do Worker inject từ cấu hình local. Browser không được tự chọn user bằng header/query/body. Login/OAuth của source vẫn là UI demo.
- Real POC: dữ liệu project/task/subtask/team/comment/reaction/activity/notification state/saved view/favorite/preferences/file, các phép tính và search phục vụ UI.
- Workspace provisioning, invitation/email delivery, OAuth, password, 2FA, session security, payment/subscription và thay đổi ACL/sharing chưa phải tính năng thật. Giữ nguyên màn hình qua `DemoAdapter` được chọn tường minh.
- Không CI/CD, production deployment, queue, Durable Object, cron, generic workflow hoặc realtime collaboration.
- `packages/contracts` chứa runtime schemas Zod và DTO; không import Hono, React, Drizzle hoặc Worker bindings. `packages/domain` chứa phép tính thuần giới hạn cho query semantics/date/progress dùng chung khi cần.

Source hiện lưu `S.data`, `S.prefs`, `S.views` trong localStorage (`src/core/store.js`). Việc source báo “Invitation sent”, “Signed in”, “Uploaded” không chứng minh các dịch vụ này có thật. Chi tiết phân biệt hành vi nằm trong `SCREEN_INVENTORY.md` và phần 11 bên dưới.

## 2. Quy ước HTTP và dữ liệu

### 2.1 URL, payload, lỗi

Base path: `/api/v1`. Resource trong workspace dùng `/api/v1/workspaces/{workspaceId}`. Các bảng endpoint bên dưới dùng tiền tố viết tắt `W` cho đường dẫn này.

- JSON request/response dùng `Content-Type: application/json` và lowerCamelCase. Upload multipart và response file bytes được quy định riêng.
- Query được encode bằng `URLSearchParams`; tham số `filters` là một chuỗi JSON đã validate, không phải SQL hoặc chuỗi biểu thức tự do.
- `GET` trả `200`; tạo entity mới trả `201`; replay của create/upload idempotent trả `200` với đúng entity đã tạo; các mutation khác trả `200` với representation hoặc mutation result. Không trả body giả trong `204`.
- Success envelope: `{ data: T }`. Error envelope riêng, không trộn lỗi với success `200`.
- PATCH: field vắng mặt = giữ nguyên; `null` = xóa giá trị nullable. Chuỗi rỗng không thay thế `null`. Arrays được thay toàn bộ khi field xuất hiện, trừ endpoint riêng cho quan hệ.
- Reject unknown mutation fields. `id`, `workspaceId`, `createdAt`, `createdBy`, `key`, `position`, `version`, counters và permissions không được client tự ghi qua PATCH thông thường.
- Server không trả stack trace, SQL hay nội dung binding trong lỗi.

```ts
export interface ApiSuccess<T> { data: T }

export interface ApiError {
  error: {
    code:
      | 'VALIDATION_ERROR'
      | 'UNAUTHENTICATED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'VIEW_SCOPE_TOO_LARGE'
      | 'PAYLOAD_TOO_LARGE'
      | 'CAPABILITY_UNAVAILABLE'
      | 'INTERNAL_ERROR';
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  total: number; // exact count của toàn bộ tập match mà principal được phép thấy
}
```

| HTTP status | Trường hợp |
| --- | --- |
| 400 | JSON/query/cursor sai; giá trị không hợp lệ; date-only không tồn tại; PATCH không có field hợp lệ |
| 401 | Không có principal hợp lệ; dành sẵn cho auth provider sau này |
| 403 | Principal hợp lệ nhưng không được thực hiện operation; private project hiện hữu có restricted summary cho UI |
| 404 | Entity không tồn tại, đã bị xóa, thuộc workspace khác, hoặc child resource của project không được truy cập |
| 409 | `expectedVersion` cũ; duplicate unique key; dependency tạo chu trình; Undo không còn áp dụng được; clientRequestId bị dùng lại với payload khác |
| 413 | Body/file/bulk vượt giới hạn được capabilities công bố |
| 422 | Không dùng trong POC; validation thống nhất là 400 để client không phải đoán hai format |
| 501 | Operation có tên trong future contract nhưng capability chưa triển khai; không giả lập thành công ở live API |
| 500 | Lỗi bất ngờ; client giữ draft, hiển thị lỗi và cho thử lại phù hợp |

### 2.2 ID, ngày, thời gian

- Entity ID mới là UUID v7 do server sinh. Seed có bảng ánh xạ deterministic từ `m1/p1/t3/...` sang UUID v7 hợp lệ. Giữ nguyên task key hiển thị như `WEB-109`; source ID ngắn chỉ tồn tại trong fixture mapper/baseline scenarios.
- Foreign keys trong DTO dùng ID, không tên hiển thị. `assigneeId` và `leadId` là workspace membership ID.
- `DateOnly`: chuỗi `YYYY-MM-DD`, kiểm tra ngày có thật. Áp dụng cho task/project start/due, subtask due, milestone, calendar event date.
- `Instant`: ISO 8601 UTC, chuẩn hóa hậu tố `Z`, dùng cho created/updated/completed/archived/deleted/activity/readAt.
- Không convert date-only qua `new Date(value).toISOString()`; timezone của máy không được làm đổi ngày.
- Relative date/time trong fixture dùng `Clock` cố định và timezone được ghi ở baseline manifest. Backend lấy `todayDate` theo timezone đã cấu hình; không nhận `now` tùy ý từ public client.
- IDs và timestamps không dùng làm thứ tự thủ công. `position` là dữ liệu riêng; `id` là tie-breaker cuối.

## 3. Capability và hai adapter

```ts
export type DataMode = 'mock' | 'http';
export type CapabilityState = 'implemented' | 'demoOnly' | 'unavailable';

export interface CapabilitiesDto {
  dataMode: DataMode;
  identityMode: 'development';
  features: {
    projects: CapabilityState;
    tasks: CapabilityState;
    teams: CapabilityState;
    comments: CapabilityState;
    notificationState: CapabilityState;
    fileMetadata: CapabilityState;
    fileBytes: CapabilityState;
    workspaceProvisioning: CapabilityState;
    invitations: CapabilityState;
    projectSharing: CapabilityState;
    authentication: CapabilityState;
    accountSecurity: CapabilityState;
    billing: CapabilityState;
  };
  limits: {
    taskPageSize: number;       // default 50
    maxTaskPageSize: number;    // 200
    maxBulkItems: number;      // 20 cho POC; không suy diễn từ D1 parameter limit
    maxUndoTargets: number;    // 128 root/association targets cho một bounded compensation
    maxUndoPayloadBytes: number; // 65536; reject original command trước mọi write nếu vượt
    maxUploadBytes: number;    // 10 * 1024 * 1024 sau WU R2
  };
}
```

`mock` và `http` cùng implement `StudioApi` tại `apps/web/src/data`, cùng schemas, seed mapping, domain rules, sort/filter/null/date semantics và error shape. Components không đọc localStorage hay gọi fetch trực tiếp. Bootstrap chọn adapter một lần. Canonical mock áp dụng calendar-month recurrence và entity-scoped Undo giống HTTP ngay khi operation đó được triển khai; không có hai bộ business rules theo DataMode.

Legacy source behavior chỉ tồn tại trong reference/capture harness: khi source có bug đã được chốt sửa, harness ghi rõ source state, expected target state và deliberate correction để đối chiếu. Không dùng một production mock adapter chạy bug cũ rồi âm thầm đổi semantics khi bật HTTP. Các differences nằm trong decision registry, không làm đổi visual tokens/layout.

`DemoAdapter` là interface riêng cho các màn hình auth/security/billing/invite/sharing chưa có dịch vụ thật. Trong HTTP mode, những màn hình này vẫn dùng layout/component gốc nhưng có feedback mô phỏng tường minh. **Không fallback sang demo khi request thật lỗi. Không gọi live API rồi trả thành công giả cho email, đăng nhập, thanh toán hay 2FA.** Demo auth không được đổi principal của API.

HTTP `fileBytes` chuyển từ `unavailable` sang `implemented` tại WU-35; trước đó upload thật không được báo thành công. Mock có thể đặt `fileBytes:'demoOnly'` và tạo metadata sample để kiểm chứng source flow; progress demo không chứng minh bytes đã được lưu, `contentAvailable` vẫn false nếu không có asset thật.

## 4. Session, workspace và nguồn dữ liệu chung

| Method + path | Input | Output | Ghi chú |
| --- | --- | --- | --- |
| `GET /api/v1/session` | Không | `SessionDto` | Dev identity cố định, current workspace ID, capabilities; không password/session giả |
| `GET /api/v1/workspaces` | Không | `WorkspaceDto[]` | HTTP POC có một workspace seed; chooser demo có bộ fixture riêng |
| `GET W/bootstrap` | Không | `BootstrapDto` | Workspace, current member, members nhẹ, teams, project navigation summaries, catalogs, preferences, unread count và `navigationCounts:{inbox,myTasks,archive}` |
| `GET W` | Không | `WorkspaceDto` | Không tải toàn bộ tasks/comments/files |
| `PATCH W` | `UpdateWorkspaceInput` | `WorkspaceDto` | name/slug/iconColor; expectedVersion; không provision workspace mới |
| `GET /api/v1/me/profile` | Không | `UserProfileDto` | Một nguồn truth cho name/title/color; không bản sao trong prefs |
| `PATCH /api/v1/me/profile` | name/title/avatarColor + expectedVersion | `UserProfileDto` | Email read-only |
| `GET/PATCH W/me/preferences` | Validated preference fields | `MemberPreferencesDto` | Personal defaults; permission flags demo không nằm trong endpoint này |
| `GET/PATCH W/me/notification-preferences` | Notification boolean fields | `NotificationPreferencesDto` | Chỉ lưu preference; không tuyên bố email/push đã hoạt động |

`SessionDto` gồm `{ user, currentWorkspaceId, capabilities }`. `BootstrapDto` không đóng vai trò database dump. Query keys luôn có workspaceId; đổi workspace trong demo phải đổi data scope, không chỉ đổi logo như source.

Catalogs cố định: task statuses `backlog/todo/progress/review/done`, priorities `urgent/high/medium/low/none`, project statuses `planning/active/risk/hold/complete`, labels, project icons/colors, estimate options, project templates. Catalog có stable IDs; tên hiển thị và màu giữ source. Template “Software Development” chứa title mẫu nhắc CI; đó là nội dung task mẫu, không phải chỉ thị triển khai CI cho POC.

## 5. Project, member và team

### 5.1 Project DTO và operations

```ts
export interface ProjectDto {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'planning' | 'active' | 'risk' | 'hold' | 'complete';
  teamId: string | null;
  leadId: string;
  startDate: string | null;
  dueDate: string | null;
  visibility: 'workspace' | 'private';
  memberIds: string[];
  milestones: MilestoneDto[];
  isFavorite: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  version: number;
}

export type ProjectListItemDto =
  | { access: 'allowed'; project: ProjectDto; summary: ProjectSummaryDto }
  | { access: 'restricted'; project: RestrictedProjectDto };
```

Restricted summary dành cho card gốc: id/workspaceId/name/key/icon/color/status/dueDate/lead display và một mô tả đã xác định là catalog summary. Không kèm private task titles/counts/progress/comments/files/dependencies. Source private card có thông tin project công khai ở catalog; contract giới hạn rõ thông tin này thay vì gửi full ProjectDto rồi che CSS. Project detail private không được cấp quyền trả 403; child endpoint trả 404. Source card/list/table không nhất quán về thông tin private; tất cả các view React dùng cùng restricted DTO.

| Method + path | Input | Output / semantics |
| --- | --- | --- |
| `GET W/projects` | q, status, archived default false, sort recent/name/due/progress, cursor, limit | `CursorPage<ProjectListItemDto>`; exact totals theo visible catalog |
| `POST W/projects` | name, description, icon, color, teamId?, leadId, dueDate?, templateId | `ProjectMutationDto`; template creates task rows atomically; default visibility workspace |
| `GET W/projects/{projectId}` | Không | `ProjectDto` hoặc 403 |
| `PATCH W/projects/{projectId}` | expectedVersion + name/description/icon/color/status/teamId/leadId/startDate/dueDate | `ProjectMutationDto`; visibility/member grants không đổi qua endpoint này |
| `POST W/projects/{projectId}/duplicate` | expectedVersion, name | `ProjectMutationDto` + taskIdMap; copy data policy bên dưới |
| `POST W/projects/{projectId}/archive` | expectedVersion | Archived project + undo descriptor |
| `POST W/projects/{projectId}/restore` | expectedVersion | Clear archivedAt; không clear deletedAt |
| `DELETE W/projects/{projectId}` | JSON `{expectedVersion}` | Tombstone + undo descriptor; mọi scoped child read loại project deleted |
| `POST W/projects/{projectId}/restore-deleted` | expectedVersion | Clear deletedAt; giữ trạng thái archive và các child tombstone độc lập |
| `GET W/projects/{projectId}/members` | Không | Read-only `ProjectMemberDto[]`; chỉnh sharing thuộc DemoAdapter |
| `GET W/projects/{projectId}/summary` | Không | Counts/status/progress/overdue từ toàn bộ active task trong project, không current page |

Duplicate project: tạo project ID/key và task/subtask ID mới, reset task status về todo theo behavior source, reset completion/archive/delete metadata. Remap dependency giữa các task được copy; dependency ra ngoài project không được giữ trong POC copy. Không copy comments/activity cũ/favorites. Files không copy bytes trong project duplication; file duplicate riêng trong mục 9. Các thay đổi này được ghi như sửa tính toàn vẹn dữ liệu so với source clone-object.

### 5.2 Members và teams

| Method + path | Input | Output / semantics |
| --- | --- | --- |
| `GET W/members` | q, teamId?, status?, cursor, limit | `CursorPage<MemberDto>`; giữ invited fixture dưới trạng thái demo, không account đã đăng nhập |
| `GET W/members/{memberId}` | Không | Member profile read-only |
| `GET W/members/{memberId}/summary` | Không | Open/done/overdue và các project được principal phép thấy |
| `GET W/teams` | q? | `TeamDto[]` |
| `POST W/teams` | name/description/icon/color/memberIds | `TeamMutationDto` |
| `GET/PATCH W/teams/{teamId}` | PATCH expectedVersion + same editable fields | Team + membership assignments |
| `DELETE W/teams/{teamId}` | expectedVersion | Tombstone team; atomically clear đúng member/project associations; `TeamMutationDto.undo` cho phép restore toàn phạm vi lệnh |
| `GET W/teams/{teamId}/summary` | Không | Workload/projects từ scoped entities |

Một member có tối đa một primary team, đúng source. Chọn member ở team khác là chuyển team. Team name uniqueness case-insensitive giữa các team chưa bị xóa trong workspace. Update team và các assignments là một command; không gửi từng PATCH member từ frontend. Delete team và Undo được quy định chi tiết ở mục 7, bao gồm conflict khi có team mới dùng lại tên hoặc member/project đã đổi association. Profile edit của người khác, role/owner transfer, invite/resend/remove member account và permission settings thuộc DemoAdapter trong M3; không thiết kế auth/ACL engine mới cho POC.

## 6. Task aggregate và một query engine

### 6.1 DTO

```ts
export interface TaskDto {
  id: string;
  workspaceId: string;
  projectId: string;
  key: string;
  title: string;
  descriptionHtml: string;
  status: 'backlog' | 'todo' | 'progress' | 'review' | 'done';
  assigneeId: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  startDate: string | null;
  dueDate: string | null;
  estimate: string | null;
  recurrence: 'daily' | 'weekly' | 'biweekly' | 'monthly' | null;
  labelIds: string[];
  dependencyIds: string[];
  position: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  isFavorite: boolean;
  subtaskSummary: { total: number; completed: number };
  attachmentCount: number;
  commentCount: number;
}

export interface SubtaskDto {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  note: string;
  position: number;
}

export interface TaskDetailDto {
  task: TaskDto;
  subtasks: SubtaskDto[];
  attachments: FileDto[];
}

export interface TaskMutationDto {
  task: TaskDto;
  createdTasks: TaskDto[]; // recurrence/promote/duplicate nếu operation sinh thêm entity
  affectedProjectIds: string[];
  undo: UndoDescriptor | null;
}
```

Description là **restricted sanitized HTML**, không plain text giả. Giữ các thao tác hiện có: bold, italic, unordered list, ordered list, h4, link; normalize `b/strong`, `i/em`. Allowlist gồm `p`, `br`, `strong`, `em`, `ul`, `ol`, `li`, `h4`, `a`; link chỉ cho http/https, đặt rel an toàn khi dùng target blank. Loại script/style/event handlers/iframe/arbitrary attrs. Sanitizer phải chạy được trong Worker và được resolve/test tại WU-32 cùng task create/PATCH; WU-33 dùng lại các invariants này. Regex strip HTML không phải sanitizer. Derived `descriptionText` chỉ để search, do server tạo từ sanitized tree. Seed HTML được normalize mà không đổi hiển thị. Không bổ sung collaborative editor hoặc editor platform.

### 6.2 Query semantics được khóa cho parity

Task filters có field: status, assignee, priority, due, project, labels, created, updated. Các filter AND; values cùng filter OR; `op: 'is' | 'not'`. Unassigned dùng JSON null; source sentinel `'none'` chỉ đổi trong adapter legacy.

Due buckets giữ hành vi source:

- overdue: due trước today và status khác done;
- today: due = today;
- week: today ≤ due ≤ today + 7 ngày;
- later: due > today + 7 ngày;
- nodate: due null.

**Group by due vẫn giữ sự trùng Today và Next 7 days của source cho UI parity.** `groupTasks` dùng quy tắc này có thể xuất hiện cùng một task trong hai group; group counts không được cộng thành total unique. Summary `total` đếm unique task. Sửa ngữ nghĩa bucket là quyết định sản phẩm sau, không tự sửa trong conversion.

Sort fields: manual/title/due/start/priority/status/assignee/created/updated/estimate/project; direction asc/desc. Preserve source null sort khi có ảnh hưởng hiển thị: due/start null dùng sentinel tương đương `'9999'`, assignee/estimate null dùng `'zzz'`; đảo chiều cũng đảo vị trí null. Priority rank urgent→high→medium→low→none ở asc; created/updated source asc nghĩa mới nhất trước. Estimate sort vẫn chuỗi như source. Mỗi comparator kết thúc bằng stable ID tie-breaker, dùng cùng semantics mock/server.

`q` trong task toolbar search title/key; global search thêm description/comments, không tự thay semantics toolbar. Default excludes archived/deleted task và archived/deleted project. Việc loại task thuộc project archived là sửa lỗi integrity source được ghi rõ, không phải behavior source đã có.

### 6.3 Pagination, Board/Calendar/Timeline và số liệu

`GET W/tasks` nhận `projectId?`, `assigneeId?`, `favoriteOnly?`, `archived?`, `q?`, `filters?`, `sortField?`, `sortDirection?`, `rangeFrom?`, `rangeTo?`, `rangeBasis?:due|overlap`, `cursor?`, `limit?`.

- `CursorPage<TaskDto>` với default limit 50, maximum 200; cursor opaque encode sort tuple + id + normalized query fingerprint. Không dùng offset. Cursor của query khác bị 400.
- Keyset order phải so sánh đầy đủ sort tuple, null sentinel/direction và ID. Filtering dùng prepared values, allowlist sort columns. Có edit đổi sort field giữa hai lần fetch thì frontend invalidate/restart query; POC không hứa snapshot isolation giữa các page.
- `GET W/tasks/summary` nhận cùng scope/filter/range, trả `{total,byStatus,byPriority,overdue,completed,completionRate,subtaskTotals}` tính trên **toàn bộ tập match**. Không nhận cursor/limit làm giới hạn số liệu.
- Board/Calendar/Timeline dùng loader chung `loadTaskViewDataset(query)`: fetch task pages bằng cursor đến cuối, lấy summary cùng query. Không tự đặt `MAX_TASKS=1000` rồi coi đó là tất cả dữ liệu.
- Loader trả `{items, coverage: 'complete'|'partial', matchedCount, nextCursor, summary}`. `coverage:'complete'` chỉ khi cursor hết và bộ items đã dedupe. Khi đổi filter/mutation trong lúc nạp, hủy request cũ và restart.
- Khi coverage partial, UI chưa được trình bày Board/Timeline như tập dữ liệu đầy đủ. Tiếp tục loader với existing loading state; nếu view scope vượt budget được cấu hình/đo ở WU, trả `VIEW_SCOPE_TOO_LARGE`, giữ filter toolbar để thu hẹp range/project. Không truncate im lặng và không tạo con số full từ items chưa đầy đủ.
- Calendar query dùng dueDate trong khoảng ngày đang hiển thị. Timeline dùng overlap của [startDate hoặc dueDate, dueDate] với viewport range; null due không có bar. Project milestones/events có dữ liệu riêng trong phần 10.
- Trường `total` không dùng làm thay thế source-count khi source dùng một phép tính khác, ví dụ “Completed this week” dựa completedAt 7 ngày chứ không updatedAt.

### 6.4 Operations

| Method + path | Input | Semantics |
| --- | --- | --- |
| `GET W/tasks` | TaskQuery ở trên | Một query engine cho all tasks/mytasks/project/favorites/member/list/board/table |
| `GET W/tasks/summary` | Same query sans pagination | Full authorized dataset aggregates |
| `GET W/tasks/{taskId}` | Không | TaskDetailDto; comments/activity query riêng |
| `GET W/task-keys/{taskKey}` | Không | Resolve current task key to TaskDetailDto; link ưu tiên immutable taskId |
| `POST W/tasks` | clientRequestId + title/projectId/status/assigneeId/priority/startDate/dueDate/estimate/recurrence/descriptionHtml/labelIds/dependencyIds/subtasks | Server ID/key/timestamps; single atomic create; arrays default empty; idempotency và draft files theo mục 6.6 |
| `PATCH W/tasks/{taskId}` | expectedVersion + editable scalar/description/labelIds/dependencyIds fields | Full domain validation; project movement qua move command; field/menu edit không tự thêm Undo toast |
| `POST W/tasks/{taskId}/completion` | expectedVersion, completed:boolean | Checkbox completion/reopen; `operationId: setTaskCompletion`; hoàn thành từ trạng thái mở trả Undo kể cả khi sinh recurrence |
| `POST W/tasks/{taskId}/move` | expectedVersion, scope, targetProjectId?, beforeId?, afterId?, groupPatch? | Atomic ordering + status/priority/assignee/project change; server computes position/key |
| `POST W/tasks/{taskId}/duplicate` | expectedVersion, title? | New task/subtask IDs; same project; no comments/history/favorites; no file-byte copy |
| `POST W/tasks/{taskId}/archive` | expectedVersion | archivedAt now; mutation response undo |
| `POST W/tasks/{taskId}/restore` | expectedVersion | clear archivedAt only |
| `DELETE W/tasks/{taskId}` | expectedVersion | deletedAt tombstone; no whole-workspace snapshot |
| `POST W/tasks/{taskId}/restore-deleted` | expectedVersion | Clear own deletedAt; parent project must be active/not deleted and accessible |
| `POST W/tasks/bulk` | operation + items[{id,expectedVersion}] + patch?/columnScope? | max 20; whole request success/failure; `BulkTaskMutationDto`; Undo theo loại source command ở mục 7 |
| `POST W/tasks/{taskId}/subtasks` | expectedTaskVersion,title,done?,assigneeId?,dueDate?,note? | Return updated TaskDetailDto; parent task version increments |
| `PATCH/DELETE W/tasks/{taskId}/subtasks/{subtaskId}` | expectedTaskVersion + subtask fields | Same scoped parent aggregate |
| `POST W/tasks/{taskId}/subtasks/{subtaskId}/promote` | expectedTaskVersion | Create task and remove subtask atomically; inherit source rules; return parent+created task |

Register static routes `/tasks/summary` and `/tasks/bulk` before generic `/:taskId` routes where the router requires; do not let `summary` parse as ID.

Move `scope` là normalized TaskQuery bỏ cursor/limit, có groupBy/groupKey nếu kéo giữa các group. `groupPatch` allowlist status/priority/assigneeId only; targetProjectId riêng. Neighbors phải cùng destination workspace/scope/group sau patch; không nhận raw position từ browser. Calendar/timeline kéo ngày gọi PATCH với cặp startDate/dueDate, giữ thời lượng như source; không endpoint duplicate cho từng view.

Bulk operation enum: `patch`, `complete`, `archive`, `delete`; patch allow status/assigneeId/priority/dueDate. `patch` là source bulkSet, luôn `undo:null`, kể cả patch status done. `delete` là selected bulk delete, có Undo. `complete` là Complete column; `archive` là Archive completed column; cả hai có Undo và bắt buộc `columnScope`.

`ColumnScope = {kind:'workspace',status:TaskStatus} | {kind:'project',projectId:string,status:TaskStatus}`; archive chỉ nhận status done. Source `colTasks` (`src/actions/actions.js:1143–1146`) lấy allTasks/tasksOf(project) + status, không toolbar filters; contract giữ scope lệnh này, có bổ sung server access/lifecycle checks đã chốt. Client lấy tập ID/version hoàn chỉnh của scope; final SQL guard kiểm tra set equality và versions, không chỉ kiểm tra mỗi ID được gửi. Không dùng page hiện tại hoặc subset do toolbar lọc làm toàn bộ column. Có row mới/đổi status giữa lúc đọc và ghi → 409, refetch, không đổi row nào. Column rỗng không tạo task; archive rỗng trả một Undo no-op để giữ source toast; complete rỗng không có toast/Undo.

`BulkTaskMutationDto = {tasks:TaskDto[], createdTasks:TaskDto[], affectedProjectIds:string[], undo:UndoDescriptor|null}`. `complete` dùng cùng transition core với single completion; inverse của hai command khác nhau có chủ đích theo source, như mục 7.4. Bộ task cần xử lý vượt maxBulkItems → 413 trước write, không chia thành nhiều commit rồi vẫn báo một lệnh atomic.

Dependency policy POC: cùng workspace, principal được xem cả hai task, không self/cycle; không thêm auto-scheduling hay tự block status. Nguồn `deps` vẽ đường Timeline, không phải workflow engine.

### 6.5 Completion và recurrence

Done transition set completedAt, lưu previousStatus hợp lệ; reopen xóa completedAt. Completion checkbox gọi `setTaskCompletion`: completed=false trên task done khôi phục previousStatus khác done, fallback todo. completed=true trên task đã done hoặc completed=false trên task đang mở là no-op và undo null; expectedVersion/access vẫn phải hợp lệ. PATCH status và bulk patch vẫn dùng transition core nhưng không tạo source completion Undo toast.

Done→done không sinh recurrence mới. Một occurrence đang giữ recurrence slot đã có successor thì reopen/recomplete không sinh successor thứ hai. Single-completion Undo giữ slot/successor; Complete-column Undo có thể hủy successor vừa sinh và giải phóng slot trong cùng batch. Chỉ trường hợp thứ hai cho lần complete sau sinh successor mới. Recurrence chỉ tạo lần tiếp theo khi hoàn tất task có dueDate; không cron hay scheduler.

- daily +1 ngày; weekly +7; biweekly +14.
- monthly: cộng **một tháng lịch**, clamp vào ngày cuối tháng đích. Đây là **intentional domain correction**: source dùng +30 ngày (`src/actions/actions.js:62–90`). Canonical mock và HTTP cùng dùng calendar-month rule; reference harness ghi sự khác biệt với source và chuẩn bị expected post-state khi capture scenario này. Không mô tả source đã có đúng monthly, không cho DataMode quyết định business rule.
- Successor reset status todo, completedAt null, subtasks done false, attachments empty, IDs mới. StartDate của successor bằng dueDate mới theo source; không tự thêm duration-preservation rule cho recurrence.
- TaskMutationDto trả createdTasks để các query liên quan được invalidate. Unique recurrence slot và version checks ngăn duplicate do double submission; phần 7 khóa hai cách Undo khác nhau theo source.

### 6.6 TaskForm, draft files và submit idempotency

TaskForm có files trước khi task tồn tại. Giữ source layout/draft list, nhưng commit HTTP có hai bước rõ: **tạo task một lần → upload từng file vào taskId vừa nhận**. `POST W/tasks` không nhận metadata attachment để giả rằng bytes đã lưu. Subtasks nằm trong atomic create; file upload là các request riêng theo mục 9.

- Mỗi logical submit sinh `clientRequestId` UUID, đóng băng payload task và danh sách draft files. Double-click khi pending dùng cùng promise/key, không tạo submission mới. Server uniqueness theo workspace + actor + clientRequestId; cùng key/cùng normalized payload trả đúng task đã tạo, khác payload → 409. Replay không cấp task number mới.
- Sau create 201/200, controller giữ `taskId` và không gọi create với key mới khi chỉ một attachment lỗi. Mỗi draft file có clientRequestId riêng, cố định qua retry. Thay bytes/tên/target một cách có chủ đích là một upload intent mới; retry cùng intent giữ key cũ.
- File state: queued → uploading → attached hoặc failed; mất response giữ trạng thái chưa xác nhận và retry cùng key. Chỉ attached sau response metadata+bytes thành công. Không gộp lỗi file vào thông báo “task chưa được tạo”, và không báo all-success nếu còn failed/pending.
- Task đã commit vẫn tồn tại khi upload lỗi. UI giữ taskId, danh sách thành công/lỗi và action Retry failed; retry chỉ các file chưa xác nhận. Không xóa task để giả rollback cross-service.
- **Create more** chỉ reset tự động sau task và mọi draft file hoàn thành. Khi partial failure, giữ current submission; người dùng có thể retry hoặc gỡ các file lỗi bằng draft-file controls hiện có để tiếp tục. Chỉ lựa chọn tường minh đó mới bỏ draft file chưa gửi và mở form mới với key mới. Close/reset sau khi task đã commit không xóa task hay attachment đã thành công, không chạy lại create. Request upload đã gửi có thể hoàn tất sau close; giữ task/file intent IDs đến khi resolved và invalidate đúng task, không gán response vào submission mới.
- Giữ metadata submission đang pending trong sessionStorage theo workspace/member: request key, normalized task payload, taskId nếu đã biết và file intent/status. File bytes vẫn ở File object trong memory. Reload khi response create thất lạc cho phép retry chính payload/key đó; nếu cần retry file sau reload, yêu cầu chọn lại file phù hợp. Không có background/offline upload queue.
- Mock chạy cùng thứ tự submit/state và cùng create/upload dedup rules; metadata sample được đánh dấu demo, `contentAvailable:false` khi không có bytes. Không dùng sample attachment success làm bằng chứng R2 đã hoạt động.

## 7. Source-visible Undo, bounded compensation và conflict

### 7.1 Phạm vi và evidence

Giữ Undo ở đúng các source actions có Undo. Source `snapshot()/restore()` sao chép cả S.data (`src/actions/actions.js:130–137`); target thay cơ chế lưu bằng **bounded command compensation**, không bỏ action Undo để né việc triển khai. Canonical mock và HTTP dùng cùng các rules bên dưới. Reference harness ghi nhận khác biệt integrity/concurrency, không đổi nghiệp vụ theo DataMode.

Một bảng `commandUndoRecords` lưu payload do server tạo cho đúng whitelist operation, tối đa 128 root/association targets và 65.536 bytes/record. Record được insert trong cùng atomic batch với mutation. Không có generic command interpreter, public journal/list API, undo history UI, redo, expiry, cron hay queue. Các endpoint restore/restore-deleted thông thường vẫn tồn tại, nhưng toast Undo gọi duy nhất endpoint bên dưới.

```ts
export type UndoKind =
  | 'task.complete'
  | 'task.archive'
  | 'task.delete'
  | 'project.archive'
  | 'project.delete'
  | 'comment.delete'
  | 'file.delete'
  | 'tasks.bulkDelete'
  | 'tasks.completeColumn'
  | 'tasks.archiveCompletedColumn'
  | 'team.delete';

export interface UndoDescriptor { id: string; kind: UndoKind }

export interface UndoResultDto {
  undoId: string;
  kind: UndoKind;
  appliedAt: string; // UTC Instant, giữ nguyên khi replay
  affected: {
    taskIds: string[];
    projectIds: string[];
    teamIds: string[];
    memberIds: string[];
    commentIds: string[];
    fileIds: string[];
  };
}
```

| Method + path | Operation ID | Input | Output |
| --- | --- | --- | --- |
| `POST W/tasks/{taskId}/completion` | `setTaskCompletion` | `{expectedVersion,completed:boolean}` | TaskMutationDto, Undo chỉ khi false→true transition thực sự |
| `POST W/tasks/bulk` | `bulkMutateTasks` | Discriminated bulk input ở mục 6.4 | BulkTaskMutationDto |
| `DELETE W/teams/{teamId}` | `deleteTeam` | `{expectedVersion}` | TeamMutationDto có Undo |
| `POST W/undo/{undoId}` | `undoCommand` | `{}` | UndoResultDto; lần đầu và retry sau thành công đều 200 |
| `POST W/tasks` | `createTask` | Task create input + clientRequestId | TaskMutationDto; create 201 / replay 200 |
| `POST W/projects/{projectId}/files` | `uploadProjectFile` | multipart file/taskId?/clientRequestId | FileDto; create 201 / replay 200 |

Client không gửi old values, affected IDs hay expected versions cho Undo: record server đã giữ exact post-versions và inverse fields. Undo ID không phải quyền truy cập; chỉ actor tạo record trong workspace đó được dùng, server reauthorize operation/resource scope. Foreign/other-actor record →404; known forbidden scope →403; có target thay đổi → 409. Operation/payload ngoài whitelist không được chạy.

### 7.2 Bảng hành vi đầy đủ

| Source action / evidence | Undo kind | Compensation khi không có conflict |
| --- | --- | --- |
| Checkbox complete task, `actions.js:424–431` | `task.complete` | Reopen về status trước khi complete; clear completedAt; **giữ recurring successor đã sinh**, như callback source |
| Single archive task, `actions.js:483–493` | `task.archive` | Restore archivedAt trước lệnh; giữ mọi field không thuộc lệnh |
| Single delete task, `actions.js:503–509` | `task.delete` | Clear tombstone task; các child/relations được giữ trong storage hiện lại theo scope |
| Archive/delete project, `actions.js:1356–1402` | `project.archive` / `project.delete` | Restore lifecycle đúng project; không hồi sinh child đã tự bị xóa trước đó |
| Delete comment, `actions.js:897–901` | `comment.delete` | Restore đúng own comment và reactions còn được giữ |
| Delete file, `actions.js:1648–1655` | `file.delete` | Restore cùng file ID ở drawer/project; giữ R2 bytes |
| Selected bulk delete, `actions.js:974–975` | `tasks.bulkDelete` | Restore toàn bộ task tombstones của lệnh trong một batch; không partial restore |
| Complete column, `actions.js:1154–1156` | `tasks.completeColumn` | Restore fields đã đổi trên các parent tasks; hủy chỉ successors mới sinh bởi chính lệnh nếu chưa thay đổi |
| Archive completed column, `actions.js:1161–1170` | `tasks.archiveCompletedColumn` | Restore archivedAt của đúng tập task đã archive; một target stale thì không target nào được restore |
| Delete team, `src/actions/teams.js:107–120` | `team.delete` | Restore team và exact member/project assignments đã clear, nếu toàn bộ postconditions còn đúng |
| Plain bulkSet status/assignee/priority/due, `actions.js:959–965` | null | Không thêm Undo toast vào source action vốn không có Undo |
| Task/project field PATCH; task/project create/duplicate; task move/reorder; subtask add/edit/delete/promote; team create/update; saved-view create/update/delete | null | Giữ feedback gốc của từng action; không tạo Undo mới theo thói quen |
| Restore/restore-deleted/reopen; file rename/duplicate; favorites; notification read; preferences/profile | null | Không thêm undo-redo history |

Source remove project member/remove workspace member cũng có Undo, nhưng các thao tác đó thuộc DemoAdapter của sharing/account screens trong M3; giữ feedback/Undo demo trong cùng demo state, không cho nó thay real API principal/grants.

### 7.3 Atomic, one-shot và replay

Forward command ghi record gồm actor/workspace/kind, old fields của đúng targets, post-versions, successor IDs mới sinh và command-owned activity IDs cần retract. Old values chỉ lấy từ read đã được final CAS bảo vệ; post-versions lấy sau mọi write **trong cùng batch**, không query ở request khác. Vượt bound/budget → 413 trước mutation, không thực hiện action rồi mới phát hiện không tạo được Undo.

Undo kiểm tra tất cả target versions/lifecycles/associations và quyền trong final SQL guard. Cùng một D1 batch thực hiện inverse, cập nhật history thuộc chính lệnh, tăng versions và ghi consumedAt + immutable resultJson. Zero-row guard → 409 với **zero effects** và record vẫn pending. Mid-batch SQL failure rollback cả inverse lẫn consumption.

Hai lần click/retry cùng Undo ID chỉ áp dụng một lần: request sau đọc stored result của record đã consumed và trả 200 cùng UndoResultDto. Mỗi attempt dùng mutation marker mới, không tái dùng undoId làm marker. Retry không ghi activity thêm, không đổi version lần nữa. Client invalidate/refetch query keys từ affected IDs; không chép historical DTO vào cache, nên response cũ không hồi sinh state sau một edit mới. Replay vẫn kiểm tra actor/workspace và quyền hiện hành.

Versions luôn tăng, kể cả khi value đổi A→B→A. Không dùng value equality làm CAS. Undo không decrement taskSequence, không rewind ID/time generators, không overwrite workspace hoặc những entity ngoài record. History chỉ retract đúng rows do original command tạo; không xóa history của người khác. Single-completion Undo giữ completion/create events và thêm reopen event theo source callback; snapshot-style source Undo retract command-owned events, không thêm generic “Undo” row làm đổi feed.

### 7.4 Hai trường hợp recurrence Undo

**Single completion:** record lưu parent post-version và previous status. Undo reopen parent, giữ mọi successor và recurrence slot. Successor đã được chỉnh vẫn không bị ghi đè/xóa bởi Undo này. Re-complete parent sau đó không tạo thêm successor vì slot vẫn được giữ. Đây là behavior của `toggleDone`, không phải lỗi cần âm thầm sửa.

**Complete column:** record lưu before status/completedAt/previousStatus/updatedAt cho từng parent thực sự đổi và exact successors được chính command tạo. Undo chỉ chạy khi mọi parent và mọi successor đó còn đúng post-version, và các successor chưa có thay đổi scalar/subtask/comment/reaction/file/favorite/incoming dependency. Các write liên quan phải bump task.version hoặc có equivalent final guard theo DATA_MODEL; kiểm tra mỗi status=todo là không đủ.

Sau guard, restore parent fields, tăng version; tombstone các successor được hủy, set cancelledByUndoId, clear recurrenceSourceTaskId để giải phóng unique slot. Successor có sẵn trước command được giữ. Hủy successor là một phần compensation, không có restore-deleted/redo cho successor đó. Re-complete sau successful column Undo sinh một successor mới đúng calendar recurrence rule; không tái dùng ID/key cũ. Bất kỳ successor/association nào đã đổi → 409, tất cả parent/successor giữ nguyên.

### 7.5 Team delete và lifecycle

Team delete chuyển team sang tombstone và clear teamId của đúng members/projects hiện gắn team, tăng versions của từng row. Original batch phải kiểm tra **đúng tập associations**, không dựa vào một snapshot preflight đã cũ. Undo giữ team ID/metadata và restore mỗi association về team cũ chỉ khi team tombstone, từng member/project còn version và lifecycle sau lệnh delete, cùng teamId=null. Member đổi null→teamB→null vẫn conflict vì version khác. Lifecycle bị đổi sau lệnh, association bị đổi hoặc team mới chiếm tên normalized → 409 cho toàn Undo; không restore phần còn lại. Project/member đã archive/tombstone từ trước vẫn được phục hồi riêng teamId nếu postconditions còn đúng; Undo không clear lifecycle của những record này.

Team command là workspace-scoped administration của principal phát triển được phép quản lý teams; nó có thể bảo toàn/clear internal team association của project restricted mà không cấp quyền đọc private task/content. Payload private associations ở server, không gửi full records cho browser. Exact association set gồm cả rows archived/deleted còn giữ team reference, để không để dangling assignment sau restore sau này.

Delete task/project/file/comment/team ghi deletedAt/deletedBy và tăng version. Default reads ẩn tombstone. Restore-deleted thông thường chỉ cho actor đã xóa và còn quyền hiện hành; không nhận whole object từ client. Project deletion không ghi đè từng child.deletedAt; child tự xóa vẫn bị xóa khi project được restore. File tombstone giữ bytes R2. Nút source “Delete permanently” trong Archive vẫn có ở demo, M3 không công bố physical purge capability hay background cleanup.

## 8. Comments, activity, notifications, views và favorites

| Method + path | Input | Output / semantics |
| --- | --- | --- |
| `GET W/tasks/{taskId}/comments` | cursor,limit | `CursorPage<CommentDto>`; oldest-first ổn định theo createdAt,id |
| `POST W/tasks/{taskId}/comments` | bodyText, mentionedMemberIds[] | Comment + parent task projection; author server-derived; mentions chỉ in-app data, không gửi email |
| `DELETE W/comments/{commentId}` | expectedVersion | Own comment tombstone + undo; principal+project scoped |
| `POST W/comments/{commentId}/restore-deleted` | expectedVersion | Restore own comment; conflict/visibility checks |
| `PUT/DELETE W/comments/{commentId}/reactions/{reactionKey}` | Không | Idempotent own reaction add/remove; current aggregate reaction counts/members |
| `GET W/activity` | projectId?,taskId?,actorId?,cursor,limit | `CursorPage<ActivityDto>`; newest-first; server creates activity from commands |
| `GET W/notifications` | category?,unreadOnly?,cursor,limit | `CursorPage<NotificationDto>` + unread count toàn bộ principal scope |
| `PATCH W/notifications/{notificationId}` | read:boolean | current recipient only; readAt server assigned/null |
| `POST W/notifications/read-all` | Không | `{changedCount,unreadCount}`; no change người khác |
| `GET W/projects/{projectId}/views` | Không | `SavedViewDto[]` |
| `POST W/projects/{projectId}/views` | name,type,filters | Project-scoped saved definition; default createdBy current member |
| `PATCH/DELETE W/views/{viewId}` | expectedVersion + name/type/filters | Edit/delete definition; current unsaved URL filters không auto-save |
| `PUT/DELETE W/me/task-favorites/{taskId}` | Không | Idempotent favorite projection current member |
| `PUT/DELETE W/me/project-favorites/{projectId}` | Không | Same |
| `PUT W/me/project-order` | projectIds[] | Personal order of known visible catalog projects; server rejects duplicates/foreign IDs |

CommentDto: id/workspaceId/taskId/authorId/bodyText/mentionedMemberIds/createdAt/version/reactions. Reactions use stable supported keys mapped to source icons; URI encode key, do not infer role/permissions from HTML label.

ActivityDto: id/actorId/eventType/taskId?/projectId?/createdAt/payload; frontend formatter produces source English verb labels. Activity payload snapshots may retain title/key when target tombstoned, but must never bypass project visibility. No client API to append arbitrary audit feed event.

SavedViewDto: id/workspaceId/projectId/name/type `list|board|table`, filters,createdBy,position,version. Definition is shared at project scope for POC; unsaved query/sort/group/column widths are personal UI/URL state. Granular sharing permissions remain out of scope.

Notification state is real persistence of seeded/in-app notification records; scheduled reminders/digest and email/push transport remain absent. Reply in Inbox calls the same task comment endpoint, not an independent Inbox message model.

## 9. Files và R2 ở milestone cuối

### 9.1 Một nguồn truth

Source giữ `task.attachments` và `D.files` trùng nhau, nhiều thao tác xóa bằng name. Backend chỉ có một file identity; TaskDetail.attachments và ProjectFiles truy vấn cùng records. Rename/delete theo ID. `taskId` nullable nghĩa file gắn riêng project.

```ts
export interface FileDto {
  id: string;
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  name: string;
  fileType: string; // category để giữ icon/presentation source
  mimeType: string | null;
  sizeBytes: number | null;
  displaySize: string; // legacy seed giữ chuỗi gốc; uploaded file derive từ bytes
  storageMode: 'sample' | 'r2';
  contentAvailable: boolean;
  createdBy: string;
  createdAt: string;
  version: number;
}
```

Seed metadata có `storageMode:'sample'`, `contentAvailable:false` nếu repo không có file thật. Không chế bytes và nói đó là tài liệu gốc. Mock preview dùng artwork gốc. File vừa upload thật có actual bytes/size, R2 object key nội bộ không trả cho browser.

| Method + path | Input | Output / semantics |
| --- | --- | --- |
| `GET W/projects/{projectId}/files` | q,type,sort,cursor,limit | `CursorPage<FileDto>` |
| `GET W/files/{fileId}` | Không | FileDto |
| `PATCH W/files/{fileId}` | expectedVersion,name | Rename metadata; giữ content identity |
| `POST W/files/{fileId}/duplicate` | expectedVersion,name? | New FileDto; sample stays sample, R2 copies actual bytes to independent object |
| `DELETE W/files/{fileId}` | expectedVersion | Tombstone + undo; drawer/project files cùng cập nhật; R2 bytes không xóa tức thì |
| `POST W/files/{fileId}/restore-deleted` | expectedVersion | Restore metadata visibility; content phải còn tồn tại |
| `POST W/projects/{projectId}/files` | multipart: `file`, `clientRequestId`, optional `taskId` | R2 upload tại WU-35; new 201 / replay 200 only after bytes+metadata success |
| `GET W/files/{fileId}/content` | optional disposition `inline|attachment` | Authorized bytes stream with content type and disposition; sample missing bytes returns404 |

Mỗi upload request chứa một file. UI multi-select quản lý từng item/status/progress và gửi từng request; tránh một file lỗi làm UI báo toàn bộ thành công. POC max upload 10 MiB do capabilities công bố; source “250 MB each” là lời demo chưa enforce, HTTP mode phải hiển thị giới hạn thật bằng cùng layout. Screenshot mock vẫn dùng wording gốc. Không quảng cáo upload 250MB trên Worker chưa kiểm tra request/runtime limits.

Upload flow: validate metadata + project/task scope → enforce actual size/type và tính content hash → resolve clientRequestId → ghi R2 bytes nếu là intent mới → D1 batch insert metadata/activity/touch task → return 201. File idempotency scoped workspace/actor/requestId, request hash gồm projectId/taskId/name/mime/actual size/content SHA-256. Cùng intent đã thành công trả cùng file ID với current authorized FileDto và 200; khác bytes/metadata → 409, không overwrite object cũ. Không dùng filename làm dedup identity.

Nếu task/file đã bị xóa hoặc chuyển scope sau request gốc, replay trả 409/404 phù hợp; không tạo task/file khác để bù. Request create/upload cùng key sau lost response phải giữ đúng identity. Mỗi concurrent upload attempt dùng object key mới của riêng attempt; chỉ một metadata row thắng unique key. Attempt thua phải cleanup object riêng của mình, không delete object đã được winning row tham chiếu. Xem final guards và key/hash columns trong DATA_MODEL.

Chỉ cleanup object riêng của attempt khi **đã xác nhận SQL rollback, final guard không ghi, hoặc attempt thua**, và object đó không được committed file row tham chiếu. Nếu D1 timeout/mất acknowledgement khiến kết quả commit chưa xác định, không dùng catch-all delete: kiểm chứng request key/objectKey bằng read có tính nhất quán phù hợp và nằm trong query budget. Committed row trỏ object này thì giữ bytes; committed winner trỏ object khác thì object của losing attempt mới đủ điều kiện cleanup. Nếu chưa xác định được kết quả hoặc write cũ có thể còn hoàn tất, giữ object/intent IDs, báo chưa xác nhận để retry cùng intent; một lần đọc không thấy row chưa đủ chứng minh write đã rollback. Nếu cleanup xác nhận cần thiết nhưng thất bại, ghi lỗi với object ID nội bộ và trả lỗi, không báo all-success. POC không thêm queue/cron; object chưa giải quyết phải được ghi nhận để kiểm tra lại, không tuyên bố không thể có orphan tạm thời. Mọi duplicate byte copy áp dụng cùng nguyên tắc. TaskForm partial upload giữ task đã commit và retry từng file theo mục 6.6.

Progress thật có thể lấy upload progress browser transport; thanh 100% upload chỉ hoàn tất gửi bytes, **chưa** là success đến khi server response. Không dùng random timer trong HTTP uploader. Preview chỉ render kiểu được hỗ trợ; file unknown vẫn dùng source preview shell và download, không chạy HTML/script vừa upload trong app origin.

## 10. Dashboard, search, calendar và archive

| Method + path | Input | Output |
| --- | --- | --- |
| `GET W/home` | Không | `HomeDto`: counters toàn workspace, My tasks preview, deadlines, project summaries, recent activity; mỗi preview có total riêng |
| `GET W/overview` | Không | `OverviewDto`: portfolio/status distribution/workload/milestones từ scoped entities |
| `GET W/search` | q,category `all|tasks|projects|people|files|comments`, cursor,limit | `SearchDto` gồm typed results + totals per category; no private child leakage |
| `GET W/calendar-events` | from,to,projectId? | CalendarEventDto[]; read-only fixture events; ngày/time local đúng source |
| `GET W/milestones` | from?,to?,projectId? | MilestoneDto[]; read-only fixture milestones |
| `GET W/archive` | kind tasks/projects, q?,cursor,limit | Archived task/project summaries, no deleted tombstones |

Home/Overview không có bảng counter riêng hoặc editable cached totals. Progress project = done / non-archived non-deleted task; task progress giữ source: done 100%, nếu có subtasks dùng completed/total, nếu không dùng status mapping 0/5/45/80. Workload là open task count, không ước lượng giờ công. “Completed this week” source là rolling 7 days, không calendar ISO week; giữ semantics để số liệu khớp fixture.

Search thực hiện trên project/task/comment/file/member được principal được phép thấy; UI highlighter không thay backend query. Không ghép SQL từ q; escape LIKE wildcards khi cần literal search. Recent search history là personal UI state; không cần API/analytics service.

Timeline dựng chính xác bars/dependency geometry ở frontend từ typed dataset; backend không trả pixel coordinates/HTML. Milestones cùng ngày dùng source layout grouping, backend chỉ trả data. Calendar event CRUD mới không thuộc MVP vì source không có authoring flow này.

## 11. Những màn hình giữ demo-only trong M3

| Screen/action | Vì sao chưa phải chức năng thật | Cách triển khai |
| --- | --- | --- |
| Login/signup/social login/verify/forgot/reset | Source chỉ form validation + timer (`actions.js:2084–2180`) | Auth page component + DemoAdapter; không nhận password làm API identity |
| Onboarding tạo workspace mới | Source thay label rồi tạo data trong cùng S.data (`2250–2292`) | Full wizard UI trong scoped demo dataset; project template API thật chỉ dùng trong project forms của workspace đã có, không biến wizard thành real provisioning |
| Invite/resend/copy invitation link | Source placeholder member + toast/link cố định (`1433–1557`) | Demo only; no email delivery statement trong HTTP service |
| Share/role/public links/access request | Source permission flags không enforce; requestAccess chỉ toast (`1407–1410,1491–1495`) | Read-only real membership + explicit demo interaction for sharing UI |
| Password/2FA/session revocation | Source fake QR/boolean/sessions (`1965–2039`) | Security screens demo; không lưu credential/2FA secret trong D1 |
| Plan/payment/invoices | Source local plan + sample Visa/invoices (`2042–2055`, settings 372–420) | Billing demo; không tích hợp provider/chấp nhận payment |
| Language/timezone/timeFmt effect chưa có trong source | Một số dropdown chỉ lưu value | Preserve selection UI; không tự hứa translate app hay scheduled reminders |
| Offline/retry/reset demo | Source simulated offline, không sync queue | Scenario controls riêng; HTTP errors dùng network state thật, no auto-sync claim |
| Permanent purge | Source UI có xóa thật array, nhưng HTTP MVP chọn reversible tombstones | Giữ demo screen; không triển khai hidden background purge |

## 12. Yêu cầu triển khai và kiểm chứng

Hono runtime validation dùng cùng schema với client/mock. Chaining route declarations chỉ cần nếu xuất `AppType` cho Hono RPC; contract POC không bắt frontend import server type. Hono tài liệu chính thức mô tả [validation](https://hono.dev/docs/guides/validation) và [RPC type inference](https://hono.dev/docs/guides/rpc).

D1 multi-row command dùng batch, không `db.transaction()` hay Promise.all để giả lập atomicity. Create+number+relations+activity, template create, subtask promote, recurrence và bulk đều cần transaction boundary rõ. Nguồn: [Drizzle D1 batch](https://orm.drizzle.team/docs/sqlite/batch-api), [native D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/). Chi tiết schema/CAS/limits trong `DATA_MODEL.md`.

Các test cần có cho contract/data risk:

1. Mock/HTTP cùng response schemas và default/null/filter/sort semantics; exact fixture visible keys/titles/counts.
2. Date-only roundtrip không lệch ngày; leap date reject/accept; monthly calendar correction thống nhất mock/HTTP; week group overlap legacy giữ đúng.
3. Workspace/path/body cross-scope injection bị từ chối; private children không lọt search/activity/file/dependency summaries.
4. Cursor không trùng/mất rows ở dataset đứng yên; counts đầy đủ; Board/Timeline không silent truncation.
5. Atomic failure rollback; zero-row stale-version update không để activity/successor/subtask dở dang; conflict đúng 409.
6. File normalize một identity, CRUD/Undo đồng bộ drawer/project; R2 bytes roundtrip và failure compensation.
7. Không false success auth/invite/payment/2FA/upload trong HTTP mode; persisted business edits survive reload.
8. Undo có ở đủ source actions trong mục 7.2; plain bulkSet không thêm Undo. Bulk/column/team Undo một target stale → không row nào đổi, record không consumed; duplicate/concurrent Undo chỉ apply một lần và replay cùng result.
9. Single recurring completion Undo giữ successor; Complete-column Undo hủy đúng untouched successors và giải phóng slots. Successor đã edit/comment/link/upload → toàn Undo 409; re-complete cho số successor đúng ở cả hai case.
10. Team delete/Undo giữ exact assignments; null→other team→null vẫn conflict; association thêm giữa preflight và guard không bị clear ngoài payload; team name được dùng lại thì không restore lén.
11. TaskForm double submit/lost create response tạo tối đa một task; partial attachment failure không create lại task; retry upload mất response không nhân đôi file; Create more/reset chỉ theo commit state đã nêu.

Không cần test mirror JSX đơn giản. Không thêm production-hardening campaign. Mỗi WU chỉ kiểm tra các rủi ro liên quan và cập nhật PROGRESS với commands/results thực tế.
