# PROGRESS — trạng thái xuyên session

## Trạng thái hiện tại

- Current work unit: `WU-00` — **DONE**.
- Last completed implementation unit: `WU-00`.
- Source audit: đã thực hiện khi lập handoff; source clone/build thành công và đã xem README preview.
- Visual baseline runtime: **ready**, 173 source scenario, repeatability zero-diff; đã inspect 9 ảnh đầy đủ và 10 contact sheets bao phủ 173 case.
- Target React app: chưa triển khai.
- Backend/D1/R2: chưa triển khai.
- Source SHA: `904205c626918ee96054eb35495c394a60c0c601`.
- Target project: `task8`; repository private [hoa00/task8](https://github.com/hoa00/task8), `origin=https://github.com/hoa00/task8.git`, branch/default branch `main`, tracking `origin/main`. Push đầu đã thành công; SHA local/remote khớp `2ca0191918a3c3dae5dd7fa5a6c711f0a164dd00`.

## Work unit ledger

| Unit | Status | Checkpoint | Evidence / blocker |
| --- | --- | --- | --- |
| [WU-00](work-units/WU-00.md) | DONE | `8310612c8fc59f5e9b57940d06ee28b0220aa1c4` | [Runner](reference/CAPTURE.md), [repeatability](reference/repeatability.json), [inspection](reference/review/inspection.json); đã push repo private hoa00/task8, xem bổ sung bên dưới |
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
