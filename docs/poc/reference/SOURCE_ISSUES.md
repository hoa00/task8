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


WU-15 original locked Timeline observations (managed Linux): source row sort
returns -1 for equal `(start||due)` dates, reversing incoming equal-date ordinal.
25 generalized read-only renderer cases prove the typed presentation equivalent.
`groupTasks(ts.filter(t=>t.due),g)` receives a fresh array, so original input and
`ts.flatMap` dependency paint order remain unchanged in all4groupings, including
none. [Source probe report](../evidence/WU-15/source-interactions.json) records
actual row/path arrays; no persisted source fixture or template was mutated.

Original pointer drag counts only screen dx/dayWidth: trusted wheel64px during
32px drag moves1day. It has no Escape cancel handler: trusted Escape after64px
still commits2days. Target includes scroll delta and cancels per WU15 contract,
verified independently; no false source-equivalence claim for these corrections.
Source drag has plain Moved toast with no Undo. Native probes run actual connected
#app Timeline route with original automatic render; feature screenshot sections
are explicitly composed by the capture harness and are not claimed to rerender
through an unrelated source host. Raw outside-range source is separately retained
before explicit API §6.3 overlap input correction; dates/positions/IDs remain
immutable in default/grouping/scroll/zoom comparisons.

WU-15 root supplemental actual original canonical #app zoom probe (exit0):
Week900/180; first Months489/0; set Months450/72; trusted Weeks return0/0; trusted
Months return0/0. render.js data-keep restores matching DOM keys only within one
render; tlInit still1 so returning zoom does not initialize Today. Target Panel
Map continuity is an explicit contract interpretation/correction, not source
behavior parity. [Reviewer JSON](../evidence/WU-15/root-source-zoom-observation.json)
records provenance and the existing target Week restoration assertion. Source
files/default fixtures/production/frozen PNGs remain unchanged; root cleaned up
its browser and Source4173.

## WU-16 bounded source records

Locked source Project catalogue leaks private p6 member stacks/last activity in
Grid and counts/progress/team/start in List/Table. API5.1/WU16AC5 common restricted
projection is enforced without fixture privacy reassignment. Raw default images
are retained separately; no blanket intentional-pixel claim includes other raster.
Source Overview takes original activity array first6 without sorting: p1 sixth
record is Sarah-created Project from Sep8, omitting Priya-completed Footer5daysago.
Target canonical §8 newest-first recent6 substitutes that record; actual native
scrolled Recent panels and rendered IDs/order are recorded in WU16 raw-contexts.
Project Activity intentionally emits two live post rows, comment plus logged
activity; target preserves this distinct-record source behavior.

Source lead edit grants membership but PATCH contract preserves grants. Source
Save from saved tab reads p:key instead of current sv:key; target saves explicit
active filters under contract. Source blank Save uses Untitled view fallback.
Share unknown email says sent; local target demo guest explicitly says no real
invitation was sent. Source Card overflow avatar .more collides with Options CSS;
fullmembership/+nDOM and hover/front-hit are preserved by controlled owned slot.
Normal tooltip avatars are relative; tooltip-free Overview Lead is static.
Source mobile Sidebar70 remains above first modal61; target scoped close-nav
correction preserves usable focus without changing generic overlay defaults.

Original finite entry retains .enter/.fx-route/.fx-tab CSS on finished first DOM
until a real subsequent render. Text-only project drafting does not render;
icon/color/template action renders even selecting the same value. Owned controlled
revision preserves this lifecycle while using existing motion/keyframes. Source
progress fill is100%width with scaleX(--p), never width=model. These behaviors
are not acceptance of inherited WU10/13/14 pixel debts or laterFiles/Home/Activity.

WU-16 supplementary raster debts retained for WU-29: native catalogue Search →
layout leaves 11 Input pixels different in List/Table; source Grid/Input versus
source List/Input itself differs by 11, and source Grid equals Target List in that
region. Original 6 source/target pairs (12 PNGs) and hashes are frozen in
[evidence/WU-16/unaccepted-input-order.json](../evidence/WU-16/unaccepted-input-order.json).
The primary symmetric layout → search consumer sequence does not accept or erase
that earlier sequence. Direct-first-entry Project Table390 has 33 right-edge card
pixels different despite measured equal card/child/ancestor geometry and styles;
its two PNGs/hashes are frozen in
[unaccepted-direct-table.json](../evidence/WU-16/unaccepted-direct-table.json).
Overview → native Header Table is a separate primary consumer sequence, not a
source/fixture/paint modification. Default first-entry Project modal raster pairs
(16 PNGs) are also retained in
[unaccepted-default-forms.json](../evidence/WU-16/unaccepted-default-forms.json),
separately from meaningful configured Create/Edit form states. These are all
**UNPROVED_UNACCEPTED**, not authorized semantic corrections or proven source bugs.

