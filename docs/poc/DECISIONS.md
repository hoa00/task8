# Decision registry

Các quyết định dưới là bản thiết kế cụ thể để review/triển khai. Chỉ những lựa chọn ghi “Người dùng chốt” mới là lời xác nhận trực tiếp của Hòa. Các lựa chọn kỹ thuật còn lại là đề xuất đã được đưa vào handoff; nếu điều kiện thực tế mâu thuẫn, ghi conflict trước khi đổi.

## Stack, tổ chức và phương pháp

| ID | Quyết định | Căn cứ | Gate |
| --- | --- | --- | --- |
| ADR-01 | React+TS+Vite+TanStack Router+Tailwind | Người dùng chốt | WU-01 |
| ADR-02 | Tailwind ngay từ component đầu, không import stylesheet legacy toàn app | Người dùng chốt | WU-03…29 |
| ADR-03 | API contract trước; backend Hono+Drizzle+D1/Cloudflare | Người dùng chốt | WU-02,30…36 |
| ADR-04 | pnpm/Turborepo, packages ui/contracts/domain; adapters ở web, schema ở api | Quy ước đã có và boundary tối thiểu phục vụ yêu cầu | WU-01,29 |
| ADR-05 | Exact source tokens/font/icon/copy và CSS ngoại lệ có owner; bỏ Preflight, source-equivalent base | Lựa chọn kỹ thuật phục vụ fidelity | WU-03,29 |
| ADR-06 | Source SHA cố định, capture source riêng, target không tạo golden | Lựa chọn nghiệm thu; Playwright reference protocol | WU-00,29,36 |
| ADR-07 | Browser-history routing và whitelist alias hash có thật | Source chỉ đọc hash startup; URL được React quản lý có kiểu | WU-07 |
| ADR-08 | UI package không biết domain/router; feature controlled views dùng lại | Yêu cầu component reuse | M1/M2 |
| ADR-09 | TanStack Query là cache API; transient UI độc lập | Tránh nhiều bản task state theo view | M1/M3 |
| ADR-10 | Full UI giữ source; real auth/security/billing/invitations/ACL provisioning để sau | Scope POC từ source chỉ mô phỏng và provider chưa được chọn | WU-25…27,36 |
| ADR-11 | Một workspace seed thường dùng; workspace thứ hai chỉ test isolation | POC nhỏ, schema có boundary từ đầu; chưa SaaS provisioning | WU-30 |
| ADR-12 | R2 local cho file bytes; D1 chỉ metadata; một upload request/file | Cloudflare backend được chọn, source chưa lưu bytes | WU-35 |

## Data corrections được thiết kế có chủ đích

Các ID DATA dưới đồng bộ DATA_MODEL. Đây không phải quyền miễn mọi khác biệt visual. Mỗi scenario chịu ảnh hưởng phải ghi source initial state, action, source result, canonical result và vùng cần so layout. Không đổi màu/font/spacing của những vùng ấy.

| ID | Source hiện tại | Quyết định đích | Kiểm chứng |
| --- | --- | --- | --- |
| DATA-01 | Task attachments và project files có identity trùng/khác; có xóa bằng name | Một file record có taskId nullable; thao tác theo ID | Hai tệp trùng tên vẫn độc lập; rename/delete xuất hiện đúng drawer/Files |
| DATA-02 | `private` và `access` khác nhau; nhiều read path chỉ lọc client | Một visibility, server workspace/private checks cho mọi child/projection | Private task/comment/file/search không lộ; restricted shell giữ nguồn |
| DATA-03 | Duplicate có thể cấp key hai lần hoặc giữ subtask/dependency IDs cũ | Server cấp ID/key mới, remap quan hệ đúng phạm vi | Uniqueness/copy/relationship tests |
| DATA-04 | allTasks chưa loại task thuộc archived project | Active reads loại lifecycle của cả task và parent project | Archive project làm active metrics nhất quán |
| DATA-05 | Monthly dùng +30 ngày | Cộng tháng lịch, clamp cuối tháng; canonical mock và HTTP cùng rule | 31/01 → 28/02 hoặc 29/02; source correction ghi riêng trong capture scenario |
| DATA-06 | Nhiều Undo khôi phục toàn workspace snapshot; single completion chỉ reopen task | Giữ đúng các hành động có Undo trong source; bounded command record chứa inverse và version guards do adapter/server giữ, không nhận workspace snapshot từ client | One-shot/idempotent Undo; conflict toàn phần khi entity/association đã đổi. Single recurring completion Undo giữ successor như nguồn; column completion có inverse riêng theo contract. |
| DATA-07 | Upload 250MB chỉ là demo text/timer/metadata | Real cap 10MiB từ capabilities; bytes R2 thực | Oversize trả HTTP 413; upload/download checksum; live limit text là deliberate difference |
| DATA-08 | Due “Next 7 days” gồm today; groupToday và groupWeek có thể trùng; null sorting lạ | Giữ source semantics trong conversion; total unique không cộng group counts | Pure query fixtures; muốn sửa sau phải là yêu cầu riêng |
| DATA-09 | TaskForm nguồn chỉ gắn metadata tệp; không có commit bytes thật | Tạo task một lần rồi upload từng draft file; clientRequestId/hash chống tạo trùng, giữ partial state và retry file lỗi | Double submit/mất response không nhân task/file; Create more/reset theo commit state; canonical mock/HTTP cùng flow |
| DATA-10 | Source comparator trả0 khi bằng nhau nên giữ input order | Theo API_CONTRACT §6.2: mọi comparator kết thúc bằng ID tăng dần, kể cả sort desc; mock/server dùng cùng helper | WU-08 giữ expected source riêng và canonical riêng. Fixture tie/null có thể đổi thứ tự hàng; đây correction contract cho keyset pagination, không đổi source ảnh/baseline |

