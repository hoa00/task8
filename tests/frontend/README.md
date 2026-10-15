# Kiểm tra frontend hiện hành

Entry hiện hành sau FR-06 cho checks ngoài API; trạng thái nghiệm thu từng phase xem kế hoạch/evidence. Đọc [chuẩn](../../docs/engineering/FRONTEND_STANDARDS.md), [kế hoạch](../../docs/engineering/FRONTEND_REFACTOR_PLAN.md) và [ma trận findings](../../docs/engineering/FRONTEND_REGRESSION_MATRIX.md).

```sh
pnpm frontend:check --list
pnpm frontend:check
pnpm frontend:check --checks=typecheck,consumers,lint,boundaries,web-tests,domain-tests,contract-tests,identities,workspace-tests,tooling-tests,i18n-tests,build,http-build,http-bundle,reference
pnpm frontend:check --checks=web-tests,boundaries --output=test-results/my-new-run
pnpm frontend:format --check
pnpm frontend:format --write apps/web/src/features/tasks/TaskListPages.tsx
node tests/frontend/smoke.mjs --output=test-results/my-browser-run
```

`manifest.mjs` khai báo owner/mode/command IDs. Mặc định chạy foundation checks; browser/reference là optional và phải chọn rõ theo risk. Không có API build/test, native D1 hoặc live provider. `contracts:consumers:web` dùng tsconfig riêng; alias cũ `contracts:consumers` vẫn bao gồm API và không thuộc entry này. Web tests discover đệ quy `*.test.ts` trong `apps/web/src` và `apps/web/tests`; contract consumer `.ts` không bị chạy như test. Test JSX cần entry có transpiler được chọn rõ, không đặt `.test.tsx` rồi giả định native Node chạy JSX.

Output mặc định là thư mục unique trong `test-results`; `--output` phải là thư mục mới bên trong đó, reject symlink/overwrite/historical evidence. Report ghi HEAD/dirty/Node/pnpm, command/exit/signal/log hash, TAP totals và scenarios thực. Child lỗi, timeout hoặc không có totals cho test đều fail; dừng và ghi các command còn lại là skipped. `partial` khác `passed`: `--checks`, `--affected`, `--skip-tests` bỏ foundation checks đều hiện lý do. `--affected` là selection tương thích có chủ ý (bỏ type/unit nền), **không tự suy affected files**; build/lint/HTTP checks vẫn chạy. Reference có thể chọn riêng.

`tests/data/verify.mjs` và people/teams gates nay dùng cùng entry. `--attempt=name` ở hai gates đó ánh xạ sang `test-results/people-name` hoặc `teams-name`. HTTP graph checker nhận `--output=test-results/<new-directory>` hoặc tự tạo unique; không còn WU default/suffix. Nhiều visual harness WU khác còn ghi historical paths và gọi root commands: **reproduction-only tại SHA gốc cho tới khi migrate có owner**. Không thêm chúng vào manifest active bằng tên alias; Các suite active và reproduction-only được liệt kê dưới đây. Browser smoke mới là check render Home/Tasks/Calendar desktop/mobile + Back/Forward/reload; optional `--baseline=test-results/<prior-dist>` so ảnh hai target bằng byte equality, không phải source parity.

Formatter dùng Prettier **3.6.2** (version đã có trong lockfile, thêm direct dev dependency root), config root; ignore API/generated/reference/evidence. Batch sáu file chuẩn bị FR-02 có emitted-JS AST equality và second-pass idempotence trước mọi write. Không format toàn web hoặc coi AST equality là acceptance cho behavior fix. Với structural/behavior change, format file riêng và chạy regression phù hợp.

`tests/workspace/frontend-policy.json` công bố public paths/symbols có consumer, vai trò mọi feature TSX và controlled views. Không bắt sinh barrel; module path đã công bố là public surface. Resolver chung xử lý import/export/import-type/dynamic/require, relative target thực và symlinks. Package gate dùng exports thật. Frontend gate kiểm data→presentation/router, view→data/router/query, web→server, cross-feature private symbols và runtime module cycles. Type-only edges vẫn kiểm dependency direction, không tạo runtime cycle; generated Router tree không được coi mã handwritten. Đây là guard import, không chứng minh absence của global URL/storage side effects hoặc indirect controller coupling.

`frontend-legacy.json` có exact path/target/kind/symbol, lý do và phase gỡ. Ceiling được hash pin, chỉ được giảm; entry đã hết vi phạm cũng fail cho tới khi xóa. Không regenerate ceiling, thêm wildcard hoặc công bố toàn implementation là public để làm gate pass. Tất cả entries đã gỡ ở FR-03/04, hiện legacy0; FR-07 audit và gỡ cấu hình chuyển tiếp còn lại.

Rollback FR-01 không cần migration/reset/storage change: revert các tooling/config commits và format-only commit. Giữ report mới, không overwrite WU evidence và không chạy harness cũ vào checkout đang dùng.


FR-06 active browser checks (chạy tuần tự sau build): `browser-smoke`8cases, `browser-url`6, `browser-controllers`11, `browser-accessibility`7, `people-http`6 và `teams-http`7. HTTP suites dùng **dist-http thật**, intercepted canonical operations backed by mock client; không kiểm backend/live fallback. People/Teams chọn English tại fixture để assertions deterministic; vi/en/default/reload thuộc i18n/accessibility tests. `teams/http.mjs --remaining` ghi5skips và status partial, không được dùng làm full acceptance.

```sh
pnpm --filter @studio/domain test
pnpm frontend:check --checks=browser-url,browser-controllers,browser-accessibility,people-http,teams-http --output=test-results/affected-browser
node tests/frontend/controls-visual.mjs --output=test-results/source-controls
```

`withBrowserSession` sở hữu static servers port0/browser, cleanup khi startup fail, deadline, signal/cancel và normal completion. People/Teams dùng chung canonical request decoder/report/output; assertions và fault choices vẫn nằm ở suite. Accessibility dùng cùng session cho hai fallback origins. Support negative tests kiểm missing build, collision không kill owner, launch/second-server failure, timeout/cancel và report incomplete/failure/skips. Parent runner đọc child browser reports lấy scenario IDs/status thật; child exit0 nhưng incomplete/failed cases vẫn fail.

`domain-tests` discover `packages/domain/tests/*.test.ts` riêng,4cases chuyển khỏi web không duplicate. Web tiếp tục discover mọi feature/adapter test; timeline cases gắn web seed chưa chuyển được ghi rõ ở domain README. Root test/build/typecheck có API vẫn giữ semantics và không thuộc entry non-API.

Các aliases visual/interactions WU khác, kể cả People/Teams `interactions.mjs`/visual cũ, là reproduction-only tại checkout lịch sử: không chạy chúng vào WU evidence hiện tại. Active HTTP People/Teams đã migrate ngay file alias; gates wrappers dùng manifest chung và safe output. Source-controls là independent source parity, các smoke screenshots chỉ là target regression.
