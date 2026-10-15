# Chuẩn bắt buộc cho frontend và package dùng chung

Ngày ban hành: **15/10/2026**. Áp dụng cho `apps/web`, `packages/ui`, `packages/contracts`, `packages/domain` và test/tooling phục vụ các phần này, cả sau POC. Không thay thế [BACKEND_STANDARDS](BACKEND_STANDARDS.md) và không mở rộng nhiệm vụ hiện tại vào `apps/api`.

**POC chỉ giới hạn phạm vi tính năng. Code phải có chủ sở hữu rõ, kiểm chứng được và có thể mở rộng mà không phải viết lại màn hình.** Có thư mục `features` hoặc build thành công chưa đủ chứng minh điều đó.

Đọc cùng [kế hoạch điều chỉnh](FRONTEND_REFACTOR_PLAN.md), [kiến trúc](../poc/ARCHITECTURE.md), [quy tắc i18n](../poc/I18N.md) và [AGENTS](../../AGENTS.md). Chuẩn này mô tả quy tắc đích; bảng phase trong kế hoạch và PROGRESS mới xác nhận phần nào đã được thực thi. Nợ cũ không cho phép code mới lặp lại cùng vấn đề.

## 1. Phạm vi một thay đổi

Trước khi sửa, xác định intent người dùng, owner của dữ liệu/quy tắc, consumer bị ảnh hưởng và regression cần chạy. Tìm primitive, component, hook, domain helper và operation đang có trước khi thêm cái mới. Không mở rộng refactor toàn repo trong một bug fix.

- Tính năng mới và phần code được sửa phải theo chuẩn ngay. Nếu cần seam chuyển tiếp, ghi đúng path/symbol, lý do, phase gỡ và test bảo vệ; không miễn cả thư mục khỏi quy tắc.
- Yêu cầu lập kế hoạch/lưu chỉ dẫn có deliverable là tài liệu. Không tự chạy các phase refactor runtime từ việc ban hành chuẩn.
- Giữ stack React SPA/TypeScript/Vite/TanStack Router/Query/Tailwind/pnpm/Turborepo. Không tự thêm framework state, form, UI, DI, event bus, SSR, CI/CD hoặc dịch vụ mới để xử lý một nhu cầu cục bộ.
- Không dùng “best practice” để đổi thiết kế nguồn, operation semantics hoặc xóa hành vi khó kiểm thử. Thay đổi contract phải được ghi rõ, cập nhật schema/consumers và có regression trong cùng phạm vi được giao.

## 2. Ownership và chiều phụ thuộc

| Owner | Trách nhiệm | Không được làm |
| --- | --- | --- |
| `app` | Bootstrap, providers, router, session lifecycle, chọn adapter | Chứa nghiệp vụ mutation của mọi feature |
| `app/shell` | Điều hướng, layout, slot overlay và transient state của workspace | Thành registry xử lý CRUD hoặc chứa DTO cache riêng |
| `routes` | Parse/normalize URL, loading/error của route, ghép feature controller | Fetch trực tiếp, mutation/business filtering inline, clone view |
| Feature controller/query hook | Scope, query, command, pending/error/draft lifecycle | Tạo một nguồn server state thứ hai |
| Feature view/composite | Render model và phát typed intent/callback | Đọc `window.location`, fetch, storage, auth hoặc tự chọn workspace |
| `data` | Typed client, HTTP/mock adapter, query key, invalidation, transport/error | Render DOM, import UI/router hoặc sở hữu form draft |
| Mock | Dataset, persistence, deterministic fixtures, operation handlers đúng contract | Được bundle vào HTTP app, fallback khi HTTP lỗi |
| `packages/ui` | Tokens, icons, primitive hành vi/hiển thị, controlled props | Import app, business DTO, router/query/i18next hoặc storage của web |
| `packages/contracts` | Schemas, inferred DTO, operation/error semantics | Import React/Router/Query/Hono/Drizzle hoặc suy DTO từ DB tables |
| `packages/domain` | Quy tắc thuần cần dùng chung: date/filter/order/group/projection/sanitization | DOM/React/storage/network, ambient clock ngầm hoặc app import |

