# Native import transport: preparation, not hosted acceptance

The owner rejected the browser upload as the primary workflow on 2026-10-23.
Keep the existing 275,566,702-byte handoff and original snapshots unchanged.
Do not start a second uploader until the old browser sender is confirmed closed
and the last durable request/receipt has been reconciled. Never reset its lock.

## Evidence

At 10:37:37.792Z the deployed import `POST action=batch` returned 401 in 204 ms;
the following `GET action=budget-status` returned 401 in 209 ms. The log's transfer
ID is redacted/unavailable, so exact transfer correlation is not claimed. The
parent's durable ledger has 41 completed admissions (begin plus 40 batches),
581 charged R2 calls including the manifest, and no active request. The first
40 planned batches contain 580 chunks / 20,819,696 bytes. The next batch is only
271,992 bytes before framing. This boundary is not the first large-body request.
Login sessions have a fixed eight-hour expiry; expiration versus another invalid
identity cause cannot be proved without a user-facing fresh login. Do not read
the existing cookie or reset Frank's password to answer that question.

The browser uploader stops on this HTTP refusal, then tries a ten-second bounded
budget read and clears busy state. Its stop button is disabled when not busy.
Without the actual current DOM, an already-stopped error state is a supported
explanation for an apparently unresponsive stop button, not a confirmed UI fact.
File reading/hash/gzip are not cancellable mid-operation; request fetches have
an abort signal but no ordinary per-request deadline. Do not describe either as
the cause of the recorded 401.

## Local implementation allowed now

- `snapshot-native-source.mjs` reads only explicit handoff members from the two
  existing folders, bounded to 16 MiB metadata / 1 MiB chunks. It reuses all
  browser handoff pin, alias, checksum and incomplete-package checks. No payload
  copy, credential lookup or global fetch is installed. A trusted caller must
  provide the transport; this is not yet a usable authenticated remote CLI.
- A single batch's R2 puts use four workers within the same durable reservation.
  Every mutation still checks the existing durable fence. On failure, no new
  work is scheduled and already-started writes are awaited before budget failure
  handling. Receipts are written only after every put succeeds. No multi-request
  concurrency, extra budget, refund, deletion or changed activation rule.

## Authorization design requiring parent review before implementation

Sites native tools do not expose general business D1/R2 bulk import. Source Git
credentials are not data credentials. A standalone client needs BOTH:

1. A platform-supported route through the existing private Sites entry. The
   explicit native SIWC bearer-token operation can serve identity-less requests,
   but requires a user's specific request, creates/rotates a credential and may
   have broader entry scope than this import. Do not call it based on generic
   upload approval. No public-audience change is proposed.
2. A separately approved application import capability: random independent
   credential, exact project/origin/owner/target/manifest/transfer, short absolute
   expiry, only configuration/status/batch/verify/audit/copy/restore actions.
   No general identity, data export, account edits, retirement or activation.
   Authentication must fail closed if its pins, owner status/role/export permission
   or expiry are wrong. It must use the SAME budget/retirement/receipt service,
   not manufacture an owner session or use the session signing secret. Exact
   provisioning/storage/revocation and private tool-to-tool delivery need review
   before adding this new auth entry point. No real secret is generated now.

After approval, a CLI can consume both credentials through bounded stdin only,
retain them in memory, send exact-origin requests with redirects/cookies refused,
and redact errors to stable codes. No secret argv, files, console, source or
environment dump. One authenticated read-only handshake must prove both layers
before any data mutation. SIGINT/deadlines stop further sends; after an uncertain
write, bounded read-only reconciliation is required before an explicit resume.
No automatic retry for quota/payment/permission, auth or uncertain writes.

## Proposed capability protocol: NOT implemented or approved

Use no general OAuth/session replacement. The following concrete proposal needs
parent review before auth/schema implementation or any real credential issue:

- The official `sites_generate_siwc_bypass_token` accepts only project_id and
  returns a bearer token for `OAI-Sites-Authorization`. It creates/rotates the
  existing Site entry token; the old value may remain valid briefly. Its actual
  expiry, selectable duration, route scope, immediate revocation and automatic
  post-import removal are UNKNOWN from the current official tool contract. Do
  not call it short-lived, manifest-scoped or application-authenticated. The
  explicit user request required by that tool is still missing.
- Application credential: independent CSPRNG 32 bytes; propose a FOUR-HOUR
  absolute lifetime from explicit issue, no auto-renewal. Capability metadata
  pins project/origin/Frank owner/target/manifest/existing transfer and allowed
  actions. Runtime stores only its digest plus metadata in an import-only
  capability row. Raw credential reaches only the native issuer-to-client memory
  path, never argv/source/files/console. Do not use Frank's password or signer.