## Source quirks khác cần ghi nhận khi capture

| ID | Phát hiện | Quyết định cho conversion |
| --- | --- | --- |
| QUIRK-01 | Board tự sort theo order, có thể làm lựa chọn toolbar sort không thay card order | Giữ manual Board order trong parity; không tự phát minh sorting mới. Ghi source scenario và đề xuất sửa riêng nếu Hòa yêu cầu. |
| QUIRK-02 | Calendar day-overflow lấy task/event toàn workspace thay vì scope đang xem | Canonical target giữ scope/project/filter của calendar đang mở và authorization. Đây là correction để không lộ/hiện task ngoài scope; ghi scenario/diff dữ liệu cụ thể, giữ popover style/layout. |
| QUIRK-03 | Motion full bỏ data attribute trong theme.js, trong khi CSS dựa attribute để override reduced-motion | Chốt preference `full/reduce/system` hoạt động đúng tên ở target; visual snapshots dùng reduce hoặc chờ settled state; kiểm tra animation tách riêng. |
| QUIRK-04 | Font resource chỉ request 400/500/600, CSS có 450 | Giữ đúng font bytes/descriptors và resolved geometry; không đổi sang variable range rộng chỉ vì tiện. |
| QUIRK-05 | Table mobile có duplicate class attribute | JSX chỉ một className, ghép đúng computed classes mà browser nguồn thực dùng; so ảnh, không lấy union mọi attribute một cách mù quáng. |
| QUIRK-06 | CSS <=900 nhưng JS đóng drawer khi navigation <900 | Giữ khác biệt tại boundary nếu capture xác nhận; không biến cả hai thành cùng Tailwind breakpoint. |
| QUIRK-07 | Copy link dùng chuỗi domain giả; source navigation không giữ URL | Tạo canonical deep link thật theo Router, screen layout không đổi. |
| QUIRK-08 | Table task không có bulk selection; Board card không có selection UI giống List | Không đưa checkbox/bulk bar vào Table/Board vì tái dùng List controller. List bulk chỉ Status/Assignee/Priority/Delete/Clear như source. |

## Mock, DemoAdapter và source harness

**Canonical MockAdapter và HTTP adapter phải có cùng business semantics.** Source harness chỉ để chụp/đo source, có thể chuẩn bị dữ liệu post-state đã tương đương theo correction registry. Mỗi source vs target khác data phải có expected result có thể kiểm tra, không mask tùy ý. Baseline nguồn ban đầu vẫn giữ nguyên để chứng minh không sửa template/style.

`DemoAdapter` riêng chỉ dành auth/billing/invite/share/account management/provisioning chưa có real service. HTTP error không chuyển thành demo success. Thông báo sản phẩm dùng từ ngữ dễ hiểu như tính năng chưa sẵn sàng; không đưa tên binding, mock, migration hay chi tiết implementation vào luồng người dùng.

## Những việc chưa chốt, không chặn giai đoạn phân tích/UI

- Quyền dùng/phân phối code/logo/assets upstream: chưa thấy license rõ. Không tự gán MIT hoặc tuyên bố thương mại hóa được.
- Repo đích, package public name và deployment: xác định khi Hòa muốn bắt đầu môi trường/publish tương ứng.
- Auth provider production, real invitation delivery, subscription/payment và quản trị ACL đầy đủ: ngoài M3.
- Sửa due-group overlap/Board toolbar sorting và thêm thư mục, custom fields, calendar event CRUD: cần yêu cầu sản phẩm mới.

## WU-10 implementation decisions và handoff

- TaskForm source edit submit replaces `base.subtasks` (`actions.js submitTask`),
  nhưng API_CONTRACT6.4/6.6 chỉ atomic draft subtasks ở create. Task PATCH không nhận
  subtasks. Phase10 create add/remove draft children hoạt động atomic; edit existing
  children read-only/unavailable và giữ IDs/content. WU11 nối cùng form vào scoped
  parent child operations; đây là integration pending, không loại tính năng khỏi dự án.
- Description normalization dùng HTML5 parse5 tree allowlist trong pure domain,
  không DOM/regex sanitizer. `descriptionText` được derive từ final sanitized tree;
  internal mock map giữ canonical text, DTO contract không thêm field. Edit chỉ đổi
  plain description khi text thay đổi; save other fields preserves rich seed HTML.
- Single lifecycle commands dùng internal tombstones/actor-owned bounded inverse,
  UUIDv7/key monotonic, file ID/version và parent-version touches. Upload actor/request
  dedupe hashes actual bytes+metadata; duplicate filename không có nghĩa same identity.
- DATA09 form flow freezes payload/request/file intents; metadata sessionStorage
  scoped workspace/member, File bytes chỉ memory. Prepared:false giữ draft file rows
  visible lúc hashing, failure làm editable draft và zero-create. Partial task/file
  commit giữ successes, retry unconfirmed keys; reset/late response không redirect
  target. Confirmed edit move/version survives later PATCH/refetch failure.
- New uploads giới hạn canonical10MiB, source Files catalogue text250MB thuộc source
  simulation/parity owner22; không đổi capability hay claim HTTP/R2 bytes tại10.
