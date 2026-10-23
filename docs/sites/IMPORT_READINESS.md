# Post-login import readiness and recipe uploader

## Client correction

Login success still uses the existing account/password and session flow. The old
static business shell can load before the Worker gate, but its shared-state and
company data requests must remain unavailable until activation. shared-state.js
now marks only HTTP 503, application/json, error IMPORT_TARGET_NOT_ACTIVE as
importPending. bootstrap.js checks that flag before private preloads or script
execution and shows Chinese/Vietnamese pending-import text with fixed / and
/login top-level links. It does not claim that this response proves a valid
session; the import gate runs before business identity verification.

401/403, other 503 errors, malformed JSON, network failures and ordinary script
errors are not silently presented as maintenance. Existing drafts and recovery
are retained, no credential retries or automatic writes occur, and the hidden
business shell remains hidden while import is pending.

## Implemented uploader and limits

lib/snapshot-recipe-uploader.mjs accepts the existing verified normalized view's
manifest/readChunk port. It pins project/origin/target/owner/manifest, reads at
most one <=1 MiB outgoing chunk at a time, checks length/hash, uses paginated
missing receipts, and verifies server version/cursor progress. It does not copy
the payload store or rerun R1 conversion. A lost PUT acknowledgement is read back
before continuing; missing/uncertain acknowledgement stops rather than blindly
retrying. Explicit resume fills only missing chunks. Redirects, expired auth,
bad pages, changed pins, checksum failures and stale CAS refuse explicitly.

Restore orchestrates existing audit, materialization, row restore and activation
endpoints. Activation is a separate opt-in; ordinary restore stops data-ready.
The existing server preserves the target owner's configured verifier, updates
the consumed __processRecords / __processR2 references and bumps authEpoch.
Source credentials and employee passwords are excluded. After activation the
old owner session is invalidated; a fresh normal login is an expected final
validation step, not a reason to reset the owner's password.

Transfer status adds its existing ledger version so a restarted uploader can
use exact CAS. No migration, new token endpoint or authorization exception is
introduced. Every real request still needs the configured normal owner/admin
application session and master.export, plus the private Sites gate.

The controller requires an injected authenticated request function. It never
reads browser cookies/tokens, discovers passwords, logs in, creates credentials,
or falls back to ambient fetch. A source credential or Sites service-access
token alone does not establish application owner identity.

The protected /setup/import page now supplies the supported browser transport:
normal same-origin fetch with the existing HttpOnly application session. The
server checks exact configured owner, platform session, admin and master.export
before returning the nonsecret configuration. The program shell itself contains
no pins or file controls until that authenticated GET succeeds. Forged Sites
headers and staff sessions do not grant access. No cookie export, new credential or local relay is introduced. The
private platform gate remains. This code has synthetic/local acceptance only;
actual selected-file handoff and hosted upload remain untested.

prepare-browser-import.mjs opens the existing verified original and normalized
view and writes a NEW local handoff directory. Original alias chunks stay in the
original snapshot; only non-alias replay chunks are materialized, capped at
16 MiB total. This uses the already tested Node recipe codecs, including the
feedback ZIP writer, rather than inventing a browser codec or copying all media.
The selected real plan contains three table recipes, 2,031 aliases and three
small feedback ZIP recipes; non-alias logical bytes total 2,893,183. No true
handoff artifact has been written in this batch. The handoff contains company
data and must remain outside Git and shared/synced paths with the retained source.

The browser chooses those two explicit directories, verifies completion markers,
source/manifest/target pins and every outgoing chunk, and uses File objects of
at most 1 MiB per payload read. File access is selection-scoped and not persisted.
Without either a verified capacity or an explicitly enabled bounded attempt,
unknown capacity disables upload and the server rejects begin with
IMPORT_CAPACITY_UNVERIFIED. Nonsecret PROCESS_IMPORT_CAPACITY_JSON accepts
only approved metadata: projectId, targetFingerprint, reference, checkedAt,
r2AvailableBytes and d1AvailableBytes. It must come from actual recent provider
capacity/fee evidence; it is not a permission to guess values or enable billing.
This batch configures none of these live values.

## Approved bounded-attempt alternative

