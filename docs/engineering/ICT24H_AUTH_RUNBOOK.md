# Vận hành tích hợp ICT24H của DataMaker Task (mã nội bộ task8)

Phạm vi đã triển khai: email/password, refresh, phiên cookie task8 và logout. [Kế hoạch](ICT24H_AUTH_INTEGRATION_PLAN.md), [package proof](ICT24H_AUTH_SETUP.md), [acceptance](evidence/AUTH-06/acceptance/verification.json) và [PROGRESS](../poc/PROGRESS.md) ghi kết quả thực tế. **LOCAL_VERIFIED_LIVE_PENDING**: package/Worker/D1/R2/browser đã kiểm local; chưa có public key/test account/revision/TTL của deployment để nghiệm thu live. Tài liệu này là procedure cho operator; session triển khai không deploy, cấu hình remote secrets hay cấp workspace thật.

## Cài package và kiểm tra cấu hình

Dùng Node24.13.0, pnpm11.19.0 và frozen lockfile. Dependency pin exact `@hoa00/i24h-auth-honojs@0.1.1`; metadata, official tarball/integrity/public exports đã đối chiếu với registry. Hono4.13.13, Worker `nodejs_compat`. Không thay package bằng source copy hoặc verifier khác.

Project `.npmrc` chỉ có `@hoa00:registry=https://npm.pkg.github.com`. Trusted **user-level** npm config do operator cung cấp chứa literal placeholder:

```ini
@hoa00:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Chọn file trusted qua `NPM_CONFIG_USERCONFIG=/absolute/trusted/npmrc` rồi chạy `pnpm install --frozen-lockfile`. pnpm11 không expand credential placeholder trong project config. Cloud Network secret có thể là proxy placeholder: giữ nguyên môi trường/proxy/CA, kiểm readiness và request registry thực. Không đọc secret để lấy giá trị, không dump env hoặc in token; readiness unknown không được đổi thành ready chỉ vì secret được khai báo. NODE_AUTH_TOKEN phục vụ registry, không thay public key hoặc secret phiên của ứng dụng.

| Config/binding | Yêu cầu |
| --- | --- |
| AUTH_MODE | `ict24h` để bật real auth; `local` chỉ cho dev có trusted IDs |
| AUTH_PROVIDER_KEY | `ict24h-identity` |
| AUTH_PROVIDER_BASE_URL | `https://hrm-api-v2.cwr.i24h.app`, HTTPS không credential/query/fragment |
| AUTH_TENANT_ID | `ict24h-rdn-dev`, không suy workspace từ tenant |
| AUTH_PUBLIC_KEY | RSA public PEM của đúng deployment; escaped newlines được normalize trước tạo guard |
| AUTH_SESSION_ENCRYPTION_KEY | Secret canonical base64url của đúng32random bytes; cấp qua secret manager |
| AUTH_APP_ORIGIN | Một exact frontend origin, không path/trailing slash; HTTPS trong môi trường public |
| AUTH_SESSION_MAX_AGE_SECONDS | Optional1…1209600, default14ngày, luôn cap theo refresh expiry thực |
| DB / FILES | Bindings hiện hành D1/R2; auth decision dùng primary D1 cùng RequestRepository của nghiệp vụ |

Không đặt public deployment private signing key/SubApp secret trong task8. Không đặt password/SID/provider token/session encryption secret trong VITE variables, Git, Query cache, logs hoặc evidence. Invalid ICT24H config fail closed503; không đổi sang local/mock. Repo Wrangler mặc định **AUTH_MODE=local/STUDIO_ENV=local** cho regression, không phải deployment ICT24H đã cấu hình. Dry-run build không deploy.

Local HTTP chỉ được dùng khi server cấu hình STUDIO_ENV=local và AUTH_APP_ORIGIN là loopback cụ thể, ví dụ `http://127.0.0.1:5173`. Cookie local `task8_local_session`; HTTPS `__Host-task8_session`, Secure/HttpOnly/SameSite=Lax/Path=/, không Domain. Browser HTTP adapter gọi relative `/api/v1` với same-origin credentials; dev proxy cùng origin. AUTH_APP_ORIGIN kiểm exact Origin của auth POST và business writes trước effects. Browser Bearer/user headers không chọn actor.

