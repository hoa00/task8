# Toolchain và quy ước triển khai POC

**Trạng thái:** quyết định kiến trúc và hướng dẫn thực thi; package, script và cấu hình bên dưới là yêu cầu cho các WU tiếp theo, chưa phải phần mềm đã được cài và kiểm thử.  
**Ngày đối chiếu tài liệu:** 08/10/2026.  
**Source cố định:** 904205c626918ee96054eb35495c394a60c0c601.

## 1. Stack và giới hạn phụ thuộc

- Frontend: React + TypeScript + Vite, TanStack Router file routing với browser history, TanStack Query trong app adapter.
- Styling: Tailwind CSS 4 **ngay từ component đầu tiên**, exact source tokens, base reset viết mới dựa trên hành vi source; không import hoặc giữ stylesheet legacy trong target.
- Backend: Hono chạy trên Cloudflare Workers; Drizzle dùng D1 driver; D1 local cho POC và test persistence.
- Contracts: Zod schemas cho DTO/request/response dùng chung, tách khỏi schema database.
- Workspace: pnpm + Turborepo. Một workspace lockfile cho target.
- Verification: TypeScript/build, test behavior cần thiết, API/D1 local và Playwright đối chiếu source.

Không đưa default visual của ReUI/shadcn/UI kit vào target. Có thể dùng primitive hành vi không áp đặt style nếu component cần, nhưng phải giữ DOM geometry, keyboard semantics và appearance theo source. Không thêm SSR, TanStack Start hoặc công việc hạ tầng/CI vào POC này.

## 2. Ranh giới package

| Vị trí | Trách nhiệm | Ràng buộc |
| --- | --- | --- |
| apps/web | Routes, screen composition, feature state, API client, Query hooks | Được import ui/contracts/domain; không import Drizzle schema hoặc Worker binding |
| apps/api | Hono routes, services, repository, Drizzle schema/migrations, D1 binding | Được import contracts/domain; không import React/ui |
| packages/ui | React primitives, shared visual patterns, token/font/base styles | Không import router, Query, Hono, Drizzle; data đi vào bằng props, action đi ra bằng callback |
| packages/contracts | Zod schemas và type suy ra từ schemas | Không import Hono, Drizzle, React, browser API hoặc Cloudflare runtime |
| packages/domain | Pure filter/sort/date/order/progress và quy tắc dùng chung giữa mock/server | Chỉ import contracts/utilities thuần; không DOM, framework, storage hoặc network |
| reference snapshot ngoài workspace packages | Chạy ứng dụng gốc để tạo baseline | Không vào production bundle, Tailwind source scan, typecheck target hoặc package publish |

Dùng workspace dependencies và exports rõ ràng, không import xuyên package qua đường dẫn tương đối tới implementation nội bộ. UI primitive như Button, Menu, Modal hoặc Table trình bày không tự điều hướng/fetch; adapter ở apps/web cung cấp Link/render callback/data. Các component nghiệp vụ TaskCard/ProjectHeader có thể đặt trong feature của app nếu chúng phụ thuộc model nghiệp vụ.

