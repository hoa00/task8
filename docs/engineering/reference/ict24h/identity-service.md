# Identity Service: thông tin và hợp đồng hiện tại

Tài liệu cung cấp thông tin và bối cảnh cho dự án khác cần hiểu hoặc tích hợp Identity Service.
Phạm vi là API HTTP, RSA public key, các định danh, callback và giới hạn hiện tại; không quy định framework, schema hay cách triển khai của dự án nhận tài liệu.
Dịch vụ chung giữ nguyên POC. Đây là hợp đồng của source snapshot `hoa00/i24h-user-service@429a7df143938ff3f6d82c29db5cf31f0feb1386`, không phải xác nhận deployment đang chạy commit này.
Operator phải cung cấp URL, tenant và credentials thực. URL `example.invalid`, UUID, email và các placeholder dưới đây chỉ để minh họa; không phải dữ liệu vận hành.

## 1. Phân biệt các định danh và token

| Giá trị | Nghĩa hiện tại | Vai trò trong hợp đồng |
| --- | --- | --- |
| `User.id` / JWT `sub` | UUID do Identity Service sinh | Principal ID central; cũng là `id` trong create callback |
| `User.msId` | Microsoft Graph `/me.id` / object ID của user | Provision hoặc tìm user cho Microsoft login |
| Header `i24h-tenant` | Chuỗi tenant nội bộ, tương ứng `User.srv_t` | Chọn phạm vi lookup khi login |
| JWT `tenant` | Chuỗi `srv_t` của user tìm được | Tenant claim của platform token |
| Microsoft `tid` | Entra directory ID | Không mặc nhiên bằng tenant nội bộ |
| Platform access/refresh JWT | Token RS256 do Identity Service phát | Access cho Business API; refresh cho Identity API |
| Graph access token / SSO assertion | Token Microsoft, dùng các endpoint Microsoft/OBO | Không dùng trực tiếp như platform access JWT |