Một module có thể chỉ cần vài file; không bắt buộc sinh đủ `application/domain/infrastructure` cho mọi feature. Tách theo trách nhiệm thực và lý do thay đổi, không theo số dòng hoặc mỗi JSX fragment một file.

Feature khác chỉ dùng public surface đã công bố: controlled composite, named model/intent, hook hoặc helper có consumer thật. Không deep-import implementation của feature khác. `app` được compose các feature. Cross-feature import phải có hướng rõ và không cycle; không dùng barrel `export *` để che cycle. Đối với code cũ, đưa vi phạm vào allowlist chính xác có phase gỡ trước khi bật gate, không giả vờ gate đã bao phủ.

Ví dụ cấu trúc cho feature đủ lớn, không phải scaffold bắt buộc:

```text
features/tasks/
  index.ts                 # chỉ public API cần consumer ngoài
  TaskListPages.tsx         # composition/controller mỏng
  useTaskListCommands.ts   # typed intent + lifecycle
  loadTaskViewDataset.ts   # complete dataset semantics
  list/                   # controlled presentation
  board/
  detail/
```

List/Board/Table/MiniRow là presentation khác nhau; dùng chung field/editor/intent/domain semantics. Không gom thành component nhiều boolean hoặc copy nguyên row/controller cho từng page.

## 3. State và URL

| Loại state | Owner và quy tắc |
| --- | --- |
| Server DTO, summaries, permission, session/profile | API; Query là cache tại web; không copy sang Context/Zustand/localStorage |
| Workspace/project/entity ID và view/filter/search được chia sẻ qua link | Router; parse/validate/normalize tại route/adapter URL |
| Form draft, selection, drag, dialog/menu | Local controller, gắn workspace/entity và generation phù hợp |
| Preference | API/cache theo thiết kế hiện hữu; local cache có namespace và migration rõ |
| Giá trị suy ra | Pure selector/model; không persist lại nếu có thể tính từ nguồn hiện hành |

- Production route truyền `controlledView` hoặc model URL đã normalize cho view. `useState(initialView)` chỉ dành cho harness/uncontrolled component có contract rõ; không coi initializer là cơ chế đồng bộ Back/Forward hoặc same-route navigation.
- Không dùng global `location`, `window.location`, `window.history` hoặc parse URL trong reusable view. Giữ URL adapter cho harness riêng nếu cần; web app chỉ điều hướng qua Router/canonical builders. DOM measurement và pointer/resize/scroll effects vẫn được phép trong view cần geometry, có owner/ref/cleanup rõ.
- Search param sai phải về default hoặc validation state đã định nghĩa; đổi filter chưa Save không PATCH saved view ngầm.
- Khi đổi workspace: cancel request cũ theo scope, reset hoặc remount transient owner; form defaults, edit/menu target, anchor, selection và pending UI đều phải gắn scope. Không chỉ key lại child trong khi parent tiếp tục truyền intent cũ.
- Late response có thể invalidate cache của scope gốc nhưng không được mở/đóng overlay, xóa draft hay ghi UI ở scope mới. Capture intent gồm scope/entity/revision/session generation khi bắt đầu; kiểm tra trước effects liên quan UI.
- Task/file deep link phải giữ reload, Back/Forward, Close và originating state theo contract. Không gọi `history.back()` mù với URL nhập trực tiếp.

## 4. Query, command và cache

