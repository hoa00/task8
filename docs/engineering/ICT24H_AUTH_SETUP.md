# ICT24H AUTH-01: package setup và checkpoint

Ngày: 13/10/2026. Baseline `becfc49e231c0914a4733738631af6fcb2229479`. Checkpoint contract/provider ban đầu được giữ bên dưới. AUTH-01 nay có package/Worker proof thật; xem cập nhật cuối tài liệu. AUTH-02…06 chưa triển khai tại checkpoint AUTH-01 này.

## Phần đã triển khai

`auth/index.ts` xuất public provider types; HTTP adapter login/refresh/whoami nằm trong `auth/http/provider.ts`, chờ HTTP composition ở AUTH-03. Adapter inject fetch/clock, giữ ba data shapes riêng, gửi tenant theo cấu hình server và loại bỏ field central không sử dụng. Response cần HTTP 2xx, body statusCode200/message success, không có error và data hợp lệ. HTTP201/body400 bị từ chối; malformed success, timeout/5xx/429 là AUTH_SERVICE_UNAVAILABLE503. Login/refresh không retry upstream, không trả raw error/credential hoặc ghi chúng vào log.

Response tối đa65536bytes trên stream, timeout10000ms gồm đọc body, token tối đa16384UTF8bytes; expiry response phải là UTC instant còn hạn. Provider URL phải HTTPS và không có credential/query/fragment; tenant giữ matching chính xác. Redirect upstream bị từ chối để không chuyển password/token tới endpoint khác.

Standalone `Ict24hSessionSchema` hỗ trợ workspace null và metadata phiên; `authOperations` định nghĩa login/refresh/logout mà chưa bật endpoint. Login input là email hợp lệ tối đa254ký tự, password6…1024ký tự và tối đa1024UTF8bytes, remember boolean; unknown fields bị từ chối. Error/status map canonical có SESSION_CHANGED409 và AUTH_SERVICE_UNAVAILABLE503. Canonical getSession/local/mock consumers tiếp tục coherent cho tới AUTH-04.

JWT bridge, RSA config, sessions, mapping/migrations, Origin/cookie/business guards và giao diện chưa được compose. Provider adapter **không phải JWT verifier**. Không dùng adapter độc lập như một principal resolver.

## Quyền đọc package

Kết nối GitHub đã đọc/fetch `hoa00/task8/main` thành công. Truy vấn thực tới `https://npm.pkg.github.com/@hoa00%2fi24h-auth-honojs` trả **HTTP401 Unauthorized** khi môi trường chưa có NODE_AUTH_TOKEN. Repository access/cùng owner không tự cung cấp credential cho npm registry. Chưa xác nhận version, tarball, exports hoặc khả năng chạy Worker; không pin ví dụ0.1.1 dựa trên tài liệu.

Operator cấu hình secret NODE_AUTH_TOKEN có `read:packages` và quyền truy cập package, hoặc cung cấp tarball chính thức kèm version/provenance. Không đưa secret vào chat, Git, VITE variables, logs hoặc command literal.

`.npmrc` của repo chỉ khai báo registry mapping:

```ini
@hoa00:registry=https://npm.pkg.github.com
```

Credential placeholder dưới đây phải nằm trong **user-level/trusted npm config**, do operator cấu hình:

