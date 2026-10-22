# Historical phase-fifteen deployment plan

Deprecated planning record, retained for provenance. Site identity, importer and
current checks have changed. Use [current deployment](../../DEPLOYMENT.md) and
[current contract](PHASE_SEVENTEEN_IMPORT_BUILD.md) instead.

This is the isolated Sites derivative. The selected M1 baseline is
`7f5dc57239d6db483f096d96df6bd6cdd7357f5a`; the last application build and
compiled-app synthetic acceptance belong to
`efaedbd4893347a968b65cfa237358ffa8821316`. Documentation changes after that
commit do not constitute another build or hosted acceptance.

## Current state and independent destinations

`.openai/hosting.json` currently declares `d1: DB` and `r2: STATE_ARCHIVE`.
It has no `project_id`. Templates are intentions, not registered resources:

| Destination | Intended access | Data |
| --- | --- | --- |
| Personal GitHub `franktsai0421/process-os-sites` | Private source repository | Code only |
| Personal Site `process-os-test` | Frank only, platform private gate | Independent D1/R2 |
| Personal Site `process-os` | Public entry; own login and roles protect data | Different D1/R2 and signer |

Every deployed Site URL is production for that Site. There is no assumed staging
switch. GitHub source and Site-bound source Git are separate destinations; an
arbitrary GitHub repository is not a one-click Sites publication source. Preserve
the original application, daily port 3000, old repositories and old CF resources.

## Source handoff and supported Windows workflow

Use the Sites skill and the actual installed helpers under the plugin directory
containing `scripts/` and `skills/`. This workstation has Sites 1.1.1 at
`C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/sites/1.1.1`.
Presence and inspected source establish local availability, not successful
remote authentication. Portable Windows does not require a Bash replacement.

1. The parent operator checks prior creation state, then creates the private test
   Site once. Retain its actual ID, audience and returned source-repository
   metadata. Do not guess an ID or create a duplicate after an uncertain result.
2. From this checkout run `node <plugin-root>/scripts/set-project-id.mjs
   --project-id <actual-test-id>`. Preserve both binding names; omit `static` for
   this Worker application. Never point public assets at `dist/server`.
3. Reconcile and review the resulting source change, migration issue below and
   the returned source branch against existing Git hooks. Commit approved local
   source before building so `PROCESS_PROGRAM_COMMIT` names its real reviewed
   commit. Never bypass a main-branch guard or substitute a fake SHA.
4. Launch `node <plugin-root>/scripts/site-workflow.mjs --project-id <actual-id>`
   with a writable terminal. At its hidden-stdin prompt, pass the returned
   credential object in memory, no `archivePath` for opening. Retain the complete
   returned opening result. A `work_proxy` credential needs no token or custom
   authorization header. Opening contacts remote Git and requires that scope.
5. For authorized publication preparation, use the same helper with the complete
   opening result as `source`, an absolute archive destination outside the
   checkout, and remaining command arrays including
   `["node", "<plugin-root>/scripts/build-site.mjs"]`. Existing dependencies are
   valid while package/lock inputs remain unchanged; do not reinstall them merely
   to repeat a passed step. The helper owns its source commit/push and package.
6. Pass its exact `project_id`, `commit_sha` and unchanged `archive` to native
   Sites save/deploy. For confirmed Frank-only access use private deployment.
   Retain returned version/deployment IDs and resolve uncertain outcomes before
   retry. A local Git archive is only a source handoff, not that publication
   archive. Never publish the test Site publicly to simplify access.

Site registration, source push, deployment, secrets and true-data upload are
parent-controlled actions and have not been performed by this local preparation.
Do not run old `release:staging`, `release:production` or `sync:staging` as a
substitute; their Sites boundary intentionally refuses legacy publication.

## Runtime and schema requirements

Keep the `sites()` integration in `vite.config.ts`, Vinext Worker entry and the
locked dependencies. Node >=22.13 is required; actual local evidence used Node
24.19.0. D1 binding is `DB`, R2 binding is `STATE_ARCHIVE`; generated zero IDs and
`site-creator-*` names are placeholders, not proof of provisioned targets.

Set nonsecret runtime values on each actual target: `DEMO_LOGIN_ENABLED=false`,
`PROCESS_SESSION_REVOCATION_ENABLED=1`, `PROCESS_RELEASE_DISABLED=true`, and a
real reviewed `PROCESS_PROGRAM_COMMIT`. `PROCESS_AUTH_MODE` is unsupported and
refused. Supply a different `PROCESS_SESSION_SECRET` per Site only through
approved secret configuration; never through source, chat, CLI arguments or the
hosting manifest. `PROCESS_RELEASE_DISABLED` closes the legacy release path;
it is not a claim that all business writes or imports are disabled.

Schema source: `db/schema.ts`, `drizzle.config.ts`, and migrations `0000` through
`0003` with their existing journal/snapshots. Transport includes three business
tables; runtime additionally needs revocation and login-limit tables. Public
requests must not create migration-owned tables. Sites applies pending hosted
migrations before Worker upload; local preview and hosted DBs are distinct.

