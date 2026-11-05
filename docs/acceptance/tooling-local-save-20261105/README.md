# Tooling local edits and atomic shared Save

Second-batch dependent candidate, based on PR #77 commit
`0af6d57e912e5615250959c9e76210fecd55d96b` (2026-11-05). PR base must remain
`integration/draft-save-20261104`; no merge, deployment or live data access.
The [initial audit](../../tooling/20261104-local-save-integration.md) remains an
unaltered historical record of the earlier main baseline, not current behavior.

## Changes and boundaries

- Tool/catalog/IQC association/frequency/photo-reference/transfer form confirmation
  stages a document-memory candidate. Search, filters and server polling retain
  it; version selection or departure abandons only local input. Confirmation does
  not write or read workflow state. No business-content localStorage copy.
- One explicit Save sends original-basis guarded field patches. The tooling
  adapter applies and allocates in request memory, then saves through one existing
  outer CAS with one original operation receipt. Disjoint peer fields survive;
  conflicting fields reject the entire transaction. New categories and multiple
  new tools allocate monotonically in the same transaction.
- Editing grants Save in the scoped server permission projection. Existing
  explicit Save-only grants can still save server working, but cannot apply local
  changes. Submit, Approve, Create and Delete remain separate. Photo PUT now also
  requires live tooling.edit; no real account settings changed.
- Photos retain the existing staged upload behavior: selecting a photo PUTs its
  bytes; only the reference remains local until Save. Cancelling/abandoning never
  deletes R2 objects that could be referenced by saved/history content. No media
  cleanup, blob migration or ownership conversion is part of this change.
- Tooling opts into #77's receipt-only Save and identified Begin transport. Lost
  ACK preserves the original durable marker and cannot trigger a second POST.
  Navigation uses checked automatic abandonment and exact unknown anchors.
  Pre-v1 tooling Begin markers retain their existing GET-only reentry rules;
  a tooling-local departure lease pins the exact legacy marker without deleting
  it or treating a draft read as an operation receipt.
- Preserve working/saved separation, legacy working, fixed cases, pending locks,
  active versions, transfer/correction history, original receipts, code/source
  identity, photo existence and approved IQC references. No SQL/JSON schema change.
  Product association uses the existing IQC part IDs; no new product schema.
- Shared changes are scoped allowlist/permission additions in
  `shared-draft-client.js` and `versioned-shared-workflow.ts`, plus coordinated
  entry asset versions. No FQC/IQC/IPQC C/canvas implementation was copied again.

## Verification matrix

| Risk | Evidence | Scope |
| --- | --- | --- |
| Atomic Save, CAS, duplicate operation, distinct/same-field peer writes | `tests/tooling-local-atomic-save.test.cjs` | Real handlers, SQLite memory/R2 Map, separate staff sessions |
| Edit/Save/Submit permissions, pending/stale generation, revocation | Same handler suite | Backend assertions, not button-only checks |
| Allocation, missing photo/IQC, history/reference deletion, transfer and correction | Same suite plus existing `test-tooling-workflow-request.mjs` | Synthetic data only; existing suite retains full review cycles |
| Inputs, stale reads, checks fencing, legacy Begin marker, catalogs, IQC picker, transfers | Updated `test-tooling-ui-request.mjs` | Synthetic DOM/clock; old immediate-Apply assertions replaced by private-candidate and zero-POST assertions |
| Desktop Chinese / 390px Vietnamese, real image decode, filters/polling, cancel, peer conflict, silent departure, lost Save and Begin ACK, legacy marker | `test-tooling-local-browser.cjs` | Chromium with real handlers over loopback, not deployed Worker |
| Shared receipt/Begin/departure regression and existing IQC atomic Save | Existing shared tests | Existing assertions retained; tooling added to scoped Begin cases |

Normal browser Save: one workflow POST and one authoritative workflow GET;
separate advisory `/api/tooling/checks` GET. Ordinary completed form edits: zero
workflow POSTs/GETs. Photo PUTs and Begin are separate and not hidden in Save
counts. Lost Save ACK: exactly one POST; recovery uses original receipt GET and
fresh readback. Tests retain markers through navigation and assert no resend.

[Paired measurements](benchmark.json): five fresh fixture pairs in alternating
order, no discarded warm-up. Ten retained-legacy Apply/read cycles plus Save/read
versus ten composed local edits and one atomic Save/read. Median handler time
237.465 → 25.461 ms; workflow POSTs 11 → 1, GETs 11 → 1, persisted CAS 11 → 1.
Each pair asserts identical saved content. Begin/setup excluded, no browser,
photos, network, Worker-platform or test-Site timing claim.

## Release gates and limitations

This report records the local candidate; exact candidate SHA, final build and CI
results are supplied with the dependent PR/parent handoff. Initial build attempt
without `PROCESS_PROGRAM_COMMIT` correctly refused; build must use the fixed
candidate commit and existing publication-readiness checks.

