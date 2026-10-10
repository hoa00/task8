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

## WU-04 — primitives và source-only controls gallery

Owner là `@studio/ui`. Layout/spacing/sizes/colors/variant definitions ở `controls.tsx`, `display.tsx`, `select.tsx` dùng literal Tailwind utilities. Dynamic numeric progress/segments/avatar sizes/Select anchor geometry là typed inline styles, không tạo Tailwind class từ runtime value.

`styles/controls.css` chỉ sở hữu pseudo-elements của loading spinner, checked/indeterminate check, toggle thumb và active tab indicator; source-equivalent spin/shimmer/pop-in keyframes; skeleton gradient; select arrow data URI gốc. Đây CSS exception có owner/phạm vi, không import stylesheet/component selectors legacy. Select chỉ sở hữu listbox riêng; chưa có Dialog/Popover host/stack của WU-05.

Không Preflight nghĩa là side border phải reset các cạnh chưa dùng: `border-0 border-b border-solid border-border` hoặc side-specific border-style. Border-solid với border-b đơn lẻ bật UA medium-width border trên ba cạnh còn lại. Giữ explicit50% cho các vòng tròn source; presence dot có kích thước30% của22px nên999px rounded-full có thể tạo raster khác ở kích thước phân số. Shadows của controls dùng literal `[box-shadow:...]` property utilities để giữ source paint value trực tiếp.

PasswordInput giữ source wrapped-input padding-left30px kể cả không có leading icon. Source select enhancer bỏ qua disabled của native select/options; target dùng disabled semantics native cho trigger/options. Harness source-only chỉ mirror disabled native attribute lên trigger đã enhance (không đổi pixels/style/template/source checkout); probe disabled options chạy trên target QA riêng, không claim source enhancer có behavior đó. Source-only controls markup gọi original SVG/helpers/select logic và original source CSS/fonts; original #app/#layer giữ trong hidden host, còn select menu append trực tiếp vào body để open state hiện thật.

`/controls.html` là gallery React cô lập được production build biên dịch; chưa ghép AppShell/routes/business fields. Shared harness rectangle802px chỉ định geometry sample (ba column242px), QA controls nằm ngoài clip. Mỗi visual base/pseudo-state có browser contexts riêng; preferences đặt trước mount, neutral pointer/style-layout flush/finite-motion settlement/two RAF trước capture. Infinite spin/shimmer pause phase0. Capture giữ animations allow và caret initial vì visual phase không focus text input thật; keyboard/focus/validation chạy riêng trên React gallery. Source được chụp lặp trước comparison; threshold0/includeAA=true/maxDiffPixels0, không mask, không cập nhật baseline Darwin WU-00. Technical source-only Linux review không phải user approval hoặc whole-app/Darwin parity.


## WU-05 — overlay ownership and scoped verification

`packages/ui/src/overlays.tsx` owns generic Dialog/Popover/Menu/ContextMenu/Tooltip presentation; `overlay-context.ts` owns typed focus registrations; provider owns Portal host, topmost dismiss, focus scope and modal overflow lock. `toasts.tsx`/`toast-queue.ts` own controlled queue/action/timer presentation only. Static layout uses literal Tailwind. Inline styles are limited to measured placement, source modal-stack z indices and caller-provided native style values. No app/domain/contracts/data imports or business schemas.

`styles/overlays.css` is an explicit CSS exception for source-equivalent modal/popover/drawer/toast/fade keyframes, entrance cleanup selectors and inclusive640px sheet/drawer/toast geometry. Source reduced motion is fadeOnly120ms, not an invented near-zero duration; scrim180ms and tooltip120ms/350ms delay preserve their distinct source rules. Dialog/popover/drawer entrance cleanup follows source one-shot flags and preserves React DOM, draft and focus. Actual source render clears S.ui.fx and rebuilds overlay markup; target retains nodes. This lifecycle difference is recorded in sourceLifecycle and rejected raster evidence rather than hidden by remounting glyphs.

Layer values are modal drawer scrim49/drawer50 (nonmodal drawer has no scrim), modal scrim60+2i/wrap61+2i, popover80, toast100, tooltip200. Drawer does not count toward modal depth. Mobile overlay source has no env safe-area declaration; preserve sheet92vh/radius14 and toast bottom76px. Browser viewport checks do not prove physical device insets. WU-04 Select remains an independent listbox; no reopening or changed behavior in this unit.

Source-only generic sample content is independent of the React gallery and uses original source CSS/SVG helpers. Source-owned roots remain hidden for its listeners; visible portal overlays and toast host sit outside that hidden host. Both sides share capture environment, preferences, neutral pointer, layout/finite motion settlement, screenshot warmup and caret hiding. Gallery QA controls are hidden only for viewport capture. Official Darwin173 baseline/manifest/source lock/fonts/fixtures remain immutable; scoped Linux evidence is not Darwin or whole-app parity. `visual:overlays`, its `audit`/`interactions` modes, `test:overlays:lifecycle` (actual development StrictMode) and `visual:overlays:motion` are real repository commands. Motion frames use pause/currentTime on original CSS animations at0/50/99% and compare computed opacity/transform/duration/easing; frame PNGs are evidence, not a claim of intermediate pixel parity.

WU-05 settled raster setup uses HTMLElement.click symmetrically to avoid active pseudo-state: target opens through React callbacks, while source is an independent generic source CSS/SVG fixture using real placePop/toast helpers; actual source application opening/render lifecycle is verified separately; pointer/key interaction gates remain trusted input. Context setup dispatches an explicit MouseEvent with source clientX/clientY/top semantics. Child popup setup waits for the parent entrance; production placement also updates at ancestor animation/transition end with cleanup. Finite animation promises are attached concurrently and skip idle cancellations. Snapshots disable animations symmetrically after normal settlement, with two warmup captures. Full/system/reduce animations remain intact and are inspected using original controlled animation frames. Trusted pointer/Enter captures had small shadow/glyph residuals despite equal computed geometry and repeats; rejected artifacts preserve this unresolved raster limitation. No tolerance/mask/source CSS changes or glyph remount workarounds were accepted.

WU-04 Button was minimally reopened: replace individual scale with the original active transform scale(.97), preserving transform140ms/default ease transition and reduce transform:none. Reviewer proved the timing mismatch, but this correction alone did not prove the cause of the trusted-input raster residual. Only affected Buttons and WU-05 runtime/visual gates are reverified.

## WU-07 — shell crop ownership / Linux source-only evidence

`apps/web/src/app/shell/shell.css` owns only shell state/pseudo-state selectors,
source inclusive 1100/900/640 media queries, safe-area padding and scrim/skip
motion. Static shell geometry is literal Tailwind; source shell/responsive CSS
is never imported into the target. The stylesheet uses the utilities layer so
collapsed/media selectors can correctly override component utility geometry.

Source-specific computed details retained: first project expanded at initial
entry; project-favorite SVG resolves text-4 through the source `.sitem .i`
cascade; source collapsed sidebar also hides the profile avatar span. Brand tile
requires its original black background beneath the clipped SVG (double edge
coverage), and project subpage label ink remains unclipped. These are source
behaviors, not a redesign or a tolerance exception.

The scoped runner `pnpm visual:shell` uses the immutable source application's
real `render()`/`renderShell`, original foundation/fonts/helpers and locked
fixture. Each state has fresh source and target contexts; both receive the same
preferences, neutral pointer/blur, font readiness, computed-layout flush,
concurrent finite-animation `.finished` settlement and two RAF. Original source
`#app`/`#layer` hosts stay intact. Source is not edited and the official Darwin173
baseline is neither regenerated nor overwritten.

Crops include only sidebar, topbar and bottom navigation. Home content (WU-17),
ProjectHeader/tabs/full ProjectPage (WU-16), future business pages and task drawer
(WU-10) remain pending outside accepted pixels. Snapshots use programmatic state
setup; actual mouse/key navigation, focus, history, async workspace isolation,
loading/error boundaries and scroll restoration have a separate browser suite.

Evidence `evidence/WU-07/visual-verification.json` pins crop rectangles,
source/target hashes, geometry and exact threshold0/includeAA=true/no masks.
Source review sheets and accepted PNGs are copied from those verified bytes.
This is technical Linux source-only shell review; it does not establish official
Darwin whole-page parity, full future-page parity or physical safe-area insets.

## WU-08 — task toolbar/filter ownership and scoped evidence

Task fields and toolbar compose WU-04/05 controls, icons and overlay primitives;
feature styles use literal Tailwind source values. `apps/web/src/styles/app.css`
owns only the inclusive640px toolbar label hiding and two-column filter-row
geometry in the utilities layer. This layer preserves source min-width/max-width
cascade. Field status/priority atoms use original static SVG geometry; identity
adapters reuse AvatarBase/ColorDot. No source CSS is imported into the target.

The WU-08 source-only harness invokes locked `viewToolbar`, `popHtml`, actual
select enhancer and `placePop` with original styles/helpers/fonts and retained
source roots. The22 cases cover light/dark desktop default/chips/filter empty/
rows/expanded/sort/group/columns, mobile390 and639/640/641. Fresh contexts,
neutral pointer/blur, fonts/layout flush, concurrent finite animation settlement,
two RAF and symmetric warmup screenshots apply. All comparisons and repeats are
exact0 at threshold0/includeAA=true/maxDiffPixels0, without masks. Actual pointer/
keyboard probes are separate from deterministic visual setup.

