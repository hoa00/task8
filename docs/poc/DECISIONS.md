# Decision registry

Các quyết định dưới là bản thiết kế cụ thể để review/triển khai. Chỉ những lựa chọn ghi “Người dùng chốt” mới là lời xác nhận trực tiếp của Hòa. Các lựa chọn kỹ thuật còn lại là đề xuất đã được đưa vào handoff; nếu điều kiện thực tế mâu thuẫn, ghi conflict trước khi đổi.

## Stack, tổ chức và phương pháp

| ID | Quyết định | Căn cứ | Gate |
| --- | --- | --- | --- |
| ADR-01 | React+TS+Vite+TanStack Router+Tailwind | Người dùng chốt | WU-01 |
| ADR-02 | Tailwind ngay từ component đầu, không import stylesheet legacy toàn app | Người dùng chốt | WU-03…29 |
| ADR-03 | API contract trước; backend Hono+Drizzle+D1/Cloudflare | Người dùng chốt | WU-02,30…36 |
| ADR-04 | pnpm/Turborepo, packages ui/contracts/domain; adapters ở web, schema ở api | Quy ước đã có và boundary tối thiểu phục vụ yêu cầu | WU-01,29 |
| ADR-05 | Exact source tokens/font/icon/copy và CSS ngoại lệ có owner; bỏ Preflight, source-equivalent base | Lựa chọn kỹ thuật phục vụ fidelity | WU-03,29 |
| ADR-06 | Source SHA cố định, capture source riêng, target không tạo golden | Lựa chọn nghiệm thu; Playwright reference protocol | WU-00,29,36 |
| ADR-07 | Browser-history routing và whitelist alias hash có thật | Source chỉ đọc hash startup; URL được React quản lý có kiểu | WU-07 |
| ADR-08 | UI package không biết domain/router; feature controlled views dùng lại | Yêu cầu component reuse | M1/M2 |
| ADR-09 | TanStack Query là cache API; transient UI độc lập | Tránh nhiều bản task state theo view | M1/M3 |
| ADR-10 | Full UI giữ source; real auth/security/billing/invitations/ACL provisioning để sau | Scope POC từ source chỉ mô phỏng và provider chưa được chọn | WU-25…27,36 |
| ADR-11 | Một workspace seed thường dùng; workspace thứ hai chỉ test isolation | POC nhỏ, schema có boundary từ đầu; chưa SaaS provisioning | WU-30 |
| ADR-12 | R2 local cho file bytes; D1 chỉ metadata; một upload request/file | Cloudflare backend được chọn, source chưa lưu bytes | WU-35 |

## Data corrections được thiết kế có chủ đích

Các ID DATA dưới đồng bộ DATA_MODEL. Đây không phải quyền miễn mọi khác biệt visual. Mỗi scenario chịu ảnh hưởng phải ghi source initial state, action, source result, canonical result và vùng cần so layout. Không đổi màu/font/spacing của những vùng ấy.

| ID | Source hiện tại | Quyết định đích | Kiểm chứng |
| --- | --- | --- | --- |
| DATA-01 | Task attachments và project files có identity trùng/khác; có xóa bằng name | Một file record có taskId nullable; thao tác theo ID | Hai tệp trùng tên vẫn độc lập; rename/delete xuất hiện đúng drawer/Files |
| DATA-02 | `private` và `access` khác nhau; nhiều read path chỉ lọc client | Một visibility, server workspace/private checks cho mọi child/projection | Private task/comment/file/search không lộ; restricted shell giữ nguồn |
| DATA-03 | Duplicate có thể cấp key hai lần hoặc giữ subtask/dependency IDs cũ | Server cấp ID/key mới, remap quan hệ đúng phạm vi | Uniqueness/copy/relationship tests |
| DATA-04 | allTasks chưa loại task thuộc archived project | Active reads loại lifecycle của cả task và parent project | Archive project làm active metrics nhất quán |
| DATA-05 | Monthly dùng +30 ngày | Cộng tháng lịch, clamp cuối tháng; canonical mock và HTTP cùng rule | 31/01 → 28/02 hoặc 29/02; source correction ghi riêng trong capture scenario |
| DATA-06 | Nhiều Undo khôi phục toàn workspace snapshot; single completion chỉ reopen task | Giữ đúng các hành động có Undo trong source; bounded command record chứa inverse và version guards do adapter/server giữ, không nhận workspace snapshot từ client | One-shot/idempotent Undo; conflict toàn phần khi entity/association đã đổi. Single recurring completion Undo giữ successor như nguồn; column completion có inverse riêng theo contract. |
| DATA-07 | Upload 250MB chỉ là demo text/timer/metadata | Real cap 10MiB từ capabilities; bytes R2 thực | Oversize trả HTTP 413; upload/download checksum; live limit text là deliberate difference |
| DATA-08 | Due “Next 7 days” gồm today; groupToday và groupWeek có thể trùng; null sorting lạ | Giữ source semantics trong conversion; total unique không cộng group counts | Pure query fixtures; muốn sửa sau phải là yêu cầu riêng |
| DATA-09 | TaskForm nguồn chỉ gắn metadata tệp; không có commit bytes thật | Tạo task một lần rồi upload từng draft file; clientRequestId/hash chống tạo trùng, giữ partial state và retry file lỗi | Double submit/mất response không nhân task/file; Create more/reset theo commit state; canonical mock/HTTP cùng flow |
| DATA-10 | Source comparator trả0 khi bằng nhau nên giữ input order | Theo API_CONTRACT §6.2: mọi comparator kết thúc bằng ID tăng dần, kể cả sort desc; mock/server dùng cùng helper | WU-08 giữ expected source riêng và canonical riêng. Fixture tie/null có thể đổi thứ tự hàng; đây correction contract cho keyset pagination, không đổi source ảnh/baseline |

