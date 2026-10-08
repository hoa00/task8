# Kiểm tra bộ tài liệu bàn giao

**Ngày:** 08/10/2026. **Phạm vi:** audit source và đặc tả triển khai. Ứng dụng React, API, D1/R2 và runtime visual baseline vẫn chưa được triển khai trong gói này.

## Kết quả kiểm tra

| Hạng mục | Kết quả của phiên lập tài liệu |
| --- | --- |
| Source cố định | Commit `904205c626918ee96054eb35495c394a60c0c601`; tree và tracked file hashes có trong reference manifests |
| Kiểm đếm source | 86 tracked repository files; 70 file trong src gồm 52 JS và 18 CSS; 13.853 dòng source |
| Source build | Đã chạy thành công bằng package-lock nguồn; đây là build của ứng dụng gốc |
| Runtime baseline / target tests | Chưa có kết quả thành công; WU-00 và các gate implementation vẫn pending |
| Work units | 37 unit từ WU-00 đến WU-36; đủ read-set, scope, AC, verification, deliverables và điều kiện dừng |
| Dependency chain | WU-00 độc lập tạo reference harness; WU-01 mở rộng tooling đó; chuỗi còn lại theo index/ROADMAP |
| Liên kết tài liệu | Local Markdown destinations, reference links và pinned source paths đã được kiểm tra; source line anchors nằm trong file tại SHA đã chọn |
| Trạng thái | PROGRESS và từng unit giữ NOT_STARTED; không coi source audit là WU-00 DONE |

## Những điểm đã được rà soát chéo

- **Fidelity:** token/font/icon và responsive boundary không bị làm tròn theo preset; baseline nguồn và target comparison có pipeline riêng; missing baseline làm fail.
- **Phạm vi M1:** Workspace Tasks ở List/Board, My Tasks ở List, TaskForm/Drawer; project/saved-view variants dùng feature harness trước khi full ProjectPage ra đời. Home, Table/Calendar/Timeline và các màn sau có owner đúng mốc.
- **Component reuse:** mỗi renderer task giữ layout riêng và dùng chung fields/intents. Table/Board không bị thêm bulk UI của List. Comments, attachments, activity, member identity và compact project rows có consumer/owner rõ.
- **Thứ tự dependency:** attachment foundation có trước M1; Settings reuse chỉ nghiệm thu khi các consumer có thật; validation/sanitizer xuất hiện ngay khi mock hoặc endpoint nhận field, không đợi feature unit muộn hơn.
- **Routing:** task drawer và file preview có canonical deep link; dev galleries dùng AppShell/current-workspace context; direct entry/Close/Back được nêu rõ.
- **Undo:** giữ các source-visible actions, gồm bulk/column/team và hai trường hợp recurrence khác nhau; bounded server record, version guards và one-shot replay thay cho global snapshot. Retained tombstone associations chỉ phục hồi teamId, không tự hồi sinh entity.
- **D1:** final guard bảo vệ mọi side effect; zero-row SQL không bị hiểu nhầm là rollback; multi-root writes, counter allocation, relationships và Undo consumption có atomic boundary cụ thể.
- **TaskForm/R2:** create task một lần, upload từng file, request-key dedup và partial retry. Confirmed rollback/losing attempt có cleanup; commit outcome chưa rõ không được dẫn đến xóa winning bytes.
- **POC scope:** đủ UI source; auth/security/payment/invitation/provisioning vẫn demo theo capability matrix. Không đưa CI/CD, production deployment hoặc dịch vụ ngoài vào roadmap này.

Các lựa chọn trực tiếp của Hòa và các đề xuất kỹ thuật được phân biệt trong [DECISIONS.md](DECISIONS.md). Các correction về dữ liệu không phải quyền thay đổi màu, typography hoặc bố cục của màn hình.

## Cách dùng checksum manifests

- [source-lock.json](reference/source-lock.json) và [source-inventory.json](reference/source-inventory.json) nhận diện chính xác upstream snapshot. Những trường chưa có browser/font/fixture capture để `null` hoặc pending, không chứa path/digest giả.
- [handoff-manifest.json](reference/handoff-manifest.json) ghi SHA-256 của các file trong **gói bàn giao ban đầu**, loại chính manifest khỏi vòng tự hash. Đây không phải gate cấm cập nhật PROGRESS/tài liệu trong các unit sau.
- ZIP chứa tài liệu, index và manifests. Không chứa upstream code, node_modules, build output, credential, các note nghiên cứu trung gian hoặc screenshot từ lần capture thất bại.

## Bước thực thi đầu tiên

Đặt bộ này vào repo đích rồi giao [WU-00](work-units/WU-00.md) theo [WORK_UNIT_PROMPT.md](WORK_UNIT_PROMPT.md). Phải có browser hoạt động và font/assets đúng nguồn để tạo runtime baseline. Chỉ sau khi WU-00 đạt các AC mới chuyển sang scaffold và UI.

Review bộ tài liệu không thay thế build/visual/interaction/API tests khi triển khai. Ba gate M1/M2/M3 vẫn phải có evidence thực được mô tả trong [ACCEPTANCE.md](ACCEPTANCE.md).
