# Offline runtime configuration fix and synthetic application verification

The original local source/build checkpoint remains commit
`deb0e90bde8ef2c9eda9d8e60e6c73de77ca832a`. Its successful build and approved
loopback result remain unchanged historical evidence. No real R1 rerun, original
source/3000 change, dependency upgrade/patch, OS security change or remote action.

## Identified configuration trigger

The synthetic Miniflare probes used a native network-service outbound object:
`{network:{allow:[],deny:['public','private']}}`. On this host and pinned runtime
it reproduced `std::terminate` before any test. Keeping the same deny-all intent
but using Miniflare's supported callback representation allows startup.

`lib/local-worker-outbound.mjs` returns 403 for every outbound request without
reading/logging its URL, headers, body or credentials. The existing Node network
guard remains in place. Both active native probe entries now use this helper.
No cache, TLS, role, login or data-integrity check was removed to obtain PASS.
This is an offline test/runtime configuration correction, not a new application
login scheme or a production network-policy change. The underlying native C++
failure is not diagnosed beyond this reproducible configuration boundary.

Evidence-based reductions were retained, not adopted as fixes:

- Disabling optional cache emulation still failed natively; cache remains enabled.
- Captured container-engine and TLS fields each passed independently in socketless
  native tests. No Docker service/image or TLS trust setting was changed.
- In-memory Durable Object namespace/storage passed independently.
- The pinned official serializer passed a 408-byte native binary-config unit test.
- Previously, identical generated payload from stdin or a file both failed;
  changing input transport was not a fix.

The actual shared callback has native tests for startup, denied GET and denied
POST: 3 PASS, two denial callbacks, owned sentinel received zero requests,
Miniflare and sentinel disposed. The full existing native password/D1/R2/HMAC
probe passes 8/8 and disposes normally. Pin versions remain Miniflare
4.20260515.0 / workerd 1.20260515.1 / TypeScript 5.9.3; package/lock unchanged.

## Compiled application fixture

The development fixture loaded the actual successful `deb0e90...` build with
synthetic, nonpersistent D1/R2, known schema migrations, fake users and a signer
that exists only for the fixture's lifetime. No real credential was read,
configured, reset or migrated. Reports contain status/aggregate evidence, never
passwords, verifiers, session cookies or signer values.

Two harness setup errors were corrected using the pinned SDK contract:

1. Automatic module discovery rejects generated dynamic imports. Explicitly
   enumerate the 92 built ES modules instead of changing the application bundle.
2. Direct Miniflare assets configuration requires `has_user_worker:true` for
   unmatched assets to reach the Worker. Without it, `/login` was a harness 404.
   Keep static assets rooted only at `dist/client`, never the server bundle.

Development HTTP fixture: 12/12 PASS against the original compiled application:
login page; anonymous data/images; fake platform/admin-header refusal; DEMO and
cross-origin refusal; wrong password/disabled account refusal; hashed admin and
legacy staff login with Secure/HttpOnly/SameSite cookies; staff module/account/
verifier projection; authorized and forbidden image reads; anonymous writes with
unchanged business state; admin-only snapshot contract/no hosted import; tamper/
logout revocation; authEpoch invalidation. No outbound fetch was needed by these
application cases. Miniflare disposed normally.

The final source commit, fresh build and fresh compiled-application result are
recorded separately in the parent task's phase-fourteen receipts. Do not relabel
the `deb0e90...` build as proof for a later commit: compare their actual
`programCommit` / `applicationBuildCommit` fields. The HTTP test is local synthetic
acceptance, not browser/iPhone QA, true-data restore, real-account migration or
hosted Sites/platform audience acceptance.

## Continuation and retained limits

No new technical permission request remains for this repaired local test path.
Use the same approved tool/loopback scope, fixed dependencies and deny callback;
do not replay the known failing native network object without a new diagnostic
reason. Old C1/observer/G3 and event-log refusals remain untouched.

The local real R1 snapshot remains data-ready/authReady:false. A true local
restore, existing account-verifier compatibility migration and actual Sites
runtime require their separate target/configuration/data authority. Two Sites,
GitHub/source remotes, true upload and publication were not created or performed.
The protected resumable hosted-import design in phase eleven remains a design;
no hosted target was fabricated from the isolated-local adapter.

Parent-task evidence names: `sites-cache-isolation-phase-fourteen-results.json`,
`sites-container-field-isolation-phase-fourteen-results.json`,
`sites-tls-field-isolation-phase-fourteen-results.json`,
`sites-do-storage-isolation-phase-fourteen-results.json`,
`sites-serializer-isolation-phase-fourteen-results.json`,
`sites-outbound-isolation-phase-fourteen-results.json`,
`sites-outbound-shared-helper-phase-fourteen-results.json`,
`sites-runtime-contract-phase-fourteen-results.json`,
`sites-built-app-phase-fourteen-routing-results.json` (development, original build),
plus final commit/build/application/checkpoint receipts. Failed attempts and
their owned fixture directories are retained; no old output was overwritten.
