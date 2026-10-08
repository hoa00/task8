# Kiểm chứng giao diện so với Gr8r Studio

**Trạng thái:** đặc tả nghiệm thu cho các work unit, chưa phải báo cáo giao diện đã đạt.  
**Nguồn đối chiếu:** gr8rstudio/gr8r-studio tại commit **904205c626918ee96054eb35495c394a60c0c601**.  
**Quyết định đã chốt:** React + TypeScript + Vite + TanStack Router; viết Tailwind CSS 4 ngay từ đầu; API Hono + Drizzle + Cloudflare D1. Nội dung giao diện giữ tiếng Anh của nguồn.

## 1. Bằng chứng hiện có và phần còn phải làm

| Hạng mục | Trạng thái tại thời điểm bàn giao |
| --- | --- |
| Clone, đọc source, kiểm tra token/layout/route/state | Đã thực hiện |
| Build ứng dụng nguồn | Đã chạy thành công trong phiên nghiên cứu |
| Hình đã quan sát | Hình giới thiệu trong README nguồn |
| Bộ screenshot chuẩn của ứng dụng đang chạy | **Chưa tạo** |
| Playwright browser trong môi trường nghiên cứu | Chưa có browser khả dụng; lần tải browser gặp tệp hỏng |
| Screenshot/interaction của target React | **Chưa chạy; target chưa được triển khai** |
| Kết luận pixel-perfect | **Chưa thể xác nhận** |

**WU-00 phải tạo và kiểm tra baseline trước các WU triển khai giao diện.** Build thành công và hình trong README không thay thế việc chụp app nguồn ở đúng route, dữ liệu, kích thước và trạng thái cần nghiệm thu. Nếu môi trường tiếp theo vẫn chưa chạy được browser, ghi WU-00 là blocked với lỗi thực tế; không đánh dấu hoàn tất hoặc dựng ảnh chuẩn từ target.

## 2. Định nghĩa đạt

Target phải tái hiện cấu trúc màn hình, phân cấp thông tin, copy, typography, khoảng cách, màu, icon, trạng thái tương tác và responsive của snapshot nguồn. Việc tổ chức lại React component được phép thay đổi cấu trúc code; wrapper DOM mới chỉ được thêm khi không làm đổi layout, scroll, focus hoặc semantics.

Mỗi case có cùng source SHA, fixture, route/state, assets, browser/OS và cấu hình capture. Kết quả phải có **không còn sai khác chưa giải thích được**. Sai font, lệch cạnh nội dung, thiếu control, đổi độ dày icon hoặc khác wrapping là lỗi cần sửa, dù tổng diện tích khác nhau rất nhỏ.

Cải tiến đã được chốt riêng là browser history/deep link của TanStack Router và dữ liệu API/D1. Các thay đổi này không cho phép thiết kế lại ngoại hình. Sai sót quan sát được trong nguồn phải được ghi rõ và xử lý theo phạm vi WU; không tự sửa nhiều hành vi khác trong một WU chuyển UI.

## 3. Các số đo lấy trực tiếp từ source

Đây là điểm bắt đầu để viết token và assertions; vẫn phải kiểm tra computed layout trong WU-00.

| Nhóm | Giá trị nguồn cần giữ | Bằng chứng |
| --- | --- | --- |
| Nền sáng | Canvas #fbfaf8; sidebar #f4f3f0; surface #ffffff | [tokens.css — palette][source-tokens] |
| Text/border sáng | Text #1d1c1a; secondary #57544e; border #e9e7e2 | [tokens.css — palette][source-tokens] |
| Nền tối | Canvas #1a1a19; sidebar #151514; surface #1d1d1c; text #eceae5 | [tokens.css — dark][source-dark] |
| Body text | Geist, 13.5px, line-height 1.45; font features ss01 và cv11 | [tokens.css — type][source-type], [base.css][source-base] |
| Type scale | 11, 12, **12.5**, **13.5**, **14.5**, 16, 19, 23px | [tokens.css — type][source-type] |
| Radius | 4, 6, 8, 10, 999px; một số overlay có giá trị riêng | [tokens.css — radius][source-radius] |
| Control height | 22 / 26 / 30 / 36px | [tokens.css — sizes][source-sizes] |
| Sidebar | Mở 252px; thu gọn 52px; sidebar dạng overlay 280px khi viewport ≤ 900px | [shell.css][source-shell], [responsive.css][source-tablet] |
| Topbar/gutter | Topbar 46px; 50px khi ≤ 640px. Gutter 24px; 16px khi ≤ 900px | [tokens.css][source-sizes], [responsive.css][source-tablet], [mobile][source-mobile] |
| Page | Max-width 1160px; padding thường 28px / gutter / 72px; flush page dùng layout riêng | [shell.css — page][source-page] |
| Density | Task row min-height 40px → 34px; card padding 10px → 8px. Sidebar row 30px → 26px, là preference riêng | [tokens.css — density][source-density], [list.css][source-list] |
| Board | Cột 284px; cột thu gọn 44px | [board.css][source-board] |
| Overlay | Modal thường max-width 560px, nhỏ 420px, lớn 720px; drawer thường min(620px, 100vw) | [overlays.css][source-overlays] |
| Icon | Lucide SVG viewBox 0 0 24 24; mặc định 16px; stroke-width **1.8**, round cap/join | [core/icons.js][source-icons] |
| Cạnh nội dung list | Wrapper trái là gutter trừ 26px để checkbox/group chevron thẳng hàng với cạnh nội dung | [list.css — alignment][source-list-gutter] |