## Lưu các biến AUTH ở đâu

Đây là **backend Worker bindings**, được code đọc từ `context.env`/`env`. Khai báo tên trong TypeScript không tạo giá trị cấu hình. `NODE_AUTH_TOKEN` của cloud/npm phục vụ cài package; nó không cung cấp các bindings AUTH cho Worker. Các biến AUTH không nằm trong database và không đặt ở file `.env` của frontend.

| Biến | Local `wrangler dev --local` | Deployment Cloudflare Worker |
| --- | --- | --- |
| AUTH_MODE, AUTH_PROVIDER_KEY, AUTH_PROVIDER_BASE_URL, AUTH_TENANT_ID | `apps/api/.dev.vars` cho máy cá nhân; hoặc `vars` trong `apps/api/wrangler.jsonc` cho cấu hình chung | `vars` trong Wrangler config của đúng deployment/environment |
| AUTH_APP_ORIGIN, AUTH_SESSION_MAX_AGE_SECONDS, STUDIO_ENV | Cùng file `.dev.vars`; local origin chính xác và STUDIO_ENV=local | `vars` của deployment; HTTPS origin thực và STUDIO_ENV=production |
| AUTH_PUBLIC_KEY | `apps/api/.dev.vars`, RSA PUBLIC PEM đầy đủ của deployment ICT24H | Có thể dùng `vars` vì là public key; runbook chọn Worker secret binding để quản lý theo môi trường/rotation |
| AUTH_SESSION_ENCRYPTION_KEY | `apps/api/.dev.vars`, secret riêng của task8 | Worker secret binding, không commit vào Wrangler config |

Repo đang giữ `AUTH_MODE=local` trong [wrangler.jsonc](../../apps/api/wrangler.jsonc). Muốn thử ICT24H ở máy cá nhân, `.dev.vars` ghi đè các key trùng trong `vars` khi chạy local. Đường dẫn phải cạnh Wrangler config, tức **apps/api/.dev.vars**, không phải `.dev.vars` ở root repo. `.dev.vars` đã được gitignore; chỉ [template .dev.vars.example](../../apps/api/.dev.vars.example) được commit. Wrangler không tự đọc template này.

### Cấu hình local từ root repo

1. Tạo `apps/api/.dev.vars` từ template **chỉ khi chưa có file**. Lệnh dưới đọc template public, tạo encryption key riêng32random bytes base64url rồi ghi file mode0600; không in key và không đọc secrets hiện hữu. `flag:'wx'` dừng nếu file đã có, giữ nguyên cấu hình/key đang dùng:

   ```sh
   node --input-type=module <<'JS'
   import { readFileSync, writeFileSync } from 'node:fs';
   import { randomBytes } from 'node:crypto';
   const template = readFileSync('apps/api/.dev.vars.example', 'utf8');
   const config = template.replace('REPLACE_WITH_32_BYTE_BASE64URL_SECRET',
     randomBytes(32).toString('base64url'));
   writeFileSync('apps/api/.dev.vars', config, { flag: 'wx', mode: 0o600 });
   JS
   ```

   Nếu đã có `.dev.vars`, chỉnh file đó và giữ encryption key hiện hữu; nếu key còn là placeholder thì cấp secret32bytes qua secure tooling của operator. Không chạy tạo key mỗi lần startup. Việc đổi encryption key sẽ khiến sessions cũ không decrypt được.

