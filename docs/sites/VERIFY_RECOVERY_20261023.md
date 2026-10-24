# Stalled native verify: local fix and one-incident recovery review

Status: **local source / synthetic validation only**. No live writes, credential
operations, push, merge, deployment, copy, restore or activation in this phase.
The original Node host disappeared; its exit cause/cleanup remains unknown.
The source defect below is confirmed; it is not proof of the live stall's cause.

## Authoritative incident state

Read-only receipt last observed 2026-10-23 18:53:21 UTC:

- Site `appgprj_6ad9abaff47c8191846eb9821034696b`, saved version 5, source
  `4b3b7d4e7685cc8a6d9c3dd768fe449435e2a251`, private Frank-only.
- Transfer `35006091ac686b2d6288015904f45d74338752151975334b9c7da3b3c500853e`;
  manifest `326dc9372fab57554b96965c19815044d0cab6e6a28b6849f6d224c4906b7510`;
  target `c5311ad0524330b7c913757fc2dc54796ecd569f0b0755f6a3b31396c8d58e80`.
- All 1,401 upload ACKs / 275,566,702 bytes, but transfer is **receiving**, version
  **18**, committed verify cursor **272**. No audit/activation receipt.
- Active request `88eed174-82c1-4347-8427-7873c58bcd75`, nonce
  `c69cfd5d-522c-4646-b1d3-cf51488d006f`, action verify, running, generation 1.
  Request SHA `98644b5afff1ad2d432a1a22f45bdeaf58853aaa486f3bc9764211c5fd9296ca`.
- Budget open, active request retained; requests 157, R2 write calls 1,402,
  write bytes 276,216,440, D1 statement charges 9,461. These are reservations /
  charges, not proof of complete body verification. All 11 request GET intents
  settled at object-response time under OLD code; that does not prove hashing.

This document does not claim those observations are a fresh live read.

## Local source changes

`lib/snapshot-body.mjs` bounds consumption and SHA-256 by bytes and elapsed time
(10 seconds per body by default), observes AbortSignal, clears timer/listener,
cancels the reader and releases its lock. It never waits indefinitely for an
underlying cancel promise. Cancellation is best effort; provider cleanup cannot
be guaranteed by JavaScript. Hash completion after timeout cannot commit data.

Hosted transfer manifest/chunk/readback and incoming request bodies use this
reader. Request signal is threaded through normal and native dispatch. A verify
checks cancellation again before its cursor CAS. There is no new route or auth.

Native R2 GET intent stays pending through bounded body consumption and hashing.
`provider-body-sha256:<actual digest>` proves complete bytes read, NOT matching
the snapshot descriptor. Transfer code separately checks descriptor size/hash
before advancing the cursor. Timeout/cancel yields a failed read operation;
the enclosing request remains incomplete and its budget/lock stops. A PUT whose
readback fails remains unknown, because its write effect may already exist.
Absent / bodyless objects have explicit non-hash evidence.

The native get wrapper replays bounded bytes (up to 1 MiB per chunk / 16 MiB
manifest). This introduces bounded buffering, not whole-package loading. It
does not add retries, extend any grant, or weaken receipt expiry/revocation.
Raw provider header waits and D1 calls are not given a new wall-clock bound by
this patch; it must not be described as a global server-request deadline.

## Exact version proof and stopped-only CAS

`scripts/verify-recovery-20261023.mjs` is a module with **no CLI / HTTP route**.
`proveIncidentVersion()` recomputes the existing native request hash for the
exact pinned POST verify query `version=18` and empty body. It matches the saved
request digest above. Deployed `verify()` requires row.version equal to that
argument before reading the window, and `advance()` uses this captured version.
Thus the old handler's transfer CAS version is **exactly 18**, not a timeout guess.
The next window is c272..c287, ending at 288, if it completes.

`planIncidentRecovery(db)` takes a consistent read-only batch of exact transfer,
target, request, attempt, budget, capability metadata, all 11 operation proofs,
chunk count/byte sum, and absence of activation. It rejects drift or wrong pins.
The nonsecret before-image / snapshot digest must be retained before execution.
It contains no password, bearer or raw app key; no business rows are selected.

`applyIncidentRecovery(db, plan, {at})` is reviewable future maintenance code,
not invoked against the real target. One D1 batch checks every captured field,
then CASes version **18 -> 19 without changing cursor 272**, blocks the exact
request with the plan digest, stops its budget and attempt. Every update is
followed by an SQL assertion. A zero-match predicate deliberately raises a
malformed-JSON SQL error, rolling back the ENTIRE batch, including any earlier
updates. There is no partially committed unlock if a later statement fails.

This relies on documented [D1 transactional batch rollback](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
and [D1 JSON error behavior](https://developers.cloudflare.com/d1/sql-api/query-json/#error-handling).
Their combination was exercised with the existing in-memory SQLite D1 fixture;
actual hosted D1 recovery has **not** been executed or accepted.

If old advance wins first, the batch fails entirely and must be re-read / newly
reviewed. If recovery wins first, old `WHERE version=18` cannot advance. Existing
old request completion/failure statements cannot overwrite blocked/stopped state.
The procedure **retains active_request**, existing charges, capability, chunks,
operation proofs and historical requests. It never marks the request complete.
It does not clear a lock, reopen the campaign, delete data or revoke a grant.
A replay cannot pass the original running/version-18 preconditions.

## Smallest future live sequence (requires review / exact approval)

1. Review this patch and exact source fingerprint; follow normal PR/CI/merge and
   authorized Site source publication for the timeout fix. Preserve audience,
   session secret, Frank password, schema and business gate. No new schema is
   required for this local recovery primitive.
2. Fresh official read-only target/source check; verify original host absent,
   no second uploader, request/version/cursor/pins still exactly match. Save the
   bounded nonsecret plan before-image and digest. Drift means STOP/review, not
   changing constants to force a match.
3. Approve one exact control-table transaction against this Site's DB: version
   fence + blocked request + stopped campaign/attempt, with active_request still
   retained. On an uncertain response, read back the exact plan digest / version
   / states; never automatically reissue this mutation or discard the lock.
4. Separately review an exact request-specific restart transition, only after
   fence readback proves version 19/cursor 272 and retained charges/receipts.
   **No reopening/clearing function is included here.** That later transaction
   must pin this stopped request and plan digest, not create a generic unlock.
   The original in-memory app key was lost with the host. It cannot be recovered
   or reused; keep its one-use marker. Any new host/grant/entry-token operation
   needs its own explicit, scoped security decision, not an implicit extension
   of old T0 (write expiry 21:13:42.395Z / receipt expiry 22:13:42.395Z).
5. Under the newly approved bounded authority, read and hash staged c272..c287
   again; never infer progress from old GET intents. Advance once from the new
   fenced version only after all hashes pass; on failure preserve cursor 272.
   Reuse chunks; no payload reupload. Continue verify/audit only after the exact
   checkpoint is reviewed. Copy / restore / activate remain excluded.

## Validation limits

See task-root `verify-recovery-validation-20261023.json` for exact cases and file
fingerprints. Synthetic SQLite transactions, stream stalls, aborts, old/new CAS
orderings and retained accounting are evidence of local behavior. They are not
hosted D1 migration/recovery, actual R2 timeout, final semantic audit, browser
login, role QA, database restoration or website acceptance. The old 8 GB campaign
remains cancelled/retired and is never resumed by this work.