## Source quirks khác cần ghi nhận khi capture

| ID | Phát hiện | Quyết định cho conversion |
| --- | --- | --- |
| QUIRK-01 | Board tự sort theo order, có thể làm lựa chọn toolbar sort không thay card order | Giữ manual Board order trong parity; không tự phát minh sorting mới. Ghi source scenario và đề xuất sửa riêng nếu Hòa yêu cầu. |
| QUIRK-02 | Calendar day-overflow lấy task/event toàn workspace thay vì scope đang xem | Canonical target giữ scope/project/filter của calendar đang mở và authorization. Đây là correction để không lộ/hiện task ngoài scope; ghi scenario/diff dữ liệu cụ thể, giữ popover style/layout. |
| QUIRK-03 | Motion full bỏ data attribute trong theme.js, trong khi CSS dựa attribute để override reduced-motion | Chốt preference `full/reduce/system` hoạt động đúng tên ở target; visual snapshots dùng reduce hoặc chờ settled state; kiểm tra animation tách riêng. |
| QUIRK-04 | Font resource chỉ request 400/500/600, CSS có 450 | Giữ đúng font bytes/descriptors và resolved geometry; không đổi sang variable range rộng chỉ vì tiện. |
| QUIRK-05 | Table mobile có duplicate class attribute | JSX chỉ một className, ghép đúng computed classes mà browser nguồn thực dùng; so ảnh, không lấy union mọi attribute một cách mù quáng. |
| QUIRK-06 | CSS <=900 nhưng JS đóng drawer khi navigation <900 | Giữ khác biệt tại boundary nếu capture xác nhận; không biến cả hai thành cùng Tailwind breakpoint. |
| QUIRK-07 | Copy link dùng chuỗi domain giả; source navigation không giữ URL | Tạo canonical deep link thật theo Router, screen layout không đổi. |
| QUIRK-08 | Table task không có bulk selection; Board card không có selection UI giống List | Không đưa checkbox/bulk bar vào Table/Board vì tái dùng List controller. List bulk chỉ Status/Assignee/Priority/Delete/Clear như source. |

## Mock, DemoAdapter và source harness

**Canonical MockAdapter và HTTP adapter phải có cùng business semantics.** Source harness chỉ để chụp/đo source, có thể chuẩn bị dữ liệu post-state đã tương đương theo correction registry. Mỗi source vs target khác data phải có expected result có thể kiểm tra, không mask tùy ý. Baseline nguồn ban đầu vẫn giữ nguyên để chứng minh không sửa template/style.

`DemoAdapter` riêng chỉ dành auth/billing/invite/share/account management/provisioning chưa có real service. HTTP error không chuyển thành demo success. Thông báo sản phẩm dùng từ ngữ dễ hiểu như tính năng chưa sẵn sàng; không đưa tên binding, mock, migration hay chi tiết implementation vào luồng người dùng.

## Những việc chưa chốt, không chặn giai đoạn phân tích/UI

- Quyền dùng/phân phối code/logo/assets upstream: chưa thấy license rõ. Không tự gán MIT hoặc tuyên bố thương mại hóa được.
- Repo đích, package public name và deployment: xác định khi Hòa muốn bắt đầu môi trường/publish tương ứng.
- Auth provider production, real invitation delivery, subscription/payment và quản trị ACL đầy đủ: ngoài M3.
- Sửa due-group overlap/Board toolbar sorting và thêm thư mục, custom fields, calendar event CRUD: cần yêu cầu sản phẩm mới.

## WU-10 implementation decisions và handoff

- TaskForm source edit submit replaces `base.subtasks` (`actions.js submitTask`),
  nhưng API_CONTRACT6.4/6.6 chỉ atomic draft subtasks ở create. Task PATCH không nhận
  subtasks. Phase10 create add/remove draft children hoạt động atomic; edit existing
  children read-only/unavailable và giữ IDs/content. WU11 nối cùng form vào scoped
  parent child operations; đây là integration pending, không loại tính năng khỏi dự án.
