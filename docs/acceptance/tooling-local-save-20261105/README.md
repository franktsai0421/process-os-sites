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
