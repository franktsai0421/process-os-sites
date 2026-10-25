# Integrated entry and delivery candidate: acceptance boundaries

Local source baseline: `eee0a70ae417b74a1e89fda196d964c172831392`. This is an unmerged candidate for a draft PR. No Site deployment, source credential, live account change or business mutation is authorized by this document. Local tests use synthetic data only.

## Current evidence

| Layer | Evidence | Result and limits |
|---|---|---|
| Build and types | local-build; TypeScript noEmit | PASS for final product changes; later edits are tests/CI/docs only |
| Module delivery/security | compiled bootstrap HTTP/D1/R2 tests | Prior 7 PASS for read/ACL/reference boundaries; not complete compiled write coverage |
| Browser entry/read pages | sites-delivery-browser.test.mjs | Original 29 read samples plus normal server-login chains and synthetic staff IQC edit/save/reload. Not live latency or every module UI |
| Browser write safety | same browser fixture | View-only staff write403, no state change; persisted Save ACK deliberately lost, reload + receipt GET, one Save POST and no retry; unrelated state keys preserved |
| Shared draft core | shared-draft-no-change.test.mjs | 5 PASS: semantic equality, revert, metadata, first baseline, withdrawal/resubmit, exact old receipt replay |
| Module cycles | test-integrated-workflow-cycles.cjs | 10 PASS: FQC, IQC, IPQC-AB, IPQC-C, equipment, AB/C/PROCESS master, authoring, tooling. Actual handlers + SQLite/R2, not browser/network acceptance. Synthetic ADMIN actors |
| BOM | test-bom-workflow.cjs/mjs | PASS: authorized import/edit/save/submit/lock/approve, viewer/import denial, old-value conflict, references unchanged; active no-change422 preserves values |
| Routine daily reports | test-routine-fqc-operations.cjs | 12 production-kernel groups PASS; normal plan/report approval, staff approval rejection, cancellation/history/replay/CAS. Not real HTTP/UI. Output-directory fixture issue fixed |
| CI exit propagation | ci-integrated-exit.test.mjs | Every native command must immediately check LASTEXITCODE; real PowerShell failure injection proves later success cannot overwrite a failed command |

The 10 cycles freeze original guards at command creation. An unchanged old command first tests the stale-version fence; a separate command has a current revision but the old guard value and must specifically return DEPENDENCY_CHANGED_RECONFIRM. PENDING_LOCKED, MODULE_CHANGED_RECONFIRM and NO_SUBSTANTIVE_CHANGE are checked by exact code. Rejections preserve the complete stored row plus all in-memory object bytes, including historical bodies and receipts.

Parallel Save/Submit and Approve/Withdraw are dispatched together and require one200/one409, a single fixed case and no partial/pending result. A separate actor cannot query the saver’s receipt. Disabling an actor between its read and next POST rejects the operation without persistence effects.

IPQC-AB uses group Apply and module=1 Save/Submit. This fixture has one pre-existing group; it does not establish multi-group UI coverage. IPQC-C uses its selected-save and history=cases APIs. Process authoring inspects fixed content issues, proves missing acknowledgement409, then explicitly acknowledges the synthetic issues before approval.

## Legacy nine-module HTTP suite remains FAIL

`test-workflow-core-http-v3.cjs` retains all original assertions and independent per-module result collection. Its captured actor guards are not refreshed at dispatch. It still returns nonzero; its failures are not hidden by the passing narrow suite.

| Old module | Remaining contract mismatch | Narrow replacement evidence | Still missing |
|---|---|---|---|
| FQC | Both stale same-field race writers expected200; server409 DEPENDENCY_CHANGED_RECONFIRM | Current-revision/old-value rejection, saved cutoff, lock, withdraw/resubmit/approve, parallel lifecycle | Every original large-suite scenario and real UI |
| IQC | Same race mismatch | Same handler coverage plus compiled synthetic staff edit/save/reload/ACK loss | Complete browser review workflow |
| IPQC-AB | Old group Save expects200; server409 WHOLE_MODULE_ACTION_REQUIRED | Group Apply + module Save/Submit/revision fence/projected approval | Multi-group populated browser workflow |
| IPQC-C | Same stale-writer race mismatch | Correct selected-save/history APIs and lifecycle checks | Full browser write/review cycle |
| Equipment | Same race mismatch | Current handler lifecycle and permission fences | Full UI write/review cycle |
| Master AB | Same race mismatch | Current handler lifecycle and permission fences | Full UI write/review cycle |
| Master C | Same race mismatch | Current handler lifecycle and permission fences | Full UI write/review cycle |
| Master PROCESS | Same race mismatch | Current handler lifecycle and permission fences | Template/entry-dispatch/player end-to-end |
| Process authoring | Same race mismatch | Lifecycle plus fixed content-issue acknowledgement and parallel review | Canvas/IME/media/dispatch end-to-end |

| Original purpose | Current mapping | Remaining limit |
|---|---|---|
| T01 concurrent begin | Retained legacy test executes before its later failures; narrow suite normal begin | Not a blanket pass of legacy suite |
| T02 non-overlapping edits | Retained legacy checks precede race failure | All original permutations not independently declared full PASS |
| T03 stale/racing edits | Narrow suite exact guard error + immutable persistence | Legacy two-success expectation not changed; simultaneous same-field case not redefined here |
| T08 saved cutoff / incomplete content | Narrow suite preserves last successful Save despite later working changes | Other missing-content policy is unchanged; old invalid-content expectations require separate spec reconciliation |
| T10 duplicate/no-op Save | Existing client/core evidence and retained old assertions | Not every module’s browser button flow |
| T15 Save/Submit race | New simultaneous handler requests: one200/one409 | Not real network scheduling |
| T19 Approve/Withdraw race | New simultaneous handler requests: one terminal case | Separate Approve/Return race remains unverified here |
| T20/T41 withdrawn fixed history/resubmit | Narrow handler cycle | All historic growth/large payload shapes not repeated |
| T23 restore preview | BOM/IPQC-C read-selected content only | Restoring working content across all modules not tested |
| T33 lost ACK / own receipt / foreign rejection | Actual compiled browser commits Save then drops ACK, reload queries receipt with no retry; handler foreign denial | Lost Submit/Approve ACK not covered by this new browser sample |
| T18 self-review / role | Existing core tests and routine kernel; new actor revocation and readonly staff403 | All real staff/ADMIN combinations and self-review UI remain pending |
| T24 semantic no-change / revert | New common-core regression and module active no-change | Legacy restored-routine exception below is unresolved |

## Policy and release holds

The parent directed this candidate to reject existing-active semantic no-change with422, keeping first baseline and other missing-content review behavior unchanged. Current SHARED_DRAFT/PROCESS_WORKFLOW text still says no-change may be advisory. Documentation reconciliation is required before merge; the draft must not pretend this conflict is resolved by source alone.

Routine’s adapter additionally has an explicit old restored-document exception (`reopened` and last lifecycle action restore-document), while current restore entry returns RESTORE_DISABLED. The new common barrier may block that old persisted exception; its intended treatment needs explicit review before release. No generic bypass or restore permission was added.

Not yet verified: live same-role/same-data load timing and memory, real employee and player accounts, every populated image/reference, physical device/full-screen, every module’s edit/review UI, multi-group IPQC, all legacy HTTP scenarios. Local subsecond timings are not a live performance claim.

Draft PR/CI may collect review evidence; merge, publication credentials, Site deployment and real-data writing require their later applicable authorization. No real-site write is used to compensate for missing isolated tests.
