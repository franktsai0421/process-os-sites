> Current candidate now incorporates main `8bfc03679b0e53889c604e110ad843a2fc7b3ae5` (merged #115/#117). The original c178 baseline and its measurements below remain immutable historical evidence. New exact joint inverses preserve both genuine parent trees; upstream master explicit wait/UNKNOWN and IPQC link rules remain. Updated joint results are appended below.

# IPQC operation speed — isolated candidate

Base: main `c178ae227bcddf528a493dbf8b586cf310564c5b` (#113/#114/#116 retained). Independent `perf/ipqc-operation-speed-20261114`; no merge, deployment, real accounts or live business data. #115 `10251cf5022c173557b667ffd3ecf48bfe54cc6d` and #117 `3c1a2b0b36c5b8813ca36913d901c4cd8540458a` were read for overlap; neither branch is integrated or modified. #115 shares process-state's separate PROCESS projection; this candidate adds only exact IPQC authorization phase exports. #117 does not change these runtime files. Existing public GitHub visibility was verified; source and generated metrics only are included.

## Evidence and scope

The reported v47 POST/GET times and human C Submit/Withdraw waits are observations, not segmented backend evidence. The committed benchmark executes actual API handlers with generated SQLite/Map R2 fixtures and normal synthetic login. It counts SQL/revocation/CAS and R2 GET/PUT/HEAD, peak overlapping GETs, requests, wire bytes and decode time. It times state reads, identity/permission phases, adapter kernel, fingerprints, version/public projection, wire projection and encoding. Nested phase times overlap and must not be summed. Unattributed handler time includes internal C projection and JSON serialization; no claim of a fully sampled production CPU profile.

Measured changes: C's per-cell authorization repeatedly verified the same signed session (16 revocation reads on an editor permissions GET and normal full write). A request-local phase now evaluates the same policy from one selected state, checks again after access and before/after immutable writes, and is recreated on every CAS attempt. Final approval still uses companyReader's exact platform cells, separate from can() legacy aliases. A/B and C page GETs reuse permission evaluation inside one phase with a fresh final session check. C full reads and A/B scoped Apply/create/delete/Restore and lifecycle writes overlap at most five aggregate GET metadata requests through the existing integrity-checked scheduler. Every selected aggregate remains read and validated in original consumption order; no partial writer or new cache is introduced.

All POST receipts, canonical operation fingerprints, CAS, photo checks, allocation/history, UNKNOWN original IDs and required terminal GETs remain. No timeout increase, artificial success, polling or client replay was added. Existing IPQC UI Apply/delete remain RAM-only where the current client requires explicit Save; local forms, same-module product/filter retention and cross-module departure/UNKNOWN journals are unchanged. The sole existing A/B equipment timeout aborts a read; it is not a fixed delay before action completion. Shared transport progress timers are finite text notices, not network polls.

## Verification matrix

| Risk | Evidence | Status |
| --- | --- | --- |
| Save/Submit/Withdraw/Resubmit/final Approve, original receipt | New paired actual-handler tests compare full response and persisted manifest/revision to exact main, both modules | PASS locally |
| View/edit/create/delete/save/submit/withdraw/history/final review policy | All synthetic C roles compared to existing can/company policy; existing 244-call C permissions suite | PASS locally |
| Revocation after immutable I/O | New C lifecycle test denies commit, zero CAS; phase rejects header/auth-state/revision drift | PASS locally |
| Missing/corrupt selected objects, unrelated aggregate preservation | Paired full response/fault equality, both modules; existing bounded scheduler fault suite | PASS locally |
| Parallel edits, duplicate click, slow/lost/late reply, relogin/navigation/cancel, UNKNOWN no replay | Existing actual caller/handler recovery, local Save, admission and conflict suites | See final check ledger |
| New error/item, edit Apply, delete, Save/reopen and lifecycle UI | Existing original isolated compiled A/B and C local browser runners in exact-head CI | PENDING CI |
| Current historical exact-source proofs | Strict new inverse restores actual main bytes; existing pins and negative cases unchanged | See final check ledger |
| Lint, non-incremental TypeScript, guarded build | Cloud checkout and exact-head CI | See final check ledger |

No schema, migration, data package, existing credentials, backups, hosting or production bindings change. No existing Diem/browser QA item is used. Cloud socket/Chromium restrictions are not bypassed; native UI evidence will be obtained by the existing GitHub runners. Hosted station timing, real data volume, human cross-computer/mobile/IME and #115/#117 combined-tree acceptance remain NOT_RUN. Source tests and CI do not constitute deployed test-site or human acceptance.

## Reproduction

`node scripts/benchmark-ipqc-operations.cjs` defaults to three rounds with 10ms injected latency on each SQL/R2 operation; set `IPQC_IO_DELAY_MS=0` for in-process CPU/serialization sensitivity. Set `IPQC_SPEED_OUTPUT` to an absolute output path. For the baseline, set `REPLACEMENT_PREVIEW_SOURCE_ROOT` to a clean checkout of the pinned main while executing the identical harness. Request totals exclude setup and command prerequisite GETs (separately reported as workflow-read), and direct scoped Apply/create/delete timings are handler measurements, not the RAM-only UI Apply timing. Reports contain source hashes and the exact harness hash, not identities, bodies or credentials. The larger existing C benchmark uses 869 errors + 866 items and reports its own request/wire accounting.

## Final check ledger and performance

[Full paired report and source/harness hashes](ipqc-operation-speed-20261114/summary.json); raw before/after samples and the 1,735-row C runs are in the same directory. Runtime measured at 92d22878b57f2ec6c898b4b29245a5265233a838; final evidence commits preserve those production file hashes. Four rounds, first excluded, three measured; all HTTP response sizes and R2 GET counts remain equal. Every measured direct request is one HTTP call; CAS remains one for writes and zero for reads.

| Handler | Before ms | After ms | SQL before→after | R2 GET before→after |
| --- | ---: | ---: | ---: | ---: |
| ipqc-ab:create-error | 308.8 | 192.74 | 8→8 | 19→19 |
| ipqc-ab:create-item | 304.09 | 192.75 | 8→8 | 19→19 |
| ipqc-ab:apply | 283.95 | 170.18 | 7→7 | 19→19 |
| ipqc-ab:delete-item | 284.02 | 174.61 | 7→7 | 19→19 |
| ipqc-ab:delete-error | 288.01 | 172.58 | 7→7 | 19→19 |
| ipqc-ab:page-read | 98.27 | 85.55 | 4→3 | 10→10 |
| ipqc-ab:permissions | 54.64 | 54.26 | 3→3 | 5→5 |
| ipqc-ab:workflow-read | 139.78 | 138.99 | 6→6 | 14→14 |
| ipqc-ab:save | 185.96 | 185 | 7→7 | 20→20 |
| ipqc-ab:submit | 184.88 | 186.59 | 7→7 | 21→21 |
| ipqc-ab:withdraw | 184.13 | 185.22 | 7→7 | 21→21 |
| ipqc-ab:resubmit | 184.66 | 188.77 | 7→7 | 21→21 |
| ipqc-ab:approve | 296.87 | 185.39 | 7→7 | 21→21 |
| ipqc-c:create-error | 424.8 | 183.32 | 19→7 | 18→18 |
| ipqc-c:create-item | 342.4 | 192.04 | 20→7 | 10→10 |
| ipqc-c:apply | 412 | 171.08 | 19→7 | 18→18 |
| ipqc-c:delete-item | 411.3 | 171.88 | 19→7 | 18→18 |
| ipqc-c:delete-error | 406.02 | 175.35 | 19→7 | 18→18 |
| ipqc-c:page-read | 117.35 | 75.61 | 4→3 | 9→9 |
| ipqc-c:permissions | 219.72 | 54.77 | 17→3 | 5→5 |
| ipqc-c:workflow-read | 264.17 | 98.05 | 17→3 | 17→17 |
| ipqc-c:save | 404.78 | 162.57 | 19→7 | 18→18 |
| ipqc-c:submit | 401.53 | 162.67 | 19→7 | 18→18 |
| ipqc-c:withdraw | 402.05 | 164.14 | 19→7 | 18→18 |
| ipqc-c:resubmit | 406.69 | 164.48 | 19→7 | 18→18 |
| ipqc-c:approve | 342.6 | 162.36 | 14→7 | 18→18 |

A/B module Save/Submit/Withdraw POST medians are essentially unchanged. Do not claim every individual request became faster; its required terminal/page read still benefits from the page authorization change. A/B scoped create/edit/delete and Approve show the scheduling change. C reads/writes show authorization and scheduling gains. No hosted speedup percentage is asserted.

Large C (869 errors, 866 items, no injected latency): open 75.45→27.29ms; local batch Save 244.84→217.57ms; Submit 275.67→245.29ms; Withdraw 265.35→187.63ms; Resubmit 254.09→201.41ms. Original request counts and wire sizes remain; prerequisite GETs are included where the original harness says so. Baseline larger run was collected during other verification and is less controlled than the sequential small fixture; these are descriptive CPU/serialization observations, not a latency guarantee.

Cloud PASS: 6 new actual-handler parity/authority/fault groups; 8 new exact-source inverse cases included within 194 historical source/no-poll checks; original recovery/admission/Save suite 70; completeness/conflict/history/bounded-read suite 284; shared-module isolation/submission/navigation/process-review suite 287; C operation permissions 7 groups/244 handler invocations; lint and full non-incremental TypeScript. These sets overlap and are not an additive coverage total. Guarded build passed at the earlier 0f58b97 source; final evidence head is rebuilt before push and its status is recorded in the PR.

Exact-head GitHub native UI/CI results are recorded in the PR after pushing; they are not local cloud browser results. NOT_RUN: deployed test site, hosted/real-data timings, human/physical-device/OS IME acceptance, combined #115/#117 tree and deployment.

## Main 8bfc036 joint verification

Main advanced while the GitHub tree action awaited approval. This candidate merged main on its own branch, retaining all #115/#117 runtime and documentation changes; their source branches were not changed. Shared transport, master runtime and original JSON manifests remain byte-identical to new main. `lib/process-state.ts` intentionally adds exact IPQC phase exports; the strict joint inverse proves the complete original main bytes, including all unrelated master/PROCESS behavior. All original source negatives remain. GitHub commit creation was denied once by automatic approval review for alleged missing explicit destination disclosure authorization; native CLI also has no GitHub login. Verified user history contains explicit IPQC PR/upload instructions. No rejected mutation was routed through an alternate write path. Remote branch, draft PR and CI remain uncreated until the allowed evidence-based retry succeeds.

Latest-main paired run: [summary and provenance](ipqc-operation-speed-20261114/joint-summary.json), [baseline raw samples](ipqc-operation-speed-20261114/joint-before.json), [candidate raw samples](ipqc-operation-speed-20261114/joint-after.json). Pinned main 8bfc03679b0e53889c604e110ad843a2fc7b3ae5 versus candidate 608c78927098ff911dd5c4caf03de68e86b260a5; same harness, sequential four rounds with first excluded, 10ms per I/O. HTTP/R2 counts and bytes remain identical except deliberately reduced redundant authorization SQL. This supersedes the earlier timing table for current-main comparison.

| Handler | Main ms | Candidate ms |
| --- | ---: | ---: |
| ipqc-ab:create-error | 306.83 | 193.87 |
| ipqc-ab:create-item | 305.55 | 193.9 |
| ipqc-ab:apply | 283.59 | 171.97 |
| ipqc-ab:delete-item | 285.44 | 170.89 |
| ipqc-ab:delete-error | 287.37 | 170.55 |
| ipqc-ab:page-read | 96.69 | 85.73 |
| ipqc-ab:permissions | 54.32 | 57.12 |
| ipqc-ab:workflow-read | 139.69 | 138.87 |
| ipqc-ab:save | 182.65 | 182.59 |
| ipqc-ab:submit | 184.13 | 183.64 |
| ipqc-ab:withdraw | 185.7 | 182.81 |
| ipqc-ab:resubmit | 183.15 | 183.62 |
| ipqc-ab:approve | 296.76 | 184.89 |
| ipqc-c:create-error | 419.73 | 185.71 |
| ipqc-c:create-item | 336.22 | 194.05 |
| ipqc-c:apply | 417.71 | 171.59 |
| ipqc-c:delete-item | 418.08 | 172.29 |
| ipqc-c:delete-error | 407.7 | 172.46 |
| ipqc-c:page-read | 117.84 | 75.52 |
| ipqc-c:permissions | 222.91 | 54.56 |
| ipqc-c:workflow-read | 251.5 | 97.17 |
| ipqc-c:save | 402.65 | 161.02 |
| ipqc-c:submit | 400.18 | 165.41 |
| ipqc-c:withdraw | 404.64 | 162.5 |
| ipqc-c:resubmit | 413.07 | 164 |
| ipqc-c:approve | 346.43 | 165.2 |

Joint checks: lint, full TypeScript and guarded build PASS at 608c789. New-main UNKNOWN/admission, LINES conflict and IPQC source-rule runtime suite 64/64 PASS. Broad combined source/handler run 483/484 PASS with one intentional authority-export source check; its complete exact-inverse correction and affected 57/57 cases PASS. No product check was removed or broadened. Existing earlier PASS evidence remains separately labeled; exact remote SHA/native CI is still pending upload authorization.

### GitHub checkpoint provenance

The first commit-publication review was resolved after reading explicit user upload authorization and verifying repository owner/visibility/permissions. GitHub App checkpoint `765a2027acf0b04e517264555e1260a8d845ca50` has tree `587f7328abfe4879cb3b88bff90fedcd67ca377f`, byte-identical to cloud checkpoint 349df98. Native CLI lacks GitHub credentials; the App supplies Git commit metadata, hence different commit IDs. The new joint source contract uses this real published checkpoint as its speed parent, with unchanged parent-file hashes/rules. Final branch commit will include both latest main 8bfc036 and this checkpoint as parents so CI has complete genuine history. Older measurement sourceCommit fields are cloud-local IDs with source/harness hashes, not claims that those IDs are GitHub commits. Final branch/CI status is recorded in the PR.

### First exact-head CI follow-up

On f992e205, Quality C joint, process review, IPQC link rules, LINES/flow and C local Save passed. Feedback, PROCESS local Save, AB/C local Save and process-platform stopped on two shared historical negative-test anchors. The C auth/read refactor intentionally removed the old read-ahead declaration and repeated identity expressions; source admission/inverse and product checks had already passed. The two tests now first admit current source and reconstruct the exact immutable historical read-ahead bytes before applying all original mutations; reporting also mutates current phase creation, fresh authority fence and read-ahead scheduling with effective-change assertions. Historical pins, negative cases, requests and budgets remain. Original old-server protocol test plus reporting 57/57 pass locally. The joint inverse now additionally preserves the changed reporting test against both genuine parents, so upstream source provenance is not weakened. Product bytes and all performance samples are unchanged. Final follow-up head/CI are recorded in the PR.

The d246964 follow-up passed Feedback, PROCESS and AB/C compatibility; process-platform then exposed one additional obsolete assumption that normalizing current successor EOL must fail. The current exact inverse intentionally supports reviewed LF/CRLF checkouts, already covered by dedicated source tests. Batch3 now retains normalization rejection on its genuine frozen 9332777 historical input (with a non-no-op mutation assertion), verifies current admitted EOL reconstructs the same original predecessor, and retains appended/wrong-file/type plus all current authority/CAS/scope negatives. The entire original failed step (Batch3, BOM and C read-I/O) passes 25/25 locally. Runtime bytes remain unchanged. No test timeout, safety pin or product guard changed.


### Windows bounded-read compatibility oracle follow-up

Windows Local safety run [43620151394](https://github.com/franktsai0421/process-os-sites/actions/runs/43620151394), job 132523827266, failed on head 0b11323 at step 32. C bounded-read passed first; C permissions P1 then expected the pre-phase Frank identity count 16, while the actual current GET made 2 checks. The immediately preceding permission/response comparison passed. Reproducing the identical command on Linux produced the same failure: this is a stale portable cost oracle, not evidence of a Windows runtime defect. Running the remainder exposed the corresponding A/B expected 3 versus actual 2 assertion, previously unreachable in Windows after C failed.

The compatibility tests now assert independently specified historical and current costs separately. C executes the actual frozen c178ae2 access function with production policy dependencies to preserve the original per-cell cost proof; both suites compare each phase permission cell against independent can() decisions across fixture roles. Fresh initial and terminal identity checks, actual mid-request revocation rejection, exact DTO/policy comparisons, denied-data isolation, immutable source pins, required-object integrity, partial-state persistence refusal and all existing write/source proofs remain. No runtime, timeout, Windows command, permission or storage guard changes. The exact four Windows commands also run early in the dedicated IPQC Linux workflow to catch portable oracle regressions sooner; the Windows gate remains required and unchanged.

Cloud isolated reproduction and regression: the complete original four-command step passes C bounded 9 groups, C permissions 10 groups, A/B bounded 8 groups, template reuse 5 groups / 114 comparisons. Lint and full non-incremental TypeScript pass. Guarded build and exact published-head CI are recorded in the PR after publication. These historical dc8 compatibility harnesses include earlier bounded-read gains; their R2-byte reductions must not be attributed anew to this test-only correction. Product bytes and previous speed evidence remain unchanged. Hosted 12–14 second POST / 50 second to multi-minute human waits remain unverified and unresolved by this correction; no deployment or business-data test was performed.
