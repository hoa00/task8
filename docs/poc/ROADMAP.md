# Roadmap và work units

**37 work units, WU-00 đến WU-36.** Chuỗi chuẩn tuần tự, mỗi unit là một session riêng. Đây là cách chia context cho toàn bộ bề mặt source; không phải bổ sung 37 tính năng mới. POC sớm kết thúc ở WU-12, full UI ở WU-29, backend POC ở WU-36.

## Thứ tự thực hiện

| Unit | Kết quả chính | Prerequisite | Mốc |
| --- | --- | --- | --- |
| [WU-00](work-units/WU-00.md) | Cố định source, assets và baseline đối chiếu | Source access | M1 |
| [WU-01](work-units/WU-01.md) | Workspace pnpm/Turborepo và khung build | WU-00 | M1 |
| [WU-02](work-units/WU-02.md) | Runtime API contracts và quy tắc dữ liệu | WU-01 | M1 |
| [WU-03](work-units/WU-03.md) | Tailwind tokens, font, icon và base styles | WU-02 | M1 |
| [WU-04](work-units/WU-04.md) | UI controls và primitives dùng lại | WU-03 | M1 |
| [WU-05](work-units/WU-05.md) | Overlay primitives, focus, menu và toast | WU-04 | M1 |
| [WU-06](work-units/WU-06.md) | Mock API foundation, fixture và query state | WU-05 | M1 |
| [WU-07](work-units/WU-07.md) | TanStack routes và app shell | WU-06 | M1 |
| [WU-08](work-units/WU-08.md) | Task fields và query/filter/group engine chung | WU-07 | M1 |
| [WU-09](work-units/WU-09.md) | Task List dùng cho Workspace, Project và My Tasks | WU-08 | M1 |
| [WU-10](work-units/WU-10.md) | Task Drawer và form dùng chung | WU-09 | M1 |
| [WU-11](work-units/WU-11.md) | Description, subtasks và comments trong Task Detail | WU-10 | M1 |
| [WU-12](work-units/WU-12.md) | Board và mốc POC Task end-to-end | WU-11 | M1 |
| [WU-13](work-units/WU-13.md) | Task Table và inline editing | WU-12 | M2 |
| [WU-14](work-units/WU-14.md) | Calendar dùng chung ba scope | WU-13 | M2 |
| [WU-15](work-units/WU-15.md) | Timeline và dependency geometry | WU-14 | M2 |
| [WU-16](work-units/WU-16.md) | Projects, Favorites, project forms và saved views | WU-15 | M2 |
| [WU-17](work-units/WU-17.md) | Home và Workspace Overview | WU-16 | M2 |
| [WU-18](work-units/WU-18.md) | Activity, Search và Command Palette | WU-17 | M2 |
| [WU-19](work-units/WU-19.md) | Inbox và Notifications | WU-18 | M2 |
| [WU-20](work-units/WU-20.md) | Members, member profile và permission matrix | WU-19 | M2 |
| [WU-21](work-units/WU-21.md) | Teams và team detail | WU-20 | M2 |
| [WU-22](work-units/WU-22.md) | Files, attachments và previews | WU-21 | M2 |
| [WU-23](work-units/WU-23.md) | Settings General và Personal | WU-22 | M2 |
| [WU-24](work-units/WU-24.md) | Settings Workspace và Notifications | WU-23 | M2 |
| [WU-25](work-units/WU-25.md) | Security và Billing dưới dạng demo có kiểm soát | WU-24 | M2 |
| [WU-26](work-units/WU-26.md) | Auth screens và validation states | WU-25 | M2 |
| [WU-27](work-units/WU-27.md) | Onboarding sáu bước | WU-26 | M2 |
| [WU-28](work-units/WU-28.md) | Archive, galleries và rà soát hành động còn lại | WU-27 | M2 |
| [WU-29](work-units/WU-29.md) | Nghiệm thu toàn bộ UI và reuse | WU-28 | M2 |
| [WU-30](work-units/WU-30.md) | Hono runtime, Drizzle migrations và D1 bootstrap | WU-29 | M3 |
| [WU-31](work-units/WU-31.md) | Backend Projects, People, Teams và workspace | WU-30 | M3 |
| [WU-32](work-units/WU-32.md) | Backend Task CRUD, move, bulk và transitions | WU-31 | M3 |
| [WU-33](work-units/WU-33.md) | Backend Subtasks, Comments, Dependencies và Activity | WU-32 | M3 |
| [WU-34](work-units/WU-34.md) | Backend reads, settings, notification state và saved views | WU-33 | M3 |
| [WU-35](work-units/WU-35.md) | R2 file bytes và liên kết D1 | WU-34 | M3 |
| [WU-36](work-units/WU-36.md) | HTTP integration và nghiệm thu backend POC | WU-35 | M3 |

