# Studio data owner — current FR checkpoint

Read [FRONTEND_STANDARDS](../../../../docs/engineering/FRONTEND_STANDARDS.md), [architecture](../../../../docs/poc/ARCHITECTURE.md) and [active checks](../../../../tests/frontend/README.md). This file describes the current implementation; WU evidence remains historical.

`main.tsx` creates a runtime/QueryClient. Vite resolves `#studio-adapter` to a static mock or HTTP entry using VITE_DATA_MODE. HTTP errors never invoke mock; its production graph is checked independently. `operations.ts` binds every canonical operation and validates request/response envelopes. Transport errors, API error codes, request cancellation and captured auth/session generation are preserved. Capabilities and actual operation owners determine support; unsupported operations reject501, never fake success. Multipart/binary transport belongs to the HTTP adapter.

Features consume `useStudioQuery`, `studioQueryOptions` or typed client methods. Query owns DTO cache; URL belongs to Router, draft/menu/opener belongs to a scoped controller. Session/profile/workspaces are principal-owned global reads; workspace resource keys include workspace and normalized input. `query-keys.ts` and `invalidation.ts` own keys/affected projections. Writes include notification projections when lifecycle/access changes, plus bootstrap/detail/list/summary/search/archive as declared. Adding a workspace mutation requires invalidation coverage.

Mock is maintained contract behavior, not a fallback. Adapter selects scope/capability and dispatches project/team/settings/notification/task operation owners. `mock/operation-registry.ts` explicitly covers task reads/commands, subtasks, comments, files, activity/member reads and Undo. Generic ID/error/hash/access helpers are independent of business handlers. The former task-fields facade is removed.

Every write to one aggregate goes through `mock/transaction.ts`; staging, validation and configured durable save must succeed before synchronous live replacement. Rejected handler/save commits nothing; the next queued command still runs. Reads do not persist. Undo stores bounded inverse/version guards, never a workspace snapshot. File, task/project relationship changes and counters stay atomic.

UTF-8/base64url cursor v2 is bounded and scoped by operation/workspace/principal/normalized query. Malformed/old/scope-mismatched cursors return validation/restart-feed; no storage reset. Task/file seeks use explicit comparator fields. Complete task loading belongs to `features/tasks/loadTaskViewDataset.ts` + `useTaskDataset`/one key; cursor loops/coverage mismatch reject incomplete datasets.

Mock persistence retains `task8.mock.v1:<sourceSha>:<workspaceId>`, schema/digest/DTO/relation validation and explicit onboarding demo scope catalog. Pinned fixtureClock is UTC2026-10-08T09:00Z; callers inject clocks. Non-default system scenarios bypass populated persistence. Local auth/invitation/onboarding/security demos remain explicit capabilities, not authenticated external delivery. Reset is opt-in dev/test and clears scoped Query state; it is never a refactor migration strategy.

```sh
pnpm frontend:check --checks=web-tests,domain-tests,contract-tests,identities,consumers,boundaries --output=test-results/data-change
pnpm frontend:check --checks=http-build,http-bundle --output=test-results/http-graph
pnpm frontend:check --checks=people-http,teams-http --output=test-results/http-consumers
```

Build mock/HTTP before their browser checks. `verify:data` now delegates to safe non-API manifest; it does not write WU-06. Pure domain tests live under their own package; web retains adapter/cache/consumer integration. Actual final evidence and route-to-handler walkthroughs: [audit](../../../../docs/engineering/FRONTEND_REFACTOR_AUDIT.md). These checks do not validate API/D1/R2/live services.