- WU-16 confirmation copy: Source Delete says "This can't be undone" while `A.delProject` actually publishes Undo. Target preserves the bounded actor/CAS Undo contract and truthful feedback. Archive/Delete owned icon/body/focus and no-render typed-name behavior match the original consumer; this text correction does not authorize other raster differences.

WU-16 later frozen bundles include [prior workflow cells](../evidence/WU-16/unaccepted-prior-workflows.json), [configured forms](../evidence/WU-16/unaccepted-configured-forms.json), [five gates8 modal pairs](../evidence/WU-16/unaccepted-gates-eighth-forms.json) and [eight gates12 pairs](../evidence/WU-16/unaccepted-gates-twelfth.json). All remain UNPROVED_UNACCEPTED; unexplained Target cross-run raster changes are not declared source bugs, semantic corrections or accepted parity. Historical CatalogueTable7/10 target PNGs were overwritten before the prior-workflow freeze; reports/hashes remain, but that bundle contains a later0/0 capture. WU-29 must reconcile these contexts without erasing the earlier debts.

WU16 passive original-app geometry observation: Source `main.js` appends its
`.sr` live-region after the full-height App at document y1000. Its original
absolute1×1/zero-margin/clip-rect style extends document scrollHeight to1001
while body stays1000; Target's existing visually hidden region has margin−1
and document1000. Both remain scrollY0. Modal/wrap/host boxes and full noncustom
CSS match; observed compositor layer ownership differs. This is an inherited
hidden overflow quirk, **not a proven cause** of the remaining pixels or a
visible consumer failure. [Actual snapshot/archive](../evidence/WU-16/diagnostics/modal-paint-archive.json)
is unaccepted; no artificial1px, source/style/Portal/layer intervention is used.

Later WU16 real-consumer intervention supersedes the earlier passive-causality limit: changing only initial Target `#sr-live` margin−1→0 gives root1001 and original FixedPosition modal/scrim layers, removing164 Create differences (192→28) with no new pixels and identical owned CSS/rects, Source hash, served/build assets, actions and clips. [Frozen comparison](../evidence/WU-16/diagnostics/root-overflow-summary.json) remains diagnostic, not acceptance or an explanation of28remaining. The implementation now restores only this specific Source margin0 as a prerequisite fidelity repair; no artificial root-height style, Portal/GPU/layer controls or global sr-only rewrite. Source hidden overflow quirk remains recorded; mandatory verification still applies.

WU16 later passive command/replay and matched partial-raster diagnostics identify
a runtime dependence in the remaining Create1440 live28 pixels. All477 serialized
paint commands and offscreen scale1 replay match; the isolated same browser flag
`--disable-partial-raster` on Source AND Target yields live0/repeat0, changing
Source13 and Target41 pixels versus default with equal owned CSS/geometry/assets.
[Actual frozen comparison](../evidence/WU-16/diagnostics/partial-raster-summary.json)
is diagnostic only. It does not declare a source bug, update a baseline or accept
default-browser failures. Exact internal cached damage/scissor remains unexposed;
mandatory default-runtime evidence is retained unaccepted.

WU16 Share async read chronology is a Target ownership omission, not a Source bug:
original first modal has7 full members/591px and enabled Invite; Target originally
initiated project-members→demo/full catalogue only after mount, first0/283px.
Permitted Bootstrap display fallback repairs initial labels; actual full query
projection/capability changes retain Source-style entry consumption. Shared reads
now start at Header/menu exposure via canonical cache, with truthful cold/held/error
UI and complete coverage required before Invite/Enter. Before/after28 and named
read-owner0 proofs are separately frozen; no default-runtime parity claim follows.
The separate44/45 full-raster failed supplement and subsequent candidate24-gate
packet retain profile names/effective args/Source hash deltas. Runtime scope remains
subject to independent root inspection; all default/inherited/WU29 debts stay
UNPROVED_UNACCEPTED, and original173Darwin remains unchanged.

Root final scoped decision: WU16 managed Linux content/dialog technical PASS uses
the explicitly adopted same Source+Target Chromium145 `--disable-partial-raster`
profile, grounded in real-consumer proof plus all24actual gates/45strictzero.
Original Source/173Darwin are immutable; default31/45 and older full44/45 remain
UNPROVED_UNACCEPTED. All inherited/new debts still require WU29 reconciliation.
This qualified decision does not turn diagnostic replay/profile results into
default-browser parity, source bugs, user approval or blanket raw-correction
pixel acceptance. Final metadata contains root's independent hash/pixel/source
inspection and exact acceptance limits.
