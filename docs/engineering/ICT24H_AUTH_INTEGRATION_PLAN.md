# Kế hoạch tích hợp xác thực ICT24H vào task8

Ngày lập: **13/10/2026**. Baseline khảo sát: `3355609294e36de9b4770586a33579b87b7e18bb`. Chuẩn triển khai: [BACKEND_STANDARDS](BACKEND_STANDARDS.md), [API AGENTS](../../apps/api/AGENTS.md), [API README](../../apps/api/README.md).

Giữ form đăng nhập của task8, dùng Identity Service để kiểm tra email/password và cấp token, dùng `@hoa00/i24h-auth-honojs` trên backend để xác minh danh tính. task8 tạo hồ sơ cho người đăng nhập lần đầu và chỉ mở workspace khi D1 xác nhận membership đang hoạt động. Phiên ứng dụng dùng cookie HttpOnly chứa mã phiên ngẫu nhiên, với dữ liệu phiên lưu trong D1.

**Trạng thái: AUTH-01 LOCAL_VERIFIED_LIVE_PENDING; AUTH-02/03/04/05 PASS (visual source debt kế thừa được giữ nguyên); AUTH-06 tiếp theo.** Package0.1.1/tarball/public exports và actual Worker26probes đã xác minh; [checkpoint AUTH-01](ICT24H_AUTH_SETUP.md) giữ commands/evidence. Live verification còn thiếu deployment public key/test account. Các phương án kỹ thuật dưới đây là thiết kế triển khai của task8; tài liệu Identity Service là nguồn contract, không phải chỉ dẫn thay đổi stack hoặc vận hành dịch vụ bên ngoài.

## 1. Phạm vi đã chốt

| Nội dung | Quyết định |
| --- | --- |
| Dự án và stack | task8; React SPA, Hono Worker, Drizzle/D1, R2, pnpm/Turborepo |
| Identity API | `https://hrm-api-v2.cwr.i24h.app`; các path `/v1/...` nối từ base phía server |
| Tenant | `ict24h-rdn-dev`; gửi `i24h-tenant` trong mọi login; JWT phải khớp tenant này |
| Phương thức | Email/password, refresh và đăng xuất khỏi task8 |
| Người mới | Có tài khoản ICT24H trước; lần đầu vào task8 tạo hồ sơ nội bộ, chờ được cấp workspace |
| Quyền nghiệp vụ | D1 giữ membership, Owner/Admin/Member/Guest và private view/edit grants |
| Ngoài đợt đầu | Microsoft/Google/Apple, đăng ký central user, quên/reset mật khẩu, verify email, 2FA, quản lý mọi thiết bị, SubApp/callback, directory sync, UI/API cấp workspace, tự tạo workspace |

Đăng nhập thành công không tự tạo workspace, membership, vai trò Owner hoặc lời mời. Không đăng ký hoặc sửa SubApp: login không phát create callback và cấu hình SubApp không replay user cũ. Không gọi các API create/update/delete user của Identity Service trong các unit này.

## 2. Contract và bằng chứng

[Identity Service snapshot](reference/ict24h/identity-service.md) mô tả `hoa00/i24h-user-service@429a7df143938ff3f6d82c29db5cf31f0feb1386`. Snapshot không xác nhận revision của deployment. [Source manifest](reference/ict24h/source-manifest.json) giữ hash bản upload và bản lưu (chỉ bỏ dòng trống cuối file), phân biệt nguồn với các quan sát trực tiếp.

