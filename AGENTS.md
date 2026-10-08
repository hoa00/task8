# Quy tắc thực hiện Gr8r React POC

## Mục tiêu và thứ tự ưu tiên

1. Tuân thủ yêu cầu và lựa chọn trực tiếp của Hòa trong session hiện tại.
2. Giữ thiết kế nguồn tại SHA trong `docs/poc/reference/source-lock.json`; dùng Tailwind từ đầu.
3. Component có một chủ sở hữu, tái sử dụng qua props/composition; không copy mỗi view theo từng page.
4. Giữ contract/API, dependency direction và dữ liệu nhất quán. POC giảm tính năng ngoài phạm vi, không dùng code tạm phải viết lại.
5. Chỉ thực hiện work unit đang được giao.

## Before editing

1. Inspect the current implementation and previous progress.
2. Verify the work unit's prerequisites are already complete.
3. Give a concise 3–7 step implementation plan.

Then implement the plan immediately in this same session.

Đọc `docs/poc/PROGRESS.md`, file unit tương ứng và read-set của unit. Source code hiện tại là bằng chứng thực thi; tài liệu là contract. Nếu hai bên mâu thuẫn, ghi rõ mâu thuẫn, chọn sửa tối thiểu trong phạm vi hoặc ghi blocker thực sự; không âm thầm đổi thiết kế.

## Rules

- Do not implement later work units.
- Do not perform unrelated refactors.
- Follow existing project conventions.
- Add only tests needed for this work unit.
- Không biến session thành lập kế hoạch rồi dừng nếu chưa gặp blocker thật.
- Không đánh dấu done khi kiểm tra bắt buộc chưa chạy hoặc thất bại.
- Không tự đổi stack, bổ sung CI/CD, SSR, production hardening, microservices, realtime hay platform work.
- Không dùng `dangerouslySetInnerHTML` cho page/shell để bọc renderer HTML legacy. Rich-text là ngoại lệ có sanitizer/allowlist và boundary riêng trong contract; không dùng regex như sanitizer.
- Không đưa `data-a`, registry `A`, DOM-wide delegated actions, store `S` hoặc hàm global `render()` vào kiến trúc React mới.
- Không import CSS legacy toàn app. Static layout dùng Tailwind utilities/classes literal; tokens và CSS ngoại lệ phải có chủ sở hữu/giải thích trong VISUAL_PARITY.
- Không đổi giá trị 13.5px/252px/46px/stroke1.8 hoặc breakpoint chỉ để khớp preset Tailwind.
- Không đưa theme mặc định của ReUI/shadcn hay UI library khác vào thay thiết kế nguồn. Có thể dùng logic headless khi kiểm chứng không đổi hình thức và không kéo thêm phần không cần.
- Không import React/Router/Query/Hono/Drizzle vào `packages/contracts`; không import app/data/router vào `packages/ui`.
- Không sao chép server state vào Zustand/Context; TanStack Query là cache. Browser localStorage chỉ lưu UI preference/mock state đúng namespace.
- Không lặng lẽ fallback từ HTTP sang mock khi API lỗi. Capability chưa triển khai không được trả thành công giả.
- Không tạo snapshot từ target rồi coi đó là baseline nguồn. Không tự tăng tolerance, update baseline hoặc mask nội dung để làm test pass.
- Không sửa source tham chiếu. Mọi chỉnh cho fixture/capture phải ở harness, có record ảnh hưởng, không thay template/style nguồn.

## Before ending the session

1. Run the relevant tests/typecheck/build and required visual/interaction checks for this unit.
2. Fix failures caused by this work. Broaden checks only for a concrete remaining risk.
3. Update `docs/poc/PROGRESS.md`: status, changed files, evidence paths, commands/results, decisions/conflicts, blockers, next permitted unit.
4. Report `Completed`, `Verification`, `Files changed`, `Decisions/conflicts`, `Blockers`, `Commit`, `Push`, `Next` bằng tiếng Việt.
5. Commit toàn bộ thay đổi thuộc unit và push `main` của repo đích Hòa đã cấu hình, theo quy tắc branch hiện hữu nếu session có chỉ dẫn cụ thể hơn. Kiểm tra remote/branch trước; không push vào repo tham chiếu `gr8rstudio/gr8r-studio`, không force-push, không stage file riêng không liên quan của người dùng. Nếu repo đích chưa có remote/quyền push, giữ công việc local và ghi chính xác blocker ở bước push; việc này không ngăn implement/test trước đó.
6. Stop. Không tiếp tục unit sau trong cùng session.

Commit chỉ được báo bằng SHA thật sau khi commit thành công. Push chỉ được báo thành công sau khi kiểm chứng kết quả; không bịa commit/push hoặc browser evidence.

## Quy ước code

- TypeScript strict; lowerCamelCase cho biến/hàm/DTO và tên cột logic; PascalCase cho React component/types.
- `import type` cho type-only imports; exported public props/DTO có tên, không phát tán `any`.
- pnpm duy nhất cho target, một `pnpm-lock.yaml`; Turborepo điều phối task. Reference giữ lockfile nguồn riêng để tái tạo đúng snapshot.
- Thin route → feature controller/query hook → controlled view. Callback có intent typed; việc điều phối chéo screen đi qua cache/router, không global message bus tự chế.
- IDs entity mới là UUIDv7; fixture dùng ánh xạ ổn định, giữ nguyên visible task key/content.
- Date-only và UTC instant là hai kiểu contract khác nhau. `null` có nghĩa xóa giá trị; field bị bỏ qua trong PATCH có nghĩa giữ nguyên.
- Dependency direction: web → ui/contracts/domain; api → contracts/domain. `domain` thuần, không DOM/React/storage/network.

## Source reference

`904205c626918ee96054eb35495c394a60c0c601`. Không tự cập nhật lên main mới trong một unit. Nếu Hòa yêu cầu đổi source, tạo lại manifest/baseline theo quy trình trước khi so sánh tiếp.
