# Phạm vi backend và cách nối frontend

## 1. Kết quả cần có

M3 chứng minh frontend đã chuyển đổi dùng cùng contract khi thay MockAdapter bằng HttpAdapter. Hono chạy trong Worker local, Drizzle truy vấn D1 local, R2 giữ bytes tệp. Một thao tác tạo/sửa task phải phản chiếu đúng trên các view và tồn tại sau reload.

Thiết kế này không biến tất cả màn demo trong source thành dịch vụ SaaS production. API_CONTRACT là bảng method/input/output canonical; DATA_MODEL là bảng schema/atomicity canonical. Không tạo endpoint khác theo từng màn List/Board/Table.

**POC chỉ giảm phạm vi tính năng, không giảm chất lượng kiến trúc, code hoặc kiểm thử.** Tính năng đã có phải phát triển/sửa chữa được qua module boundaries rõ, use-case có owner, policy/mapper dùng chung và kiểm chứng phù hợp. [BACKEND_STANDARDS.md](../engineering/BACKEND_STANDARDS.md) là chuẩn bắt buộc; [BACKEND_REFACTOR_PLAN.md](../engineering/BACKEND_REFACTOR_PLAN.md) là lộ trình điều chỉnh code hiện tại. Đây là quality remediation của các capability đã có, không bổ sung các dịch vụ ngoài scope bên dưới.

## 2. Mode matrix

| Nhóm | M1/M2 giao diện | M3 HTTP POC |
| --- | --- | --- |
| Project/task/subtask CRUD, filter/sort/group, complete/recurrence | Canonical mock operations | D1 persistence, version/permission checks |
| Team CRUD và primary-team assignment | Canonical mock operations | D1 persistence |
| Member directory/profile của người khác | Fixture/read model; edit/role/invite demo nếu source có | Read API; chỉ profile của current user có real edit |
| Comment/reaction/activity/notification read state | Canonical mock operations | D1 persistence; không external delivery |
| Preferences/favorites/order/saved view | Canonical mock operations | API persistence đúng user/workspace scope |
| Calendar events/milestones | Source read-only fixtures | Read-only seeded data; task reschedule qua Task API |
| File metadata/art/preview | One normalized file identity; artwork source | Same DTO/components, real R2 content khi có actual bytes |
| Upload bytes | Scenario mô phỏng có chủ đích để capture | WU-35: bytes thật, cap 10MiB và progress/error thực |
| Auth/password/OAuth/reset/verify/2FA/session revocation | DemoAdapter riêng giữ screen/state | AUTH_MODE=ict24h: real email/password login, refresh và current task8 logout; OAuth/signup/reset/verify/2FA/all-devices account security unavailable, không demo success. AUTH_MODE=local: trusted dev principal |
| Workspace provisioning/onboarding tạo workspace/invite/email | Full UI và scoped demo datasets | Không có real provisioning/email; dùng workspace seed |
| Sharing/role/account removal/access request | Full UI demo states | Read quyền/grants để enforcement; chỉnh ACL là demo/unavailable |
| Plan/payment/invoices | Full UI fixture/demo | Chưa provider, chưa thanh toán hoặc subscription enforcement |
| Permanent purge | Source demo state để capture | Chưa physical purge; delete dùng tombstone; không báo xóa vĩnh viễn giả |

Một workspace seed chính phục vụ POC. Fixture test thứ hai kiểm chứng boundary/middleware/query keys; việc đó không bổ sung hệ thống provisioning SaaS. Không dùng workspace switch chỉ đổi label như source.

## 3. Data path

| Bước | Trách nhiệm |
| --- | --- |
| Page/controller | Xác định workspace/scope/view state và gọi feature hook |
| Query/mutation hook | Validate input cần thiết, pending/error, query key/invalidation, optimistic UX phù hợp |
| StudioApi adapter | Operation typed; mock hoặc HTTP được chọn ở bootstrap |
| Hono middleware/route | Principal → workspace context → request validation → domain command |
| Domain/repository | Chính sách nghiệp vụ/permission, Drizzle rows, D1 guarded batch |
| DTO mapper | Normalize null/dates/counts/capability, không trả DB/internal storage fields |
| Web cache | Áp response hoặc refetch projections liên quan; không giữ một array task riêng từng page |

