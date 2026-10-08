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
