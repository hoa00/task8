# Goal và phạm vi POC

## Goal tổng

Chuyển tất cả bề mặt UI có trong source cố định sang React/TypeScript với cấu trúc component tái sử dụng; dùng Vite, TanStack Router và Tailwind ngay từ đầu. Giữ hình thức và các đường tương tác trong screen inventory, đưa dữ liệu qua contract thống nhất. Backend Hono/Drizzle/D1/R2 được triển khai ở mốc sau bằng chính contract ấy.

Kết thúc phải chứng minh hai việc độc lập: (1) giao diện khớp nguồn trong bộ điều kiện đối chiếu đã cố định, (2) một thay đổi nghiệp vụ đi qua API phản chiếu đúng ở mọi view liên quan và tồn tại sau reload.

## Phạm vi đã được người dùng chọn trong cuộc trao đổi

- React app TypeScript, Vite, TanStack Router, Tailwind CSS.
- Giữ cấu trúc, giao diện và fidelity đến từng chi tiết có thể đo.
- Gom component để tái sử dụng, không sinh bản riêng cho mỗi view/page.
- Tailwind ngay từ đầu, không trải qua giai đoạn target giữ nguyên stylesheet nguồn.
- Lập API contract ngay; backend HonoJS, Drizzle ORM, D1 và Cloudflare ecosystem.
- Tài liệu chia work unit/session theo quy trình inspect → plan 3–7 bước → implement ngay → verify → cập nhật PROGRESS → commit/push checkpoint → stop.

pnpm/Turborepo và phạm vi POC gọn tiếp nối cách làm đã thống nhất trước đây. Chưa có yêu cầu publish/deploy trong nhiệm vụ lập handoff này.

## Mốc sản phẩm

| Mốc | Kết quả cần chứng minh | Điểm kết thúc |
| --- | --- | --- |
| M1 | Source baseline đáng tin; primitives dùng Tailwind; shell/router; contract/mock; một task được tạo/sửa từ List/Drawer và xuất hiện đúng trên Board. Chứng minh component dùng lại trước khi phủ rộng. | WU-12 |
| M2 | Tất cả route, tab, section, auth/onboarding, overlay, trạng thái lỗi/loading/empty và responsive trong inventory. Toàn bộ mock interactions có traceable acceptance. | WU-29 |
| M3 | Frontend chuyển sang HTTP adapter, Hono thực thi contract, Drizzle/D1 lưu nghiệp vụ, R2 local lưu bytes; kiểm tra scope, rollback, reload, liên màn hình. | WU-36 |

M1 là mốc POC sớm. M2 mới có quyền gọi là hoàn tất chuyển đổi toàn bộ giao diện. M3 mới có quyền gọi là backend nghiệp vụ POC hoạt động. Không dùng một ảnh Home đẹp để đóng cả dự án.

## In scope

- 21 route renderer key; project có 8 tab cố định và saved views trong 3 layout List/Board/Table.
- 21 settings sections; 7 auth screen states và onboarding 6 bước; dev design-system/system-state galleries.
- Task List/Board/Table, Calendar month/week, custom Timeline, task details/subtasks/comment/reaction/description, files/attachments.
- Shell desktop/mobile, drawer/full-view/mobile, dialog/popover/context menus, palette, toast/undo, keyboard focus và motion/reduced-motion hiện có.
- Component thuần trong ui package; business composite dùng lại qua nhiều screen nằm trong feature tương ứng.
- Contract typed và validation runtime; adapter mock có fixture xác định; Hono/D1 endpoint theo API_CONTRACT; file bytes theo R2 unit.
- Một workspace seed chính để đối chiếu; workspace thứ hai chỉ là fixture kiểm tra isolation. Đây chưa phải một gói SaaS multi-tenant hoàn chỉnh.

## Chưa nằm trong real backend POC

Auth provider/OAuth production; email invite/verify/reset thật; password/2FA/session management thật; thanh toán/subscription enforcement; anonymous public sharing; request-access workflow; email/web-push delivery; realtime collaboration; offline synchronization; automation engine; arbitrary custom fields; folder tree; SSR; CI/CD; infrastructure/platform hardening.

Các màn đã có trong source cho những dịch vụ trên **vẫn được chuyển UI và demo state**. Mode HTTP phải báo capability unavailable cho hành động chưa có service, không giả thành công. Source chỉ read calendar events/milestones thì backend giữ read contract; chưa thêm scheduling CRUD mới.

## Non-negotiable về fidelity

1. Giữ copy tiếng Anh, logo, icon path/stroke, asset/font descriptors, các giá trị token nguồn trong baseline đầu tiên. Tùy chỉnh thương hiệu/ngôn ngữ là nhiệm vụ sau.
2. Giữ cấu trúc layout, scroll containers, sticky/fixed behavior và inclusive source breakpoints; không thay mobile bằng desktop thu nhỏ.
3. Tolerance chỉ xử lý nhiễu render đã đo, không che lỗi spacing/font/icon/content. Chưa có baseline thì chưa được đánh dấu pass.
4. Business/data defects bắt buộc sửa khi thêm server phải có dòng riêng trong DECISIONS. UI parity dùng fixture đối chiếu rõ; không mở ngoại lệ tùy ý cho toàn trang.
5. Không yêu cầu giữ các chi tiết triển khai lỗi của source như global HTML renderer, mutable global store hay fake auth làm cơ chế production.

## Quyết định còn để giai đoạn sau

Repo đích/publish name, quyền phân phối upstream, provider đăng nhập thật và triển khai production được chốt khi có nhu cầu tương ứng. Các lựa chọn này không ngăn hoàn tất tài liệu hay bắt đầu source capture và UI POC.
