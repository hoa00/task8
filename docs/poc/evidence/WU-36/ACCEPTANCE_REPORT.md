# WU-36 — M3 local HTTP acceptance

Required current application checks PASS. Root technical/index gates and actual implementation/documentation commits and normal pushes are pending at this report's initial freeze. See `root-pass.json`, `checkpoint.json` and PROGRESS for actual later Git results; this report does not predict them.

This is a local POC acceptance on Node24.13.0/pnpm11.19.0, Wrangler/workerd with actual D1 and FILES R2, and Chromium145 on Linux. WU01–35 prerequisites existed at base `941a245453f941c2cb70c92d2e5fd3f0894e0c1a`. Source is read-only commit `904205c626918ee96054eb35495c394a60c0c601`. No production deployment is claimed.

## Current executed evidence

| Evidence | Actual result | Scope |
| --- | --- | --- |
| [journey08](attempts/journey08/report.json) | PASS47 HTTP probes/12 checks | Native List/form/Drawer/Board drag/Table/Calendar/Timeline/My Tasks, Home/Overview/counts, actual attachment, warm Files archive/Undo, Files Preview/Back/reload/direct Close/foreign404, retained network/409 draft, production restart |
| [scope06](attempts/scope06/report.json) | PASS11 probes/4 checks | Actual supplied label order, native workspace switch cancels old HTTP responses, secondary IDs/current return, trusted alternate principal and ignored arbitrary user header |
| [tasks01](attempts/wu36-tasks01/report.json) | PASS316 probes | Current task CRUD/query/filter/date/recurrence/concurrency/bulk/column/Undo, actual D1 final guards/FK rollback |
| [collaboration01](attempts/wu36-collaboration01/report.json) | PASS219 probes | Current subtask/promotion/content/comment/reaction/author/parent/privacy/Undo/rollback |
| [projections02](attempts/wu36-projections02/report.json) | PASS186 probes | More than200 rows, complete cursor datasets, authorized totals, Home/Overview/search/calendar/archive/preferences/favorites/order/views/notifications, current production restart |
| [files01](attempts/wu36-files01/report.json) | PASS140 probes/20 checks | Actual multipart/binary/R2 checksums, scoped identity/lifecycle, compensation/uncertain outcomes, real UI partial-file retry/stable keys, production restart/no hooks |
| [lifecycle01](attempts/lifecycle01/report.json) | PASS35 probes/2 checks | Required C05 follow-up on unchanged production Worker and actual journey08 storage: archived/deleted project excludes children/counts/search/calendar/file metadata/content; restore restores checksum and exact task detail |
| [visual04](attempts/visual04/report.json) | PASS12 selected strict samples, all diff0/repeat0 | Same fixture/state, widths1440/390, threshold0/includeAA:true/no masks. Desktop Timeline rail only; mobile Timeline visible project-body viewport has responsive-hidden rail. Full Timeline1440 audit61 remains unaccepted |

Creation response [browser-response-0009.bin](attempts/journey08/browser-response-0009.bin) has task `01a127b6-7167-7cd4-83dc-7f0f6787e9bb`, key `WEB-201`, version1; actual file attachment bumps task to2. Final persisted task version18, file `01a127b6-71f1-7d03-9e49-b559268567f2`, SHA256 `7c9e723775fc86e3bd260892d5fe7d84b1689026e0d167a98470c0c57172c25e`. Task detail/subtask note/completion, description formatting, comment text and rocket reaction survive browser reload and a clean production Worker restart. Lifecycle follow-up restores the exact same task detail and bytes; it changes only the parent project's lifecycle/version,1→5.

## ACCEPTANCE §6 matrix

Every PASS below is limited to the actual local capabilities and evidence identified. Unit-specific historical suites are executed as current copies under WU36; obsolete future-capability501 assertions are adapted to the now-implemented contract. Original older suites/evidence are unchanged. Adaptations and first failures are retained in `regression-adaptation*.json` and attempts.