NOT_RUN: test-Site/production acceptance, real company data inventory, physical
phone, native IME, cross-machine use and hosted memory/latency. No cleanup of old
saved/working/unknown data is authorized by this candidate. API/UI must ship as a
coordinated reviewed version after #77; old clients retain legacy Apply/Save.
Full Local safety CI is enabled for the integration base and includes the new
handler and native-browser suites. Passing local checks does not authorize merge
or deployment.

## Local completion evidence

PASS: 48 tooling synthetic-UI groups; 126 existing handler operations; three new
atomic/transfer/photo-rights handler cases with multiple assertions; 127 shared
Begin/receipt/navigation/IQC tests; 46 FQC/IPQC-C/tooling regression cases;
existing IPQC-C atomic-save runner; Chromium desktop Chinese and narrow Vietnamese
(including separate actor sessions, real image decoding, silent ordinary/unknown
navigation, Begin and Save recovery, and preserved pre-v1 Begin marker).
TypeScript, lint, source boundary and fixed-commit production build passed.
The build validates source output only, not hosted behavior. Final PR CI remains
an independent gate. Expected synthetic 409/503 responses are deliberate conflict
and lost-ACK injections, not suppressed test failures.


## PR #78 integration-fixture follow-up

The first Local safety run [41944768115](https://github.com/franktsai0421/process-os-sites/actions/runs/41944768115)
reported failures in step 13 (departure integration) and step 16 (submission
contracts). Replaying those steps at `aa840c8` reproduced 13 tooling departure
failures and 10 tooling submission failures: the synthetic VM fixtures extracted
current tooling closures but omitted their document-local state variables, causing
`ReferenceError: localSnapshot is not defined` (and confirmation-count fallout).
The real tooling module declares these variables; the previously passed actual
handler/native-browser evidence is unaffected by this tests-only repair.

The fixtures now initialize `localBase`, `localSnapshot`, `localGeneration` and,
for the Save/Submit fixture, `pendingLocalSave`, matching the actual clean module
state. All prior assertions remain. Added three assertions-based cases exercise
local-memory abandonment without a dialog, abandonment after edit revocation,
and refusal to submit completed unsaved local edits; shared state, saved content,
case/receipt data and local-input retention are explicitly checked.

Local replay PASS: exact six-file pinned performance baseline; step 13 baseline
checks (2), departure/integration tests (446), and all six subsequent paired
performance scripts; step 16 authentication/replay tests (54) and full submission
contracts (208). Typed lint, TypeScript and source-boundary checks also passed for this follow-up. No product
code, workflow command, permissions, data, test deadlines or passing assertions
were removed or relaxed. Fresh PR-head CI remains the remote gate; Linux fixture
results do not substitute for the Windows runner.


## PR #78 cache-tag contract follow-up

Run [41946082533](https://github.com/franktsai0421/process-os-sites/actions/runs/41946082533)
passed steps 13, 16 and 19, then failed step 21 at the exact cache-tag assertion
in `shared-draft-receipt-recovery.test.mjs`. The full log shows expected
`shared-draft-client.js?v=20261104-begin-receipt1` versus actual
`shared-draft-client.js?v=20261105-tooling-local-save1`. This is a stale test
expectation: the changed shared client and tooling module already use the new
coordinated tag in the entry HTML. Tooling CSS is unchanged and keeps its tag.
The production bundler also hashes script contents for emitted bundle names.

The test now pins the current shared-client tag and additionally pins tooling JS
and CSS. The exact single-reference deep-equality checks for every original asset
remain, including the existing FQC and recovery versions. No wildcard/version
fallback, product change, workflow change or safety relaxation is involved.
The receipt/terminal/restore and script/style build group passes all 86 tests.
The full step-21 command replay and fresh PR-head CI are recorded separately in
the handoff; earlier passing production-code checks remain applicable because
this follow-up changes only the test and this evidence note.


The continued step-21 replay exposed a second stale fixture pin in
`workflow-begin-source-contract.cjs`: the tooling opt-in changes two lines of the
shared server, so its exact hash differs from the #77 source pin. The helper now
recognizes only the exact tooling-source SHA-256, verifies/reverses those two
reviewed lines, then executes the original byte-offset inverse and verifies the
unchanged historical hash. Unknown-source mutations remain rejected. The actual
old-handler tests pass with 422 COMMAND_REQUIRED and zero D1/R2 changes for all
four original modules. No production or permission code was modified.


The persistent-navigation cache map had the same stale shared-client and tooling
JS expectations; both are updated to the exact coordinated tag, retaining every
single-reference/version assertion. The native Windows exit-propagation test
requires `powershell.exe` and cannot execute on this Linux environment; it is
left intact for the Windows CI gate. The other tests in that command run separately
on Linux without claiming Windows exit-propagation acceptance.
