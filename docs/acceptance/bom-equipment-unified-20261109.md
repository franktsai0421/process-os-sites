# BOM / equipment Save-choice integration (local only)

## Task and source

Integrate the relevant BOM `4960d74f0db395e34f2faef91325345b55c22927` and equipment `ed35ad1ed39607ff8d105ef8a84d3f73062643cd` candidate code onto `b06394ce0065849733399423afd2d906761d69c1` in an independent local checkout. The original candidates are unmodified. This is a module contribution to the unified integration, not publication, merged main or deployment.

## Result

Both modules retain page-local input and read current remote working for explicit Save. No fixed polling producer is added. One Mine / Theirs / Cancel decision covers all ordinary conflicting fields; nonconflicting edits from both people survive and a choice automatically continues the same atomic Save. Equipment photo identity/hidden state is one semantic choice; rejected local photos are not uploaded. BOM additionally retains reviewed occurrence/source conflicts for structural ERP imports and approved-only immutable history display without rebinding the writer.

Revision/generation/CAS, permission/pending gates, original unknown operation IDs and receipt-only settlement remain. A new peer edit during a choice causes a fresh readonly comparison against the same original local basis and a new whole-group choice, within the same Save. Converged changes need no further choice. Pending/generation/rights/identity changes or backward revisions still reject; a race after comparison is protected by the existing server CAS. An ambiguous/deleted identity, protected parent/source guard or invalid structure remains a refusal rather than an authorization to resurrect or bypass constraints. Unsent departure drops page RAM without a prompt; original sent/unknown metadata survives and is never resent. BOM and equipment keep independent clients, scopes, bases and RAM state.

The imported product files retain candidate behavior except the explicit pre-dispatch fresh-recompare follow-up below. Shared-client changes add only BOM approved-history reads; shared VersionDraftUI changes are BOM-only opt-in presentation. Shared server history filtering/final authorization is BOM-only opt-in. No schema, real data, account, migration or live environment changes occur.

## Validation

- PASS: 409 focused tests (`bom-save-choice-controller`, `bom-save-actual-handler-controller`, `bom-occurrence-planner`, `bom-occurrence-save-server`, `bom-approved-history-real-common`, `bom-approved-view-controller`, `bom-unsent-router`, `equipment-save-choice`, `equipment-sent-batch`, `equipment-sent-batch-insert-ack`). These execute shipped closures, registered handlers and shared transport, plus real route/kernel logic with isolated SQLite/R2 fixtures.
- PASS: 204 existing regressions (`bom-atomic-save`, `bom-manual-ram-save`, `bom-local-recovery-actual-stack`, `bom-post-authority-actual-stack`, `bom-atomic-departure`, `bom-unsent-recovery`, `equipment-no-poll`, `equipment-atomic-save`, `equipment-sent-batch-quarantine`, `equipment-transport-scope`, `routine-equipment-begin-runner`).
- PASS: scoped oxlint on all changed runtime JS/MJS/TS and `git diff --check`.
- Expected integration HOLD: after commit, the equipment strict source suite has 2 PASS / 2 FAIL. Its runtime inverse and corruption controls pass; one case requires the shared transport to remain exact b063 (BOM now adds approved-history reads), and one requires the candidate CI/cache composition that the parent owns. Keep the immutable #97 pin and compose an outer proof at the final integration head. This is a real source/CI gap, not a product behavior failure or a waived gate.
- Initial harness invocation could not resolve TypeScript in the new checkout. Re-execution used the existing candidate dependency installation; no network install occurred.

Logs are external local evidence: `/tmp/bom-equipment-unified-focused.log` and `/tmp/bom-equipment-unified-regression.log`. DOM/HTTP timing ports are synthetic; these results do not certify native layout, Windows, mobile, keyboard/IME or hosted behavior.

## Integration work retained for owner

The parent integration owns shared cache URLs, common requirement/implementation docs, CI composition and outer strict source projections. Existing imported module source proofs retain their historical pins and must be composed against the final integrated source. They do not establish final unified source/CI acceptance on their own. The fresh-recompare follow-up changes the two module runtime blobs and additionally needs an outer exact successor projection to preserve those historical module pins. The combined source head also needs its own build and compiled/native checks; the compiled BOM history test was not run on a build of this local contribution. No old build is claimed as new acceptance.

No remote write was attempted. The earlier equipment create-tree denial and quality transfer with uncertain outcome are preserved and not retried. Native browser/device, remote CI, live account, publication, merge and deployment remain NOT_RUN/HOLD. Data-model impact: none. Material risk: common shared-file integration and cache/source proof composition require verification at the final integrated head.

## Fresh comparison follow-up

BOM reuses its post-choice authoritative GET and now restarts only the undispatched comparison when current content/revision advances. Equipment adds the corresponding post-choice GET before any chosen photo PUT or command. The captured journal/base and File entries stay fixed across this loop; no receipt or dispatched-command path enters it. A new group choice handles all fresh conflicts, preserves peer-only changes and completes the original Save automatically. Cancel retains the original batch. Existing CAS still handles races after the final comparison.

PASS: 111 tests covering changed BOM/equipment actual DOM flows, real structural BOM handler recompare, original unknown/no-resend and the existing FQC transfer suite (67.2 s). PASS: four post-choice permission/pending/generation guards reject before any photo upload or command. PASS: existing transfer intent suite, 83/83 cases. PASS: four-module actual-handler transfer suite, 382 synthetic source-handler invocations. These include existing approved targets, pending/generation/selection/owner gates and original receipt recovery; no new cross-scope transaction is introduced. The entire 46,517-byte transfer owner/preview/Begin/recovery/execution/dialog region remains exact b063 bytes (SHA-256 `e2e878705bb9ce23fa6e8b20206eb8ee00f96cdbaae193a8bbf35e5ca2e06ac4`).

Logs: `/tmp/bom-equipment-fresh-recompare-transfer.log`, `/tmp/bom-equipment-transfer-intent.log`, `/tmp/bom-equipment-four-module-transfer.log`. All prior native/remote/source-composition limitations still apply.

The first post-recompare boundary run waited in an old fixture that changed a peer while the chooser was open and then awaited the retired rejection behavior. It was interrupted, and that fixture now injects its real 409 race at actual POST dispatch, after the final readonly comparison. All original 409/no-unknown/base/receipt assertions remain; the targeted known-rejection versus unknown tests pass. This changes test timing, not runtime guards.