Không làm tròn 12.5px thành 12px hoặc 13.5px thành 14px. Không dùng bộ màu/radius/shadow mặc định của ReUI hoặc một UI kit khác thay cho các giá trị đã đọc.

## 4. Font, icon và asset là một phần của baseline

Nguồn yêu cầu **Geist 400/500/600** và **Geist Mono 400** qua Google Fonts, với stylesheet ban đầu media=print rồi được JS đổi thành all. Nguồn còn dùng font-weight 450 ở sidebar/card. Vì vậy đổi sang một bộ variable font khác hoặc khai báo rộng 100–900 có thể thay đổi cách browser chọn weight 450, dù tên font giống nhau. Xem [index.html][source-font-link], [utils.js][source-utils] và [shell.css — weight][source-weight].

WU-00 phải:

1. Ghi URL, CSS font-face descriptors, unicode-range và SHA-256 của **đúng font bytes browser nguồn nhận được**; lưu notice/quyền sử dụng đi kèm.
2. Cố định các face được yêu cầu ở 400/500/600 và Mono 400. Không khẳng định tệp nguồn là static hay variable trước khi đọc; điều cần giữ là bytes và cách khai báo face thực tế.
3. Cho source và target đọc cùng bytes. Có thể dùng asset local hoặc Playwright route interception; không chỉnh layout/style nguồn để tạo baseline thuận lợi.
4. Ghi phiên bản Lucide thực tế từ lockfile nguồn và kiểm tra SVG path. Chuyển sang lucide-react chỉ khi path/thuộc tính tương ứng khớp; đặt size và strokeWidth rõ ràng.
5. Giữ logo, ảnh mẫu, tỷ lệ ảnh và nội dung placeholder. Không sinh lại ảnh hoặc dùng icon gần giống.

Readiness trước capture phải xác nhận document.fonts.ready, các FontFace cần dùng đã loaded, những request font trong manifest thành công và ảnh cần hiển thị đã decode. Kiểm tra font-family computed hoặc document.fonts.check đơn lẻ chưa đủ chứng minh không có fallback. Nếu thiếu font hoặc asset, case là blocked/fail, không capture làm chuẩn.

## 5. Fixture và môi trường chụp

Chọn một runner được pin cho cả source lẫn target. Baseline chính dùng Chromium cùng một OS; WebKit/Firefox dùng bộ ảnh riêng khi có case cần so sánh, không so ảnh từ các engine khác nhau. Playwright giải thích rendering phụ thuộc môi trường, browser và font trong [Visual comparisons][pw-visual].

Cấu hình đề xuất để WU-00 đóng băng:

| Thuộc tính | Quy ước |
| --- | --- |
| Clock | 2026-10-08T09:00:00.000Z, đặt trước khi module source chạy |
| Locale/timezone | en-US / UTC cho bộ baseline này |
| Primary viewport | 1440 × 1000 CSS px |
| Mobile viewport | 390 × 844 CSS px; ghi rõ touch/coarse-pointer và user-agent |
| Device scale | 1 cho baseline ảnh; không dùng device preset âm thầm đổi DPR |
| Màu | Light explicit cho bộ mặc định; có case dark và system riêng |
| State | Fixture có version, digest và scenario ID |
| Fonts/assets | Cùng manifest bytes giữa hai origin |
| Capture | Viewport là mặc định; vùng có scroll phải có scrollTop/scrollLeft cụ thể |
| Platform | Ghi navigator.platform/user-agent: nguồn dùng thông tin này để hiện Ctrl hoặc phím tắt trên Mac |