- Pure domain boundary mở tối thiểu cho `parse5@8.0.0` (DOM-less HTML5 parser) để cùng
  sanitizer chạy trong browser/Worker modules; vẫn cấm Node/React/app/storage/network.

- WU10 visual acceptance is scoped original chrome/title/properties plus full panel
  geometry and separate form/file component samples. Original full default mobile
  context17/14 raster differences remain diagnostics pending WU11 full-body integration.
  Symmetric owner-component composition removes only out-of-crop unowned sections,
  with exact owned markup/rect/styles invariant; no production content, source CSS,
  comparator, tolerance or masks are changed to force that diagnostic to pass.
- Late file reselection captures state/files/intents before hash and checks identity
  afterwards. Reset cannot queue a new same-file failed intent or apply old UI errors.
  A hidden but mounted create form cannot dismiss/focus a later edit form after success.
- WU05 deferred return-focus respects a newer connected meaningful focus target
  outside the closing layer. Canonical List double-click creates an inline editor
  before the closing Drawer RAF; unconditional restore stole focus and blur closed
  that editor. Preserve that new focus; ordinary Close/Escape/nested return still
  follows existing opener semantics and is covered by scoped42/17 regression.


## WU-11 implementation decisions

- WU10's read-only edit children are now active in the same form through scoped
  create/delete commands and current canonical parent version. Child edits apply
  immediately; cancel closes scalar form draft and does not undo committed child
  commands. Task PATCH never replaces the child array. No new child Undo.
- Exactly six source editor actions use the existing parse5 allowlist and canonical
  description text. Link uses selected http/https URL, no prompt. Invalid selection
  uses the one existing info Toast and does not change section geometry. Native
  Range offsets/direction survive a sanitizer rebuild and sibling invalidation.
- Source synchronous subtask notes save on input; canonical PATCH commits on blur
  with parent CAS. Pending commands disable overlapping title/note/navigation.
  Per-child UI drafts survive error/close/reopen. Empty title is retained with a
  visible validation message instead of a successful write. Escape closes child
  intent through the shared dismiss reason and does not implicitly retry a failed
  blur write; canonical version/call-count regression proves this boundary.
- Comments are oldest-first and activity newest-first, both stable createdAt/id
  keysets with scope-bound cursors. Author derives from actor; mentions validate
  workspace members and never send delivery. Reaction add/remove are own
  set operations, idempotent, and touch parent version only when state changes.
  Own comment delete/restore uses tombstone/version and bounded actor-owned Undo,
  preserving reactions. Every child/comment/reaction write guards parent Undo.
- Composer asynchronous success uses captured per-task comment revision. Closing,
  reopening or switching tasks cannot let an old success clear a newer draft;
  canonical original scope still updates. Existing file chooser/drop/controller
  and real mock file IDs remain the sole attachment owner.
- Minimal listMembers read supplies canonical mention titles. Full People pages
  and global description/comment search remain later owners. Feature capability
  remains unavailable until all declared owning scopes complete; implemented
  operations do not return fake success for unavailable routes.

- AC1 reopening after base implementation60ad5a9 and documentation285045a:
  trusted native HTML drop inserted an img before the input boundary rebuilt the
  editor. Chromium already stripped script/handler/javascript protocol; executed0
  and finalForbiddenfalse do not erase the measured transient img gap. Prevent
  native drop default and normalize through the same parse5/plainDescriptionHtml
  helpers before insertion. Empty sanitized HTML is a no-op; use browser point
  caret and same-editor live selection Range for move, modifiers for copy.
  First internal native test copied MOVE twice while dropEffect reported none;
  retain that failure and determine intent from the captured editor Range and
  modifiers, with explicit dragOver cursor intent. Assertions use actual text,
  caret and canonical values, rather than treating dropEffect as proof. Six
  trusted native probes and two focused existing editor probes pass on Chromium;
  no second sanitizer, source change, new command or generic DnD framework.

## WU-12 implementation decisions

- Shared TaskBoard/Column/Card reads canonical scoped Query data and existing task fields/commands. Column dataset consumes all cursor pages, checks matching summary count, and marks coverage complete only after success; toolbar-filtered rows are a separate view of the same records. Board always orders manually (QUIRK-01); no selected cards or List bulk bar (QUIRK-08).
- Complete/archive/sortPriority require the complete unfiltered column set and versions, preserve max20 atomic rejection without chunking, and use one staged canonical owner. SortPriority extends the existing bulk operation rather than adding an endpoint; 83 operation bindings stay unchanged. Complete-column recurrence Undo differs from single checkbox Undo as declared in API §7.
- Source colSort writes fractional base+i*.001 while PositionSchema is safe integer and move requires available spacing. Canonical adapter writes base+i*100 with priority-desc/ID-asc ties. Per-column order is preserved; global List interleaving with other statuses may differ. Native sort→drag→List/reload evidence validates canonical persistence, not fractional source positions.
- Real source filtered drag retains filters, changes status and removes the card from the view. Target validates full unfiltered destination workspace/project/status + neighbors and access, keeps filters unchanged, and rejects collapsed-column drops rather than reusing a stale destination.
- Composer locks cancel/switch intent while create is pending; successful old requests cannot clear a later unlocked draft. Drag/suppression timers are cleaned up on unmount. UI stores intents/drafts/effects only; failed drop never optimistically changes canonical records.
- Captured card More point stays fixed when hover actions disappear, matching source ctxBtn. Native default browser drag image is the source ghost behavior; column drop line and card dragging opacity are production state. Project/saved variants are feature harnesses only until WU16.

