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

## Full CI follow-up: localization scope

The first full Local safety run (41578546579) passed FQC, typed lint, TypeScript, build and source/authorization regressions, then failed the authoring Save UI contract: its toast intentionally expected the raw `RESULT_UNKNOWN_CHECK_BEFORE_RETRY` display. The initial generic shared translation inadvertently changed that other module. Recovery classification/storage behavior remained intact. The correction moves the new bilingual guidance into FQC's own formatter and restores `shared-draft-client.js` byte-for-byte to main; the authoring test is retained unchanged. FQC tests exercise the local formatter and additionally assert the shared display contract is unchanged. Full CI must rerun on the corrected commit; the failed run is not counted as a pass.

The next run (41580194576) passed that authoring contract and continued to the final photo composition test in step 18; complete-log review also found the hidden equipment-test failures described below. That test's strict source-extraction end anchor still named the old `editable()` declaration. The anchor now names the actual detached `clone(editable())` declaration; unique-span checks, executed handlers and every photo/identity assertion remain unchanged. `node --experimental-vm-modules tests/photo-standard-entries.test.mjs` passes locally. This is a test-fixture correction only; no additional production behavior changed. The full workflow must run again before claiming CI success.

## Hidden equipment-test failures found in the complete log

The parent independently identified 13 explicit equipment Begin recovery FAIL records in run 41580194576 before the final photo failure. Thus that run's step 18 did **not** otherwise fully pass. Local execution reproduced the same 13 failures and exit code 0 on both main and this branch. The tested equipment UI, shared transport and fixtures were unchanged by this PR. The fixture installed a different synthetic model without refreshing its actual input owner; the real guard correctly refused all writes. The next deferred-read case then awaited a read that never started, leaving Node with no active handles and skipping the summary/exit-code assignment.

The synthetic fixture now calls the real `rememberInputOwner()` when installing its model, matching initialization of a newly loaded context. Product guards remain unchanged. The Begin suite sets failure exit status immediately and also fails on `beforeExit` if it did not reach its summary. With only the failure guard applied, the original 13 failures now exit 1 and report `FAIL_BEGIN_RECOVERY_INCOMPLETE`. With corrected initialization, all 31 cases complete and pass against both main and this branch. Dependent transfer and isolated-workflow suites also pass. Final CI acceptance requires checking the complete logs for explicit FAIL records and the completion summary, not merely the job conclusion.

## Follow-up code review: legacy Begin rejection

Review of candidate 67f9a4f found a regression in the legacy form adapter: it copied detached input into the displayed model before lazy Begin. If Begin returned 403, cancelling an item form retained the rejected edit in that model, whereas main restored the original item. An isolated comparison reproduced both outcomes. The adapter now sends the form's explicit guarded delta through the existing lazy Begin path without copying into the displayed model. New error/item/batch rejection-and-cancel cases verify unchanged model and rollback storage while preserving the open form's input. All four recovery unit cases and all 25 feedback groups pass, including successful lazy Begin. This follow-up requires a new full CI run; the earlier green run is evidence for 67f9a4f only. It is not a formal GitHub approval.
