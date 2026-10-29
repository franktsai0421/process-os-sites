本次獨立回報／小幫手工作： [隔離交付與 dot 整合事項](docs/web-feedback/20261029-isolated-helper.md)。分支 `codex/web-feedback-helper-20261029`；僅模組程式、專屬測試與文件，入口只更新 helper 快取版本。未 merge、未覆蓋任何 Site；公開預覽與 Draft PR 需要目前未提供的外部能力。建議 1–4 最新實作／32 組正常瀏覽器情境及仍失敗的 iframe 首幀診斷見交付末段；入口版本為 feedback5。下方其他工作的內容保持原樣。

# Isolated Sites implementation handoff

Current isolated performance candidate: [FQC readiness](AI_CONTEXT/modules/RUNTIME.md#2026-10-25-fqc-readiness-candidate-not-published).
Built from reviewed merged PR 24 commit `0620d0b7bca29888045a868ca027bf27c8baf9dc`
(tree `b989908f163345c75bce0f6adbf9f969f1d08e91`) without changing the release
checkout. The baseline sequential loader and a narrow active-equipment GET reduce
unneeded hydration, with actor/generation/event fences and no new client
permission round-trip or all-module revision retry barrier.
This candidate has not been pushed or published; full-page navigation is
unchanged. Exact local candidate commit/check receipts are retained by the task. All-major-pages persistent-shell design remains a separate material
lifecycle decision, not completed by this first bottleneck fix.


Current cloud-only candidate: [asset delivery read repair](AI_CONTEXT/modules/RUNTIME.md#2026-10-25-sites-圖片讀取候選未發布).
The frozen nine-file local handoff was hash/base-blob checked against Site source
`dbe84ce7b46c52f099df2be60136ec3970e0eb14` (reviewed GitHub baseline
`3f3b5594ae2103b782762809aaae6ef8fb2c26e3`). Cloud is the sole source writer;
the workstation task remains stopped. Exact producer fragments, bounded visible
asset scans and version metadata reads retain existing permission/adoption and
CAS fences. Compatibility and failed-body cleanup regressions were added during
review. Build stamps identify the reviewed baseline, not these uncommitted
changes. No commit/push/package/deployment or live data/session transfer occurred.
Synthetic checks are not live image, latency, memory or full owner/staff acceptance.
Historical phase notes below retain their original evidence boundaries.

Current local follow-up: [verification control cost](docs/sites/VERIFY_CONTROL_COST_REVIEW.md).
Three synthetic restricted GETs now execute 74 rather than 128 SQL statements;
fresh per-I/O authority/fence checks and all writes are retained. This patch is
uncommitted and not deployed. It does not implement version-19 recovery.

The [one-shot c273 observation](docs/sites/C273_OBSERVATION_20261024.md) was deployed
as private version 7. The owner observed matching 14,234 bytes/SHA in 675 ms;
the durable singleton receipt is retained. Observation was closed in env revision
14, deployment appgdep_6adc348aee848191a25e951c028f20a3. Recovery remains OFF.
Original request 787e1f35 remains unknown at version 19/cursor 272, with the lock
and charges unchanged. All payloads remain staged; no business restore/activation
occurred. Current readability does not establish the historical failure cause.
The preparation paragraphs below are historical, not current publication status.

Latest local follow-up: [restricted incident verification protocol](docs/sites/VERIFY_INCIDENT_PROTOCOL_20261023.md).
The default-off HTTP entry, separate persistent verify/audit scope and same-process
host are implemented locally. Evidence: 21 initial unit/schema, 6 compiled HTTP
and 7 local workerd-D1 probes pass; a subsequent delayed-owner expiry test passes
individually. The previous 34 were not rerun after that narrow fix. The final
build/type receipts and exact file hashes are recorded in the task-local final
review handoff. The build stamp is a real
ancestor, not a commit for these uncommitted changes. No true credential, source
push, live schema/control-table change, deployment or real recovery occurred.
The original [planner rehearsal](docs/sites/VERIFY_RESUME_DECISION_20261023.md)
is historical evidence, superseded for implementation status by this protocol.

Latest local-only incident work: [stalled native verify recovery](docs/sites/VERIFY_RECOVERY_20261023.md).
All 1,401 payload ACKs exist, but last observed committed verify cursor is 272;
the original host is absent and no online recovery was attempted. Bounded body
consumption / intent proof changes and an exact stopped-only CAS are prepared
for review. No lock release, credential renewal, deployment or activation is implied.

Current local preparation: [native import transport](docs/sites/NATIVE_IMPORT_PLAN.md).
The owner closed the stalled browser sender. A read-only 10:56:30Z live receipt
still showed open/no active request and unchanged counters. Native source reading
and drained four-way within-request writes are local changes only; the new
application capability/private Sites entry design awaits parent review. No new
credential, source push, deployment or resumed business transfer is implied.

The same branch now includes a Node CLI preflight/runner structure and guarded
injected transport. Cancellation/deadlines freeze further sends and perform
separate bounded read-only reconciliation; no provider, credential intake or
new hosted auth route is installed. See the proposed capability/nonce/revocation
protocol and explicit unknown official Sites entry-token lifetime in the plan.
The owner wants fixed-folder automatic import, not renewed browser file picking.

Stage-two photo work extends the portable lossless-first policy to process
editor and feedback uploads. Technical dimensions/alpha and existing JPEG/WebP
remain; no repeated lossy canvas pass. An offline new-copy converter rebuilds
image/JSON/private-index/ZIP references with independent pixel verification.
See [current photo policy](docs/sites/PHOTO_UPLOAD.md) and exact task receipts;
earlier startup-EACCES checkpoints below are historical. One formally reviewed
same-executor run connected and reached five native groups; the invalid-body-
length fixture is corrected for the final compiled run. No live import/deploy.

Photo work is saved on `sites/unified-photo-policy`, with no source push or live
change. [Shared photo policy](docs/sites/PHOTO_UPLOAD.md) records 19 helper plus
19 route fixture checks and the compiled-runtime startup EACCES blocker. Do not
retry that connection by changing permissions/executor. Owner reports current3000
unchanged; 13 fixed business source files match M1. No live DB comparison is
claimed, and old backup dates alone are not evidence of changed data.

Current work: [cancelled campaign quarantine](docs/sites/CANCELLED_IMPORT.md).
PR6 operational batching merged; a later approved retirement action archives old
control values without deleting staging or using cancelled progress. Keep source
validation separate from live retirement. User now requires program/data parity
with current3000 before activation; R1/rev496 cannot establish this. Browser and
current workstation connector are unavailable; never reconnect or retry refused
D-drive Git/CIM actions to fill that evidence gap. Media inventory/compression
evaluation remains local and does not alter originals or authorize old-data use.

Current work: [operational import preparation](docs/sites/OPERATIONAL_IMPORT.md).
The owner cancelled the full R1 transfer. Do not resume or activate that transfer,
reset its budget marker or delete its staging. Prepare a separate offline view
that retains current business dependencies/all media and leaves global backups
in the original local source. Actual slimming audit/progress/batching results
are separate from the earlier full-package CI and live version 3. The offline
candidate audit passed; bounded transport and receipt-backed UI are implemented
in this branch. Hosted acceptance/old campaign disposition are not implied.

Current work: [post-login pending import and recipe upload readiness](docs/sites/IMPORT_READINESS.md).
Incremental progress correction retains unknown capacity wording and shares the
authoritative traffic gate with activation-status/final reply; the client never
turns phase active alone into enabled success. No storage/auth guard is relaxed.
The client recognizes only the exact inactive-import refusal before preloading
private scripts. A recipe-backed resumable upload controller and read-only local
preflight reuse the completed normalized view. A protected owner-only browser
uploader now uses the existing same-origin session and a bounded local replay
handoff instead of cookie extraction or a new credential. Provider quota and real
file/transfer acceptance remain unverified. The verified-capacity mode remains;
an explicitly approved bounded-attempt mode now keeps capacity unknown and uses
durable server admission/counters rather than fabricated remaining quota. An
append-only migration adds two control tables; no owner password, signer or live
setting is changed by source preparation. Exact checks
and the current PR/merge are recorded in the task; do not treat source readiness
as successful live data import.

Current work: [inactive root entry](docs/sites/ROOT_ENTRY.md). Known inactive
GET/HEAD / renders a bilingual HTML entry shell instead of the data-gate JSON.
Database failures, other methods, APIs, Worker-handled business routes and images retain the
closed gate. No auth, secret, data or live platform setting changes. Exact local
and CI evidence remains in the task/PR; Frank merges before any publication.

Retained owner/source context: [private-test owner setup and pinned source main](docs/sites/PHASE_TWENTY_THREE_OWNER_SETUP.md).
The default-off owner initializer appends a schema-only one-time receipt table;
source guard changes are reviewable source only. Existing installed hooks and
platform settings remain unchanged. Real owner/signer/source access/publication
still require their precise actions. Frank reviews and merges the new PR.

Current source delivery: [source-only PR validation](docs/sites/PHASE_TWENTY_SOURCE_ONLY_CI.md).
The new private repository README root is joined without rewriting the derivative
history. The work branch's CI no longer requires an unpublished canonical data
package. Frank alone performs the final merge; this is not Site publication.
Exact new local/CI results and PR head are recorded in the parent task and PR.

Base M1: `7f5dc57239d6db483f096d96df6bd6cdd7357f5a`.
Current phase: [normalized initial import](docs/sites/PHASE_EIGHTEEN_NORMALIZED_IMPORT.md).
Phase eighteen adds recipe-backed content-address reconstruction, actual consumed
record/R2 owner storage adapters and a source-only fresh-migration projection.
Source-specific validation receipts remain outside the checkout. Platform/source
push, real credentials and live import remain separate and unaccepted.

Historical phase seventeen follows:
The selected test project ID is now preserved. New default-off protected initial
import, durable chunk/semantic/copy/restore/activation ledgers and the separate
schema-only fresh-target migration candidate have synthetic checks. Explicit
numeric options repair the two TS2353 errors without weakening CAS. Post-import
export recognizes only the reserved transport V1 namespace; unknown layouts fail.
Latest receipts are phase-seventeen files outside source, with real source/commit
pins. Real credentials/data/platform remain untouched and unaccepted. Source main
guard and adoption of fresh migrations still require a platform-source decision.

Historical phase fifteen: [Sites source and release handoff](DEPLOYMENT.md).
Last application build and compiled synthetic HTTP acceptance use commit
`efaedbd4893347a968b65cfa237358ffa8821316`; this source-delivery phase changes
documentation only and reuses those explicitly versioned results.
Hosting manifest has only DB/STATE_ARCHIVE bindings and no project_id. Installed
Sites 1.1.1 portable helpers and Windows tar are present; remote work has not run.
Parent-controlled creation must return the real project ID/source branch first.
An existing main-push guard may conflict with a returned main source branch;
preserve it and resolve the exact source workflow before pushing. The historical
0002 empty-singleton INSERT needs a schema-only fresh-target migration strategy.
Protected hosted resumable import and real account/bootstrap remain unimplemented.
The current source archive/manifest/safety receipt live outside the checkout in
the parent task's phase-fifteen handoff directory. A source ZIP is not a Sites
publication archive. No platform ID, credential, real data or remote action added.

Previous phase: [offline runtime configuration fix](docs/sites/PHASE_FOURTEEN_OFFLINE_RUNTIME_FIX.md).
The native outbound network-service object reproduced the probe crash on this
host; a supported deny-all callback fixes startup while preserving both Worker
and Node outbound denial. Shared guard native cases 3 PASS; full password/D1/R2/
HMAC probe 8 PASS. Actual compiled application development fixture 12/12 PASS
against the retained deb0e90 build, with synthetic/nonpersistent DB/R2/users only.
Final commit, fresh build and fresh application HTTP receipts are kept separately
in the parent task with actual commit fields; do not conflate those versions.
No true credential/data/platform acceptance or remote action. Existing R1 remains
unchanged. The old native failures and negative reductions remain evidence.

Historical phase-twelve checkpoint:
Fixed-lock install: 567 packages, exit 0; no lifecycle or package/lock change.
Full TypeScript: 0 diagnostics after the private IQC baseline source repair
(5 synthetic cases). Socketless native workerd: 1 basic + 4 password/HMAC PASS.
Miniflare serve still fails; direct workerd listener reaches ready, but an owned
Node loopback diagnostic proves connect EACCES. Network tests stopped; no elevated
retry. Real derivative commit remains parent-owned; no fake SHA/build bypass.
Current source freeze/diff/handoff: parent-task phase-twelve JSON receipts;
.npmrc and held legacy files are excluded without rereading. No true data changed.

Historical phase-eleven checkpoint:
Build prerequisite refused the missing reviewed derivative commit; no compiler
started and no dependency installation occurred. One distinct synthetic-only
Miniflare operation encountered native workerd failure (`ERR_RUNTIME_FAILURE`),
zero cases reached; it was not an old C1/observer retry. Source-boundary 4 and
affected security 18 checks pass; scoped types/syntax have separate receipts.
No actual application login, account configuration, Sites or release acceptance.
Current source manifest/delta: parent-task sites-source-freeze-phase-eleven.json /
sites-source-diff.phase-eleven.json. Handoff allowlist excludes three held legacy
package scripts without reopening them; it is not an uploaded/full legacy bundle.
The phase-ten source-backed stage remains; no full true snapshot was copied.

Accepted true-data checkpoint: [phase nine](docs/sites/PHASE_NINE_TRUE_R1_LOCAL.md).
The owner chose ordinary inherited E permissions and confirmed no sync; do not
request protected ACL approval again or claim the directory is ACL-private.
The real conversion is COMPLETE: session 78719 exit 0; source checks and full
9,387-chunk / 8,143,387,205-byte readback/reference audit pass. COMPLETE and
CONVERSION-VERIFIED exist; INCOMPLETE/FAILED do not. Parent report:
sites-r1-real-conversion-03.json. Data-only acceptance includes 100 histories,
14 identities/3 roles and 304 private image mappings; authReady remains false.
No SDK, runtime, true login, GitHub/Site or publication acceptance. Conversion's
exact source pin/delta: sites-source-freeze-phase-nine.json / sites-source-diff.phase-nine.json.

Historical phase-eight checkpoint:
Real selected archive size/hash and ZIP directory pass; real metadata contract
passes after an observed typed header extension. Full real conversion has NOT
run: exact new E private-directory ACL confirmation is pending, and no real-data
output exists. Added synthetic checks: strict parser 13, ZIP reader 8, read-only
audit/staging 5 PASS. No SDK/DB/runtime/platform acceptance. Continue using the
exact blocker/receipt instructions in phase eight; never fabricate permission.
Current source pin/delta: parent-task sites-source-freeze-phase-eight.json and
sites-source-diff.phase-eight.json. Schema and lock remain unchanged.

Historical phase-seven checkpoint:
Strict confirmed-contract synthetic cases: 12 PASS; affected logical bridge 10,
adapter 20, mixed formats 10 and account/role/media 18 PASS. Scoped compiler:
0 diagnostics (`checkJs:false`). Source pin/delta: parent-task
sites-source-freeze-phase-seven.json / sites-source-diff.phase-seven.json.
The schema-contract parser gap below is resolved for the known profile only.
Outer delivery ZIP reader, true R1 conversion, real credentials and runtime/
platform acceptance remain unverified; no real-data phase started.

Historical phase-six checkpoint:
New normalized-member bridge/configuration fixtures: 10 PASS; affected adapter:
20 PASS, format integration: 10 PASS, account/role/media: 18 PASS; scoped types:
0 diagnostics (`checkJs:false`). The real R1 descriptor parser is stopped pending
one de-identified schema contract; no real package/runtime/platform work occurred.
The earlier [static freeze](docs/sites/PHASE_FIVE_STATIC_AUDIT.md) is historical;
use parent-task sites-source-freeze-phase-six.json for that historical source pin.
Large JSON, known feedback STORE ZIP and legacy chunked v1 are connected to
export/transport/isolated-local restore with synthetic verification. Mixed
integration: 10 PASS; adapter: 20; account/role: 18; JSON codec: 8; ZIP/chunked
codecs: 4 each; scoped types: 0 diagnostics (`checkJs:false`). The outer R1
delivery ZIP is not a direct snapshot input. Full R1, runtime, authentication
provisioning and publication remain unverified.
Read [phase one](docs/sites/PHASE_ONE.md) and the parent task's copy, fixture,
type-check and diff evidence before continuing. This source-only copy does not
represent the running 3000 version and must not reconnect the old C2C workflow.

Test audience intent: Frank only. Formal audience intent: public login entry,
application-authenticated business data. No Site registration/sharing/deployment
has happened. Local derivative commits are recorded in the parent-task receipts;
the statement above does not prohibit the already approved local source commits.
The old R20/G3 work and refusal boundaries remain
separate and unresolved.
# Photo optimization in the independent derivative

Six authenticated photo routes share a bounded lossless PNG upload baseline;
see [policy and verification](docs/sites/PHOTO_UPLOAD.md). Other formats retain
their bytes; no original media or candidate is rewritten. This local source
work does not establish current3000 parity or authorize publication/import.

PR8 review correction: offline photo references are resource/module scoped;
unchanged feedback attachments no longer share bare-digest rewrites. Existing
optimized targets require order-independent byte/hash/full business metadata
equality. Nineteen synthetic copy cases and affected codecs cover these rules.
The prior local candidate is retained but requires a corrected JSON-reference
handoff; no live upload or activation is implied. See PHOTO_UPLOAD.md and the
parent-task photo-review-real-audit-20261023.json receipt.

# Native staging importer: local implementation, live HOLD

The `sites/native-import-transport` branch adds default-off capability/nonce/
operation metadata and an explicit pipe-only CLI using the existing fixed
handoff directories. See [current native contract](docs/sites/NATIVE_IMPORT_PLAN.md)
for the three-table migration0005, <=4h write/<=5h receipt windows, baseline
readback, unknown-effect rules and exact staging-only scope. No live schema,
credential, upload, audience, owner password or deployment has changed.
Security architecture requires independent review and informed per-action
credential approval before enabling. Copy/restore/activate are excluded.