- WU-04 Input owner reopening: measured native search Input padding-block0px in
  source and1px in target. Original components.css227–239 declares padding0 10px.
  Add literal py-0 to shared Input only; Textarea keeps its explicit8px padding.
  This fixes a missing source rule, not a demonstrated cause of previous tiny
  pixel differences. Scoped Input/toolbar/List/Drawer/form/Board checks record
  actual results separately and preserve historical accepted evidence.
- M1-I07 is a native recurring journey on the same task, not only data tests:
  Drawer Weekly selection, complete→exactly one successor, single Undo keeps
  successor/slot, re-complete/reopen creates no duplicate, List/reload persist.
  Column completion Undo separately cancels eligible newly-created successors,
  as API7.4 specifies. No direct API mutation prepares the primary M1 journey.

## WU-13 Table implementation decisions

- Keep native HTML table/colgroup, one shared eleven-column registry and separate
  mobile flat cards at≤640. No table framework/selection/bulk/pagination added.
- Source Project _projHidden is initialization, not a permanent hidden-column rule.
  Initialize in controller personal preferences; permit re-show and preserve it
  per project/saved view. Title cannot hide; Reset widths preserves hidden columns.
- Reopen the preparatory domain40..1000 width guard to finite≥64/unbounded, matching
  actual source pointer resize. Measure rendered col/table widths because native
  min-width100% stretches a narrowed preset. Commit integer width and source60ms
  click suppression; pointer cancellation/unmount remove owned listeners/timer.
- Keep canonical estimate enum and explicit WU13 draft/error retention. Source
  arbitrary-estimate and empty-title discard are documented behavior corrections.
  Editor mount focuses/selects once; pending/error/cache renders do not refocus a
  newer search/menu/Drawer. Clear old command error when starting a new intent.
- Current Table raster corrections: source faint maps to target muted (text3),
  remove unintended inner button clipping while keeping td clipping, labels gap4,
  and editing estimate drops display-only tabular numerals exactly as source.
  No global Label/Input/font/token change or production paint workaround. These
  results do not establish causes for historical WU10 mobile17/14 differences.
- Actual original-source native first title double-click produced two trusted clicks
  (detail1/2), no dblclick event/editor and a Drawer. The source action replaces the
  td after click1. Preserve that observation in source-interactions.json; target
  retains its row and completes the source DBL.editCell intent on native dblclick.
  This required inline-title correction is distinct from source tcell/state editor
  geometry/focus capture, which remains original renderer evidence. No source
  template/listener mutation to force a native-source pass.
- WU08 field owner reopening after root found a TD/button anchor mismatch:
  optional stable popupAnchorRef separates Table TD placement/outside scope from
  inner button return focus. Same-padding click toggles; Choice q and Date month
  reset on open transitions rather than only on a button handler. Shared Date
  uses the original calendar-only body in all contexts; remove the invented
  manual Apply form, preserve canonical schema/range guards and failed attempts.
  Choice plain search and local Project/Labels dots match locked source rules.
- WU05 minimal owner reopening: trusted printable search typing was intercepted
  by Menu typeahead, so exclude text editors from that branch only. Popover
  horizontal overflow uses source flip/max8 rather than an extra upper clamp;
  Tooltip behavior remains. QA duplicate placePop after original render was a
  capture artifact, separately corrected and recorded. Border shorthand was a
  rejected width hypothesis, not a proved causal correction.
- Accept five Table popup states and one actual Drawer Date state at strict0 with
  repeat0; retain original41 closed Table pairs unchanged. Extra Workspace and
  Project List Date captures remain unaccepted raster debt (558/8814 after source
  render, native2 each); matching geometry/fonts/styles does not prove a cause.
  Do not claim all field popup parity or hide those cases behind accepted Drawer.


## WU-14 Calendar implementation decisions

- One controlled Calendar renderer for Workspace/Project/My Tasks; actual
  Workspace and My Tasks routes, Project feature harness until WU16. Context
  mode normalization prevents Workspace Tasks ?mode=calendar and My Tasks
  ?mode=board/table from rendering unsupported controls or event intents.
- Calendar min35/42 cells follows original cells[35].month trim (February may
  still35). Inline min-height640 and repeat minmax112 override source mobile
  grid-auto-rows72; preserve actual source geometry rather than the dead rule.
- Primary complete due-range dataset owns count/chips/overflow. A second complete
  full-filtered-scope query using the same loader/cache preserves source legend
  projects outside visible dates; extra query cost and invalidation are explicit
  in API_CONTRACT. Stable UUID tie preparation follows DATA-10.
- QUIRK-02 correction: popup preserves current project/assignee/filter/access
  scope, including events; raw original source leak fixture/PNG/HTML is kept
  separately from the scoped source input fixture used for layout comparison.
  Only input data is corrected, never source template/CSS or comparison tolerance.
- Date drag uses pure rescheduleDateOnly + existing PATCH/cache. Actual source
  shows a plain Rescheduled toast, no Undo; no invented inverse for date PATCH.
  Successful moves can unmount the old chip before dragend; release the 60ms
  click guard on drop as well as dragend, preserving accidental-click protection.
  Failed native telemetry retains trusted drop with absent dragend.
