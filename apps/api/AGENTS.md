# Chỉ dẫn bắt buộc cho AI coder backend

Áp dụng cùng [AGENTS.md ở root](../../AGENTS.md) cho mọi file trong `apps/api`. POC chỉ giới hạn tính năng; kiến trúc/code/kiểm thử phải phục vụ phát triển lâu dài.

## Read-set trước khi sửa

1. [BACKEND_STANDARDS.md](../../docs/engineering/BACKEND_STANDARDS.md) — chuẩn kỹ thuật bắt buộc BE-01…12.
2. [PROGRESS.md](../../docs/poc/PROGRESS.md) — trạng thái đã có bằng chứng.
3. [BACKEND_REFACTOR_PLAN.md](../../docs/engineering/BACKEND_REFACTOR_PLAN.md) — phase được giao và prerequisite nếu refactor.
4. Contract/schema/decision, code và tests liên quan trực tiếp đến operation được sửa. Xem [API_CONTRACT](../../docs/poc/API_CONTRACT.md), [DATA_MODEL](../../docs/poc/DATA_MODEL.md) và [BACKEND_SCOPE](../../docs/poc/BACKEND_SCOPE.md) theo read-set.

## Khi thêm hoặc sửa tính năng

- Nêu feature owner, input/output contract, invariants và tests trước khi sửa; đưa kế hoạch 3–7 bước rồi làm đúng nhiệm vụ.
- Route chỉ xử lý HTTP; application không phụ thuộc Hono; domain không phụ thuộc DB row/binding; persistence chịu SQL; mapper thuần. Chỉ chia sẻ pure semantics có consumer thật.
- Tìm owner/use-case/policy/mapper hiện hữu trước khi tạo mới; không copy query parser, cursor codec, DTO mapping hoặc permission predicates.
- Giữ final SQL access/version/lifecycle/exact-set guards, fresh marker và mọi effects trong cùng native D1 batch. SQL0 không tự rollback.
- Giữ bounded Undo/idempotency/recurrence/order/null/date semantics. R2/D1 không có chung transaction; unconfirmed outcome không cho phép cleanup winning bytes.
- Không thêm full-workspace reads để slice một page, tự đổi comparator/collation, trả counts từ first page hoặc cắt full preview như thể complete.
- Code mới/phần sửa đạt standards ngay. Không copy legacy; chuyển nợ cũ theo phase/path hữu hạn, không tự refactor ngoài phạm vi.
- Format dễ đọc, public types rõ, clock/IDs inject; cấm casts/catch fallback để giấu invariant thất bại.

## Kiểm chứng và kết thúc

- Chạy format/lint/typecheck/import checks và unit/HTTP/native tests theo risk matrix. Active Worker entries phải được typecheck. D1/R2 tests dùng actual local bindings khi thay SQL/atomicity/compensation.
- Các lệnh mới trong kế hoạch là target của BR-01; trước khi chúng tồn tại dùng command hiện hành đã kiểm tra. Không chạy tên command chưa có rồi tuyên bố gate đạt.
- Không sửa historical evidence, source, fixture hoặc baseline để làm test pass; không dùng mock DB thay native proof.
- Ghi actual commands/results/artifacts, decisions/conflicts, missing checks và blockers vào PROGRESS. Không DONE nếu gate code chưa đủ.
- Giữ thay đổi schema/toolchain/dịch vụ ngoài phạm vi nếu nhiệm vụ không yêu cầu. Commit/push đúng root AGENTS và chỉ files thuộc nhiệm vụ.
- Yêu cầu lập kế hoạch/lưu chỉ dẫn chỉ hoàn tất docs; không tự bắt đầu runtime phase. Không triển khai phase tiếp theo trong cùng session khi chưa được giao.
