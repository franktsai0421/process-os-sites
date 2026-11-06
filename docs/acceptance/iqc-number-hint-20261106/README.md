# IQC numeric-rule advisory

Base: `2882f35de8e68370304a2d2235c039e226a2e4e5` (clean checkout; remote main matched at start). Branch: `fix/iqc-number-hint-source-only-20261106`. Linux, Node 24.19.0, system Chromium; synthetic in-memory SQLite/R2 and ephemeral fixture identities only.

## Change and boundaries

The actual editor previously accepted fixed count `0` locally without explaining its submission error. A field-level Traditional Chinese/Vietnamese status now warns for nonblank, non-custom batch numbers that are nonfinite or <= 0. It updates on input, reopening and cadence/kind changes; live language switching preserves input/focus. Accessible description and aria-invalid are advisory, not native form constraints. Existing styles are reused; IQC script cache pin advances.

Apply remains local, Save remains the existing atomic module Save, and server Submit remains authoritative. Empty rules can still be saved/reviewed as missing; custom/source/time do not receive the numeric warning. 2.5 remains accepted (integer policy unresolved). No backend, schema, data, permissions, CAS, pending, receipt, unknown or departure changes.

## Verification

- PASS: pre-change actual browser reproduction on zh-TW/vi × 390/1280: fixed count 0 had no hint. `IQC_EXPECT_BASELINE=1 CHROME_PATH=/usr/bin/chromium node scripts/test-iqc-number-hint.cjs` was used before editing production source (the final fixture also adds a source-only item).
- PASS: `CHROME_PATH=/usr/bin/chromium node scripts/test-iqc-number-hint.cjs` — four language/viewport combinations, enabled/disabled items; 0/-1/abc/Infinity for all numeric batch kinds; 2/2.5/blank/whitespace; custom/time switching; source-only edit/cancel and unchanged saved source rule; live language switch; focus and overflow; local Apply produces no POST; 0 Save persists and actual HTTP Submit returns 422 VALIDATION_FAILED with no case; blank saves; 2 saves/submits; unsaved reload neither writes nor prompts/restores. Existing failed-Submit alert is asserted separately from departure, not removed.
- PASS: existing `scripts/test-iqc-local-atomic-browser.cjs` at 390/1280, including photos, explicit Save and unsaved Submit admission.
- PASS: `scripts/test-iqc-validate-reuse.cjs` (14 cases), `scripts/test-iqc-content-issues-api.cjs` (6 checks), `scripts/test-iqc-content-issues.cjs` (both languages, desktop/390/375).
- PASS: `node --test tests/iqc-local-atomic-save.test.cjs tests/iqc-editor-terminal.test.mjs tests/iqc-begin-generation.test.mjs tests/navigation-adapters.test.mjs` (57 tests).
- PASS: lint, TypeScript noEmit, sites source-boundary check, local source build (program-commit stamp uses the baseline SHA; this is a working-tree build, not a release).
- PASS: diff whitespace review. Added the browser regression to existing Windows local-safety CI; remote CI on the original candidate failed at the history gate described below; the replacement needs its own exact-head CI.
- Initial tooling failure: npm default cache was unwritable; installation succeeded with `/tmp/iqc-npm-cache`, retaining the lockfile and registry integrity checks. Initial test fixture assertions were corrected to distinguish the existing Submit alert and choose the intended Cancel button; no product assertions were weakened.
- NOT_RUN: physical iPhone/IME, native Windows, real Site/accounts/business data, production deployment, complete repository suite. Viewport simulation is not physical-device acceptance. No claim of full-site performance or production acceptance.

## Independent screenshot evidence and source-only correction

Four synthetic editor screenshots (zh-TW/vi at 390×844 and 1280×844) are delivered separately, outside the Git source tree. They show the rule with the editor body scrolled and footer visible. No image bytes or encoded media belong in this source-only repository.

Regenerate outside the checkout with `IQC_EVIDENCE_DIR=/tmp/iqc-number-evidence CHROME_PATH=/usr/bin/chromium node scripts/test-iqc-number-hint.cjs`.

| Evidence filename | SHA-256 |
| --- | --- |
| iqc-number-vi-1280.png | c725d0f7e0932bdd98185badfbc449d5f6b9a5e7354af7136d02bc331bbc39c1 |
| iqc-number-vi-390.png | 5cc0b12b6541f283158aa7fcb81818adead74a6a7ec5d0defba5f0c3679664ee |
| iqc-number-zh-TW-1280.png | f80583958f3529c55c68203171e8d73dba317583cefced8e6b438ab71b6b07d4 |
| iqc-number-zh-TW-390.png | 7fed2b19d5cbbca566f7457b7faca43ddf4bbb17b401a3a5e55d9997999dfb0f |

The first candidate f0e9ae37731411801fda72c2e8843d30e467d091 / PR #88 incorrectly committed these images. Local safety run 42205738151 rejected its history with SOURCE_MEDIA_OR_BINARY_PATH; later missing-build errors were secondary. This replacement starts at the same clean main baseline, copies only the nine text-file changes and corrects this evidence documentation. The old candidate is not an ancestor. PR #88 and its branch remain intact. Product, cache pin, browser regression and CI commands are byte-identical to that candidate; its local UI/API results above are reused on that exact-source basis. Its failed history check is not reported as passing.

Before push, run `node scripts/sites-ci-preflight.mjs` on the new committed HEAD to validate all ancestors and the worktree. No guard, anchor, binary assertion or historical review exception changes. Remote CI must be checked at the new exact HEAD. No merge, deployment or live-data operation is included.

## Integration with merged IPQC C fix

Main `1da47bd04fff55fea575dea0e76274149d8101a8` is merged normally into the existing IQC branch. The only textual merge conflict was the introduction of two independent quality-module notes; both notes and their evidence links are retained. IQC product/test bytes remain unchanged. IPQC C product and receipt/recovery tests match merged main. Its source branch deliberately deferred the shared-shell asset pin to integration: the IPQC C pin now advances to `20261106-c-receipt-performance1` alongside the IQC `20261106-number-hint1` pin; the navigation test asserts both. No shared protocol or guard changes. New final-commit source preflight and exact-head CI are required; prior passing CI alone does not certify this integration.
