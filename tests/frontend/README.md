# Kiểm tra frontend hiện hành

FR-01 mở entry ngoài API; không thay thế nghiệm thu behavior FR-02…07. Đọc [chuẩn](../../docs/engineering/FRONTEND_STANDARDS.md), [kế hoạch](../../docs/engineering/FRONTEND_REFACTOR_PLAN.md) và [ma trận findings](../../docs/engineering/FRONTEND_REGRESSION_MATRIX.md).

```sh
pnpm frontend:check --list
pnpm frontend:check
pnpm frontend:check --checks=typecheck,consumers,lint,boundaries,web-tests,contract-tests,identities,workspace-tests,tooling-tests,i18n-tests,build,http-build,http-bundle,reference
pnpm frontend:check --checks=web-tests,boundaries --output=test-results/my-new-run
pnpm frontend:format --check
pnpm frontend:format --write apps/web/src/features/tasks/TaskListPages.tsx
node tests/frontend/smoke.mjs --output=test-results/my-browser-run
```

`manifest.mjs` khai báo owner/mode/command IDs. Mặc định chạy toàn bộ foundation checks trừ reference (cần checkout nguồn). Không có API build/test, native D1 hoặc live provider. `contracts:consumers:web` dùng tsconfig riêng; alias cũ `contracts:consumers` vẫn bao gồm API và không thuộc entry này. Web tests discover đệ quy `*.test.ts` trong `apps/web/src` và `apps/web/tests`; contract consumer `.ts` không bị chạy như test. Test JSX cần entry có transpiler được chọn rõ, không đặt `.test.tsx` rồi giả định native Node chạy JSX.

Output mặc định là thư mục unique trong `test-results`; `--output` phải là thư mục mới bên trong đó, reject symlink/overwrite/historical evidence. Report ghi HEAD/dirty/Node/pnpm, command/exit/signal/log hash, TAP totals và scenarios thực. Child lỗi, timeout hoặc không có totals cho test đều fail; dừng và ghi các command còn lại là skipped. `partial` khác `passed`: `--checks`, `--affected`, `--skip-tests` bỏ foundation checks đều hiện lý do. `--affected` là selection tương thích có chủ ý (bỏ type/unit nền), **không tự suy affected files**; build/lint/HTTP checks vẫn chạy. Reference có thể chọn riêng.

`tests/data/verify.mjs` và people/teams gates nay dùng cùng entry. `--attempt=name` ở hai gates đó ánh xạ sang `test-results/people-name` hoặc `teams-name`. HTTP graph checker nhận `--output=test-results/<new-directory>` hoặc tự tạo unique; không còn WU default/suffix. Nhiều visual harness WU khác còn ghi historical paths và gọi root commands: **reproduction-only tại SHA gốc cho tới khi migrate có owner**. Không thêm chúng vào manifest active bằng tên alias; FR-02…05 migrate đúng suite cần dùng, FR-06 hoàn tất support. Browser smoke mới là check render Home/Tasks/Calendar desktop/mobile + Back/Forward/reload; optional `--baseline=test-results/<prior-dist>` so ảnh hai target bằng byte equality, không phải source parity.

Formatter dùng Prettier **3.6.2** (version đã có trong lockfile, thêm direct dev dependency root), config root; ignore API/generated/reference/evidence. Batch sáu file chuẩn bị FR-02 có emitted-JS AST equality và second-pass idempotence trước mọi write. Không format toàn web hoặc coi AST equality là acceptance cho behavior fix. Với structural/behavior change, format file riêng và chạy regression phù hợp.

`tests/workspace/frontend-policy.json` công bố public paths/symbols có consumer, vai trò mọi feature TSX và controlled views. Không bắt sinh barrel; module path đã công bố là public surface. Resolver chung xử lý import/export/import-type/dynamic/require, relative target thực và symlinks. Package gate dùng exports thật. Frontend gate kiểm data→presentation/router, view→data/router/query, web→server, cross-feature private symbols và runtime module cycles. Type-only edges vẫn kiểm dependency direction, không tạo runtime cycle; generated Router tree không được coi mã handwritten. Đây là guard import, không chứng minh absence của global URL/storage side effects hoặc indirect controller coupling.

`frontend-legacy.json` có exact path/target/kind/symbol, lý do và phase gỡ. Ceiling được hash pin, chỉ được giảm; entry đã hết vi phạm cũng fail cho tới khi xóa. Không regenerate ceiling, thêm wildcard hoặc công bố toàn implementation là public để làm gate pass. Hai bootstrap env type edges gỡ FR-03; các seams view/controller/service/dataset còn lại FR-04. FR-07 phải audit và gỡ hết seams đã hoàn tất.

Rollback FR-01 không cần migration/reset/storage change: revert các tooling/config commits và format-only commit. Giữ report mới, không overwrite WU evidence và không chạy harness cũ vào checkout đang dùng.
