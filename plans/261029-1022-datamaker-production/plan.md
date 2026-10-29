# DataMaker Task production deployment

Status: in progress. Owner: current session. Scope: first production rollout; no runtime business changes.

## Outcome and constraints

- Stop the owned local dev processes; keep the shared Portless proxy and unrelated apps.
- Deploy web HTTP bundle plus existing API at one HTTPS origin on the connected Cloudflare account, with separate D1/R2 in APAC.
- User selected `ict24h-rdn-dev` and fresh production data; do not copy local data or seed demo workspaces.
- Keep the provider public key; create a distinct production session encryption key in Worker secrets. Never expose values in output/Git.
- No custom DNS, CI/CD, schema redesign, role grants or unrelated refactors.

## Execution and acceptance

1. Configure [production Wrangler](../../../apps/api/wrangler.production.jsonc), production deploy command and HTTP-only assets.
2. Create isolated D1/R2. Export D1 before applying the existing migrations; preserve the Wrangler ledger.
3. Verify types/lint/unit checks, HTTP bundle isolation and native auth/HTTP checks appropriate to configuration-only rollout.
4. Review configuration, deploy with secrets through private temporary input, verify public HTTPS/assets/deep links/API/auth rejection without real credentials or mutations.
5. Update owning operational guidance and PROGRESS, record deployment ID/backup/limitations, commit/push.

Rollback: this is the first deployment, so no prior version exists. Disable the new Worker subdomain if verification fails; preserve D1/R2 and backup for investigation. Later code rollbacks use the recorded prior Worker version; never use code rollback to reset data.

Evidence: unique `test-results/datamaker-production-261029-*`; sanitized final receipt under `docs/engineering/evidence/DEPLOY-01/`.
