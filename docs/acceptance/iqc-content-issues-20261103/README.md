# IQC content-issue count and source correction (local only)

Base: `f23fb5e9cce9e4c1cb89e556151e8d5ff229d830`, independently verified against origin/main with read-only `git ls-remote` on 2026-11-03. Branch: `fix/iqc-pending-source-20261103`. No push, PR, merge, deployment, real Site/D1/R2/business-data access or workstation connector action.

## Root cause and change

The draft UI independently counted absent suppliers, absent method text, missing equipment selection and absence of batch/time cadence. Submission instead accepts nonblank source rules, does not require a supplier or method text in its content checks, and also checks category/supplier/error/item names. The draft count counted affected rows rather than the server's individual issues. `.iqc-alert` additionally moved import notices into the common missing section; `checked.missing = !!draft()` claimed inspection without a server result.

The unchanged content checks now live in `iqcContentIssues`, used by submission and the IQC-only `draftMissing` presentation hook. Authenticated workflow responses carry response-only `draftContentIssues` with the current generation/revision and only `kind: missing`. It is not stored and does not add requests, dependencies, writes or permissions. Other adapters do not opt in. The UI accepts only matching generation/revision results; absent or stale results display unchecked. Legacy drafts without this response remain unchecked rather than using the removed heuristic.

The draft panel identifies the loaded shared working content and excludes unapplied forms. A selected submitted version uses its stored `contentIssues`, identifies the fixed submission snapshot and explains that later draft edits do not change it. Saved snapshots may legitimately differ from working. Import notices remain separate. Valid source rules and optional information do not inflate the missing count. Missing content stays reviewable; invalid supplied values/references, equipment-mode structure requirements, roles, CAS/revision, pending locks, no-change and fixed Save/Submit boundaries are unchanged. No new business-rule decision or data migration is required.

## Verification

All fixtures are synthetic: pure workflow objects, SQLite `:memory:`, Map-backed R2, and browser requests intercepted at `fixture.invalid`. No actual Site, D1, R2 or company data is used.

- PASS — `node scripts/test-iqc-validate-reuse.cjs`: 14 parity cases, including missing/invalid/deleted/source rules, ambiguous IDs and large inputs; unchanged issues/order and one validation scan.
- PASS — `node scripts/test-iqc-content-issues-api.cjs`: 6 actual-handler assertions covering Begin/Apply/GET/Save/Submit, matching revisions, nonblocking missing, no writes on read, and no stored presentation metadata.
- PASS — `CHROME_PATH=/usr/bin/chromium node scripts/test-iqc-content-issues.cjs`: synthetic 537 source + 6 supplier-empty => 0; seven true missing fields => seven submitted issues; fixed case isolation; invalid values/references and equipment structure preserved; real UI in zh-TW/vi at 1440×900, 390×844, 375×667, source labeling, import separation, unknown/stale results, fixed results, keyboard, locate/cancel and overflow.
- PASS — `node scripts/test-iqc-action-permissions.cjs`: 29 existing actual route permission checks.
- PASS — `node --test tests/shared-draft-no-change.test.mjs tests/shared-draft-submit-contract.test.mjs tests/iqc-ordinary-verified-readback.test.mjs tests/iqc-viewer-invalidation.test.mjs`: 73 tests.
- PASS — `node scripts/test-iqc-editing-projection-ui.cjs`: existing mount/select/retry/read denial synthetic DOM checks.
- PASS — full `npm run lint`; `node_modules/.bin/tsc --noEmit --incremental false`; syntax and diff review (CRLF-aware whitespace check).
- FAIL (existing obsolete test) — `node scripts/test-shared-draft-v3.cjs`: first four groups pass, then legacy Submit fixture expects `SUCCESSFUL_SAVE_REQUIRED` but omits required expectedRevision and gets `DRAFT_REVISION_REQUIRED`. Neither this script nor `lib/shared-draft.ts` was changed; the current Submit-contract and no-change suites pass. This is not reported as a full-suite pass.
- BLOCKED — downloading bundled Playwright browser: CDN returns HTTP 403 `Domain forbidden`. No network-policy bypass or further download attempted after inspection; installed `/usr/bin/chromium` provided completed browser acceptance.
- NOT_RUN — physical iPhone/IME, full application build/compiled runtime, live data reproduction, remote CI, push/PR/merge/deployment. These results do not certify physical-device or live-site acceptance.

The checkout and `/workspace/.agents` contain no `.agents/skills` directory; no applicable local SKILL.md could be read. Repository AGENTS, HANDOFF, current shared-draft/process specifications and relevant implementation/data documentation were inspected. The managed-cloud runtime skill was applied. Dependency install used the lockfile with lifecycle scripts disabled.

Local evidence: `/workspace/iqc-evidence` contains command logs, twelve synthetic UI screenshots, full patch and commit receipt after completion. The local patch includes this note and the reproducible tests; publication remains unauthorized.