WU-05 reopening: shrink-to-fit popovers must start at their anchor coordinates
before measuring width, as the original `popHtml`/`placePop` lifecycle does. This
affects mobile filter rows: initial source left220 measures170px, collision
places left144, and final width246px. Measuring target at left0 instead gave
382px after collision. Shared placement now preserves that lifecycle. The
original WU-05 accepted evidence remains untouched; a full42-image/17-probe
regression is recorded under `evidence/WU-08/overlay-regression`.

`evidence/WU-08/visual-verification.json` records source/target hashes, actual
geometry, immutable manifest hashes and separate source/canonical query fixtures.
44 verified PNGs and6 source-only review sheets accompany technical inspection.
No full List/Board/Table, field-editor screenshot matrix, Darwin173 whole-page
or physical-device parity is claimed. Current view URL changes do not persist a
named saved view; equal-key row ordering follows the documented API ID correction.

## WU-09 — shared TaskList and actual page evidence

TaskList owns utility-layer responsive/pseudo-state rules in feature list.css;
static source dimensions remain literal Tailwind declarations. One row/group/
composer/mini/bulk implementation receives typed context/columns/selection.
Source label overflow/gap, weekday date display, mobile cards and mini inline
span baselines are preserved. Canonical page headings/toolbars allow the source
default flex shrink, including min-height44 when a long list fills the page.
No legacy CSS/renderer is imported into product code.

The96 exact source-only comparisons comprise80 List context/state cases across
desktop/mobile and both40/34 densities,8 canonical Workspace/My Tasks content
crops and8 mini optional-project/avatar variants. Expanded-subtask and composer
fixtures explicitly query the same visible source task; required child/input
rectangles must be inside the accepted clip. Full Project/saved wrappers remain
WU-16, Drawer contents WU-10 and full subtask CRUD/detail WU-11.

Original locked pageTasks/pageMyTasks/listHtml/miniRow/viewToolbar, helpers, styles,
fonts and source #app/#layer remain unchanged. Source fixture input is prepared
in mapped UUID order for DATA-10 canonical ascending tie-breakers; this is
explicit post-state setup, not an edited source renderer or original golden.
Both renderers start cold in the same post-state; target QA initial props and
expanded-aggregate prefetch remove measured native Input paint lifecycle
asymmetry. Isolated target QA root auto-height matches the source section parent;
actual canonical pages retain normal AppShell sizing. Rejected compositing and
partial focus/blur experiments are recorded but never used to pass comparisons.

Fresh contexts/clock/locale/fonts/layout flush/neutral pointer/concurrent finite
animation settlement plus2RAF/symmetric warmup apply. Threshold0/includeAA=true/
maxDiffPixels0/no masks and repeated screenshots all give zero. Official173
Darwin baseline/font/fixture/lock hashes are unchanged. Accepted192 PNG bytes
and24 source-only sheets accompany technical inspection under evidence/WU-09.
Actual mouse/keyboard behavior and explicit focus/caret/scroll retention are
separate probes; deterministic snapshot setup is not reported as user action.
The report claims Linux scoped parity, not Darwin whole-page or physical-device
parity. Previous accepted evidence remains immutable; affected WU-08 field
interaction reruns use the WU-09 destination.

## WU-10 Task Drawer, form và file foundation

Owner: `apps/web/src/features/tasks/detail` và `features/files/FileFoundation.tsx`.
Static layout dùng Tailwind; `detail.css` giữ source full positioning620/980,
inclusive640 mobile, rich-text allowed descendants; `files.css` giữ exact source
filePrev artwork descendants (inset/padding/gap/heading). SVG/file colors/helpers
được port từ source helpers, không dùng generated/stock art. Unqualified Tailwind
`rounded` không emit với reset radius palette; các card dùng `rounded-default`.

`tests/visual/task-detail/verify.mjs` luôn chạy toàn ma trận32. Đây là source-only
Linux technical component samples, không thay173Darwin goldens hoặc user approval.
Drawer comparison là header/properties cộng actual side/full/mobile panel geometry;
edit form comparison title/plain description/properties, vì scoped child CRUD owner11.
Attachments empty/existing/uploading/preview và8file arts được so ngay tại10.
Threshold0/includeAAtrue/maxDiffPixels0/masks[]. Fixtureclock/font/source SHA giữ khóa.
Source giữ `#app/#layer`; hidden unrelated app host và target hidden QA opener host
cho cùng isolated background, không sửa source template/CSS. Source finite animations
settle rồi gọi originalrender để bỏ entrance flags. Loading disabled attrs phải cùng originalrender transaction trước first paint.

Source drawer upload markup ghi width42% nhưng source `.prog > i` còn
`transform: scaleX(var(--p, 0))` và không đặt `--p`, nên bar paintzero. Foundation
preserve exact inherited CSS presentation; actual mock pending percentage0,
metadata-confirmed completion, không claim byte transport. HTTP/R2 progress owner35.
QA42 là source simulation riêng, không file upload success. FileDto storageMode sample /
contentAvailable:false và screen-reader note nói bytes unavailable; no fake HTTP success.

Scoped reopening: WU08 controlled fields nhận custom trigger seams cho form/Drawer,
WU09 header Newtask nối full form trong AppShell, More/context menu nối sharedhost;
inline Addtask vẫn reusable. WU05 outside-pointer handler bỏ qua global notification
viewport để source-eligible Undo không dismiss Drawer; notification marker thuộc UI
primitive, không app/domain coupling. Historical accepted reports giữ nguyên; regressions
được ghi dưới WU10 field/list/overlay-regression.

Drawer component samples isolate only original chrome/title/kv after measuring the
complete original panel. `renderLayer`/original settled DOM supplies exact cloned
owned markup; `#app/#layer` remain connected/hidden. Each source/target before/after
check asserts root/body/header/title/grid rectangles and all computed owned descendant
styles unchanged; every omitted section begins below the accepted clip. Target uses
the same controlled TaskDrawer/TaskDetailsBody section composition, without production
remounts or paint transforms. Attachments have independent six-state samples using
actual original body content widths571/358 and card widths185/175, measured before
isolation. The original full-body default source diagnostic still differs17/14 pixels
on mobile within this crop; it is retained, not reported as fixed production parity.
WU11 must compare full body in Comments AND Activity states. The scoped32 technical
matrix does not claim whole default Drawer or child/collaboration parity.

Source cold finalrender replaces focused/animated nodes. Snapshot OverlayProvider
`initialState='settled'` starts with the same settled/no-focus state and data already
prefetched; normal production defaults retain motion/focus. This resolves native edit
input raster history; independent actual default browser probes verify focus/motion.
Drawer parent side .34s and full modalIn .26s plus body riseIn .38s delays0/.04/.07/.1
are source-owned; independent body settlement does not postpone full parent geometry.
Explicit/OS reduced motion uses source fadeOnly .12s. Native input title keeps source
padding0 and ease timing; property MemberIdentity uses source static position.

WU05 focus reopening: deferred returnOpener preserves a newer connected meaningful
focus target outside the closing layer. This prevents Drawer-close RAF from stealing
new List title editor focus. Real canonical editor-after-two-RAF assertion and scoped
42/17 overlay nested/trap/return plus StrictMode checks cover this change; source CSS
and production motion are unchanged.


### WU-11 full-body capture boundary

The collaboration matrix compares the entire actual Drawer rectangle, including
all body sections, default Comments AND Activity, deep scroll, full mode, mobile,
dark, SubtaskDetail, rich editor, mentions, reaction picker, upload and error. It
does not use WU10's sections:null or isolateOwnedDrawer. Complete Edit form samples
include active existing child controls. Original source #app/#layer stay connected;
only unrelated app paint is hidden by the established QA harness.

Both contexts use real locked font HTTP bytes, 400/500/600 ready, en-US/UTC/DPR1,
MacIntel, seed804205 and fixture clock2026-10-08T09:00Z. Await concurrent finite
non-idle motion, original source render clears its own entrance flags, layout and
two RAF, neutral pointer; cold prefetched target OverlayProvider settled state
suppresses initial focus only in QA. Default production motion/focus/keyboard,
held responses and files are verified independently. No production paint,
transform or remount workaround; original173Darwin baselines remain immutable.

Measured corrections belong to current owners: source progress is full-width
inner scaleX with radius4; Upload svg opacity .9; native composer placeholder
rgb117,117,117; source rich-editor radius8; mention .pop min200, no border beyond
shadow ring, radius10, z80/overflow-y:auto/max-height/origin, and .mi gap9/min-height30/padding0 8; emoji picker font16.
Reports retain rejected audits and computed styles rather than masks/tolerance.
Current full-body pass describes this documented harness only; the historical
WU10 mobile17/14 root cause has not been proved. This is technical comparison,
not user visual approval or physical-device/Darwin whole-page parity.

The subsequent AC1 native-drop reopening changes event handling only. Accepted
46 whole-Drawer/form pairs and all92 PNG hashes remain unchanged and retained;
no seed/CSS/geometry edit or new visual claim. Native drag evidence separately
records trusted browser events, pre-input DOM, literal/rich text, caret and
canonical data for external drops and internal move/Control-copy.


### WU-12 Board ownership and capture boundary