Progress text distinguishes local fixed-budget preflight from provider capacity
evidence: bounded success still says capacity is unknown. Activation status and
the visibility gate share the same target/budget-completion predicate; phase
active alone cannot report enabled traffic. Activation replies recheck after
durable budget release, without a second request using the invalidated old owner
cookie. The client result and success message honor that authoritative boolean.
An unresolved/stopped gate is described as restored but still unavailable.

PROCESS_IMPORT_ATTEMPT_JSON is a separate, default-absent policy. It must say
mode bounded-attempt and capacityKnown false, pin the one test project, origin,
Frank owner, target and normalized manifest, and include an approvalId and an
issuedAt/expiresAt window of at most seven days. It cannot coexist with the
verified-capacity variable. These are server settings, not client authority.
The verified-capacity mode and its evidence checks remain available.

Explicit ceilings are 17,917,940,289 cumulative R2 payload-write-attempt bytes,
30,000 R2 write calls (including multipart create/complete), 60,000 admitted
requests, 128 MiB of bound D1 import-write parameters and 100,000 D1 import
statements. A policy may lower, never exceed, them. The pinned plan must fit
before beginning. These are application attempt budgets, not provider remaining
capacity, physical allocated storage, network ingress/read traffic or a money
limit. Budget/auth/control-ledger overhead and provider metadata remain distinct.
No plan purchase, paid upgrade or automatic billing authorization is introduced.

Append-only 0003_sites_import_budget adds a singleton budget and request ledger;
previous SQL/snapshots/journal entries are preserved. Existing sites migrate
forward to 13 tables, without resetting the initialized owner or old data. First
admission rejects existing transfer ledgers or R2 objects, so a prior unmetered
upload cannot be adopted as a zero-cost attempt. Resumes use the same immutable
policy and counters; changing the approvalId/mode does not reset them.

One durable active_request serializes all mutating import routes across tabs and
Workers. Each R2 PUT/part and import D1 mutation is debited atomically before
execution. Failed/conditional/uncertain attempts are not refunded. Missing
acknowledgements after durable completion may be reconciled through existing
receipts; an exception during the request freezes the campaign. Quota, payment,
permission and unclassified storage failures stop further writes. If a Worker
dies or D1 cannot record the stop, the retained in-flight marker also fails
closed; there is no automatic expiry/unlock, reset, delete or cleanup endpoint.
Such a retained lease needs a separately reviewed reconciliation, not a blind
retry. Budget-window expiry stops new mutations without deleting partial data.

The existing hashes, semantic audits, CAS/restore and target-owner verifier
overlay are unchanged. Data-ready is still inactive. Even an active marker cannot
open business traffic while its final budget release is unresolved/stopped.
Public platform access and the separate formal Site are not enabled by this mode.

This source preparation does not configure a live attempt, upload true data or
claim platform acceptance. The selected real handoff remains outside Git; reuse
it without repeating the complete R1 conversion after reviewed publication.

## Read-only local preflight

scripts/sites-import-preflight.mjs takes these ordered pairs:

    node scripts/sites-import-preflight.mjs --source <verified-snapshot-directory> --source-manifest <sha256> --view <completed-normalized-view-directory> --manifest <normalized-sha256> --project <existing-project-id> --origin <exact-https-origin> --owner frank --target <target-fingerprint>

It checks the retained completion/plan/manifest receipts, opens the existing
recipe view and reports aggregate sizes. It has no remote request path and
does not create files, execute SQL or open a database. Plan opening reads bounded
scrubbed table chunks needed by the decoder; it does not rehash all 8 GB or
print rows, object names, media, account records or credentials.

The selected completed 10/14 rev496 view has 9,387 chunks, 2,034 R2 objects and
three table resources. Aggregate read-only preflight reports:

| Quantity | Bytes | Meaning |
| --- | ---: | --- |
| Serialized DB table resources | 1,810,926 | Not an allocated SQLite/D1 database size |
| Logical R2 objects | 8,141,576,279 | Includes retained current/history objects |
| Transport chunks plus manifest | 8,147,460,347 | Temporary namespace, in addition to materialized objects |
| R2 peak lower bound | 16,289,036,626 | Transport plus materialization, before owner/multipart overhead |
| R2 planning budget | 17,917,940,289 | Lower bound plus explicit 10%/at-least-1-GiB headroom |
| D1 planning budget | 46,741,432 | Four-times serialized rows plus chunk-ledger allowance; estimate only |

