# Data model và kế hoạch persistence D1/R2

## 1. Quyết định kiến trúc

POC dùng một Hono Worker, một database D1 và một R2 binding local khi tới WU file bytes. Backend seed một workspace; `workspaceId` và kiểm tra private-project access là ranh giới dữ liệu bắt buộc từ đầu. Chưa dựng hệ thống provisioning nhiều tenant, auth provider, billing hay ACL engine.

`API_CONTRACT.md` là chuẩn DTO/operation. Tài liệu này chốt cách lưu và thực hiện mutation để các màn hình giữ cùng một nguồn truth. Đây là thiết kế để triển khai, chưa phải schema/migration đã được chạy.

| Vị trí | Trách nhiệm |
| --- | --- |
| `packages/contracts` | Zod input/output DTO, enums, field validation, errors; không dependency runtime Hono/Drizzle/React |
| `packages/domain` | Clock/date-only utilities, legacy filter/sort/group semantics, status/priority/progress computation thuần; không service container hay generic framework |
| `apps/web/src/data` | `StudioApi` typed interface; MockAdapter và HttpAdapter; query keys; không component |
| `apps/api/src/db` | Drizzle SQLite tables/indexes, migration config, seed importer, scoped query helpers |
| `apps/api/src/modules` | Domain read/mutation services + Hono routes; DB rows → DTO mapper |
| `apps/web` | Feature hooks TanStack Query, route/search state TanStack Router, UI components và transient state |

Không lưu toàn bộ source `S.data` thành một cột JSON, không serialize Maps/Sets/React state vào DB. Một task update được query lại từ cùng entity trên mọi view; không có `boardTasks`, `calendarTasks`, `myTasks` tables.

## 2. Storage conventions

| Loại | D1/Drizzle storage | DTO |
| --- | --- | --- |
| Entity ID | `text` UUID v7 | string UUID |
| Date-only | `text`, validated `YYYY-MM-DD` | string DateOnly hoặc null |
| Instant | `integer` epoch milliseconds | UTC ISO string chuẩn hóa một lần ở mapper |
| Boolean | `integer({mode:'boolean'})` + CHECK 0/1 nếu cần | boolean |
| Enum | `text({enum:[...]})` + SQL CHECK + runtime schema | string union |
| Money | Không có trong database POC vì billing demo | Fixture-only display strings |
| HTML description | Sanitized restricted HTML text | descriptionHtml |
| Plain text search | Derived từ sanitized description tree | Không cho client sửa trực tiếp |
| Small structured config | `text({mode:'json'})` với schema validation | Plain JSON object |
| File bytes | R2 object | Authorized content route; không base64 trong JSON/D1 |
| Manual order | INTEGER có khoảng trống; server-generated | position number read-only |

