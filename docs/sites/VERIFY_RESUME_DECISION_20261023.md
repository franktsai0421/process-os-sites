# Exact verify incident: local resume rehearsal and live decision

Historical planner checkpoint. The subsequent local HTTP/runtime/host implementation
and current evidence are in [the incident protocol](VERIFY_INCIDENT_PROTOCOL_20261023.md).
Statements below about missing implementation describe this earlier checkpoint,
not the current worktree. No live recovery has occurred in either phase.

Status: **local-only**. The six-case probe passed on a local workerd D1 binding
created by the compiled application fixture. No live SQL, grant, credential,
source push, merge, deployment, R2 upload, restore or activation occurred.
See [the hold contract](VERIFY_RECOVERY_20261023.md) for the fixed incident pins,
version-18 proof, original observations and stopped-only transaction.

## What was completed

- Actual build passed, including the existing post-build auth/client check.
  Build stamp is the real reviewed ancestor `5b43a376b70fd12585e49c5cf48349db1a378a6b`,
  NOT a new commit for these uncommitted changes. Review uses the genuine Git
  diff relative to merged baseline `d0d664e734a40d542655db0809970d8c76cacde8`
  plus file fingerprints; no fingerprint is substituted for a commit SHA.
- `tests/sites-verify-recovery-d1-probe.test.mjs`: six cases passed against
  nonpersistent local workerd D1, all storage synthetic and outbound denied.
  It exercised the actual SQL batch assertions, rollback, both CAS orderings,
  late-statement rollback, maintenance/resume planning and expired/drift refusal.
  It imports the incident modules in Node and calls the D1 binding. It does NOT
  prove a compiled maintenance HTTP route (there is no such route).
- `scripts/verify-resume-plan-20261023.mjs` plans two incident-only transactions.
  It executes neither. Both builders return prepared statements for review;
  no CLI, arbitrary SQL endpoint, token generator or environment updater exists.

## Local stopped -> maintenance -> resume SQL model

The planner takes the retained hold before-image/hash and a new PUBLIC grant
template (digest only), a reviewed source commit and server-supplied time. It
requires version 19 / cursor 272, exact original pins/request/nonce, the blocked
hold reason, stopped budget with the old active request, all original charges,
old capability generation 1 / not revoked, unchanged operations/chunk count/bytes,
and no activation. New ID/digest is distinct, owner epoch is fixed at 0 (a changed
owner requires review, never a password overwrite), and request/operation limits
are exactly 1,000 / 20,000, within the unchanged campaign budget.

The public plan binds all those fields, the new grant's original T0, at most
4-hour write / 5-hour receipt lifetime, required runtime mode
`incident-verify-audit-only-v1`, and its reviewed source commit. `liveReady:false`
is permanent in these offline builders; it is not an authorization credential.

Maintenance batch: reassert the complete hold state, append the hold/plan hashes
to the exact blocked request reason, change only the stopped budget reason to
`IMPORT_VERIFY_MAINTENANCE:<plan hash>`. Active request, cursor, version, charges,
all capabilities and payloads remain unchanged. No key is enabled here.

Resume batch: reassert the full maintenance before-image and absence of the new
capability; use a fresh server time inside the original write window; atomically
revoke ONLY the old import capability (generation 1 -> 2), insert the new digest
record, append the resumed plan hash to the still-blocked old request, reopen
the campaign and clear ONLY its exact old active request. Every mutation has a
SQL `changes()=1` assertion and whole-batch rollback. It changes no cursor or
version, refunds no charges and preserves old operation/history rows.

The new record captures 1,401 chunk receipts and baseline version 19 but keeps
`baseline_verified=0`, `baseline_checked=0`, `baseline_cursor=0`. It does NOT
pretend all staged bodies were read back. The actual committed verification
cursor remains 272 and is the starting point for the next hash window.

## Mandatory runtime restriction NOT yet implemented

Do NOT execute the resume batch with the existing generic native handler.
That handler requires baseline verification and supports reconcile/batch actions;
using it could trigger unnecessary full baseline reading and later allow PUTs.
The following small, exact-incident restriction must be separately approved,
implemented and reviewed before any live resume:

1. Bind the expected new grant ID, all pins, hold/plan hashes and reviewed source
   commit to a server-owned recovery configuration. Check the persistent resumed
   marker before each admission. Client-supplied mode/source/time is not trusted.
2. For that grant allow only configuration/status/budget/exact request receipts
   and POST verify/audit. Refuse register, reconcile-existing, begin, chunk, batch,
   copy, restore, activate and business APIs. Refuse all R2 PUT/multipart/delete.
   A narrow verify/audit branch may bypass the upload-only baseline prerequisite;
   it must NOT set baseline_verified to 1 or waive actual descriptor hashing.
3. Preserve owner eligibility/epoch, capability expiry/revocation, nonce/digest,
   durable operation fences, accounting and exact receipt rules. Revocation or
   expiry admits no new I/O; already-admitted effects may settle metadata.
