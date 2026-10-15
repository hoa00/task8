# Teams owner

Routes validate scope/IDs and compose TeamsPage/TeamDetail controllers. TeamGrid/TeamIdentity receive models; TeamFormDialog is controlled with Field render bindings. TeamOverlayHost owns draft, pending confirmation, canonical retry and typed create/update/delete/Undo intents. Query owns DTOs. Public paths/symbols are declared in frontend-policy; other features use published identity/form/intents, not private implementation.

Existing public useProjectCommands wraps the shared command lifecycle for CAS refetch/retry; it does not store team DTOs. App services own notices/motion/surfaces. Mock teams handler uses the common transaction owner and canonical relationship/version/lifecycle rules; HTTP uses the same operation schemas with no mock fallback.

```sh
pnpm frontend:check --checks=web-tests,contract-tests,consumers,boundaries --output=test-results/team-change
pnpm frontend:check --checks=http-build,teams-http --output=test-results/team-http
```

Current Teams HTTP browser has7cases: list loading, detail summary error/retry, failed create retained draft/member choice, actual stale409 retry, delete/Undo500 retry, deleted team choices and404 route. Run full suite for acceptance; --remaining records5skips/partial. Old WU interaction/visual aliases are reproduction-only in historical checkout. See final engineering audit for the route→controller→client→handler/cache walkthrough.