**Migration review before first hosted save:**
`drizzle/0002_local_feedback_sessions.sql` includes one INSERT of an empty
feedback singleton after DDL. It contains no company rows, but Sites guidance
requires schema-only migrations and seeds outside migrations. Existing applied
SQL/journals are immutable. Do not silently edit this historical migration or
claim platform acceptance: select and validate a fresh-target schema-only
baseline strategy with the platform workflow before publication. A future
initial importer must distinguish this exact empty singleton from occupied
business data, and must refuse an occupied target.

## First data and account activation: unresolved implementation

The selected true curated496-from-rev495 R1 has already been converted and fully
audited locally. Keep its existing output in place; do not reconvert or copy its
8.14 GB payload into the code repository. Its credential-scrubbed identities and
roles are preserved, but `authReady:false`: original account/password
verification data was not read or moved. This does not mean the old system lacks
passwords. Previously published/demo passwords are not evidence of usable or
safe production credentials.

Hosted `POST /api/snapshots` is intentionally 405. The protected resumable
hosted-import target described in
[phase eleven](PHASE_ELEVEN_RUNTIME_HANDOFF.md) remained unimplemented at phase fifteen.
Do not use the isolated-local adapter as a remote writer or assume native Sites
tools offer bulk upload. Required implementation before real upload:

1. Authorize the exact project/bindings and reviewed manifest/schema; protect
   import with platform access where applicable, own owner session and CSRF.
   Keep an upload generation unavailable to business traffic until activation.
2. Use a durable target-bound CAS ledger. Accept bounded chunks (existing V1
   maximum 1 MiB) with length/SHA checks; identical retries acknowledge, conflicting
   bytes fail. Paginate missing-chunk receipts for resume. Stream objects into an
   inactive R2 namespace; do not load the full snapshot into an isolate.
3. Seal only after complete manifest, chunk, table, object, image and current/
   historical reference coverage checks. Reconcile non-atomic D1/R2 work through
   the ledger. Preserve interrupted generations and explicit failure evidence;
   no silent omissions, target overwrite, destructive cleanup or blind reruns.
4. Separately authorize first owner credential provisioning or a reviewed
   compatibility migration. Use a supported secret input; never retrieve real
   passwords into logs or assume a credential-free snapshot enables login.
   Keep activation unavailable until owner authentication is configured and
   role/media/API behavior is accepted on the actual target.

Test and formal imports each use the selected reviewed baseline into their own
fresh target. Do not promote test-edited company data. Later development is
website export -> credential-scrubbed versioned snapshot -> isolated local restore.
Restore must verify version/schema/source/chunks/references and refuse unknown
or occupied targets. There is no automatic local-to-formal return upload.
The implemented server export is authenticated `GET /api/snapshots?action=export`
and streams NDJSON; plain GET returns the capabilities contract. Its D1/R2 source
adapter and transport have synthetic evidence; a complete actual hosted export
has not been accepted. Use a separately approved local receiver that checks the
versioned stream and preserves interruption evidence before restore.
Paginated native database views are not a complete backup. Existing source-backed
local restore staging avoids duplicating all snapshot chunks; a real SDK restore
has not yet been accepted.

The optional private IQC baseline import requires a separately reviewed R2 source
key and SHA (`PROCESS_IQC_IMPORT_SOURCE_KEY`, `PROCESS_IQC_IMPORT_SOURCE_SHA256`).
No original baseline was uploaded or configured; that optional initial-import
feature is unavailable without it. Do not synthesize a baseline from live rows.

## Login, isolation and acceptance boundaries

Retain existing own account/password login, signed cookie, revocation/authEpoch,
disabled-account checks, server roles and private image reference authorization.
The public Site may receive anonymous requests: missing or fabricated Sites
identity headers never authenticate an application user. Do not implement or
override `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, or bypass
the Frank-only platform gate. Employees using the public entry are not assumed
to need ChatGPT accounts merely for own application login.

Accepted local evidence at `efaedbd...`: actual build exit 0 and known auth-client
audit PASS; compiled application on nonpersistent fake D1/R2: 12/12; native
password/D1/R2/HMAC: 8/8; shared deny-outbound helper: 3/3, zero sentinel requests.
Do not repeat these unchanged cases for documentation alone. Hosted bindings,
platform gate, true account migration, true data restore/import, browser/iPhone
QA and deployment remain unaccepted. A true conversion PASS is data evidence,
not login/runtime/publication acceptance.

Before remote handoff scan exact tracked source and verify archive members and
hashes. Exclude `.git`, `.env*`, `.dev.vars*`, `.npmrc`, credentials, snapshots,
R2/media datasets, `node_modules`, `dist`, `.wrangler`, `.sites-runtime`, private
reports and the three held legacy package scripts. Do not reopen those held
scripts or resume old G3/C1/observer refusals as publication preparation.