- Source A.newTask resets cancelled fields except Create more. Typed seeded
  day-add resets title/description/project/due/labels and other draft fields in
  the existing form. In-flight/frozen TaskSubmission keeps original payload,
  request ID and recovery semantics; native held/create retry probes verify one
  commit and no stale callback opening a different Drawer. No new composer.
- At641 full source legend wraps and toolbar shrinks, covering Week pointer
  center with a Month cell. Source and target trusted mouse attempts retain
  Month; native keyboard navigates to Week. Preserve matching source geometry
  and record the limitation; image pass is not a mouse-pass claim. The source
  feature action renders connected #app, then the feature capture is explicitly
  recomposed with original calendarHtml; no claim that external section rerenders.
- No source font/template/baseline/tolerance edits or raster workaround. Existing
  WU10 mobile17/14 and WU13 extra unaccepted List Date558/8814 remain unproved
  debt; Calendar work does not claim to repair them.

- Supplemental whole-content audit: all42 required Calendar-owned cases are
  strict0. Actual Workspace/MyTasks mobile add two strict0 pairs. Both desktop
  whole-content supplements retain context-variable search-input corner0/5
  outside Calendar ownership, with Calendar/35-cell geometry equal. Root technical
  scope review permits required42 +2 mobile acceptance while preserving both
  desktop scopes as EXTRA UNACCEPTED M2/full-parity/WU29 debt, even a current0.
  Full46 and four-page commands actually exit1; no failing sample is made passed.
  Latest audit is Workspace0/Mine5; earlier5/0 console result was observed but
  its temporary report/PNGs were overwritten before archival, no old hash claim.
  Selected input styles/rect match; native settlement and original-render source
  match. Trusted search-clear gives0 but changes source11 pixels, cause unproved;
  it is not substituted as baseline or production workaround. Never choose only
  a passing desktop frame to claim parity.

- MyTasks390 Month has the same source mode-control overlap with weekday header:
  Week center x101/y253.359375 hits Tue, trusted click keeps Month in both; native
  ShiftTab1 and Space/ArrowRight navigate to Week. Preserve geometry and record
  this alongside641; Calendar images do not imply all mobile pointer controls
  work. Original source action updates #app and visible feature is explicitly
  recomposed. No physical-phone claim or CSS/raster fix.


## WU-15 Timeline implementation decisions

- One controlled Timeline renderer serves actual Workspace and Project feature
  harness; full Project wrapper remains WU16. Pure DateOnly geometry keeps
  91/238 days,32/11px widths,36px rows, source rail breakpoints, inclusive bars,
  progress, dependencies and merged/collision-aware milestones.
- Source's internal date comparator returns -1 on equal dates: presentation is
  date ascending plus reverse incoming ordinal. Read-only original renderer
  probes prove equality for25 generalized cases. API §6.2 stable-ID query/cursor
  sorting stays unchanged. No date/position/ID/font/source/baseline mutation is
  used. Old wrong target tie-order14982 strict diff remains diagnostics.
- `timelineHtml` calls `groupTasks(ts.filter(t=>t.due),...)`: the fresh filtered
  array means sorting a no-group array does not mutate original `ts`. Dependency
  `ts.flatMap` paint order stays incoming query order in all4groupings. An earlier
  no-group mutation hypothesis was wrong and reverted; original path probes
  prove the correction. Group project in Project context falls back status while
  bar colors still follow requested grouping, preserving actual source code.
- API §6.3 overlap corrects source's missing range filtering at input only. Raw
  outside-range source is retained from a separate fresh context, avoiding
  source tlInit scroll-state leakage between raw and corrected captures.
  Start-only query matches can count without producing bars. Milestones retain
  all dates from authorized active Bootstrap projects, unaffected by task filter.
- Existing PATCH/rescheduleDateOnly preserves duration and due-only omitted
  startDate. Total pointer delta includes scroll; Escape/pointercancel/blur/
  unmount cancel. Source ignores scroll and Escape (native scroll moves1 versus
  target3days, Escape commits2 versus target0); these are explicit WU15 contract
  corrections, not claimed source behavior. No dependency cascade.
- Source plain Moved toast has no date-drag Undo. Existing Drawer completion Undo
  remains canonical. Real CAS failure invalidates existing projections before
  retry; no independent task store or command owner. Panel stores only scoped
  per-zoom UI scroll positions through loading/refetch, and Router search controls
  actual mounted Workspace Back/Forward.
- Automatic approval review rejected a proposed fixture-position-slot swap twice.
  Neither mutation executed. Work continued with immutable input and proved
  source presentation geometry; no blocked action or user permission remains.
  Abandoned fixture/edge hypotheses are not accepted provenance.
- Acceptance is48 full visible Timeline renderer pairs (44feature+4actual
  Workspace route clips), not whole page/toolbar/AppShell or ProjectPage.
  Original173Darwin and inherited unaccepted raster debts remain unchanged.

- Root supplemental original #app zoom probe (actual exit0): Week900/180, first
  Months489/0, Months scrolled450/72, trusted Weeks return0/0 and trusted Months
  return0/0. data-keep only restores matching DOM keys during one render; tlInit
  remains1 on returning zoom. Target Panel Map scroll continuity is a WU15
  contract interpretation/correction, not source behavior parity. Existing target
  native actually asserts Weeks900/180 restoration after Months450/72 setup; it
  does not assert a subsequent Months return. No runtime/PNG/fixture change.
  See evidence/WU-15/root-source-zoom-observation.json for reviewer provenance.

## WU-16 bounded source/contract decisions

