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

### Compiled native and cache-contract follow-up

Completed Windows run `41824857971` on head `4bb0dfd` had two failures. Step 17 passed 12/13: the first AB unknown fixture timed out at the initial `#master-new-draft` click (12 seconds waiting for visible/enabled/stable), before any unknown write or departure. The concurrently starting ordinary AB fixture took 26.5 seconds; subsequent fixtures took 3–7 seconds. Independent Chromium/Miniflare suites now run sequentially, as the existing FQC native suite does, and the unknown fixture explicitly waits for destination readiness before starting its action deadline. Existing action timeouts and all departure/receipt assertions remain unchanged. Cold-start contention is the supported working diagnosis; latest Windows CI must verify the repair.

Step 20 failed only the exact shared-client cache-tag assertion: it still expected `20261104-iqc-ipqcc1`, while the delivered index correctly loads `20261104-iqc-local2`. The assertion now pins the delivered new version; it still rejects missing, duplicate or unversioned references. No product behavior or data/schema changed in this follow-up.

Local follow-up validation: compiled abandonment command 13/13 PASS; combined receipt/terminal/restore command 77/77 PASS; typed lint and diff whitespace checks PASS. Existing compiled product bytes are unchanged by this test-only follow-up. Remote Windows results remain separately required.

An audit of the same cache contracts found the later navigation adapter suite also pinned the three changed script references and dynamic lifecycle import to old versions. Its failure was reproduced locally (32/33), then all four pins were updated without relaxing exact reference checks; 33/33 PASS.

### Permission-contract follow-up

Run `41828546575` on `dcf3dc0` passed compiled departure and the cache-contract regressions, then stopped later in step 20 at `scripts/test-iqc-action-permissions.cjs:51`: its old UI assertion expected an edit-only user to lack Save. The confirmed requirement explicitly grants Save through edit. The matrix now checks actual handler Save for edit-only users and actual versionBar Save for edit/save users, with reader denial and edit-only Submit denial retained/added. Independent review/restore permissions remain unchanged. The 31 remaining commands in that CI step are also checked locally before the next push to avoid hiding further integration failures behind this assertion.

Permission matrix including explicit edit-only Submit denial PASS; all 31 remaining step-20 commands PASS; lint and whitespace checks PASS. Latest full Windows CI remains the remote acceptance gate.