- Feature gọi `StudioClient`/hook chuẩn; không tự fetch endpoint hoặc bỏ request/response schema. Adapter chọn một lần tại bootstrap; capability chưa có phải báo đúng trạng thái, không success giả.
- Mỗi key chứa scope thực tế và toàn bộ input ảnh hưởng kết quả, qua một key owner: workspace cho workspace-scoped reads; session/profile/workspace catalogue theo principal/session lifecycle, không thêm workspace giả. Giữ generation/clear-cache guards khi đổi tài khoản. Chuẩn hóa cùng cách cho fetch/prefetch/cancel/invalidate; không để nhiều tên resource khác nhau vô tình cùng đại diện một read.
- Mỗi mutation phải khai báo các projection bị ảnh hưởng: entity/detail, list/view, summary, bootstrap, search, archive, files/comments và notification list/count khi lifecycle/access thay đổi. Fallback invalidate toàn workspace không thay cho mapping có chủ đích và coverage assertion khi thêm operation.
- Dùng discriminated read/write operation types hoặc kiểm tra coverage từ manifest để phát hiện thiếu mapping. Không ép một mega generic abstraction nếu manifest + typed map đã đáp ứng.
- Controller sở hữu pending/error và recoverable draft. Không bắt lỗi rồi chỉ trả `false`/`null` mà caller không thể biết error/pending/retry policy; chuẩn hóa outcome khi các caller thực sự cần phân biệt.
- Mutation có `expectedVersion`, idempotency hoặc Undo phải giữ nguyên semantics. Không retry mù command có kết quả không rõ; không chunk một bulk atomic thành nhiều commits để lách limit.
- Optimistic update chỉ khi có lợi ích UX và rollback đúng entity/version; không bắt buộc thêm optimistic state vào mọi command.
- Read phân trang phải nêu rõ page hay complete dataset. Board/Table/Calendar/Timeline và phép tính tổng không được coi page đầu là toàn bộ tập. Giữ loader có cursor-progress/coverage guards; khi chưa complete, không cho thao tác đòi exact set hoặc hiển thị tổng giả.
- Tránh invalidation/refetch toàn workspace nếu đã xác định được projection. Trước khi tối ưu thêm memoization/virtualization, đo dữ liệu, render hoặc bundle thực; không đổi UX chỉ để giảm số query.

## 5. Mock và logic dùng chung

Mock là một adapter được duy trì, không phải mã tạm bỏ sau demo. Nó phải cùng DTO, validation, permission/lifecycle/version/null/PATCH semantics và giới hạn command với contract; dữ liệu lưu phải có namespace/version/migration, không reset người dùng để làm test pass.

- Mọi write vào cùng aggregate đi qua một transaction owner/queue hoặc cơ chế commit có conflict guard tương đương. Không vừa stage cả dataset vừa ghi trực tiếp vào bản live ở operation khác; phải chứng minh không lost update.
- Tách task, subtask, comment, file, notification, project, team, preference và Undo theo chủ sở hữu. Transaction coordinator ghép các handler cần atomicity, không để các module import utility từ “task-fields” đa nghiệp vụ.
- Helper cursor/fingerprint/error/id/access/mapper có owner theo trách nhiệm. Cursor cần codec UTF-8/base64url, validate shape và scope/query fingerprint; không `btoa(JSON.stringify(...))` trên text Unicode. Không đặt browser API vào domain nếu không có môi trường tương thích rõ.
- Domain chỉ nhận dữ liệu và clock/input rõ; chia sẻ semantic logic cần giống nhau, không cố dùng chung toàn bộ mock/server persistence implementation. Không tạo bản sao quy tắc completion/order/date riêng trong UI.
- Undo chỉ giữ inverse hữu hạn và post-version guards theo contract; snapshot staging để commit không phải payload Undo. Refactor không được đổi sang restore toàn dataset.
- Client adapter phải giữ auth/session generation và cancellation đã có; không làm mất `captureIntent`, `assertIntent` hoặc expected-session semantics khi chuyển file/đổi hook.
- Thay đổi shared contracts/domain có thể có backend consumer. Đọc chuẩn backend khi thực sự sửa các phần đó; nếu cần sửa `apps/api` ngoài nhiệm vụ thì ghi dependency và tách scope, không sửa lén.

## 6. React, TypeScript và khả năng đọc

