# Exact incident verification: local implementation and review input

Local-only, uncommitted changes relative to merged GitHub baseline
`d0d664e734a40d542655db0809970d8c76cacde8`. No push, merge, live migration,
credential creation, deployment, control-table change or real recovery occurred.
Original R1, 3000, staged chunks, Frank's password and audience are untouched.
The build stamp `5b43a376b70fd12585e49c5cf48349db1a378a6b` is a real ancestor;
it does not identify this uncommitted patch. Review uses genuine Git diff/file SHA.

## Fixed incident and persistent authority

The fixed pins and version-18 hash proof are in
[the hold contract](VERIFY_RECOVERY_20261023.md). Last actual live observation
remains transfer version 18 / committed cursor 272, not 1,401 verified chunks.
All 1,401 uploads being acknowledged does not prove their body hashes were read.

Migration 0006 adds only `process_import_verify_capabilities` and
`process_import_verify_maintenance`. Fresh journal now includes 0006; the schema
model also includes the existing three 0005 tables, for 19 total user tables.
Migrations 0000 through 0005 are preserved. This is DDL only, with no live grant,
data, secret, SQL transaction or control-table seed. The official source projection
copies this migration journal to the deployment's migration folder. No generator
or database connection is needed to register this authored schema migration.

New authority uses scope `incident-verify-audit-only-v1` in a SEPARATE persistent
table. Old staging code searches only the old table and cannot authenticate it.
The restricted record keeps baseline_verified, baseline_checked and baseline_cursor
at zero. Receipt/chunk counts are 1,401 and continuation version is 19; these are
metadata pins, not claims of new content validation. Only verify/audit and narrowly
scoped metadata receipts are allowed. Register/begin/batch/reconcile-existing,
chunk upload, R2 writes, copy/restore/activate and business API access are denied.

## Default-off server contract

`PROCESS_VERIFY_RECOVERY_ENABLED=1` plus `PROCESS_VERIFY_RECOVERY_JSON` enable
the exact incident mode. The JSON is the host's PUBLIC config (digest only):
format `PROCESS_OS_INCIDENT_RECOVERY_V1`, actual `programCommit`, maintenance
id/digest/T0/expiry/receipt-expiry, and grant id/digest/ownerEpoch/T0/expiries/limits.
The server compares `PROCESS_PROGRAM_COMMIT`, project/origin, all six binding
pins and Frank's current enabled admin/master.export eligibility/authEpoch 0.
There are no production values or new secrets in this repository.

All actions use existing `/api/snapshots/import?action=...`; no reserved Sites
route or audience rule changes. Maintenance authentication uses its separate
digest and exact `im_<digest-prefix>.<secret>` bearer, with the normal private
Sites entrance as an independent outer boundary. Cookies mixed with bearer are
refused. POST requires matching Origin; extra query/body keys are refused.

Allowed maintenance actions: POST incident-register, GET incident-plan/status,
POST incident-hold, incident-maintenance, incident-resume. Mutations are limited
to 10 minutes from the one fixed T0; metadata status lasts at most 5 hours.
Each of the last three POSTs has one durable nonce/hash admission. Unknown
outcomes retain the nonce and stop. There is no retry/unlock endpoint or SQL input.

Hold rechecks the exact before-image in an atomic D1 batch, changes version
18 to 19 while preserving cursor 272, all charges, chunks and the active lock.
If an old handler advances first, the whole recovery batch fails. If hold wins,
the old version-18 advance cannot commit. Maintenance retains the stop/lock.
Resume atomically rechecks the full held image, revokes the OLD grant, inserts
the separate restricted record, labels the old request as blocked and releases
only that exact lock. Every UPDATE requires changes()=1; a later SQL assertion
failure rolls back revocation, new insert and release together. No incomplete
request is relabeled successful. Its history/operations and all charges remain.

Restricted native requests require the persisted resumed plan, old grant revoked,
old request blocked, matching source/pins and cursor/version formula. Each new
provider operation checks write expiry/revocation/authority; only R2 reads/list
are possible. Reads accepted before expiry may finish metadata settlement later.
New provider I/O ends at T0+4h, metadata receipt reads at T0+5h. Times are enforced
with server clock; client timestamps/labels cannot grant access or extend expiry.
After the final asynchronous owner lookup, the server samples time again and
binds that fresh time into the durable maintenance issued-at/expiry SQL guard.
An owner lookup that crosses the deadline retains an unknown nonce and the old
lock, without dispatching the recovery transaction.

## Body lifetime and client lifecycle

The 10-second bounded body reader covers body consumption and SHA, including
R2 readback and inbound import bodies. A response object alone is no longer a
successful verified-body intent. Slow inbound requests can fail before admission.
This is NOT a total request timeout: waiting for raw.get() response and D1 calls
are outside this body timer. Actual remote latency/slow-client compatibility is
not yet verified. No guarantee is made that this alone removes every stall.

