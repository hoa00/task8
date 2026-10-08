# Tiêu chí nghiệm thu và bằng chứng bắt buộc

**Tại thời điểm bàn giao: chưa chạy nghiệm thu target.** Source đã được đọc và build; React app, API và bộ runtime screenshots chưa được triển khai trong gói tài liệu này. Tất cả gate M1/M2/M3 dưới đây là yêu cầu cho người thực hiện, không phải kết quả đã đạt.

Tài liệu này bổ sung tiêu chí cụ thể cho từng work unit. Nếu một tiêu chí unit chặt hơn bảng chung, áp dụng tiêu chí unit. [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md) là danh mục surface/state; [API_CONTRACT.md](API_CONTRACT.md) là chuẩn operation; [VISUAL_PARITY.md](VISUAL_PARITY.md) là chuẩn so ảnh; [DATA_MODEL.md](DATA_MODEL.md) quy định semantics/atomicity. Không tạo chuẩn thứ hai bằng test fixture tự suy đoán.

## 1. Ba loại bằng chứng độc lập

| Bằng chứng | Trả lời câu hỏi | Không thay thế được |
| --- | --- | --- |
| Build, typecheck, import/contract checks | Code có build được, boundary/types có đúng không? | Hình thức và tương tác thực tế |
| Reference/actual/diff, computed geometry và interaction capture | UI có khớp nguồn, thao tác/focus/navigation có đúng không? | Persistence, quyền và atomicity ở D1/R2 |
| HTTP contract và local Worker/D1/R2 integration | Dữ liệu có được ghi/đọc đúng, không rò scope, lỗi có rollback không? | Fidelity của React và dịch vụ ngoài chưa tích hợp |

Một gate chỉ đạt khi có đủ loại evidence áp dụng. Không ghi “pixel-perfect” từ build thành công; không ghi “backend hoạt động” từ mock test; không ghi “đã đăng nhập” từ màn login mô phỏng.

## 2. Điều kiện hoàn tất mỗi work unit

Mỗi unit phải có code hiện hữu, toàn bộ AC của unit được ánh xạ sang evidence và không còn failure thuộc phạm vi. Chỉ tạo file, ảnh đẹp hoặc test luôn pass chưa phải completion.

| Hạng mục | Điều kiện |
| --- | --- |
| Prerequisite | Checkpoint và evidence của unit trước tồn tại; đọc implementation/PROGRESS trước khi sửa |
| Phạm vi | Chỉ unit hiện tại; thay đổi tối thiểu để xử lý conflict trực tiếp; không lấy màn tương lai làm deliverable ngầm |
| Implementation | Hành vi sử dụng được trong scope; không dùng placeholder để thay một phần đã đến hạn nghiệm thu |
| Reuse | Tìm component trong catalog trước; consumer dùng đúng owner; không copy HTML theo page |
| Verification | Lệnh thực tế, exit status, môi trường, case IDs và paths có thể mở; không ghi tên script chưa tồn tại như kết quả đã chạy |
| Visual khi áp dụng | WU-00: reference/readiness/repeatability. UI unit: baseline đúng SHA, target/diff đã xem, không còn khác biệt chưa giải thích. WU-01/02 chưa có UI chỉ chạy build/contract theo owner; backend chạy visual regression khi ảnh hưởng UI. |
| Contract | Request/response parse đúng schema; lỗi không fallback sang success/mock; optimistic rollback không làm mất draft |
| Progress | Status, AC/evidence, decisions/conflicts, blocker, commit/push và next unit được cập nhật |
| Checkpoint | Commit phần việc của unit; push repo đích đã cấu hình theo AGENTS. Thiếu remote/quyền push ghi riêng, không bịa thành công và không push upstream |

Nếu code/AC chưa đạt: `IN_PROGRESS` hoặc `BLOCKED`, next unit vẫn là unit hiện tại. Nếu implementation đã đạt nhưng push bị thiếu remote/quyền, ghi implementation result và push blocker riêng; không coi một lỗi phân phối checkpoint là bằng chứng chức năng bị fail. Không tự bỏ qua gate kỹ thuật vì đã hết session.

