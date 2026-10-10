# Command integration ledger — WU-18

Ledger này được WU-28 kiểm lại và WU-29 phải đóng trước M2. Pending không phải capability đã hoạt động; không đưa số work-unit vào giao diện sản phẩm.

| Entry / intent | Hành vi hiện tại | Owner đóng | Điều kiện đóng / evidence |
| --- | --- | --- | --- |
| Create task/project; edit task E | Mở form hiện hữu; E giữ TaskDrawer phía dưới | WU-18, implemented | Native N01/N02/N07; form/editor/composer tiếp tục sở hữu submit keys |
| Home/My Tasks/Projects/Calendar/Timeline/Activity | Navigation đến feature đã có | WU-18, implemented | Native keyboard journeys và Source desktop/mobile entry; Timeline command dùng route hiện hữu |
| Search task/comment/project | Shared typed search; mở TaskDrawer hoặc project với canonical identity | WU-18, implemented | API search/privacy/full cursor tests; native Page/Palette result và actual HTTP cancellation |
| File result preview | Dùng FilePreviewDialog WU-10 ngay; liên kết task mở drawer hiện hữu | WU-18, implemented | Native N05 và scoped preview comparisons |
| Actor / people result | Canonical membership profile; shared ActivityFeed actor intent | WU-20, implemented | Native05 people Palette/Home/activity links and supplement project lead/search entry; canonical profile/summary/privacy data guards |
| Invite member | Palette/Home/directory mở shared InviteDialog; capability-guarded directory-only demo | WU-20, implemented | Native05 validation/dedupe/persist/profile + HTTP storage fault/retry; no canonical account/grant/task writes or email delivery. WU27 principal review remains |
| Inbox / Notifications | Canonical routes, shared persisted notification state | WU-19, implemented; native N19-04 | Commands và G I / G N vào feature đã triển khai |
| Workspace/appearance Settings | Canonical settings routes, pending boundary; shortcut definitions đã export | WU-23, pending | Settings dùng lại definitions; G S và command appearance mở đúng section |
| Files suggestion / canonical file URL | Project Files tab route hiện hữu nhưng body pending; preview copy dùng foundation URL | WU-22, pending | Canonical Files body, preview/deep-link/copy URL round trip, archived/deleted/forbidden parent handling |
| Switch workspace | Typed catalog; current workspace đóng Palette; workspace khác đi canonical Home, bootstrap có thể trả404 thật | WU-27 / WU-31, pending | Canonical namespace/session/init cho từng catalog workspace; không copy dữ liệu W1 sang W2/W3; native actual outcome phải được ghi |
| Workspace planLabel | Optional readonly bounded display metadata ánh xạ exact Source plan; không writable create/PATCH | WU-25 / WU-31, pending canonical owner | Canonical workspace catalog / plan display semantics; không billing implementation tại WU-18 |
| Sign out | Palette option aria-disabled; không xóa session hay giả success | WU-26, pending | Auth/session sign out và redirect thật |

Recent history là UI preference với một owner tại SearchOverlayHost, namespace workspace+member. Theo Source, chỉ View all thêm query mới vào đầu (tối đa5); query đã có giữ thứ tự. Typing, chọn recent và mở result không ghi lịch sử. Page/Palette dùng cùng owner, reload đọc cùng namespace.

