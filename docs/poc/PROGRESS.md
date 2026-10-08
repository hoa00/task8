# PROGRESS — trạng thái xuyên session

## Trạng thái hiện tại

- Current work unit: `WU-02` — **DONE**.
- Last completed implementation unit: `WU-02`.
- Source audit: đã thực hiện khi lập handoff; source clone/build thành công và đã xem README preview.
- Visual baseline runtime: **ready**, 173 source scenario, repeatability zero-diff; đã inspect 9 ảnh đầy đủ và 10 contact sheets bao phủ 173 case.
- Target React app: workspace/React entry và file router skeleton đã build/typecheck; chưa có UI nghiệp vụ.
- Backend: Hono Worker skeleton local/404 đã chạy; D1/R2 và business routes chưa triển khai.
- Source SHA: `904205c626918ee96054eb35495c394a60c0c601`.
- Target project: `task8`; repository private [hoa00/task8](https://github.com/hoa00/task8), `origin=https://github.com/hoa00/task8.git`, default branch `main`; implementation hiện dùng branch `work`, push normal `HEAD:main`. Kết quả WU-01 ở entry bên dưới; lịch sử push WU-00 giữ nguyên.

## Work unit ledger

| Unit | Status | Checkpoint | Evidence / blocker |
| --- | --- | --- | --- |
| [WU-00](work-units/WU-00.md) | DONE | `8310612c8fc59f5e9b57940d06ee28b0220aa1c4` | [Runner](reference/CAPTURE.md), [repeatability](reference/repeatability.json), [inspection](reference/review/inspection.json); đã push repo private hoa00/task8, xem bổ sung bên dưới |
| [WU-01](work-units/WU-01.md) | DONE | `8e672a666bd03e4318205163286be8d8c296e567` | [Clean gates](evidence/WU-01/clean-typecheck.log), [graph/bundle](evidence/WU-01/workspace-artifacts.json), [source smoke](evidence/WU-01/source-smoke.json) |
| [WU-02](work-units/WU-02.md) | DONE | pending commit | [Verification](evidence/WU-02/verification.json), [83-operation coverage](evidence/WU-02/operation-coverage.json), [93 contract tests](evidence/WU-02/test.log) |
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

## WU-00 — 2026-10-08

- Status: `DONE` — WU-00-AC1/2/3/4 và verification bắt buộc đạt; blocker push được ghi riêng.
- Started from: workspace chưa có `.git`, chưa có app/harness/source checkout. Đã init `main` và commit handoff nguyên bản `a01aca4`; không có remote target. Prerequisites đạt: đọc được source SHA đã khóa và browser thực chạy được.
- Scope: chỉ source audit/capture harness. Không triển khai React, workspace packages, API, DB, canonical UUIDv7 hoặc unit sau.
- AC1: source HEAD/tree đúng lock; 86 tracked files khớp SHA-256 và working tree sạch. Reference chỉ nằm trong `.reference/` ignored; không copy renderer/CSS source vào target.
- AC2: đã acquire font bytes thật từ request browser, 12 CSS/font assets và 21 font-face descriptors. Có license notices OFL/ISC, fixture nguồn, identity map, registry và 173 ảnh/metadata source thực. Baseline đã chốt sau repeatability + inspect; không nhận ảnh target làm source.
- AC3: comparator thiếu reference phải fail; giữ threshold/maxDiffPixels 0, includeAA true, không mask. Source issues giữ nguyên trong inventory; report thử thất bại được giữ tại [rejected-capture.json](reference/rejected-capture.json).
- AC4: clock/seed/locale/timezone/platform/DPR/viewport/fixture được pin, setup state/actions/scroll có record; mỗi scenario dùng context mới. Runner tự quản lý Vite nguồn trên 4173 và dừng server do chính nó tạo.
- Files changed: `.gitignore`, `.node-version`, `package.json`, `pnpm-lock.yaml`, `tests/visual/reference/*.mjs`, `docs/poc/reference/` assets/manifests/fixtures/metadata/screenshots/review và `docs/poc/PROGRESS.md`.
- Verification đã đạt: source `npm ci --ignore-scripts --no-audit --no-fund` và `npm run build` exit 0, Node v24.13.0/Vite 6.4.4/56 modules; hashes dist trong [source-assets.json](reference/source-assets.json). `pnpm install --frozen-lockfile` exit 0, pnpm 11.19.0; `pnpm reference:check` exit 0/86 files; `pnpm test` exit 0/3 negative tests; `node --check` exit 0/12 harness modules. Smoke 11 case pass. `pnpm visual:reference:probes` exit 0/23 probes, gồm missing-font negative gate và drawer Esc/focus/620px/0.34s.
- Raster verification: `node tests/visual/reference/settled-render-probes.mjs` cuối exit 0, 16 case × 3 context, 32 comparisons zero-diff. [Report](reference/settled-render-probes.json).
- Verification cuối: `pnpm visual:reference:capture` exit 0, 173 pass/0 failed; `pnpm visual:reference:verify` exit 0, 173 comparisons/0 changed pixels; `pnpm visual:compare test-results/verify` exit 0, 173 cases/0 failed; `pnpm visual:reference:review` exit 0, 10 sheets/173 cases. Rerun `pnpm visual:reference:probes` cuối exit 0/23 probes; `pnpm test` và syntax check sau sửa comparator exit 0. Source/input/image/metadata và 5 evidence hash trong lock khớp; 60 local doc links đã kiểm tra tồn tại. 173 scenario IDs unique, đều có setup; 116 animation vô hạn trong metadata đều paused ở phase 0.
- Visual evidence: [baseline-manifest.json](reference/baseline-manifest.json), SHA-256 `b3ef541f9fa01c6c57d7344f9ca8efbc4acf5b35015f3ee7cf5df24dd4359bfe`; [repeatability.json](reference/repeatability.json), tolerance 0/không mask; source `reference/screenshots/` và `reference/metadata/`; actual `test-results/verify/`, final diffs `test-results/repeatability-diffs/` rỗng. [Inspection](reference/review/inspection.json) ghi 9 ảnh đầy đủ: SC-01-base, PR-02-board, PR-04-table, SC-11-base, SC-12-base, DR-01-side, SE-02-appearance, AU-01-login, MOBILE-home; đã xem toàn bộ review/sheet-01.png đến sheet-10.png. Technical review pass, không ghi Hòa/user-approved.
- Contract/data evidence: source fixture SHA-256 `8e552aa66ea24cd6300c16242769a85548b315b1ca55258d03df76f8bf439a80`; font manifest SHA-256 `af3c07090ede6a21872004ca20bb245ffd45dae46d01c6ebd6e96c1048e4bce4`. Identity map giữ IDs/quan hệ nguồn; canonical schema/UUIDv7 vẫn dành cho WU-02. `source-inventory.json` giữ nguyên audit snapshot lịch sử; `source-lock.json` thêm evidence runtime mới và giữ handoff build evidence.
- Failed attempts: helper native fetch `response.ok()` gây verify fail trước capture, đã sửa thành `response.ok`. Probe ad-hoc mượn server đã gặp connection refused khi owner kết thúc; chuyển sang script tự quản lý server và rerun. Bộ đầu capture 173 case nhưng review thấy hidden fallback opener/thiếu drawer scroll và repeatability fail 103 pixels; bộ tiếp theo bị loại trước nghiệm thu để chốt setup. Bộ thứ ba capture 173 pass nhưng repeatability exit 1/493 pixels ở 12 overlay; expanded probe còn 2 shimmer pixels. Giữ digest/results/reasons tại [rejected-capture.json](reference/rejected-capture.json); ảnh thử ignored trong `test-results/rejected-*`.
- Decisions/conflicts: dùng opener source thật, drawer scroll có record; render nguồn lần nữa sau motion để source tự bỏ cờ entrance, rồi pause animation vô hạn tại phase 0. Không sửa source/font/tolerance. [Capture commands/policy](reference/CAPTURE.md). Source auth subtitle bị `.sub` CSS ẩn, boundary 900px và calendar rows có nuance; giữ đúng source, ghi [SOURCE_ISSUES.md](reference/SOURCE_ISSUES.md). Quyền phân phối app/design/logo chưa xác nhận; notices font/icon không cấp quyền cho toàn app. Không liên hệ tác giả hoặc publish.
- Environment: Node v24.13.0, pnpm 11.19.0, Playwright 1.58.2, Chromium revision 1208/browser 145.0.7632.6, Darwin 27.0.0 arm64; browser UA/platform MacIntel/Mod ⌘; en-US/UTC, fixed Date 2026-10-08T09:00:00Z, seed 804205, DPR 1; desktop 1440×1000/mobile 390×844, touch/coarse pointer.
- Not run/not applicable: target app lint/typecheck/build, API/localD1/R2, CI, React parity — các thành phần này chưa thuộc WU-00. Syntax và source build là gate tương ứng của harness hiện tại.
- Review: tự rà bằng `ak-code-review`, kiểm tra phạm vi/AC, source immutability, opener thật, font negative gate, comparator/input/metadata checks và cleanup ở nhánh lỗi; không còn finding ngăn nghiệm thu. Whitespace check toàn staged exit 2 vì dòng 21 trong hai OFL notices có trailing blank nguyên bản; giữ bytes/hash của notices. `git diff --cached --check -- . ':!docs/poc/reference/assets/geist-OFL.txt' ':!docs/poc/reference/assets/geistmono-OFL.txt'` exit 0 cho toàn bộ phần còn lại; không che lỗi code/test/build.
- Process cleanup: các PID source server do session tạo đã exit; kiểm tra `ps` không còn các PID cuối 21530/31077/36765/86740/75677/42616, `lsof -nP -iTCP:4173 -sTCP:LISTEN` không có listener (exit 1 là empty result). Không để watcher/dev server chạy sau unit.
- Blockers: không có blocker implementation/baseline. Push target chưa có remote cấu hình. Quyền phân phối app/design/logo vẫn unconfirmed theo audit; chưa publish.
- Commit: triển khai/evidence `8310612c8fc59f5e9b57940d06ee28b0220aa1c4` — `test: pin source assets and visual baseline for WU-00`; handoff `a01aca4`. PROGRESS ghi SHA triển khai có thật trong commit documentation kế tiếp.
- Push: chưa push, `git remote -v` không có entry; `main` local. Không dùng remote upstream source làm origin target.
- Next permitted unit: `WU-01`. Chưa triển khai WU-01 hoặc unit sau; dừng session tại WU-00.

## Bổ sung WU-00 — đổi tên và cấu hình repo đích, 2026-10-08

- Yêu cầu trực tiếp: Hòa yêu cầu dùng gh đang đăng nhập, tạo private repo `task8`, đổi tên dự án thành `task8`, commit và push `main`.
- Completed: đổi root package name từ `gr8r-react-poc` sang `task8`, đổi tiêu đề README, thêm link repo đích; `gh repo create hoa00/task8 --private --source=. --remote=origin` exit 0. `gh repo view hoa00/task8 --json nameWithOwner,visibility,url` xác nhận `PRIVATE` và chủ sở hữu `hoa00`; origin đúng `https://github.com/hoa00/task8.git`, local branch `main`.
- Files changed: `package.json`, `README.md`, `docs/poc/PROGRESS.md`; lockfile dependency không đổi. Không đổi source/fixture/font/screenshot/harness hoặc triển khai unit sau.
- Verification: `pnpm install --frozen-lockfile` exit 0, pnpm 11.19.0/Node v24.13.0; `pnpm test` exit 0, 3 tests pass; `git diff --check` exit 0. Baseline WU-00 không đổi, matrix visual trước đó vẫn là evidence; không capture lại vì đổi tên package/docs không tác động renderer hoặc inputs.
- Decisions/conflicts: tên dự án đích là `task8`; nội dung/design của Gr8r Studio và source SHA vẫn giữ nguyên. Các ghi nhận “chưa có remote/chưa push” trong entry ban đầu là lịch sử trước yêu cầu bổ sung này.
- Commit: `2ca0191918a3c3dae5dd7fa5a6c711f0a164dd00` — `chore: rename target project to task8`. Kết quả push được ghi trong commit documentation kế tiếp.
- Push: `git push -u origin main` exit 0, tạo branch `main` và tracking `origin/main`. `gh repo view hoa00/task8 --json nameWithOwner,visibility,defaultBranchRef,url` xác nhận `PRIVATE`, default branch `main`; `gh api repos/hoa00/task8/git/ref/heads/main --jq .object.sha` bằng `git rev-parse HEAD`: `2ca0191918a3c3dae5dd7fa5a6c711f0a164dd00`. Bao gồm toàn bộ các commit/evidence WU-00 trước đó.
- Blockers: blocker thiếu remote đã gỡ; chưa có blocker mới. Không đổi kết luận audit quyền phân phối nguồn.
- Next: `WU-01` vẫn NOT_STARTED; dừng sau hoàn tất push.


## WU-01 — 2026-10-08

- Status: `DONE` — WU-01-AC1/2/3 và verification bắt buộc đạt; implementation đã commit/push, SHA checkpoint thực bên dưới.
- Started from: branch `work`, HEAD `7027697a3dcfab25e4c1513cab495453c5c389b7`, working tree sạch. Remote target `origin=https://github.com/hoa00/task8.git`, remote `main` cùng HEAD; không dùng remote reference. WU-00 DONE và 86 tracked source files tại SHA khóa đã xác minh lại.
- Completed: pnpm workspace gồm `apps/web`, `apps/api`, `packages/ui`, `packages/contracts`, `packages/domain`; packages private với source TypeScript exports/types và build ESM/declarations thật. Turbo điều phối dependencies, cache build/typecheck outputs `dist/**`, không cache dev/test. React strict entry/Query provider/file router và Hono Module Worker skeleton chạy thật; entry chưa dựng màn hình, API chưa có business routes và trả 404 cho endpoint chưa triển khai.
- AC1: clean copy từ **Git index** tại `/tmp/task8-wu01-clean`, không node_modules/dist/.turbo/.reference, đã chạy frozen install rồi typecheck **trước Vite build**, không phải dựa vào file sinh bởi dev server. `apps/web/src/routeTree.gen.ts` do plugin sinh và tracked; `apps/api/worker-configuration.d.ts` do Wrangler sinh và tracked. Cả hai excluded lint/format. Clean graph không có `.git` nên Turbo báo dirty-hash warning và dùng filesystem hashing; không ảnh hưởng kết quả hoặc cần file generated khác.
- AC2: lint kiểm tra package manifests/import AST và test negative chiều phụ thuộc. `contracts` chỉ Zod, `domain` chỉ contracts, `ui` React peer; không Worker/Hono/Drizzle/app imports trong packages/browser. [Browser modules](evidence/WU-01/browser-modules.json) ghi 250 module thực, zero reference/legacy renderer/server/DB modules. API artifact `apps/api/dist/index.js`; web artifact `apps/web/dist/`, shared package artifacts `packages/*/dist` đều ignored.
- AC3: [Turbo graph và bundle audit](evidence/WU-01/workspace-artifacts.json) kiểm tra 5 build task: domain → contracts; api → contracts/domain; web → contracts/domain/ui. Runner WU-00 giữ nguyên, `pnpm reference:check` exit 0/86 files, `pnpm visual:reference:smoke` exit 0/11 pass/0 failed. Smoke manifest giữ status `incomplete` vì đây là 11/173 scenario, không nhận thành baseline đầy đủ.
- Env: `PublicEnv` runtime Zod/schema typed cho `VITE_DATA_MODE=mock|http` và URL origin-relative `/api/v1`; reject unknown mode, external/protocol-relative/traversal URL và unsupported `VITE_*`. Bootstrap parse một lần; chưa dựng business adapters. Private Worker env là Wrangler-generated `CloudflareBindings`, hiện `STUDIO_ENV=local`; `.env.local`/`.dev.vars` ignored, examples không chứa secrets. Turbo giữ inherited proxy và CA trust; không tắt TLS verification. Tailwind scan explicit web/ui, không Preflight/legacy CSS; tokens/fonts/reset thuộc unit thiết kế kế tiếp.
- Files changed: `.gitignore`, `.prettierignore`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`; `apps/web/**`, `apps/api/**`, `packages/{ui,contracts,domain}/**` skeleton/config/source/exports; `tests/workspace/{boundaries.mjs,boundaries.test.mjs,artifacts.mjs}`; `docs/poc/evidence/WU-01/**` và PROGRESS. Source checkout/harness/assets/baseline/fixture không sửa; không migration/CI/deployment hoặc unit sau.
- Verification: clean `pnpm install --frozen-lockfile` exit 0 ([log](evidence/WU-01/clean-install.log)); `pnpm typecheck` exit 0/5 packages trước build ([log](evidence/WU-01/clean-typecheck.log)); `pnpm build` exit 0/5 packages, Wrangler `deploy --dry-run --outdir dist` **không deploy** ([log](evidence/WU-01/clean-build.log)); `pnpm lint` exit 0 ([log](evidence/WU-01/clean-lint.log)); `pnpm test` exit 0/2 env + 3 reference comparator + 1 boundary tests ([log](evidence/WU-01/clean-test.log)); `pnpm workspace:verify` exit 0/5 graph tasks/250 browser modules/zero forbidden. `pnpm api:types` và Vite generation exit 0; lint cuối sau sửa CA/config exit 0; `git diff --check` exit 0.
- Interaction/runtime: `pnpm dev` thực sự chạy Vite 5173 + Wrangler local 8787; [browser report](evidence/WU-01/local-runtime.json) chứng minh React mount, Tailwind min-height 1000px ở viewport 1440×1000, reload, zero page errors, direct Worker và Vite-proxy unknown API đều 404/text/plain/`Not found`, không HTML fallback hoặc success giả. Các dev/source process do unit tạo đã dừng; [cleanup](evidence/WU-01/process-cleanup.json): 4173/5173/8787 đều ECONNREFUSED.
- Visual evidence: [source smoke](evidence/WU-01/source-smoke.json), ảnh/metadata thật ở ignored `test-results/smoke/`; source SHA không đổi. Runner WU-01 Node24.13.0/pnpm11.19.0/Playwright1.58.2/Chromium1208/145.0.7632.6 trên Linux x64, trong khi baseline WU-00 Darwin arm64. **Không chạy/không claim raster parity hoặc full repeatability Darwin trên Linux**, không cập nhật baseline/tolerance/mask. WU-01 không có UI design để nghiệm thu target screen parity.
- Contract/data evidence: unit này chỉ env/package boundaries, chưa canonical DTO/UUIDv7/fixture mapper/domain behavior hoặc D1/R2; dành đúng unit tiếp theo/backend.
- Decisions/conflicts: Node runtime host 24.19.0 khác pin WU-00, dùng Node24.13.0 riêng ở `/tmp/task8-node-runtime`, không sửa `.node-version` hoặc harness. Resolve registry stable/peer ranges, không giả định Router/plugin cùng patch. TypeScript latest7 không đáp ứng typescript-eslint `<6.1`, chọn stable6.0.3. Vite8.3.4/Drizzle0.45.4 mới quá age cutoff mặc định pnpm; chọn8.3.3/0.45.3, bỏ exclusions installer tự thêm. pnpm11 dùng `allowBuilds` cho esbuild/workerd. React-refresh0.5.7 nhận TanStack route factories qua `extraHOCs`; không tắt rule cả app. Internal source exports được chọn theo TOOLCHAIN, chưa pipeline publish package.
- Failed attempts đã sửa: npm/pnpm cache/log default ngoài sandbox → task-specific XDG/store/cache trong `/tmp`; wrapper pnpm host Node24.19 → gọi pnpm11.19 bằng Node pin. Default restricted subprocess khiến source git spawn EPERM; chạy gate cuối với supported network permission (không đổi source code). First build bị Turbo strict env loại XDG/log config → passthrough đúng; lint route factory false positive → extraHOCs. Dev warning `Request.cf` TLS do CA env bị Turbo lọc → giữ `NODE_EXTRA_CA_CERTS`/SSL cert env, rerun không warning. Ctrl-C wrapper để lại dev descendants gây port5173 collision → stop đúng process tree sở hữu, rerun successful và cleanup kiểm chứng. Không coi các attempt này là pass; logs/evidence cuối là kết quả nghiệm thu; log lưu được normalize trailing whitespace, không đổi kết quả/command.
- Environment/toolchain: [manifest resolved](evidence/WU-01/toolchain.json); bảng bên dưới là exact versions cài thực, strictPeerDependencies=true, lockfile committed, không force/legacy peer bypass.

| Nhóm | Resolved versions |
| --- | --- |
| Node / pnpm / Turbo | 24.13.0 / 11.19.0 / 2.11.7 |
| React / React DOM / types | 19.3.0 / 19.3.0 / @types/react19.3.0 + @types/react-dom19.3.0; một React version |
| Vite / React plugin / TypeScript / Node types | 8.3.3 / 6.1.2 / 6.0.3 / @types/node24.19.1 |
| Router / Router plugin / Query | 1.170.41 / 1.168.42 / 5.104.1 |
| Tailwind / Vite plugin | 4.3.3 / 4.3.3 |
| Hono / Drizzle ORM / Drizzle Kit / Wrangler / Worker types / Zod | 4.13.13 / 0.45.3 / 0.31.11 / 4.148.0 / 5.20261006.1 / 4.6.5 |
| ESLint / JS config / TS ESLint / React hooks / refresh / globals | 10.12.0 / 10.0.1 / 8.71.1 / 7.1.1 / 0.5.7 / 17.13.0 |
| Playwright / Chromium / pixelmatch / pngjs | 1.58.2 / revision1208,145.0.7632.6 / 7.1.0 / 7.0.0 |
| Lucide/fonts | Không thêm/nâng; manifest nguồn WU-00 giữ nguyên |

- Not run/not applicable: full173 source raster verify trên Linux, target UI screenshot parity, business API/localD1/R2, migrations/seed, CI hoặc remote deployment. Các gate này không thuộc WU-01; baseline Darwin luôn giữ nguyên.
- Blockers: không có blocker WU-01. Environment difference cần xử lý trước các unit screenshot parity bằng source-only Linux baseline riêng theo CAPTURE policy, không ghi đè baseline Darwin. Quyền phân phối app/design/logo lịch sử vẫn unconfirmed; unit này không publish/deploy.
- Commit: `8e672a666bd03e4318205163286be8d8c296e567` — `chore: establish pnpm workspace and build foundation for WU-01`. Entry này ghi checkpoint/push đã xác minh trong commit documentation kế tiếp.
- Push: `git push origin HEAD:main` exit 0 đến repo private `hoa00/task8`; remote `main` trước push bằng starting HEAD `7027697a3dcfab25e4c1513cab495453c5c389b7`, sau push `git ls-remote origin refs/heads/main` bằng checkpoint `8e672a666bd03e4318205163286be8d8c296e567`. Không force-push; branch local vẫn `work`. Commit documentation này cũng được push bình thường sau khi ghi evidence.
- Next permitted unit: `WU-02`; dừng sau checkpoint/push WU-01, chưa thực hiện unit sau.


## WU-02 — 2026-10-08

- Status: `DONE` — WU-02-AC1/2/3/4 và verification bắt buộc đạt; chờ ghi SHA/push thực sau commit.
- Started from: branch `work`, HEAD `6b4d72e50d0962b0e24df8ba39e79a954d5691a8`, working tree sạch; WU-00/01 DONE có code/evidence. Read-set AGENTS/PROGRESS/WU-02, API_CONTRACT, DATA_MODEL, DECISIONS, ARCHITECTURE và source constants/store/seed/view-engine tại SHA khóa đã đọc; đọc thêm template/popover/settings chỉ để xác minh catalogs/preferences/reactions hiện hữu.
- Completed / AC1: `@studio/contracts` xuất Zod schemas và inferred DTO/enums/request/query/error/response; không Hono/Drizzle/React/Worker bindings. Sample consumers web, mock, Worker import chính `@studio/contracts`; build ESM/declarations thật, không endpoint/mock adapter/migration được triển khai sớm.
- AC2: DateOnly kiểm tra Gregorian/leap year thật (2026-02-30 reject); Instant chỉ UTC Z; UUIDv7 IDs và version integer dương/safe. `assigneeId`/`leadId` là membership, khác profile user ID. PATCH strict, absent giữ/null xóa, explicit undefined không tính field thay đổi; client không ghi server fields. Nullable date/order và full-view complete/dedupe/exact-count/cursor exhaustion có schema rõ.
- AC3: `StudioApi` và manifest đủ 83 HTTP method/path pairs (mở rộng GET/PATCH, PUT/DELETE; dedupe bảng Undo), 6 operation IDs được contract chỉ đích danh giữ nguyên. External provisioning/invitations/sharing/authentication/security/billing chỉ demoOnly/unavailable; không có live success contracts cho các dịch vụ này. Upload normalized binary input map tới multipart; content là binary response riêng, không JSON bytes giả.
- AC4: 83 request/response example pairs parse; focused errors/Undo/bulk/column/order/restricted/full-view fixtures typed và closed. Ngoại lệ dictionary duy nhất là `fieldErrors` theo đúng API_CONTRACT với string-array values có giới hạn; DTO/bulk/order/Undo/activity payload không dùng any/free Record. Không xuất OpenAPI riêng để tạo nguồn enum thứ hai.
- Contract/data evidence: [operation coverage](evidence/WU-02/operation-coverage.json), [verification summary](evidence/WU-02/verification.json), `tests/contracts/{fixtures,operation-samples,validation.test,operations.test,coverage}.ts`. Generated `packages/contracts/src/source-identities.ts` có 156 UUIDv7 identities từ SHA-256 namespace/collection/sourceId, epoch fixture cố định; 49 task keys/titles/relations nguyên vẹn, user/member namespace tách riêng. Source fixture hash `8e552aa66ea24cd6300c16242769a85548b315b1ca55258d03df76f8bf439a80`; generator `--check` pass. Không sửa fixture/identity map/baseline WU-00.
- Files changed: `packages/contracts/src/{primitives,catalogs,queries,models,inputs,operations,source-identities,index}.ts`, package README/scripts/tsconfig; `tests/contracts/**`, `apps/web/tests/contracts.{web,mock}.ts`, `apps/api/tests/contracts.api.ts`; root test/coverage/consumer scripts và ESLint test scope; `docs/poc/evidence/WU-02/**`, PROGRESS. Dependencies/pnpm-lock không đổi.
- Verification: `pnpm contracts:consumers && pnpm typecheck` exit 0, sample FE/mock/BE (có negative compile assertions) và 5 workspace packages ([log](evidence/WU-02/typecheck.log)); `pnpm lint` exit 0, package boundary pass ([log](evidence/WU-02/lint.log)); `pnpm build` exit 0/5 packages, Wrangler deploy --dry-run không deploy ([log](evidence/WU-02/build.log)); `pnpm test` exit 0, contracts 93/93 + env2 + comparator3 + boundary1 và generator drift check ([log](evidence/WU-02/test.log)); `pnpm contracts:coverage -- --write` exit 0/83 expected=83 actual từ markdown độc lập ([log](evidence/WU-02/coverage.log)); `pnpm reference:check` exit 0/86 files/source clean ([log](evidence/WU-02/reference-check.log)). `git diff --check` trước stage exit 0; staged check ban đầu phát hiện 2 log có blank line cuối; đã normalize log EOF và staged check cuối exit 0.
- Decisions/conflicts: API chỉ định đầy đủ một số DTO; các projection còn mô tả bằng prose được chốt thành explicit schemas trong models/README, không DB rows/HTML presentation. Catalog label/template IDs là closed stable keys, entity IDs UUIDv7. Notification preferences dùng lowerCamelCase, source snake_case chỉ mapper chuyển. Date-only validation không thực thi recurrence/filter/order business algorithms của unit sau. Shape schema không chứng minh relationship scope/access, không sanitizer; adapter/service của WU tương ứng phải kiểm tra retained date counterpart, membership/authorization, opaque cursor fingerprint, sanitized HTML và atomic/version guards. TaskIdMap là typed source/target entry array, không arbitrary record.
- Failed attempts resolved: Zod4 `.partial()` trên refined date-range schema gây import-time error → lấy strict shape rồi partial/refine; assertion identity count nhầm 135 → xác minh actual locked fixture 156; lint no-empty-object-type với interface rỗng → explicit typed session member trong interface kế thừa đầy đủ mapped operations. Default Node child isolation chỉ báo file-level results; `--test-isolation=none` hiển thị cả 93 cases và assertion chi tiết, không bỏ tests/thay semantics. Undefined-only PATCH concern từ review đã sửa và negative test pass.
- Environment: Node24.13.0/pnpm11.19.0 trên Linux, giữ proxy/CA/XDG runtime config WU-01. Không chạy UI/interaction/pixel parity, business HTTP/localD1/R2/migration/CI/deployment vì không thuộc WU-02; Darwin raster baseline giữ nguyên.
- Blockers: không có blocker WU-02. Source design/logo rights audit lịch sử không thay đổi; không publish. Environment parity constraint tiếp tục theo evidence WU-01.
- Commit: chưa commit tại thời điểm ghi entry; sẽ thay bằng SHA thật sau thành công.
- Push: trước commit đã fetch origin/main và kiểm tra target `https://github.com/hoa00/task8.git`, local `work`, target `main`; local/remote đều `6b4d72e50d0962b0e24df8ba39e79a954d5691a8`, divergence 0/0. Chưa push entry này; sẽ ghi kết quả thực sau normal HEAD:main push, không force.
- Next permitted unit: `WU-03`; WU-02 dừng sau commit/push, chưa thực hiện unit sau.
