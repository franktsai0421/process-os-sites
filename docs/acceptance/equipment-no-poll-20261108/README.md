# Equipment fixed polling removal, local candidate

Base: `dc34874913c417ac5e3194a7e3c3956d971eb0d0`. Only the equipment
production caller and its own shell cache URL change. No shared transport,
backend, permission, database, migration, or live-data changes.

## Changed

Removed the equipment `createForegroundPoll` instance, recursive `pollShared`
producer, and its mount/recovery/reset lifecycle calls. The existing explicit
mount, read, error Retry, original-operation receipt lookup, Save and review
paths remain. No new refresh control or private persistent draft is introduced.
The equipment script cache tag is `20261108-equipment-no-poll1`.

The original guards, operation/generation receipts, sent batches, UNKNOWN,
404 handling, CAS, permissions and pending locks remain. This removes one
page's fixed shared-state polling; it does not complete every page or implement
“use yours/use mine” conflict choices. Current genuine field conflicts still
reject against the original guards. The broader conflict UX remains unfinished.

## Synthetic verification

- Full actual caller and shared client: 28 no-poll/explicit entry and Retry cases.
  A scheduler constructor or interval throws. Idle drains finite callbacks and
  rejects recursive scheduling. Mount/read/reset, dirty remount, later input,
  401/403/503 retry, missing/malformed ownership ports and stale actor/object,
  epoch/delivery/generation/tab/host lifecycle are covered. Legacy unidentified
  Begin bytes remain unchanged. The fixed base fails this negative test at its
  actual scheduler construction.
- Existing atomic-save, exact transport scope, FQC transfer and unknown-departure
  suites: 67/67. Lost Begin/Save ACK plus 404, no resend, CAS, fresh permissions,
  pending locks and original-receipt recovery remain exercised.
- Existing equipment Begin recovery: 13 cases; delete fence: 18; edit-open races:
  42; snapshot lookup: 163; session recovery: all nine groups.
- Equipment portions of the poll-wiring and scoped-read-pause fixtures now run
  the full explicit-path suite. Other modules' existing assertions remain.
  Original timer-contract failures were retained before migration. Session
  recovery uses its actual explicit renewal path and actual transport/error
  feedback, not a fake successful timer. Selected equipment invocation passes;
  an unknown selector still fails.
- Targeted lint, JavaScript syntax and diff whitespace checks pass.

## 2026-11-08 main-only completion and independent review handoff

This follow-up is still local-only and retains the exact main parent above. The
original candidate was `68c3f67046de1764335b637603a416d9e4881c33`, tree
`2182506f8a39f126e8d54a186cf085f9e9e5b27a`. Its runtime bytes are unchanged by
this follow-up. No other unpublished candidate or shared runtime is incorporated.
The final commit/tree, exact-head commands, exits and recovery hashes are in the
separate local receipt; this text is not evidence that a later HEAD passed.

### Change → risk → verification

| Change | Risk | Check and scope |
| --- | --- | --- |
| Remove equipment scheduler only | hidden background reads / stale callbacks | Full no-poll suite, poll wiring, scoped equipment tests; existing explicit entry and receipt paths retained |
| Exact raw-byte inverse | accidentally bless unauthorized source | Equipment-only path + entire SHA-256 + exact byte spans; restores dc348749 then original metadata projector; old 17 pins unchanged; non-Buffer, wrong-file, partial, repeated and arbitrary mutation controls |
| Sent-batch fixtures | treating local completion as shared Apply | Actual unchanged completion handlers followed by explicit Save; shipped atomic equipment adapter and default client; real timers with per-test reset, no retired polling hooks |
| Insert ACK fixtures | lose canonical row, next inputs, UNKNOWN or no-resend | Actual local Add / node completion → actual Save; real route/adapter; new input opens existing-row editor; original receipt lookup uses enterExistingDraft; all 62 cases retained |
| Quarantine harness | accidentally grant another owner access | Remove unused retired poll hook only; raw DOM/owner/photo assertions retained, real timers; 11 cases |
| CI and lint | green-looking unexecuted tests | Existing Local safety runs all five suites even after another step fails, no continue-on-error or name filter; Feedback paths include runtime/inverse; no-poll test registration uses void for typed lint |

### Observed failures, not waived

The migrated full sent-batch run is 87 cases: 76 PASS / 11 FAIL, zero skipped or
cancelled. The exact same migrated test against raw dc348749 equipment source
has the same 76/11 result and same failed names/assertions. Three failures still
expect changing only the old editor lifecycle counter to invalidate Save, one
Begin fixture expects the pre-durable Begin protocol, and seven concern retained
input / delivery recheck / failure bookkeeping. These are unresolved baseline
contract or fixture gaps, not proof all 11 are product bugs. They remain FAIL;
this no-poll task does not change shared ownership, Begin or Save semantics.

The migrated real-route insert-ACK run is 62 cases: 60 PASS / 2 FAIL, zero skipped
or cancelled. The exact-main isolated checkout with the identical migrated test
reproduces both: reordered ACK row keys do not settle, and later edited name
is not persisted by the second Save. Neither failure is suppressed or repaired
by changing production behavior. Full original 62-failure logs and ledger remain
preserved separately; those historical FAIL results have not become PASS.

The equipment source inverse passes the old equipment pin and its new negative
controls. The global source suite still fails the unchanged main workflow route:
actual `ad13dec6e560d606d831e64ced7a1d94fde84a93faed832e86ab46450df1966f`,
pinned `e59302315b30f2e2bce1d47ea6d6ea4f9d7228babaa0ddfc23267fee90ec2de8`.
The unmodified original source test on dc348749 reproduces that same assertion.
No master-route pin or runtime is changed to conceal it.

Fixture expectation changes are specific to the already-shipped atomic Save:
completed dialogs close locally before sending; later edits reopen the same row;
Save advances the acknowledged comparison baseline; identity-invalid terminal
responses retain UNKNOWN; an obsolete uploaded preview may be released while a
newer preview remains intact. These do not relax the current owner, latest input,
original guard/CAS, photo identity, receipt or no-resend requirements. Remaining
legacy lifecycle/renewal expectations are deliberately still red pending review.

### Publication and source boundaries

This is a reviewable source-only candidate, **not all-green, merge-ready or accepted
for normal release**. Draft review does not imply merge or release acceptance.
Remote CI, including native Windows CI, browser/native-device checks and formal
Site acceptance are NOT_RUN. Browser testing remains unavailable in this test
environment. No merge or deployment has occurred.

The repository has shallow history: source-boundary checks and exact changed-file
review apply to available trees only, not a complete history secret scan. This
candidate contains source and synthetic test changes only; no migration, live
business data or permission change occurred. Dependencies were copied from the
existing installation, not reinstalled; normal build protection is unchanged.
The original candidate and its failure ledgers remain preserved for comparison.
