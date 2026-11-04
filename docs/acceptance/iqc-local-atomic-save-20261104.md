# IQC local editing and atomic Save candidate

Baseline: main `85fa4a36442b3b72323eb4a6eeb105b867c4856a`; branch `feat/iqc-local-atomic-save-20261104`. Isolated Linux/Chromium candidate, not deployed.

IQC suppliers, categories, parts, errors and items now apply into document memory. Search/filter retains that memory; reload/departure abandons it. Photos use the existing staging upload, but references and equipment selection become shared only at Save. The server allocates error/check numbers and applies guarded patches plus the saved snapshot under one existing global CAS. Unrelated edits survive; same-field conflicts reject. No whole-snapshot replacement or rollback of other users' edits. Existing 256-patch/2 MB command limits remain.

IQC edit permission also grants Save; submit remains separately authorized. Existing create/delete, pending lock, generation, revoked-session, history, receipt and no-repeat checks remain. Unknown Save uses the original receipt, can depart without clearing its durable marker, and cannot dispatch a second write. Automatic abandonment is opt-in on the IQC navigation adapter; other modules retain their existing policy.

No schema, migration, true data, backup, account, Site or deployment changes. Existing shared working/saved/cases/effective/history and older browser recovery records are not cleared or converted. Older already-synchronized unsaved content remains server-side and is included by existing Save semantics; conversion requires separate inventory/authorization. The new flow does not implement a pagination UI.

## Evidence

- Real SQLite/R2 handler: atomic Save with staged photo/new equipment, edit-without-save permission, server numbering, CAS retry, receipt replay, unrelated field preservation, conflicting-field refusal, missing-photo atomic refusal and session revocation PASS (`tests/iqc-local-atomic-save.test.cjs`).
- Real Chromium + actual handlers: new item with valid PNG and newly selected tool; form Apply sends zero workflow POSTs, Save sends one; reload persistence, filter retention, unsaved reload abandonment and 390×844 overflow check PASS (`scripts/test-iqc-local-atomic-browser.cjs`, `CHROME_PATH` selects installed browser).
- Chinese 390px / Vietnamese 1280px browser: local form, unknown Save, visible receipt lookup, missing receipt, preserved departure marker, successful original recovery and denied read PASS (`tests/iqc-unknown-browser.test.mjs`). Native IME/physical devices NOT_RUN.
- Editor ownership/cancel tests: 11 PASS. Shared navigation/receipt/terminal-admission regressions: 133 PASS. Existing IQC timing/readback tests: 51 PASS before the additional local-save conflict assertion; targeted added assertions rerun separately.
- Targeted oxlint and production build PASS. Build validates source changes with baseline program marker; it is not publication approval or exact merged-source acceptance.
- Synthetic actual-handler Save observations 17–25ms across fixture runs; zero per-edit workflow writes and one Save write. No hosted latency, realistic-volume speed guarantee or cross-computer acceptance.

## Integration gates

Shared edits are narrow opt-ins in `versioned-shared-workflow.ts`, `shared-draft-client.js`, `navigation-lifecycle.mjs`, `delivery-navigation.js`, plus index cache versions. Parent must semantically integrate these with FQC/canvas changes and rerun combined navigation/receipt checks. Full remote CI, independent review, test-Site deployment and live acceptance remain separate gates. No main merge is authorized by this candidate.

## PR #76 departure CI follow-up

Original head `5fc2d93`, Local safety run `41823104321`, failed the Performance and departure integration contracts step. Local reproduction of that step's 20-suite command produced 405 PASS / 14 FAIL: every failure was an IQC binding fixture `SyntaxError: Unexpected token ')'`. Its delimiter-based source extraction included the new `Object.assign` wrapper. The fixture now extracts the actual factory argument using the TypeScript parser and loads the real IQC local-discard closure. Tests distinguish IQC's new local-only departure from legacy shared Save; no shared content is saved or rolled back on departure. All other module assertions remain.

The latent legacy pending-name guard remains enforced; local memory is now cleared only after owner assertions pass. Added assertions cover stale-owner retention and memory-only abandonment. The shared coordinator uses the same `autoAbandon` API and automatic-failure handling as FQC #74 head `3bf2d2a7663b70fe689b65992981a1cd36ac48fa`, so integration need not reconcile competing option names. Busy/blocked states never imply discard permission, unknown receipts remain unchanged, and an automatic failure reports its error without a save/discard choice dialog.

The original 419-suite-test command passes after the fix (before two additional targeted cases). Latest exact-head remote CI is tracked on the PR; the earlier failure is not treated as a release pass.