## 3. Gate M1 — component, fidelity và task flow

**Điểm kết thúc: WU-12.** M1 chứng minh kiến trúc tái sử dụng trước khi chuyển rộng toàn app.

### M1-V: giao diện và component

- Source checkout và hashes được khóa; baseline runtime được chụp từ source thật, có font/assets manifest, clock/seed cố định và kết quả chụp lặp.
- React dùng Tailwind từ WU-03, đúng giá trị source; không nhập toàn bộ stylesheet legacy hoặc dựng page bằng HTML string.
- AppShell, Workspace Tasks ở List/Board, My Tasks List, TaskForm và TaskDrawer có ảnh/interaction của scope đã triển khai. Chưa yêu cầu Home hoặc full ProjectPage ở M1.
- TaskList/Board biến thể project và saved view được kiểm chứng qua controlled feature harness trước WU-16; chưa tuyên bố toàn ProjectPage đã đạt khi ProjectHeader/tabs/Files chưa hoàn thiện.
- Status/Assignee/Priority/Date fields được dùng lại giữa List, Drawer và Board. TaskForm và Drawer dùng cùng task commands; My Tasks dùng completion mode của TaskList, không sao chép row.
- Attachment cards, dropzone, upload progress, remove và preview trong TaskForm/Drawer hoạt động với mock theo scope WU-10/11. Không để placeholder rồi chờ Files page ở WU-22.

### M1-I: hành trình task bắt buộc

| ID | Thao tác | Kết quả cần kiểm tra |
| --- | --- | --- |
| M1-I01 | Tạo task từ List composer và TaskForm | Một task có identity/key ổn định; title validation; property defaults; form draft đúng; không tạo trùng khi double submit |
| M1-I02 | Sửa title/status/assignee/due trong Drawer | List/Board/My Tasks cập nhật đúng cùng entity; draft/focus/scroll không mất khi response về |
| M1-I03 | Kéo task trên Board, đổi cột và thứ tự | Cùng move intent; status/order phản chiếu sang List; không có store riêng của Board |
| M1-I04 | Select một phần/toàn bộ List; bulk field edit/delete | Checkbox partial đúng; bulk bar chỉ Status/Assignee/Priority/Delete/Clear theo nguồn; confirm/Undo đúng contract |
| M1-I05 | Expand subtask row, toggle; mở subtask detail | Parent progress và các view đồng bộ; ID không dựa vào index sau reorder |
| M1-I06 | Description, comment/mention/reaction; attach/remove/preview | Editing ổn định; comment đúng tác giả; shared file identity; lỗi giữ draft và không báo thành công giả |
| M1-I07 | Complete/reopen/Undo, gồm task lặp lại | Source-visible feedback được giữ; recurrence/Undo theo canonical rules; không tạo successor trùng |
| M1-I08 | Refresh, task deep link, Back/Forward, Close | Workspace/scope giữ đúng; drawer chỉ có một instance; direct entry Close không back mù |
| M1-I09 | Mobile, dark, compact, popover trên drawer | Geometry/focus/scroll đúng baseline và source breakpoints; không clip overlay |

**M1 không chứng minh:** mọi route đã chuyển, Hono/D1/R2 đã chạy, real authentication hoặc payment. Các phần đó vẫn ở trạng thái pending đúng mốc.

## 4. Gate M2 — toàn bộ UI và hành vi nguồn

**Điểm kết thúc: WU-29.** Mọi ID trong inventory phải có implementation owner và scenario/evidence, hoặc source issue có bằng chứng cùng quyết định rõ ràng. Không được bỏ một màn khỏi danh mục vì ít dùng.

### Ma trận coverage

