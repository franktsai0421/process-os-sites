# FQC unknown-result form recovery

Candidate based on fetched main `781ade54c55d31954271ddbd3ec005bd49cbcbb4`, branch `fix/fqc-unknown-recovery-20261103`. Isolated cloud worktree; no live Site, business data, account, schema or connector changes. Push and Draft PR are authorized separately; deployment and merge are not.

## Findings and change

`UNKNOWN_OPERATION_CHECK_REQUIRED` means a previous operation remains unconfirmed. A 404 receipt is not proof of rollback. The user's reported error-code edit dialog is consistent with this state; the original incident's network/server cause is not established without its actual request/receipt evidence. Attachments were not available in this delegated environment; the parent supplied the exact message and screen context.

Two defects were independently reproduced against main with actual Chromium, the full FQC module/transport and actual TS routes over ephemeral SQLite and in-memory R2:

- A committed Apply with a lost response, followed by successful explicit receipt/readback, leaves `ui.lastError` populated.
- Recovery replaces the displayed model, while an open error/item form still mutates its old closure. A second Apply closes the dialog without a second POST. Both error and item cases fail the new regression on main (1 POST instead of 2).

Forms now edit detached input snapshots and send only their explicit field differences with original guards. Recovery advances a form baseline only for its matching confirmed operation ID, never to a collaborator's later values. Creation IDs remain stable so recovery cannot create a duplicate row. Error, item and existing-item assignment forms use the same path. Legacy lazy Begin remains supported and keeps obsolete forms safely closable.

The dialog provides a read-only result query and Traditional Chinese/Vietnamese guidance. Failure state clears only after confirmed original receipt plus authoritative readback. Querying while another request is in progress is blocked. Matrix recovery retains its original receipt-only path and can settle with a form open; the form's input survives. Missing receipt, readback fault, stale identity/generation, denied permission, pending locks and same-field conflicts remain conservative. Apply, manual Save, review, active content and shared ownership stay distinct.

Mobile feedback occupies a full row above wrapped 44px action buttons. Changed JS/CSS cache references and their explicit tests are advanced together.

## Verification

Environment: Node 24.19.0, installed locked dependencies (`npm ci --ignore-scripts --cache /tmp/fqc-npm-cache`), system Chromium via Playwright. No HTTP calls to a live Site; browser routes allow only intercepted `https://synthetic.invalid` requests. Runtime browser screenshots contain synthetic content only and are retained outside the repository.

| Risk | Evidence | Result |
| --- | --- | --- |
| Original defect | New recovery unit test on original main, and original UI browser error/item tests | Expected FAIL: stale failure state; second Apply makes no POST |
| Recovery and actual UI | `tests/fqc-unknown-recovery-browser.test.mjs` | PASS: error/item edits at 390/1280px, zh/vi; new IDs; two actors same/different fields; failed readback; missing receipt; matrix recovery; open form during matrix recovery |
| Existing normal forms | `tests/fqc-apply-browser.test.mjs` | PASS: four viewport/language cases, Begin/new/edit/Save/reload |
| Failure state / recovery | `tests/fqc-unknown-recovery.test.mjs`, `tests/fqc-matrix-apply-lifecycle.test.mjs`, `tests/shared-draft-receipt-recovery.test.mjs` | PASS after updating stale DOM-node/cache expectations |
| Permissions, revocation, ACK, CAS, matrix ownership | `tests/fqc-apply-reliability.test.mjs`, `tests/fqc-apply-ack.test.mjs`, `tests/fqc-matrix-last-apply.test.mjs`, `tests/fqc-matrix-rejection.test.mjs`, `tests/fqc-matrix-conflict-discard.test.mjs`, `tests/fqc-matrix-multiuser.test.mjs` | PASS |
| Required data fault boundaries | `tests/fqc-required-dependencies.test.mjs` | PASS: 80 cases |
| Busy/epoch/legacy/duplicate submissions | `scripts/test-fqc-feedback-races.cjs` | PASS; assertions now check detached pending input and localized errors |
| Layout/cache/navigation | `scripts/test-fqc-matrix-layout.mjs`, `tests/navigation-adapters.test.mjs` | PASS; unchanged stylesheet content is not falsely versioned except this candidate's new form feedback rules |
| Lint | `npm run lint -- --format unix` | PASS |

New tests are added to the existing Local safety CI step. Full repository CI remains a separate remote result, not inferred from local checks. Necessary suite reruns are scoped to changes; historical fixed-count cache and optimistic-local-display assertions were updated, not weakened into skips.

No schema migration or data package is needed. Clean source dependency installation succeeded; normal local startup/import was not invoked because this derivative protects real data initialization. Real iPhone/IME, real network latency, full live-data scale and the original live incident are NOT_RUN. Browser width simulation is not physical-device acceptance. No deployed repair is claimed.

Reproduction commands:

```sh
node --test tests/fqc-unknown-recovery.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test tests/fqc-unknown-recovery-browser.test.mjs
# Original behavior, without modifying either source checkout:
FQC_SOURCE=/workspace/process-os-sites node --test tests/fqc-unknown-recovery.test.mjs
FQC_UI_REF=781ade54c55d31954271ddbd3ec005bd49cbcbb4 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test --test-name-pattern='lost ACK retained (error|item) form 390px zh' tests/fqc-unknown-recovery-browser.test.mjs
```