Nguồn tạo TODAY và ngày tương đối khi import, đồng thời dùng Math.random cho UID; localStorage key là gr8r.v2. Seed phải được tạo một lần dưới clock cố định rồi lưu thành fixture. Khôi phục localStorage trước navigation cho source; target nạp cùng dữ liệu qua adapter/seed D1 theo API contract. Thứ tự task/project, nội dung, số lượng, timestamp, filter và preference phải tương đương. Nguồn: [utils.js][source-utils], [store.js][source-store], [seed.js][source-seed].

Mỗi scenario chạy trong browser context mới; không để lựa chọn, preference, scroll hoặc dữ liệu mutation từ case trước rò sang case sau. Case tích hợp dùng D1 local riêng, reset/seed đúng fixture; kiểm tra persistence API tách khỏi snapshot với response cố định.

Không giả định mọi view nguồn có deep link. Startup nguồn chỉ đọc một số hash; go() chuyển state trong bộ nhớ. Driver baseline có thể dùng thao tác UI hoặc window.__gr8r trong **source dev server** để đặt route/params, sau đó kiểm tra DOM đã đúng. Handle này không tồn tại trong production build. Xem [main.js][source-init] và [render.js][source-go].

## 6. Ma trận tối thiểu

WU-00 lập manifest case từ route/view/overlay inventory thực tế; các nhóm sau là phạm vi bắt buộc, không phải danh sách screenshot đã có.

| Nhóm | Kích thước/trạng thái | Kiểm tra chính |
| --- | --- | --- |
| Tất cả page/route trong phạm vi chuyển đổi | 1440×1000, light, comfortable, indigo | Copy, bố cục, typography, icon, empty/error state có trong nguồn |
| Tất cả dạng view | List, Board, Table, Calendar, Timeline, Files và Overview | Header/toolbar dùng chung; row/card; selected/filter/group/sort |
| Mobile đại diện từng dạng layout | 390×844; nav đóng/mở, content cuộn | Sidebar overlay, bottomnav, stacked list/table, drawer toàn màn hình, modal bottom sheet |
| Biên 900px | 899 / 900 / 901px, cao 1000px | Sidebar grid ↔ overlay, gutter, stats/settings/timeline |
| Biên 640px | 639 / 640 / 641px, cao 844px | Topbar, bottomnav, title, drawer/modal, list/table/calendar |
| Biên 1100px | 1099 / 1100 / 1101px cho Home + topbar | Grid 2 cột và search label |
| Theme | Explicit light/dark; system với OS light/dark | Surface, border, status, selected item, overlay |
| Density | Comfortable/compact của content; sidebar density đổi độc lập | Chiều cao row, padding card, chiều cao nav |
| Accent | Indigo, blue, violet, teal, rose, graphite | Một trang nhiều control và overlay ở light/dark; màu semantic không đổi nhầm |
| Overlay | Task drawer, full drawer, modal, popover/date picker, context menu, palette, toast, bulk actions | Vị trí neo, z-index, clipping, focus, Esc, return focus |
| Navigation | Page/tab change, refresh, Back/Forward, legacy hash redirect, unknown URL | Shell không reset sai; active nav/title đúng; scroll theo quy ước |
| Motion | Full/system/reduce; mở/đóng overlay; tab/route; complete/add/drag task | Thời lượng, điểm kết thúc, animation không chạy lại mỗi lần render |

Source CSS dùng max-width **bao gồm** 900 và 640. Không thay bằng breakpoint default của Tailwind. Điều kiện JS đóng drawer khi chuyển route là innerWidth < 900; phải ghi nhận riêng ở case 900px, không âm thầm gộp với CSS ≤ 900. Nguồn: [responsive.css][source-tablet], [go()][source-go].

Để tránh ma trận tích Descartes quá lớn, toàn bộ page có ảnh mặc định; các tổ hợp theme/density/accent/overlay dùng mẫu đại diện theo component đang thay đổi. Khi đổi token hoặc shared shell, chạy lại tất cả case phụ thuộc token/shell đó.