| Nhóm inventory | Unit triển khai chính | Evidence bắt buộc |
| --- | --- | --- |
| SC-01, SC-07: Home/Overview | WU-17 | Dashboard layout riêng, số liệu/nhóm ngày đúng, count-up settled; shared progress/identity/activity |
| SC-02, SC-05: Inbox/Notifications | WU-19 | Tabs/filter/read state, Inbox conversation dùng CommentList chung; split desktop/fullscreen mobile |
| SC-03, SC-10; VW-LIST/BOARD/TABLE | WU-09/12/13 | Shared task views, config đúng scope; My Tasks completion; Table/Board không thêm bulk selection |
| SC-04, SC-08/09; PR-01…08, PR-SV | WU-16, Files ở WU-22 | Catalogue 3 layouts, Favorites, 8 tabs, saved List/Board/Table; project activity merge comment/activity; sidebar reorder |
| SC-06, SC-17; VW-ACT | WU-18 | Search scopes/highlight/no results; activity filters/day groups; palette keyboard/modes |
| SC-11/12; VW-CAL/TL | WU-14/15 | Calendar 3 scopes, Timeline 2 scopes; custom geometry, date drag, dependencies/milestones; scope-correct overflow |
| SC-13/14 | WU-20 | Directory/profile, invited/active/deactivated, roles/permissions demo và read restrictions |
| SC-15/16 | WU-21 | Team grid/form/detail; compact project rows; primary-team transition; Undo delete |
| PR-07, VW-FILE | WU-22 | Grid/list, type art, query/sort/context, upload/preview; cùng identity với attachments; file deep link |
| SC-18; SE-01…21 | WU-23/24/25 | Đủ từng section và state nguồn; compact members/TeamGrid/PermissionMatrix dùng lại; payment/invoices giữ đúng scope demo |
| AU-01…07 | WU-26 | Form/validation/loading/error/success, social/password controls dùng lại; không coi validation timer là auth service |
| ON-01…06 | WU-27 | Draft xuyên bước, Back/Continue/Skip/Exit, work-style choices, template/invite/summary; completion không chạy hai lần |
| SC-19/20/21 | WU-28 | Hai gallery nằm trong AppShell/current workspace; Archive restore/purge states; không blank placeholder |
| DR-01…08; MD-01…10; toàn popover groups | WU-05 và feature owner | Đúng nội dung, anchor/layer/focus/keyboard, validation, nested confirm, toast/Undo |
| DIM-01…10 | Mỗi UI unit, tổng hợp WU-29 | Desktop/mobile, boundary probes, dark/system/accent/densities, motion và date preferences |

Số lượng được kiểm đếm từ source là 21 renderer route keys, 8 project tabs cố định, 21 Settings sections, 7 auth states, 6 onboarding steps, 10 modal types và 28 popover switch types. Chúng là các chiều coverage khác nhau; không cộng thành một “tổng số màn hình”. Select, mention menu, palette, context variants và các trạng thái phát sinh vẫn phải có scenario riêng khi áp dụng.

### M2-R: bằng chứng tái sử dụng

| Phần dùng lại | Consumer cần chứng minh | Điều kiện đạt |
| --- | --- | --- |
| TaskList và task fields | Workspace Tasks, Project/Saved List, My Tasks, Drawer, Board/Table | Một implementation theo trách nhiệm; presentation khác nhau chia sẻ fields/intents thay vì một component nhiều boolean |
| Calendar/Timeline | 3 calendar scopes / 2 timeline scopes | Cùng renderer/domain geometry; scope và dataset do controller truyền |
| Comments | Drawer và Inbox | Cùng body/composer/mention/reaction behavior và mutation contract |
| Files | Task draft/Drawer/Project Files/Preview | Cùng file identity/type art/attachment primitives; không xóa theo filename |
| People | Directory, task fields, sharing, Settings Members | Cùng Identity/RolePicker; Settings giữ compact rows, không ép MemberTable vào bố cục khác |
| Projects | Projects/Favorites/Overview/TeamDetail/Sidebar | ProjectCard dùng nơi có card layout; compact rows chia sẻ Identity/Status/Progress đúng bố cục |
| Activity | Home/Project Overview/Project Activity/Member/Workspace | Shared item; mỗi consumer giữ grouping/composition nguồn |
| UI primitives | Features và hai galleries | Gallery render chính components dùng trong app; không dựng bộ demo copy riêng |

