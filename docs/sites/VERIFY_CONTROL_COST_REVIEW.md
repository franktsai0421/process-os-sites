# Verification control cost: local review, 2026-10-24

Status: local implementation and synthetic validation; not committed, published,
or permission to recover the live version-19 incident.

The one-shot live c273 observation matched 14,234 bytes and its pinned SHA in
675 ms. Its singleton receipt is retained. Observation and recovery are OFF.
This proves current object readability, not the cause or success of the earlier
unknown request. Live cursor 272 and its lock remain authoritative.

## Minimal change

- Read the maintenance row and four continuation records through one LEFT JOIN
  snapshot, retaining every original predicate and rejecting missing rows.
- Read the native request and budget fence through one JOIN. Keep every existing
  check before admission, provider dispatch, and metadata completion. No cache.
- Compare manifest/chunk descriptors against the digest already computed by
  consumeImportBody. Body limits, cancellation and deadlines are unchanged.
- Keep all writes, costs, unknown outcomes, operation receipts and CAS unchanged.

The same three-GET synthetic restricted-authority probe measured 128 statements
before and 74 after (54 fewer, 42.1875%). Five batch groups are already included
in those statement counts. Subsequent GETs add 18 rather than 33 statements.
These are local statement executions, not remote latency, billable operations,
or proof of hitting a platform quota. No production speed claim is made.

The targeted control-cost suite checks settlement failure before apply and lost
ACK after apply, missing joined records, changed pins/cursor/generation/budget
fences and grant revocation after admission. It also checks that transfer-layer
manifest/chunk hashing falls from four digests to two for one verification step,
while corrupt bytes still fail without cursor advancement. The preexisting
native-intent and incident-recovery suites retain expiry, nonce and rollback
coverage. CI includes the new suite; no CI run has been started for this patch.

Final local validation: 72 targeted synthetic cases passed (15 control-cost,
11 incident-recovery, 28 native-intent, 18 hosted-transfer), full TypeScript
checking and the actual build passed. Six compiled D1/HTTP synthetic groups
passed at 2026-10-24T04:46:34.456Z and disposed their isolated runtime. Those
groups cover authorization, atomic rollback, restricted scope and a deliberately
invalid pinned manifest; they do not claim acceptance of true R1 data. The build
uses base commit 3b65f6d73d0376d136a6b9a1faecef4bd311ffec plus this uncommitted
patch; that commit alone does not identify the changed source. No remote CI or
live verification was run for this patch.

## Exact version-19 recovery proposal (not implemented or executed)

Do not reuse the completed version-18 plan or reset its maintenance singleton.
Fresh-read transfer 35006091ac686b2d6288015904f45d74338752151975334b9c7da3b3c500853e,
manifest 326dc9372fab57554b96965c19815044d0cab6e6a28b6849f6d224c4906b7510,
version 19/cursor 272, unknown request 787e1f35-5e06-4db9-a9f9-cc5fc61b8670,
its three operations, restricted grant, active request, and all current charges.

A separately reviewed, exact-incident atomic transaction would have to invalidate
the old transfer version (19 to 20), revoke the old restricted authority, and
record a distinct supersession receipt without rewriting the old unknown request
or operation. Preserve cursor 272, all staged chunks and every historical charge.
Only that successful transaction may release this exact active request for a new
verify/audit-only authority. Any drift or old-handler advance must roll back the
whole transaction; unknown transaction outcomes require readback, never replay.

The existing continuation rule is pinned to version 19, and cannot safely accept
that new version without a reviewed exact-incident adaptation. Its receipt and
authority binding must be designed together; this document does not introduce
an unlock endpoint, table, migration or generic recovery framework.

After deployment and explicit live recovery/credential approval, rehash the
window starting at 272 before advancing; a clean first-window receipt is required
before continuing. No payload upload, business copy/restore/activation, password
change or audience change is part of this proposal. The current unknown result
remains unknown even if subsequent verification succeeds.