- API5.1/WU16-AC5 common RestrictedProjectDto takes precedence over source
  catalogue private-field leaks. Original private p6 CustomerPortal and all seven
  catalogue identities remain unchanged. Raw default three-layout images remain
  separate from strict allowed-project native Website-search states. Public lead
  is permitted; private membership/progress/count/team/start/last fields are not.
- API §8 canonical activity newest-first takes precedence over Overview source
  unsorted array slice. Raw p1 Overview/source first-six and target latest-six
  IDs/order/times are retained; strict full Overview uses genuine p2 original
  three activities and empty p7 without fixture activity reordering. Activity
  remains combined records and preserves source live comment+activity two rows.
- Source editing lead appends member grants; typed PATCH explicitly preserves
  grants. Source Save from a saved tab reads `p:` filters; target explicit save
  uses the active current filters under the saved-view contract. Personal view
  edits do not autosave definitions. Only List/Board/Table are saveable.
- Source Share unknown email claims an invitation was sent. Target explicitly
  adds a local demo guest and says no invitation was sent; canonical grants and
  API principal remain unchanged. Remove Undo is CAS-bounded local demo state.
- Source mobile Sidebar z70 obscures first modal z61. Unit-local project overlay
  opening closes navigation without stealing initial focus and returns to its
  visible opener; generic overlay defaults stay unchanged.
- Source Card `.pcard .more` matches its overflow avatar. Preserve full seven
  memberships and genuine +4 DOM while reproducing scoped position/opacity/
  hover/Options-front hit behavior; normal avatars retain source relative
  position and overflow-only stacks are static. No data truncation was used.
- Source Project nav is replaced/reset by real go/openModal. The owned Project
  nav resets after router onRendered restoration on genuine path changes and
  saved-dialog lifecycle; global router restoration is unchanged.

These are explicit bounded WU16 choices, not acceptance of inherited raster debts
or permission to modify locked source templates/styles/fixture/baselines. Files
PR-07 remains pending WU22. Managed Linux evidence does not replace173Darwin or
physical-device/user acceptance.

WU-16 terminal child reads take precedence over cached data only for actual
403/404 at existing overlay controllers. Missing active-navigation project is
not evidence of revoked access because Bootstrap omits archived projects;
Drawer resolves that identity with canonical getProject. This bounded correction
prevents a reproduced route crash on project delete while preserving archived
and transient-cache behavior. It does not broaden the authorization model.

WU-16 embedded Calendar/Timeline tab motion follows the original Project taskViewBody: toolbar and view are two independently animated visual siblings. Their controlled Project compositions use display:contents; owned selectors animate the real boxes, and completion ignores hidden/non-box wrappers. Generic external renderers retain their default composition. Actual Source and native Target owner/lifecycle evidence is in WU16/source-interactions and interactions. Source/Target native app-ready navigation corrects the demonstrated capture setup mismatch, while cold-link raster evidence remains unaccepted. This decision does not assert a cause for every rounded border/SVG residue. Actual Project Select transition shorthand/ease differs from generic route easing and is owned locally; Input already matched via the earlier local override.

- WU16 final runtime decision by independent root technical review: accept only
  the named matched Source+Target Chromium145 Linux full-raster profile for the
 45 strict content/dialog workflows (24actual gates0,45pairs0), after causal real
 consumer partial-raster evidence and source-faithful Share read-owner repair.
  Keep default31/45, oldfull44/45 and every inherited/new raster debt unaccepted
 for WU29; do not modify Source/baseline/tolerance/masks or claim Darwin/fullshell/
 physical/userapproval. Files body remains WU22. See WU16 qualified review JSON.

### WU-17 bounded dashboard choices

- Distinct source Home/Workspace Overview compositions share exports. Existing contracts suffice; complete authorized aggregates/cursor reads supply totals, segments and current activity titles without200-task caps or counter stores.
- Default locked Home first-seven and canonical newest-seven activity IDs match; no default fixture correction is used. Newest order for synthetic unsorted history and archived/private/deleted/missing project-parent exclusion are explicit canonical corrections, not blanket raw Source pixel acceptance. Archived-task history remains with active authorized parent. Source strict rolling elapsed seven days uses completedAt, including raw future-instant predicate.
- Selected Home tab is workspace-scoped transient UI state above the page; Source navigation retention needs no module global/server-state copy. Shared Choices optional segmented tabs preserve default radios.
- Passive owned count-up start repairs measurement ambiguity: development zero DOM commit may lag clock. Both intervals remain evidence; no timing/easing/layout-effect/paint change chases an observer floor.
- Invite member opens the existing Members route. Its invitation form belongs to its later owner; no grant/success/real invitation is invented here.
- WU17 matched Linux content scope requires its own root review. Default/Darwin/fullshell and inherited WU29 debts stay unaccepted.

WU17 final root review accepts only the named matched managed Linux dashboard content plus6 affected shared-mini consumers, after actual21required+3supplemental pass and native/source/data proof. Reconciled runner schedules21unique gates; the unintentional sequential duplicated mini executions remain recorded with honest first-report/log byte loss. This does not accept default/Darwin/fullshell/fullproject parity or clear inherited WU29 debt.

### WU-18 bounded display metadata and ownership