These are source-derived planning figures, not verified Sites quota, price or
guaranteed final database size. No history or duplicate reference is discarded
to fit a quota. Interrupted transfers and multipart state are retained; do not
delete them or assume they consume no capacity. Provider quota/usage must be
checked for this exact target and all retained objects before real upload.
The available native Sites tools expose table pages but no storage quota/billing
API. The Settings/provider capacity and fee evidence remains a parent/platform
prerequisite; do not assume 10 GB, a CF account plan or ChatGPT Pro supplies it.

Official [Sites storage limits](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites)
specify up to 10 GB database storage for each Site. File storage has no fixed
per-Site cap, but shared cross-Site usage/storage limits still apply; remaining
account allowance is unknown. This is managed Sites capacity, not the user's
own Cloudflare subscription. Imports should run serially, not duplicate the full
transport/materialization peak simultaneously across test and formal Sites.
The materialized R2 payloads for two equal Sites total 16,283,152,558 bytes;
serially importing a second Site while retaining the first requires at least
24,426,539,763 bytes plus that manifest and other overhead. These are planning
lower bounds, not a promise that the account can store them.

The underlying [D1 row/string/BLOB limit](https://developers.cloudflare.com/d1/platform/limits/)
is 2,000,000 bytes. Preflight additionally decodes only the three bounded table
resources, measures actual UTF-8 cells and conservatively serialized rows, and
reserves 4 KiB for the owner overlay. Oversize rows refuse before upload; no
row values are returned. These measurements do not establish the allocated
database size or replace the final target's storage validation.

## Smallest remaining real-import path

1. Verify exact test project, current program/runtime pins, normalized manifest,
   retained source/view receipts, bootstrap-disabled state and singleton owner.
   Do not read the owner's verifier into a client or conversation. Do not rerun
   the completed R1 conversion or replace the normalized manifest.
2. Choose verified-capacity evidence or the explicitly approved unknown-capacity
   bounded attempt. The latter does not require an unavailable provider balance;
   configure its exact pins and finite server budgets, never fabricated remaining
   bytes. Neither mode authorizes purchases or paid upgrades. Provider quota,
   payment or permission refusals stop the attempt and retain partial outputs.
3. After the reviewed source is published privately, use the protected desktop
   browser uploader with the existing owner session. Prepare the bounded local
   handoff once in an explicitly private NEW directory using the same ordered
   preflight arguments plus --output <new-handoff-directory>, with
   scripts/prepare-browser-import.mjs. Choose the retained original snapshot and
   this small handoff directory once. Do not choose an original ZIP, raw database,
   credentials folder or the unmodified recipe directory. No password reset,
   cookie extraction, temporary import token or persistent filesystem grant is
   needed. Actual directory selection/transmission must respect the existing
   specific data/target authorization; ask only for a genuinely missing action,
   platform quota/cost decision or required user file-selection gesture.
4. Once the transport, capacity/fees and exact data-transfer authority are clear,
   obtain the one necessary local-file/data-upload handoff and run begin, paged
   receive, bounded verify, semantic audit, materialization, restore and explicit
   activation. Server receipts/CAS are the resume authority, not a progress log.
   Preserve the new target-owner credential on the server. No password reset,
   browser cookie extraction, employee credential migration or auto-return from
   local development to production is part of this path.
5. Verify restored counts/current/history/media references, normal owner login,
   disjoint role access and private image/export denials. Only then ask Frank
   to validate the usable site. Public audience and the separate formal Site
   remain distinct actions. Do not ask him to repeatedly log into an empty app.

## Verification boundary

Focused client tests run actual shared-state/bootstrap sources in an isolated
DOM/storage fixture. Native checks fetch those compiled static sources and the
real compiled inactive response from nonpersistent synthetic D1/R2. Uploader
tests replay real normalization recipes against synthetic SQLite/R2 endpoints,
including interruption, integrity, wrong target, auth refusal and preserved
target credentials. File-object tests round-trip the local handoff and owner-page
tests reject anonymous/forged access and unknown quota. They do not establish
real platform quota, actual user file selection, live import or physical iOS behavior. Full type/build and exact-head
CI/source-history evidence are recorded in the task/PR, with reused evidence
identified separately. No true password, secret, data upload or live setting
is changed by this source batch.
