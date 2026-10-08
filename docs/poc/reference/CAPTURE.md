# Runner baseline WU-00

Source là checkout read-only tại `.reference/gr8r-studio`, SHA
`904205c626918ee96054eb35495c394a60c0c601`. Đây chưa phải ứng dụng React.
Không có source renderer/CSS nào được copy vào target.

## Tái lập

Runner: Node **24.13.0**, pnpm **11.19.0**, Playwright **1.58.2**, Chromium
revision **1208** / **145.0.7632.6**, Darwin **27.0.0**, arm64. Baseline chỉ
so trên cùng OS/browser đã pin; OS khác cần bộ reference riêng được review.

Từ root, với Node theo `.node-version`:

```sh
git clone https://github.com/gr8rstudio/gr8r-studio.git .reference/gr8r-studio
git -C .reference/gr8r-studio checkout --detach 904205c626918ee96054eb35495c394a60c0c601
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cd .reference/gr8r-studio
npm ci --ignore-scripts --no-audit --no-fund
npm run build
cd ../..
pnpm reference:check
pnpm test
pnpm visual:reference:verify
pnpm visual:reference:probes
node tests/visual/reference/settled-render-probes.mjs
```

`npm` chỉ dùng cho lockfile nguồn. Target chỉ dùng pnpm. Browser revision đã có
trên máy chạy WU-00, không tải lại browser trong verification session này.

- `visual:reference:capture` tạo reference từ source, từ chối baseline đã ready.
- `visual:reference:verify` chụp lại cả registry vào `test-results/verify/`, so
  đúng pixel với ảnh nguồn và ghi [repeatability.json](repeatability.json).
- `visual:compare test-results/verify` chỉ đọc baseline và actual manifest; thiếu
  reference/input hash/metadata hoặc cờ update-snapshot làm lệnh fail. Target
  runner ở unit sau phải cung cấp actual manifest với cùng pins/scenario IDs.
  Lệnh này chưa có React target để nghiệm thu parity.
- `visual:reference:review` tạo contact sheets; không sửa ảnh chuẩn.
- `reference:bootstrap-assets` chỉ dùng lần acquisition đầu tiên, phải có mạng.
  Lệnh từ chối ghi đè [font-assets.json](font-assets.json) đã có. Cold clone dùng
  bytes/fixture đã commit, không tải font mới từ URL đang thay đổi.

Capture/probes tự khởi chạy Vite nguồn ở `127.0.0.1:4173` khi chưa có server.
Nếu cổng đã có server, runner kiểm tra raw `main.js` với source hash rồi reuse;
server không khớp làm fail. PID/cổng/CWD được in khi khởi chạy. Runner chỉ dừng
server do chính lệnh đó tạo, trong `finally`; không chọn cổng kế tiếp.

## Inputs và readiness

[baseline-manifest.json](baseline-manifest.json) khóa source, runner, fixture,
font, registry, SHA-256 mỗi ảnh/metadata và inputs. [scenario-registry.json](scenario-registry.json)
có 173 case: 21 routes, 8 project tabs + saved view nguồn, 21 Settings, 7 auth,
6 onboarding, 10 modal types, 28 popover types, drawer states, views, lỗi/rỗng,
mobile, boundaries, theme/accent/density và settled motion.

Clock trước import là `2026-10-08T09:00:00.000Z`; `en-US`/UTC; seed LCG `804205`;
platform `MacIntel`/Mod `⌘`. Date cố định, còn performance/timers chạy thật để
motion và countUp tới giá trị cuối. Desktop 1440×1000, mobile 390×844, DPR 1;
mobile có touch/coarse pointer, UA được ghi nguyên văn trong manifest. Mỗi
case có browser context mới, localStorage `gr8r.v2` từ fixture, prefs/route/state
và scroll riêng trong metadata. Không nhân mọi tổ hợp Cartesian.

Readiness đợi font faces Geist 400/500/600 và Geist Mono 400 loaded, ảnh decode,
finite animation kết thúc, rồi pause animation vô hạn ở phase `currentTime = 0`,
đợi text và geometry ổn định. Screenshot dùng `animations: allow` để giữ đúng
phase đã pin thay vì cancel/restart shimmer. Metadata ghi animation name,
phase và playState. Font thiếu/fallback làm
fail, như [interaction-probes.json](interaction-probes.json). Font bytes/CSS
descriptors/unicode-range và các subset đều giữ nguyên; không khai báo lại
variable weights để đổi cách browser chọn 450. Assets/license audit nằm ở
[source-assets.json](source-assets.json); identity nguồn nằm ở
[source-identity-map.json](source-identity-map.json), dữ liệu nguyên bản ở
[source-fixture.json](source-fixture.json). Chuyển UUIDv7/schema thuộc WU-02.

Comparator dùng `threshold: 0`, `includeAA: true`, `maxDiffPixels: 0`, không mask.
Mỗi case gọi `render()` nguồn lần nữa sau readiness để gỡ lớp motion một lần
đã kết thúc, rồi chạy readiness lại. Source `src/shell/render.js` tự xóa
`S.ui.fx` sau render và giữ focus/scroll, nên lần render sau không replay
entrance. Không chỉnh source CSS hay templates.
[settled-render-probes.json](settled-render-probes.json) đo ba context độc
lập cho 16 case từng nhiễu hoặc có scroll/mobile. Probe motion riêng xác nhận drawer 0.34s,
620px, Esc và return focus; snapshot settled không thay motion runtime.

## Review và lịch sử capture

Ảnh đầy đủ nằm trong `screenshots/`, metadata từng case trong `metadata/`.
Contact sheets trong `review/` chỉ phục vụ inspect, không là golden. Technical
review và evidence được ghi ở [PROGRESS.md](../PROGRESS.md); không tự nhận
Hòa đã phê duyệt ảnh hoặc quyền phân phối.

Bộ thử đầu chưa được nghiệm thu: review phát hiện fallback anchor bị ẩn và
drawer state chưa cuộn tới phần cần xem; repeatability thấy 103 pixel nhiễu
ở ba case. Tắt GPU không giải quyết toàn bộ, theo [raster-probes.json](raster-probes.json).
Harness đã đổi sang source opener thật (`A.pop`/`A.ctxBtn`), thêm scroll setup
và settled render có probe thực tế. Capture thử kế tiếp vẫn fail 493 pixel ở
12 overlay; probe mở rộng chỉ còn hai pixel shimmer khi screenshot cancel
animation. Capture cuối pin phase vô hạn và dùng render ổn định cho toàn bộ
registry. Không nâng tolerance hay thay font/source.
Digest, kết quả fail và lý do loại các capture thử được giữ ở
[rejected-capture.json](rejected-capture.json); ảnh thử còn local trong
`test-results/rejected-*` (ignored). Baseline cuối chỉ được chấp nhận sau
capture, repeatability và inspect đạt.

Lỗi helper native fetch `response.ok()` đã sửa thành thuộc tính `response.ok`;
verify thất bại trước capture lần đó được ghi trong PROGRESS. Một probe ad-hoc
đã gặp connection refused khi server của capture kết thúc; probe đã được đưa
vào script tự quản lý server và chạy lại thành công.

Upstream chưa khai báo license cho app/design/logo; quyền phân phối còn chưa
xác nhận theo [UPSTREAM_NOTICE.md](../../../UPSTREAM_NOTICE.md). Font OFL và
Lucide notice chỉ áp dụng đúng tài nguyên tương ứng. Không có liên hệ tác giả,
publish, deployment, backend hay unit sau trong WU-00.