Root authorized optional read-only `WorkspaceDto.planLabel` for Source-faithful Palette workspace catalog. Seed maps exact existing Source labels, HTTP may omit the optional field, and no create/PATCH input or billing schema is extended. WU25/31 canonical catalog owner closes the integration. Search remains a single typed operation; Source task30 cap/private-parent quirks are explicit integrity corrections. Global ModK/ModShiftL retain Source typing exceptions; plain keys suppress input/textarea/select and inherited contentEditable. OverlayProvider owns Escape/focus; existing form/editor/composer handlers own their local keys. Recent search history has one UI-only shell context owner scoped by workspace/member.


### WU-19 single records, Source reply and inclusive preview

Source layout distinguishes Inbox unread badge (all except updates) from Notifications unread badge (all types). Both are projections of the same principal-visible records; unequal numbers are intentional. Counts/list/mutations share authorization and parent deletion checks, including project/task identity consistency. Canonical task/comment IDs and current fixture member names are retained.

Source Inbox composer has no avatar, attachment button or mention picker. The existing Comments composer exposes a scoped Inbox presentation; mentions still parse actual names into IDs, and attachments remain available in the Drawer. Successful replies alone call the existing typed notice owner (`Reply posted`); failures retain drafts. There is no secondary message model or event bus. Inbox preview is fixed fullscreen with z48 at the exact inclusive `<=900px` boundary; existing Drawer remains z50. The mounted rail preserves scroll, Back clears selection and restores focus to the originating row or visible list fallback.

WU-19 evaluates the previously qualified matched BOTH Chromium145 Linux `--disable-partial-raster` profile in its own content/preview scope, with threshold0/includeAA/no masks and the original Source fixture/styles. Root must explicitly review this unit's scope. This does not accept default raster, original Darwin baselines, full shell, devices, user approval or the complete project. All inherited visual/missing-byte/order debts remain WU29 obligations.


Source Back clears selection and preserves rail scroll but leaves focus on BODY. Target restores focus to the originating visible row or rail fallback as an explicit accessibility policy. This is not presented as identical Source focus behavior. Source Inbox category-count closure observes the filtered list through late binding; tab counts therefore follow the current category/unread view, while Sidebar principal counts remain independent.


### WU-23 canonical Settings and bounded Source corrections

Settings uses canonical workspace, current User profile/membership and MemberPreferences operations, staged persistence before memory commit and existing query invalidation. Profile name/title are not copied into preferences; the existing five-field UI theme cache is a projection for startup paint. Failed edits retain drafts; color Retry preserves the exact failed operation, and later preference changes send all pending keys. Source motion dropdown remains system/reduce; the existing full contract is supported without adding a Source-absent choice.

MemberPreferences accent incorrectly inherited project colors. The WU23 prerequisite correction replaces only that preference enum with the six Source colors indigo/blue/violet/teal/rose/graphite, including validation; project colors remain unchanged. This minimally reopens the WU02 preference contract to close WU23, not a catalog refactor.

The original Source profile validation render resets blank name to duplicated prefs.name. AC2 requires retaining the blank draft against the canonical profile. Original matrix01 raw362 remains failed; qualifying comparison projects only cloned fixture.prefs.name to empty while Source current member/avatar/title stay unchanged. No Source file/style/template is edited. The locked timezone is absent from Source options, so native/enhanced selection displays the first Pacific option; Settings reproduces this value projection without altering the stored timezone or creating timezone behavior. Language/time selections keep English labels; Source dateFmt also controls old Files/comment/activity absolute-date fallbacks and past-year MMM d includes the year.

QUIRK-03 explicit full sets data-motion=full and overrides OS reduce for the existing motion branches. This is a deliberate correction, separately measured on Target, not Source-full parity. System/reduce defaults are qualified against actual Source computed phases and archived Target default samples. Native Source recreates section body/nav and loses nav focus on route changes; Settings keys those owned nodes and resets them on typed Router onRendered after nested restoration when pathname changes. Same-section rerenders preserve body scroll. No timer, global focus blur or routing-wide behavior is added.

Workspace destructive confirmation preserves Source layout and typed-name control, but respects existing demo/unavailable capabilities: no dataset reset, fake auth redirect, HTTP fallback or service-success claim. Security/Billing/Members/Teams and real HTTP/D1/R2 provisioning remain later-unit scope. All existing WU10–22/WU29 raw failure/raster/missing-byte/default-positive-progress debts are preserved.


## WU-27 scoped demo onboarding and service boundary

Six Source steps remain usecase/workspace/workstyle plus teamsize/project template/invites/completion. Service-owned validated datasets form an independent workspace registry; the typed facade owns UI draft/receipt. Immutable per-flow project identity survives mutable order/name/time and retry/reload. Finish never renames seed workspace or merges foreign rows. One canonical seed principal owns global profile CAS/persistence; scoped memberships project it while preserving workspace role/team identity.

HTTP explicit demo completion rereads actual configured seed session, creates no real workspace/project/account/provider/email/invitation and never falls back to Mock. Source fake URL availability, Send invites and sent/joined summary conflict with the authorized demo boundary; Target says Demo URL, Save invites, saved demo invitations and No emails are delivered. Canonical demo setup link grants no access. Original Source DOM/copy/full raw differences and exact text/control geometry are retained. Natural animated completion SVG varies0..29 pixels in independent Source contexts; normal raw residuals remain unaccepted strict parity. BOTH OS-reduce static cohort is a separate qualified runtime, alongside actual normal/stored/OS motion proof, without Source changes/masks/tolerance/default/Darwin claims or inherited WU29 debt recovery.


## WU-28 Archive, Source actions and truthful dev boundaries (IN_PROGRESS)