## 7. Hai lệnh khác nhau cho reference và target

WU-00/WU nền tảng triển khai hai script với trách nhiệm tách biệt:

- **visual:reference:capture:** chỉ chạy với source checkout đúng SHA. Ghi ảnh chuẩn, fixture và capture metadata sau khi readiness đạt. Không nhận target origin làm đầu vào hợp lệ.
- **visual:compare:** chỉ đọc baseline đã có; chạy target với updateSnapshots='none'; thiếu ảnh hoặc metadata không khớp thì fail. Lệnh này không tạo/cập nhật golden image.
- **visual:reference:verify:** chạy lại source bằng metadata đã pin để chứng minh bộ reference ổn định trước khi quy lỗi cho React.

Ví dụ cấu hình comparator cần được hiện thực và kiểm tra trong WU, chưa có sẵn trong gói tài liệu:

~~~ts
export default defineConfig({
  updateSnapshots: 'none',
  use: {
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixels: 0,
      threshold: 0,
    },
  },
});
~~~

Cần import defineConfig từ @playwright/test, thiết lập snapshotPathTemplate tới cùng bộ reference, rồi đặt clock/fixture trong helper trước page.goto. Script comparator phải từ chối cờ update snapshot nếu được truyền thêm. Lưu digest reference trước/sau để phát hiện ghi nhầm. Hành vi snapshot được mô tả trong [Playwright config][pw-config], [screenshot assertions][pw-assertions] và [clock][pw-clock].

Zero-diff là mục tiêu khởi đầu. Nếu source tự chụp lặp lại còn nhiễu, phải sửa điều kiện capture trước. Ngoại lệ tolerance chỉ hợp lệ khi chỉ rõ nguyên nhân, vùng ảnh, số pixel và bằng chứng source lặp; không tăng tỷ lệ sai khác toàn trang để che lỗi. Không mask text, icon, card, chart hoặc vùng thiết kế cần kiểm chứng.

## 8. Motion và readiness không được làm giả

Snapshot ổn định có thể chụp sau animation, nhưng runtime target vẫn phải giữ animation nguồn. API screenshot tắt CSS animation không đảm bảo vòng requestAnimationFrame tính số trên dashboard đã chạy đến cuối. Chờ giá trị đích và geometry ổn định, không chỉ chờ network idle.

Nguồn có route rise-in 0.36s, drawer 0.34s, modal 0.26s, popover 0.16s cùng stagger và reduced-motion overrides. Xem [motion.css][source-motion], [overlays.css][source-overlays] và [countUp()][source-countup]. Case motion riêng dùng browser clock có kiểm soát, computed timing và ảnh/video tại các mốc phù hợp; không chỉ nghiệm thu bằng ảnh cuối.

Giữ keyboard focus visible, focus trap khi cần, Esc và return focus. Portal không được làm overlay lọt vào overflow container hoặc làm token theme mất hiệu lực. Mobile safe-area cần giữ công thức từ nguồn; viewport desktop giả mobile chưa chứng minh safe-area trên thiết bị thật.

## 9. Đầu ra và điều kiện hoàn tất một WU UI

Mỗi case lưu source reference, target actual, diff, scenario metadata và kết quả. Mỗi WU báo:

1. Component/route đã chuyển và shared component được tái sử dụng.
2. Case đã chạy, pass/fail/blocked, môi trường và baseline SHA.
3. Sai khác còn lại và lý do; đường dẫn artifact để xem lại.
4. Bằng chứng interaction liên quan, console/runtime error và API state.
5. PROGRESS.md được cập nhật theo thực tế; chỉ đánh dấu hoàn tất khi gate của WU đạt.

Không báo “pixel-perfect” cho toàn ứng dụng nếu mới đạt một vài trang. Không báo “đã test” khi chỉ có đặc tả, build hoặc kiểm tra source.

