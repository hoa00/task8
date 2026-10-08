# PROGRESS — trạng thái xuyên session

## Trạng thái hiện tại

- Current work unit: `WU-00` — **NOT_STARTED**.
- Last completed implementation unit: none.
- Source audit: đã thực hiện khi lập handoff; source clone/build thành công và đã xem README preview.
- Visual baseline runtime: **chưa có bộ đầy đủ được xác minh**. Không đánh dấu WU-00 done từ audit trước đó.
- Target React app: chưa triển khai.
- Backend/D1/R2: chưa triển khai.
- Source SHA: `904205c626918ee96054eb35495c394a60c0c601`.
- Target repository/branch: do Hòa cấu hình; mặc định private workspace và `main` của repo đích được sở hữu. Chưa có remote target được xác nhận trong handoff.

## Work unit ledger

| Unit | Status | Checkpoint | Evidence / blocker |
| --- | --- | --- | --- |
| [WU-00](work-units/WU-00.md) | NOT_STARTED | — | — |
| [WU-01](work-units/WU-01.md) | NOT_STARTED | — | — |
| [WU-02](work-units/WU-02.md) | NOT_STARTED | — | — |
| [WU-03](work-units/WU-03.md) | NOT_STARTED | — | — |
| [WU-04](work-units/WU-04.md) | NOT_STARTED | — | — |
| [WU-05](work-units/WU-05.md) | NOT_STARTED | — | — |
| [WU-06](work-units/WU-06.md) | NOT_STARTED | — | — |
| [WU-07](work-units/WU-07.md) | NOT_STARTED | — | — |
| [WU-08](work-units/WU-08.md) | NOT_STARTED | — | — |
| [WU-09](work-units/WU-09.md) | NOT_STARTED | — | — |
| [WU-10](work-units/WU-10.md) | NOT_STARTED | — | — |
| [WU-11](work-units/WU-11.md) | NOT_STARTED | — | — |
| [WU-12](work-units/WU-12.md) | NOT_STARTED | — | — |
| [WU-13](work-units/WU-13.md) | NOT_STARTED | — | — |
| [WU-14](work-units/WU-14.md) | NOT_STARTED | — | — |
| [WU-15](work-units/WU-15.md) | NOT_STARTED | — | — |
| [WU-16](work-units/WU-16.md) | NOT_STARTED | — | — |
| [WU-17](work-units/WU-17.md) | NOT_STARTED | — | — |
| [WU-18](work-units/WU-18.md) | NOT_STARTED | — | — |
| [WU-19](work-units/WU-19.md) | NOT_STARTED | — | — |
| [WU-20](work-units/WU-20.md) | NOT_STARTED | — | — |
| [WU-21](work-units/WU-21.md) | NOT_STARTED | — | — |
| [WU-22](work-units/WU-22.md) | NOT_STARTED | — | — |
| [WU-23](work-units/WU-23.md) | NOT_STARTED | — | — |
| [WU-24](work-units/WU-24.md) | NOT_STARTED | — | — |
| [WU-25](work-units/WU-25.md) | NOT_STARTED | — | — |
| [WU-26](work-units/WU-26.md) | NOT_STARTED | — | — |
| [WU-27](work-units/WU-27.md) | NOT_STARTED | — | — |
| [WU-28](work-units/WU-28.md) | NOT_STARTED | — | — |
| [WU-29](work-units/WU-29.md) | NOT_STARTED | — | — |
| [WU-30](work-units/WU-30.md) | NOT_STARTED | — | — |
| [WU-31](work-units/WU-31.md) | NOT_STARTED | — | — |
| [WU-32](work-units/WU-32.md) | NOT_STARTED | — | — |
| [WU-33](work-units/WU-33.md) | NOT_STARTED | — | — |
| [WU-34](work-units/WU-34.md) | NOT_STARTED | — | — |
| [WU-35](work-units/WU-35.md) | NOT_STARTED | — | — |
| [WU-36](work-units/WU-36.md) | NOT_STARTED | — | — |

## Mẫu cập nhật cuối session

### WU-NN — YYYY-MM-DD

- Status: `DONE` / `IN_PROGRESS` / `BLOCKED`.
- Started from: branch + commit thực tế của unit trước.
- Completed: danh sách kết quả theo AC, không chỉ danh sách file.
- Files changed: paths.
- Verification: command, exit status, scenario IDs, browser/DB environment; failed/not run nêu riêng.
- Visual evidence: source/target/diff paths, baseline SHA/manifest ID; screenshot/geometry gate status.
- Contract/data evidence: fixture/operation IDs, actual localD1/R2 checks khi áp dụng.
- Decisions/conflicts: ADR/source bug/API mismatch và quyết định tối thiểu.
- Blockers: mô tả đủ cho session sau, có thể tiếp tục độc lập phần nào.
- Commit: SHA thực, hoặc “not committed” + lý do.
- Push: remote/branch/result thực, hoặc “not pushed” + lý do.
- Next permitted unit: unit hiện tại nếu chưa done; unit tiếp theo chỉ khi đã đủ gate.

## Quy tắc

Không xóa lịch sử evidence/decisions. Nếu sửa unit đã done, ghi reopening với lý do và impact tới các unit phụ thuộc. Ghi rõ CI/build/test chưa chạy; không đổi trạng thái thành done chỉ vì code đã được tạo. Không tự ghi “user approved” khi Hòa chưa chốt điều đó.