Archive uses the existing typed listArchive contract with privacy projection, full stable cursors, canonical identities and CAS. Source tasks exclude archived parents and sort archivedAt descending; projects preserve entity insertion order, independently from personal Sidebar reorder. Project totals include archived child tasks but exclude canonical tombstones. Restore has no added Undo; restored task toast Open routes to the same ID. Source purgeTask always confirms irreversible physical deletion with no Undo. Canonical M3 supports a tombstone rather than physical purge, so the current confirmation explicitly says permanent deletion is unavailable and exposes no extra inverse. Eleven Source canonical Undo sites use existing undoCommand; two member removals are local demo inverses and the gallery Undo is a local preview. No workspace snapshot rollback is introduced.

Dev pages compose the current workspace AppShell/overlays/typed feature owners. Mock offline uses one service boolean that rejects actual writes; host reinitialization reads that same owner so scope transitions keep the banner and write boundary consistent. Retry previews a connection after700ms and does not claim synchronization. Reset resolves the actual returned seed workspace, clears owned scoped data/drafts/facades/preferences while preserving Source theme, guards stale/cancelled async navigation and never resets HTTP/server records. HTTP unavailable signout/access/invite/reset controls show explicit preview capability, never fake provider logout/email/ACL/provisioning. Existing RestrictedProject.lead.name is safe canonical display metadata; no hidden email or ACL payload is read.

Actual Source contextmenu ignores editing inputs; mention outside click/Escape has higher priority than Drawer; native Sidebar project and column option context use existing owners; selection Escape follows local/defaultPrevented/overlay/mobile priority and also works on checkbox/ordinary text inputs. Drawer external browser Files dispatch forwards existing upload intent anywhere while nested drop/composer defaultPrevented guards prevent duplicates. Verification qualifies dispatched DataTransfer+File as a synthetic browser boundary, not OS file drag. Cold Source List double-click legacy rerender can remove the intended editor; Target preserves canonical task/scroll through same-surface Drawer query changes without disabling ordinary pathname/query/back restoration.

COMMAND_INTEGRATIONS current WU28 appendix closes earlier Settings/Files/catalog/plan/signout UI ownership with actual selected native and HTTP evidence; historical pending rows are retained as historical checkpoint statements. Real backend/auth/provider/billing/provisioning and physical purge stay capability boundaries. No later unit is implemented.

## WU-32 task persistence and current contract corrections

Task create/PATCH reuse the existing domain parse5 HTML5 sanitizer in the Worker. Canonical HTML length is checked after normalization and before persistence, preventing a committed row followed by a response-schema failure. Monthly recurrence retains the existing calendar-month correction, including end-of-month/leap-year behavior. No new sanitizer, schema migration or dependency stack is introduced.

Current documented create retry rejects a task moved out of its original requested project; the prior Mock allowed this. The minimal Mock correction checks that project/lifecycle while retaining the current DTO after ordinary edits, and hashes normalized intent without clientRequestId and with sorted relation sets. Exhausted integer neighbor gaps previously returned repeated conflict in Mock; bounded same-scope resequencing now matches DATA_MODEL §6.1 in Mock and HTTP, touching changed row versions atomically. These corrections belong to WU-32 task commands.

The source and canonical Mock accept a same-workspace nonremoved invited assignee. The active-membership requirement governs the authenticated principal, not assignment. HTTP preserves that task-field behavior; cross-workspace or removed assignees remain invalid. Private mutation requires edit access and an owned Undo reauthorizes current scope, returning403 for known forbidden access. Inaccessible dependency IDs are filtered from projections/implicit copies; retained hidden joins do not block unrelated scalar edits, while explicit dependency edits still validate the graph and touch changed destinations.

Task Undo snapshots store actual final SQL postVersions after all same-batch writes. Single completion inverse retains its recurring successor/history and appends reopen; column inverse restores parent snapshot timestamps and cancels only unchanged new successors with exact child/reference guards. Incoming-reference add/remove increases the destination version, preserving ABA conflicts. IDs/sequences stay monotonic. All task/bulk/column effects share the fresh native D1 batch marker; SQL0 is conflict rather than a claimed rollback. The coarse tasks capability stays unavailable pending WU-33 nested operations, without disabling completed WU-32 core routes or reporting future success.

## WU-33 nested task persistence and history

The typed operation manifest has four subtask operations, six comment/reaction operations and the activity read. Dependencies and labels remain task PATCH fields; comments remain literal plain text without an edit endpoint. Promotion maps the plain subtask note through plainDescriptionHtml and the existing Worker sanitizer, copies the parent's labels/priority/project and assignee fallback, and allocates the new key in the same guarded native D1 batch as child removal and both activity records.

Comment deletion retains reaction rows and creates the existing bounded comment.delete Undo. Its recorded comment and task post-versions come from SQL after the domain writes in that batch. Effective reactions increment both versions; repeated PUT/DELETE requests are idempotent without timestamp/history/version effects. Nested mutations retain canonical Mock aggregate timestamp behavior. Current project grants, parent lifecycle and child identity are guarded again at the SQL boundary. Mention IDs are scoped in-app data; no delivery engine or notification rows are generated.

Comments use oldest-first tuple cursors and activity uses newest-first tuple cursors. A removed cursor row does not invalidate continuation. Activity hides retracted records, inaccessible canonical task parents and old-project history after task moves. Known own Undo records distinguish forbidden current project access (403), changed parent lifecycle (409) and absent/foreign targets (404); consumed replay still reauthorizes its current scope.
