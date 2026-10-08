# Audit source tham chiếu

## Snapshot đã kiểm tra

| Thuộc tính | Kết quả |
| --- | --- |
| Repository | [gr8rstudio/gr8r-studio](https://github.com/gr8rstudio/gr8r-studio) |
| Branch | main tại thời điểm đọc |
| Commit | `904205c626918ee96054eb35495c394a60c0c601` |
| Commit time | 2026-10-07T14:05:10Z |
| Commit message | Let project card grids use the full page width |
| Stack thực | JavaScript ES modules, HTML string renderers, CSS thủ công, Vite |
| Runtime dependencies | package.json không khai báo dependencies runtime; Lucide dùng qua Vite build plugin |
| Vite source | 6.4.4 theo package-lock/runtime build đã chạy |
| Persistence | memory + localStorage `gr8r.v2` |
| License metadata | null; chưa có license statement rõ trong tree/README/package.json |

Link bằng chứng: [README](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/README.md), [package.json](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/package.json), [store.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/core/store.js), [commit](https://github.com/gr8rstudio/gr8r-studio/commit/904205c626918ee96054eb35495c394a60c0c601).

Metadata project homepage trỏ [gr8r-taskmanagement.vercel.app](https://gr8r-taskmanagement.vercel.app/). Homepage không được dùng làm baseline bất biến vì có thể thay đổi theo upstream. Source tại SHA là chuẩn.

## Quy mô thực tế

Đếm trực tiếp file source trong checkout: **70 file trong src**, gồm **52 JavaScript và 18 CSS**, khoảng **13.853 dòng**. Regex `^A.<name> =` thấy **182 phép gán handler** trong các action modules; con số này không bao gồm toàn bộ input/blur/keyboard handlers và không được dùng làm tổng số tính năng. `actions/actions.js` có 2.293 dòng và chứa nhiều domain khác nhau.

Đếm theo source render mapping:

| Bề mặt | Số lượng và nghĩa |
| --- | --- |
| ROUTE_NAMES | 20 key tên route; không có project |
| renderPage mapping | 21 key, đã gồm project |
| Project fixed tabs | 8: Overview, Board, List, Table, Calendar, Timeline, Files, Activity |
| Saved view layout lựa chọn | 3: List, Board, Table |
| Settings sections | 21 |
| Auth screen states | 7: login/signup/forgot/forgot-sent/reset/reset-done/verify |
| Onboarding steps | 6 |
| Modal types | 10 |
| Popover switch types | 28; native-select enhancer là hệ riêng trong source |

Nguồn: [shell/layout.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/layout.js), [project.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/project.js), [settings.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/settings.js), [auth.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/pages/auth.js), [modals.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/modals.js), [popovers.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/overlays/popovers.js).

21 route không tương đương 21 screenshot; tab, section, modal, form error, responsive, dark và trạng thái tương tác tạo thêm nhiều surface cần nghiệm thu.

## Những nền tảng có thể tái sử dụng về thiết kế

- **Design tokens:** màu nền ấm/light/dark, accent, radius, gutter và kích thước component đã tập trung trong tokens.css.
- **Task renderers:** list/mini row/board/table/calendar/timeline đã có shared functions; controllers cần chuyển thành React ownership.
- **Field controls:** status/priority/assignee/date/project/label dùng lại trong list/table/drawer/form. Không cần dựng lại riêng từng nơi.
- **Presentation helpers:** avatar/progress/file art/activity/comment có consumer chéo; cần đặt lại đúng feature/package.
- **State coverage:** source đã có khá nhiều empty/loading/failure/permission/form states, giúp lập gallery/test case bằng chứng thay vì invent thêm màn.

Xem COMPONENT_CATALOG để lấy owner, consumers và source anchors cụ thể.

## Những phần không nên bê nguyên implementation

`render()` thay `#app.innerHTML` và `#layer.innerHTML`, rồi phục hồi focus/scroll; action table `A` được đăng ký qua import side effects và delegated `data-a`. `S` trộn persisted data, preferences, view state, route, form draft và overlays. Đây là lý do phải chuyển state ownership, thay vì chỉ đặt chuỗi HTML vào React.

Source `main.js` đọc hash lúc khởi động; `go()` chỉ sửa state và render. Không có một browser router đầy đủ với Back/Forward/deep link đồng bộ. TanStack Router sẽ chịu trách nhiệm phần này, với alias cho những hash có thật. [render.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/render.js), [main.js](https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/main.js).

Các lỗi/ngữ nghĩa quan trọng: workspace switch chỉ đổi tên; visibility private/access chưa nhất quán; attachments/files có hai identity; nhiều Undo nguồn restore snapshot toàn dataset; monthly cộng 30 ngày; clone có thể giữ ID/link cũ. Details và quyết định xử lý nằm trong DECISIONS/API_CONTRACT/DATA_MODEL, không sửa lặng lẽ vì muốn “clean code”.

## Kiểm tra đã thực hiện khi tạo handoff

1. Lấy metadata/tree/README/package/source bằng GitHub plugin và clone source local; xác nhận SHA.
2. Đọc source cho screen/state/component/API inventory; đọc các tài liệu chính thức liên quan stack và điều kiện visual test.
3. Chạy `npm ci --ignore-scripts --no-audit --no-fund` **trong reference checkout**, theo package-lock nguồn để tái tạo chính xác dependencies source. Đây không đổi quy tắc pnpm của target.
4. Chạy `npm run build` trên source: thành công, Vite 6.4.4, 56 modules transformed. Output tham khảo: CSS 75,21kB, JS 358,11kB trước gzip. Đây là kích thước build nguồn tại môi trường đã chạy, không phải mục tiêu bundle React.
5. Xem ảnh `docs/preview.png` trong repo để đối chiếu phong cách/layout Home.

**Chưa thực hiện thành công:** runtime screenshot matrix đầy đủ và visual diff target. Môi trường phiên nghiên cứu có Playwright package nhưng thiếu browser executable; tải Chromium không tạo được archive hợp lệ. Không có baseline mới nào được chứng nhận từ lần thử đó. WU-00 phải capture bằng môi trường browser hoạt động; không coi ảnh README hoặc build thành công là thay thế.

## Chưa có bằng chứng nào trong handoff được gọi là implementation pass

React target, API routes, Drizzle schema/migrations và D1/R2 POC chưa triển khai. PROGRESS giữ mọi WU ở NOT_STARTED. Các snippets/specification/gates mô tả công việc phải làm, không phải kết quả test đã chạy.