| ID | Result and actual evidence |
| --- | --- |
| M3-C01 | PASS: journey bootstrap/session/create/query/mutation parse shared schemas; tasks/collaboration/projections/files validate success and typed400/403/404/409/413/500 error envelopes. DTOs are parsed independently of raw SQL snapshots. |
| M3-C02 | PASS: tasks `date-set`, `date-merged-invalid`, `nullable-clear`, `monthly-complete`, twenty leap-month column successors; shared contract93/data170 tests cover invalid dates, null versus absent and clamp rules. |
| M3-C03 | PASS: tasks five parallel new keys and simultaneous one-key task replay, duplicate nested mapping. Journey two parallel projects201/201 allocate MCA/MCAX; parallel duplicate200/409 then explicit fresh200 retry allocates MRA/MRAX,9 mapped tasks each, reset/remapped subtasks and internal dependencies. No client allocation counter. |
| M3-C04 | PASS: tasks all11 sort fields/both directions and scoped filters/cursors/totals. Projections235 fixture rows per scope demonstrate full-view cursor loading beyond page1, summary/calendar/Timeline/Home/Overview/search completeness or bounded incomplete error. |
| M3-C05 | PASS: projections archived-parent search/calendar/archive/restore and counts. Lifecycle35 actual production probes verify both archived and deleted p1 exclude active tasks/counts/search/calendar/files/content/direct child; catalogue409 archived/404 deleted, content404. Both restores return exact child DTO and original R2 checksum. |
| M3-C06 | PASS: all four current native regressions use trusted server-configured principal/workspace/grants plus foreign/private reads/writes/children/projections/content,403/404. Scope06 native secondary membership fixture is UUIDv7 with valid copied preferences; old responses abort, destination IDs belong to secondary scope, return reads fresh server data; arbitrary `x-user-id` does not replace configured identity. |
| M3-C07 | PASS: journey server stale-CAS409 and frontend stale409 compare all24 tables byte-for-value equal; frontend retains editable title draft. Current regression final-native no-op/root CAS guards have no production partial effects. |
| M3-C08 | PASS: tasks real D1 FK create/bulk/column/Undo rollback; collaboration promotion/comment/reaction/Undo; projections prefs/view/order/read-state batch rollback; files confirmed rollback and final actor/grant observations. Snapshots cover all24 tables, including history/Undo/associations. |
| M3-C09 | PASS: tasks validates scope/version/foreign neighbors/exact column member set, twenty full-column recurrence targets, max bulk20, stale/FK failure all-table no effects, task moves migrate file association. No page-first counter is authority. |
| M3-C10 | PASS: current task/comment/file bounded inverse success/retry/concurrent replay/conflict/association/ABA/lifecycle/actor/grant guards. Files actual same-Undo winner followed by actor409/grant403 leaves all24 tables unchanged and winning bytes/result retained; current authorized replay returns stored result. Native journey archive Undo returns Files child. |
| M3-C11 | PASS: collaboration actual sanitized parse5 content, literal plain comments, own-author parent policy, nested promotion/remapping, concurrent one-per-actor reaction, cycle/cross-scope validation; native rich bold description, completed child/note, comment/rocket persisted. |
| M3-C12 | PASS: projections actual user/workspace preference/notification/favorite/order ownership, named-view CAS/shared scope and full24 rollback; production restart retains personal state/view/order/profile. Unsaved data tests preserve named views without implicit PATCH. |
| M3-F01 | PASS: files and journey multipart actual bytes→D1 metadata+R2 object, typed file identity and original/download/reload/restart checksums match. No file bytes stored in D1. |
| M3-F02 | PASS: files same-name independent IDs, rename/duplicate/delete/restore affect owned ID and Drawer metadata; actual shared catalogue/Drawer preview bytes and warmed Files lifecycle invalidation reflect correct file/task. |
| M3-F03 | PASS: files fake PNG400, actual10MiB+1 bytes413, private/task/foreign scope errors and no ready metadata success. HTTP capabilities/display use10MiB; Source visual text correction links DATA07 exactly. |
| M3-F04 | PASS with explicit uncertainty: actual confirmed D1 rollback cleans owned unreferenced object; committed/lost R2 or D1 ACK/read failure and pending negative read preserve/log intent+bytes. Actual late commit/retry resolves stable identity; concurrent confirmed loser cleans only its key. Cleanup failure remains recorded error/unresolved object; no orphan-free guarantee. |
| M3-F05 | PASS: files native TaskForm two files/one upload failure retains one task, attached/failed drafts and stable UUID request keys; mismatched file reselection makes no request; Retry only failed upload, no second task; Create more resets only after both complete. |
| M3-F06 | PASS: files delete retains tombstone/R2 bytes for bounded current-parent Undo; private/foreign content404, current grant403 and actor409 guards prevent bypass; no public storage URL. |
| M3-F07 | PASS: files sample duplicate remains sample/contentAvailable:false, R2 set unchanged; original sample content404. Source artwork is preserved without fabricated original document bytes. |
| M3-F08 | PASS: journey actual Files native Preview→Back, reopened→reload→checksum download, direct-entry→Close remains Files in app; foreign file404 shows unavailable dialog with no wrong preview. Current file/project scope validated before preview. |
| M3-J01 | PASS: migrated/seeded native D1/R2, HTTP bundle/proxy, actual trusted bootstrap principal/workspace/capabilities. |
| M3-J02 | PASS: seeded projectp1, native List full form creates task/subtask/file; creation key/version/ID and byte checksum retained. |
| M3-J03 | PASS: native Drawer fields, Board drag, Table priority; same identity in Calendar/Timeline/My Tasks and field/count assertions in project summary/Home/Overview. |
| M3-J04 | PASS: native subtask/note/completion, rich description, comment/reaction; Drawer and Files checksum downloads, browser reload, unchanged production Worker restart persist exact child/detail/comments/bytes; test hooks404. |
| M3-J05 | PASS: native archive/Undo and retained409/network draft, actual batch rollback and controlled partial-file upload failure/stable retry. |
| M3-J06 | PASS: scope06 native workspace switch aborts old response and refreshes on return; current regressions prove second principal/private child/query/search/content isolation. |
| M3-J07 | PASS within agreed qualified scope: visual04 same canonical fixture/fixed test server date/preferences/Source fonts/native tab entry,12 selected zero-diff/repeat samples; inspected PNG and float geometry. No debug product UI or new fetch/store. Full SVG/whole-container debts remain explicitly unaccepted. |