Drizzle SQLite enum option và `$type` chủ yếu hỗ trợ inference, không thay runtime validation/SQL constraints. Các mode timestamp/boolean phải được map có chủ đích; không nhầm milliseconds với seconds. Nguồn: [Drizzle SQLite column types](https://orm.drizzle.team/docs/sqlite/column-types).

### 2.1 Common columns

Mutable root entities, gồm cả workspaceMembers, dùng version INTEGER NOT NULL DEFAULT 1; các entity có timestamps dùng createdAt/updatedAt theo schema dưới. Tasks/projects/comments/files/teams có `deletedAt nullable` và `deletedBy nullable` trỏ current member đã xóa; tasks/projects thêm `archivedAt nullable`. `lastMutationId nullable text` dùng **nội bộ** để gate những statement trong cùng batch; không phải event journal, không trả qua DTO. Các table rows dưới liệt kê field chính; common columns áp dụng ngay cả khi bảng không nhắc lại từng cột.

Tombstone có CHECK giữ `deletedAt` và `deletedBy` cùng null hoặc cùng non-null; `deletedBy` có scoped FK `(workspaceId,deletedBy)` sang workspaceMembers. Restore clear cả hai trong cùng guarded write.

History/reactions/join tables không cần version theo thói quen. Riêng workspaceMembers.version bắt buộc để team Undo phát hiện association A→B→A. Activity có revertedAt nội bộ để compensation chỉ retract history của chính command; không public edit/delete feed. `workspaceMembers` không phải một auth-session table; các people fixture là profile dữ liệu, không tài khoản được chứng thực.

### 2.2 NULL và enums

- Không có ngày dùng NULL, không `''`/`0`/`'null'`.
- Không assignee/team dùng NULL; source sentinel empty-string/none chỉ tồn tại ở fixture mapper.
- status/priority/visibility/role là closed sets trong contract; không auto-create value từ client.
- `startDate <= dueDate` nếu cả hai có giá trị; ngày phải thật, không chỉ regex đúng hình thức.
- `completedAt` chỉ có khi task done; reopen set NULL. Version check luôn xảy ra trước side effects.

## 3. Các bảng POC

Tên cột TypeScript dùng lowerCamelCase. Tên vật lý có thể dùng cùng lowerCamelCase để tránh thêm mapping không cần thiết; mọi query qua Drizzle hoặc SQL cố định có binding.

### 3.1 Identity, workspace và teams

| Table | Cột chính | Keys và lifecycle |
| --- | --- | --- |
| `users` | id, name, emailNormalized, displayEmail, title, avatarColor, timezone, createdAt, updatedAt, version | PK id; UNIQUE emailNormalized. Không password/token/tfa secret. Seed profile không phải login thật |
| `workspaces` | id, name, slug, iconColor, brand, timezone, createdAt, updatedAt, version, lastMutationId | PK id; UNIQUE slug. Một workspace seed. Workspace delete/provisioning demo-only trong M3 |
| `workspaceMembers` | id, workspaceId, userId, role, status, teamId?, lastSeenAt?, removedAt?, createdAt, updatedAt, version, lastMutationId | PK id; UNIQUE(workspaceId,id) phục vụ scoped FK; UNIQUE(workspaceId,userId); role Owner/Admin/Member/Guest; status active/invited. Every association write tăng version; M3 role/invite/account removal chỉ demo |
| `teams` | id, workspaceId, name, nameNormalized, description, icon, color, createdAt, updatedAt, deletedAt?, deletedBy?, version, lastMutationId | PK id; UNIQUE(workspaceId,id); partial UNIQUE(workspaceId,nameNormalized) WHERE deletedAt IS NULL. Delete team tombstone, không xóa people/projects; name reuse có thể làm Undo conflict |

Source chỉ có một team/member. `teamId` nằm ở workspaceMembership; không tạo junction team-members many-to-many. Team edit thay tập member bằng command scoped: remove các assignments cũ không còn được chọn, chuyển các member được chọn sang team này. Project team là field độc lập; chuyển member không tự chuyển project.

`users` lưu profile dùng chung; membership là danh tính trong một workspace. `me.profile` không copy name/title vào preferences. Invite seed member `m8` có profile fixture và membership `invited` để giữ UI, nhưng không được làm dev principal chỉ vì tồn tại row.

### 3.2 Projects và tasks

| Table | Cột chính | Keys và lifecycle |
| --- | --- | --- |
| `projects` | id,workspaceId,key,taskSequence,name,description,icon,color,status,teamId?,leadId,startDate?,dueDate?,visibility,lastActivityAt,createdAt,updatedAt,archivedAt?,deletedAt?,deletedBy?,version,lastMutationId | UNIQUE(workspaceId,id), UNIQUE(workspaceId,key). Key immutable trong project edit. visibility workspace/private |
| `projectMembers` | workspaceId,projectId,memberId,permission | UNIQUE(projectId,memberId). Seed grant dùng để private read checks; permission edit/share UI ngoài live MVP |
| `tasks` | id,workspaceId,projectId,number,title,descriptionHtml,descriptionText,status,priority,assigneeId?,startDate?,dueDate?,estimate?,recurrence?,position,completedAt?,previousStatus?,recurrenceSourceTaskId?,cancelledByUndoId?,createdBy,createRequestId?,createRequestHash?,createdAt,updatedAt,archivedAt?,deletedAt?,deletedBy?,version,lastMutationId | UNIQUE(workspaceId,id), UNIQUE(projectId,number), UNIQUE(workspaceId,recurrenceSourceTaskId) cho non-null slot; UNIQUE(workspaceId,createdBy,createRequestId) cho create idempotency |
| `subtasks` | id,workspaceId,taskId,title,done,assigneeId?,dueDate?,note,position,createdAt,updatedAt | UNIQUE(workspaceId,id); parent task.version làm concurrency boundary |
| `taskLabels` | workspaceId,taskId,labelId | UNIQUE(taskId,labelId); fixed label catalog, không label editor/schema engine |
| `taskDependencies` | workspaceId,taskId,dependsOnTaskId | UNIQUE(taskId,dependsOnTaskId); CHECK taskId!=dependsOnTaskId; scoped FKs và cycle validation |

Task `key` DTO được tạo từ project.key + '-' + task.number. Không lưu một chuỗi key mutable thứ hai nếu không cần; không cho client đổi key. Seed import parse suffix các key gốc và initialize project.taskSequence bằng `max(200,maxSeedNumber)` để task tạo mới bắt đầu như behavior source `seq || 200`, không tái dùng key đã có. Gaps được chấp nhận; uniqueness mới là yêu cầu.

Khi chuyển task sang project khác, server cấp number mới từ destination project sequence trong cùng batch; immutable task.id không đổi. Link nội bộ ưu tiên task ID, label hiển thị dùng key mới. Không làm alias/history key routing vì source chưa có nhu cầu đó.

Task duplicate cấp ID/number và subtask IDs mới; reset completion/archive/delete, không copy comments/activity/favorites. Project duplicate remap intra-copy dependencies bằng map oldTaskId→newTaskId; không giữ tham chiếu về task source vô tình. File-byte duplication dùng endpoint file riêng.

createRequestId/createRequestHash do POST tasks dùng để dedup một logical submit; seed/duplicate/recurrence/promote không copy key này. CHECK cả hai cùng null hoặc cùng non-null; hash là SHA-256 của normalized create input bỏ request ID, không chứa timestamps/IDs do server sinh. Cùng key/cùng hash trả current authorized row với 200; hash khác → 409. Tombstone/moved scope không cho tạo row mới bằng key cũ. createdBy do principal cung cấp từ server.

recurrenceSourceTaskId là slot do successor nắm giữ, kể cả khi user xóa successor thông thường. Single-completion Undo giữ slot. Complete-column Undo hủy một successor vừa tạo bằng tombstone, clear slot và set cancelledByUndoId (scoped FK tới commandUndoRecords). Record này không được restore-deleted thông thường; lần complete tiếp theo sinh ID/key mới. Không đổi monthly/date-only rules theo loại adapter.

### 3.3 Discussion, notification và views

| Table | Cột chính | Keys và lifecycle |
| --- | --- | --- |
| `comments` | id,workspaceId,taskId,authorId,bodyText,mentionedMemberIdsJson,createdAt,updatedAt,deletedAt?,deletedBy?,version,lastMutationId | Parent task/project scope; own-comment delete/restore |
| `commentReactions` | workspaceId,commentId,memberId,reactionKey,createdAt | UNIQUE(commentId,memberId,reactionKey); PUT/DELETE idempotent |
| `activity` | id,workspaceId,projectId?,taskId?,actorId?,eventType,payloadJson,commandId?,revertedAt?,createdAt | Append từ domain commands; no public append/edit. Snapshot-style source Undo set revertedAt cho exact command-owned rows; feeds lọc revertedAt null |
| `notifications` | id,workspaceId,recipientId,actorId?,projectId?,taskId?,type,text,snippet,createdAt,readAt? | Recipient-scoped state; seed/in-app state, chưa email/push/scheduled reminder |
| `savedViews` | id,workspaceId,projectId,name,type,filtersJson,createdBy,position,createdAt,updatedAt,version | Shared project definition. Không auto-save unsaved toolbar state |
| `taskFavorites` | workspaceId,memberId,taskId,createdAt | UNIQUE(memberId,taskId); real FK, không global task.fav |
| `projectFavorites` | workspaceId,memberId,projectId,createdAt | UNIQUE(memberId,projectId) |
| `memberProjectOrder` | workspaceId,memberId,projectId,position | UNIQUE(memberId,projectId); sidebar order per-member |
| `memberPreferences` | workspaceId,memberId,preferencesJson,notificationPreferencesJson,updatedAt | PK memberId; JSON schema bounded keys |

Activity payload giữ snapshot cần để hiện câu lịch sử nếu task rename/tombstone, nhưng vẫn phải lọc project access. Không xóa toàn bộ comments/activity khi người dùng bị remove trong auth milestone tương lai; giữ member tombstone hoặc snapshot authors. Hiện M3 không implement account removal API nên không thêm cascade account deletion tùy tiện.

Notification `readAt` không phải global read boolean dùng chung mọi người. Inbox và Notifications là hai projections của cùng data; Inbox reply chỉ tạo comment.

### 3.4 Files và calendar

| Table | Cột chính | Keys và lifecycle |
| --- | --- | --- |
| `files` | id,workspaceId,projectId,taskId?,name,fileType,mimeType?,sizeBytes?,displaySize,storageMode,objectKey?,contentSha256?,uploadRequestId?,uploadRequestHash?,createdBy,createdAt,updatedAt,deletedAt?,deletedBy?,version,lastMutationId | One file identity, sample/r2 enum; UNIQUE(workspaceId,createdBy,uploadRequestId). Internal objectKey/hash; sample cho phép sizeBytes null |
| `calendarEvents` | id,workspaceId,projectId,title,date,localTime,timezone | Read-only source fixture events; không CRUD event mới |
| `projectMilestones` | id,workspaceId,projectId,name,date,position | Read-only source fixture milestones; dùng chung overview/timeline |

Không có bảng attachment riêng có nội dung copy từ files. TaskDetail.attachments là `files WHERE taskId = ... AND deletedAt IS NULL`. ProjectFiles lấy cùng bảng. File gắn task tombstoned bị ẩn theo task scope; restore task làm file hiện lại nếu chính file chưa bị tombstone. Archive không xóa file bytes.

Không có D1 tables cho billing invoice/card/plan, security sessions/2FA/password, invitation email delivery, public share token, access request hay offline queue. Các screen này giữ dataset trong DemoAdapter để không lẫn với dịch vụ thật.

### 3.5 Bounded Undo records

| Table | Cột chính | Keys và lifecycle |
| --- | --- | --- |
| `commandUndoRecords` | id,workspaceId,actorMemberId,kind,payloadVersion,payloadJson,createdAt,consumedAt?,resultJson? | PK id; UNIQUE(workspaceId,id); scoped actor FK; kind là đúng 11 UndoKind trong API_CONTRACT; payloadVersion=1; CHECK consumedAt/resultJson cùng null hoặc cùng non-null |

Record chỉ được server tạo cho source actions có Undo, trong cùng guarded batch với command. Payload là discriminated union có IDs, inverse fields, post-versions, successor IDs và command-owned activity IDs; không chứa full S.data hoặc arbitrary SQL/patch do browser gửi. Max128 root/association targets và 65.536 UTF-8 bytes. Bound được kiểm tra trước original write. Không endpoint liệt kê journal, không event sourcing, redo, TTL/cleanup hay queue.

resultJson lưu UndoResultDto gồm IDs để invalidate và appliedAt, không historical entity DTO. Replay cùng record đã consumed trả stored result sau reauthorization; không apply inverse lần nữa. Payload/result validate cùng schema khi ghi và khi đọc; JSON storage không thay runtime validation.

## 4. Foreign keys, indexes và visibility

### 4.1 Scoped foreign keys

Các child reference dùng composite FK có workspaceId để không thể gắn task của workspace A vào project/member của workspace B. Parent có unique `(workspaceId,id)` tương ứng. `workspaceId` của entity không được mutable qua public API.

Ví dụ quan hệ:

- tasks `(workspaceId,projectId)` → projects `(workspaceId,id)`;
- tasks `(workspaceId,assigneeId)` → workspaceMembers `(workspaceId,id)` khi assigneeId non-null;
- subtasks/comments/files `(workspaceId,taskId)` → tasks `(workspaceId,id)`;
- projectMembers và favorites trỏ cả project/task và member trong cùng workspace;
- dependency source/destination cùng workspace.
- createdBy/deletedBy/commandUndoRecords.actorMemberId đều trỏ scoped membership; cancelledByUndoId trỏ cùng workspace undo record.

**Cẩn thận `SET NULL` trên composite FK:** nó có thể null cả workspaceId. POC dùng NO ACTION/RESTRICT phù hợp và command chủ động clear nullable `teamId`/assigneeId trong cùng batch. Không gắn composite `ON DELETE SET NULL` rồi vô tình làm mất workspace boundary. Team delete null exact membership/project assignments, tăng row versions và tombstone team atomically; FK giữ identity cho Undo. Public writes không được gắn association mới vào team đã tombstone.

D1 bật FK enforcement cả queries và migrations; `PRAGMA foreign_keys=OFF` không phải cách bỏ checks. `defer_foreign_keys=ON` chỉ trì hoãn kiểm tra đến cuối transaction, sai quan hệ vẫn phải fail. Nguồn: [Cloudflare D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).

### 4.2 Indexes phục vụ các màn hình đã có

| Index | Phục vụ |
| --- | --- |
| tasks(workspaceId,projectId,archivedAt,deletedAt,position,id) | Project list/board/manual order |
| tasks(workspaceId,assigneeId,archivedAt,deletedAt,dueDate,id) | My Tasks, member workload |
| tasks(workspaceId,dueDate,id) | Calendar due-date window |
| projects(workspaceId,archivedAt,deletedAt,lastActivityAt,id) | Projects và navigation |
| comments(workspaceId,taskId,createdAt,id) | Drawer/Inbox conversation |
| activity(workspaceId,projectId,createdAt,id) | Workspace/project feed |
| activity(workspaceId,taskId,createdAt,id) | Task history |
| notifications(workspaceId,recipientId,readAt,createdAt,id) | Unread count/inbox |
| files(workspaceId,projectId,deletedAt,createdAt,id) | Files tab |
| savedViews(workspaceId,projectId,position,id) | Project tabs |
| commandUndoRecords(workspaceId,actorMemberId,id) | Actor-scoped Undo lookup; không journal-list UI |
| workspaceMembers(workspaceId,teamId,id), projects(workspaceId,teamId,id) | Exact team association set và Undo guard |
| taskDependencies(workspaceId,dependsOnTaskId,taskId) | Incoming dependency checks khi hủy recurring successor |

Đây là danh sách cơ sở theo query đã có, không thêm một index cho mọi sort permutation. Dùng `EXPLAIN QUERY PLAN` khi query cụ thể chậm hoặc full-scan bất hợp lý; không thực hiện benchmark/hardening campaign ngoài POC.

### 4.3 Một scope predicate

Principal được Worker inject, xác định active membership trong path workspace. Repositories nhận `WorkspaceContext {workspaceId,memberId}` từ middleware, không tin fields này do component gửi trong body.

Project đọc được khi `visibility='workspace'` hoặc current membership có projectMembers grant. Quy tắc này giữ Customer Portal seed bị hạn chế với source current user m1 dù role hiển thị là Owner; không tự thêm Owner bypass để làm màn403 biến mất. ACL editor chưa thật không đồng nghĩa private read boundary được phép bỏ.

AllTasks/Search/Home/Overview/Files/Activity/Notifications/Dependencies/Calendar phải join/filter qua project access và lifecycle. Không chỉ bảo vệ `GET /projects/:id`. Private catalog trả restricted DTO đã giới hạn fields; child endpoints không tiết lộ title/count/comments qua lỗi hay search snippets.

Default active task scope: task.archivedAt/deletedAt null, project.archivedAt/deletedAt null. Archive endpoint truy vấn archived records có cùng access predicate. Detail/restore có lifecycle scope riêng có chủ đích; không tái sử dụng nhầm “active only” khiến restore luôn404.

## 5. Transactions, version checks và number allocation

### 5.1 Primitive được dùng

Native D1 `batch()` thực thi prepared statements theo thứ tự và rollback nếu một SQL statement thất bại. Drizzle SQLite D1 adapter có batch support. POC dùng `db.batch([...])` hoặc native prepared `env.DB.batch([...])` trong repository khi cần SQL đặc thù. Không dùng `db.transaction(async tx => ...)`, BEGIN/COMMIT tùy ý hoặc Promise.all cho multi-write atomic command.

Nguồn chính thức: [D1 Database API — batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Drizzle SQLite Batch](https://orm.drizzle.team/docs/sqlite/batch-api). Drizzle D1 source được đọc để đối chiếu driver hiện hành: [session.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/d1/session.ts). WU phải kiểm tra pinned installed release và chứng minh rollback trên local D1; không suy từ transaction API của PostgreSQL.

Prepared statements trong batch được tạo trước khi gửi. Không thể dùng `.returning()` statement1 ở JS để xây statement2 ngay giữa batch. Precompute entity UUIDs, dùng SQL subquery/INSERT SELECT cho dữ liệu phụ thuộc hoặc trả về sau cùng. Không gửi từng insert trong vòng for có await riêng rồi gọi đó là transaction.

### 5.2 Single-aggregate compare-and-swap

Root task/project/file/comment/team/workspace write có expectedVersion. Đọc record để validate/build command, sau đó final SQL root update vẫn phải có scoped ID+expectedVersion predicate. Preflight ngoài batch không thay kiểm tra lúc ghi.

**Zero-row UPDATE vẫn là SQL success.** Nếu code tiếp tục insert activity/subtask/successor rồi sau batch mới trả 409, mutation đã dở dang. Mẫu bắt buộc:

1. Sinh commandId nội bộ mới cho từng attempt, không tái dùng requestId/undoId làm mutation marker.
2. Root `UPDATE ... SET ..., version=version+1, lastMutationId=:commandId WHERE workspaceId=:wid AND id=:id AND version=:expected AND lifecycle/access conditions`.
3. Mọi side-effect statement `INSERT ... SELECT` hoặc `UPDATE/DELETE ... WHERE EXISTS` đều gate theo root.lastMutationId=commandId.
4. SELECT root/result cần dùng cho mutation response và Undo **trong cùng batch**; nếu không có marker match thì409, không có side effects.

Không đọc version sau một query riêng ngoài batch để tạo Undo record: một request khác có thể đã sửa entity, khiến inverse dùng nhầm version mới của họ. Record insert đọc post-versions sau mọi side effects trong cùng batch. Descriptor public chỉ có id/kind; expected versions nằm trong server payload.

Sketch SQL dưới đây minh họa nguyên tắc, không phải migration/query code copy-run:

```sql
UPDATE tasks
SET title = :title,
    updatedAt = :now,
    version = version + 1,
    lastMutationId = :commandId
WHERE workspaceId = :workspaceId
  AND id = :taskId
  AND version = :expectedVersion
  AND deletedAt IS NULL;

INSERT INTO activity(id, workspaceId, projectId, taskId, actorId, eventType, payloadJson, createdAt)
SELECT :activityId, workspaceId, projectId, id, :actorId, 'task.renamed', :payload, :now
FROM tasks
WHERE workspaceId = :workspaceId AND id = :taskId AND lastMutationId = :commandId;

SELECT * FROM tasks
WHERE workspaceId = :workspaceId AND id = :taskId AND lastMutationId = :commandId;
```

Query thật bổ sung parent lifecycle/private access predicate theo mục 4, không dùng sketch như một bypass. SQL binding là prepared parameters; không nội suy title/IDs vào SQL string.

### 5.3 Multi-root command như bulk

Bulk phải thành công hoặc fail toàn bộ. Không chỉ lặp single-root CAS trong batch, vì task đầu có thể đổi rồi task thứ hai stale-version zero rows mà không rollback.

Chốt cách đơn giản cho POC: workspace row là **internal batch guard** cho multi-root command. Root guard UPDATE workspace.lastMutationId=commandId chỉ khi SQL kiểm tra tất cả expected entity versions/lifecycles/access/neighbor preconditions còn đúng. Dùng validated JSON input + `json_each` hoặc một bound predicate nhỏ; số lượng IDs đã dedupe trước đó. Mọi write phía sau gate workspace marker, kể cả sequence increments/activity/new rows. Nếu guard không match thì toàn bộ command no-op và response 409. Workspace.version của settings không tăng chỉ vì cập nhật marker nội bộ.

Tất cả statements này ở một batch nên không có request khác xen giữa guard và writes. commandUndoRecords là bounded compensation cho whitelist source actions, không generalized command journal; không cần distributed locks/DO. Failed SQL ở giữa vẫn dùng rollback native D1. Với complete/archive column, guard kiểm tra set equality của ColumnScope + versions; với team delete, kiểm tra exact association set. Không để một row mới sau preflight bị mutate ngoài Undo payload.

Dependency cycle validation không được chỉ dựa trên graph đọc trước batch: hai command A→B và B→A có thể cùng vượt preflight. Final guard dùng recursive SQL check trên dependency graph hiện hành; validate self/cross-scope trước; cycle conflict409. Không auto-reschedule những task phụ thuộc.

### 5.4 Project task sequence

Trong cùng batch:

1. Scoped project counter UPDATE +1 hoặc +N.
2. Task INSERT SELECT counter từ project, dùng UUID đã tạo trước. Với nhiều task template, cấp contiguous block từ counter-N+offset.
3. Insert subtasks/labels/deps/activity có cùng guard/FKs.
4. SELECT created rows làm response.

Không `SELECT max(number)+1` ở JS rồi INSERT. Không increment sequence ở request trước; create fail phải rollback cả counter+children. `.returning()` có thể lấy result cuối nhưng không biến batch thành transaction callback. Test hai request tạo task đồng thời không trùng key; gaps hợp lệ, duplicate không gọi counter hai lần như source.

### 5.5 Command boundaries

| Command | Atomic D1 writes |
| --- | --- |
| Create task | Sequence, task, labels/deps/subtasks, activity |
| Create template project | Project, member grants cần thiết, project order, task block, relations, activity |
| Update task / checkbox completion | Root CAS, scalar/description/labels/deps, timestamps/activity; recurrence nếu done transition; checkbox complete thêm bounded Undo record |
| Move task | Root+neighbor guard, new position/group patch, destination sequence/key khi đổi project, linked file project scope, activity |
| Promote subtask | Parent CAS, create new task/sequence, remove subtask, activity |
| Duplicate project | New project/key, all new task/subtask IDs, remapped deps, activity; bounded POC data |
| Bulk patch/complete/archive/delete | Workspace guard toàn bộ item versions và column set nếu có; all mutations/activity; complete/archive/delete có Undo record, patch không có |
| Delete/archive/restore task/project | Root CAS/lifecycle và own activity; delete/archive có Undo record, restore không tạo redo |
| Team membership change/delete | Exact root/association guard, all member/project teamId updates + versions, team update/tombstone; delete có Undo record |
| Comment/file delete | Root CAS/tombstone, parent touch, bounded Undo record; giữ reactions/R2 bytes |
| Undo whitelist command | Pending record + all target postconditions guard; bounded inverse/history retraction; consumedAt/result cùng batch |
| Create task with request key | Fresh-key guard, sequence/task/children/activity + key/hash hoặc replay existing row; không tạo task thứ hai |
| Upload file metadata commit | Fresh upload-key + parent guard, file/activity/task touch; record winning object key hoặc replay; R2 compensation ngoài batch |

### 5.6 TaskForm và create request deduplication

POST tasks bắt buộc clientRequestId. Server normalize/validate task input, derive request hash, rồi tìm theo (workspaceId,createdBy,createRequestId). Existing same-hash active/access-allowed task trả 200 current representation, không reset task về payload cũ, không tăng counter/version và không tạo history. Same key/different hash → 409. Existing tombstoned/moved-out-of-request-scope entity trả conflict/not-found phù hợp, không recreate. Mọi INSERT có createdBy server-derived; client key không cho client tự đặt task.id.

Concurrent fresh-key attempts phải resolve bằng final workspace guard + UNIQUE, không chỉ SELECT trước write. Guard chỉ mở mutation khi key chưa có và project/access còn hợp lệ; tất cả counter/task/children writes gate marker. Final batch đọc row theo request key. Nếu request khác đã thắng, so hash/scope và trả replay; không increment counter ngoài guard. SQL failure rollback toàn task create.

Create task và upload files là các commit khác nhau: task + subtasks commit trước, từng file commit sau. Submit controller giữ taskId sau create; partial file failure chỉ retry file, không create lại task. sessionStorage lưu metadata pending submission/key/payload, không chứa file bytes và không chạy background sync. Create more/reset chỉ bắt đầu logical submit mới sau full success hoặc người dùng đã xử lý tường minh các draft file còn lỗi theo API_CONTRACT §6.6.

## 6. Ordering, pagination và derived statistics

### 6.1 Manual order

Import source task.order thành integer slots có khoảng cách 1.024; giữ ordering ban đầu. Task manual position dùng cùng không gian workspace để My Tasks/global/project projections có thứ tự ổn định. Personal sidebar project order tách riêng memberProjectOrder.

Move input phải có source query scope/destination project, group fields và neighbor IDs; frontend không tự tính số position. Server validate neighbors tồn tại/cùng destination scope sau group patch, đọc versions làm guard, chọn integer midpoint. Khi không còn gap, resequence tập cần thiết trong cùng guarded batch, không dùng float midpoint vô hạn và không kéo lexorank framework vào POC. Rebalance touch version nếu vị trí entity đổi để cache/Undo thấy conflict đúng.

Batch hết giới hạn không được chia ra nhiều independent commits rồi nói atomic; trả lỗi scope-too-large và giữ state trước operation. Initial seed nhỏ nên scenario chính phải xử lý trọn vẹn.

### 6.2 Cursor và count

Cursor gồm normalized-query fingerprint, sort value/null policy, stable id. SQL order+seek predicate phải dùng cùng tuple và direction. No offset pagination. Source legacy comparator được khóa ở API_CONTRACT, gồm due/week grouping overlap và null sentinel behavior.

List page count không phải dashboard count. Aggregate query dùng full authorized predicate, không LIMIT. Parent project archive/delete và private access đều nằm trong predicate của aggregate.

Board/Calendar/Timeline chỉ có dataset complete sau khi hết nextCursor; generic loader dedupe IDs, giữ coverage partial khi còn trang. Layout không được âm thầm bỏ phần còn lại sau một magic cap. Calendar/Timeline query giới hạn hợp lý bằng viewport dates/project, nhưng phải ghi đúng total của scope đó; không gọi nó là workspace total.

Home metrics và project progress không lưu editable counter. Nếu cần grouped SQL/projection để giảm N+1, query một lần cho tập projects đã scope; không gửi query riêng cho từng card khi có thể batch/group. Không thêm materialized cache/cron ở POC.

## 7. Lifecycle và Undo

### 7.1 Lifecycle và phạm vi dữ liệu

archivedAt giữ entity cho Archive; deletedAt/deletedBy là tombstone. Project tombstone che children qua parent predicate, không overwrite từng child.deletedAt. Restore project giữ nguyên những task/file tự xóa trước đó. Delete task giữ subtasks/comments/files/dependencies trong storage; active projections ẩn quan hệ tới task tombstoned. Vì vậy Undo không phải chép lại children từ một snapshot cũ. Explicit edits vào retained relations vẫn được version/guard bảo vệ.

File tombstone giữ R2 bytes; team tombstone giữ ID/metadata nhưng clear exact associations. Restore-deleted thông thường kiểm tra deletedBy và access, clear cả deletedAt/deletedBy, tăng version. Task có cancelledByUndoId không được restore qua endpoint thông thường. Không background purge/lifecycle policy trong POC. Source Archive permanent-purge control vẫn demo; không gọi tombstone là physical deletion.

### 7.2 Payload whitelist và aggregate version

Public UndoDescriptor chỉ gồm id/kind. Server record dùng một discriminated payload schema, giới hạn 128 root/association targets và 65.536 bytes, với các dạng sau; mọi target có postVersion lấy trong original batch:

| Kind | Payload cần giữ | Inverse |
| --- | --- | --- |
| task.complete | Parent ID/postVersion/beforeStatus | Reopen parent theo source checkbox; giữ successor/slot; updatedAt now và completion clear |
| task.archive / project.archive | ID/postVersion/before archivedAt, updatedAt và command-owned activity IDs | Restore đúng lifecycle fields; không overwrite metadata khác |
| task.delete / project.delete / comment.delete / file.delete | ID/postVersion/before tombstone fields, updatedAt; own activity IDs | Clear đúng tombstone; children/bytes còn trong storage |
| tasks.bulkDelete | Exact task IDs/postVersions/before lifecycle fields, own activity IDs | Restore toàn bộ hoặc không task nào |
| tasks.archiveCompletedColumn | Exact changed task IDs/postVersions/before archivedAt/updatedAt | Restore toàn bộ hoặc không task nào |
| tasks.completeColumn | Parents với before status/completedAt/previousStatus/updatedAt; exact newly created successors + parent relation + postVersions; own activity IDs | Restore parents; cancel untouched new successors và release recurrence slots |
| team.delete | Team ID/postVersion/nameNormalized; exact member/project IDs với postVersions, post-lifecycle và old teamId | Restore team tombstone và tất cả associations hoặc không row nào; lifecycle riêng của member/project được giữ nguyên |

Task.version bảo vệ aggregate, không chỉ scalar columns. Scalar/subtask/label/dependency/comment/reaction/file/favorite writes tăng task.version trong cùng guarded batch; dependency add/remove còn touch task đích để ghi nhận incoming-reference changes. Các counters monotonic không reset khi value trở lại giá trị cũ. Với child/relation writes, chỉ đổi task.updatedAt khi source action có đổi timestamp đó; tăng concurrency version không tự làm khác relative-date/sort UI.

Một successor sau create vì thế sẽ conflict nếu đã edit/comment/react/attach/favorite hoặc có incoming dependency mới rồi bị bỏ đi. Final cancellation guard còn check exact parent recurrenceSourceTaskId, lifecycle và incoming references từ ngoài tập bị hủy, để không phụ thuộc vào một callsite lỡ quên touch version. Không chỉ kiểm tra status=todo. Child operations cần parent lifecycle guard cả lúc ghi, nên không có upload/comment đi vào successor sau khi cancellation đã commit.

### 7.3 Forward record và atomic one-shot consumption

Forward operation capture old values bằng preflight, nhưng final guard phải xác nhận toàn bộ corresponding versions/sets/access. Sau domain writes, insert commandUndoRecords với post-versions lấy bằng SQL trong cùng batch; response có UndoDescriptor chỉ khi record thực sự được lưu. Record/side-effect failure rollback original mutation. Không được làm action trước, rồi best-effort lưu Undo sau.

Undo execution chốt các bước sau trong một D1 batch:

1. Fresh attempt UUID; guard workspace.lastMutationId chỉ khi record đúng actor/workspace, còn pending, đúng payload schema/kind và **tất cả** target versions/lifecycles/associations/access còn hợp lệ.
2. Mọi inverse statement gate marker của attempt này: restore fields/associations, tăng versions, cancel bounded successors, retract exact command-owned activity.
3. Set consumedAt + resultJson trên đúng pending record, cùng guard. resultJson chỉ chứa IDs/invalidation + appliedAt, không old entity DTO; không tạo Undo record cho Undo.
4. SELECT record/result trong cùng batch. Record consumed → trả stored result 200. Record vẫn pending vì guard thất bại → 409, không có side effects. SQL error → native batch rollback mọi inverse và consumption.

Không lặp CAS từng row rồi chỉ kiểm tra affected count ở cuối: zero-row SQL vẫn success. Workspace guard phải kiểm tra ALL trước bất kỳ inverse write. Mỗi attempt dùng marker mới, không dùng undoId làm marker vì marker cũ còn lưu có thể mở nhầm writes trong retry. Nếu request khác đã consume record, attempt này không apply gì và chỉ replay stored result. Test concurrent double-click và lost response phải chứng minh version/history chỉ đổi một lần.

Actor/workspace/current operation authorization vẫn được check trước replay. Client invalidate/refetch theo IDs, không setQueryData bằng trạng thái lịch sử. Conflict không consume record; versions không giảm nên một target A→B→A không vô tình làm record cũ hợp lệ lại. Không TTL, redo hoặc general history browser.

History được giữ source-visible: single-complete Undo là reopen action, giữ original complete/create events và append moved/reopen event như source callback. Với source snapshot-style actions, set revertedAt trên đúng activity IDs có commandId thuộc original operation; các feed bỏ qua những row này. Không xóa history của request khác, không thêm generic Undo feed event. Các actions này không tạo email/push/notification delivery rows ở POC. taskSequence/UUID/version counters không rollback; gaps sau canceled recurrence được chấp nhận.

### 7.4 Recurrence và team compensation

Single completion Undo không kiểm tra/chỉnh/xóa successor chỉ vì successor từng được tạo bởi parent; nó chỉ CAS/reopen parent và giữ recurrenceSourceTaskId slot. Re-complete parent không tạo successor thứ hai. Complete-column Undo khác: chỉ successors mới sinh trong original command nằm trong cancellation set; successors đã tồn tại trước command không bị hủy.

Nếu complete-column guard thành công, restore parent before fields với version mới; tombstone successor, set cancelledByUndoId=record.id, clear recurrenceSourceTaskId cùng batch. CHECK: cancelledByUndoId non-null chỉ khi deletedAt/deletedBy non-null và recurrenceSourceTaskId null. Không direct restore/redo canceled occurrence. Re-complete sinh successor mới theo cùng daily/weekly/biweekly/monthly calendar-clamp rules, không tái dùng task key cũ. Bất cứ changed parent/successor/external dependency → 409 toàn Undo.

Team delete preflight lấy exact members/projects đang có teamId, gồm archived/deleted rows giữ association. Final guard kiểm tra set equality + versions, không clear một row không có trong payload. Sau đó null từng teamId, tăng row versions, tombstone team, lưu record. Workspace team administration được phép xử lý internal associations của restricted project nhưng không trả private content hay bypass private task reads.

Team Undo cần team còn đúng tombstone/version/actor, không active team khác chiếm nameNormalized, tất cả old members/projects còn đúng postVersion, post-lifecycle và teamId null. Restore team trước, restore associations sau trong cùng batch; validate target membership/project lifecycle chưa đổi kể từ forward command. Association của một project/member đã archive/tombstone từ trước vẫn được restore teamId, tuyệt đối không clear archivedAt/deletedAt/removedAt của record đó. null→teamB→null vẫn conflict. Không overwrite member/project bị chuyển/chỉnh/xóa sau forward command, không restore một phần vì phần còn lại conflict. Partial unique active-team-name index và all-target guard cùng bảo vệ việc tên team đã được dùng lại.

## 8. R2 bytes và tính nhất quán với D1

Files UI có full metadata trước WU-35 R2; actual contentAvailable chỉ true nếu bytes thật đã được lưu. R2 object key nội bộ có dạng `workspaces/{workspaceId}/projects/{projectId}/files/{fileId}`; không dùng raw filename trong key. File name hiển thị độc lập để rename không rename object path.

uploadRequestId/uploadRequestHash giữ nguyên sau rename và scoped UNIQUE(workspaceId,createdBy,uploadRequestId); CHECK key/hash cùng null hoặc cùng non-null. Hash gồm normalized original target/name/mime/actual size/content SHA-256; contentSha256 là digest của bytes thật. Seed/file duplicate không copy upload intent key. R2 duplicate có object mới và cùng content digest, không giả làm retry của upload gốc.

Binding `FILES: R2Bucket`; use native `put/get/delete`, không cần AWS SDK, presigned URL, public bucket hay S3 credentials cho POC local. API content route kiểm tra workspace/project/task lifecycle trước `get`. Upload cap 10MiB hiện hành lấy từ capabilities; Workers request limits không được suy từ R2 object limit.

Nguồn về native binding/methods: [R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/); local binding workflow: [Use R2 from Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/).

R2 và D1 không có một transaction chung trong thiết kế này. Upload command:

1. Validate principal/project/task, clientRequestId, file count1, actual byte size, filename/mime policy; tính content/request hashes trong giới hạn10MiB.
2. Nếu key đã có: cùng hash và current scope/lifecycle/access hợp lệ →current FileDto200; khác hash→ 409. Không ghi object mới hoặc tăng task.version khi replay. Mất response không được tạo file thứ hai.
3. Với intent mới, sinh file/object ID cho riêng attempt; ghi R2 object mới và đợi hoàn tất.
4. D1 batch guard key chưa tồn tại + parent/access/version preconditions, insert file với key/hash/objectKey, activity và task touch. Guard thất bại do concurrent winner thì final SELECT lấy winner và kiểm hash/scope; không append metadata/history lần nữa.
5. Nếu SQL rollback/final-guard no-op/losing attempt đã được xác nhận, cleanup đúng object riêng không được winning file row tham chiếu. Nếu kết quả D1 chưa xác định do timeout/mất acknowledgement, kiểm chứng request key/objectKey bằng read phù hợp trong query budget trước khi quyết định. Giữ object khi committed row trỏ nó; chỉ cleanup losing object khi kết quả đó được xác nhận. Nếu chưa xác định được kết quả hoặc write cũ còn có thể hoàn tất, không delete; giữ intent/object IDs và trả trạng thái chưa xác nhận để retry. Không coi một lần đọc chưa thấy row là bằng chứng rollback. Cleanup failure ghi lỗi nội bộ; không quảng cáo all-success hoặc hứa không có orphan tạm thời.
6. Trả FileDto với status 201 cho winner mới, 200 cho valid replay sau khi xử lý object thừa. Chỉ metadata đã commit mới xuất hiện trong file/task queries.

Nếu task/project bị xóa giữa upload và D1 write, final SQL guard phải từ chối; chạy cleanup, không để file thuộc task đã mất hiển thị. TaskForm giữ task đã commit khi một file fail, retry dùng taskId + file intent key, không submit create lại; danh sách draft files không phải D1 attachments đã lưu. Delete file thông thường chỉ tombstone D1; không xóa bytes ngay rồi làm Undo hỏng. Duplicate actual file tạo object mới, không chia sẻ một objectKey rồi delete file này làm mất bytes của file kia.

Content response: Content-Type đã kiểm soát, Content-Disposition thích hợp, ETag từ R2 nếu dùng; chỉ inline safe preview types. HTML/SVG/script/unknown active content phải download hoặc sandbox external content viewer, không chạy trực tiếp trong app origin. Source mock thumbnail không biến thành screenshot của một file thực chưa được đọc.

## 9. Seed, source mapping và corrections registry

Seed mapping được freeze cùng reference baseline; import vào mock và D1 từ cùng fixture export. Không gọi random Date.now/Math.random khi test baseline. Không đổi nội dung/tên/icon/màu/key để làm migration dễ hơn.

| Source | Target |
| --- | --- |
| S.data.ws không có immutable ID | workspace fixture ID cố định + slug/name |
| D.me = m1 | mapped workspaceMember ID của dev principal |
| members[].team empty | teamId null; nguồn profile tách users/membership |
| projects[].private và access | visibility chuẩn; `private:true` giữ restricted. Share edits vẫn demo |
| projects[].last phút đã qua | lastActivityAt timestamp tính từ fixed seed clock |
| projects[].milestones không IDs | deterministic milestone IDs |
| tasks[].key WEB-109 | number 109 + project key WEB; visible key giữ nguyên |
| tasks[].order float/global | integer ordering slots preserving order |
| tasks[].desc | sanitized equivalent descriptionHtml + derived text |
| task.attachments + files không đồng nhất ID | unique files rows; map seed pair theo declared fixture mapping, không match theo tên lúc runtime |
| comments[].re object emoji→member arrays | reaction join rows với stable key mapping |
| notifs[].read | readAt fixed timestamp hoặc null |
| fav flags | per-current-member favorite joins |
| savedViews/filter/view settings | savedViews shared definitions; unsaved URL/personal view state riêng |
| events[].date/time | DateOnly + HH:mm + fixed fixture timezone |

### Quyết định có khác source

| ID | Quyết định | Vì sao | Nghiệm thu |
| --- | --- | --- | --- |
| DATA-01 | Một file identity | Source attachments/files diverge và xóa bằng tên | Rename/delete/Undo đồng bộ drawer+Files; duplicate filenames không xóa nhầm |
| DATA-02 | Server workspace/private checks | Source local guards chưa đủ và visibility flags khác nhau | Private child leak tests; restricted card 403 giữ nguyên |
| DATA-03 | Task key/subtask IDs cấp đúng khi copy | Source duplicate nextKey hai lần/copy raw IDs | New IDs unique, key unique, deps remap |
| DATA-04 | Task của archived/deleted project bị loại khỏi active aggregates | Source allTasks không xét project archived | Archive project làm các active counts thống nhất |
| DATA-05 | Monthly domain dùng calendar month clamp trong canonical mock và HTTP | Source +30 ngày không đúng tên “Monthly” | Shared test 31/01 → ngày cuối tháng 02; reference harness ghi correction và expected post-state, không đổi rule theo DataMode |
| DATA-06 | Giữ đầy đủ source Undo bằng bounded command records + post-version CAS | Source whole-workspace restore có thể ghi đè work khác; bỏ Undo làm mất fidelity | Bulk/column/team và single Undo đều có; one-shot replay; một stale target → zero writes; single recurrence giữ successor, column recurrence hủy đúng untouched successors |
| DATA-07 | Live upload cap 10MiB qua capabilities | Source 250MB chỉ là text; backend local cần giới hạn thật | Actual bytes roundtrip, over-limit 413; mock text baseline không đổi |
| DATA-08 | Source due/week overlap và null sort vẫn giữ cho parity | Không tự sửa hành vi UI khi chưa chốt sản phẩm | Golden query tests xác nhận exact matching/grouping/order |
| DATA-09 | TaskForm create một lần, upload từng file với request-key dedup | Source chỉ gắn metadata; bytes thật có commit/failure riêng | Double/lost-response submit không duplicate task/file; partial retry không create lại task; Create more/reset theo commit state |

Monthly là correction được nêu rõ, không được diễn giải là tính năng source vốn đúng. `DATA-08` giữ nguyên quirk; task grouping total unique không cộng từ group overlap. `DATA-06` thay storage/concurrency mechanism nhưng giữ vị trí và ý nghĩa Undo nguồn; single completion và complete-column có recurrence inverse khác nhau vì chính source đã khác. Không ghi bulk/team/recurring completion là undo:null để thu hẹp scope.

## 10. Migrations, D1 limits và verification gate

### 10.1 Một migration ledger

Quy trình POC cố định:

1. Khai báo Drizzle schema ở apps/api.
2. `drizzle-kit generate` tạo SQL migration được review.
3. Wrangler `d1 migrations apply <database-name> --local` áp dụng SQL trên local D1.
4. Seed deterministic qua command local riêng sau migration.
5. Test từ database trống tới fixture đầy đủ; không gọi create-table ở mỗi request.

Wrangler quản lý applied migrations ledger. Không chạy Drizzle migrate và Wrangler migrations như hai hệ song song trên cùng DB. `migrations_dir` trỏ đúng output; chỉ cấu hình `migrations_pattern` khi pinned Drizzle emits nested directories. Nguồn: [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/).

Pin matching ORM/Kit/Wrangler release sau WU scaffold compatibility check. Trang docs hiện có ví dụ @rc/compatibility flags cũ; không blindly copy “latest” hoặc update packages giữa các WU. Schema/DTO conventions mới là contract; version được ghi vào package manifest/lockfile khi implement. Nguồn D1 adapter setup: [Drizzle with D1](https://orm.drizzle.team/docs/get-started/d1-new).

### 10.2 Bounded operations

D1 hiện công bố tối đa 100 bound parameters cho một SQL statement, Free 50 / Paid 1.000 queries trong Worker invocation, cùng giới hạn thời gian cho batch. Limits từng statement vẫn áp dụng trong batch. Đây là giới hạn params/queries, **không phải** 100 rows hay 1.000 task tối đa trong app. Nguồn: [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/).

POC default maxBulkItems = 20; maxUndoTargets = 128 và maxUndoPayloadBytes = 65536. Query budget POC cố định tối đa 50 D1 queries/request theo Free allowance, tính cả auth/preflight/guard/history/recurrence/Undo record và final reads; Undo planner tính cả inverse + consumed/result writes. Mỗi statement vẫn tối đa 100 bound params. Nếu plan vượt budget, reject original action trước mọi write; không commit rồi mới báo không có Undo. Dùng bounded multi-row INSERT/UPDATE CASE/json_each để không phí một statement mỗi association khi có thể nhóm; không khai báo all-or-nothing rồi chunk thành các batch khác nhau.

Create template fixture nhỏ phải chạy trọn vẹn trên local configuration. Project duplication của dataset quá lớn cần explicit scope-too-large response; không trả project “đã copy” thiếu task vì cap. Sau handoff không tự bổ sung background job orchestration chỉ để giải trường hợp chưa thuộc POC.

### 10.3 Kiểm chứng bắt buộc, giới hạn theo rủi ro

| Case | Kết quả cần chứng minh |
| --- | --- |
| Fresh migration + seed | Có đủ fixture IDs/keys/entities/counts; restore local seed repeatable |
| Wrong workspace child/reference | 404/403/400 phù hợp; không ghi row cross-scope |
| Private project children | Task/search/comment/file/activity/summary không lộ data |
| Mid-batch FK/CHECK failure | Root/counter/relations/activity đều rollback |
| Stale root version | No-op toàn command; không activity/successor orphan |
| Bulk stale one item | Không item nào đổi |
| Two concurrent task creates | Task numbers/keys unique |
| Two dependency adds forming cycle | Một request bị từ chối; graph vẫn không chu trình |
| Single complete/Undo/recomplete | Undo giữ successor/slot; edit successor không bị xóa; re-complete không duplicate |
| Complete-column Undo/recomplete | Hủy đúng untouched created successors, clear slots; re-complete sinh mỗi successor mới một lần |
| Changed successor | Edit/comment/reaction/upload/favorite/incoming-link sau complete-column →Undo 409 và không parent nào restore |
| Bulk/column Undo stale one target | Zero inverse writes, history không retract, record vẫn pending |
| Concurrent/lost-response Undo retry | One-shot apply; version/history chỉ đổi một lần; same stored result 200; client refetch không rollback cache bằng DTO cũ |
| Undo mid-batch failure | Inverse, history và consumedAt/result rollback cùng nhau |
| Team delete association race | Row thêm/chuyển giữa preflight và guard không bị clear ngoài record; toàn command retry/conflict |
| Team Undo ABA/name reuse | null→teamB→null hoặc tên active bị dùng lại → toàn Undo 409; không overwrite associations |
| Source Undo coverage | Single task/project lifecycle, comment/file delete, selected bulk delete, complete/archive column, team delete đều có; plain bulkSet không thêm Undo |
| TaskForm create retry | Double submit/lost response/cùng key concurrent chỉ có một task/key; khác payload cùng key 409 |
| Draft file partial/retry | Task đã commit được giữ; retry chỉ failed file; same upload intent không duplicate metadata/object; Create more không reset trước resolution |
| Copy project | New IDs, no old subtask identities, correct remapped deps |
| Cursor and complete views | Stable pagination, exact totals, no hidden truncation |
| Tombstone restore | Chỉ đúng entity, không hồi sinh independently deleted child |
| Sanitized description | Bold/italic/lists/h4/link giữ hình; unsafe scripts/attrs/schemes bị loại tại Worker |
| R2 success/failure | Actual bytes downloadable; oversize blocked; confirmed rollback/loser cleanup; unknown commit không delete winning bytes; no false upload success |

Không cần benchmark tổng quát, production hardening, deployment pipeline hay tests chỉ mirror implementation. Chạy meaningful tests bằng Worker/local D1 runtime, không chỉ SQLite khác driver rồi coi như D1 đã được kiểm chứng. Kết quả thực phải cập nhật PROGRESS sau đúng WU.