[source-tokens]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/tokens.css#L5
[source-dark]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/tokens.css#L100
[source-type]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/tokens.css#L71
[source-radius]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/tokens.css#L55
[source-sizes]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/tokens.css#L82
[source-density]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/tokens.css#L201
[source-base]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/base.css#L4
[source-shell]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/shell.css#L7
[source-weight]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/shell.css#L110
[source-page]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/shell.css#L359
[source-tablet]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/responsive.css#L4
[source-mobile]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/responsive.css#L96
[source-list]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/views/list.css#L4
[source-list-gutter]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/views/list.css#L267
[source-board]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/views/board.css#L17
[source-overlays]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/overlays.css#L4
[source-icons]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/core/icons.js#L6
[source-font-link]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/index.html#L9
[source-utils]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/core/utils.js#L4
[source-store]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/core/store.js#L6
[source-seed]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/data/seed.js#L1
[source-init]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/main.js#L61
[source-go]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/render.js#L58
[source-countup]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/render.js#L206
[source-motion]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/motion.css#L91
[pw-visual]: https://playwright.dev/docs/test-snapshots
[pw-config]: https://playwright.dev/docs/api/class-testconfig#test-config-update-snapshots
[pw-assertions]: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1
[pw-clock]: https://playwright.dev/docs/clock


## WU-03 — CSS exceptions và foundation verification

Owner là `@studio/ui`; source vẫn khóa tại `904205c626918ee96054eb35495c394a60c0c601`.

| File / ngoại lệ | Phạm vi và lý do |
| --- | --- |
| `packages/ui/src/styles/tokens.css` | Exact source light/dark/accent/density/custom properties; chỉ thêm root gutter/topbar/reduce overrides từ responsive source. Token definitions được phép; không có component layout selectors. |
| `styles/fonts.css`, `src/assets/*.woff2` | 21 exact face descriptors/unicode ranges, 11 bytes assets theo manifest WU-00; fixed Geist 400/500/600 và Mono 400. Không mở variable range hoặc khai báo face450. OFL/ISC notices giữ nguyên bytes. |
| `styles/theme.css` | `@theme inline` maps color/type/radius/size/easing/shadow to source properties; spacing base4px; exact inclusive1100/900/640, source-hover và source-reduce/source-dark variants. Shadow utility namespace `shadow-elevation-*` và `ease-panel` tránh self-reference với source properties. |
| `styles/base.css` | Border-box/html/body/root; source body/font/form/button/link/caret/selection/focus; scrollbar10px/thumb border3px. Không Preflight hoặc reset heading/list/table/image. Icon display/shrink được component biểu đạt bằng utilities. |
| `styles/motion.css` | 10 source keyframes (`riseIn`, `slideInR`, `growX`, `popCheck`, `strike`, `doneWash`, `doneRing`, `land`, `addWash`, `addRing`) và responsive `fadeOnly`; timing/stagger/state selectors thuộc component ở unit tương ứng, chưa port selectors legacy. |
| `apps/web/vite.config.ts` | `cssMinify:false` giữ exact alpha thay vì lượng tử hóa rgba thành 8bit hex; `assetsInlineLimit:0` để mọi font subset có HTTP request/hash evidence. Không đổi token values. |

ThemeProvider giữ source prefs-to-root behavior, gồm nuance `motion=full`: root bỏ data-motion, nên OS reduce vẫn áp dụng. `system` theme đổi qua CSS media query; `effectiveDark` subscribe media để React consumer nhận kết quả. Chỉ UI preferences lưu trong `task8.ui.theme.v1`; không mirror business state.

`apps/web/foundation.html` và `@studio/ui/foundation-sample` là verification fixture riêng, không screen/gallery nghiệp vụ. Mọi static target sample style dùng literal Tailwind classes; không import source CSS vào target. Controls của harness nằm ngoài sample rectangle để không làm bẩn cạnh clip có chiều cao phân số.

Lệnh thật: `pnpm build`, `pnpm foundation:audit`, `pnpm visual:foundation`. Audit so authored token declarations/descriptors/bytes và browser module graph. Visual runner chạy source gốc với một probe surface độc lập và production target trong cùng Chromium145/revision1208 trên Linux; source SVG helpers giữ nguyên. Reference sample chụp **chỉ từ source**, chụp lặp zero-diff trước so target. Threshold0/includeAA=true/maxDiffPixels0/không mask. Official Darwin baseline/manifest/threshold WU-00 luôn immutable.

Computed comparison ghi cả raw token strings và CSSOM resolved values; chỉ canonical bỏ bốn transparent zero-size ring layers mà Tailwind shadow utility thêm. Các layer này không tạo pixel; raster comparison vẫn so nguyên ảnh với zero tolerance. Source/target SVG attributes/children/geometry được so trực tiếp. Technical review của sample Linux không phải user approval hoặc whole-page/Darwin parity.