TaskBoard/Column/Card reuse canonical fields, identities, task commands and
TaskOverlayHost. Their feature utility layer owns284/44 widths,12px gaps,
per-column overflow, horizontal Board overflow, source hover/drag/drop and
one-shot motion. At max-width900 the Board padding-bottom is90px, exactly the
source responsive rule; desktop remains24px. No page-height or paint workaround
is used. The card contains source count metadata, not attachment thumbnails.

The49-case Board matrix has36 Workspace/Project/saved feature samples across
comfortable/compact,1440/390 and default/collapsed/composer;3 dark samples,
6 Workspace hover/menu/scroll/no-result samples and4 actual Workspace AppShell
content samples in desktop/mobile and light/dark. Project/saved captures cover
the shared feature, not WU-16 full ProjectHeader/tabs/wrappers. Full List96,
whole Drawer42 and full form4 regressions are kept under WU-12 evidence.

Original locked pageTasks/boardHtml/kcard/viewToolbar, helpers, fonts and styles
remain unchanged. Connected original #app/#layer remain inside a hidden QA
host; the source feature has the measured block parent and original .page flex
composition. Source input tasks are prepared in mapped ascending UUID order
for DATA-10 stable ties. Composer snapshots explicitly query one real Backlog
task identically on source and target (the WU-09 visible-state precedent), and
assert the unique card/input state remains in the full accepted viewport.
The original source action's setTimeout0 focus is reproduced on the visible
composer; both sides blur and use a neutral pointer. Native unfiltered composer
creation, focus/scroll, cancellation and persistence are independent probes.
Default/collapsed/scroll snapshots retain the full unfiltered Board dataset.

Both contexts use actual locked HTTP font bytes400/500/600, pinned fixture
clock/seed/locale/UTC/DPR1/MacIntel, native mount/data/font lifecycle, concurrent
finite motion settlement, original source render to clear its own flags,
measured standard input/page/body/html styles, layout and two RAF. Scrolling
uses actual wheel input on both sides. Screenshots use ordinary Playwright
capture/default Chromium arguments with exact dimension assertions; tolerance0,
includeAA=true, maxDiffPixels0 and masks[] stay unchanged. Original173Darwin
baselines/font/fixture/lock bytes stay immutable. This is Linux technical scoped
comparison, not user visual approval, full Darwin parity or physical-device
coverage. Default production focus/motion remains unchanged.

Rejected diagnostics are retained. Initial feature-host intrinsic width and
source composer autofocus scroll were measured QA lifecycle errors. Cold target
font/data prefetch introduced14 native search-input corner pixels on Project/
saved mobile and was removed; these were not column corners. Unfiltered
Workspace composer left5 pixels at search-input/right and column/top corners,
and a prior scroll attempt left11 at two rounded bottom corners. One-off zero
results do not establish their cause. Keyed Fragment simplifies source-like
card DOM but did not prove the corner cause. Tailwind optimize:false, literal
border declarations, foreground capture, separate browsers, init-hidden Home,
software flags and view/no-clip captures were rejected; none is adopted as a
production or accepted runtime workaround. CDP fromSurface:false preserved page
identity in a red/blue negative probe but ignored clip dimensions, so it was
rejected. The visible composer state is declared QA query preparation, not a
claim that historical unfiltered raster diagnostics or WU-10 mobile17/14 were
fixed. No source templates/CSS/font/baseline edits, masks or target-as-source.


WU-04 scoped Input reopening restores the source base padding0 10px with literal
py-0 on Input; Textarea retains its explicit8px vertical padding. This actual
missing source declaration was found through computed-style measurement, not
adopted as a raster workaround or claimed tiny-pixel cause. Affected controlled
Input fields/toolbar and List/Drawer/form/Board snapshots use fresh WU-12 outputs;
previous accepted WU-04/08/09/10/11 evidence is unchanged.

## WU-13 Task Table scope and CSS owner

`features/tasks/table.css` owns literal Tailwind @apply utilities for native table
geometry and source-specific selectors: th/td borders34/36px, group32px, first-cell
gutter, sticky stacking2/3/5, row hover, resize6px and active state, native editing
inset2px accent, dependency radius4 and inclusive≤640 presentation. Dynamic col/
table width and project/member colors are typed data styles. Mobile panel radius10,
flat ordering, due numeric styling and inline timer preserve the source browser's
first duplicate class attribute; no muted union is added. Inline editor deliberately
uses its native input defaults (source has no .input padding class), not shared
Input geometry. Display estimate has tabular numerals; editing estimate does not.

The strict scoped runner `visual:task-table` compares actual locked pageTasks/
tableHtml/tcell/viewToolbar/helpers/styles/font bytes with Workspace Table and
controlled Project/saved variants. It covers41 full-feature/actual Workspace content
samples: comfortable/compact/light/dark,1440/390 and boundary640/641,all11 columns,
resized/sticky horizontal+vertical scroll,hover,inline title/estimate,empty,Columns
and six group modes. threshold0/includeAAtrue/maxDiffPixels0/masks[], repeatability
on both sides.82 frozen source/target PNG hashes and root technical inspection are
separate from user approval. The original173Darwin/font/fixture/lock bytes and source
working tree remain immutable. Current Linux measurements do not prove physical
mobile/fullDarwin parity or historical WU10 mobile17/14 cause.

Capture uses connected #app/#layer, source block host and original page flex wrapper,
DATA-10 UUID tie preparation, identical fixed clock/en-US/UTC/DPR1/MacIntel, locked
HTTP font readiness400/500/600, concurrent finite animation settlement, original
source render to clear its entrance flags, layout+twoRAF and neutral pointer.
Ordinary Playwright clipped screenshots assert dimensions, no masks or source edits.
Inline focus capture uses source selected input and real target mouse edit; native
error/blur/newer-focus/resize/persistence/open/context/640/641 are separate probes.
Project/saved are feature evidence, full wrappers remain WU-16. Regression outputs
are scoped to WU13 and preserve accepted prior reports. Early failures (text token,
extra label clip/gap,estimate numeric inheritance,shared-preview lifecycle and
incorrect QA action/role assumptions) are retained as rejected reports.

Original native title dblclick observation is explicitly a source quirk: two trusted
clicks detail1/2, Drawer visible, no editor/dblclick event after replacement. The
strict title editor snapshot is original source tcell/S.ui.editCell state geometry;
target native rename is verified independently. Source native Estimate focus and
original desktop/640/641 presentation/scroll/open are actual observed checks.

WU-13 focused field review reopened WU-08's shared field owner. Table popups use
the original TD rectangle (left/bottom+4) via stable per-cell popupAnchorRef, while
the inner button remains the keyboard/return-focus target. Native same-cell padding
click toggles closed; search and calendar month reset on every opening transition,
including padding openers. Choice search uses original plain input/pin geometry;
Project/Labels menu dots are local8px/radius3, without changing global ColorDot.
The one shared Date body now matches original popovers.js180–190: quick badges,
Clear, separator and mini-calendar,22px month icon buttons and6px day radius.
The invented manual input/Apply form was removed from every consumer. Canonical
date/range validation and failed picker draft retention remain in commands.

WU-05 minimal reopening excludes input/textarea/contenteditable from printable
Menu typeahead (trusted sequential typing had lost search focus); arrow/Home/End
behavior is retained. Popover horizontal overflow now uses the original anchor
flip and max8 rule; the extra right-edge8px clamp caused search shrink-fit width
to change. Tooltip clamping is retained. The diagnostic border-none hypothesis
did not explain width. The source render already calls placePop; the focused QA
runner's duplicate placePop call was removed, with before/after evidence retained.

Supplemental accepted matrix is five Table popups (Status/Due, native horizontal
Priority/Due, right-edge Project) plus one Date popup in the actual whole Drawer:
six strict0/repeat0 pairs and12 frozen hashes. Original41/82 hashes are retained.
Additional Workspace List Date remains558 pixels after source render/native2;
Project List remains8814/native2. Geometry, fonts/styles and text Range match;
the Workspace heading is a one-pixel raster translation without a proved cause.
Neither List case is accepted or covered by the six-case matrix. Reports and PNGs
remain explicit M2/full-parity debt. No paint/translation/remount/mask/tolerance
workaround or fixture/clock change was made to clear them.


### WU-14 Calendar capture and geometry

Calendar static layout is literal Tailwind/@apply in its owned feature stylesheet;
CSS exceptions are source dynamic project-color mixes, native drag/drop state,
source moved animation, source hover add button and the <=640 bar/Week stack
media rule. Source `.faint` maps to text3 (`text-muted`) for event times/No tasks.
Day add explicitly owns absolute positioning because shared IconButton is relative.
No paint/translateZ/remount/alpha/browser-flag technique is used.

`tests/visual/calendar/verify.mjs` captures original calendarHtml/pageWsCalendar/
pageMyTasks/viewToolbar/popHtml and locked font/CSS, with source #app/#layer
connected in the hidden feature host. The full exploratory46-case run covers42 required shared Calendar cases (three
scopes Month/Week/overflow,1440/390/dark/compact/640/641, event/filter/project/
empty/leap/42/weekStart) and four EXTRA actual AppShell content comparisons.
The required42 run explicitly uses --required; the full four-page audit uses
--pages and exits1 when a whole-content mismatch remains. Overflow fixtures symmetrically move four
existing due dates and use explicitly documented scoped source inputs; raw source
workspace leakage is independently saved under evidence/WU-14/diagnostics.
Source template/style files are never changed.

