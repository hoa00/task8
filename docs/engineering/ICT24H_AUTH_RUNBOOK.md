# Vận hành tích hợp ICT24H của task8

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

## Phiên, lỗi và rotation

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
