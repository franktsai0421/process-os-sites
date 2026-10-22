# Sites deployment preparation

Current owner/source preparation:
[default-off first owner and pinned Site-source main](docs/sites/PHASE_TWENTY_THREE_OWNER_SETUP.md).
This appends a fresh-only bootstrap receipt migration and supplies reviewable
source for the exact Site remote. It does not update installed hooks or configure
secrets. Retain the owner-private platform gate and explicit live-action approvals.

Current implementation and acceptance boundaries:
[import/build contract](docs/sites/PHASE_SEVENTEEN_IMPORT_BUILD.md).
The prior [phase-fifteen plan](docs/sites/PHASE_FIFTEEN_DEPLOYMENT_PLAN.md) is
historical, not the current execution state.

## Selected destinations

The parent created one Frank-only test Site, project
`appgprj_6ad9abaff47c8191846eb9821034696b`, intended URL
`https://process-os-test.franktsai0421.chatgpt.site` (not deployed here).
`.openai/hosting.json` preserves that ID, D1 `DB` and R2 `STATE_ARCHIVE`.
Do not create another Site or add `static` for this Worker application.

Personal private GitHub `franktsai0421/process-os-sites` and the Site-bound source
Git are separate destinations. Future formal Site `process-os` needs its own ID,
D1/R2, signer and baseline, with public entry and own login/roles for company data.
Every Site URL is production for its Site; no staging switch.

## Remaining source and publication sequence

1. Resolve the dedicated Site source branch `main` against the existing main push
   rule. The guard rejects it regardless of remote URL. Do not disable/bypass
   hooks, force push or assume a tool-policy denial. No push has been attempted.
2. Confirm a truly fresh target and adopt `drizzle-sites-fresh` in its reviewed
   Site-bound publication source. The installed helper copies root `drizzle`;
   an ordinary local build does not select the candidate. Preserve applied SQL/
   journals and the original checkout. Old `drizzle` includes historical empty-row
   DML and lacks the new ledgers; it is not the ready fresh-Site profile.
3. Use installed Sites 1.1.1 portable helpers. Resolve `<plugin-root>` from the
   installed Sites skill and the parent task's non-secret local-helper receipt.
   Retrieve short-lived source access for the same Site only when authorized.
   `http_extra_header` credentials go from native return to session memory and
   hidden helper stdin; never chat, argv, files or persistent Git auth. A secret
   already held by the parent is not accessible through a hidden relay.
4. Launch `node <plugin-root>/scripts/site-workflow.mjs --project-id <actual-id>`
   from the selected checkout with a writable terminal. Opening omits archivePath;
   retain its complete result. Review/commit source and set PROCESS_PROGRAM_COMMIT
   to its real reviewed commit before build; no dummy SHA.
5. For authorized synchronization/package, pass credential and opening result to
   the same helper, an absolute new archive path outside source, and remaining
   ordered command arrays including
   `["node","<plugin-root>/scripts/build-site.mjs"]`. The helper owns commit/push/
   package. Existing valid dependencies need no reinstall.
6. Parent supplies its exact returned project/commit/archive to native save/private
   deployment. Preserve version/deployment IDs; resolve uncertain outcomes before
   retry. A Git source ZIP is not a publication package.

This document itself authorizes no remote action or secret configuration. Do not
use legacy CF release commands as a substitute.

## Runtime, initial data and accounts

Keep the Sites/Vinext integration, lock and Workers compatibility settings. DEMO
stays false, revocation enabled, legacy release disabled; PROCESS_AUTH_MODE is
unsupported. Each Site needs an independently approved signer through native
secret configuration, never source/output.

Initial import defaults off. Future enabling needs explicit target/origin/owner/
manifest values: PROCESS_IMPORT_ENABLED, PROCESS_IMPORT_ORIGIN,
PROCESS_IMPORT_OWNER_ID, PROCESS_IMPORT_TARGET_FINGERPRINT and
PROCESS_IMPORT_MANIFEST_SHA256. No real setting or signer was configured here.

The protected `/api/snapshots/import` implements begin/chunk/status/verify/audit/
copy/restore/activate. Generic snapshots POST remains 405. A normal owner-admin
session with master.export is required; no anonymous/DEMO bootstrap. A configured
authentication-only owner row in maintenance mode is a separate prerequisite.
Never assume the scrubbed R1 has usable passwords or the original lacked them.

Reuse the completed local curated496-from-rev495 Snapshot V1. Do not reconvert,
duplicate its full payload or put it in source. True import is unperformed. Its
14 business identities/three roles are credential-free. Synthetic activation
preserves only the separately configured target owner's verifier; employee
credentials still need an explicitly approved compatibility/setup procedure.
Legacy R2 and record-envelope owner overlays, unnormalized immutable names, and
hosted chunk-pack/container formats remain refused. Direct selected R1 import
still needs the bounded normalization/reference adapter and record-owner storage
adapter described in the current contract; synthetic fixture normalization is
not that real-data preparation.

Stage and materialized payloads may coexist: confirm actual quota/cost before
real upload. Interrupted/uncertain uploads are retained; no cleanup/delete is
implicit. Keep the import gate enabled until durable activation succeeds. D1/R2
are not one atomic transaction.

Later development uses authenticated `GET /api/snapshots?action=export` -> bounded
NDJSON receiver -> verified isolated-local restore. Preserve current/history/
images and schema/source/chunk checks. Known internal transport duplicates are
excluded; unknown layouts fail. No automatic local-to-formal return upload.
Paginated native data inspection is not a complete backup.

Optional legacy IQC first import still needs a separately reviewed private source
key/hash; no object was uploaded/configured. Preserve own login, roles, media ACLs
and the Sites private gate. Do not override `/signin-with-chatgpt`,
`/signout-with-chatgpt` or `/callback`, or trust missing/fabricated identity headers.
The future public entry does not require each employee to have a ChatGPT account
merely for own application login.

## Evidence and source boundary

Use latest parent-task phase-seventeen source/commit/type/test/build receipts.
Older 17/17 and efaedbd build/HTTP checks are historical, not proof for a later
version. Hosted bindings/gate, real credentials/import/export, browser/iPhone QA
and publication remain unaccepted.

Transfer only exact reviewed source. Exclude .git, environment/auth files, .npmrc,
data/R2/snapshots, node_modules, dist, .wrangler, .sites-runtime and private
receipts. Keep the three held legacy scripts excluded without reopening them.
Do not replay G3/C1/observer refusals or touch daily 3000, M1 or the true R1.
# Current fresh-target import preparation

The current source-only preparation is [phase eighteen](docs/sites/PHASE_EIGHTEEN_NORMALIZED_IMPORT.md).
Use its explicit fresh-target projection for the installed official packager's
root-drizzle contract. Do not apply archived legacy migrations to a new target,
rewrite old applied migration history, bypass the main guard, or infer approval
from synthetic tests. The original instructions below retain historical context.
