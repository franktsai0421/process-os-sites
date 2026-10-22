# Runtime evidence and minimal platform handoff

## Actual results

Same independent program root; M1 lineage remains
`7f5dc57239d6db483f096d96df6bd6cdd7357f5a`. This derivative is not a new Git
commit. The completed real R1 snapshot and its phase-nine conversion pin are
unchanged. No second snapshot copy or restore was made.

- The real `runLocalBuild` entry performed its prerequisite check and refused
  `SITES_REVIEWED_PROGRAM_COMMIT_REQUIRED`. `node_modules` and the reviewed
  derivative commit are absent. No compiler child started. This is **not build
  PASS or a compiler failure**. No dummy commit, install, module link, lock edit,
  dependency upgrade or G3 graph resolution was used.
- A new synthetic-only Miniflare operation used existing Miniflare
  `4.20260515.0`, workerd `1.20260515.1` and TypeScript `5.9.3`. It was separate
  from old C1/observer actions. workerd terminated natively; Miniflare returned
  `ERR_RUNTIME_FAILURE`, with zero test cases reached. `dispose()` did not
  confirm cleanup; the owning command ended exit 1. No business application,
  real DB/R2, account or true snapshot was opened. The test used fresh temporary
  storage, loopback/ephemeral port, disabled persistence and a denied outbound
  service. No alternate binary/tool/actor retry was made. Native cause is unknown;
  this is not evidence of an SDK policy denial or of an application crypto defect.
- Source-boundary synthetic checks: 4 PASS. Affected account/session/roles/media/
  snapshot checks: 18 PASS. Scoped types have a separate receipt (`checkJs:false`);
  JavaScript syntax checks are separate. These do not replace native runtime or
  platform acceptance. The previous true-data audit is reused, not rerun.

Parent-task receipts: `sites-build-phase-eleven-results.json`,
`sites-runtime-contract-phase-eleven-results.json`,
`sites-source-boundary-phase-eleven-final-results.json`,
`sites-security-phase-eleven-results.json`, `sites-types-phase-eleven-results.json`,
`sites-source-freeze-phase-eleven.json`, `sites-source-diff.phase-eleven.json`,
`sites-source-handoff-phase-eleven.json`.

## Exact old denial boundary

C1 receipt `R20-C1-source-tool-denial.actual.json` records a particular D-only
source-authoring command rejected **before CreateProcess**, reason `blocked by
policy`, SDK:false. It references the exact review-only command and preimages;
it does not prohibit every use of the installed Wrangler package. That old action
remains stopped; original-context decision/official exact-action review or tool
owner disposition is still needed for that action.

The observer receipt
`original-createprocess-access-denied.actual-v2.json` records default PowerShell
source preparation for `...observer-v14-independent-source-review.../review-source.ps1`
and subsequent intended official AST/constant controls. Unified process creation
failed with os5; no shell, candidate, AST or controls ran. The intended runtime
was the bundled PowerShell `pwsh.exe`, not workerd. Its exact cause is undetermined;
it also remains stopped. No old observer/CIM/port test or quota was reused.

The new operation was Node `scripts/runtime-contract-probe.mjs` in this copy,
loading the existing pinned Miniflare module read-only, with a new synthetic
scratch directory. It neither authors nor runs those old D source/observer
targets. It failed after the native Workers runtime was attempted; there was no
auto-review rejection in this operation. Do not reinterpret that distinction as
permission to retry any old refusal. Phase ten's blanket implication that a
platform-proxy operation itself had been denied is superseded by this evidence.

## Source handoff and build prerequisites

The handoff manifest is a path/size/SHA-256 allowlist, not an archive or upload.
All included files are rehashed locally. It excludes dependency/generated storage,
snapshot/R2 directories, `.env*`, `.dev.vars*`, `.wrangler`, `.sites-runtime`,
databases, archives, session files and key material. This is evidence of known
path exclusions, **not a universal secret-content scan**. Three previously held
legacy package scripts are omitted without opening or rehashing them; their
names and prior pins remain in the receipt. Consequently it is a candidate
runtime/source handoff, not a claim that every legacy packaging command is present
or approved. No file was removed from the actual working copy.

Minimum program contents: `app/`, `components/`, `lib/`, `db/`, `drizzle/`,
source-only `public/`, `scripts/` except the three held legacy scripts, package
manifest and unchanged lock, Vite/TypeScript/CSS configuration, `.openai/hosting.json`,
templates and their supporting source/docs. Keep the exact manifest list rather
than reconstructing a bundle from this prose. A further source change invalidates
the handoff SHA. Runtime-required dependency closure and native assets still need
an actual build; the manifest does not prove a successful bundle.

Actual next build needs: parent-controlled reviewed derivative commit and
`PROCESS_PROGRAM_COMMIT` set to that **40-hex commit**, plus a normal isolated
installation of the unchanged pinned lock. Installation was not performed here.
Review lifecycle scripts first: current `postinstall` collaboration setup can
write Git hook/configuration in a Git checkout; it must not be run under the
current no-Git-write scope. Do not silently remove the guard or use an invented
commit/source hash. The existing native workerd crash must receive a supported
diagnosis/disposition before another native attempt; no version/binary replacement
was authorized. Windows portable workflow itself does not require Bash.

## Sites execution contract and separate destinations

The program already uses `cloudflare:workers`, binding names `DB` and
`STATE_ARCHIVE`, `nodejs_compat`, vinext and the Sites Vite plugin. Local runtime
uses compatibility date `2026-05-15`. The build branch currently has placeholder
DB/R2 identifiers; it is not provisioned. Parent must verify the generated Sites
build artifact and actual environment bindings, compatibility date/flags, secret
injection and migration application. Latest documentation support does not prove
the older pinned workerd works: see the failed local probe.