`scripts/incident-recovery-host.mjs` is task-local execution code; importing it
does not generate keys. Live run requires an explicit reviewed source commit.
It creates two independent 32-byte secrets inside one Node process, persists
only public digest/config and a one-use marker, and awaits a matching nonsecret
environment-revision confirmation. Hidden TTY input is enabled before it announces
ready. The private-Sites entry bearer is taken only in the bounded hidden frame.
No key is passed in argv/env/files/output. JS references can be dropped, not
guaranteed physically erased; process exit is not platform-bearer revocation.

One provider is created, never registered again. The first real verify window
must commit version 20 / cursor 288 with its exact nonce/hash, clean operations,
open budget and no in-flight request. Only then the SAME host pauses at most
10 minutes and no later than write expiry. It prints a public checkpoint hash.
Continuation requires the exact grant/checkpoint/transfer/manifest frame.
That same provider/key/T0 then verifies remaining chunks and audits resources.
No payload upload or business transition is possible. Uncertain mutation is
never replayed: one reconciliation, at most 2 metadata GETs / 20 seconds, then
stop. EOF/cancel/timeout/bad frames restore terminal and close provider/session.
Restart cannot delete/reuse the one-use marker or silently generate a new grant.

## Evidence and limits

- 21 initial unit/schema cases pass: 10 authority/transaction, 10 actual
  host/session lifecycle cases with synthetic HTTP, and schema integration.
  One later delayed-owner expiry regression passes individually; the initial
  34 cases were not rerun for that two-line deadline fix. Evidence totals 35
  observed passing cases across checkpoints, not a new full-suite execution.
- 6 compiled HTTP cases pass against local nonpersistent workerd D1/R2.
- 7 D1 probes pass, including both CAS race orderings and failure AFTER restricted
  record insertion proving atomic rollback of old revocation and new record.
- Final executable code, including the delayed-owner fix, built successfully at
  2026-10-23T21:30:44.752Z; full types passed at 21:30:51.037Z. The auth/client
  post-build check passed. Task-local receipts are named
  incident-recovery-final-build-20261023.json and
  incident-recovery-final-types-20261023.json. Only documentation was clarified
  after that build. The 6 compiled HTTP / 7 D1 results above belong to the prior
  bundle, not a re-execution against this final bundle. CI steps are prepared
  locally; no remote CI is claimed. Previous 73 unrelated tests were not rerun.
- Compiled positive maintenance uses synthetic control rows. The true pinned
  manifest cannot be synthesized: compiled verify deliberately supplies a wrong
  manifest body and proves checksum refusal, preserving cursor 272/baseline 0.
  Successful full host traversal uses synthetic responses. Neither is a true R1
  verify window, remote performance result, restored database or login acceptance.

## Minimal later live decision (NOT executed)

1. Review exact diff/HEAD, pass applicable CI, merge normally; authorize source
   sync credential and deployment. Keep same Site/audience/bindings/password.
   Apply schema-only 0006 incrementally; do not recreate the existing database.
2. Read back live source and the exact transfer/request/version/charges/operations.
   Drift means stop and re-plan, never replay the old recovery blindly.
3. The old write grant expired at 2026-10-23T21:13:42.395Z and is not usable for
   further writes. Its lost process secrets are not recoverable through this
   workflow. The accepted memory/hidden-stdin flow is a secure transport path,
   not proof that an old Sites entrance bearer is still retained. If none is
   available in the same executor's approved volatile custody, authorize a NEW
   test-Site entrance bearer through the native Sites tool; do not retrieve it
   from chats, logs, source, environment dumps, files or the lost host session.
   Platform bearer expiry/immediate revocation are not guaranteed by app expiry.
   A new reviewed host generates only its in-memory maintenance/app secrets and
   public config at one T0. Configure the exact public runtime values, deploy,
   confirm the actual revision within the 10-minute maintenance interval, and
   deliver the separately approved Sites entrance bearer via hidden stdin.
   This requires explicit new LIVE control/grant/credential authorization.
4. Run register/hold/maintenance/resume exactly once, inspect uncertain outcomes
   read-only. First verified window pauses for review; continue only from its
   clean exact checkpoint, under the original T0/expiries and single host.
5. Finish verify/audit and read final receipts/cleanup. Disable the recovery mode
   after required receipt collection, not mid-run. Copy/restore/activate and
   ordinary application/data acceptance remain separate later decisions.

The supported write channel is this restricted application route using the
server's D1 binding/batch, not the read-only Sites table viewer, arbitrary SQL,
row-by-row UI edits, DML migration, password reset or an unrestricted admin route.