Fresh en-US/UTC/DPR1/MacIntel/seed804205/2026-10-08T09Z contexts load locked HTTP
fonts400/500/600, await concurrent finite motion, invoke original source render,
force ordinary layout + two RAF, neutralize pointer and assert normal Playwright
clip dimensions. Comparison remains threshold0/includeAAtrue/maxDiffPixels0/
masks[]. Original173 Darwin/font/fixture/lock hashes must stay unchanged.
Frozen hashes in WU-14/review.json accept42 required +2 mobile supplemental strict
zero-diff pairs (44pairs/88PNG). Both desktop whole-content supplements retain
context-variable0/5 search-input corner pixels as UNACCEPTED M2/full-parity/WU29 debt; raw46 failure,
page audit exit1, PNG pairs and native/style diagnostics stay recorded. Current
audit Workspace1440=0/Mine1440=5; earlier opposite5/0 was observed in console
but its temporary report/PNGs were overwritten before archival. No old hash
claim or choice of a passing desktop frame. Equal
input geometry/style and source native-vs-original-render selfdiff0 do not prove
cause. Trusted query-clear produces0 but changes source11 pixels, so it is not
substituted as a baseline or claimed as a fix. No46-pass/whole-desktop-page claim;
full641 legend overlap is recorded separately as a source pointer limitation,
with trusted clicks and working native keyboard. Managed Linux technical evidence
is not user approval/full Darwin/physical-device parity. Inherited unaccepted
WU13 List Date558/8814 and WU10 mobile17/14 raster debt remains unchanged.

Additional source/target native MyTasks390 observation confirms the Week center
is covered by weekday Tue, pointer leaves Month, and native keyboard opens Week.
Geometry is retained and recorded separately;44 accepted image pairs do not
claim all mobile mode-pointer controls work. Frozen hashes remain unchanged.


## WU-15 Timeline managed Linux supplement

`tests/visual/timeline/verify.mjs` compares48 full visible Timeline renderer clips:
44shared feature cases plus4actual Workspace route renderer cases, both zooms,
1440/390/dark/compact, rail640/641/899/900/901, scroll, grouping, milestone
collision, empty/undated/milestones-only/outside-range,3400 full width, filter and
weekStart0/6. Project stays feature harness. Every visible rail/header/bar/edge/
milestone pixel is included; toolbar/page/AppShell are outside this acceptance.
Fresh locked en-US/UTC/DPR1/MacIntel/seed804205/2026-10-08T09Z contexts use original
source renderer/CSS/fonts and normal viewport-clamped integer clips, concurrent
finite animation settlement, ordinary layout/two RAF and neutral pointer.
Scrolled Workspace is actual left850/top250; Project is actual left850/top1
(clamped by short dataset), not vertical250.
Strict threshold0/includeAAtrue/maxDiffPixels0/masks[] gives48zero/repeat0.
[Freeze](evidence/WU-15/review.json) rehashes96copied PNGs and recompares48pairs.

Default/group/scroll/zoom task dates/positions/IDs and original source files are
immutable. Source receives the same canonical manual-query input; equal-date
reverse ordinal is preserved in production geometry, not prepared by fixture
position swaps. Explicit symmetric collision/empty/undated/milestones-only/
outside-range scenarios are declared in report provenance. Outside-range input
is corrected only for API §6.3 overlap, with raw source capture in a separate
fresh context. Source native tests use actual #app; feature comparisons explicitly
compose original template sections and never claim hidden hosts auto-rerender.
The earlier wrong target tie-order14982 PNG pair/report stays diagnostics; an
unarchived44pixel exploratory attempt has no old artifact/hash claim. Proposed
position-slot mutation was automatically rejected and never executed. No paint,
font, clock, remount, tolerance, mask or baseline workaround is accepted.

Original173Darwin reference/fixtures/fonts/lock are unchanged. This supplement
is technical Linux evidence, not user approval, full Darwin or physical-device
parity. WU14 desktop whole-content search-corner context-variable0/5 remains
EXTRA UNACCEPTED; its641/MyTasks390 mode pointer overlap remains a native source
limitation. WU13 extra List Date558/8814 and WU10 mobile17/14 remain unproved.
Timeline renderer acceptance does not erase or repair those debts.

Root supplemental trusted source zoom observation: Week900/180 -> first
Months489/0 -> set Months450/72 -> Weeks0/0 -> Months0/0. Source data-keep keeps
only same-render matching keys; tlInit prevents reinitialization on return.
Target per-zoom UI scroll continuity is an explicit contract interpretation,
not source behavior parity. Existing native target asserts Week900/180 restore
after Months450/72 setup; no subsequent Months restore assertion is invented.
[Reviewer observation](evidence/WU-15/root-source-zoom-observation.json) retains
actual result/provenance; frozen renderer PNGs and runtime are unchanged.

## WU-16 actual Project consumers

Project feature CSS owns structural grid/table borders, responsive Catalogue/
Overview/Templates, overflow-avatar slot integration, and original finite route/
tab/progress/bar/Card motion. `useProjectMotion` tracks genuine navigation and
canonical content revisions, preserves finished one-shot CSS until a subsequent
source-equivalent update, and never replays on identical Query reads or toasts.
Reduced preference uses the source fade entry and suppresses progress/lift. The
shared scale-based Progress fill is unchanged (source helpers --p plus scaleX);
no width-based fill conversion is used. Dark ProjectIcon uses source --pc mix.

Dialog has an optional controlled `entryRevision`: Project consumers preserve
finite first entrance through text-only drafting, consume it on source-rendering
actions/errors, and reopen a new node once. Shared defaults still consume at
animation end. Default overlay/Choices regression and native lifecycle/motion
checks are kept under WU16-specific evidence paths. Source mobile nav/firstmodal
z70/z61 usability correction closes only navigation for Project overlays and
returns focus to a visible opener. Project nav resets after genuine router
restoration/path changes and saved-dialog lifecycle; global router is unchanged.

Catalogue private p6 defaults across3layouts and p1 Overview newest-first Recent
are raw correction contexts, not strict pixel acceptance. Raw Recent panels are
actually scrolled into view on desktop/mobile, with source first-six IDs and
target canonical latest-six/rendered IDs/times/hash paths preserved; viewport
mobile whole-content crops do not show the feed and are not evidence of its
record replacement. Counts include residual raster until independently proved.

The source first capture initially had a redundant render after go and a blank
header in earlier List captures. The current capture configures initial route
then calls original go once, uses actual native UI actions and source-self repeats.
Historical blank-header rendering cause was not independently reproduced; it is
a capture failure, not a claimed source UI design. No source force-paint/reset,
style/template/fixture/baseline/font/clock/tolerance/mask edits are used.

Files route/header slot is PR-07 pending WU22; Content/dialog scope does not accept
full AppShell, all8tab bodies,173Darwin or physical-device/user review. Inherited
WU10mobile17/14, WU13ListDate558/8814, WU14wholeDesktop0/5 and pointer-overlap
641/MyTasks390 debts remain unproved/unaccepted.

The primary native consumer sequences are recorded in each image row. Catalogue
uses layout selection → Website search identically in both applications. Mobile
Project Table uses Overview → Header Table. The earlier search → layout Input
11-pixel residue and direct-first-entry mobile Table 33-pixel residue are frozen
with original images, geometry and hashes in `unaccepted-input-order.json` and
`unaccepted-direct-table.json`; both remain **UNPROVED_UNACCEPTED** for WU-29.
They are separate from the authorized privacy/newest-first corrections.

Project create/edit image states exercise ordinary template/icon/color choices:
Create Website → Rocket → Blue and Edit Target → Violet, after both original
finite modal entrances settle. Early actions during entrance produced a 37,529
pixel/scroll failure; this failed attempt remains in diagnostics. Default initial
modal pairs were frozen before this scope change in
`unaccepted-default-forms.json` (16 PNGs); their raster differences are not accepted
as default parity. Meaningful native interactions do not remove those debts.

`DialogBody` has a typed optional `as="form"` composition; the default div remains
unchanged. Project and saved-view forms use direct scroll/flex bodies, native
Enter/form association and controlled disabled fields. Project Ctrl/Cmd+Enter
also submits the draft once; pending submissions preserve the atomic lock. The
source first-focus name/invite controls are explicit `initialFocus` refs. A typed
Project status-menu intent consumes the same owned one-shot page entry as the
source Header/Details popover opening. There is no global render/message bus or
keyed remount. The owned focus/blur and Close/Template transitions retain source
CSS default `ease`, distinct from the route easing token.

Diagnostics compare original Source and Target full computed CSS, fractional
rectangles, actual scroll/focus, and ancestor finite animations. Identical computed
styles alone do not prove raster parity. The Save info icon uses role=status on
Target; the earlier role=alert diagnostic omitted it and does not substantiate an
SVG equality claim. The later correct-role measurement includes both alert and
SVG rectangles/properties. Project picker SVGs are block in both applications;
no speculative inline-flex override was applied. Earlier normal-avatar static
hypothesis was reverted after measuring the source after-render tooltip upgrade.

### WU-16 owned modal completion and confirmation composition

Source `overlays/drawer.js` applies the same finite first-entry flag to content and scrim. Optional controlled `Dialog.entryRevision` now retains both completed animations on the first DOM node/text draft and consumes both on an actual owned revision. The undefined generic default still consumes each entrance on animation end. Project/Saved forms use typed direct `DialogBody as="form"`; Enter/CtrlEnter, pending disabled fields, and bounded command guards remain active. Source heading helper always groups the h2; explicit empty `DialogHeader.description` groups the Project edit/share/rename heading without adding an empty subtitle, while an omitted description preserves the generic default DOM.

