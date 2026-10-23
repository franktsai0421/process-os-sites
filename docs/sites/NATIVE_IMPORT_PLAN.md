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
   credential, exact project/origin/owner/target/manifest/transfer, explicit write
   and receipt-read expiry, only configuration/status/batch/verify/audit actions.
   No general identity, data export, account edits, retirement, business-object
   materialization, business-table restore or activation.
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
- Application credential: independent CSPRNG 32 bytes; propose FOUR-HOUR write
  authority plus a separately disclosed ONE-HOUR receipt-only window (T0+5h
  absolute receipt expiry), no auto-renewal. This is NOT a four-hour expiry of
  the entire credential. Full revocation denies BOTH writes and receipt reads;
  after that use an independently authorized owner/admin diagnostic route, or
  report receipt unavailable and stay stopped. No unscoped read exception.
  Capability metadata
  pins project/origin/Frank owner/target/manifest/existing transfer and allowed
  actions. Runtime stores only its digest plus metadata in an import-only
  capability row. Raw credential reaches only the native issuer-to-client memory
  path, never argv/source/files/console. Do not use Frank's password or signer.
- Default actions: GET configuration/budget-status/transfer-status and scoped
  request-status; POST batch/verify/audit. Resume existing transfer
  only. No begin, retire/reset, delete, general export/read, account settings or
  copy, restore or activate. Materialization/restore/activation require separately
  reviewed scopes and explicit user decision after full
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
It stops at integrity-verified STAGING, with dataReady=false. Native default scope
refuses copy/restore/activate and activation-status; it never calls the ordinary
owner library's restore method. The ordinary owner/session import route is not
changed by this restriction. On cancellation/failure it reconciles without the aborted
user signal, emits stable codes only, closes the transport and never auto-retries.
`snapshot-upload-native.mjs --inspect ...` is a read-only CLI; standalone --upload
explicitly refuses because secure native authorization is NOT implemented.
Existing fixed verified folders are read directly, no manual file selection.

## Parent review response: remaining blockers, 2026-10-23

1. **Platform entry credential:** current native catalog offers creation/rotation,
   no distinct revoke/disable operation. The official Sites developer/help pages
   checked do not document a narrower entry credential or definite expiry/revoke
   controls. This means rotation is the only operation VERIFIED IN THIS TOOLSET,
   not a claim it is the platform's only possible option. Old-token overlap means
   rotation is not immediate revocation, and a replacement bearer still exists.
   No custom broker is proposed. The user must decide this disclosed residual
   risk if no supported narrower route is established. No token was generated.

2. **Partial effects:** receiveBatch currently writes chunk receipts only after
   ALL puts return success. The manifest's per-chunk size/hash and immutable
   conditional keys can prove an object's contents through bounded GET+hash, but
   do not persist the fact an unacknowledged operation was admitted. A missing
   receipt/object is not proof an issued provider request cannot finish later.
   The current implementation is therefore insufficient for automatic recovery.
   Proposed intent records (not implemented) pin capability/nonce/op index/key/
   bytes/hash/metadata/request generation BEFORE I/O. States retain pending,
   succeeded, definitively-failed and unknown. Generic throws/lost replies become
   unknown, never definitively-failed. A replayed nonce returns original state
   only. Two inconclusive reads keep writes stopped; no timer-based lock reset.

3. **Fences and settlement:** current per-put debit validates attempt policy
   expiry and active_request/policy_sha/state. It does NOT re-read owner role,
   capability expiry/revocation or a capability generation; those require the
   reviewed protocol. Future admission checks all those pins plus campaign/lock
   generation before each provider operation. Already-admitted I/O may settle;
   metadata receipt finalization uses an immutable admitted-operation context and
   exact generation CAS, not a fresh permission to issue I/O. It must be possible
   after write expiry, without permitting another put. Current run() performs a
   post-execute expiry check and metered receipt writes also validate expiry;
   this is a known gap, not an already-solved guarantee. No change is made to the
   live budget rules before schema/auth review.

4. **Read authorization and deadlines:** a write-expired credential can read
   receipts only during its EXPLICIT approved receipt window. Full revocation or
   receipt expiry denies it. A 120-second write deadline can be followed by up
   to TWO ten-second reads: maximum 140 seconds for that failure path, while
   stopped/error progress is emitted immediately. A receipt read failure does
   not unlock or retry anything. The two reads are a bounded diagnostic page,
   NOT proof every pending provider effect was reconciled.

5. **Side effects:** audit writes operational activation/resource-audit metadata
   and pins the current bootstrap row; it does not restore business tables.
   copy writes actual R2 business names (resource.name.slice(3)), including
   snapshots/state-records/company assets, OUTSIDE process-import/v1. It can affect
   keys referenced by business data even before activation. restore writes
   state_backups and web_feedback_store business history/feedback rows (not the
   current platformUsers row); preserving the company gate is not equivalent
   to having no live data effect. activate writes shared_state/active references
   and retains the target owner verifier with changed authEpoch. All three are
   outside default native staging authority and need a later user decision.

6. **Provider accounting/retries:** current reservation debits the entire batch
   upper bound before its puts, including unused quote after a failure. It is NOT
   an actual-completion counter. Proposed per-operation intent/cost records cover
   every binding invocation (including conditional puts, readback reads and any
   multipart operations), with reserved/admitted/confirmed/unknown distinguished.
   A crash between durable admission and binding invocation remains conservative
   uncertainty, not an exact physical-call count. Never refund unknown effects or
   infer physical billing counts from chunks. The application uses direct Worker
   bindings and has no third-party R2 SDK retry loop. Official D1 docs say writes
   are not automatically retried (read-only queries may retry twice). The R2
   binding reference does not establish underlying transport retry behavior, so
   hidden physical attempts are UNKNOWN, not certified absent. Forty completed
   batches/active_request=null alone cannot replace intent/object reconciliation.

Evidence: lib/snapshot-hosted-transfer.mjs receiveBatch/immutable/chunk;
lib/snapshot-hosted-activation.mjs audit/copy/restore/activate;
lib/snapshot-attempt-budget.mjs live/debit/reserve/run; native tool descriptions.
Official references checked (no token values):
https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites
https://learn.chatgpt.com/docs/sites
https://developers.cloudflare.com/d1/observability/debug-d1/
https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

Auth/schema, intent reconciliation and expiry-safe settlement need independent
review and informed user approval. These are HOLD conditions for real transfer;
ordinary PR permission does not approve them. Local code currently only narrows
native staging scope and tests its lack of business side effects.

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
