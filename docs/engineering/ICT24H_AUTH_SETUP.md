# ICT24H AUTH-01: package setup và checkpoint

Ngày: 13/10/2026. Baseline `becfc49e231c0914a4733738631af6fcb2229479`. Đây là checkpoint phần contract/provider của [kế hoạch tích hợp](ICT24H_AUTH_INTEGRATION_PLAN.md); **AUTH-01 chưa hoàn tất** và AUTH-02…06 chưa bắt đầu.

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
