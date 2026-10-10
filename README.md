# task8 — Gr8r Studio → React

Tên package là `task8`; repository đích là [hoa00/task8](https://github.com/hoa00/task8) (private). Tiến độ triển khai và evidence hiện tại nằm trong [PROGRESS.md](docs/poc/PROGRESS.md).

**Cập nhật:** 10/10/2026. React UI và backend Hono/Drizzle/D1/R2 local đã triển khai đến WU-35; các gate HTTP local WU-36 đã PASS. Checkpoint kỹ thuật và Git thực tế xem PROGRESS. Phạm vi visual được chấp nhận có giới hạn; các khoản nợ M2 lịch sử vẫn chưa được nghiệm thu. Kết quả cuối và bằng chứng thật nằm trong [M3 acceptance](docs/poc/evidence/WU-36/ACCEPTANCE_REPORT.md) và [PROGRESS](docs/poc/PROGRESS.md).

Mục tiêu là chuyển toàn bộ giao diện và các trạng thái tương tác của Gr8r Studio sang **React + TypeScript + Vite + TanStack Router + Tailwind CSS**, tổ chức component dùng lại theo chức năng, và chuẩn bị contract để backend **Hono + Drizzle ORM + Cloudflare D1** thay mock mà không phải viết lại màn hình.

## Các quyết định đã chốt

| Nội dung | Quyết định |
| --- | --- |
| Fidelity | Giữ cấu trúc màn hình, thứ tự điều hướng, nội dung tiếng Anh, token, font, icon, spacing, responsive và tương tác hiện có. Baseline là source cố định, không phải ảnh tự tạo từ React. |
| Tailwind | Dùng ngay từ component React đầu tiên. Chuyển style thành utilities/token chính xác; không nhập nguyên bộ CSS legacy vào target. CSS nền/token, pseudo-element, scrollbar, keyframes và tọa độ động vẫn được phép có phạm vi rõ ràng. |
| Frontend | React SPA, TypeScript strict, Vite, TanStack Router file routing, TanStack Query cho server state. |
| Workspace | pnpm + Turborepo; `apps/web`, `apps/api`, `packages/ui`, `packages/contracts`, `packages/domain`. Chưa publish npm package. |
| API | Contract được triển khai trước tính năng. Mock và HTTP dùng cùng DTO, validation và operation semantics. Backend Hono + Drizzle SQLite/D1, R2 dành cho bytes tệp ở mốc backend. |
| Mức sản phẩm | POC gọn về tính năng mở rộng, nhưng đầy đủ bề mặt giao diện nguồn. Module boundaries, contracts, data ownership phải sạch ngay từ đầu. |
| Auth và dịch vụ ngoài | API POC dùng danh tính phát triển cấu hình ở server local. Màn auth/billing/security của source vẫn được giữ để demo; chưa có đăng nhập nhà cung cấp, email, 2FA hoặc thanh toán thật. |
| Thứ tự | Chứng minh Task List → Drawer → Board trước; phủ toàn bộ UI; sau đó nối API/D1/R2 thật và nghiệm thu liên màn hình. |

## Đọc bộ tài liệu theo vai trò

**Hòa xem phạm vi và quyết định:** [GOAL.md](docs/poc/GOAL.md), [REFERENCE_AUDIT.md](docs/poc/REFERENCE_AUDIT.md), [ROADMAP.md](docs/poc/ROADMAP.md), [DECISIONS.md](docs/poc/DECISIONS.md).

**Codex triển khai:** đọc [AGENTS.md](AGENTS.md), [PROGRESS.md](docs/poc/PROGRESS.md), [WORK_UNIT_PROMPT.md](docs/poc/WORK_UNIT_PROMPT.md), rồi đúng file `docs/poc/work-units/WU-NN.md` được giao. Read-set trong từng unit giới hạn tài liệu cần nạp; không đọc và thực hiện cả roadmap trong một session.

**Thiết kế component:** [ARCHITECTURE.md](docs/poc/ARCHITECTURE.md), [COMPONENT_CATALOG.md](docs/poc/COMPONENT_CATALOG.md), [SCREEN_INVENTORY.md](docs/poc/SCREEN_INVENTORY.md), [TOOLCHAIN.md](docs/poc/TOOLCHAIN.md).

**Backend và dữ liệu:** [API_CONTRACT.md](docs/poc/API_CONTRACT.md), [DATA_MODEL.md](docs/poc/DATA_MODEL.md), [BACKEND_SCOPE.md](docs/poc/BACKEND_SCOPE.md).

**Kiểm chứng:** [VISUAL_PARITY.md](docs/poc/VISUAL_PARITY.md), [ACCEPTANCE.md](docs/poc/ACCEPTANCE.md), [reference/source-lock.json](docs/poc/reference/source-lock.json).

**Tình trạng bộ bàn giao:** [HANDOFF_REVIEW.md](docs/poc/HANDOFF_REVIEW.md) ghi những gì đã kiểm tra và những gate ứng dụng vẫn chờ triển khai; [handoff-manifest.json](docs/poc/reference/handoff-manifest.json) chứa checksum của bộ tài liệu ban đầu.

## Bắt đầu một session Codex

Giải nén ZIP, rồi chép **nội dung bên trong thư mục `gr8r-react-handoff/`** vào root của repo đích do Hòa sở hữu, để `AGENTS.md` và `docs/poc/` nằm đúng vị trí. Nếu repo đã có `AGENTS.md` hoặc tài liệu cùng đường dẫn, đối chiếu và hợp nhất các quy tắc phù hợp với nhiệm vụ, không ghi đè nội dung hiện hữu một cách mù quáng. Repo nguồn dùng làm đối chiếu read-only ở thư mục `.reference/gr8r-studio`, không trở thành `origin` dùng để push.

```text
Implement WU-00 from docs/poc/work-units/WU-00.md.
Read AGENTS.md and docs/poc/PROGRESS.md first.
Inspect the current implementation and verify prerequisites.
Give a concise 3–7 step plan, then implement immediately in this session.
Run the required verification, update docs/poc/PROGRESS.md,
report the result, commit the work-unit changes, push the configured
user-owned target main branch when available, and stop.
Do not implement later work units.
Respond in Vietnamese.
```

Dùng một session mới cho unit kế tiếp. Nếu unit chưa đạt, tiếp tục chính unit đó; không tăng số unit chỉ vì session đã kết thúc.

## Source và giới hạn bằng chứng hiện tại

- Repo: [gr8rstudio/gr8r-studio](https://github.com/gr8rstudio/gr8r-studio).
- Commit cố định: [`904205c626918ee96054eb35495c394a60c0c601`](https://github.com/gr8rstudio/gr8r-studio/commit/904205c626918ee96054eb35495c394a60c0c601), ngày commit 07/10/2026 UTC.
- Đã clone, đọc source, kiểm tra cấu trúc và build source thành công bằng lockfile gốc. Đã xem ảnh preview trong repo.
- WU-00 đã tạo baseline nguồn thực gồm 173 scenario, kiểm tra lặp zero-diff và inspect ảnh; xem [runner](docs/poc/reference/CAPTURE.md) và [evidence](docs/poc/PROGRESS.md). React target đã có các scope nghiệm thu riêng trong ledger; không suy ra toàn bộ 173 scenario đạt từ các scope này.
- Source có 21 route key render, 8 tab project cố định, saved views List/Board/Table, 21 section Settings, 7 trạng thái auth và onboarding 6 bước. Chi tiết trong screen inventory.
- Ở snapshot này không có khai báo license rõ trong README/package.json, không có LICENSE trong tree và metadata GitHub trả `license: null`. Đây là việc cần xác nhận về quyền sử dụng/phân phối, không phải giấy phép được bộ handoff tự cấp. Xem [UPSTREAM_NOTICE.md](UPSTREAM_NOTICE.md).

## Mốc bàn giao

1. **M1 — POC component và fidelity:** hoàn tất WU-00…WU-12, có shell, bộ UI, contract/mock, Task List, Task Drawer và Board dùng cùng dữ liệu/component.
2. **M2 — UI inventory:** WU-13…WU-29 có đối chiếu nguồn và interaction evidence theo scope riêng; các gate full parity lịch sử chưa đạt vẫn được ghi riêng, không suy ra đã PASS.
3. **M3 — Backend POC:** hoàn tất WU-30…WU-36, cùng frontend chạy HTTP → Hono → D1, tệp R2 local và các kiểm tra dữ liệu cần thiết.

WU-00…WU-35 có checkpoint thực tế; WU-36 là unit cuối của backend POC. Theo dõi trạng thái trong [PROGRESS.md](docs/poc/PROGRESS.md).

## Chạy workspace local

Dùng Node `24.13.0` trong `.node-version` và pnpm `11.19.0` trong `packageManager`:

```sh
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

Turbo chạy Vite tại `http://127.0.0.1:5173` và Wrangler local tại `http://127.0.0.1:8787`. Vite dev/preview proxy `/api` sang Worker; mọi URL API của web phải là đường dẫn tương đối cùng origin. `VITE_DATA_MODE=mock|http`, `VITE_API_BASE_URL=/api/v1`; bootstrap validate một lần, không tự fallback khi HTTP lỗi. API hiện có các operation nghiệp vụ đã kiểm chứng; HTTP lỗi được trả đúng contract, không fallback mock.

Biến `VITE_*` được gửi vào browser, chỉ dùng hai biến công khai trong `.env.example`. Biến Worker riêng nằm trong `wrangler.jsonc`/`.dev.vars` hoặc binding phía server; không đưa secrets vào `VITE_*`. File `.env.local` và `.dev.vars` được ignore.

```sh
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm workspace:graph
pnpm api:types
pnpm reference:check
pnpm visual:reference:smoke
```

`build` chỉ tạo `apps/web/dist`, `apps/api/dist` (Wrangler dry run, không deploy) và `packages/*/dist`. Package nội bộ export source TypeScript với types rõ ràng, tất cả private. `apps/web/dist/module-graph.json` liệt kê module thực của bundle để kiểm tra cách ly nguồn/server. Script `test` chạy kiểm tra env, chiều phụ thuộc và các negative tests của comparator nguồn.

Plugin TanStack Router đứng trước React; Vite sinh và sở hữu `apps/web/src/routeTree.gen.ts`. File này được commit để clean clone chạy typecheck trước build; không sửa tay hoặc lint/format generated file. Khi đổi routes, chạy `pnpm --filter @studio/web build` và commit route tree mới. Wrangler sinh `apps/api/worker-configuration.d.ts` qua `pnpm api:types`; generated bindings cũng được commit, cấu hình Worker có `STUDIO_ENV=local`, principal phát triển cấu hình ở server và binding D1/R2 local.

Tailwind 4 dùng scan explicit cho web và ui, không Preflight và không CSS legacy. Tokens/fonts/reset/components sẽ do unit thiết kế kế tiếp sở hữu. Source reference ngoài workspace tiếp tục dùng lockfile riêng; `visual:reference:smoke` kiểm tra chức năng runner, không thay baseline. Raster baseline Darwin chỉ được compare trên môi trường đã pin theo [CAPTURE.md](docs/poc/reference/CAPTURE.md).

## HTTP với D1/R2 local

Dùng đúng Node/pnpm ở trên. Migrate/seed trước khi chạy; seed giữ các mutation đã lưu và không tạo bytes giả cho file mẫu.

```sh
pnpm --filter @studio/api db:migrate:local
pnpm --filter @studio/api db:seed:local
pnpm --filter @studio/api dev
```

Ở terminal thứ hai:

```sh
VITE_DATA_MODE=http VITE_API_BASE_URL=/api/v1 pnpm --filter @studio/web dev
```

Mở `http://127.0.0.1:5173`. Vite proxy `/api` đến Worker `8787`; chọn adapter chỉ ở bootstrap. Wrangler mặc định lưu D1/R2 tại `apps/api/.wrangler/state`, nên restart giữ dữ liệu. Principal từ `LOCAL_USER_ID`/`LOCAL_WORKSPACE_ID` trong config server; browser không đặt user header để đăng nhập. File thực có cap10MiB, MIME allowlist, download kiểm tra quyền; file seed chỉ có artwork và `contentAvailable:false`.

Các lệnh nghiệm thu tạo attempt mới, không ghi đè evidence. Chạy tuần tự vì cùng sở hữu các port4173/5173/8787. Harness dùng storage riêng `/tmp/task8-wu36-<label>`; regression giữ prefix storage của unit tương ứng.

```sh
pnpm --filter @studio/web build:http
pnpm test:m3:journey journey-new
pnpm test:m3:scope scope-new
pnpm test:m3:visual visual-new
pnpm test:m3:regression 32 wu36-tasks-new
pnpm test:m3:regression 33 wu36-collaboration-new
pnpm test:m3:regression 34 wu36-projections-new
pnpm test:m3:regression 35 wu36-files-new
pnpm typecheck
pnpm build
pnpm lint
pnpm test:contracts
pnpm test:data
pnpm verify:data:http-bundle
pnpm reference:check
```

Các Worker fault/clock/SQL hooks chỉ ở test entry; restart production dùng `apps/api/src/index.ts` không có các hook đó. M3 kiểm chứng local CRUD, privacy, version/rollback/Undo, cache và bytes persistence. Auth/provider/email/ACL provisioning/payment, production deploy, CI/CD, realtime, antivirus/transcoding và purge thật chưa có. Các failed/missing-byte/SVG/default/Darwin/whole-shell/device/full-project visual debts lịch sử vẫn chưa được chấp nhận; không tuyên bố đã phục hồi chúng.