## Vì sao thứ tự này

- Contract ở WU-02 và mock foundation ở WU-06 giúp UI không phải đổi dữ liệu khi nối Hono.
- Tokens/controls/overlays được làm trước pages để các view dùng lại cùng thiết kế.
- List/Drawer/Board là phép thử sớm cho reuse, fidelity và mutation coherence; không dùng Home tĩnh làm POC duy nhất.
- Table/Calendar/Timeline là renderer riêng nhưng cùng task fields/data/commands. Projects/settings/auth giữ toàn bộ bề mặt đã có, không được tự loại khỏi “full UI”.
- Backend chỉ bắt đầu sau full UI gate trong chuỗi chuẩn để giới hạn rủi ro đồng thời. Có thể chạy nhánh backend độc lập sau WU-02 khi Hòa yêu cầu, nhưng cần sửa dependency/ownership/checkpoint rõ; không tự chạy song song trên cùng branch.

## Mốc nghiệm thu

| Mốc | Chứng cứ phải có | Chưa được tuyên bố |
| --- | --- | --- |
| M1 — WU-12 | Source baseline; shared UI/components; create/edit/list/drawer/board journey; visual diffs đã xem | Toàn app/backend hoàn thành |
| M2 — WU-29 | Every screen/state inventoried; desktop/mobile/theme/overlay interaction matrix; reuse audit | Real auth/email/payment/DB đã hoạt động |
| M3 — WU-36 | Same frontend HTTP adapter; actual local Worker/D1/R2 persistence, errors/rollback/scope checks; agreed visual parity | Production deployment hoặc auth/billing thật |

## Quy tắc điều phối

1. Chỉ có một unit active trong PROGRESS; unit tiếp theo chỉ bắt đầu từ checkpoint của unit trước.
2. Một unit quá lớn trong context thực tế có thể chia tiếp thành `WU-NN.a/b` chỉ trong phạm vi ban đầu, ghi quyết định/acceptance mapping trước; không thay requirement hoặc skip acceptance.
3. Không tạo scaffold placeholder cho mọi màn rồi đánh dấu done. Placeholder trong unit nền tảng phải nằm trong pending coverage và bị cấm ở gate M2.
4. Mỗi UI unit phải có reference capture trước khi so target cho đúng phần mình làm. Nếu bổ sung state chưa chụp ở WU-00, chỉ bổ sung qua reference capture pipeline; không lấy target làm golden.
5. Không cần suite test tổng quát mới cho mỗi style edit; visual/interaction checks có rủi ro cụ thể mới là bằng chứng. Mỗi backend unit phải có actual D1/R2 checks nơi binding/atomicity là yêu cầu.
6. Commit/push checkpoint theo AGENTS; không push vào upstream source. Không mở rộng thành CI/CD/hosting trong roadmap này.

Xem [WORK_UNIT_PROMPT.md](WORK_UNIT_PROMPT.md) để bắt đầu một session và [ACCEPTANCE.md](ACCEPTANCE.md) để nghiệm thu.