2. Thay placeholder **AUTH_PUBLIC_KEY** trong file bằng nguyên PEM `-----BEGIN PUBLIC KEY-----`…`-----END PUBLIC KEY-----` của đúng ICT24H deployment. Dùng quoted multiline PEM hoặc một dòng với escaped `\n`, ví dụ cấu trúc sau (dòng REPLACE phải thay bằng nội dung key thật):

   ```dotenv
   AUTH_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nREPLACE_WITH_DEPLOYMENT_PUBLIC_KEY_BASE64\n-----END PUBLIC KEY-----"
   ```

   RSA public key phải do operator ICT24H cấp; tự tạo cặp RSA mới chỉ phù hợp fixture tests, không verify token live. Copy template nguyên vẹn chưa thay cả hai key không phải config dùng được; lệnh tạo file ở bước1 đã thay encryption placeholder, vẫn cần public PEM ở bước2. Không đưa private signing key vào file.

3. Apply migrations trên storage đã chọn theo phần Upgrade, rồi restart API để Wrangler nạp `.dev.vars`. Chạy backend và frontend HTTP trong hai terminal:

   ```sh
   pnpm --filter @studio/api dev
   ```

   ```sh
   VITE_DATA_MODE=http pnpm --filter @studio/web dev
   ```

   Mở `https://datamaker-task.test:1355` qua [Portless](../../README.md#chạy-workspace-local), đặt `AUTH_APP_ORIGIN=https://datamaker-task.test:1355` trong `.dev.vars` để khớp exact frontend origin. Proxy web chuyển `/api` tới named API, giữ browser Origin và xác thực TLS bằng CA Portless. Với `.dev.vars` đã tồn tại, chỉ đổi AUTH_APP_ORIGIN, giữ keys và các bindings khác. `dev:direct` vẫn hỗ trợ HTTP loopback5173/8787 khi cổng rảnh; khi đó cần origin loopback tương ứng. Frontend chỉ cần public VITE_DATA_MODE=http và VITE_API_BASE_URL=/api/v1, không nhận AUTH_PUBLIC_KEY/encryption key/token. Thay giá trị `.dev.vars` xong restart API; khi thay frontend mode phải restart Vite.

Không chỉ `export AUTH_MODE=ict24h` rồi kỳ vọng tự thành Worker binding; procedure này dùng file `.dev.vars` rõ ràng và không cần bật import toàn bộ process env. Nếu dùng `--env NAME`, Wrangler chọn `.dev.vars.NAME` khi file đó tồn tại thay vì merge với `.dev.vars`: file riêng phải có đủ auth bindings. Repo hiện không khai báo named deployment environment; không giả định `--env production` đã cấu hình sẵn.

### Khi operator cấu hình deployment

[Hướng dẫn production](PRODUCTION_DEPLOYMENT.md) sở hữu đích deploy/backup/rollback; cấu hình riêng nằm ở `apps/api/wrangler.production.jsonc`. AUTH_APP_ORIGIN phải khớp exact HTTPS origin của Custom Domain trong cấu hình đó; đổi domain cần cập nhật binding và đăng nhập lại vì cookie gắn hostname. Các ví dụ vars bên dưới minh họa trường cấu hình, không thay thế file production đã chốt.

`.dev.vars` chỉ cho local development, không được upload bằng deploy. Nonsecret `vars` phải nằm trong Wrangler config của Worker đích; ví dụ dưới đây là **phần vars**, không phải full deployment config và không thay D1/R2 bindings bằng placeholder local:

```json
{
  "vars": {
    "AUTH_MODE": "ict24h",
    "STUDIO_ENV": "production",
    "AUTH_PROVIDER_KEY": "ict24h-identity",
    "AUTH_PROVIDER_BASE_URL": "https://hrm-api-v2.cwr.i24h.app",
    "AUTH_TENANT_ID": "ict24h-rdn-dev",
    "AUTH_APP_ORIGIN": "https://REPLACE_WITH_ACTUAL_FRONTEND_HOST",
    "AUTH_SESSION_MAX_AGE_SECONDS": "1209600"
  }
}
```

AUTH_PUBLIC_KEY và AUTH_SESSION_ENCRYPTION_KEY đặt ở **Cloudflare Dashboard → Workers & Pages → Worker đích → Settings → Variables and Secrets**, loại Secret; hoặc operator dùng Wrangler `secret put` với đúng Worker/config/environment đã được giao. Public key không phải RSA private key; chọn secret binding ở đây là cách quản lý cấu hình môi trường. Không lưu encryption secret vào `vars`/Git, không dùng key fixture hoặc placeholder trong ví dụ.

Phần này chỉ mô tả vị trí cấu hình; chưa tạo deployment/environment, chưa upload secret, chưa deploy hoặc nghiệm thu live. Cần operator public key/account/revision/TTL như live gate cuối runbook. Secret upload/deploy là thao tác riêng được giao cho operator, không là bước của `auth:link:local`.

## Upgrade và explicit link

Với storage có dữ liệu, giữ backup/ledger theo procedure D1 hiện hành. Apply forward migrations0003/0004 sau0000…0002; không reset, sửa applied SQL hoặc chạy seed để sửa account. Nếu storage chưa backfill readKeys, chạy bounded backfill trước sử dụng profile/directory. Local commands hiện có:

```sh
pnpm --filter @studio/api db:migrate:local
pnpm --filter @studio/api db:backfill:local --persist-to /absolute/local-storage
```

Migration command mặc định dùng storage local của Wrangler; khi dùng persist path riêng, dùng cùng `--persist-to` cho `wrangler d1 migrations apply DB --local` và các procedure sau. Forward tables giữ nguyên users/memberships/Undo/activity/history và derived readKeys. Native old-ledger/fresh/rerun/preservation evidence nằm ở AUTH-02 và full regression AUTH-06. Remote migration là thao tác operator được giao riêng, không có remote script triển khai trong session này.

Với local profile có cùng email central user, xác nhận **cả central UUID/tenant và local UUIDv7** bằng trusted operator access. Các giá trị CENTRAL_UUID/LOCAL_UUIDv7/path dưới đây là placeholder cần thay bằng IDs và storage thật. Explicit link trước login, không tự link theo email:

```sh
pnpm --filter @studio/api auth:link:local --persist-to /absolute/local-storage --tenant ict24h-rdn-dev --subject CENTRAL_UUID --user-id LOCAL_UUIDv7
```

Trước link, storage phải có `users` và `authIdentities` (forward0003). Command hiện kiểm schema/user bằng bounded readonly preflight; thiếu bảng báo rõ tên và yêu cầu apply migrations cùng persist path, user không tồn tại yêu cầu kiểm storage/users.id. Không tự migrate/reset/seed hoặc tạo user. Unexpected failure giữ error code, resolved storage path và operator log directory; expected failure không chỉ báo AUTH_SERVICE_UNAVAILABLE/stack nữa.

Với storage mặc định, từ root repo có thể kiểm prerequisite rồi apply missing migrations (giữ dữ liệu):

```sh
pnpm --filter @studio/api exec wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','authIdentities');" --json
pnpm --filter @studio/api db:migrate:local
```

Nếu query chỉ có users, cần apply0003 trước link; migrations apply cũng chạy0004 nếu pending. Với persist path riêng, truyền cùng absolute path cho migration và link, không chạy migration vào DB default rồi link một DB khác. Linking không cần public key/password hoặc request tới ICT24H; thành công linking không chứng minh live auth thành công.

Command dùng public members use-case trên ephemeral loopback-only Worker. Mapping cùng key/user idempotent; key đã trỏ user khác hoặc user không tồn tại conflict với zero effects. Không ghi đè mapping, không sửa user IDs/profile/history/membership, không tạo principal từ client input. Không dùng command local với database remote; remote link phải là trusted operator procedure cùng invariants. Sau link, login giữ name/title/version đã chỉnh trong task8; central profile không overwrite hồ sơ nội bộ.

Người mới qua guard và tenant-scoped whoami tạo canonical profile+mapping trong một native D1 batch; concurrent same identity hội tụ, email collision409 không orphan. Có thể tồn tại JIT profile sau lỗi session persistence; retry dùng mapping đó. Không có workspace/membership/Owner/preferences tự tạo.

## Cấp workspace và kiểm waiting→ready

Đây là nghiệp vụ quản trị tin cậy; không có public grant API/UI. Operator chọn user UUIDv7 đã mapping, **workspace đang tồn tại**, member UUIDv7, role canonical Owner/Admin/Member/Guest và thời gian epoch-ms. Confirm authorization, workspace/user và membership hiện tại; không lấy role từ JWT. Existing membership update phải giữ version/association/CAS theo owner, không INSERT duplicate hoặc overwrite prefs.

Với user chưa có membership, chuẩn bị **đầy đủ** hai documents bằng `MemberPreferencesSchema` và `NotificationPreferencesSchema` từ `@studio/contracts/api`; validate rồi JSON.stringify canonical output trước ghi. Member prefs gồm theme/accent/side/density/weekStart/dateFmt/lang/tz/timeFmt/spell/motion/home/openTasks/confirmDel/defaultTab/showDoneBoard; notification prefs gồm email/push/mention/assign booleans. Không dùng `{}` hoặc chỉ tạo membership. Không copy private preferences của người khác; test helper [auth-grant](../../apps/api/tests/support/auth-grant.mjs) chỉ dùng canonical fixture documents cho acceptance, không là production provisioner.

Gửi hai prepared statements dưới đây qua **một native `DB.batch`**, với UUID/timestamp/documents đã validate; SQL root cần fresh unused member ID. Row0 membership và row1 prefs cùng commit/rollback. SQL zero-row không tự rollback: statement0 guard ngăn insert nếu workspace/user thiếu hoặc duplicate; statement1 chỉ gắn đúng fresh candidate member. Kiểm result changes cả hai bằng1 rồi reread membership và parse cả documents; mismatch không được báo cấp quyền thành công hoặc blind replay. Không ghi thành hai CLI commit riêng.

```sql
INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,createdAt,updatedAt,version)
SELECT :memberId,:workspaceId,:userId,:role,'active',:now,:now,1
WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=:workspaceId)
  AND EXISTS(SELECT 1 FROM users WHERE id=:userId)
  AND NOT EXISTS(SELECT 1 FROM workspaceMembers WHERE workspaceId=:workspaceId AND userId=:userId);

INSERT INTO memberPreferences(workspaceId,memberId,preferencesJson,notificationPreferencesJson,updatedAt)
SELECT :workspaceId,:memberId,:preferencesJson,:notificationPreferencesJson,:now
WHERE EXISTS(SELECT 1 FROM workspaceMembers WHERE id=:memberId AND workspaceId=:workspaceId
  AND userId=:userId AND status='active' AND createdAt=:now AND version=1);
```

Đây là template operator có named parameters để đọc; D1 prepared binding phải chuyển chúng thành positional `?`/`.bind(...)` theo tooling hiện hành. Không nhận raw SQL/docs qua route production. Không provision workspace mới. Waiting “Kiểm tra lại” đọc session+workspaces; ready chọn active/nonremoved membership đầu theo workspace ID ASC, same profile ID. Bootstrap cần cả prefs documents. Invited/removed/private grants tiếp tục do D1/policy/final SQL quyết định; Owner không bypass private grant. Người waiting được GET profile nhưng PATCH profile403.

### Workspace đầu tiên trên môi trường mới

Procedure grant ở trên chỉ thêm membership vào workspace đã có. Khởi tạo workspace đầu tiên là thao tác operator riêng, cần yêu cầu trực tiếp xác định tên workspace, principal đã mapping và vai trò; không suy Owner từ lần đăng nhập đầu hoặc central role.

Validate workspace và hai preference documents bằng schemas ở [contracts](../../packages/contracts/src/models.ts); dùng UUIDv7 mới và guard user/identity/provider/tenant hiện tại. Tạo workspace, membership và preferences trong một native `DB.batch` với marker mới gate các INSERT phụ thuộc. Không chạy ba lệnh ghi độc lập hoặc lấy preferences của người khác. Xác minh chính xác ba changes và đọc lại bằng canonical membership/bootstrap; zero-row guard không được báo success, unknown ACK phải reconcile IDs cũ trước khi retry.

Một operator Worker tạm chỉ bind loopback, có token riêng và D1 `remote:true` có thể thực hiện native batch mà không thêm public endpoint hoặc đổi deployment sản phẩm. Backup trước effects, dừng/xóa Worker và token trong cleanup; giữ input/backup/receipt có PII ngoài Git với quyền private. Nếu cần đảo thao tác, kiểm lại versions/references và backup mới trước khi gỡ đúng bản ghi còn nguyên/chưa được dùng; không restore toàn DB hoặc xóa profile/auth/session.

## Phiên, lỗi và rotation

Tenant của identity lấy từ JWT đã được package xác minh chữ ký và kiểm `tenant` bằng AUTH_TENANT_ID. Identity Service đánh dấu entity `srv_t` bằng `@Exclude({ toPlainOnly: true })`, nên JSON profile login/whoami có thể không chứa field này. Adapter chấp nhận field bị bỏ qua, nhưng field được trả phải là string đúng tenant; null/empty/malformed hoặc tenant khác vẫn bị từ chối. Subject JWT phải khớp cả login user ID và whoami ID trước mapping/session writes; không dùng email hoặc tenant header của browser làm principal. Follow-up live response metadata và native regression xem [AUTH-PROFILE-TENANT-FIX](evidence/AUTH-PROFILE-TENANT-FIX/verification.json); original Identity snapshot và source revision giữ nguyên.

SID là32random bytes chỉ trong cookie, D1 giữ hash; public authSession.id là metadata không bí mật. Provider token pairs chỉ ciphertext AES-GCM với nonce riêng/AAD session+kind+version. Protected request giải mã access và chạy **package guard mỗi lần**, rồi đối chiếu identity và membership. Normal business requests không gọi Identity Service; login/refresh gọi whoami. Central deletion chỉ được phát hiện lúc login/refresh; không hứa immediate disable/revoke.

`remember=true` cookie persistent tới minimum first refresh expiry và absolute deadline task8; false không Max-Age/Expires nhưng deadline server vẫn áp dụng. Refresh giữ SID/deadline/cookie, tăng tokenVersion qua CAS; loser reread canonical tối đa một lần. Source snapshot mô tả stateless refresh: live phải xác nhận deployment chưa rotation/reuse detection khác trước sử dụng CAS design. Không retry provider timeout hoặc business mutations/uploads tự động; UI giữ draft/request IDs. GET401 có một shared refresh và một retry read; provider503 giữ availability error, không báo sai mật khẩu hoặc fallback demo.

Login/account switch capture previous row/generation trước upstream; native final batch guarded against late logout/replacement. Anonymous login không có previous row để server revoke attempt; form serialize và client generation discard stale completion. X-Task8-Session-Id từ Query metadata tại intent creation, không từ SID cookie; mismatch409 không refresh/revoke/command effects. Cross-tab BroadcastChannel/focus resync đọc SID thật, cancel/clear cache và chặn response/intent cũ. Business request đã qua auth có thể hoàn thành theo final business guards, không có promise cancel commit đang chạy.

Logout không decrypt/verify expiry/JWT, revoke row và xóa ciphertext/tăng version+generation. Missing SID/row (kể cả old metadata) hoặc same revoked session trả200 idempotent. Found SID trỏ S2 với expectedS1 trả409, giữ S2. Refresh/logout không Set-Cookie nên response cũ không xóa/khôi phục cookie login mới. Revoked cookie còn trong browser nhưng không authorize; login sau thay SID. Storage failure503 phải hiển thị retry; chỉ thông báo signed-out sau acknowledgement. Unknown write ACK có thể đã commit: retry logout idempotent, không suy success từ UI clear. Logout chỉ kết thúc current task8 session, không revoke central stateless token hoặc mọi browser.

RSA key rotation: nhận deployment public key mới từ operator, tạo lại application/guard factory; không có JWKS/automatic kid selection. Old signed access có thể bị401; xác nhận provider tokens mới bằng đúng key. Encryption-key rotation: tạo32bytes qua secure tooling/secret manager, update secret và application; old sessions không decrypt được, logout vẫn revoke được. Không có dual-key migration/envelope rotation trong scope này; thông báo cần login lại. Không ghi key/token values vào lệnh shell/logs để kiểm tra.

Kiểm tra cookie flags/expiry và response metadata/status trong DevTools hoặc browser test mà không copy cookie value/Authorization/body credentials. D1 diagnostics chỉ chọn session ID, expiry/version/generation/revokedAt; không SELECT * hoặc xuất SID hash/ciphertexts. Theo dõi canonical error code/request correlation; raw upstream errors/token/stack không được forward.

## Cleanup hữu hạn

Không có cron/queue/purge API. Operator có thể loại expired session rows bằng indexed `(expiresAt,id)` theo retention cutoff epoch-ms đã chọn, mỗi batch tối đa100 rows:

```sql
DELETE FROM authSessions
WHERE id IN (SELECT id FROM authSessions WHERE expiresAt<=:cutoff
             ORDER BY expiresAt,id LIMIT 100)
  AND expiresAt<=:cutoff;
```

Cutoff ở quá khứ theo retention; phiên revoke trước deadline giữ tới cutoff của expiresAt rồi mới cleanup. Operator kiểm rows affected, chạy số lượt có bound đã định, không loop unbounded hoặc xóa identity/user/membership/history. Hết hạn không làm kéo dài khi refresh nên predicate không loại session đang còn deadline. Logout sau row đã cleanup vẫn idempotent; lookup/storage failure không được coi như missing row. Không đọc/giải mã token để cleanup.

## Acceptance và live gate

Commands active từ root; API test runner có16features, gồm5auth suites và11regression D1/R2 hiện hữu. Cấu hình Chromium path bằng PLAYWRIGHT_BROWSERS_PATH nếu cache riêng (Turbo passthrough đã khai báo). Writable XDG tool dirs dành cho môi trường sandbox, không đổi fixture user storage.

```sh
pnpm --filter @studio/api format:check
pnpm --filter @studio/api lint
pnpm contracts:consumers
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @studio/web build:http
pnpm test
pnpm --filter @studio/api test:integration --feature auth-provider
pnpm --filter @studio/api test:integration --feature auth-identity
pnpm --filter @studio/api test:integration --feature auth-session
pnpm --filter @studio/api test:integration --feature auth-principal
pnpm --filter @studio/api test:integration --feature auth-web
```

`pnpm verify:data:http-bundle` là existing report generator có default output WU-06 lịch sử; khi dùng cho kiểm tra current phải archive report mới riêng và phục hồi hai tracked historical report files, không commit đè evidence cũ. AUTH-05 command/log giữ actual current bundle check riêng.

`pnpm test` chạy unit/contracts/web và **actual** Worker/D1/R2/browser regressions, không DB mock thay native proof. R2 outcome/checksum/idempotency/Undo/recurrence/permission race/CAS/Unicode/backfill/local identity đều thuộc full gate. AUTH-06 full root có358Node tests,16native suites/2883report probes và20R2/file browser checks; auth-web supplement22probes thêm logout503/retry và late login có previous SID sau tab logout. Native RSA keys mới chỉ ở fixture memory; không chứng minh live provider. Strict source visual14pairs còn FAILED/unaccepted debt kế thừa: AUTH-05 so parent14target PNG byte-identical, hình học/repeats đúng, không đổi baseline/tolerance; deliberate HTTP remember/disabled/unavailable copy được ghi riêng.

Live checklist **NOT_RUN**, cần operator cung cấp public PEM, test account bằng secure environment, deployment revision và TTL/refresh semantics. Không đọc/in secret hoặc gửi credential trong chat/Git. Khi được giao live acceptance với inputs:

1. Confirm correct base/tenant/revision/public key và refresh stateless semantics; khác source thì ghi conflict và điều chỉnh thiết kế trước PASS.
2. Browser login qua task8 Worker; verify tenant/sub/package guard + tenant-scoped whoami; record sanitized status/public profile ID/expiry/cookie flags, không credentials/token/SID.
3. Test pending profile200/null, profile200/workspaces[], no bootstrap/no auto grant. Existing profile dùng explicit link trước login nếu cần.
4. Trusted operator cấp active membership+both preferences trong một native batch vào workspace đã chọn; waiting Retry→ready cùng user ID và permission matrix.
5. Expired access→refresh/new guard/whoami cùng identity, concurrent CAS, absolute deadline/cookie unchanged; wrong tenant/invalid credentials generic401, availability503.
6. App logout acknowledged, subsequent session/protected read401, retry idempotent; record sanitized evidence + actual source/deployment revision rồi mới mark live PASS.

Tài khoản live, grant live và deployment chưa có trong session này; không dùng controlled provider fixture, endpoint lỗi rỗng hoặc registry credential để thay bằng chứng live.


## OIDC local đi kèm Work Suite

Phần này dành riêng cho `AUTH_MODE=oidc` và launcher local của [Work Suite](https://github.com/hoa00/work-management-suite); các procedure ICT24H và production phía trên giữ nguyên phạm vi. Trusted Worker binding `OIDC_LOCAL_PROFILE` chọn **cả bộ** issuer/origin, không nhận profile từ query, header, cookie hoặc frontend:

| Binding profile | `OIDC_ISSUER` | `AUTH_APP_ORIGIN` |
| --- | --- | --- |
| Không đặt `OIDC_LOCAL_PROFILE` | `https://identity-service.demo/api/auth` | `https://datamaker-task.demo` |
| `OIDC_LOCAL_PROFILE=dev1355` | `https://identity-service.demo:1355/api/auth` | `https://datamaker-task.demo:1355` |

Giá trị mặc định dùng HTTPS 443, không tự đổi sang 1355. Profile lạ hoặc issuer/origin lệch bộ cấu hình bị từ chối; không fallback sang ICT24H/local/mock. Client ID/secret, RP environment và token encryption keyset vẫn phải được cung cấp qua trusted backend configuration hiện có; không đưa chúng vào VITE variables hoặc Git.

Suite `pnpm dev:oidc` sở hữu synthetic configuration/state, bindings và topology HTTPS1355. Task8 chỉ nhận profile local rõ ràng từ launcher/operator; thay đổi này không dựng production, đổi production bindings hoặc tự khởi tạo/migrate dữ liệu. Account-link adapter nhận `oidcLocalProfile` từ caller tin cậy; operator kiểm cấu trúc input và issuer khớp profile trước truy cập D1. Các ràng buộc quyền hiện tại, user IDs, membership, CAS và rollback giữ nguyên.

Profile reviewed lịch sử vẫn giữ source fingerprints chặt chẽ; source Task8 mới không tự kế thừa chứng nhận tại baseline cũ. Interactive profile của Suite chụp working tree hiện hành. Không thay evidence hoặc nới guard để biến snapshot mới thành nghiệm thu lịch sử.

Kiểm chuẩn bị hiện tại gồm API typecheck, lint năm file thay đổi, import boundaries và 9 unit tests OIDC authority/browser/session; xem [PROGRESS](../poc/PROGRESS.md). Full native SSO của môi trường hiện tại vẫn chờ proxy HTTPS1355 và DNS cho Identity/Task8; chưa chạy lại và không suy PASS từ unit/typecheck. Việc chuẩn bị này không tự sửa hosts/CA, khởi động proxy, gửi thông báo hoặc sửa dữ liệu ứng dụng.