Review import graph và đọc consumer code để xác nhận. Số component ít không tự chứng minh tái sử dụng tốt; chia mọi `div` thành component cũng không đạt mục tiêu.

### M2-A: action coverage

WU-28 lập bảng từ action handlers, keyboard handlers, modal/popover/context commands và các native events trong source. Mỗi hàng cần `source anchor → user action → React owner → StudioApi/DemoAdapter operation hoặc local intent → scenario → result`. Con số regex action assignment trong REFERENCE_AUDIT chỉ hỗ trợ kiểm đếm; không phải toàn bộ interaction inventory.

Phải giữ toast **Undo tại các thao tác nguồn có Undo**: complete task, archive/delete task/project, bulk delete, complete/archive trong column, delete comment/file/team và các demo remove-member tương ứng. PATCH status hoặc bulk field update thông thường không được tự thêm Undo nếu source không có. Implementation bù theo phạm vi/version của API_CONTRACT; không chụp/khôi phục toàn workspace snapshot.

M2 fail nếu còn control chính là `onClick={() => {}}`, route placeholder, modal mất field, native select không khớp renderer, file preview không mở được hoặc keyboard command chưa có owner. Service demo được phép theo capability matrix; event bị bỏ quên không trở thành “demo” chỉ để qua gate.

## 5. Gate visual chung

[VISUAL_PARITY.md](VISUAL_PARITY.md) chứa cấu hình, viewport và protocol đầy đủ. Các điều kiện fail sau áp dụng mọi UI unit:

1. Source SHA/fixture/font/browser/viewport/DPR/locale/clock giữa hai bên khác nhau mà chưa có scenario riêng.
2. Font fallback, ảnh chưa decode, count-up chưa kết thúc, screenshot trống hoặc source state chưa thực sự được mở.
3. Baseline sinh từ target, comparator tự tạo missing golden, hoặc baseline digest thay đổi khi compare.
4. Sai typography/line wrap/icon stroke/control count/layout/scroll dù tổng số pixel khác nhỏ.
5. Dùng arbitrary tolerance/mask để bỏ text, charts, task cards hoặc vùng thiết kế cần so.
6. Chỉ có ảnh desktop khi unit có mobile layout riêng; chỉ cuối animation khi motion behavior đang được nghiệm thu.

Zero unexplained difference là chuẩn. Chỉ chấp nhận tolerance cho nhiễu đã đo qua source repeat captures, với vùng/nguyên nhân/số pixel và evidence cụ thể. Không đặt mặc định “cho phép 1% lệch toàn trang”. Baseline phải được kiểm tra trực quan, không chỉ so bằng máy.

Các data corrections trong DECISIONS cần ghi pre-state/action/source result/canonical result và vùng dữ liệu chịu ảnh hưởng. Giữ source baseline gốc; nếu cần chuẩn bị source data state tương đương để so layout, thực hiện qua harness có record riêng. Không biến một correction về quyền hoặc ngày tháng thành ngoại lệ cho toàn trang.

## 6. Gate M3 — HTTP, D1 và R2

**Điểm kết thúc: WU-36.** Chạy cùng frontend qua HttpAdapter với Worker/D1/R2 local thật. Không clone pages hoặc thêm `if (isMock)` rải rác để thay business behavior.

### M3-C: contract và dữ liệu