```ini
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

**Conflict đã quan sát:** pnpm11.19.0 bỏ qua environment expansion của credential trong project `.npmrc`, khác ví dụ cài đặt của library/kế hoạch. Lượt thử đã phát warning này; không commit dòng credential ở project config hoặc token thật. Có thể chọn trusted config bằng NPM_CONFIG_USERCONFIG khi operator đã cấp file đó.

Sau khi credential sẵn sàng, đọc metadata/version thực, tải tarball và kiểm public exports trước khi thêm dependency có version chính xác vào API và lockfile. Chạy proof trên actual Worker với fresh RSA keys: context, valid/invalid signature, tenant/type/expiry/missing-exp, HTTPException401, multipart stream và bytes. Không thay package bằng source copy hoặc tự viết verifier để vượt prerequisite. Nếu deployment khác refresh stateless snapshot, chốt conflict trước AUTH-03.

## Nghiệm thu còn lại

Các test fixture hiện chứng minh decoder/HTTP error boundary/config/bounds; không chứng minh successful deployment login, token signature hoặc provider rotation. AUTH-02 cần AUTH-01 Worker proof PASS; việc kiểm live còn cần RSA public key deployment và test account qua môi trường bảo mật. AUTH-03 sẽ cần session encryption secret/app origin. Chưa deploy hoặc thay Identity Service.

[Evidence](evidence/AUTH-01/provider-preparation/commands.json) ghi actual commands/logs và environment overrides. Dependency hiện hữu được cài bằng frozen lockfile trong store của task; pnpm auto-install trước run được tắt vì default user store không writable trong sandbox. Không thay package scripts/gates hoặc lockfile. Runtime Node24.19.0 thuộc major24 nhưng khác engines pin24.13.0; ghi warning, không sửa engines để che khác biệt.

## AUTH-01 — Package/Worker proof thật, 13/10/2026

Fetch/fast-forward tới `f66a9efd16f354ed02f8f1db20d174c627ac3d8b` thành công. Readiness revision2 có observations current nhưng NODE_AUTH_TOKEN/network policy vẫn `unknown`; không gọi chúng là ready. Truy vấn registry thực qua inherited proxy và trusted npm config đã thành công. Không đọc/in secret, không dump env. Trusted config ở /tmp chỉ chứa literal `${NODE_AUTH_TOKEN}`; project `.npmrc` tiếp tục chỉ map registry.

Registry latest **0.1.1**; đã tải official tarball qua `npm pack` với writable cache, kiểm SHA-1/SHA-512 khớp registry và pnpm integrity. API dependency pin exact0.1.1; package chỉ export `.` với public guard/config/UserAuthInfo và public types. Hono peer4.13.13 khớp. pnpm tự thêm release-age exception cho chính exact package được giao cài; không mở wildcard. [Package evidence](evidence/AUTH-01/worker-proof/package.json) giữ provenance, exports và readiness an toàn.

Adapter `auth/http/access.ts` gọi public `I24HTokenAuthGuard`/`UserAuthInfo` trong Hono context riêng, dùng token phía server; không monkeypatch Hono, không đổi request body hoặc lấy browser Bearer làm principal. `nodejs_compat` bật cho Node crypto/jsonwebtoken của package. Decode supplementary claims chỉ sau guard thành công; yêu cầu central UUID, tenant/type và exp integer còn hạn. Package chấp nhận missing/noninteger-exp; task8 bridge reject chúng. Invalid guard/HTTPException401 được chuẩn hóa UNAUTHENTICATED. Key normalize escaped newlines, guard capture config; invalid key fail closed.

Actual local Worker suite **26 probes PASS** với fresh RSA2048 test key và foreign key: signature, tenant/type/expiry/missing-exp/noninteger-exp/algorithm, authInfo context/HTTPException401, browser Bearer rejection, unchanged JSON/multipart/file bytes và byte endpoint. Harness cleanup owned processes; không lưu private test key/token vào Git/evidence. Suite đăng ký active runner `pnpm --filter @studio/api test:integration --feature auth-provider`; Worker entry được typecheck. Public HTTP factories có facade riêng; import checks giữ application không phụ thuộc HTTP/library và zero legacy/cycles.

[Commands/evidence](evidence/AUTH-01/worker-proof/) chứa logs, actual argv/exit codes/hash và native report. API format/lint/typecheck/unit62, contracts96, consumers/root typecheck/lint/build đạt. Initial install chỉ filter API thiếu workspace links: đã full frozen install; initial Wrangler startup thiếu writable XDG path: chuyển tool paths sang /tmp. Boundary lint ban đầu reject HTTP factory reexport qua application facade: đã tách HTTP facade và thêm negative fixtures; không mở application→HTTP. Node24.19.0 khác engines pin24.13.0 vẫn ghi warning, không đổi engines.

**LOCAL_VERIFIED_LIVE_PENDING**: AUTH-01 package/Worker prerequisite đạt. Deployment public RSA key/test account/revision/TTL chưa được cấp nên live login/refresh/whoami NOT_RUN. Refresh stateless/CAS theo contract source snapshot; chưa có evidence deployment rotation khác, không claim live semantics được xác minh. Các unit sau có thể dùng controlled stateless provider fixture; live acceptance phải xác nhận contract này trước production sử dụng. Không deploy/thay Identity Service.