- Giữ `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `import type`; exported props/models có tên và discriminator khi có nhiều mode. Không phát tán `any`, `@ts-ignore`, non-null assertions hoặc cast để bỏ validation.
- Cast tại boundary phải có invariant và lý do cụ thể, input/output runtime validation khi có dữ liệu bên ngoài. Cast tương quan generic đã được schema bảo vệ không tự động là lỗi cần “xóa cho sạch”.
- Mỗi effect có mục đích đồng bộ external system rõ; cleanup listener/observer/timer/request. Không dùng effect để mirror query/URL state hoặc đổi derived data sang state.
- Custom hook theo intent/domain cụ thể, không thành “useEverything”. Reuse cùng command/dataset/presentation policy, nhưng giữ page layout và state riêng khi behavior khác nhau.
- Code phải đọc được trong review: format nhất quán, không nén cả switch nghiệp vụ/controller/JSX nhiều tầng vào một dòng. Tách handler, mapper hoặc view model khi chúng có lý do thay đổi độc lập. Formatter hỗ trợ review, không chứng minh kiến trúc đúng.
- Không đổi logic trong commit format-only; structural moves và behavior fixes có diff/test phân biệt được. Không tăng số file hoặc đặt ngưỡng LOC làm tiêu chí nghiệm thu độc lập.

## 7. UI, accessibility và style

- Dùng primitive đã có trước khi tạo button/dialog/menu/field mới; xác định primitive generic ở UI và business composite ở feature. Không đưa Task/Project DTO vào UI để tiện reuse.
- Form fields thông thường là controlled theo owner. Native file input, contentEditable/editor DOM boundary hoặc uncontrolled primitive chỉ dùng khi có contract/ref và cơ chế đồng bộ/reset rõ; không ép `value` để chọn file. `Field` phải nối label/control/error/hint bằng ID và `aria-describedby`. Form không được dùng API children khiến caller vô tình bỏ các props này; ưu tiên render-prop/context có type rõ, migrate consumers có kiểm chứng.
- RadioGroup/Tabs có keyboard behavior đầy đủ cho widget: một tab stop phù hợp, Arrow keys, Home/End khi áp dụng, Space/Enter, disabled state và name/checked/selected semantics. Chỉ thêm `role` không đủ.
- Dialog/popover dùng một overlay lifecycle owner: initial focus, Tab/Shift+Tab, Escape/stack, restore focus khi opener mất, hidden/inert/disabled và `tabIndex=-1`. Tabbable query phải loại controls không nằm trong Tab order ở mọi selector branch.
- Giữ ref/focus/draft khi API lỗi. Mọi nút chỉ icon có accessible name được dịch. Pointer, keyboard và reduced-motion đều là hành vi cần kiểm chứng ở phần bị sửa.
- Tailwind dùng literal classes và token hiện hữu; không copy CSS nguồn toàn app, không thêm theme UI library thay thiết kế. CSS ngoại lệ/geometry động có owner và giải thích; không đổi token/breakpoint nguồn để khớp preset.
- Rich text chỉ đi qua canonical parse-tree sanitizer/allowlist và boundary editor hiện hữu. Không render page bằng `dangerouslySetInnerHTML`, không dùng regex làm sanitizer, không thêm editor platform chỉ để refactor file.

## 8. i18n

Giữ mặc định `vi`, lựa chọn `vi|en`, catalog key/phân số/interpolation theo [I18N](../poc/I18N.md). Không đổi sang hệ key mới hoặc thư viện khác trong refactor này.

- Một label/message có một translation owner. Feature dịch business label rồi truyền text/ReactNode; primitive render nguyên giá trị đã nhận. UI context chỉ dịch các nhãn nội bộ như Close/Dismiss/Show password.
- Không đoán mọi string trong children/label/toast là translation key. Nếu toast cần tự đổi khi language thay đổi, dùng descriptor có key/params typed và dịch tại owner; nếu chủ đích giữ text tại thời điểm sự kiện thì ghi rõ contract.
- Dynamic keys phải từ catalog/union/mapping hữu hạn và có coverage; regex tìm `t('literal')` không chứng minh coverage cho dynamic key. Mỗi nhãn mới cập nhật cả hai catalog, dùng interpolation/plural cho biến và số.
- Không dịch dữ liệu người dùng. Format ngày/số theo locale và preference đã chuẩn hóa; date-only khác UTC instant, không ambient `new Date()` làm thay đổi fixture.
- UI package không import i18next hoặc web; translator context tiếp tục là adapter generic cho nhãn nội bộ. Không thêm `useTranslation()` chỉ để ép rerender một cây global translation có ownership mơ hồ.

## 9. Kiểm chứng và evidence

Mỗi change chọn gate theo failure mode, không viết test mirror implementation hoặc chỉ kiểm file tồn tại. Bug fix cần regression thất bại với trigger cũ rồi đạt sau sửa; pure refactor phải giữ tests/behavior hiện hành.

| Phạm vi sửa | Bằng chứng tối thiểu |
| --- | --- |
| Docs/chỉ dẫn | Links nội bộ hợp lệ, không mâu thuẫn trạng thái, diff đúng scope, không tuyên bố runtime pass |
| Domain/contract | Pure semantics + schema cases/consumer types cho phần sửa; giữ null/omission/date/order/lifecycle |
| Query/mock/cache | Operation behavior, pagination Unicode, interleaving/concurrency, cancellation và affected projection assertions theo phần sửa |
| URL/scope/controller | Browser test same-route view change, Back/Forward/reload, workspace/account switch và late response/draft theo risk |
| Primitive/form/overlay | Keyboard/focus/label/error relations/disabled state + consumer regression và ảnh phạm vi bị đổi |
| Style/component UI | Source/target/diff trên môi trường hỗ trợ, English theo baseline; kiểm thêm Vietnamese/overflow nếu text/layout ảnh hưởng |
| Tooling/gate | Negative fixture, failure propagation, filter/skip command selection, unique output/cleanup; chạy gate thật, không chỉ đọc script |

Chạy typecheck/lint/build phù hợp scope và HTTP bundle isolation khi thay dependency graph/adapter/bootstrap. Root command có thể chạm backend; khi nhiệm vụ loại `apps/api`, dùng command scoped trong [kế hoạch](FRONTEND_REFACTOR_PLAN.md), ghi phần chưa chạy. Không gọi root test/build rồi tuyên bố đã giữ ngoại lệ scope.

- Active regression phải có owner/entry command và danh sách scope rõ; không phụ thuộc trí nhớ WU. Runner lọc theo command/scenario ID, không splice theo vị trí; skip phải được report, không quy thành PASS đầy đủ.
- Output thường nhật ở `test-results/<run-id>` với unique destination; ghi HEAD, dirty scope, toolchain, command, exit, scenarios/skips và artifact paths. Không chép cả source tree vào docs để chứng minh một lần test.
- Không ghi đè `docs/poc/evidence/WU-*`, source-lock, baseline/golden hoặc report lịch sử khi chạy active tests. Reproduce lịch sử dùng checkout/worktree riêng và runner phù hợp; nếu cần evidence mới lâu dài, dùng thư mục engineering thuộc phase/run mới.
- Build/typecheck không thay visual/interaction evidence. Không đổi tolerance/mask, tạo baseline từ target hoặc đánh dấu hết khoản nợ visual cũ sau refactor cấu trúc.
- `NOT_RUN` do môi trường thiếu dependency hoặc lệch toolchain khác với `FAILED` do code. Ghi command/lỗi thật và bước cần làm; không bịa PASS, số test, browser evidence, commit hoặc push.

## 10. Checklist bắt buộc cho AI coder

Trước khi sửa:

1. Đọc AGENTS, chuẩn này, PROGRESS và đúng task/phase/read-set; kiểm tra code/branch/dirty files hiện hành.
2. Nêu owner, public surface/consumer, state source, typed intent và gate phù hợp. Nếu có seam tạm, ghi phase gỡ.
3. Xác nhận prerequisites bằng evidence hiện tại; đưa kế hoạch 3–7 bước rồi triển khai đúng phần được giao.

Trước khi kết thúc:

1. Kiểm tra không thêm cycle/deep import/duplicate source of truth; không hạ validation/contract/visual gate.
2. Chạy verification phù hợp và sửa lỗi do thay đổi; phân biệt existing failure/môi trường/skip.
3. Cập nhật docs liên quan và entry PROGRESS riêng: scope, quyết định, command/exit, artifact, blockers và bước tiếp theo. Không rewrite ledger WU cũ.
4. Báo kết quả đã làm, phần chưa làm, verification và Git thực tế theo AGENTS. Không đánh dấu phase DONE từ việc mới tạo thư mục, format code hoặc viết kế hoạch.