4. The new host is a verify/audit-only variant, not a second call of the old
   uploader/CLI. The resume transaction already installs its digest record:
   authenticate directly; do not re-register or reset its T0/baseline. Read all
   chunk-receipt pages, require 1,401 received / zero missing, then verify from
   cursor 272 with expected version 19. Rehash c272..c287 before advancing once.
   Only after that exact clean checkpoint continue the remaining verify/audit.

These runtime/host branches are design only. The SQL probe does not validate
their HTTP authorization, nonce admission or real R2 behavior.

## Supported live execution path and exact approval scope

Tool discovery confirms native Sites DB tools are read-only overview and bounded
row reads; there is no arbitrary SQL execution tool. Do not edit rows through a
viewer or use a DML migration as a substitute for this atomic maintenance batch.
The Sites storage contract requires schema-only migrations and server-side
`env.DB.prepare()/batch()` for application operations. No new schema is needed.

The smallest supported architecture is a proposed default-off server route,
e.g. `/api/snapshots/import/maintenance/verify-20261023`. **It is not created.**
It would call only these fixed planners/transactions with its own DB binding.
No SQL, destination, table, grant lifetime extension or arbitrary identifier is
accepted from a request. Source publication remains the official Sites workflow.

One bundled future approval must name:

- Publish the reviewed fix plus the limited route/runtime/host changes to ONLY
  existing private `process-os-test`, retaining Frank-only audience and bindings.
  A new repository-scoped source credential, if required, is a distinct action.
- Permit an independent one-use maintenance credential, generated in the same
  Node host as a separate random 32-byte value; server stores only its digest.
  Fixed 10-minute mutation window from generation; bound to this incident, plan,
  source and only hold/maintenance/resume transitions. Private Sites entrance
  still needs its official bearer; that bearer has no user-selectable expiry or
  guaranteed immediate revoke. Neither token is Frank's login/session secret.
- Configure only the reviewed recovery enable/config/digest metadata, through
  native Sites environment tools and a matching deploy; no raw key in files,
  argv, environment variables, logs, chat or repository. Original password,
  session signer and platform audience remain untouched.
- Fresh-read the live state, retain the nonsecret before-image, then execute
  exactly hold -> maintenance -> resume, with readback between stages. Drift or
  uncertain response freezes writes; read exact plan markers before any retry.
  Old request is never marked complete. The old grant is revoked ONLY by the
  approved resume transaction; no other account or credential is rotated.
- Create the independent new import key once in that same host; publish only
  its digest/metadata, fixed original T0 and 4h/5h expiries. Configure it for
  verify/audit ONLY (1,000 requests / 20,000 operations), then authenticate by
  memory/hidden-stdin entry credential. No reupload or business materialization.
- First verify one window and its exact nonce/operations/cursor. On a clean
  receipt, continue this same process through integrity verification and audit,
  still under original expiry and unchanged budget. Missing/unknown/in-flight
  results stop writes; at most the existing two receipt GETs / total 20 seconds,
  no blind POST replay. Copy / restore / activate stay excluded.
- Disable the maintenance mutation window after confirmed readback; retain all
  public receipts and staged/original data. Do not delete data or silently extend
  expiry if the host disappears. JS drops secret references but cannot guarantee
  physical memory erasure. Process exit does not revoke the platform bearer.

The existing execution session disappeared once. There is no supported tool to
recover its in-memory key. A future real run must stay in one retained execution
turn/session through completion, with frequent nonsecret receipts; this is an
operating constraint, not proof that the host cannot fail again. No new host,
secret or real request is started by this local preparation.

## Body deadline compatibility and remaining limits

The body helper's 10-second elapsed limit also applies to `readImportBody()`:
owner begin manifests (up to 16 MiB), chunks (up to 1 MiB), batch frames (up to
8 MiB), and native POST body consumption. Slow inbound bodies formerly waited
without this bound; they can now return `IMPORT_BODY_TIMEOUT` / HTTP 409. The
timer includes consumption/hash, not time before the handler begins reading.
Normal authentication APIs and ordinary business APIs do not call this helper.

For native mutation requests, body reading happens BEFORE ledger admission;
timeout there does not debit an import request or invoke R2 mutations. A client
with an uncertain HTTP outcome must still query its nonce/receipt, not infer
absence of writes merely from a timeout. Local compiled SQL probes are not a
slow-client/mobile timing acceptance test. Keep this explicit compatibility
change in review; no timeout value was silently increased to force a PASS.

The deadline does not bound waiting for `raw.get()` to return a response/object,
nor D1 reads/mutations/settlement. Thus the whole verify request still has no new
server-side total wall-clock guarantee. Provider cancellation is best effort.
Remote throughput and remaining verify/audit duration are unknown; no speed or
completion-time promise follows from the six local cases.
