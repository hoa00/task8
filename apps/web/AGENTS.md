# Hướng dẫn bắt buộc khi sửa web

Đọc [root AGENTS](../../AGENTS.md), [FRONTEND_STANDARDS](../../docs/engineering/FRONTEND_STANDARDS.md), [PROGRESS](../../docs/poc/PROGRESS.md) và đúng task/phase được giao. Refactor kiến trúc theo [FRONTEND_REFACTOR_PLAN](../../docs/engineering/FRONTEND_REFACTOR_PLAN.md); không tự thực thi phase tiếp theo từ việc đọc kế hoạch.

1. Kiểm tra implementation, owner, consumer và component/hook đang có trước khi thêm file. Routes parse URL và compose controller; controlled view nhận typed model/intents, không tự đọc URL/storage/fetch hoặc duplicate command/query logic.
2. Query giữ DTO; Router giữ shareable view/filter/date/mode; form/menu/opener/selection có workspace/entity/generation. Đổi scope đóng intent cũ; late response không xóa draft hoặc mở overlay scope mới. Giữ auth/session-generation/captureIntent guards.
3. Dùng client/schema/query-key/invalidation owners. Complete dataset khác page; giữ coverage/cursor guards và invalidate đủ projections. Mọi mock write đi cùng transaction owner; không direct-write dataset bên ngoài queue rồi persist riêng.
4. Feature khác chỉ import public surface có owner; app compose services chung, không kéo Projects chỉ để toast/motion. UI primitive không biết DTO/router/data. Không tạo global event bus hoặc framework controller mới.
5. Reuse fields/views/policies; không copy nghiệp vụ date/status/permission vào JSX từng màn. Không gom các presentation khác nhau thành component nhiều boolean. Code phải format đọc được và tách theo lý do thay đổi.
6. Kiểm keyboard/focus/label/error ở consumer thật; dịch business labels tại feature, primitive chỉ dịch nhãn nội bộ. Giữ hai catalog vi/en, không dịch dữ liệu người dùng, không đổi source token/layout hoặc baseline để qua test.
7. Chọn checks theo failure mode; audit child commands/output trước chạy harness cũ. Không ghi đè historical evidence. Nếu nhiệm vụ loại `apps/api`, dùng scoped commands trong plan; ghi rõ NOT_RUN/FAILED/skip, không tuyên bố runtime pass từ docs/build.

Nợ cũ chuyển theo phase có exact seam/allowlist và ngày/phase gỡ; code mới phải theo chuẩn ngay. Kết thúc cập nhật entry PROGRESS riêng và báo verification/Git thật theo root AGENTS.