| ID | Case | Kết quả cần có |
| --- | --- | --- |
| M3-C01 | Bootstrap/query/mutation success và validation errors | Parse đúng shared schema; DTO độc lập database row; error code/field errors có thể render |
| M3-C02 | Date-only, null vs absent, recurrence | Ngày không tồn tại bị reject; PATCH null xóa giá trị; monthly clamp đúng; mock/HTTP dùng cùng rule |
| M3-C03 | Tạo/duplicate task/project đồng thời | ID/key unique, allocation không trùng, subtask/dependency remap đúng, không dùng client counter làm authority |
| M3-C04 | Query/filter/sort/group và pagination | Totals tính toàn authorized scope; full-view loader lấy đủ pages hoặc báo incomplete; không mất item ngoài page đầu |
| M3-C05 | Archived/deleted parent project | Child không lọt active tasks/search/counts/calendar/files; restore theo lifecycle contract |
| M3-C06 | Cùng dữ liệu qua hai workspace/principal fixture | Middleware/repository enforce workspace/private access ở mọi read/write/child/projection; không nhận arbitrary user header làm danh tính |
| M3-C07 | Stale expectedVersion | Conflict không ghi side effect/comment/activity/undo record thành công giả; frontend giữ draft và phản hồi phù hợp |
| M3-C08 | Lỗi trong D1 batch và statement update 0 rows | Atomic rollback/no partial effect; có kiểm tra actual binding, không chỉ fake repository |
| M3-C09 | Bulk/reorder/column commands | Scope/version/member set đúng; không dùng page hiện tại làm toàn bộ column; mọi item cùng thành công hoặc không item nào đổi |
| M3-C10 | Undo success/retry/conflict | Inverse giới hạn đúng command; replay không áp hai lần; association/entity đã đổi thì conflict toàn phần, không overwrite dữ liệu khác |
| M3-C11 | Comment/subtask/dependency/content | Quyền tác giả/parent đúng; sanitized content giữ format allowed; không lộ HTML không an toàn; cycle/cross-scope không lọt validation |
| M3-C12 | Preferences/favorites/project order/saved views/notification state | Đúng user/workspace ownership, tồn tại sau reload; unsaved filters không PATCH named view ngầm |

M3-C06 chỉ cần số fixture/principal đủ chứng minh chính sách POC đã định nghĩa; không kéo theo hệ thống auth/provisioning mới. Quản trị ACL/account, invitation delivery và payment thật vẫn theo capability matrix.

### M3-F: file bytes và lifecycle

| ID | Case | Kết quả cần có |
| --- | --- | --- |
| M3-F01 | Upload file có bytes thật, tải lại content | Metadata đúng file identity, R2 object tồn tại, checksum bytes khớp; complete chỉ khi object và metadata đều xong |
| M3-F02 | Hai file cùng tên, rename/delete một file | Chỉ đúng ID đổi; Drawer/Files/Preview đồng bộ |
| M3-F03 | File quá cap, MIME/validation lỗi | Error đúng contract; không metadata success giả; live limit hiển thị từ capabilities |
| M3-F04 | R2 success, confirmed D1 rollback hoặc commit outcome chưa xác định | Cleanup confirmed losing/unreferenced attempt; khi chưa rõ commit phải kiểm chứng/giữ object và intent để retry, không xóa winning bytes hoặc báo all-success |
| M3-F05 | Tạo task kèm draft files, một upload fail | Chỉ một task được tạo; retry attachment không tạo task lần nữa; giữ failed draft và không báo toàn bộ upload xong |
| M3-F06 | Delete/Undo và private content | Tombstone/bytes đủ cho Undo trong phạm vi; mọi content request kiểm tra workspace/project quyền; không public URL bỏ qua policy |
| M3-F07 | File mẫu nguồn chỉ có art/metadata | Giữ preview source; không phát bytes giả như tài liệu gốc có thật; `contentAvailable`/storage mode đúng contract |
| M3-F08 | File deep link, reload, Back/Close | Validate workspace/project/file, mở cùng PreviewDialog; không hiển thị file sai scope hoặc back khỏi app khi direct entry |

R2 và D1 không có chung transaction. Evidence phải chứng minh failure compensation thực tế trong local bindings; một mock `upload()` trả URL không đủ cho M3.

### M3-J: hành trình tích hợp tối thiểu