Dùng fetch/AbortSignal cho request đọc và mutation thông thường. Uploader có thể dùng transport browser hỗ trợ upload progress; không ép fake progress vì fetch không cung cấp sự kiện upload cần thiết. Đợi response server xác nhận D1+R2 trước khi báo hoàn tất.

## 4. Trình tự backend units

| Unit | Trách nhiệm |
| --- | --- |
| WU-30 | Worker/Hono, dev principal local, schema/migrations/seed, session/bootstrap, actual D1 read |
| WU-31 | Existing workspace settings, project CRUD/templates/copy, team CRUD, member read, primary-team assignment |
| WU-32 | Task CRUD/query/move/bulk/completion/recurrence/tombstone/Undo; sanitizer và relation validation cho mọi field create/PATCH nhận |
| WU-33 | Subtasks, comments/reactions/dependencies/activity; tái dùng sanitizer/relation helpers của task writes |
| WU-34 | Projections/search/calendar/archive, notification state, prefs/favorites/saved views |
| WU-35 | R2 actual bytes/content API, failure compensation, Files integration |
| WU-36 | HTTP mode integration và gates M3, cùng frontend đã kiểm chứng |

User-facing business capability chỉ được báo implemented khi endpoint/operation thật có evidence. Placeholder API skeleton ở WU-01 không đủ bật HttpAdapter cho app.

## 5. Phân biệt dữ liệu an toàn và “production hardening”

Workspace scope, private child access, input validation, date semantics, FK, concurrent key allocation và atomicity là phần cần để API hiện tại đúng. Không loại chúng chỉ vì gọi là POC. Đồng thời chưa bổ sung SSO, session rotation, audit platform, queues, realtime, observability stack, distributed cache hoặc deploy pipeline.

Danh tính phát triển được inject từ Worker config local; không nhận arbitrary x-user-id/userId do frontend gửi rồi coi đã xác thực. M3 chỉ đủ chạy local với demo data. ICT24H provider đã tích hợp trong nhiệm vụ AUTH-01…06 tiếp theo; default repo local không tự bật public deployment. Public deployment/live acceptance vẫn cần operator public key/account/revision/TTL và config/secret; xem [runbook](../engineering/ICT24H_AUTH_RUNBOOK.md). Workspace grant là trusted operator action, không có provisioning API/UI.

## 6. D1/R2 giới hạn phải biết khi viết code

- D1 batch là primitive dùng cho nhiều SQL statement; không giả định transaction callback như PostgreSQL. SQL UPDATE ảnh hưởng 0 row không tự gây rollback, vì vậy version gates và side effects phải có thiết kế đúng.
- Batch statements được chuẩn bị trước khi gửi. Không có callback JS lấy RETURNING của statement 1 rồi mới dựng statement 2 ở giữa transaction.
- Composite FK phải giữ workspaceId; cẩn thận ON DELETE SET NULL trên FK gồm nhiều cột.
- R2 object và D1 metadata không có chung transaction. Upload thành công chỉ khi cả hai xong; confirmed rollback/losing attempt được cleanup object riêng. Nếu chưa biết D1 đã commit hay chưa, kiểm chứng theo request key/objectKey và giữ bytes khi chưa đủ bằng chứng cleanup an toàn; không catch-all delete. File tombstone giữ bytes để Undo hoạt động.
- Server counts lấy toàn authorized dataset, khác số row browser đã tải. Full-view loader không được im lặng bỏ phần còn lại của cursor.

Nguồn kiểm chứng: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Drizzle SQLite batch](https://orm.drizzle.team/docs/sqlite/batch-api), [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/). Chi tiết triển khai/limits trong DATA_MODEL; resolve release đang cài, không copy mù tài liệu phiên bản khác.

## 7. Luồng nghiệm thu điển hình

Trong workspace seed, tạo project hoặc dùng project source. Tạo task từ List; sửa assignee/status/due trong Drawer; kéo status trên Board; sửa bằng Table; xem Calendar/Timeline; thêm subtask/comment; upload file; reload. Kiểm tra cùng ID/key/version và số liệu project/My Tasks/Home.

Chạy lại với stale version, lỗi batch, private project, workspace khác và lỗi R2. Frontend giữ draft, hiển thị lỗi phù hợp, rollback đúng entity và không trả success giả. Source-specific demo states vẫn có route/gallery kiểm chứng, nhưng không thay principal/payment/security state thật.