Project confirmation is a separate Source consumer: no modal-h, body padding-top18/gap10, 34px colored type icon, body h2, Archive Cancel focus and Delete typed-name focus. Typed-name input only changes the disabled condition and does not consume first-entry content/scrim. Error changes do consume the owned revision. Delete text states the bounded Undo offered by the actual contract; Source's "can't be undone" text contradicts its own Undo action and is retained as a documented source discrepancy.

The native Project name row measurement found equal rectangles but different immediate flex ownership: Source icon is grid/shrink0/margin-top22; Target had a block/shrink1 wrapper around the shared icon. Optional ProjectIcon.className now puts the owned margin directly on the shared root. This fixes the consumer composition without altering other icon consumers or claiming it explains a raster difference. Diagnostic before/after paths are in WU-16 evidence.

WU-16 current combined matrix is40/45 strict zero with all repeats0, not a pass.
Five configured form pairs remain UNPROVED_UNACCEPTED and hash-frozen in
`evidence/WU-16/unaccepted-gates-eighth-forms.json`; old input-order11,
direct-table33, default/configured form and post-create saved workflow debts are
retained separately for WU-29. Failed validation/draft and allowed-p2 consumer
inspections are not promoted. No causal claim follows solely from equal full
computed CSS/rectangles, and no additional capture context is used to find zero.
The canonical parent overlay correction has native evidence, but does not
establish passing visual forms or permit tolerance/baseline/source changes.

A later combined WU-16 execution failed at37/45zero/all repeats0. Latest
CatalogueList/Table39010, Timeline144015, Create192/77, Edit135/24 and
Share14402 are retained in `evidence/WU-16/unaccepted-gates-twelfth.json` (16PNGs).
Save0/0 and prior zeros do not substitute for current required failures. Five
cross-run changes preserve Source hashes/sample inputs/clips while Target hashes
change; this remains a diagnostic observation without a proven pixel cause.

WU-16 bounded5×3 audit demonstrates Target PNG variability under unchanged380 code/build hashes and equal served JS/CSS/fonts, with stable Source and same-context repeats. Passive chronology shows only an association between font events and the15px Timeline failure; final layer topology is equal, and the subsequent USEDface trace has no failing case. These diagnostics are not acceptance. The demonstrated Source warm-Home versus Target cold-link setup mismatch is corrected systemically by symmetric app-ready native Sidebar→Header consumer navigation. The full prior45+5raw matrix/100PNG remains frozen in `evidence/WU-16/unaccepted-cold-setup.json`; cold deep-link functionality is verified separately. All earlier debts remain UNPROVED_UNACCEPTED for WU29.

WU16 current evidence supersedes earlier historical pipeline summaries: gates19
executed19 commands with actual exit0, then visual20 exited1 (30/45 strict zero,
all repeats0); final21–23 did not run. `unaccepted-gates-nineteenth.json` retains
15 failed pairs/30 PNGs. The new shared AvatarStack controlled render slot has
12 default Display image pairs/16 native probes passing actual exit0; defaults
have unchanged rendered DOM/style. Source-equivalent member tooltip and
Favorites drawer entry consumption are verified in `diagnostics/owner-motion.json`;
stack bounds/overlap/+4 and front Options hit remain unchanged. Source Team/date
row now uses its original center alignment. After these production changes the
mandatory pipeline has24 gates (added Display regression), and still requires a
fresh complete passing run and independent technical inspection before DONE.

`diagnostics/owned-readiness-archive.json` is a negative observation: exact List390
and Create1440 were complete with loaded fonts at observed owned animation
start/end; no readiness gate or extra wait is added.
`diagnostics/modal-paint-archive.json` records unchanged modal/wrap/host/form boxes
and the inherited hidden live-region overflow: Source document1001px/live box
y1000+1, Target document1000px/live box y999+1 with margin−1. Both scrollY0.
Different painted layers do not establish pixel causality or a visible defect;
no live-region/Portal/layer/+1px change is made. Diagnostic failures are retained,
not promoted to strict acceptance.

A later actual failed Task Detail trace established disabled-input focus before
re-enable. The production reset now requests current-generation focus after an
enabled React commit, cancels on close/new generation/unmount and preserves
Start-new-draft/Create-more/busy/frozen identity. Task Detail12 passed afterward;
earlier passing traces alone had not proved or fixed that race.

WU16 latest pre-repair gates21:20 commands exit0, visual21 exit1,33/45 strict
zero/all repeats0; final22–24 did not run. `unaccepted-gates-twenty-first.json`
retains12pairs/24PNG. Later initial-document Target-only live margin−1→0 proved a
real-consumer effect with unchanged owned CSS/rects, Source/served/build hashes,
actions and clips: root1000→1001 gives original FixedPosition modal/scrim layers
and removes164 Create differences (192→28/no new/repeats0). The four frozen PNGs
and full snapshot comparison are in `evidence/WU-16/diagnostics/root-overflow-summary.json`.
This does not accept28remaining or other consumer states. The direct prerequisite
repair restores only specific Source-owned AppShell `#sr-live` margin0; global
sr-only semantics/defaults, explicit root-height styles, Portal and GPU/layer controls are not rewritten.
The earlier no-live-edit decision preceded this real-consumer proof. Fresh24
mandatory gates and independent technical review remain required.

WU16 bounded partial-raster investigation remains diagnostic only. Exact Create1440
with Source-faithful margin0 has equal477 paint commands and byte-identical
offscreen scale1 replay, but default live capture differs28 pixels. Final cc
tile geometry/scales/translation match; recorded partial-raster histories differ.
The explicitly authorized matched `--disable-partial-raster` browser profile
applied to both apps yields live0/repeat0 while changing Source13 and Target41
pixels from default, with equal served assets, full owned CSS/geometry and clips.
[Profile summary](evidence/WU-16/diagnostics/partial-raster-summary.json) freezes
the four images, actual command exit1 and effective browser arguments. This is
evidence of browser-profile dependence for one consumer, not primary acceptance
or a Source baseline/browser-default change. No product paint/layer workaround
is justified; default45 mandatory contexts remain the acceptance gate.

A later separate full-raster supplement keeps the same45 strict workflows/5raw,
Source AND Target flag, assets/clock/fonts/clip/zero-threshold policy. It produced
44/45zero (Share1440 Close2 remains) and14 Source hash changes versus default22.
Its100 frozen images and failed report remain in
`evidence/WU-16/diagnostics/full-raster-linux-summary.json`; no profile adoption
or default-browser acceptance follows. Ineffective ZeroCopy and negative
single-worker diagnostics are separately retained with their actual limits.

Share first-DOM chronology then proved a product read-ownership omission: Source
first7 members/591px, Target first0/283px then7/591px. Bootstrap display identities
now provide permitted pending labels; no email/role is invented and Invite/Enter
requires complete canonical membership catalogue plus demo capability. An initial
projection revision correctly consumed real changed content, yielding different
final layers/live28; that unaccepted after bundle remains separate. Shared Share
queries now start at Header/menu exposure and Dialog consumes the same cache,
without await-opener/extra readiness/remount or removing async projection fields.
Named after probe records first7/591/Inviteenabled on both, matching640×671 layers,
first49 paint commands, replay bytes and live0/repeat0. It is a one-consumer
diagnostic, not an automatic mandatory gate or profile decision. Native28 proves
normal finite entry/search consumption plus cold held-read identity/Invite/Enter
guards and draft preservation.

Root authorized one fresh24-gate `--full-raster-linux-candidate` packet following
that meaningful dependency repair. Normal core/native/affected gates run unchanged;
exact45+5 visual uses the named matched full-raster profile. Commands/report/100PNG
and review paths are separate from default22 and earlier44/45 supplement. Candidate
status remains AwaitingRootRuntimeScopeReview; independent technical/runtime-scope
acceptance is required before any DONE/commit/push. No original173Darwin baseline,
Source templates/styles/fixture/font bytes, threshold, AA policy or masks change.

Root final technical PASS explicitly adopts the named matched Source+Target
Chromium145 Linux `--disable-partial-raster` profile FOR WU16 managed content/dialog
acceptance, after real-consumer partial-raster proof, source-faithful Share read
ownership and fresh24/24 actual commands plus45/45 strictzero/5raw evidence. Root
independently checked100PNG hashes/50pixel counts,381assets/four immutable inputs,
exact actions/clips/navigation and14 Source profile deltas, and viewed nine Source
images. Qualified review/verification metadata records the decision; capture report,
PNG bytes and default/old supplement bundles are unchanged. This supersedes the
earlier pending-profile decision only in that explicit scope. Default31/45 and old
full44/45 remain UNPROVED_UNACCEPTED, as do all inherited/input-order/direct/default
modal/configured/workflow debts for WU29. No default/Darwin173/fullshell/physical
or userapproval parity, new baseline, Source/template/fixture/font modification,
tolerance/mask change or product paint workaround is claimed. Files PR07body22
remains excluded.

## WU-17 dashboard verification ownership

Home and Workspace Overview own the source1160px centered page wrapper and1.55fr/1fr grid with inclusive1100px stack boundary. Static geometry uses Tailwind; `features/dashboards/dashboards.css` owns sibling separators and source finite panel/stat/chart entry selectors. Existing Project motion ownership is reused; tabs/data updates consume first-entry effects without replaying headline counts. Count-up uses source520ms cubic clock/raw easing and reduced policy separately, including StrictMode cleanup.

