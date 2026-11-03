# Remove PR #61 speed diagnostics

## Scope and source

User requested removal from GitHub and an update of the existing test Site, subject to passing tests, CI and review. Candidate starts from merged #62, `781ade54c55d31954271ddbd3ec005bd49cbcbb4`; #61 is `668601b8fd2ad2fc6ea5db564b25af853bfbc626`. This change reverses the feature introduced by #61 and retains every #62 business-code change. Only the CHANGELOG conflicted during the inverse and its newer FQC entry was preserved.

Removed `/navigation-timing`, `/api/navigation-diagnostics`, the generated `/process/navigation-diagnostics.js`, recorder injection in layout/login/process shell, request timing wrappers and storage instrumentation. Removed the feature's seven dedicated tests, source-inverse contract/manifest and two acceptance documents. Their historical content remains recoverable from #61 in Git. Restored ordinary source-contract fixtures and removed only instrumentation-specific oracle tests. Unrelated Windows transport diagnostic workflows and ordinary application failure reporting remain.

Production files touched by this removal are byte-identical to #61's first parent, except `public/process/index.html`, which retains #62's current cache versions. #62's FQC matrix model, workflow, client, styles and business tests remain unchanged from main. A new removal-only smoke test verifies retired paths and ordinary navigation; it does not collect timings. Historical #62 integration documentation is annotated rather than deleted.

The separate uncommitted AB catalog optimization remains preserved in its original worktree and is not included. No schema/migration, dependency, business dataset, account/password, media, hosting identity, audience or binding change. No live diagnostic run, live login or live business write is part of removal validation. Existing temporary flags are not changed or extended; without the diagnostic implementation they have no effect on a new deployment. Existing open tabs can retain their old JS until reload; no broad storage clearing is introduced.

## Risk and validation

Environment: managed Linux, Node 24.19.0, Chromium 154.0.8037.57, locked dependencies; synthetic SQLite/Miniflare D1/R2 and loopback browser fixtures only. Build used the baseline program SHA with the modified candidate source; the compiled output hash is `ed5c543474889b07759fbe3270fd7a9476bbfaee4901e9aefa80564bcf668289`. This is local candidate evidence, not an exact final merged-release build or live acceptance.

| Concern | Validation | Result |
| --- | --- | --- |
| Login, auth/replay, revocation, bootstrap, shared receipts, FQC matrix Apply/lifecycle/concurrency/rejections | 11 Node test files: master-ab-auth-phase, master-ab-replay-permission, fqc-matrix-last-apply, fqc-matrix-apply-lifecycle, fqc-matrix-multiuser, fqc-matrix-rejection, shared-draft-receipt-recovery, process-bootstrap, login-intent, process-scripts-build, process-styles-build | 179 PASS |
| Security and snapshot fail-closed behavior | `node --experimental-vm-modules tests/sites-security.test.mjs` | 18 PASS |
| Root/import gate, login, exact built shell, zero business writes | `node tests/sites-root-entry-native.test.mjs` | 12 PASS |
| Old feature paths and stale opt-in state; login → process-master → FQC; no timing header, business POST or state mutation | `node tests/sites-retired-entrypoints-browser.mjs` | PASS; repeated after adding old JS URL |
| FQC Apply, focus, recovery and layout in zh/vi at 320/390/1280 widths | `node --test tests/fqc-matrix-browser.test.mjs` | 6 PASS; browser viewport simulation, not physical devices |
| Source EOL, identity prefetch and lifecycle/oracle contracts | `node --test scripts/entry-performance/source-eol.test.cjs scripts/entry-performance/identity-prefetch.test.cjs tests/fqc-draft-lifecycle-browser-contract.test.mjs` | 19 PASS |
| Existing FQC bootstrap projection and authoring bounded reads | `node scripts/test-fqc-bootstrap-projection.cjs`; `node scripts/test-authoring-contentissues-readscope.cjs` | PASS; synthetic existing regressions, no live speed claim |
| Type/build/lint | `tsc --noEmit --incremental false`; `PROCESS_PROGRAM_COMMIT=<baseline> node scripts/local-build.mjs`; `oxlint --format unix` | PASS |
| Access-template committed-byte contracts | `node scripts/test-access-template-reuse.cjs` | 5 groups / 114 comparisons PASS on committed candidate; initial uncommitted run correctly rejected HEAD's still-instrumented source |