- Description normalization dùng HTML5 parse5 tree allowlist trong pure domain,
  không DOM/regex sanitizer. `descriptionText` được derive từ final sanitized tree;
  internal mock map giữ canonical text, DTO contract không thêm field. Edit chỉ đổi
  plain description khi text thay đổi; save other fields preserves rich seed HTML.
- Single lifecycle commands dùng internal tombstones/actor-owned bounded inverse,
  UUIDv7/key monotonic, file ID/version và parent-version touches. Upload actor/request
  dedupe hashes actual bytes+metadata; duplicate filename không có nghĩa same identity.
- DATA09 form flow freezes payload/request/file intents; metadata sessionStorage
  scoped workspace/member, File bytes chỉ memory. Prepared:false giữ draft file rows
  visible lúc hashing, failure làm editable draft và zero-create. Partial task/file
  commit giữ successes, retry unconfirmed keys; reset/late response không redirect
  target. Confirmed edit move/version survives later PATCH/refetch failure.
- New uploads giới hạn canonical10MiB, source Files catalogue text250MB thuộc source
  simulation/parity owner22; không đổi capability hay claim HTTP/R2 bytes tại10.
- Pure domain boundary mở tối thiểu cho `parse5@8.0.0` (DOM-less HTML5 parser) để cùng
  sanitizer chạy trong browser/Worker modules; vẫn cấm Node/React/app/storage/network.

- WU10 visual acceptance is scoped original chrome/title/properties plus full panel
  geometry and separate form/file component samples. Original full default mobile
  context17/14 raster differences remain diagnostics pending WU11 full-body integration.
  Symmetric owner-component composition removes only out-of-crop unowned sections,
  with exact owned markup/rect/styles invariant; no production content, source CSS,
  comparator, tolerance or masks are changed to force that diagnostic to pass.
- Late file reselection captures state/files/intents before hash and checks identity
  afterwards. Reset cannot queue a new same-file failed intent or apply old UI errors.
  A hidden but mounted create form cannot dismiss/focus a later edit form after success.
- WU05 deferred return-focus respects a newer connected meaningful focus target
  outside the closing layer. Canonical List double-click creates an inline editor
  before the closing Drawer RAF; unconditional restore stole focus and blur closed
  that editor. Preserve that new focus; ordinary Close/Escape/nested return still
  follows existing opener semantics and is covered by scoped42/17 regression.


## WU-11 implementation decisions

- WU10's read-only edit children are now active in the same form through scoped
  create/delete commands and current canonical parent version. Child edits apply
  immediately; cancel closes scalar form draft and does not undo committed child
  commands. Task PATCH never replaces the child array. No new child Undo.
- Exactly six source editor actions use the existing parse5 allowlist and canonical
  description text. Link uses selected http/https URL, no prompt. Invalid selection
  uses the one existing info Toast and does not change section geometry. Native
  Range offsets/direction survive a sanitizer rebuild and sibling invalidation.
- Source synchronous subtask notes save on input; canonical PATCH commits on blur
  with parent CAS. Pending commands disable overlapping title/note/navigation.
  Per-child UI drafts survive error/close/reopen. Empty title is retained with a
  visible validation message instead of a successful write. Escape closes child
  intent through the shared dismiss reason and does not implicitly retry a failed
  blur write; canonical version/call-count regression proves this boundary.
- Comments are oldest-first and activity newest-first, both stable createdAt/id
  keysets with scope-bound cursors. Author derives from actor; mentions validate
  workspace members and never send delivery. Reaction add/remove are own
  set operations, idempotent, and touch parent version only when state changes.
  Own comment delete/restore uses tombstone/version and bounded actor-owned Undo,
  preserving reactions. Every child/comment/reaction write guards parent Undo.
- Composer asynchronous success uses captured per-task comment revision. Closing,
  reopening or switching tasks cannot let an old success clear a newer draft;
  canonical original scope still updates. Existing file chooser/drop/controller
  and real mock file IDs remain the sole attachment owner.
- Minimal listMembers read supplies canonical mention titles. Full People pages
  and global description/comment search remain later owners. Feature capability
  remains unavailable until all declared owning scopes complete; implemented
  operations do not return fake success for unavailable routes.

- AC1 reopening after base implementation60ad5a9 and documentation285045a:
  trusted native HTML drop inserted an img before the input boundary rebuilt the
  editor. Chromium already stripped script/handler/javascript protocol; executed0
  and finalForbiddenfalse do not erase the measured transient img gap. Prevent
  native drop default and normalize through the same parse5/plainDescriptionHtml
  helpers before insertion. Empty sanitized HTML is a no-op; use browser point
  caret and same-editor live selection Range for move, modifiers for copy.
  First internal native test copied MOVE twice while dropEffect reported none;
  retain that failure and determine intent from the captured editor Range and
  modifiers, with explicit dragOver cursor intent. Assertions use actual text,
  caret and canonical values, rather than treating dropEffect as proof. Six
  trusted native probes and two focused existing editor probes pass on Chromium;
  no second sanitizer, source change, new command or generic DnD framework.
