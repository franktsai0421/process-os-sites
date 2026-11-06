# IQC numeric-rule advisory

Base: `2882f35de8e68370304a2d2235c039e226a2e4e5` (clean checkout; remote main matched at start). Branch: `fix/iqc-invalid-number-hint-20261106`. Linux, Node 24.19.0, system Chromium; synthetic in-memory SQLite/R2 and ephemeral fixture identities only.

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
- PASS: diff whitespace review. Added the browser regression to existing Windows local-safety CI; remote CI has not yet run for this candidate.
- Initial tooling failure: npm default cache was unwritable; installation succeeded with `/tmp/iqc-npm-cache`, retaining the lockfile and registry integrity checks. Initial test fixture assertions were corrected to distinguish the existing Submit alert and choose the intended Cancel button; no product assertions were weakened.
- NOT_RUN: physical iPhone/IME, native Windows, real Site/accounts/business data, production deployment, complete repository suite. Viewport simulation is not physical-device acceptance. No claim of full-site performance or production acceptance.

## Synthetic screenshots

All are viewport screenshots of the real editor with only synthetic text; the editor body is scrolled to the rule so the footer remains visible.

| | Mobile 390×844 | Desktop 1280×844 |
| --- | --- | --- |
| 中文 | [Screenshot](iqc-number-zh-TW-390.png) | [Screenshot](iqc-number-zh-TW-1280.png) |
| Tiếng Việt | [Screenshot](iqc-number-vi-390.png) | [Screenshot](iqc-number-vi-1280.png) |

Regenerate with `IQC_EVIDENCE_DIR=/tmp/iqc-number-evidence CHROME_PATH=/usr/bin/chromium node scripts/test-iqc-number-hint.cjs`. No merge, deployment or live-data operation is included.