WU36-AC1 PASS: existing feature hooks/components use one bootstrap-selected adapter and TanStack Query cache. Demonstrated warm-cache bug is fixed through shared lifecycle resource invalidation; native mutation appears in relevant views and persists.

WU36-AC2 PASS within the recorded local and inherited qualified visual scope: current contract/data/actual bindings/native failure/strict selected visual/typecheck/build/lint/regression gates pass. The complete fullTimeline/default/Darwin/whole-shell/device/full-project/M2 visual scope has not passed and is not accepted by this unit.

WU36-AC3 technical handoff is prepared in README, [HANDOFF.md](HANDOFF.md), [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md), finite candidate/verification/prefreeze and retained original streams. Actual commit/push checkpoint is completed only after Root gates and recorded in the two documentation files named above.

## Direct behavior decisions and image inspection

Only two production fixes: shared task lifecycle invalidates files/file/comments; task-read preserves persisted supplied label order using rowid. Exact decisions: DECISIONS.md:472 lifecyclecache, :474 testclock/principal/raster, :476 visible label sequence/qualified Timeline; line links are recorded in PROGRESS/inspection; existing DATA07 at [DECISIONS.md:34](../../DECISIONS.md) defines live10MiB. Source-only capture text changes250MB→10MiB with recorded original/canonical strings and float geometry; Source files/styles/templates/fixture/baselines are unchanged.

Board uses identical native List→Board tab entry on both sides, correcting the asymmetric initial Source route-filled animation versus delayed HTTP query entry. Float owned toolbar/board/column/card geometry is inspected; Source toolbar's irrelevant top/side border colors differ while visible bottom border is equal. Same-side PNG repeats are zero.

Desktop Timeline rail root boxes are exact; full body still differs61 SVG raster pixels. Original SVG trees/paths/rects/styles are captured for inspection; dependency SVG Source path versus Target g trees differ structurally, so no normalized dependency-path geometry equality is claimed. Mobile rail is responsive-hidden and the visible project viewport sample is zero, which does not prove whole Timeline/full project. visual01/02/03 failures and all unaccepted full PNGs remain unchanged.

## Current core commands and honest limits

`commands/*/result.json` retains actual argv/cwd/start/end/exit/signal and original separate stdout/stderr bytes/SHA. Core PASS: typecheck01 five packages, build01 five packages (API Wrangler dry run only), contracts01 93 tests, data01 170 tests, final lint06 including package boundaries, reference01, http-bundle01 rebuilt current HTTP graph/assets. Existing HTTP checker writes two WU06 paths by default; actual new outputs are retained under `http-bundle01/`, then those inherited paths restored byte-exact to base. No inherited evidence is changed. Diff/finite package/freeze results appear in verification and index.

Selected original returned tool start/completion objects are saved in `tools/`. Initial read-only/cloud/preliminary tool objects and some intermediate poll objects were not independently archived; no reconstructed originals or physical Root captures are claimed. Child services end with planned SIGTERM/null status or Source shell143, not successful exit0. visual04 helper later removes only six unused bytes from its first-line ESLint comment; [visual-lint-bridge.json](visual-lint-bridge.json) proves all runtime/import suffix bytes exact. No runtime rerun is inferred from lint.

Unavailable/not executed: production/provider authentication, OAuth/SSO/email/2FA/recovery delivery, ACL/account administration/provisioning/invitation delivery, payment/subscription execution, remote CI/deploy/D1/R2 buckets, realtime sync, antivirus/transcoding/conversion/large multipart platform, queues/platform orphan cleanup, Darwin/default compositor/full-shell/physical-device/full-project acceptance. Source licensing remains as UPSTREAM_NOTICE documents. These are outside local POC completion.