The WU17 matrix uses named matched Source+Target Chromium145 Linux `--disable-partial-raster`, content clips only, threshold0/includeAAtrue/masks[]. Both boot Home, finish existing readiness and use actual native navigation: Projects→Home for Home entry, Home→Overview for Overview. Source preference setup otherwise consumed its initial Home effect while Target retained it; asymmetric cold attempts remain unaccepted. Both sides use two snapshot warmups from the established harness, with no additional paint/font/clock interventions. Separate named mobile panels cover below-fold activity/status/workload/milestones. Runtime-scope acceptance remains pending independent root review, not automatic WU16 acceptance.

Count-up tests passively observe production/development entry, tab non-replay, Completed→Overview→Home retention and reduced behavior. Target `data-countup-start` exposes its existing start; actual start→ready must reach520ms. Zero→ready is reported independently because a development commit may lag the clock; no timing/effect/paint change satisfies an observer-relative floor. Historical failed attempts and original Target bytes missing from the first smoke archive remain explicit.

WU17 bounded layout diagnostics distinguish Source inclusive1100 media from Tailwind exclusive max shorthand; pages use the existing source-wide/tablet/mobile variants. Dashboard PanelHeader className slots own source mobile wrap+nowrap headings, leaving shared defaults unchanged. Passive leaves-before records source flex1/basis0%/minwidth0 versus grow-only; shared TaskMiniRow title and dashboard status/workload/milestone flexible leaves now use source flex sizing. First complete17/26zero matrix and all52 original PNGs stay frozen unaccepted separately.

WU17 root technical PASS adopts the named matched BOTH Source+Target Chromium145 Linux `--disable-partial-raster` profile only for the26 Home/WorkspaceOverview content pairs plus6 affected Favorites/ProjectOverviewp2 mini-row pairs. Executed reports and64PNG remain byte unchanged; no default/Darwin/fullshell/fullproject/device/user acceptance. All historical raster debts and missing failed-attempt bytes remain explicit in WU17/29 evidence.

## WU-18 qualified scope (root technical PASS)

The actual aggregate in `evidence/WU-18/visual-verification.json` maps45 qualified pairs and180 original/actual-repeat PNGs to their executed reports:34 original-fixture non-Activity pairs from matrix-04 plus11 explicit follow-up pairs (9 Activity including dark,2 affected Project feeds). All strict changed/repeat pixels are independently recomputed as0, with identical408 implementation/build inputs at the archived pre-feedback revision and four immutable Source inputs. Named matched BOTH Source+Target Chromium145 Linux `--disable-partial-raster` applies only to these content/overlay boxes. Root explicitly adopts this named scope/profile; no default/Darwin/fullshell/device/user approval is claimed.

Activity uses the separately named canonical-order layout scope: local Source fixture copy sorted timestampDESC then canonical activity UUIDDESC, unchanged record multiset/verbs/dates/content/privacy. Original activity hash `11d9837343e6c5f6f0ce57d2ad44611e013566fa8f5baaa73c106c9bc0f6e2d1`; canonical-order activity hash `d38e9d6560c402b8fffaa9ccc99312446459de9bdf3f6e63229c718e00acf2bb`. Source files and the immutable fixture remain untouched. Matrix-04 was actually invoked without --canonical-activity: raw desktopall12774/mobileall364/darkall12722 differences remain unaccepted chronology correction evidence and WU-29 debt. That executed report stays failed, with175 PNG including raw/repeats/diffs; final aggregate never relabels it as passed. Source Project Activity itself sorts its combined events/comments, so its two follow-up captures use the original fixture.

Source-faithful owner repairs are bounded: real Input/category/Activity filter callbacks consume entry through existing typed projectSurfaceOpened, including same-value actions and actions before entry finishes. SearchPage category scroll resets on genuine query/category actions because Source rerenders the category row with scroll0; shared Tabs defaults stay untouched. Source mark styling, headings and Palette hidden subtitle/key typography are owned by Search. Palette alone uses90/89 stacking over mobile sidebar70. Shortcuts retains finished native modalIn through existing entryRevision; Search supplies optional FilePreview entryRevision and real Copy consumes it. Default Dialog/drawer and other FilePreview consumers retain their previous props/geometry/lifecycle. OverlayProvider still owns nested Escape/focus. Existing notice default2200/Undo5000 timing remains, while dark command closes Palette and requests Source info1800ms. Before/after leaf/rect/animation/stack reports and all failed captures are frozen.

Matrix Source fontRequests are intercepted external requests; Target=[] is an instrumentation gap, not proof of45 served Target font sets. The separate font-network01 actual gate0 records two200 WOFF responses on each side with byte-equal locked hashes and four loaded-face specs; this closes the bounded collector gap without claiming45 served Target font sets. Manifest font files retain locked byte hashes. No screenshot rerun solely for this collector gap is needed. All inherited WU10/13/14/15/16/17 debts and missing historical bytes remain unchanged WU-29 obligations.


WU18 feedback revisions retain both prior build archives (228 files each) and exact callback deltas. The first correction supplied Source rejectedCopy info6000/manual canonical URL; its two FilePreview pairs/8PNG/strict pixels0 are independently validated despite unknown capture-shell completion after runtime restart. The final successCopy callback explicitly requests Source4200, retaining generic notice2200 and Undo5000 defaults; file-copy-success01 actualcapture0 supplies new2/8PNG exact0 and source-copy-feedback02 actual0 proves real granted success4200 on both sides; Native09 additionally checks inherited generic2200/Undo5000 and actualUndorestore. Root technical PASS explicitly accepts this bounded bridge. The45 aggregate remains tied to its archived original build, with each bounded bridge separately named; no408-new-equals-old claim.


Root WU18 technical PASS adopts only the named archived45 plus separately captured rejectedCopy2/successCopy2 callback bridges, with original fixture Activity-order correction explicit. Executed reports and all frozen1356files/819PNG remain byte unchanged. Root verified full worktree/index archive SHA, code/data/commands/default consumers and source/font provenance; exact six generated-evidence whitespace exceptions preserve archived emitted bytes, leaving code/docs checks active. Inherited WU29 limitations and future integration owners remain; no broader visual/runtime/project acceptance follows from this PASS.


### WU-19 notifications structure and qualified capture scope

Inbox rail is 420px; only its list scrollbar is visually hidden like Source. Category tabs use Source 16px gap, scoped padding/underline. Notifications keeps its own max820px page, segmented filter and day panels/dividers. Tailwind handles static layout; feature CSS only owns tab pseudo-element geometry, list scrollbar, row sibling dividers and the exact inclusive `@media (max-width:900px)` fullscreen preview (z48). Default Drawer/overlay ownership is unchanged.

Current WU19 captures use original locked Source records and native actions, with both browsers under Chromium145 Linux `--disable-partial-raster`; threshold0, includeAAtrue, maxDiffPixels0 and no masks. Every original/repeat image, failed report/log/executed harness is frozen at a unique attempt path. This named content/preview evaluation still awaits root adoption; it does not replace the original173 Darwin baseline or prior failures.


Inbox's local tab counts follow the currently derived category/unread list, matching Source's late-bound count closure. Source rebuilds the tab bar on render and resets horizontal scroll; Target's Inbox owns a Tabs ref/layout reset on category/unread/record revision. This follows the existing Search pattern without changing shared Tabs or notification rail scroll. The accepted candidate will explicitly combine27prior unchanged pairs,7category-count bridge pairs and1current mobile Updates pair with exact production/build provenance. Full matrix02 remains an actual failed attempt, never relabeled as a successful current35 capture.


Supplemental actual default Drawer Composer+Avatar wholecomponent captures at1440/390 remain unaccepted59/13 rounded-border pixels, repeat0. Geometry and textarea41px/mdAvatar26px/placeholder/mention/attachment are exact; default composer code branches/classes and all prior Avatar consumers remain unchanged. This new observed border difference is assigned toWU29 without claiming historical inheritance or2strict defaultpairs. Failed post-scroll pipeline/8rawPNG remain frozen. Primary35 qualified aggregate and105strict comparisons are separate.


### WU-20 people content and explicit contract differences (ROOT TECHNICAL PASS)

People-owned `people.css` covers Source permission table and the member profile nested stack animation; static layout stays literal Tailwind with Source inclusive1100/900/560 breakpoints and min880px member table overflow. Shared filled route motion is composed through the existing `useProjectMotion`. Search wrapper now follows actual Source flex/align-center/absolute-left9px icon rather than a translated icon layer. Source measured icon rect/color were identical but the old translated layer emitted61 changed pixels; raw34-pair matrix01 remains frozen.

Geometry01 proves both menus use4px anchor gap. Source stores an early +8px riseIn anchor before render clears the transform; Target repositions after render. Settled comparisons wait finite page animations before native actions; original immediate matrix01/rects remain explicit Source timing quirk. No early-anchor behavior identity or shared Menu offset change is claimed.

Source raw directory counts include private p6 for Marcus/Lena. Qualified capture filters only the unreadable p6 project, its t49 task dependency and p6 order entry, with original remaining fields and immutable template/styles/assets; raw original comparisons stay retained. Invite/remove Source prose claims email delivery/account removal/task unassignment; Target truthful demo prose differs. Raw unmasked whole-dialog/viewport PNGs/diffs remain diagnostics, never claimed zero. Naturally bounded form/menu/footer controls and actual native validation/error/Undo plus measured geometry are reviewed separately, with no masks/tolerance relaxation or Source text/template/style edits.

