# Domain owner

Pure clock/date, task query/filter/order/group/projection, relations, dashboard, rich-text sanitization, file and invite policies. Imports only contracts and pure parse5; no app, DOM, React, storage or network. Callers supply today/now/input explicitly when evaluation needs time. Pixel columns and persisted web view preferences belong to `apps/web/src/features/tasks/task-view.ts`.

```sh
pnpm --filter @studio/domain test
pnpm --filter @studio/domain typecheck
pnpm frontend:check --checks=domain-tests,web-tests,boundaries --output=test-results/domain-change
```

Native Node24 tests in `tests/*.test.ts` run once under manifest `domain-tests`. Calendar geometry/navigation and timezone/DST/date invariance moved from web tests in FR-06; their deterministic date is local to these tests, with no dependency on a web seed. Web keeps canonical adapter PATCH/loader/cache/URL integration and timeline geometry cases that still use the web fixture. This is gradual ownership migration, not a claim that every pure assertion has moved. Tests are also checked by `tsconfig.tests.json`; build includes only `src`.

Add new pure policy tests here; add consumer/adapter/cache regressions under web when that boundary is the failure mode. Never import a web fixture into domain to share test data.
