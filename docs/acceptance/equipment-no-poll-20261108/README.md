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

## PR 97 CI evidence and test-only follow-up

The earlier local handoff above is historical. PR 97 head
`8823cb67501730b7f9f02fb49337bc7126620602` has tree
`2f68050844f782e582515e4331db38a18ef3760d`, identical to the GitHub Actions
merge tree `89103adb2c2f7f25266279ede58de0f8192e8131`. Its four initial
workflows failed. Windows Local safety's equipment step was 197 PASS / 20 FAIL,
not the earlier Linux 203/14 selection. None of these failures is waived.

The test-only follow-up fixes two exact equipment cache expectations, supplies
native select initial-value behavior in the isolated insert-ACK DOM, and accepts
checkout EOL differences only after comparing worktree source against raw Git
bytes. The source projection still hashes original committed bytes and retains
all 17 historical pins. New controls reject non-EOL source changes, invalid
UTF-8 byte differences and non-Buffer values.

The master route's existing document-selector boundary is now covered by an
exact whole-file attestation and three-span inverse to its original historical
pin. The earlier Save permission change was already included in that pin and is
not removed. Complete rollback, partial/repeated spans, authority mutations,
corrupt proof constants and every single-byte drift are rejected. The route's
current bytes and behavior are unchanged; the inverse is test evidence only.

After this test-only repair, the full commands previously failing in AB C,
PROCESS and Feedback pass 307, 335 and 290 tests respectively. The combined
cache/source checks pass 122 tests; a separate CRLF checkout passes all 50 source
proof tests. Typed lint, TypeScript and the normal source boundary pass.

The full equipment/source selection remains **227 PASS / 12 FAIL of 239**, with
zero skips or cancellations. The unresolved cases are three old editor-lifecycle
expectations, one legacy Begin fixture, six explicit delivery recheck failures,
one known-rejection bookkeeping contract and one key-order-sensitive ACK
confirmation. The same migrated original tests on exact main reproduced the
original 13 equipment failures; correcting the DOM select port fixes only one.
The delivery and key-order cases are real fail-closed integration gaps, not a
reason to relax ownership, original guards, receipts or unknown/no-resend rules.

This section records synthetic local verification, not a successful new remote
workflow, native Windows/device acceptance, merge or deployment. Runtime source,
server permissions, schema and business data are unchanged by this test-only
follow-up. Any later product repair needs its own source proof and regression
results; the counts above must not be carried forward as evidence for changed
runtime bytes.


## Isolated product follow-up: explicit recheck and ACK equality

The product follow-up changes `routine-equipment.js` and the equipment-only
paths in `shared-draft-client.js`; they no longer match the original main/PR 97
runtime bytes. Both script URLs advance to `20261108-equipment-ci-recovery1`.
The shared client's other workflow dispatches and the backend are unchanged.

- Equipment Save ACK snapshot comparison ignores only object-key insertion
  order. Exact keys, types, values, array positions, receipt IDs, generation,
  saved ID, revisions and owner checks remain. A structurally equal original
  POST ACK requires no fallback GET, including when every later GET would fail.
- Explicit same-principal/epoch/generation delivery recheck retains the same
  client and original journal. Its private permission-read path is confined to
  the exact equipment endpoint. Denied, stale, malformed, lost or cancelled
  reads cannot renew delivery. General reads and all mutations retain their
  original ownership admission.
- After all caller checks, a one-use private confirmation verifies the exact
  permission response and unchanged actor, target, generation, journal,
  outstanding attempts and failure records. It changes only runtime delivery
  immediately before adoption. Unknown Save still uses its original receipt;
  unresolved Begin and altered journals remain blocked.

An exact full-file/fixed-span test-only inverse restores both changed runtime
files to verified PR 97 bytes before the existing no-poll and reporting proofs.
The old source pins are unchanged; current-byte attestation also rejects whole
rollback, partial/repeated changes, wrong paths and authority/comparison
mutations. Functional controls, not the inverse alone, establish behavior.

The earlier test-only counts remain evidence only for that earlier runtime.
The combined product candidate requires a fresh full selection and normal
checks; until those results are recorded it is not merge-ready. Browser, native
device, remote CI and deployment acceptance remain separate.

