# Studio contracts

`src/index.ts` is the shared entry for web, canonical mock and Worker consumers. Zod schemas own DTO/request/query/envelope types; `StudioApi` derives every operation input and result from `operations`. The manifest declares contracts, not running endpoints. `API_CONTRACT.md` remains the canonical method/path inventory; `pnpm contracts:coverage` compares its endpoint tables independently.

Dates are branded real Gregorian date-only strings; instants require UTC `Z`. New/seed entity IDs are UUIDv7. `assigneeId`/`leadId` reference workspace memberships, which differ from user profile IDs. Adapters/services must verify workspace and relationship scope; shape validation alone cannot prove membership or access. Catalog label/template IDs are stable closed identifiers, not entity UUIDs.

PATCH omission preserves a value; `null` clears a nullable value. Explicit `undefined` alone is an empty mutation and is rejected. Unknown mutable fields and server-owned identity/version/key/position fields are rejected. Arrays replace their full relation set. Dates supplied together require start <= due; a service must check a single-date PATCH against the retained counterpart.

Operation requests contain path parameters plus typed `body`/`query` when present. Query schemas validate decoded values; HTTP adapters decode URLSearchParams, including validated JSON filters. Cursor encoding/fingerprint matching belongs to adapters. Full-view datasets must dedupe and exhaust all pages before declaring complete; totals always describe the full authorized scope.

Success responses use `{data}` except the normalized binary content result. Upload uses `file:{name,mimeType,bytes}`, `clientRequestId`, optional `taskId`; adapters map this to one-file multipart. Content adapters map `{bytes,contentType,disposition,name}` to an authorized stream. Metadata never exposes object keys. HTML is bounded here; restricted HTML sanitation and relational/atomic command checks belong to their designated backend work units.

External authentication, account security, billing, invitation delivery, sharing and provisioning capabilities accept only `demoOnly|unavailable`. A live service cannot claim these implemented. Mock/HTTP adapters never silently fall back on error.

`source-identities.ts` is generated from the immutable WU-00 fixture with SHA-256-derived UUIDv7 suffixes and a fixed fixture epoch. Collections provide separate namespaces (including users vs memberships); source keys/titles/dependencies remain exact. `pnpm test:contracts` verifies generator drift, all 83 operation request/response examples and focused risky validation. `pnpm contracts:consumers` checks real package imports from sample web/mock/Worker consumers without implementing later adapters or routes.