Private GitHub `franktsai0421/process-os-sites` is one destination; each personal
Site (`process-os-test`, `process-os`) has its own opaque project ID and source Git
remote. Do not invent these values or claim a generic GitHub repository is a
one-click Sites deployment. Parent creates/resolves each destination, records
the returned source remote, then maps one reviewed program revision to the exact
pushed Site source/version commit. Source pushes exclude data. No repository,
Site, source remote, version, deployment, audience or binding was created here.
Every deployment URL is production: isolation requires two actual Sites and
independent D1/R2/session settings, not a staging switch.

Test Site: Frank only, platform private gate retained. Formal Site: public entry
with the application's normal account login and role-limited data/images/APIs.
Public access does not require every employee to own a ChatGPT account.
Never override `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback` or bypass
the platform private gate. Missing Sites identity headers confer no identity.
The application still needs valid signed HttpOnly/Secure/SameSite cookies,
authEpoch, revocation, rate-limit tables and media/module authorization verified
on the actual runtime. DEMO stays false. `PROCESS_AUTH_MODE` is unimplemented and
explicitly rejected. No true verifier was read/moved; the scrubbed R1 retains
identity/role business fields but has authReady:false, which does **not** imply
the original system had no passwords. Independent session signing and a reviewed
credential compatibility/bootstrap procedure require an exact future action.

Schema bundle remains pinned and unapplied. `0002` contains an empty feedback
singleton initialization, not company data; preserve applied migration history.
Future fresh target preparation must recognize that empty singleton rather than
silently discard a nonempty row or overwrite an existing target.

## Protected initial-data import: minimum design, not a deployed endpoint

Sites source deployment does not transfer D1/R2 contents. Platform paginated
inspection is not a full backup, and available platform tools supply no generic
bulk import. Existing `importSnapshot` remains isolated-local-only; its local
proof must never be forged to point at a hosted target. No remote import route,
credential or remote-target adapter was created in this phase.

A future initial-data importer needs this bounded, explicit sequence:

1. Pin the chosen local Snapshot V1 manifest hash and schema, exact destination
   project ID/binding identities and an empty destination generation. Authenticate
   every request with the actual application owner/admin session plus applicable
   platform gate; reject DEMO/staff/anonymous, cross-Site/revision, expired/revoked
   sessions and cross-origin writes. Do not trust a caller-supplied role/header.
   Bootstrap authorization must be separately configured, never a public bypass.
2. Create a durable transfer ledger keyed by destination + manifest SHA, with
   generation/CAS and bounded expiry. Accept one descriptor-pinned chunk per
   request (at most existing 1 MiB), verify length and SHA before durable storage,
   and acknowledge only after commit. Identical retried chunks return the same
   receipt; a different digest/size or unknown chunk fails. Status is paginated
   chunk-ID receipts so an interrupted uploader resumes only missing chunks.
3. Keep staged objects in an inactive transfer namespace; no partial company data
   becomes visible. Seal by bounded batches checking all declared chunks,
   resource coverage, ordering, schema/credential policy, full object hashes,
   current/history/image/role references. Missing, altered, unknown or conflicting
   members halt the generation and preserve its audit trail. Large JSON must use
   the existing streaming codec; never assemble the 8 GB snapshot in one request.
4. Activation is a separate owner action and fresh-target CAS after complete
   verification. Reconstruct R2 multipart objects/known formats without flattening
   required history, import the three business tables in bounded batches and
   verify whole-object/reference checks before a data-ready marker. R2 and D1
   are not one atomic transaction: the new target must remain unavailable until
   final reconciliation succeeds. Retain resumable state after interruption;
   no overwrite/delete cleanup is implicit. Keep authReady:false until separately
   authorized credentials and session signing are tested.
5. Validate Frank's independent test Site first. Formal data is a separate initial
   import from the approved R1 snapshot, with its own destination proof/ledger;
   never upload test-edited data to formal. Afterward normal development exports
   website data/images into isolated local snapshots; there is no automatic
   reverse upload. Program promotion and data movement remain separate actions.

The 8,143,387,205-byte snapshot size is not a D1 database allocation estimate or
a guarantee that a 10 GB plan suffices. Binding quotas, multipart/request/CPU
limits, staging overhead, history and cleanup retention must be confirmed for the
actual Sites targets before a true transfer. Only synthetic validation and the
previous local true-data audit currently exist.

## Minimal parent-controlled continuation

1. Resolve build prerequisites/native failure in a supported isolated environment;
   build exact reviewed source with pinned dependencies and retain safe client
   auth-boundary evidence. No daily port 3000 or original source is involved.
2. Confirm/create the already named private GitHub and two personal Sites; record
   exact IDs/remotes, audiences, independent bindings, limits/cost and who may
   access them. These are real remote writes, outside this child's current phase.
3. Confirm the exact independent signer/account-verifier bootstrap action without
   logging secrets; migrate/apply schema only to fresh independent targets.
4. Implement/test the protected staged importer above with fake data first, then
   obtain exact true-upload/activation authority. No true data upload is currently
   authorized to this child. Complete actual account/cookie/API/image/role and
   interruption checks on the test Site before formal publication consideration.

The child has not established build/runtime/login/publication PASS. Source
preparation, synthetic tests, real local data audit and platform acceptance are
four distinct evidence levels.