## Current atomic-Save fixture contracts

Five pre-existing fixture expectations are migrated separately from product
changes. Original cases and unrelated actor/epoch/delivery/generation/attempt
negative controls remain; no case is skipped and no assertion is replaced by an
unconditional success.

- Three editor-lifecycle cases previously expected any editor counter change to
  invalidate an outstanding Save. Current atomic-Save behavior explicitly owns
  the sent batch while preserving a later form. Each case now opens a real later
  node form and retains its input and pending photo, verifies the original saved
  snapshot and comparison base, and rejects an automatic later POST. Other owner
  changes still reject metadata adoption.
- Begin no longer uses the fixture's legacy `action=begin` response or a made-up
  generation. The case executes the real identified Begin-v1 handler, verifies
  its operation and generation against the persisted original receipt, and
  confirms one POST, expected reads, cleared marker and enabled explicit Save.
- Known `DEPENDENCY_CHANGED_RECONFIRM` 409 is a definitive rejection, not an
  unknown write or the old Apply failure-map contract. The real adapter leaves
  complete working/saved/receipts/allocations unchanged. Explicit delivery
  recheck makes no POST and retains RAM and original guard. Only a new explicit
  Save creates a new operation, which still conflicts with the same peer value.
  A separate lost-ACK plus receipt-404 control proves this cannot be applied to
  UNKNOWN: it keeps the original marker, guards and receipt destination, and
  repeated recovery/Save never resends the already committed operation.

These are stronger observations of the established local atomic-Save contract,
not new persistence, approval or error-retry semantics.

## Combined local verification result

On integrated source checkpoint `774a909896975803233a1b902b783962a41f2ad9`:

- Full equipment/source CI selection: **282/282 PASS**.
- Complete previously failing AB C, PROCESS and Feedback test commands:
  **307/307**, **335/335**, and **293/293 PASS**.
- Shared atomic Save, transport, pagehide, Begin-v1 and UNKNOWN regression:
  **119/119 PASS**.
- Current source proof in normal and CRLF checkouts: **53/53 PASS** each.
- Full typed lint, TypeScript and normal source-boundary checks: PASS.
- Normal guarded build: PASS on product checkpoint
  `b0e239992d49cc75fe6dda3fdd1184c7794cdb6d`; subsequent changes were fixture and
  documentation only. The protected build and compiled authentication check
  were not bypassed. No dependency reinstall was needed.

All listed test runs have zero skipped or cancelled cases. The combined product
SHA-256 values are equipment
`6f57fc37463575cb1ee59790bad2869f44c7583a8005cbde1e805494f816597f`
and shared client
`0a580dc462943f0acd76dcbee419a0abc5605e0b7d508700fd36cdd3e4ca28d4`.
The separate test-only and product checkpoints preserve the earlier FAIL evidence
and the rationale for each fixture migration.

This local result does not change remote CI: PR 97's observed runs still belong
to its original `8823cb6` head. Fresh exact-head remote CI, independent review,
native Windows/browser/device checks and normal merge/release gates remain
required. CRLF emulation is not native Windows acceptance. No schema, account,
permission setting, live-data or deployment change occurred. Available history
is shallow, so this is not a full-history scan claim.


The four migrated test titles now describe the current observable contract. Only
titles changed in this clarification; case bodies and negative controls did not.

| Earlier test title | Current test title |
| --- | --- |
| late lifecycle ACK cannot adopt metadata, clear RAM/photos or unlock a newer attempt | late editor lifecycle keeps original Save confirmation and later form, RAM and photo |
| photo upload lifecycle prevents later command and preview cleanup | photo upload across editor lifecycle confirms sent photo and preserves later preview |
| late receipt-only fallback GET lifecycle is rejected before metadata adoption | receipt-only fallback across editor lifecycle confirms sent batch and preserves later input |
| known failed Save cannot be cleared or admitted by a delivery recheck | known pre-CAS Save rejection retains original guards through read-only recheck and another explicit Save |

All non-lifecycle variants retain their original rejection titles and bodies.