- Default actions: GET configuration/budget-status/transfer-status and scoped
  request-status; POST batch/verify/audit/copy/restore. Resume existing transfer
  only. No begin, retire/reset, delete, general export/read, account settings or
  activate. Activation requires a separate reviewed scope/action after full
  integrity and role/data acceptance, not implicit permission from data-ready.
- A future `authorizeImportCapability(request,pins,ownerEligibility)` validates
  credential digest, expiry, revocation, exact pins, current enabled admin/export
  eligibility and pinned authEpoch. It returns an import-only capability object,
  NEVER a platform session or trusted Sites identity header. This capability
  entry and the ordinary owner session both call the same transfer/budget service.
- Suggested durable metadata: an import-capability row holds ID/digest/pins/
  expiry/revoked flag/action scope/authEpoch. Append capability_id/client_nonce/
  request_sha fields and a unique (capability_id,client_nonce) index to the
  operational attempts ledger through NEW schema-only migration. Nonce admission
  must be atomic with the existing durable request claim. Do not change applied
  migrations or business schema. This schema design is pending review.
- Each mutation has a CSPRNG nonce and SHA-256 over canonical method, exact path
  and query, body digest and pins. Repeated nonce NEVER executes again, including
  a matching body: return a scoped receipt reference. A changed body/pin refuses.
  A read-only nonce status exposes only outcome/counters/receipt coverage. Nonces
  prevent request replay, not misuse by a thief holding a valid bearer credential;
  TLS, exact scope, expiry and revocation remain necessary.
- Revocation: mark the capability revoked in durable storage; check it before
  new mutation admission and at the same per-mutation fence points. Already-issued
  provider I/O cannot be recalled, so drain/reconcile it; do not claim revocation
  erased accepted bytes. Completion revokes the application capability. Platform
  entry-token cleanup is separate and needs a verified supported action.
- 401/403, expiry/revocation, quota/payment, conflict and uncertain writes stop
  the sender. Zero automatic mutation retries. Cancel/deadline sends no further
  mutations and uses fresh bounded read-only receipt calls; no lock reset. Resume
  requires a confirmed stopped previous sender, exact same pins and reconciliation
  of all relevant missing pages/nonces. Never count budget debit as uploaded bytes.

## Transport/CLI interfaces implemented locally

`createNativeTransport({pins,transferId,sendAuthorized,timeoutMs})` wraps an
explicit injected provider (none is installed). It allows only the exact HTTPS
origin/import path/pinned transfer, omits cookies, refuses redirects/ambient
credential headers and multiple concurrent requests, and bounds each whole
response to 64 KiB and 120 seconds. A failure freezes the instance; read-only
`reconcile({cursor})` returns scoped budget/page receipts without unlocking it.
Reconciliation uses at most two sequential ten-second GETs, separately from the
aborted user signal. Stopped/error progress is emitted BEFORE these lookups.
Page reconciliation deliberately reports exactLastBatchProven=false until a
future nonce receipt or complete relevant page coverage proves that result.

`runNativeImport(...)` requires explicit authorized provider + resume/write
options, read-only configuration handshake, then the existing batched uploader.
Activation is refused. On cancellation/failure it reconciles without the aborted
user signal, emits stable codes only, closes the transport and never auto-retries.
`snapshot-upload-native.mjs --inspect ...` is a read-only CLI; standalone --upload
explicitly refuses because secure native authorization is NOT implemented.
Existing fixed verified folders are read directly, no manual file selection.

## Performance and reliability acceptance

Compare serial and four-way writes with identical synthetic bytes and identical
per-operation delay. Require checksum/receipt equality, maximum four active
puts, one admitted campaign request, drained failures, no duplicate confirmed
chunk writes after restart, and an observable model latency reduction. Record
both virtual modeled and actual harness timings; neither is remote performance.
Test auth loss/expiry, disconnection/lost ACK, cancel/deadline during fetch AND
response reading, partial writes, duplicate sender, forbidden target/headers and
retained owner verifier. Do not advertise a remote speedup or completion time.
After review/auth approval, propose ONE bounded real missing-batch trial with
before/after durable receipts and latency/confirmed-byte evidence before bulk
resume. Stop at quota/payment/permission/auth/uncertain outcomes; no full retry.

## Remaining validation and live transition gates

Synthetic checks: exact bytes/pins, corrupt/missing/path/incomplete refusals,
bounded concurrency, failure drain, lost ACK, budget/fence races, origin and
capability expiry/scope/revocation, cancellation/deadline/readback, redirect
refusal, log/argv secret exclusion, owner verifier preservation and activation
remaining closed until full audit. Add required type/build/compiled checks for
the final reviewed version; fixture success is not native hosted acceptance.

Only after the browser is confirmed closed and no request remains: inspect the
same campaign's durable status/receipts, preserve confirmed chunks, and explicitly
resume missing chunks with the SAME pinned handoff. Never restart begin as a new
campaign or use budget debits as confirmed-byte progress. New auth/source changes
require review/PR and parent-coordinated publication before any live attempt.
