# Triển khai DataMaker Task

## Đích và phạm vi

[Cấu hình production](../../apps/api/wrangler.production.jsonc) là owner của account, Worker, D1/R2 và origin đăng nhập. Chỉ dùng tài khoản Cloudflare khớp `account_id` trong file này. Web và API cùng origin; frontend được build bằng HTTP-only entry. [Lệnh deploy](../../package.json) build web rồi upload Worker/assets bằng Wrangler đã khóa trong repo.

Production dùng tenant ICT24H hiện tại theo lựa chọn của Hòa. D1/R2 mới, tách local; không sao chép dữ liệu local, không seed demo hoặc tự cấp workspace/Owner. Khi tài khoản đăng nhập lần đầu chưa có membership, làm theo [quy trình cấp workspace](ICT24H_AUTH_RUNBOOK.md#cấp-workspace-và-kiểm-waitingready); deploy không thay thế bước cấp quyền này.

URL public: <https://datamaker-task.hoa.workers.dev>. Không dùng miền Portless `.test` cho production. Cấu hình local tiếp tục ở `apps/api/wrangler.jsonc`; không dùng lệnh deploy mặc định của API với cấu hình local để publish.

## Quyền và nguồn cấu hình

Wrangler dùng tài khoản OAuth/token đã được operator cấp quyền Workers/D1/R2 trên account đích. Kiểm tra bằng `pnpm --filter @studio/api exec wrangler whoami`; không đọc hoặc chép giá trị token từ file cấu hình người dùng. Plugin Cloudflare có thể xác minh account/resources mà không xuất credential. Nếu account hoặc quyền không khớp, dừng rollout và yêu cầu chủ tài khoản điều chỉnh quyền cho đúng đích.

Worker secrets là nguồn lưu `AUTH_PUBLIC_KEY` và `AUTH_SESSION_ENCRYPTION_KEY`. Public key thuộc deployment ICT24H đã chọn; encryption key production được tạo riêng một lần, đúng32random bytes base64url. Xem [auth runbook](ICT24H_AUTH_RUNBOOK.md#khi-operator-cấu-hình-deployment) để quản lý bindings/rotation. Không dùng file `.dev.vars` làm secrets-file deploy, không upload tất cả biến local, không đổi encryption key ở mỗi lần deploy. Kiểm tra tên secret bằng `wrangler secret list --config wrangler.production.jsonc` từ package API; không đọc giá trị vào log/report.

## Deploy và kiểm chứng

Từ root, dùng Node/pnpm đã khóa và dependencies đã cài:

```sh
pnpm deploy:production
pnpm --filter @studio/api exec wrangler deployments list --config wrangler.production.jsonc
```

Trước rollout, chạy owning type/lint/build/auth checks; xem [API checks](../../apps/api/README.md#commands-hiện-hành) và [frontend checks](../../tests/frontend/README.md). Production assets chỉ gồm HTTP app; [assets ignore](../../apps/web/public/.assetsignore) loại module-graph evidence khỏi upload.

Sau rollout, kiểm HTTPS, `/login`, asset JS/CSS/favicon và reload/deep link. `/api/v1/session` khi chưa đăng nhập phải trả JSON401; `/api/*` không được trả HTML SPA fallback kể cả request dạng navigation. Auth POST sai Origin phải bị từ chối. Xác minh Worker version/deployment ID qua Cloudflare và ghi receipt vào evidence. Không xem trang login tải được là bằng chứng đăng nhập ICT24H thành công; live login cần tài khoản do operator cung cấp qua kênh bảo mật.

## Dữ liệu, backup và rollback

Wrangler migrations là ledger duy nhất. Trước mọi migration hoặc thay đổi dữ liệu production, export backup vào thư mục private của operator; không commit dữ liệu hoặc signed download URL. Ví dụ từ root, thay `BACKUP_PATH` bằng đường dẫn backup private:

```sh
pnpm --filter @studio/api exec wrangler d1 export DB --remote --config wrangler.production.jsonc --output BACKUP_PATH
pnpm --filter @studio/api exec wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
```

Backup SQL và receipt của lần đầu nằm trong output private được ghi ở [PROGRESS](../poc/PROGRESS.md). Trong các lần sau, lưu backup ngoài repo qua kho backup đã được operator chọn. Không reset/seed để sửa lỗi production; với derived read keys hoặc membership, dùng đúng procedure của owner và backup trước effects.

Tra phiên bản trước bằng `deployments list`, rồi `pnpm --filter @studio/api exec wrangler rollback VERSION_ID --config wrangler.production.jsonc`. Code rollback không rollback D1/R2 hay đổi keys. Lần triển khai đầu chưa có phiên bản trước: nếu cần ngắt public access, tắt workers.dev subdomain của đúng Worker trong Cloudflare Dashboard, giữ D1/R2/backup để điều tra.

Build/deploy output thuộc phiên chạy Wrangler. Để xem application logs, dùng Workers → Worker đúng tên trong config → Logs/Live hoặc `wrangler tail --config wrangler.production.jsonc` từ package API, giới hạn theo request/time window và dừng tail sau điều tra. Không ghi password, cookie, token hoặc response profile vào evidence. Chưa thiết lập persistent log retention hay CI/CD trong nhiệm vụ này.
