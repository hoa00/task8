# Studio data foundation (WU-06)

`main.tsx` creates one runtime and one QueryClient. Vite resolves `#studio-adapter`
to a static mock or HTTP entry using `VITE_DATA_MODE`; rebuild/restart to change
mode. Features use `useStudioQuery`, `studioQueryOptions` or the typed
`runtime.client.api` methods. The runtime context contains services and a clock;
server DTOs live only in TanStack Query. No feature imports seed/storage.

Both factories expose all 83 `StudioApi` methods with contract validation.
Mock currently implements session, workspaces, bootstrap, workspace, profile,
preferences and notification preferences reads. Catalogs arrive with bootstrap.
All other mock operations reject `CAPABILITY_UNAVAILABLE` (501); their owning
feature WU adds handlers and updates capabilities. HTTP sends validated JSON
operations, parses error/success envelopes, and never invokes mock on failure.
Multipart and binary operations explicitly reject until the file WU adds their
transport. HTTP capabilities come from the server session and must say `http`.

Mock uses one DTO table per entity, preserving all 156 mapped UUIDv7 identities
and 49 visible task keys. Source task attachments refer to existing file rows,
not another file collection. Project DTOs own milestone rows. Three workspace
catalog entries are preserved for demo selection, but only the seed workspace
has business data; another workspace bootstrap returns 404. Private projects
outside current membership expose only the contract's restricted catalog item.
Security/invoice/session display demos are not authenticated profile data.

The locked WU-00 fixture is imported only by the mock mapper. Its dates, text and
instants remain pinned. `fixtureClock` is UTC `2026-10-08T09:00:00Z`; an injected
clock supplies missing timestamps and read calculations. HTTP uses `systemClock`.
Source recurrence display labels become contract codes (`Weekly` → `weekly`);
empty assignee/team sentinel becomes null. Source defaults omitted from prefs
are made explicit in the DTO; source HTML is preserved as audited fixture data
and is not rendered by this foundation.

`mockScenarios` defines populated/empty/loading/error/offline. Non-default
scenarios start from their fixture, bypass persistence and do not alter the demo.
Loading uses a cancellable delay; the injected wait seam allows deterministic
pending-state checks without global fake timers.

Persistence is adapter-owned at `task8.mock.v1:<sourceSha>:<workspaceId>` and
validates schema version, fixture digest, DTOs and relationships. Corrupt,
foreign or blocked storage starts from seed in memory. It never reads or clears
`gr8r.v2` or `task8.ui.theme.v1`. Reset defaults to forbidden in production;
`resetMockState(client, queryClient)` resets in dev/test and cancels/clears Query
cache. Reset the adapter, rather than sending a workspace snapshot as mutation.

Workspace read keys begin `['workspace', workspaceId, resource, ...]`. Query
inputs pass through their schema to canonicalize defaults. Session/profile and
workspace catalog are explicitly global, principal-owned reads. Use operation
invalidation after a successful mutation; task edits cover all projections.
An unmapped mutation conservatively invalidates its own workspace. Cancel old
workspace queries when switching scope; the request signal reaches both adapters.

`pnpm verify:data` runs mandatory checks and writes WU-06 evidence. The HTTP-only
build uses the actual app entry in `dist-http`, checks its production module
graph and emitted JS bytes, and records bundle hashes. Contracts expose `/api`
without source identity side effects so HTTP does not import fixture code.