| Contract | Áp dụng trong task8 |
| --- | --- |
| Login: `POST /v1/auth/login`, `{email,password}` → `data:{user,tokens}` | Parse envelope và profile tối thiểu; access tại `data.tokens.access.token` |
| Refresh: `POST /v1/auth/refresh-token`, `{refreshToken}` → `data:{access,refresh}` | Decoder riêng; refresh không có `user` hoặc `data.tokens` |
| Profile: `GET /v1/user/whoami`, platform Bearer | Scope central ID + tenant; dùng để xác nhận profile khi login/refresh; không dùng `/user/:id` lookup thiếu tenant |
| HTTP status khác `body.statusCode` | Thành công cần HTTP 2xx, body success đúng route và data hợp lệ; có `error` hoặc body lỗi thì không tạo/cập nhật phiên |
| Central UUID = `User.id` = JWT `sub`; `User.srv_t` = JWT `tenant` | External ID riêng, không ép thành UUIDv7 của task8; không đồng nhất tenant với workspace |
| Access JWT RS256, `sub`, `tenant`, `type:ACCESS_TOKEN`, `exp` | Thư viện xác minh chữ ký/loại/tenant; adapter task8 yêu cầu expiry hợp lệ sau verification |
| Không có contract `iss/aud/kid/jti/roles`; claim `user` là JSON string | Không thêm yêu cầu claim chưa được issuer cung cấp; không lấy quyền hoặc profile ứng dụng từ chuỗi này |
| Refresh stateless, không rotation/reuse detection/blacklist/DB-state check | CAS phiên task8; không coi refresh là xác nhận user vẫn tồn tại; không hứa revoke token tại ICT24H |
| TTL fallback source: access 30 phút, refresh 14 ngày | Đây không phải TTL deployment; lấy expiry thực tế và áp giới hạn phiên task8 |
| RSA public key PEM do operator cấp; không JWKS | Dùng key đúng deployment; không cần private signing key hoặc SubApp secret |

[Kiểm tra endpoint](evidence/ICT24H-AUTH-PLAN/endpoint-checks.json) bằng request `{}` đã ghi: login HTTP400/body400; refresh HTTP201/body400; GET `/` HTTP404. Đây là bằng chứng route/error envelope, không phải login hoặc refresh thành công. [Ba path OpenAPI](evidence/ICT24H-AUTH-PLAN/openapi-checks.json) được kiểm tra trả404, không suy ra service không có tài liệu ở path khác.