Removal smoke is wired into Local safety after compiled root-entry acceptance, retaining failure exits. CI-only native multiuser/lifecycle cases remain for the supported Windows CI runner. No assertion, security guard or threshold was weakened. First removal smoke invocation omitted required `PROCESS_PROGRAM_COMMIT` and failed fixture setup; rerun with the actual baseline SHA passed. No product change was needed for this invocation error.

## Publication gates

GitHub repository and Site identity were refreshed before publication preparation. Existing repository and Site are public; this task preserves that configuration. Site was version 35 at the check. Source-only PR publication triggers Local safety, with no automatic Site deployment in repository workflows. Required CI/review, refreshed main and matching Site source provenance remain gates before merging/deploying. A separate clean clone of candidate `b75c9c0d8b7f3f74eb958476e5d96452ec1f731e` completed `npm ci --no-audit --no-fund`, the guarded full build pinned to that commit, and the compiled removal/login/navigation browser smoke (all PASS). The clone stayed clean. Final merged-source verification remains required. PR #64 was created as Draft, Local safety started, and a Codex review was requested; neither CI nor review was complete at this evidence snapshot. Live access previously returned environment network-policy 403; do not bypass it or claim hosted browser acceptance.

The final PR and Site version/deployment receipts belong to the release result. This document records the local acceptance snapshot and does not itself claim a merge or deployment. Rollback, if needed, should deploy a reviewed prior program version without restoring or overwriting business data.

Source review checked every changed production file against the pre-#61 tree, #62 business bytes against the fetched main, and absence of recorder imports/entry injection. Stored SQL, role checks, same-origin/body-size/login-limiter behavior, revocation queries, immutable identity-read bucket equality, CAS/receipt and stream cleanup remain intact. Diff checking preserves existing CRLF byte contracts (`core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol`); no line-ending normalization was applied. This author review is not an independent approval.

## Full CI log audit and test-runner correction

Do **not** treat Local safety run `41583357159` / job `125743405420` as release acceptance, despite GitHub's green conclusion. The full 15,597-line log contained 13 `status: FAIL` assertions at lines 9440–9452 from `scripts/test-routine-equipment-begin-recovery.cjs`, and no final Begin-recovery summary. It then continued with unrelated passing suites. The same failure reproduced locally with exit 0.

Those script/fixture/product files were unchanged between the PR base `781ade54` and the removal candidate `303af8a`. This was an existing fixture/runner defect exposed by full-log inspection, not a product regression from removing diagnostics. Current equipment write admission requires `inputOwner`; the old synthetic fixture installed a model without establishing that owner. Writes were correctly refused before POST. The runner collected those assertions and then awaited a GET-start promise that could never resolve. With no live event-loop handles, Node exited 0 before reaching its final failure summary. PowerShell's existing exit checks therefore had no failure code to propagate.

The synthetic fixture now optionally establishes the owner using the product's actual `rememberInputOwner`, just as normal data adoption does. Only Begin-recovery setup opts in; default fixture semantics for existing transfer tests are unchanged. Runtime/account/epoch/delivery checks are not altered. The runner starts with nonzero exit status, fails immediately on an assertion, bounds each case with a real 5-second watchdog, and sets success only after the full summary. This is a test watchdog, not an application request deadline.

Validation: all 31 original Begin-recovery cases now complete with PASS; all 64 transfer-intent cases PASS. Two child-process regression cases inject an assertion failure and a never-settling fixture promise into the actual runner; both exit 1 themselves, without parent termination, and cannot emit a PASS summary. These checks are included in CI after Begin-recovery with the existing failure exit. Targeted typed lint passed, but the next full CI lint correctly rejected the new runner regression test's unawaited `test()` promise. The test now awaits each registration; full repository typed lint and both child-process cases pass locally. A new full CI run and latest-commit review are required before merge; earlier application build/browser evidence remains applicable because this follow-up changes only tests, workflow and documentation.