Only matched BOTH Source+Target Chromium145 Linux `--disable-partial-raster` is explicitly adopted by root for ONLY the36 WU20 defined content/control scopes in the24+9+3 bounded aggregate. No default/Darwin/fullshell/device/user/fullproject/backend/D1/R2 acceptance follows. Existing WU10/13/14/15/16/17/18 debts and WU19 newly observed default Composer59/13 remain unaccepted for WU29.


WU20 current bounded aggregate maps24 archived content/profile/matrix/status pairs (`qualified-02`),9 archived settled menu/form-body/footer pairs (`overlays-01`) and3 current error-form/mobileInvited menu-control pairs (`errors-01`). All36 unique scopes/144 original-repeat PNG/108 independently recomputed strict comparisons are0 with identical owned position and size. Two exact450-file predecessor archives expose the four people-file overlay-only transition and the later Invite validation-focus-only transition; current450 implementation/build hashes are checked. Each selected pair proves Source/Target two actual200 woff bytes and four loaded faces. This is an explicit bounded aggregate, not a new full36 capture.

People-only `.people-menu.ui-popover` retains the existing finite `ui-pop-in` animation with fillboth after shared data-entered changes; shared/default overlay selectors remain unchanged. Actual Source popIn/current ui-pop-in have the same160ms/easing/fill/keyframes, while both Source/Target reduced mode retain fadeOnly120ms. Motion01's null pending startTime caused a failed observer assertion; all six samples and failed exit are preserved. Motion02 waits for the timeline assignment and proves the same start across entry completion, including reduced mode. No raster cause is inferred solely from identical SVG geometry.

Mobile invited **whole popup remains unaccepted11 pixels** at its rounded top-left underlay, stored in `overlays-01` with repeats0 and identical159.03125/535.109375/203x197 bbox. Native Source rerender resets table horizontal scroll to0 (first TDx17); Target preserves actual524 (first TDx-507). Current acceptance candidate is only the naturally bounded first-to-last menu action controls, with identical Source/Target position/size and strict0/repeats0; no mask, corner/whitespace adjustment or whole-popup adoption. This policy difference stays explicit WU29 debt. Source immediate+8 early-anchor quirk and unchanged corrected-prose whole-overlay differences also remain excluded. Raw34 original full comparisons, later full popup/viewport diagnostics and all failed bytes remain frozen.

### WU-21 Teams ownership and canonical contract differences (ROOT TECHNICAL PASS)

TeamGrid/Card/Identity/Form/Detail are owned by features/teams and reused in Teams directory, Members Teams tab and sidebar intents; Settings WU24 integration remains pending. Shared UI AppearanceFields owns identical Project/Team icon/color controls. TeamIconSchema includes Source NewTeam default users separately from unchanged project picker/catalog. TeamDetail composes existing TaskMiniRow, MemberIdentity and CompactProjectRow; only teamDetail row props select Source38px/14px glyph/120px progress/no percent label.

Source measured inclusive media boundaries are1100 (two-column layout),900 (shell),640 (mobile);560 is modal max-width, not a global media breakpoint. Capture checks actual1100/1101,900/901,640/641 and560/561. Teams static layout uses literal Tailwind; owned teams.css contains Source nested finite400ms/90ms rise and FullNotFound360ms rise. Actual motion03 compares Source/Target system, UI-Reduce and OS-Reduce: Source UI-Reduce omits nested/fullstate selectors, retaining those rises, while OS-Reduce fades every nested owner/fullstate120ms. Owned selectors retain that Source distinction without changing shared defaults.

Avatar diagnostic02 records identical colors/26px geometry but Source Members avatars static versus Target relative, causing an extra Target30x30 overlap compositing layer. Only TeamDetail Members passes static! to existing MemberIdentity; TaskMiniRow/shared AvatarBase defaults remain unchanged. Four affected Engineering/Design desktop/mobile captures then achieve strict0/repeats0 with equal actual absolute boxes.

Original raw28 comparisons retain Source private-p6 project counts/content. Canonical TeamSummary/Bootstrap UI protects inaccessible projects/tasks/counts; qualifying harness removes only p6, dependent t49 and p6 order record, leaving templates/styles/remaining fields untouched. Original Source confirmation count prose differs from truthful associated-project prose; unmasked whole-dialog diagnostics remain retained. Qualified confirmation scope is only native Cancel-to-Delete action-control bounds, including absolute position+size. Prior whole desktop footer15 pixels remain unaccepted WU29; no corner/mask/tolerance or whole-footer parity claim.

ROOT TECHNICAL PASS adopts only matched BOTH Source/Target Linux Chromium145 --disable-partial-raster, fixed original clock/en-US/UTC/DPR1/MacIntel/seed. Explicit bounded aggregate selects24 unchanged archived qualified02 directory/form/empty/deleted/control scopes,4 current affected detail scopes and8 current boundaries, with exact old464 source/build bytes and only two owned production-file changes. Qualified02 remains FAILED27zero/onepixel; qualified01 remains FAILED with live type-only export change during capture. No fresh full36, default/Darwin/fullshell/device/user/fullproject/backend claim. All historical WU10–20 default/raster/missing-byte debts and WU29 obligations remain unaccepted.

### WU-22 Files ownership and bounded ROOT TECHNICAL PASS

Files uses the existing FileTypeIcon/FilePreviewArt/AttachmentCard/Dropzone/UploadProgress/FilePreviewDialog, with one exported unchanged eight-type metadata map. Catalogue layout is literal Tailwind; files.css retains the original artwork/table descendants and owns only the native Source file-menu completed finite popIn effect (.16s/var(--ease)/both). Source inclusive900 header inset uses the Files-only ProjectHeader prop and literal source-tablet:pt-4; other header branches retain their old class. Shared Dialog and standalone TaskOverlayHost PreviewController stay unchanged.

Canonical file identity closes the Source filename-delete bug: rename/type, duplicate/newID, delete/remove and Undo address ID and synchronize linked task counts/Drawer/catalogue. The guard validates active actor, workspace, authorized active project, and an existing same-workspace/project active linked task. File-only queue persistence occurs before memory commit. Search/Palette/Drawer/catalogue use the same file URL owner; fileId-only navigation preserves the same Files query/mode/type/sort and both scroll axes. Direct-entry Close removes fileId by replacement.

Native Source Copy render removes the normal finite preview entrance; its unconditional reduced fade replays after Copy. Only FileOverlayHost replays the measured120ms opacity0→1 effect (effect timinglinear/frameease/fillnone) through the existing preview section ref. The DOM/focus stay in place; shared/default Dialog motion stays unchanged. Final motion qualification must use locked Source fixture and offline fonts: earlier motion01–04/copy-diagnostic01 accidentally passed Source offlineFonts=false/base5173, so their original execution status is retained but their unlocked-font/uninjected-fixture scope is unaccepted.

The explicit visual candidate selects unchanged archived scopes from failed matrix02, separately executed affected upload/menu/current-preview scopes, current inclusive900/901/640/641 boundaries, and original Source attachment component isolation. Every adopted comparison requires threshold0/includeAAtrue/maxDiffPixels0/masks[], exact absolute float boxes/clips, repeat0, four actual PNG hashes and locked font requests/loaded faces. The selection/provenance is executable in the WU22 closure packet; no failed report is relabeled. Static default42 zero fill is an inherited --p omission, not positive-progress acceptance; actual production Drawer/Form use default0. Old WU10 mobile and all WU10–21 debts remain unaccepted for WU29. Raw whole upload contexts differ because Target adds honest Cancel and are excluded explicitly. No default/Darwin/fullshell/physical-device/user/fullproject/backend/HTTP byte/R2 acceptance follows from this candidate.

ROOT TECHNICAL PASS adopts the explicit58/174 strict0 selection in closure02, with current motion05six/15 phases and13 exact default AST proofs. Source/Target visual116/116 woff2 and motion12/12 woff2 are independently verified, each pair loads four faces. Source25 fresh images were inspected separately from four historical images. HTTP169 preserves exact pre-copy588 provenance; later optional ref/copy-only correction is bounded by currentfig2/nativeN2/defaultref-omittedAST/motion6. This pass does not accept old default/mobile/Darwin/fullshell/whole-upload/static-positive/lost-byte debts.


### WU-23 Settings ownership and bounded ROOT TECHNICAL PASS

SettingsLayout/SectionHeading/SettingsBlock/SettingRow and the seven General/Personal sections use literal Source geometry through current primitives. Whole natural Settings content, native select popups and workspace confirmation are bounded comparison scopes. Source is immutable, with the original clock/en-US/UTC/DPR1/MacIntel/seed and BOTH Linux Chromium145 --disable-partial-raster; threshold0/includeAAtrue/maxDiffPixels0/masks[], absolute float geometry/clips and both-side repeats are required. No default raster/Darwin/fullshell/device/user/fullproject/backend claim follows.