[Tài liệu thư viện](https://github.com/hoa00/i24h-auth-honojs/blob/main/packages/i24h-auth-honojs/llms-full.txt) đã đọc trong phiên: Node24 ESM, Hono4.13.13, Bearer guard RS256, `UserAuthInfo` trả `{userId,tenantId}`; Workers chưa được thư viện xác nhận. Ví dụ version0.1.1 chưa được đối chiếu tarball. AUTH-01 phải kiểm chứng package thực trong Worker; không suy ra PASS từ tài liệu hoặc từ Node của máy build.

## 3. Luồng ứng dụng và ownership

```text
Form task8 → POST /api/v1/auth/login → Identity login + whoami
          → I24H Bearer guard → external identity → hồ sơ task8
          → D1 session → cookie SID → GET /api/v1/session

Cookie SID → active D1 session → giải mã access token → I24H Bearer guard
           → đối chiếu external identity → principal task8
           → membership theo workspace path → policy/final SQL hiện hữu
```

Module `auth` sở hữu provider HTTP adapter, token-verification HTTP adapter, session crypto/persistence, login/refresh/logout và cookie policy. `members` sở hữu profile, external mapping và public use-case đảm bảo hồ sơ; auth không deep-import mapper hoặc read-key encoder của members. `workspaces` sở hữu default workspace selection. Composition inject cùng `RequestRepository`, clock, IDs, crypto và provider dependencies; application không nhận Hono Context hoặc raw D1 binding.

Chỉ import public exports của package. Cấu hình guard có `serviceCredentials:{}`; đợt này không dùng Basic guard. Thư viện chỉ nhận Authorization Bearer: adapter tạo header từ token đã lấy ở session phía server trên request/context của guard, trước body parsing. Không lấy browser header làm nguồn actor thay cookie, không monkeypatch hàm Hono hoặc bỏ qua guard khi SID hợp lệ. Worker proof phải kiểm tra context, exception, streams/multipart và byte endpoints trước khi chốt cách compose adapter.

## 4. API và session contract của task8

| Operation | Input | Kết quả |
| --- | --- | --- |
| `POST /api/v1/auth/login` | JSON `{email,password,remember}`; email hợp lệ, password string từ6 ký tự, giới hạn bytes/length rõ | HTTP200 `{data:SessionDto}` và SID cookie; lỗi không phát SID |
| `POST /api/v1/auth/refresh` | Không nhận token từ browser; body rỗng; expected session ID khi client đã có metadata | HTTP200 `{data:SessionDto}` với expiry mới; SID giữ nguyên, không `Set-Cookie` |
| `POST /api/v1/auth/logout` | SID và expected session ID khi client đã có metadata; không cần JWT còn hạn | HTTP200 `{data:{signedOut:true}}` sau revoke; thiếu/đã revoke là idempotent success |
| `GET /api/v1/session` | SID hoặc trusted local identity mode | HTTP200 profile/default workspace/capabilities/metadata phiên; không có phiên hợp lệ→401 |
| `GET /api/v1/me/profile`, `GET /api/v1/workspaces` | Principal đã xác thực, không bắt buộc membership | Người chờ được đọc profile và danh sách workspace rỗng |
| `/api/v1/workspaces/:workspaceId/...` | Principal + membership theo path + existing policy | Giữ các DTO, 403/404 distinction và final SQL hiện hữu |

`SessionDto` mở rộng `currentWorkspaceId` thành UUIDv7 hoặc `null`; thêm `authSession:{id,accessExpiresAt,expiresAt}|null`. `id` là ID phiên không bí mật, khác SID cookie. Trusted local mode có `authSession:null`; identity mode mở rộng `development|ict24h`. Authentication capability chỉ `implemented` trong ICT24H mode đã cấu hình; không bật accountSecurity, invitations hoặc workspaceProvisioning.

AUTH-01 định nghĩa schema phiên ICT24H mới độc lập để login/refresh có contract đích. Canonical `getSession` và nullable-workspace consumers chỉ chuyển cùng nhau trong AUTH-04, gồm local/mock fixtures và route chờ quyền; không land breaking schema trước consumers hoặc thêm response giả để qua typecheck.

Có session nhưng `currentWorkspaceId:null` là trạng thái chờ cấp workspace, không phải sai mật khẩu. Default workspace là phần tử đầu trong tập active/nonremoved memberships theo `workspaces.id ASC`, cùng thứ tự list hiện hành. URL workspace quyết định scope màn hình và luôn được kiểm tra lại; không thêm last-used workspace persistence trong đợt này. Nếu workspace mặc định bị gỡ, session chọn workspace hợp lệ khác hoặc trảnull.

State-changing business requests trong ICT24H mode gửi ID phiên kỳ vọng, ví dụ header `X-Task8-Session-Id`, từ session cache tại thời điểm tạo intent. Refresh/logout từ UI đã có metadata cũng gửi header này. Server đối chiếu với SID đã resolve; mismatch→`SESSION_CHANGED` HTTP409, không refresh/revoke/commit hoặc tự retry dưới tài khoản mới. Header không cho phép chọn actor. Logout so ID trước effects nhưng không phụ thuộc JWT còn hạn. Bootstrap `GET session` và một lần refresh sau reload có thể chưa có expected ID; chúng chỉ khám phá phiên từ SID, chịu client generation và không dispatch business mutation trước session đồng bộ.

Chuẩn hóa lỗi vào canonical API schema:

- Input task8 sai→400 `VALIDATION_ERROR`; provider login từ chối credentials→401 `UNAUTHENTICATED` với message chung.
- Session/token invalid, hết hạn hoặc sai tenant/type→401; workspace access giữ policy hiện hữu.
- Email collision cần explicit linking→409 `CONFLICT`; phiên browser khác intent→409 `SESSION_CHANGED`.
- Provider timeout/5xx/malformed success hoặc session storage không khả dụng→503 `AUTH_SERVICE_UNAVAILABLE`, không báo sai mật khẩu. Hai error codes mới được thêm cùng status map và consumers trong AUTH-01.
- Map guard `UNAUTHORIZED`/HTTPException sang `UNAUTHENTICATED`; không forward raw upstream `User`, error arrays, stack hoặc token; không biến expected401 thành500.

## 5. Hồ sơ và mapping external identity

Forward migration sau0002 thêm `authIdentities`, unique `(providerKey,tenant,subject)` và FK tới `users.id`. `providerKey='ict24h-identity'` là namespace ổn định, không thay đổi theo URL deployment. Không coi central UUID là internal UUIDv7, không tự link bằng email, không sửa IDs/Undo/activity/history đã có.

Login và refresh xác minh access JWT bằng library trước khi đọc các claim bổ sung; yêu cầu `exp` integer hữu hạn còn hạn và expiry response hợp lệ. Refresh token được xử lý như credential opaque do provider cung cấp, không đưa qua access guard hoặc tự viết một thư viện verify khác. Profile `whoami.id` phải khớp `sub`; dữ liệu thiếu/sai shape là lỗi contract, không fallback sang JWT profile chưa chuẩn hóa.

Khi chưa có mapping, members tạo user UUIDv7 và mapping trong cùng native D1 batch. Bootstrap profile dùng email hợp lệ, name từ fullname/username/email theo bounded mapper; title rỗng, avatar default của ứng dụng, timezone `UTC`, timestamps một clock và version1. Mapper reject malformed surrogate hoặc normalize rồi validate cả D1 read-equivalent text trước INSERT; cắt name không được chia surrogate pair. Raw string hợp lệ nhưng đọc lại vượt NameSchema không được commit thành profile lỗi. Ghi đầy đủ `readKeys` bằng owner [profileReadTextKeys](../../apps/api/src/modules/members/domain/read-text.ts) và pinned encoder; default `'{}'` không đủ sau migration read-key. Không tạo membership/preferences/workspace.

Concurrent first login cùng identity phải hội tụ một canonical user+mapping; email cùng user khác phải conflict không orphan user. Guard root insert, mapping insert theo candidate/fresh marker và canonical result trong cùng batch; không dùng `matchedBatch` mặc định theo cách coi root INSERT0 của concurrent winner là lỗi. Mọi statement giữ budget hiện hữu và typed result.

Repeat login/refresh không overwrite name/title/version profile task8. Với fixture hoặc user đã có cùng email, operator phải explicit-link external identity tới local user trước khi dùng; mapping existing key không được ghi đè sang user khác. AUTH-02 cung cấp procedure local có validate/zero-effect-on-conflict cho linking, không cấp membership hoặc thay quyền.

Principal user được tách khỏi yêu cầu có default workspace. `PATCH /me/profile` khi không có workspace trả403 trước command, giữ final active-membership/CAS SQL hiện hữu; mở profile editing cho waiting user là scope khác.

## 6. Phiên D1 và đăng xuất

`authSessions` có UUIDv7 ID, hash SID, FK identity/user, access/refresh ciphertext và expiry, absolute expiry, tokenVersion, authGeneration, createdAt và revokedAt. SID là 32 random bytes base64url; chỉ cookie giữ SID gốc. AES-GCM dùng một Worker secret 32 bytes, nonce ngẫu nhiên riêng và AAD gắn ID phiên/token kind/version; không lưu credential plaintext hoặc thêm KMS/dịch vụ mới. Session decision đọc primary D1 qua request execution owner, không dựa replica/bookmark cũ hoặc mutable in-isolate user cache.

Login chỉ phát SID sau verification, validated profile, canonical mapping và session persistence thành công. Đổi tài khoản phát SID mới và revoke SID cũ của browser bằng guarded batch. Capture previous SID row/generation/status trước khi gọi upstream; final batch chỉ insert session mới và replace session cũ nếu snapshot còn đúng. Logout và replacement tăng authGeneration; refresh chỉ đổi tokenVersion. Kết quả login cũ sau logout/account switch không tạo phiên mới hoặc Set-Cookie. Hồ sơ JIT đã xác minh có thể tồn tại nếu bước session thất bại; nó vẫn không có membership, lần retry dùng lại mapping canonical.

Client serialize login/logout intent và đồng bộ auth generation giữa tab. Nếu bắt đầu login chưa có SID, server chưa có previous-session generation để hủy một attempt đang chạy; không hứa cancel một login anonymous qua revoke SID chưa tồn tại. UI khóa concurrent submit và chỉ nhận metadata của generation hiện tại; expected-session checks ngăn view cũ gửi command dưới phiên khác. Login failure không làm mất phiên đang hoạt động. Không coi write acknowledgement không rõ là success; read reconciliation phải hữu hạn và theo owned session ID, không blind replay commands.

Protected request: đọc active/nonexpired session → giải mã access → chạy guard → so `(tenant,sub)` với expected identity → resolve user/membership. Guard chạy trên từng request. RequestRepository được tạo một lần và tính cả auth overhead trong giới hạn50 statements/request,100 parameters/statement,50 batch statements; không bypass binding hoặc tăng limits.

Refresh:

1. Đọc active session và version `v`, kiểm absolute deadline và refresh expiry.
2. Gọi provider refresh một lần; kiểm envelope, token mới và verified identity trùng session. Gọi tenant-scoped whoami để phát hiện user đã không còn tồn tại; không tuyên bố whoami kiểm mọi active/disabled flag.
3. CAS pair mới với `tokenVersion=v`, `revokedAt IS NULL`, deadline còn hạn; winner tăngversion. Loser bỏ kết quả, đọc canonical active session lại tối đa một lần; không ghi vào phiên đã revoke hoặc đổi identity.
4. Invalid refresh/user404 chỉ revoke bằng CAS của đúng SID/version `v` đã đọc. Nếu version đã đổi, đọc canonical tối đa một lần như loser; lỗi của pair cũ không được revoke pair mới. Timeout/5xx không revoke phiên hoặc báo sai mật khẩu. Giữ absolute deadline ban đầu, không kéo dài vô hạn theo refresh.

Stateless refresh của snapshot cho phép CAS thay vì distributed lease. Nếu deployment có rotation khác snapshot, AUTH-01 phải ghi conflict và điều chỉnh thiết kế trước AUTH-03; không dùng assumption reuse như một runtime fallback. Không tự retry request refresh upstream sau timeout/unknown outcome.

Logout lookup SID không lọc access/refresh/absolute expiry, không decrypt và không chạy JWT guard; đối chiếu expected session ID rồi revoke trong D1, tăng tokenVersion/authGeneration và xóa ciphertext. Phiên hết hạn, ciphertext lỗi hoặc key đã đổi vẫn được revoke; thiếu/đã revoke trả idempotent success. Refresh đang chạy không thể khôi phục phiên. Refresh và logout không trả `Set-Cookie`: cookie revoked còn trong browser nhưng vô dụng, login sau thay SID. Quy tắc này tránh response logout/refresh cũ xóa hoặc khôi phục cookie của login mới. Logout chỉ kết thúc phiên task8 đang dùng, không revoke ICT24H token hoặc mọi browser.

Request qua authentication trước logout có thể hoàn thành theo final business guards hiện hữu; không hứa hủy business commit đang chạy. Request mới sau revoke bị từ chối. Browser logout chỉ báo thành công sau server acknowledgement hoặc xác nhận SID đã revoke; lỗi DB phải cho phép retry, không success giả.

## 7. Cookie, cấu hình và thời hạn

HTTPS cookie: `__Host-task8_session`, HttpOnly, Secure, SameSite=Lax, Path=/, không Domain. Local HTTP dùng tên khác và Secure=false chỉ khi server cấu hình môi trường local cùng origin loopback cụ thể; không suy từ header browser để tắt Secure. Auth POST và cookie-authenticated business mutations kiểm Origin theo allowlist server; login/refresh/logout dùng JSON canonical. Multipart upload vẫn được hỗ trợ sau Origin/session check.

| Binding/config phía server | Giá trị hoặc vai trò |
| --- | --- |
| `AUTH_MODE` | `local|ict24h`, explicit; không fallback ICT24H lỗi sang trusted local/mock |
| `AUTH_PROVIDER_BASE_URL` | `https://hrm-api-v2.cwr.i24h.app`, không nhận URL từ browser |
| `AUTH_PROVIDER_KEY` | `ict24h-identity` |
| `AUTH_TENANT_ID` | `ict24h-rdn-dev` |
| `AUTH_PUBLIC_KEY` | RSA PEM đúng deployment; normalize escaped newline trước factory |
| `AUTH_SESSION_ENCRYPTION_KEY` | Secret AES-GCM32bytes, cấp bằng môi trường/secret manager |
| `AUTH_SESSION_MAX_AGE_SECONDS` | Chính sách task8 mặc định14ngày (`1209600`), luôn cap theo refresh expiry thực |
| `AUTH_APP_ORIGIN` | Origin frontend chính xác, gồm dev origin khi chạy local |
| `NODE_AUTH_TOKEN` | Chỉ lúc cài package private; placeholder nằm trong trusted/user npm config, project `.npmrc` chỉ map registry vì pnpm11 không expand credential ở project config; không commit giá trị |

Guard factories validate/capture config; rotation key phải tạo lại guard/application. Session encryption-key rotation kết thúc sessions dùng key cũ nếu không có migration key envelope được giao riêng. Fail closed khi config invalid. Không đưa binding/secret vào VITE variables, logs, Query cache hoặc tài liệu generated.

`remember=true` phát persistent SID cookie tới minimum của first refresh expiry và deadline 14 ngày của task8; `remember=false` dùng session cookie không Max-Age/Expires, với cùng deadline server tối đa. Refresh không kéo dài deadline/cookie. Browser session restore có thể giữ session cookie; không hứa logout do đóng browser. Đổi nhãn “Remember me for 30 days” thành “Remember this device” qua i18n; không khẳng định TTL deployment từ fallback source.

Normal business requests không gọi Identity Service. whoami được gọi khi login/refresh; central deletion chỉ được quan sát lúc đó, không phải revoke tức thì. D1 membership vẫn được kiểm tại workspace access/final SQL. Đây là giới hạn có chủ đích của scope hiện tại.

## 8. Frontend và trạng thái chờ quyền

Giữ AuthPage/layout/tokens/components hiện có; real auth facade thuộc HTTP runtime và gọi operation typed. Password chỉ nằm trong form/request đang xử lý, không lưu draft demo hoặc Query cache. Mock mode giữ demo tách riêng; ICT24H HTTP mode không có opt-in success giả. HTTP client vẫn dùng relative `/api/v1` và `credentials:'same-origin'`; không gọi trực tiếp provider từ browser.

- Login thành công đọc session; workspace null→route `/waiting-for-workspace` ngoài shell, có profile tối thiểu, thông báo chờ quyền, “Kiểm tra lại” và logout. Không bootstrap, không mở workspace seed/onboarding demo.
- Session có workspace→return URL nội bộ hợp lệ mà user vẫn được phép truy cập, hoặc `/`/default workspace. Chặn redirect ngoài origin. GET session/route401 thử một refresh SID rồi retry GET một lần; chỉ về login nếu refresh/session vẫn invalid401. Provider503 giữ lỗi khả dụng; refresh không gọi lại interceptor của chính nó. Foreign/private resource giữ403/404 policy hiện hữu.
- Startup legacy hash trong `main.tsx` phải render login khi session401, không dừng trước React mount. Không để shell query chạy khi chưa có workspace.
- Waiting “Kiểm tra lại” invalidate/refetch session+workspaces; sau khi operator cấp membership hợp lệ, đi vào workspace mà không đổi profile ID hoặc cần tự tạo central account.
- Query giữ server state. Login/logout/session mismatch tăng client generation, cancel inflight requests và clear account cache; response cũ không nhập cache sau đổi phiên. Auth-scoped BroadcastChannel/focus resync thông báo thay đổi phiên giữa tab, không tạo generic global message bus.
- Trước mutation có thể refresh dựa expiry metadata; GET retry tối đa một lần sau refresh. Không tự replay business mutations/uploads sau401/timeout hoặc dưới session mới; giữ draft và current request IDs/Undo semantics.
- Refresh/login503 giữ draft và hiển thị lỗi khả dụng, không chuyển mock. Logout server failure hiển thị retry; không báo đã đăng xuất khi SID còn active.
- Signup/social/reset/verify và account-security chưa có capability thật: HTTP mode hiển thị trạng thái chưa khả dụng hoặc hướng dẫn liên hệ quản trị viên, không mô tả internals API trong product flow. Không nối verify OBO vào verify email.

## 9. Sáu unit triển khai

Mỗi unit chỉ bắt đầu sau prerequisite, tuân thủ root/API AGENTS và standards; cập nhật PROGRESS bằng command/result thật. Read-set chung: kế hoạch này, reference snapshot, current API README, contracts/schema/owners và tests liên quan. Đường dẫn code bên dưới là owner, không yêu cầu tạo mọi file/layer khi chưa cần.

### AUTH-01 Provider và Worker contract

**Prerequisite:** kế hoạch này; quyền tải package. Public key/test account deployment chỉ cần cho live acceptance, local proof dùng fresh RSA test keys.

**Owners:** module auth adapters mới; `apps/api/package.json`, lockfile/bindings; contracts inputs/operations/errors/models. Pin version sau kiểm tarball/exports thực, không mặc định ví dụ0.1.1 là latest. Implement typed login/refresh/whoami envelope decoders, config validation, access verification bridge và standalone schema phiên ICT24H/error codes. Existing getSession schema/consumers giữ coherent cho tới atomic activation AUTH-04. Không đổi business middleware hoặc chạy auth thật trước unit composition.

**Gate:** actual Worker với package thật; valid/invalid RSA, tenant/type/expiry/missing-exp; guard context/401/HTTPException; upload stream/multipart/bytes. Provider fixtures exercise HTTP201/body400, shape khác login/refresh, malformed success, timeout/5xx, bounded response và sanitized logs. Live login/refresh/whoami chỉ PASS khi có evidence đúng deployment; thiếu credential/key là live gate pending, không fake PASS. Resolve refresh semantics conflict trước unit session.

### AUTH-02 Mapping và hồ sơ chờ workspace

**Prerequisite:** AUTH-01 validated identity/profile types và Worker proof.

**Owners:** members public identity/profile use-case; schema/forward migration sau0002; bounded local explicit-link procedure. Auth gọi members public entry, không deep-import readKeys/mapper. Atomic JIT profile+mapping với UUIDv7/complete readKeys; existing IDs/history giữ nguyên; không membership hoặc auto Owner.

**Gate:** native D1 fresh+old-ledger upgrade, rerun; concurrent same identity→một user/mapping; email collision zero orphan/effects; batch SQL failure rollback; explicit-link conflicts; name boundary 240/lone surrogate/truncation pair/read-equivalent validation trước effects; unicode/pinned readKeys sau cấp membership test fixture; bounded budget. Không thay0000…0002, fixture source hoặc historical evidence.

### AUTH-03 Session và login refresh logout

**Prerequisite:** AUTH-01/02 PASS.

**Owners:** auth application/provider/session persistence/crypto/routes; forward authSessions migration; `app.ts` composition/router boundary. Unit này cung cấp reusable session projection từ identity-only profile resolver và public default-workspace query có LIMIT1 của workspaces, nên login/refresh trả đúng workspace hoặcnull ngay; không chờ AUTH-04 hoặc dùng null tạm. Public login route và SID-auth refresh/logout phải được đăng ký trước guard business `/api/v1/*`; không để existing local-principal guard chặn login. SID lookup/decrypt/guard dùng cùng request repository.

**Gate:** login đúng/sai không tạo phiên giả; ciphertext tamper/AAD/nonce; private creds không ra response/log; primary session reads; cookie HTTP-local/HTTPS policy+Origin; refresh identity mismatch; concurrent CAS winner/loser và stale failure không revoke winner; access/refresh/absolute-expired hoặc ciphertext-tampered logout; cookieS2 + expectedS1 không refresh/revoke; late refresh và late login có previous SID sau logout/account switch không resurrect/write cookie; unknown DB acknowledgement và idempotent logout. Auth overhead giữ request limits. D1 session regression dùng actual binding, không fake DB thay proof.

### AUTH-04 Principal độc lập workspace

**Prerequisite:** AUTH-02/03 PASS.

**Owners:** `middleware.ts`, `runtime.ts`, members identity resolver, `/session`, profile route, capabilities; dùng session projection/default query đã có ở AUTH-03. Chuyển canonical session contract cùng mock/local fixtures, HTTP facade và nullable-workspace route consumers; tạo waiting route dùng layout hiện hữu để không có consumer tạm/dummy ID. Trusted local mode được giữ explicit để regression/dev; ICT24H mode không fallback. `authSession` metadata/expected-session header được compose trước business dispatch.

**Gate:** new profile→200session/null +[]workspaces; protected bootstrap không mở; invited/removed/cross-workspace/private view-vs-edit matrix; deterministic default/fallback; active membership cấp bằng fixture native khiến session ready; profile null403 và existing CAS/race SQL; mismatch409 zero business effects; JWT/central role không override D1; auth request budget bao gồm mọi queries.

### AUTH-05 Form và vòng đời phiên trên web

**Prerequisite:** AUTH-03/04 contract ổn định và API gates PASS.

**Owners:** AuthPage/AuthLayout và i18n; wiring HTTP auth client/HTTP adapter theo facade AUTH-04; route-context/root route/main hash startup; hoàn thiện waiting actions; Query generation/account boundary; SearchOverlayHost logout. Giữ layout nguồn và component ownership; không copy screen hoặc thêm auth state store thay Query.

**Gate:** browser real email/password path qua Worker với controlled provider fixture; login errors/503; remember cookie/reload; expired-access startup refresh trước redirect; concurrent requests; logout/back button/tab/account switch; inflight old response/old mutation/session mismatch, stale logout/refresh intent và late login có previous SID; hash401 vẫn render; waiting Retry sau cấp quyền; return URL validation; unsupported flows không success giả; giữ draft/request IDs/upload behavior. Relevant visual checks dùng baseline nguồn đã pin; ghi deliberate copy/disabled-state deltas của auth scope, không tự tạo baseline mới hoặc nới tolerance.

### AUTH-06 Acceptance và runbook

**Prerequisite:** AUTH-01…05 PASS; operator inputs cho live provider smoke.

**Owners:** active API integration/browser suites, current API README/contracts/scope docs, configuration/linking/key rotation/membership runbook và PROGRESS. Không xây admin grant UI/API, callback hoặc thay Identity Service.

**Gate:** full current regression gồm actual D1/R2, native permission race/final SQL zero effects, version/CAS, idempotency/Undo/recurrence/files, local identity mode, plus new auth/browser suites. Live test account: tenant đúng, login/whoami/refresh/access guard, pending profile, controlled membership grant, app logout và subsequent401; không log credentials/token. Docs runbook và source/revision/evidence nhất quán. Nếu live input còn thiếu, ghi `LOCAL_VERIFIED_LIVE_PENDING`, không gọi nghiệm thu live hoàn tất.

## 10. Kiểm chứng và runbook cấp workspace

Commands hiện có; chỉ chạy theo risk của unit sau implementation, không coi checklist là result:

```sh
pnpm --filter @studio/api format:check
pnpm --filter @studio/api typecheck
pnpm --filter @studio/api lint
pnpm --filter @studio/api test:unit
pnpm --filter @studio/api test:integration
pnpm contracts:consumers
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Auth suites/harness mới phải được đăng ký trong active runner/package scripts trước khi có command riêng. Không chạy tên command chưa tồn tại rồi đánh dấu PASS. Gate nội bộ cần giữ final SQL actor/membership/private grants, không chỉ middleware; các request đã qua preflight nhưng membership/grant đổi trước write phải có zero unauthorized effects. Auth extra reads có thể làm command gần limit trả payload limit sớm hơn: đo worst-case budget trong ICT24H mode và giảm truy vấn dư trong auth owner, không tăng bound hoặc tách atomic command thành nhiều commit. Existing local-mode suites không chứng minh auth overhead mới.

Cấp workspace là nghiệp vụ quản trị tin cậy tách khỏi JIT profile. Operator cần chọn local user UUID, workspace có sẵn, role hợp lệ và active membership; ghi membership cùng default memberPreferences/notificationPreferences trong một native batch theo canonical schemas. [Bootstrap](../../apps/api/src/modules/projections/application/bootstrap.ts) yêu cầu cả hai preference documents: chỉ INSERT membership sẽ tạo dữ liệu không đủ. Fixture nghiệm thu có thể cấp đủ rows để chứng minh waiting→ready; không dùng fixture làm public provisioning API, không sửa role tự động từ central user.

Runbook phải có explicit-link trước login cho existing profiles; migrate/backfill preservation; cấu hình/rotation RSA key và encryption key; cách verify cookie/session mà không log SID/token; logout idempotent; bounded operator cleanup expired/revoked session rows nếu cần. Không thêm cron, queue, deployment hoặc CI/CD trong scope này.

## 11. Inputs triển khai và điều kiện bắt đầu

| Input | Trạng thái |
| --- | --- |
| Base URL, tenant và phạm vi sản phẩm | Đã chốt theo yêu cầu Hòa |
| RSA public key đúng deployment + cách nhận key mới | Operator cần cấp trước live verification; không cần private key |
| Quyền đọc package private/installed tarball | Cần cấu hình để AUTH-01 chạy package thật; token URL raw không phải npm credential |
| Test account của tenant, deployment revision/TTL | Cần cho success smoke; cung cấp qua môi trường bảo mật, không đưa vào Git/chat logs |
| Session encryption secret và app origin | Tạo/cấu hình trong unit session; kế hoạch không chứa secret values |
| Existing-user linking inputs | Chỉ cần nếu muốn giữ profile/membership có sẵn cho central principal đó; không tự link email |
| Workspace grant | Quy trình quản trị riêng; profile chờ không được phép vào workspace trước grant |

AUTH-01 là unit code tiếp theo khi được giao triển khai. Public key/package access/live account là prerequisite kiểm chứng, không ngăn hoàn tất tài liệu kế hoạch. Không thực thi AUTH-01…06, provision Identity Service hoặc deploy từ nhiệm vụ lập kế hoạch này.
