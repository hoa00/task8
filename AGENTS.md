# Quy tắc thực hiện Gr8r React POC

## Mục tiêu và thứ tự ưu tiên

1. Tuân thủ yêu cầu và lựa chọn trực tiếp của Hòa trong session hiện tại.
2. Giữ thiết kế nguồn tại SHA trong `docs/poc/reference/source-lock.json`; dùng Tailwind từ đầu.
3. Component có một chủ sở hữu, tái sử dụng qua props/composition; không copy mỗi view theo từng page.
4. Giữ contract/API, dependency direction và dữ liệu nhất quán. **POC chỉ giảm phạm vi tính năng, không giảm chất lượng kiến trúc, code hoặc kiểm thử.** Code phải sẵn sàng để bổ sung/sửa tính năng; không dùng code tạm phải viết lại.
5. Chỉ thực hiện work unit đang được giao.

## Before editing

1. Inspect the current implementation and previous progress.
2. Verify the work unit's prerequisites are already complete.
3. Give a concise 3–7 step implementation plan.

Then implement the plan immediately in this same session.

Đọc `docs/poc/PROGRESS.md`, file unit tương ứng và read-set của unit. Source code hiện tại là bằng chứng thực thi; tài liệu là contract. Nếu hai bên mâu thuẫn, ghi rõ mâu thuẫn, chọn sửa tối thiểu trong phạm vi hoặc ghi blocker thực sự; không âm thầm đổi thiết kế.

## Backend: chuẩn bắt buộc khi thêm hoặc sửa code

- Đọc [BACKEND_STANDARDS.md](docs/engineering/BACKEND_STANDARDS.md) trước mọi thay đổi API, domain/contract liên quan, migration hoặc test/tooling backend. Đây là chuẩn kỹ thuật bắt buộc, áp dụng cả sau khi POC kết thúc.
- Khi làm trong `apps/api`, đọc thêm [apps/api/AGENTS.md](apps/api/AGENTS.md). Theo [BACKEND_REFACTOR_PLAN.md](docs/engineering/BACKEND_REFACTOR_PLAN.md) nếu nhiệm vụ là điều chỉnh kiến trúc.
- Route chỉ xử lý HTTP; use-case điều phối nghiệp vụ; policy, mapper, query và D1 command có chủ sở hữu rõ. Giữ domain thuần và dependency direction; không sao chép logic chung hay thêm framework nhiều tầng không có nhu cầu thực.
- Không bỏ final SQL authorization/version/lifecycle guards, native D1 atomic batch, bounded Undo, idempotency hoặc R2 compensation để refactor dễ hơn. Mọi thay đổi phải giữ contract và có kiểm chứng theo rủi ro thực tế.
- Code mới và phần sửa phải tuân thủ chuẩn ngay; nợ cũ được xử lý theo phase có phạm vi, không lấy nợ cũ làm mẫu hoặc âm thầm mở rộng refactor toàn repo.
- Yêu cầu lập kế hoạch/lưu chỉ dẫn có deliverable là tài liệu: hoàn tất và kiểm tra tài liệu, không tự bắt đầu các phase sửa runtime. Lịch sử WU-00…36 và evidence giữ nguyên; nhiệm vụ mới ghi entry riêng trong PROGRESS.

## Frontend và package dùng chung: chuẩn bắt buộc khi thêm hoặc sửa code

- Đọc [FRONTEND_STANDARDS.md](docs/engineering/FRONTEND_STANDARDS.md) trước thay đổi `apps/web`, `packages/ui`, `packages/contracts`, `packages/domain` hoặc test/tooling phục vụ chúng. Khi sửa web đọc thêm [apps/web/AGENTS.md](apps/web/AGENTS.md). Chuẩn áp dụng cả sau POC; code mới/phần sửa phải tuân thủ ngay, không lấy nợ cũ làm mẫu.
- Nhiệm vụ điều chỉnh kiến trúc theo phase/read-set/gates của [FRONTEND_REFACTOR_PLAN.md](docs/engineering/FRONTEND_REFACTOR_PLAN.md). Review/plan đã xong không có nghĩa runtime phases đã triển khai; không tự chạy các phase từ một yêu cầu chỉ lưu tài liệu. Chỉ dẫn mới trực tiếp của Hòa quyết định phạm vi/việc được phép tiếp theo; không tự mở WU-37.
- Route sở hữu URL; controller nhận scope và điều phối query/command/draft; controlled view chỉ render model và phát typed intent. Không đọc global location/history/storage/fetch trong reusable view. Server DTO ở Query; transient intent/form/menu/opener phải gắn workspace/entity/session generation và chặn late response tác động UI scope mới.
- Giữ operation schemas, CAS/version/idempotency/Undo, complete-dataset coverage, auth intent và HTTP/mock isolation. Mọi mock write cùng aggregate dùng chung transaction owner; cursor xử lý UTF-8/scope; mutation phải kiểm đủ affected projections, gồm notifications khi lifecycle/access đổi.
- UI không phụ thuộc app/router/data/business DTO. Feature dùng public surface có owner, không deep-import/cycle; không đặt toast/motion dùng chung trong một business feature. Tách semantic domain khỏi pixel/column preference metadata; không tạo framework/repository/event bus tổng quát chỉ để refactor.
- Field phải nối label/error/control; group/overlay có đầy đủ keyboard/Tab-order/focus behavior. Mỗi text có một translation owner; primitive render nguyên nội dung caller, chỉ dịch nhãn nội bộ. Giữ cả vi/en và source tokens/layout.
- Active tests có entry/scope và output riêng `test-results/<run-id>`; không mặc định chạy runner ghi đè WU evidence. Dùng check/scenario IDs, report skips/exit thật. Khi nhiệm vụ loại API, dùng commands scoped non-API, không chạy root task kéo `apps/api` rồi gọi đó là kiểm tra frontend.
- Giữ diff theo trách nhiệm: format-only, structural moves và behavior fixes phân biệt được. Không dùng số file/LOC/build pass làm bằng chứng kiến trúc đạt; mỗi phase phải có regression cho failure mode và gỡ seam/allowlist đúng kế hoạch.

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
Ủy quyền Git trực tiếp của Hòa ngày **15/10/2026**: được **commit và push lần này cùng các lần sau** trong phạm vi công việc được giao tới repo đích đã cấu hình `hoa00/task8`, gồm normal push lên `main`. Không hỏi lại chỉ vì thao tác commit/push; tiếp tục tuân thủ scope, kiểm chứng, bảo toàn thay đổi không liên quan và quy tắc Git ở trên. Ủy quyền này không tự mở phase hoặc nhiệm vụ mới.

6. Stop sau unit được giao, trừ khi Hòa trực tiếp giao triển khai nhiều phase. **Ủy quyền 15/10/2026:** tự động triển khai toàn bộ FR-02A…FR-07 đến khi hoàn thành, kiểm chứng và commit/push từng phase; không dừng xin giao lại phase kế tiếp. Chỉ dừng khi có blocker thực sự cần Hòa xử lý.

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