Original smoke01 eleven selector/timezone differences and matrix01 six profile-name/icon-color failures retain their failed statuses and frozen predecessor bytes. Original Source blank-name reset is not accepted; only cloned prefs.name is projected to empty for AC2 retained-draft comparison, leaving current member/avatar/title unchanged. The timezone first-option display is a Source browser-observable projection without canonical mutation. Source confirmation icon uses measured13% red mix. Fresh matrix03(44)+boundaries02(4) qualify current692 actual Source/mock/HTTP assets:48 pairs/144 strict0/192 PNG hashes and equal natural absolute float boxes/clips. Closure01 independently rechecks those bytes/comparisons and freezes. ROOT TECHNICAL PASS adopts only this explicit48-pair scope and final stable index04; immutable candidate/proofs remain unchanged.

Native canonical persistence/error-draft/retry/reload and bounded intercepted production HTTP are separate functional evidence. Motion02 compares Source normal/reduce timing/computed phases and actual native scroll/keyboard/date effects; its23 PNGs are diagnostics, not intermediate pixel parity. Explicit full under OS reduce is Target-only QUIRK-03 correction. Defaults02 compares13 archived-WU22/current Target default cases (52PNG) and exact known guard replacements; this does not adopt Source default raster or inherited static42 positive-upload behavior. Earlier raw scroll/native/default/harness failures, partial-record gaps and all WU10–22/WU29 debts remain unaccepted.

The original index01 diagnostic cached-check output1570974 bytes was captured but not persisted; no original stdout/stderr SHA is claimed. Fresh check02 is a separate execution. This explicit missing-byte gap remains unaccepted and carried to WU29 alongside inherited debts; current staged byte/whitespace proofs do not relabel it recovered.

ROOT TECHNICAL PASS independently verified48/144strict0/192PNG/current692/absolute geometry and stable15682 staged blobs including four emitted proof files. Nine fresh Source images were inspected. Native8+shortcut1, scopedHTTP7, motion8 and archived-Target default13+7 exact proofs close only their stated scopes. All failed statuses, original missing-byte/partial-record gaps and inherited WU29 debts remain unaccepted; this pass does not expand to default/Darwin/fullshell/device/user/project/real backend.

### WU-24 bounded Settings evidence (ROOT TECHNICAL PASS)

Archived matrix02+minimal02 cover34 explicit natural Settings regions: all8 sections at1440/390 widths,14 notification toggles off, permission demo states, archived project/default-tab menu, Teams empty and canonical principal-only empty dataset.102 strict comparisons0,136 PNG exactSHA, equal natural ABSfloat boxes/integer clips and both repeats0; threshold0/includeAAtrue/maxDiffPixels0/no masks. Actual136 Source/Target woff responses200 use locked active font SHAs; four loaded faces per68 contexts. The mobile region includes the fixed footer only where it intersects that natural owned box; this is not full-shell parity.

Four TeamGrid cases transparently project ONLY cloned Source projOrder7→6 by omitting inaccessible p6, preserving all p6 records, to match WU21 canonical privacy counting. Teams-empty additionally sets Source teams=[]; canonical Target clears dangling member/project teamId. Principal-only Source.members plus notifs=[] matches the Target authenticated empty dataset projection; zero canonical principals would violate session invariants. Frozen original smoke01 Teams399/Members41790/37265 and minimal01 mobile49 unread-dot failures stay failed; no original Source whole-project acceptance is claimed.

The final production bridge changes only shared ProjectOverlayHost canonical confirmation name/fetching guard and generated JS/HTML imports. All captured Settings render/data/contracts/Source/CSS bytes remain exact. Current HTTP renamed-record probe and current seven gates qualify the affected dialog; archived pixel bytes are not relabeled as fresh current captures. Scroll01 has16 paired native keyboard cases in four contexts/32 diagnosticPNG and loaded-font evidence, without diagnostic pixel-parity claim. Native9/interceptedHTTP7+1 remain functional scopes only. Every older raw failure/missing-byte/default/raster/mobile/Darwin/fullshell/privacy/positive-upload/WU29 debt remains unaccepted.

WU24 root independently accepted the explicit scopes above. Original whole http02/http03 wrapper freezes remainFAILED/unaccepted/debt29; exact48-byte frozen prefixes within final284-byte wrappers are qualified separately. All capture/report/childraw/PNG/archive bytes and original candidate are retained.


### WU-25 bounded Security/Billing evidence (ROOT TECHNICAL PASS)

Six Source sections and explicit states use Source originals and deterministic isolated Target demo scenarios. Qualified executions comprise66 archived pairs plus6 current password base/success/loading pairs; unique selection replaces old4 base/success and chooses62 archived+6current=68 variants. Source/Target whole natural Settings or confirmation regions, exact ABSfloat geometry and clips, threshold0/includeAAtrue/maxDiffPixels0/no masks, both repeats0 and both actual-origin woff200 active hashes/four loaded faces are required. Source fixture projection is only ordinary light/dark prefs plus explicitly recorded current-only sessions, tfa=true or Free/Business fields; all other records and Source code/styles unchanged. Actual locked seed804205 is retained (handoff904205 was incorrect).

The exact archived→current bridge affects only PasswordSettings pending input availability and22 generated JS/import/HTML paths; unchanged facade/shared UI/other Settings/Source/emitted CSS bytes preserve the older qualified scopes. Current password loading holds its actual800ms handler at40ms after bootstrap, a documented browser-clock projection without motion claim. Current captures and native/HTTP unavailable assertions qualify the changed branch. Mobile plan natural scroll/card clipping and invoice horizontal overflow follow Source. Source plan header always keeps$12/month despite changed plan, documented quirk; payment is information-only, invoices readonly. No annual toggle/card-entry/download/backend or WU26 added.

Original failed type/lint/copy/font/tile/focus/locator/loading harness attempts remain frozen and unaccepted. HTTP03 executed H5 pass cannot qualify projection bytes: concurrent post-await request-count filename collision overwrote two unique33067B listTasks bodies, yielding four mismatched before/after references. Missing original bodies remain absent/unaccepted WU29; fresh reserved-index/write-wx H5 checks its own unique paths/actual hashes/sizes without recovery claim. HTTP04 original20 projected files are exact/unique. All inherited WU19–24 raster/privacy/mobile/default/Darwin/fullshell/missing-byte/whole-wrapper freeze debts above remain unchanged; this unit does not claim full-project parity.

WU25 root independently accepted the explicit selected68/204strict0/272PNG/136fixtures/272woff/fourfacecontexts, source/generated bridge, native/HTTP/gates/raw/freezes and exact stagedbytes. Candidate remains its original preapproval bytes; root-pass metadata supersedes its pendingstatus. HTTP03missingoldbodies/cleanup01outerdiagnosticgap and all inheritedWU29debts remain unaccepted; DONE does not expand to realbackend/fullproject parity.


## WU-26 Auth-owned presentation and bounded verification

Auth uses Tailwind/static shared composition outside AppShell, reusing WU25 PasswordInput/PasswordStrength. Auth-owned auth.css contains only exact Source entrance keyframes420ms/translateY8/easing/40-80-120 child delays, stored/OS fade120ms, and resting login reveal fill correction to Source while keeping aria-pressed semantics. No legacy stylesheet import, baseline update, tolerance, mask, crop shift or Source template/style edits. The Source global `.sub` collision hides Auth subtitles; this effective quirk is retained. Opaque bg-canvas is the actual `--bg` token; nonexistent bg-background yielded transparent scroller and concrete505-pixel mobile validation failure before correction.

Source full same-screen render replaces Auth presentation and restores focused id/caret; local AuthLayout revision matches those actions with controlled drafts/facade outside key. It resets natural Auth scroll on validation and restores focus without scroll. It does not recreate inputs on typing, strength updates, cooldown ticks or finished animation. Static captures settle actual first Auth appearance, retaining the entrance marker until a real Source-equivalent render; prior extra-Source-render attempts remain failed. Loading/cooldown use explicitly recorded deterministic clock/phase projection, while live CSS timing is checked separately. Whole natural viewport clips include header/card/footer where visible; long mobile signup footer is offscreen at the top and separately reached by actual wheel input.

HTTP unavailable and opt-in demo are deliberate capability boundaries; demo forms never authenticate passwords, grant API access or deliver email. Resend toast wording is truthful demo-only and differs from Source sent-email feedback; cooldown static captures await natural toast expiration. Initial Source/Target fixtures and bounded actual capture states (lengths/booleans/errors/clock, no credential values) are distinct evidence, with executed harness steps reconstructing transient flow. Linux Chromium145/Playwright1.58.2/Node24.13, seed804205, en-US/UTC/DPR1/MacIntel facade, BOTH --disable-partial-raster; no native Darwin/physical-device/default raster/fullshell/fullproject claim. All earlier unaccepted WU29 debts remain intact.

- WU26 candidate verification: selected44 paired whole Auth viewport comparisons comprise30 exact archived matrix03 nonbase states plus14 current base01 states; each Source/Target repeat also strict0. The bounded bridge is synchronous navigation cancellation/focus guards and identical JSX button boundaries only; old captures are explicitly archived provenance. Current native06 seven probes, motion01 three paired modes, HTTP01 three probes and core08 seven gates pass. Initial fixture bytes plus separately recorded bounded capture state and executed steps describe actual setup; no full transient fixture snapshot claim. Clock-projected pending/cooldown raster captures and natural first-appearance motion evidence are separate. Source resend delivery toast differs intentionally from truthful Target demo feedback. Inherited failed/unaccepted WU29 debts remain unchanged; no default-raster, Darwin, physical-device, full-shell or whole-project acceptance.