POC có thể dùng source TypeScript exports cho internal packages để Vite/tsc xử lý; chưa cần pipeline publish npm. Quy ước workspace hai mức apps/* và packages/* bám theo [Turborepo repository structure][turbo-structure].

## 3. Chọn và khóa phiên bản tại WU nền tảng

**Chọn Node 24 LTS làm dòng runtime cho tooling.** Pin exact patch còn được hỗ trợ và đáp ứng engines của Vite/Wrangler ở thời điểm triển khai vào .node-version hoặc .nvmrc. Tài liệu Node hiện liệt kê dòng 24 là LTS; không suy ra một patch “mới nhất” chưa kiểm tra. [Node releases][node-releases]

Vite hiện yêu cầu Node 20.19+ hoặc 22.12+; repo nguồn khai báo Node ≥18 và Vite ^6.4.4, nên không copy engines cũ sang target. [Vite guide][vite-guide], [package.json nguồn][source-package]

WU nền tảng phải ghi bảng resolved versions vào PROGRESS.md:

| Nhóm | Quy tắc khóa |
| --- | --- |
| Node/pnpm | Exact Node patch; packageManager là pnpm với exact version |
| React/react-dom/types | Một bộ phiên bản tương thích, không có bản React thứ hai trong ui package |
| Vite/plugin-react/TypeScript | Stable; kiểm tra engines và build/typecheck clean clone |
| TanStack Router/plugin | Các phiên bản tương thích trong cùng dòng được chọn; không đoán mọi package có cùng patch |
| Tailwind/@tailwindcss/vite | Đồng bộ bản stable; kiểm tra peer Vite |
| Hono/Drizzle ORM/Drizzle Kit/Wrangler/Zod | Stable tương thích; kiểm tra API theo đúng bản cài |
| Playwright/browser | Pin package, browser revision và runner OS cùng baseline |
| Lucide/fonts | Theo manifest source; không tự nâng chỉ để “latest” |

[Tailwind 4.2.2][tailwind-vite8] đã thêm hỗ trợ Vite 8; đó là mốc khả năng tương thích, không phải đề xuất pin một phiên bản cũ. Tài liệu Drizzle hiện có ví dụ dùng @rc; không copy tag RC vào POC theo quán tính. Chọn stable và đối chiếu API của chính phiên bản đó.

Commit pnpm-lock.yaml. Sau khi có lockfile dùng pnpm install --frozen-lockfile. Không dùng --force/--legacy-peer-deps để vượt lỗi tương thích. Không đưa “latest” vào script cài lại hoặc metadata baseline. Source reference dùng lockfile nguồn riêng, không bị workspace target nâng dependency.

## 4. Vite và route generation

Cấu hình khởi điểm cho apps/web/vite.config.ts:

~~~ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
~~~

Đây là cấu hình mục tiêu cần build thử sau khi cài dependency. Plugin TanStack phải đứng trước React theo [docs Vite integration][router-vite]. Không thêm router thứ hai.

**Chọn commit apps/web/src/routeTree.gen.ts.** Generator sở hữu file; bỏ qua lint/format tự sửa, không sửa thủ công. Trong WU khởi tạo, chạy Vite một lần để sinh route tree trước lần typecheck đầu. Mỗi WU thêm/sửa route phải để generator cập nhật file rồi commit cùng route. Nhờ file đã commit, clean clone có thể chạy tsc trước Vite build. Kiểm tra lại bằng clean install; không ghi nhận gate pass dựa riêng dev server đã từng chạy.

TS strict, module resolution phù hợp bundler cho web/internal packages và cấu hình Worker riêng cho api. HMR và mount/unmount không được đăng ký event listener trùng; bỏ mô hình module import có side effect đăng ký hàng loạt action/listener của nguồn.

## 5. Tailwind ngay từ đầu, không dùng stylesheet legacy

App CSS entry chỉ nạp Tailwind và CSS mới thuộc allowlist. Ví dụ tại apps/web/src/styles/app.css:

~~~css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);
@import "@studio/ui/styles.css";

@source "../";
@source "../../../../packages/ui/src";
~~~

Đường dẫn/namespace trong ví dụ phải khớp exports thực tế. Không import tailwindcss/preflight.css; cũng không thêm @import "tailwindcss" ở stylesheet thứ hai vì sẽ đưa Preflight trở lại. Explicit source scan bảo đảm component shared được compile và reference snapshot không bị quét. [Preflight][tailwind-preflight], [source detection][tailwind-detection]

### Token và base reset

packages/ui giữ bảng token mới với **đúng giá trị** từ source, gồm light/dark, system theme, các accent, density và motion. Giữ các custom property source cần thiết hoặc tạo ánh xạ rõ ràng; không copy cả cây stylesheet source.

Ví dụ ánh xạ một phần trong styles mới:

~~~css
@theme {
  --spacing: 4px;
  --breakpoint-*: initial;
}

@theme inline {
  --font-sans: var(--font);
  --font-mono: var(--mono);
  --color-canvas: var(--bg);
  --color-surface: var(--surface);
  --color-foreground: var(--text);
  --color-muted-foreground: var(--text-2);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --radius-control: var(--r-sm);
  --text-body: var(--fs);
}
~~~

Đây chỉ là ví dụ mapping; WU token phải bổ sung đầy đủ bảng nguồn, không xem các dòng trên là design system đã hoàn chỉnh. @theme inline phù hợp khi utility tham chiếu custom property có sẵn. [Theme variables][tailwind-theme]

Base reset mới trong layer base phải tái hiện [base.css nguồn][source-base]:

- Border-box cho phần tử và pseudo-elements; html/body/root cao 100%.
- Body margin 0, font/size/color/background nguồn, line-height 1.45, antialiasing, overflow hidden và font features ss01/cv11.
- Form controls inherit font/color; button reset background/border/padding; link inherit màu và bỏ underline theo nguồn.
- Focus-visible outline 2px với offset 1px và radius nguồn; caret/selection theo accent.
- Không thêm reset heading/list/image/table rộng hơn nguồn. Component chịu trách nhiệm utility margin, display, border-style hoặc appearance mà chính nó cần.
- Các class helper cũ row/col/grow/trunc/kbd phải thành utilities hoặc React component; không tái tạo nguyên nhóm class legacy để giữ view string.

Các CSS bình thường ngoài layer có ưu tiên cao hơn CSS trong layer. Đặt base trong base và custom component rules trong components; không vá mỗi lỗi bằng unlayered CSS hoặc !important toàn cục. [CSS cascade layers][css-layers]

### Breakpoint phải giữ điều kiện bao gồm

Nguồn dùng max-width 1100px, 900px và 640px. Tailwind max-* dùng giới hạn nhỏ hơn; không coi hai dạng này tương đương ở đúng điểm biên. Định nghĩa custom variants với điều kiện chính xác, ví dụ:

~~~css
@custom-variant source-tablet {
  @media (max-width: 900px) {
    @slot;
  }
}

@custom-variant source-mobile {
  @media (max-width: 640px) {
    @slot;
  }
}

@custom-variant source-hover (&:hover);
~~~

Bổ sung variant 1100px theo cùng quy tắc. Kiểm tra thứ tự CSS sinh ra khi mobile/tablet cùng áp dụng. Dùng source-hover cho hành vi :hover không có media guard trong nguồn; hover mặc định của Tailwind 4 chỉ chạy khi thiết bị chính hỗ trợ hover, có thể khác ở touch. [Responsive variants][tailwind-responsive], [custom variants][tailwind-custom], [hover migration][tailwind-upgrade]

### Allowlist CSS thủ công

| Cho phép | Cách giới hạn |
| --- | --- |
| Token/theme/font-face/base reset | Có source evidence; không áp thêm visual defaults |
| Pseudo-element và complex selector | Chỉ phần không biểu đạt gọn bằng utilities; đặt cạnh component |
| Scrollbar/safe-area | Giữ kích thước và hành vi nguồn |
| Keyframes/motion | Giữ timing/easing/reduced-motion; không kéo cả stylesheet source vào |
| Dynamic timeline/SVG/chart geometry | CSS custom properties hoặc typed inline style từ dữ liệu, không tạo class bằng nối chuỗi runtime |

Layout/card/button/header thông thường phải là utilities trong component tái sử dụng. Không chuyển từng view thành JSX khổng lồ hoặc render lại HTML string bằng dangerouslySetInnerHTML. Không tạo utility kiểu w-[<nối giá trị runtime>px]; dùng class tĩnh đọc custom property. Với transforms, không trộn vô ý individual translate/scale của Tailwind với keyframe transform của nguồn; kiểm tra các trạng thái reset và transition. [Dynamic class detection][tailwind-detection], [transform migration][tailwind-upgrade]

## 6. React state, Query và routing

- packages/ui là controlled/presentation API: nhận value/open/selected/loading và callback; không biết URL hoặc API endpoint.
- apps/web giữ route state, transient UI state và Query cache tách nhau. Drawer draft không được ghi vào Query cache trên mỗi phím nếu chưa Save.
- Query keys bao gồm phạm vi dữ liệu và filter có ý nghĩa. Mutation cập nhật/invalidates các key liên quan để List, Board, Calendar, Timeline thống nhất.
- Visual fixture mode dùng response và clock ổn định; có thể tắt retry/refetchOnWindowFocus trong test config. Không hard-code những lựa chọn phục vụ screenshot vào mọi môi trường.
- Case loading/error/empty theo nguồn được thử riêng, không vô tình thêm spinner/skeleton mới vào trạng thái đã tải dữ liệu.

TanStack Query có default stale/refetch cần đọc trước khi cấu hình; việc foreground refetch không được làm thay đổi fixture lúc capture. [Important defaults][query-defaults]

**Canonical routing dùng browser history.** Tạo whitelist legacy hash → route đích từ route inventory/auth routes, dùng replace để tránh thêm một history entry giả trước khi khởi tạo router. Tên/hash không có trong whitelist không được diễn giải thành route/param tùy ý. Không tạo redirect cho mọi fragment vì fragment cũng có thể là anchor.

Nguồn chỉ đọc hash tại startup, còn go() không ghi browser URL/history. Vì vậy baseline route sâu phải đi qua UI hoặc driver state; việc URL target thay đổi đúng khi chuyển trang là hành vi nâng cấp đã chốt. [Startup nguồn][source-init], [go() nguồn][source-go]

Nghiệm thu refresh, Back/Forward, legacy link, active navigation, page title, task drawer và tab parameters. Browser history cần fallback về index.html khi truy cập deep link; trong POC kiểm tra dev/preview route trực tiếp. Quy tắc phục vụ API vẫn phải trả API response/404, không trả HTML fallback cho /api. [TanStack history types][router-history]

## 7. API Hono + Drizzle D1

API chạy bằng Wrangler local, tách process Vite web. Vite proxy /api giúp app gọi đường dẫn tương đối. Thông tin binding nằm trong Worker env; frontend không đọc credential hoặc database identifier.

Quy ước API:

- Dùng Hono Module Worker export và generated CloudflareBindings từ wrangler types.
- Truy cập D1 qua c.env.DB, tạo Drizzle client bằng drizzle-orm/d1 trong lớp repository/request phù hợp.
- Drizzle schema nằm tại apps/api; Zod DTO nằm packages/contracts. Không export DB row type làm API contract mặc định.
- Validation của request/response và quy tắc lỗi theo API contract; app client không phải import type của Hono app để hoạt động.
- TanStack Query chỉ nằm apps/web; không đưa hooks hoặc QueryClient vào contracts/ui.

Hono hỗ trợ binding qua c.env và generate types từ Wrangler; Drizzle có D1 driver riêng. [Hono Workers][hono-workers], [Drizzle D1][drizzle-d1]

Migration/seed:

1. Drizzle Kit sinh SQL migration vào thư mục đã chốt trong apps/api.
2. Wrangler cấu hình migrations_dir trỏ đúng vị trí đó; đối chiếu layout output của bản Drizzle đã cài, không giả định tên file/thư mục của RC giống stable.
3. Chạy migrations apply với **--local** trên database fixture. Commit migration SQL; không dùng schema push thay lịch sử migration của POC.
4. Seed D1 local từ bộ fixture tương đương source, kiểm tra read/mutation/reload/persistence qua API.
5. Có script reset fixture local rõ phạm vi và script seed lặp an toàn. Không lấy remote database làm dữ liệu screenshot.

Wrangler hỗ trợ môi trường D1 local và migration directory/pattern; chỉ đặt migrations_pattern nếu output của phiên bản đã chọn thật sự cần nó. [D1 local development][d1-local], [D1 migrations][d1-migrations]

Đây là mức backend tối thiểu để chứng minh API contract và persistence; không kéo thêm deployment pipeline hoặc nền tảng vận hành vào các WU chuyển giao diện.

Trong workspace còn có `packages/domain` cho pure rules dùng chung giữa mock và API, theo ARCHITECTURE. Không thêm package DB/api-client riêng trong POC.

## 8. Script contract cần có

Tên script là giao ước đề xuất; WU nền tảng hiện thực theo package names thực tế và ghi lệnh chạy vào README/PROGRESS.md.

| Script | Chức năng |
| --- | --- |
| dev | Turbo chạy web + api local; persistent=true, cache=false |
| build | Web production build và API bundle/dry run cần thiết; không deploy |
| typecheck | TS strict cho các package; route tree và binding types đã có |
| lint | Kiểm tra code/boundary/style conventions; bỏ file generated |
| test | Chỉ test behavior/contract/business rule nằm trong WU |
| db:generate | Sinh SQL migration từ Drizzle schema |
| db:migrate:local | Apply migrations vào D1 local |
| db:seed:local | Seed fixture có version vào D1 local |
| visual:reference:capture | Capture source đúng SHA, không dùng target |
| visual:reference:verify | Kiểm chứng reference còn tái lập trên runner đã pin |
| visual:compare | So target với baseline; không ghi golden |

Turbo cache các build/typecheck cần thiết; không cache dev, seed/migration, capture hoặc visual comparison có side effects/external browser state. Khai báo outputs đúng nơi build thực sự ghi. Xem [Turborepo tasks][turbo-tasks]. Không chạy test rộng hơn nếu không có rủi ro cụ thể cần giải quyết.

## 9. Gate theo mốc thực hiện

WU-00 tự tạo runner reference tối thiểu bằng pnpm nếu repo chưa có tooling. WU-01 mở rộng workspace và giữ runner ấy; không yêu cầu backend dữ liệu chạy ở WU-01. Những gate liên quan API/D1 bên dưới áp dụng WU-30 trở đi, R2 tại WU-35 và end-to-end tại WU-36.

- Clean install từ lockfile, typecheck/build hoạt động với route tree đã commit.
- Import từ packages/ui và contracts chạy được trong app; browser bundle không chứa server/db modules.
- Một mẫu primitive sử dụng đúng token, font, border/focus/hover và source breakpoints, viết bằng Tailwind ngay từ đầu.
- Không có import/reference tới stylesheet legacy trong bundle target.
- API local đọc/ghi được D1 qua Drizzle theo contract; refresh UI nhận dữ liệu đã lưu ở WU tương ứng.
- Baseline WU-00 là artifact thực tế; comparator thiếu baseline phải fail và không tạo ảnh chuẩn.
- Ghi rõ test nào chạy, test nào chưa chạy và blocker trong PROGRESS.md; yêu cầu toàn bộ visual theo [VISUAL_PARITY.md](VISUAL_PARITY.md) được áp dụng ở từng WU liên quan.

## 10. Tên file portable và evidence lịch sử

Git phân biệt hoa/thường; checkout macOS hiện tại không phân biệt. Không dùng hai path chỉ khác hoa/thường hoặc dạng Unicode; quy tắc áp dụng cả tên thư mục. `pnpm test:workspace` kiểm tra các path trong index và file mới qua [tracked-paths.mjs](../../tests/workspace/tracked-paths.mjs), gồm cả collision ở parent directory. Stage các file dự định commit trước khi chạy gate này.

Các probe tạo project và move task dùng tên evidence khác nhau: `rebalance-project.*` và `rebalance.*`; payload tên project vẫn là `Rebalance`. Chín file evidence cũ được đổi tên với nguyên byte/blob/hash trong [path-relocations.json](evidence/path-relocations.json). Báo cáo, receipt và executed snapshot lịch sử giữ nguyên; đọc tên cũ qua `readEvidenceFile`/`resolveEvidencePath` trong [evidence-paths.mjs](../../tests/workspace/evidence-paths.mjs). Resolver tra map chính xác trước khi đọc, vì `existsSync` trên macOS có thể trỏ nhầm sang probe chữ thường. WU32/WU36 evidence readers dùng resolver này.

Kiểm tra integrity/portability bằng `pnpm test:workspace` hoặc `node --test tests/workspace/portable-paths.test.mjs`; quét path riêng bằng `node tests/workspace/tracked-paths.mjs`. Các snapshot helper trước sửa vẫn là bằng chứng của lần chạy lịch sử; không gọi chúng là byte-match với harness hiện tại hoặc tái ghi verification cũ để che thay đổi. Không cần chạy lại API/DB/visual cho sửa tên evidence; mọi thay đổi runtime sau này phải có evidence mới.

[node-releases]: https://nodejs.org/en/about/previous-releases
[vite-guide]: https://vite.dev/guide/
[source-package]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/package.json#L15
[source-base]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/styles/base.css#L4
[source-init]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/main.js#L70
[source-go]: https://github.com/gr8rstudio/gr8r-studio/blob/904205c626918ee96054eb35495c394a60c0c601/src/shell/render.js#L58
[router-vite]: https://tanstack.com/router/latest/docs/installation/with-vite
[router-history]: https://tanstack.com/router/latest/docs/guide/history-types
[tailwind-vite8]: https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.2.2
[tailwind-preflight]: https://tailwindcss.com/docs/preflight
[tailwind-theme]: https://tailwindcss.com/docs/theme
[tailwind-detection]: https://tailwindcss.com/docs/detecting-classes-in-source-files
[tailwind-responsive]: https://tailwindcss.com/docs/responsive-design
[tailwind-custom]: https://tailwindcss.com/docs/adding-custom-styles
[tailwind-upgrade]: https://tailwindcss.com/docs/upgrade-guide
[css-layers]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@layer
[query-defaults]: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
[hono-workers]: https://hono.dev/docs/getting-started/cloudflare-workers
[drizzle-d1]: https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1
[d1-local]: https://developers.cloudflare.com/d1/best-practices/local-development/
[d1-migrations]: https://developers.cloudflare.com/d1/reference/migrations/
[turbo-structure]: https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository
[turbo-tasks]: https://turborepo.dev/docs/crafting-your-repository/configuring-tasks