1. Khởi động Worker với D1/R2 local đã migrate/seed. Mở web ở HTTP mode, xác nhận principal/workspace/capabilities từ bootstrap thật.
2. Tạo project hoặc dùng project seed; tạo task từ List với thuộc tính và một tệp. Ghi task ID/key/version/file ID từ response để đối chiếu.
3. Sửa assignee/status/dates trong Drawer; kéo trên Board; sửa một field bằng Table. Xem Calendar/Timeline, My Tasks và project/Home projections tương ứng.
4. Thêm subtask, description, comment/reaction; mở file từ Drawer và Files, tải lại bytes. Refresh browser và restart local server theo cấu hình persistence để chứng minh dữ liệu còn.
5. Chạy một conflict/Undo và một failure upload/batch có kiểm soát; xác nhận không có partial entity state, duplicate task hoặc lost draft.
6. Đổi fixture workspace/principal theo harness; kiểm tra stale response không ghi vào cache workspace mới, private child không lọt query/search/content.
7. So các scenario HTTP dùng canonical fixture với baseline/scenario corrections đã ghi; giao diện dùng cùng components. Không thêm yếu tố debug/implementation vào luồng sản phẩm.

## 7. Những giới hạn phải ghi đúng khi báo kết quả

| Tính năng | Kết quả được phép tuyên bố ở M3 |
| --- | --- |
| CRUD và đọc nghiệp vụ trong API_CONTRACT | Hoạt động qua Hono/Drizzle/D1 local nếu có evidence |
| File bytes | Hoạt động qua R2 local nếu có upload/content/compensation evidence |
| Auth/security/billing/invitation/provisioning | UI và demo states; chưa service thật, demo không đổi API principal/payment state |
| Calendar events/milestones | Read-only seed theo source; task drag dùng task date API |
| Multi-workspace | Schema/policy/query/cache boundary đã kiểm tra bằng fixture; chưa SaaS provisioning hoàn chỉnh |
| Deployment | Chưa public deployment/CI/CD/production auth/hardening trong roadmap này |

Không thêm cảnh báo kỹ thuật khắp giao diện chỉ để mô tả những giới hạn trên. Product feedback theo capability phải ngắn, rõ và dùng ngôn ngữ người dùng; chi tiết binding/migration/mock nằm trong tài liệu và developer tooling.

## 8. Evidence manifest và báo cáo cuối mốc

WU-00 định nghĩa schema evidence và các script thực tế. Tối thiểu mỗi visual case có các field sau; đây là mô hình dữ liệu đề xuất để hiện thực, chưa phải file kết quả được tạo:

```ts
interface VisualEvidenceRecord {
  phase: 'reference' | 'compare';
  scenarioId: string;
  inventoryIds: string[];
  sourceCommit: string;
  sourceFixtureDigest: string;
  targetFixtureDigest: string | null;
  environmentManifestPath: string;
  referencePath: string | null;
  actualPath: string | null;
  diffPath: string | null;
  status: 'notRun' | 'pass' | 'fail' | 'blocked';
  correctionIds: string[];
  notes: string[];
}
```

Validation phải theo phase/status: `reference/pass` có reference path và readiness/repeatability evidence nhưng chưa cần target; `compare/pass` bắt buộc cả hai fixture digest cùng reference/actual/diff paths tồn tại. Case chưa chạy hoặc bị font/browser chặn giữ path chưa tạo là `null`, không ghi một đường dẫn giả để schema parse. Build/contract-only unit dùng evidence record tương ứng, không tạo visual record thành công giả.

Evidence backend ghi operation/case ID, request scenario đã bỏ secret, seed/migration version, actual binding/runtime, kết quả và đường dẫn test output. Không lưu credential/token hoặc khẳng định một file tồn tại khi chưa tạo.

Báo cáo cuối mốc gồm: phạm vi đạt/chưa đạt; bảng case counts có nguồn manifest; sai khác/corrections còn hiệu lực; reuse findings; tests/build/visual/DB status; commit/push thực; next unit được phép. Bảng status không ghi `pass` mặc định. Review artifact này chỉ chứng minh **bộ tài liệu sẵn sàng triển khai**; các gate app vẫn chờ code và evidence của từng unit.
