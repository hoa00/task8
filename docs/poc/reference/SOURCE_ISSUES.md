# Ghi nhận source ở WU-00

SHA: `904205c626918ee96054eb35495c394a60c0c601`. Không sửa source để làm capture
pass. Các state vẫn có scenario ID trong [registry](scenario-registry.json).

| Quan sát | Bằng chứng thực tế | Xử lý trong WU-00 |
| --- | --- | --- |
| Subtitle auth bị ẩn | `src/styles/shell.css:225` đặt `.sub { display:none }`; `src/styles/pages/auth.css:47` không reset display. Probe `auth-subtitle` có text “Sign in to Gr8r Studio” và computed `display:none`; ảnh `AU-01-login.png`. | Giữ baseline đúng nguồn; việc thay hành vi cần quyết định ở unit auth. |
| CSS sidebar overlay và drawer navigation khác tại 900px | Probe `inclusive-breakpoint-900` đo sidebar 280px/fixed; `go-drawer-boundary-900` giữ drawer. Tại 899px drawer đóng, tại 901px sidebar 252px/static. | Giữ hai điều kiện riêng, không gộp `<900` thành `≤900`. |
| Mobile calendar có explicit rows lớn hơn auto rows | Tại 640×1000, `.cal-g` inline `repeat(5,minmax(112px,1fr))`, computed khoảng 140.44px/row, dù grid-auto-rows là `minmax(72px,1fr)`. Ảnh `MOBILE-calendar.png` dùng 390×844. | Dùng computed layout/ảnh thực, không suy ra 72px cho explicit rows. |
| go() không đổi browser history/hash | Probe `source-memory-navigation` giữ hash rỗng sau Home → Projects; read-set `src/shell/render.js:58`. | Driver dùng dev handle/real actions. Browser history là phạm vi React ở unit sau. |

Chi tiết đo nằm trong [interaction-probes.json](interaction-probes.json).
Không có screen family bị bỏ vì lỗi nguồn; source drawer Esc/return focus đã
đạt. Capture errors và sửa harness là lịch sử riêng trong
[rejected-capture.json](rejected-capture.json), không gọi chúng là bug của app.


WU-14 supplementary native source observation (managed Linux, original locked
renderer/CSS): full-filtered five-project legend at641×844 wraps and the toolbar
shrinks, so the Week control center (x101,y211.828125 in the feature fixture) is
covered by Sep29 `.cday`. Actual trusted mouse click leaves Month; two native
Shift+Tab then Space sets source calMode=week and original renderer mounts Week.
The target has the same geometry/limitation and native keyboard works. See
[evidence](../evidence/WU-14/source-interactions.json) and separate source/target
641 PNGs. This is not inferred from image parity and not claimed as mouse-pass.

WU-14 MyTasks390 supplementary pointer observation: source and target Week mode
control rect x75/y241.359375/w52/h24, center covered by weekday `<div>Tue</div>`.
Actual trusted mouse click leaves Month; one native Shift+Tab then Space(source)
or ArrowRight(target) opens Week. [Report](../evidence/WU-14/mobile-pointer-observation.json)
and before/after PNGs retain the source geometry limitation. Native action
updates connected source #app, then original feature fixture is explicitly
recomposed for visible proof. No all-mobile-pointer/physical-phone claim.