Nguồn: [UUID và srv_t](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/common-base.entity.ts#L31-L37), [User.msId](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.entity.ts#L42-L45), [JWT payload](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/tokens/tokens.service.ts#L142-L153).
Luồng Microsoft hiện tại: Graph object ID → `msId` trong central User → UUID central → JWT `sub` và create callback `id`.

## 2. HTTP và cách đọc response

Origin ví dụ: `https://identity.example.invalid`. Các route dưới đây gồm prefix `/v1`.
Gateway triển khai có thể thêm prefix bên ngoài; base URL thực thuộc cấu hình operator.
Body JSON gửi `Content-Type: application/json`.
Auth request dùng chính xác header `i24h-tenant`; các protected User/SubApp routes lấy tenant từ JWT, không từ header này.
Header login là **tùy chọn trong source**; nếu vắng, lookup email/msId không có bộ lọc tenant.
ValidationPipe bật `transform:true, whitelist:true`: field ngoài DTO có thể bị bỏ.
Bootstrap có CORS origin allowlist; server-to-server HTTP không chịu browser CORS.

Nguồn: [bootstrap](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/main.ts#L9-L37), [auth headers](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.controller.ts#L27-L56), [protected context](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/guards/jwt-auth.guard.ts#L68-L78).

Response chuẩn thành công:
```json
{"statusCode":200,"message":"success","data":{"id":"11111111-1111-4111-8111-111111111111"}}
```
Response chuẩn lỗi do service bắt và trả về:
```json
{"statusCode":400,"message":"error","error":[{"message":"<ERROR_DETAIL>"}]}
```
`metadata` có thể có hoặc vắng; lỗi từ service wrapper không có `data`.
Exception không bị service bắt đi qua global filter:
```json
{"statusCode":400,"message":"<EXCEPTION_MESSAGE>","error":{"message":["<VALIDATION_DETAIL>"]}}
```
Shape bên trong `error` khác nhau theo wrapper, validation hoặc exception.
Nguồn: [sendStdRes](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/standard-response.helper.ts#L45-L70), [exception filter](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/all-exceptions.filter.ts#L28-L56).

HTTP status có thể khác `body.statusCode`; wrapper lỗi có `error` và không có `data`, ngay cả khi HTTP là 2xx.
Auth controller không đặt `@HttpCode`; theo Nest mặc định, POST thường HTTP 201 dù wrapper ghi `statusCode:200` hoặc `400`.
GET/PATCH thường HTTP 200 khi service trả wrapper lỗi. Exception filter đặt HTTP status theo exception.
`POST /v1/user` và `POST /v1/sub-app` dùng `res.status(result.statusCode)`; outside-create dùng POST default.
Đây là suy ra từ controller/framework của snapshot; gateway và transport live chưa được kiểm tra.
Nguồn: [AuthController](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.controller.ts#L27-L67), [UserController.create](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.controller.ts#L34-L41), [SubAppController.create](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.controller.ts#L28-L35).

## 3. Auth routes

Các route auth không yêu cầu platform Bearer token. Chúng nhận credential/token của đúng luồng.

| POST route | Body | Tenant header | `data` thành công |
| --- | --- | --- | --- |
| `/v1/auth/login` | `{email,password}` | `i24h-tenant`, tùy chọn | `{user,tokens}` |
| `/v1/auth/login-ms` | `{msToken}` | Tùy chọn | `{user,tokens}` |
| `/v1/auth/login-ms-obh` | `{token}` | Tùy chọn, có mapping override | `{user,tokens}` |
| `/v1/auth/get-ms-token` | `{token}` | Controller nhận; method không dùng để chọn tenant | Graph access-token string |
| `/v1/auth/refresh-token` | `{refreshToken}` | Không có | `{access,refresh}` |
| `/v1/auth/verify-token-obh` | `{token}` | Không có | **Không wrapper:** raw Microsoft object-ID string |

Nguồn route/field: [AuthController](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.controller.ts#L27-L67).

### 3.1 Local login và Microsoft direct login

Local login: email hợp lệ, password string không rỗng, tối thiểu 6 ký tự theo AuthLoginInput.
Server lookup email (+ `srv_t` nếu có header), so bcrypt password; user phải có sẵn.
```http
POST /v1/auth/login
Content-Type: application/json
i24h-tenant: tenant-example

{"email":"user@example.invalid","password":"<USER_SUPPLIED_PASSWORD>"}
```
Microsoft direct login nhận **Graph access token** có khả năng gọi `GET https://graph.microsoft.com/v1.0/me`.
Server dùng `/me.id` tìm central `User.msId`; user chưa provision không được tự tạo trong login.
```json
{"msToken":"<MICROSOFT_GRAPH_ACCESS_TOKEN>"}
```
Nguồn: [AuthLoginInput](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.dto.ts#L9-L18), [login/msLogin](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L40-L98), [callMsGraphMe](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L307-L327), [lookup](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.service.ts#L238-L256).

Cả local/direct/OBO login trả shape token chung:
```json
{
  "statusCode":200,
  "message":"success",
  "data":{
    "user":{"id":"11111111-1111-4111-8111-111111111111","email":"user@example.invalid","username":"user-example"},
    "tokens":{
      "access":{"token":"<PLATFORM_ACCESS_JWT>","expires":"2030-01-01T00:30:00.000Z"},
      "refresh":{"token":"<PLATFORM_REFRESH_JWT>","expires":"2030-01-15T00:00:00.000Z"}
    }
  }
}
```
Profile trên chỉ minh họa một số field; `data.user` là object, khác JWT claim `user`.
Access token nằm tại `data.tokens.access.token`; snapshot không trả field `data.accessToken`.
`expires` là thời điểm serialize từ Date; `JWT_ACCESS_EXPIRATION_MINUTES`/`JWT_REFRESH_EXPIRATION_DAYS` quyết định TTL; source fallback 30 phút/14 ngày.
Nguồn: [auth result](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L55-L68), [generateTokens](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/tokens/tokens.service.ts#L42-L86).

### 3.2 Microsoft OBO, lấy Graph token và verify OBO

`login-ms-obh` nhận `{token:"<SSO_ACCESS_TOKEN_FOR_CONFIGURED_APP>"}`.
Server decode `aud`, lấy phần cuối nếu là URI, chọn client secret từ `MSAL_APPS[clientId]`, gọi MSAL OBO với authority `https://login.microsoftonline.com/common` và Graph `.default`, sau đó gọi `/me`.
Có một Entra `tid` → tenant nội bộ hardcoded trong method; mapping ấy có thể override header.
Client secret được đọc phía Identity Service, không phải field request. Token sai audience/consent/config có thể không redeem được.
Sau OBO, server vẫn yêu cầu user có central `msId` tương ứng.
Nguồn: [msLoginOnBehalf](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L101-L188).

`get-ms-token` dùng cùng cơ chế chọn MSAL app/OBO; scopes hiện tại là `User.Read, profile, openid, Mail.Send, Sites.ReadWrite.All`.
Method không lookup central user và không trả platform token; `data` là Graph access token.
Prerequisite phía dịch vụ là MSAL app/credential/consent phù hợp; method không triển khai app-only Graph provisioning hoặc directory sync.
Nguồn: [getMsAccessToken](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L192-L257).

`verify-token-obh` dùng OBO Graph `.default` + `/me`, trả raw `msOID` string.
Nó kiểm chứng assertion Microsoft, không chứng minh central user tồn tại, tenant mapping hay local Business App quyền truy cập.
Nguồn: [verifyMsTokenOnBehalf](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L357-L417).
OIDC authorization-code/callback frontend, redirect URI và Teams manifest không được triển khai bởi các controller trên.

### 3.3 Refresh

Request `/v1/auth/refresh-token`: `{"refreshToken":"<PLATFORM_REFRESH_JWT>"}`.
Route yêu cầu JWT verify được và `type:"REFRESH_TOKEN"`; access token không dùng để refresh.
Kết quả khác login: `data.access.token` và `data.refresh.token`, **không** `data.tokens`.
```json
{"statusCode":200,"message":"success","data":{"access":{"token":"<NEW_ACCESS_JWT>","expires":"2030-01-01T00:30:00.000Z"},"refresh":{"token":"<NEW_REFRESH_JWT>","expires":"2030-01-15T00:00:00.000Z"}}}
```
Nguồn: [refreshTokens](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L264-L297).
Refresh hiện dựa trên claims của token cũ; không có session rotation/reuse detection, blacklist hay DB user-state check.
Không có route logout/reset-password/register hoạt động trong AuthController; tên method hoặc comment không phải API contract.

## 4. JWT và guard hiện tại

Operator cấp **RSA public key PEM đúng với issuer triển khai**. Identity đọc signing/verifying key từ `keys/private.key` và `keys/public.key` tương đối vị trí module runtime.
Public key dùng để verify; private key dùng để sign phía dịch vụ. Snapshot không có JWKS endpoint hoặc OIDC discovery route.
Nguồn: [key loading](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/tokens/tokens.service.ts#L24-L38), [guard key](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/guards/jwt-auth.guard.ts#L23-L29).

Payload access minh họa:
```json
{
  "sub":"11111111-1111-4111-8111-111111111111",
  "tenant":"tenant-example",
  "iat":1893456000,
  "exp":1893457800,
  "type":"ACCESS_TOKEN",
  "user":"{\"id\":\"11111111-1111-4111-8111-111111111111\",\"email\":\"user@example.invalid\",\"username\":\"user-example\",\"msId\":\"22222222-2222-4222-8222-222222222222\"}"
}
```
Nguồn: [type enum](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/tokens/tokens.enum.ts#L7-L10), [generateToken](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/tokens/tokens.service.ts#L129-L153).

Protected User/SubApp routes nhận `Authorization: Bearer <PLATFORM_ACCESS_JWT>`.
JwtAuthGuard verify bằng public key, chỉ chấp nhận algorithm **RS256**, yêu cầu `sub` string và `type:"ACCESS_TOKEN"`; REFRESH_TOKEN không được guard này chấp nhận.
Thư viện verify kiểm expiration của token. Guard đặt `req.userId=sub`, `req.tenantId=tenant`; UserInfo đọc hai giá trị này.
`tenant` lấy từ `User.srv_t`, có thể null/vắng khi dữ liệu central thiếu tenant.
Local/direct Microsoft login truyền profile vào token; **OBO login không truyền user khi sign nên claim `user` có thể vắng**.
Login/verify token không truy vấn trạng thái tài khoản trong hệ thống nhận callback.
Nguồn guard tương ứng: [JwtAuthGuard](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/guards/jwt-auth.guard.ts#L51-L78), [UserInfo](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/guards/user-info.decorator.ts#L9-L18), [OBO token call](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L176-L179).

JWT không phát `iss,aud,kid,jti,roles`; snapshot chưa có issuer/audience/JWKS contract.
Claim profile chỉ gồm `authorId,createdAt,email,fullname,id,msId,updatedAt,username` khi hiện diện.
Role của central User không nằm trong JWT; các API trên không mô tả quyền nghiệp vụ của hệ thống khác.
`data.user` ở response auth có serializer loại các field như password/role/srv_t; tenant hiện diện trong JWT thay vì profile ấy.
Nguồn: [User fields](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.entity.ts#L26-L44), [hidden base fields](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/common-base.entity.ts#L31-L49), [claims](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/tokens/tokens.service.ts#L129-L153).

## 5. Profile, list và provision user

| Route | Auth/request | Phạm vi hiện tại |
| --- | --- | --- |
| `GET /v1/user/whoami` | Platform access Bearer | Lookup `id=sub AND srv_t=tenant`; wrapper User hoặc exception 404 |
| `GET /v1/user` | Platform access Bearer; list query bên dưới | Lọc `srv_t=tenant` từ token; wrapper User[] |
| `GET /v1/user/:id` | Platform access Bearer | Lookup chỉ theo UUID, không tự áp tenant; not found có thể `data:null` |
| `POST /v1/user/other-service` | JSON `{tenantId,secret}`; không Bearer | Match SubApp tenant+secret, rồi list User[] của tenant |
| `POST /v1/user/other-service/create` | CreateUserForOutsideDto bên dưới; không Bearer | Tạo central User, rồi callback tạo app user |
| `POST /v1/user/other-service-create` | Alias cùng route create | Cùng behavior |

Nguồn: [UserController](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.controller.ts#L69-L108), [findOne/outside list](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.service.ts#L137-L174), [getMyInfo](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.service.ts#L225-L234), [outside routes](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user-for-outside.controller.ts#L22-L58).
`secret` cho outside-list là **chuỗi stored SubApp.secret**, không thêm `Basic ` trong body.
Source outside-create khai báo field secret theo DTO nhưng destructure rồi bỏ qua việc kiểm chứng; route này không có guard Bearer hoặc secret check.
Nguồn: [secret comparison](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L118-L121), [create forwarding](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user-for-outside.controller.ts#L51-L58).

List query: `query` tìm fullname/email; `ids` là UUID comma-separated; `paging-limit`, `paging-cur`, `paging-dir=next|prev`.
Limit default 100, chấp nhận số dương <=1000 trong paging helper. Cursor là chuỗi lz-string encoded ID+createdAt, không phải raw UUID.
Metadata có `paging.limit` và có thể `paging.cursor`. Hiện controller truyền cursor nested nhưng attachMetadata đọc field flat, nên không đảm bảo nhãn next/prev/current phản ánh request.
Snapshot không bảo đảm metadata cursor phản ánh đầy đủ hướng/current request.
Nguồn: [query mapping](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user-for-outside.controller.ts#L22-L48), [paging query](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/paging-cursor.utils.ts#L34-L90), [cursor metadata](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/common/paging-cursor.utils.ts#L93-L125).

Body provision minh họa:
```json
{
  "tenantId":"tenant-example",
  "secret":"<SUB_APP_SECRET_BASE64>",
  "email":"user@example.invalid",
  "username":"user-example",
  "password":"<USER_SUPPLIED_PASSWORD_MIN_8>",
  "fullname":"Example User",
  "msId":"22222222-2222-4222-8222-222222222222",
  "role":"USER"
}
```
Email hợp lệ; username string tối thiểu 3; password string tối thiểu 8; fullname tùy chọn; msId tùy chọn UUID; role tùy chọn USER/ADMIN.
Source TypeScript DTO khai báo email/username/password/tenantId/secret; các request mẫu cung cấp đầy đủ các field ấy.
`id`, `srv_t`, `isDeleted`, `isActive` không thuộc create DTO; MS object ID thuộc field `msId`, UUID central được server sinh.
Response thành công wrapper `statusCode:201,data:centralUser`. Password được hash; UUID do central tự sinh.
Create có synchronous duplicate-check callback trước save, rồi create callback **không await** sau save.
Nếu Business App check endpoint lỗi, central create có thể fail; create response thành công cũng không chứng minh callback insert đã hoàn tất.
Nguồn: [User DTOs](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.dto.ts#L17-L63), [create](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.service.ts#L37-L69).

### 5.1 Dữ liệu user đã tồn tại và thiếu replay

Đăng ký/cập nhật SubApp chỉ lưu cấu hình; không replay user cũ. Login cũng không gọi create callback.
Route outside-list cung cấp các central users hiện có trong tenant:

```http
POST /v1/user/other-service?paging-limit=100
Content-Type: application/json

{"tenantId":"tenant-example","secret":"<SUB_APP_SECRET_BASE64>"}
```

Response là wrapper `data:User[]` với `User.id` central. Outside-create là yêu cầu tạo mới, không phải replay callback cho user cũ.
Nguồn: [SubAppService.create](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L37-L46), [getListByOutside](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.service.ts#L152-L221), [login](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L40-L98).

Ordinary `POST /v1/user` dùng CreateUserDto, authorId/tenant từ access token; `PATCH /v1/user/:id` dùng UpdateUserDto; `DELETE /v1/user/:id` xóa theo UUID.
Controller chỉ dùng JWT guard, không có role guard; PATCH/DELETE không nhận tenant vào service.
Đây là phạm vi thực tế của snapshot; có JWT hợp lệ không đồng nghĩa server kiểm role admin cho các mutations này.
Nguồn: [create auth](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.controller.ts#L24-L41), [mutations](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.controller.ts#L95-L108), [mutation implementation](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.service.ts#L259-L307).

## 6. SubApp: cấu hình callback phía dịch vụ

Operator dùng platform access Bearer cho `/v1/sub-app`:

| Method/route | Input/kết quả |
| --- | --- |
| `POST /v1/sub-app` | tenant string min1; endpointURL/secret optional string; isActive/isDeleted optional boolean; wrapper SubApp, HTTP 201 |
| `GET /v1/sub-app` | List theo tenant token, có paging; search query tham chiếu name/email không được khai báo trong SubApp entity |
| `GET /v1/sub-app/:id` | Wrapper SubApp lookup theo UUID |
| `PATCH /v1/sub-app/:id` | endpointURL, secret, isActive, isDeleted tùy chọn |
| `DELETE /v1/sub-app/:id` | Xóa row, wrapper affected count |

Nguồn: [SubApp routes](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.controller.ts#L22-L71), [SubApp DTO](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.dto.ts#L3-L24), [SubApp operations](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L37-L147).
`tenant` unique: source chỉ hỗ trợ **một SubApp callback endpoint cho mỗi tenant**.
Không có fanout cùng tenant sang hai endpoints. PATCH endpointURL thay mapping duy nhất ấy; source không tự migrate/replay dữ liệu sang endpoint mới.
`isActive/isDeleted` được lưu nhưng callback/secret lookup không lọc chúng; flags chưa bảo đảm pause/revoke.
Nguồn: [SubApp schema](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.entity.ts#L26-L45), [permission lookup](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L118-L121), [check lookup](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L155-L156), [create lookup](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L234-L239).

`endpointURL` là API base của hệ thống nhận callback, bao gồm prefix/version của endpoint ấy.
Ví dụ `https://business.example.invalid/api` tạo target:

- `https://business.example.invalid/api/user/other-services/check-not-exiting`
- `https://business.example.invalid/api/user/other-services/create`

Producer nối suffix nguyên văn, không tự thêm `/v1`, không normalize slash; slash cuối endpointURL sẽ tạo hai slash ở điểm nối.
Theo convention của SubApp, `secret` là chuỗi đã base64-encode `"<SERVICE_USERNAME>:<SERVICE_PASSWORD>"`, không gồm tiền tố Basic. Producer không encode thêm lần nữa.
Header gửi đi **chính xác** `Authorization: Basic <STORED_SUB_APP_SECRET>`.
Responses SubApp trả entity cấu hình và có thể chứa secret; chúng không phải public user-profile response.
Nguồn: [secret format](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.entity.ts#L30-L35), [check URL/auth](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L158-L164), [create URL/auth](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L242-L260).

## 7. Callback gửi từ Identity Service

### 7.1 Check trùng

`POST {endpointURL}/user/other-services/check-not-exiting`, Basic credential như trên:
```json
{"username":"user-example","email":"user@example.invalid"}
```
Trả HTTP 2xx, JSON boolean:

- `true`: receiver báo đã tồn tại → central không tạo.
- `false`: receiver báo chưa tồn tại → central tiếp tục.
Producer cũng hiểu `{"data":false}`.
Tên route dễ gây nhầm: trả giá trị **exists**, không phải canCreate.
String `"false"` hoặc wrapper chỉ `{"success":true}` bị producer ép truthy thành exists. Tiêu chí xác định trùng nằm phía receiver.
Nguồn producer: [checkNotExitingOnSubApp](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L150-L201).

### 7.2 Create

`POST {endpointURL}/user/other-services/create`, Basic credential:
```json
{"username":"user-example","email":"user@example.invalid","fullname":"Example User","id":"11111111-1111-4111-8111-111111111111"}
```
`id` là central UUID; `fullname` có thể null/vắng. Payload không có msId, tenantId, role, active state hay eventId.
Thông tin routing nằm trong SubApp record và header credential, không có tenant field riêng trong body.
Producer chấp nhận response HTTP 2xx có body truthy, ví dụ HTTP 200 + text `OK`.
Axios reject non-2xx; body falsy ở response 2xx gây lỗi. Text `NOT OK` là truthy và vẫn vượt qua phép kiểm `if (!response.data)`.
Producer không kiểm ack JSON schema hoặc kiểm chứng receiver đã ghi dữ liệu.
Nguồn: [onUserCreated](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L234-L276). Receiver cũ minh họa lỗi string: [createByOtherSrv](https://github.com/hoa00/investor-project-management/blob/de1d891bb35775fcfd7cc74c2d204cbe32915120/src/modules/user/user.service.ts#L54-L64).

Central không có retry/outbox/provisioning-readiness contract hoặc idempotency key cho outside-create.
Sau timeout, central User có thể đã được save dù callback chưa hoàn tất; response create không xác nhận trạng thái dữ liệu phía receiver.

### 7.3 Update, delete và revoke hiện tại

Enum có CREATE/UPDATE/DELETE; UserService có dispatch UPDATE/DELETE, nhưng SubAppService chỉ CREATE có implementation.
Snapshot không phát producer request cho update/delete.
POC business cũ có `POST /user/other-services/update/:id`, nhưng existence của receiver không chứng minh central sẽ gọi.
Xóa central user không đồng nghĩa xóa projection hoặc thu hồi JWT đã phát; refresh không kiểm user còn tồn tại.
Nguồn: [dispatch switch](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/sub-app/sub-app.service.ts#L300-L313), [user dispatch](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/user/user.service.ts#L280-L307), [refresh behavior](https://github.com/hoa00/i24h-user-service/blob/429a7df143938ff3f6d82c29db5cf31f0feb1386/src/modules/auth/auth.service.ts#L264-L297).

## 8. Inputs cần lấy từ operator

- Identity API origin/base prefix và revision deployment tương ứng snapshot; browser origin được CORS chấp nhận nếu login từ browser.
- Tenant nội bộ cho `i24h-tenant` và provision body; OBO tid mapping có override hay không; tenant mà JWT thực tế phát ra.
- RSA public key PEM đúng deployment, cách nhận key mới khi operator rotation; TTL cấu hình access/refresh.
- Luồng đăng nhập được dùng: local, Graph direct hay SSO/OBO; frontend/MSAL client app, audience/scope/redirect/consent tương ứng. MSAL secret thuộc Identity Service.
- Full outside-create URL/alias và outside-list credential; tài liệu không chứa credential values.
- SubApp record của tenant, callback API base prefix, Basic service username/password và stored base64; xác nhận một endpoint/tenant không xung đột mapping hiện hữu.
- Cách bootstrap central user có msId và người vận hành cấp quyền provision; source không có public register hoặc hoạt động internal tenant bootstrap đầy đủ.
- Hành vi deployment có bổ sung đồng bộ sửa/xóa/revoke hoặc replay ngoài source snapshot hay không.

Tài liệu không khẳng định credentials/consent/key/deployment đang hợp lệ và không cung cấp bí mật vận hành.