Mod/Ctrl K và Mod/Ctrl Shift L là ngoại lệ suppression đúng Source: chạy khi đang gõ. Plain N/P/E/G/?/[/slash được chặn ở input/textarea/select/contentEditable và modal/menu; E ở TaskDrawer dùng form hiện hữu. Escape/focus trap thuộc OverlayProvider; submit/editor/composer keys không đăng ký lại trong global registry.

All pending entries above must be revisited at WU-28 and closed with actual evidence by WU-29. WU-18 does not implement later units to unlock these integrations.


Actual final navigation evidence: native07 N08 derives the first visible actor from canonical bootstrap and checks the exact member-ID route. Switching Personal uses catalog workspaceW2 ID and reaches its canonical Home with bootstrap404/Page not found; no synthetic success or W1 dataset copy. These remain truthful pending20 and27/31 integrations. Final current fileCopy feedback uses Source success4200/info-failure6000/manual foundationURL; actual granted clipboard and failure journeys are in native09/source-copy-feedback02. Canonical copy/deep-link round trip remains WU22.

WU20 closes the people/profile and workspace Invite boundaries only. Settings integration remains WU24, Teams body WU21, canonical file URLs WU22, authentication WU26/27 and provisioning WU31. Project sharing keeps its existing WU16 separate explicit guest projection; it does not provision a canonical membership or authenticated account. Historical pending statements above describe their actual WU18 checkpoints.


## WU-28 actual closure — IN_PROGRESS final review

This appendix supersedes the historical pending owner/status rows above. Those rows describe WU18 at its checkpoint, including unavailable W2/W3 then, and do not describe the current implemented UI. No work unit numbers appear in product copy.

| Historical pending entry | Current Source → typed owner → actual operation | Actual evidence / boundary |
| --- | --- | --- |
| Settings workspace / appearance / G S | Source keyboard/actions Settings intents → SearchOverlayHost/settings routes/useSettingsCommands → scoped updatePreferences | Selected archived-core27 native14 N20 and core31 native15 N20 passed Appearance palette, G S exact workspace section and shared Shortcuts. Native11 N06 shows actual offline preference failure, visible error, retry; no inert route. |
| Files suggestion / canonical URL | Source file result/preview/copy → SearchOverlayHost/FileFoundation/ProjectFilesPage → getFile/renameFile/duplicateFile/deleteFile/typed canonical file links | Selected archived-core27 native14 N20 and core31 native15 N20 passed actual canonical f1 Files route, preview and granted clipboard URL round trip; WU22 native05 remains historical file lifecycle owner evidence. No fabricated content/auth transport. |
| Workspace switch | Source ws217 → Sidebar/SearchOverlayHost → readonly listWorkspaces, guarded canonical navigation and WU27 scoped Mock registry | Selected archived-core27 native11 N12 passed newly-created scope, both-direction switch, persisted offline banner/write block, retry and Reset returning actual seed/removing new scope. Existing bounded WU27 native05 N06 validates independent namespaces. No W1 dataset copy or real provisioning. |
| Plan label | Source ws217 w.plan → readonly catalog planLabel → existing listWorkspaces DTO | Selected archived-core27 native14 N20 and core31 native15 N20 passed exact locked Team/Free/Business labels. Optional readonly metadata; no writable billing/subscription operation. Native12 incorrect Pro assertion remains FAILED original, not product semantics. |
| Sign out | Source palette/user/ws signOut → shared SearchOverlayHost auth-demo intent → Mock demo auth reset/login navigation, canonical principal unchanged | Selected archived-core27 native11 N09 passed profile and palette native signout. Current-core31 HTTP03 H04 passed truthful unavailable signout dialog with zero API logout/account writes and unchanged canonical session/principal; opt-in login remains explicit demo. This closes UI wiring/capability feedback, not real provider/backend logout. |

The 21 selected archived-core27 native successes are individual passed cases from native11 N01–15 (16 incl two N08 widths), native12 N16–19 (4) and native14 N20 (1). Native11/native12 overall statuses remain FAILED, and those reports have no after asset maps. Their before679 maps match exact archive27; native14 before/after match. Current31 affected native15 has eight actual passed journeys and both679 maps; exact core31 bytes were archived before the later Source workspace label-overflow correction. Current32 native16 N20 and visual13 provide fresh affected menu evidence; ROOT review remains pending. The same typed owners persist through those local presentation changes; no blanket all-action/browser/default/Darwin acceptance follows.


- Final current WU28 verification checkpoint (still IN_PROGRESS): core32 seven actual0; visual13 actual passed-bounded22 views/43 full desktop/mobile pairs =31 whole strict0 +12 intentional truthful-copy pairs with exact text bounds/unchanged outside0; all86 same-side repeats0, all88 actual200font responses locked and four loaded faces per context. Workspace menu is whole0 BOTH widths after only removing label overflow:hidden/ellipsis. Read-only menu-layer02 confirms Source and Target each12 layers, no extra Personal overlap layers and whole/repeat0; Source/Target actual label min-width are both0px. Current native16 N20 actually passed catalog/Settings/Files/copy closure on core32. Archived31 native15 eight successes, HTTP03 five, motion01 twenty-four and menu-style03 sixteen retain their exact archive31 provenance; handler/timer/full-error presentation bytes are unchanged by this one span class correction. Original visual12 deterministic55 and prior failures are never relabeled recovered or accepted. Finite closure/freezes/helper audit/ROOT pre-stage and all-index gates remain pending; no staging, DONE or actual commit/push yet.
