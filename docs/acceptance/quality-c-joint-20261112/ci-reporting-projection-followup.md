# Reporting projection follow-up

The four failed workflows on published `d1e29b3` shared the same four failures in `access-event-main-integration.test.cjs`. The reporting proof incorrectly began by restoring a C-only parent, then applied account/process-main proof layers. This produced incompatible intermediate bytes even though the joint tree retained both parent sources.

The fix restores the exact pinned merged-main parent before the unchanged historical reporting chain. No runtime file, historical hash, permission, unknown-operation rule or original negative assertion is changed. Added explicit comparison against the actual complete main blobs, mutated-byte rejection, and path triggers for the joint-proof dependencies.

Local reruns of all four originally failing commands pass: Process 179/179, Accounts 180/180, Feedback 348/348, FQC/IQC 71/71. Counts overlap because workflows share tests and must not be summed as unique coverage. The common reporting file now passes 57/57 including the two added regressions.

New CI and downstream native-browser stages still require validation on the published follow-up. No deployment, merge or production-data mutation.

## Downstream preflight findings

A full downstream non-browser pass exposed a separate real C permission mismatch: module `return` was incorrectly gated by final-platform approval. `ipqcCFinalReviewAllowed` now keeps return under `ipqc-c.view` and `ipqc-c.return`; final approve still requires platform view and explicit final approval. Both inline and record-backed thirteen-owner endpoint matrices verify module review, final approval isolation and immediate revocation.

The other downstream failures came from old account/process-only inventory and bundle expectations after adding the quality parents. Exact raw-byte inverses now cover the reviewed quality extensions against genuine merged-main blobs. Historical parent hashes and native timeout/safety checks remain unchanged. The union permits only the three named new quality helper files, proves their origin, and checks the narrow C permission delta separately. The AB departure fixture now supplies the new module-local filter/history ports; it still executes the actual navigation object and preserves all ACK/unknown ownership assertions. Bundle tests retain exact cache tags, one-time load and dependency order checks.

Final local preflight: 121 downstream non-native test files, 2,582/2,582 passed, zero failures/skips; separate exact-parent/C-permission suite 72/72 passed. Lint, TypeScript and protected build all exited 0. These are local evidence, not new GitHub CI or real-person/mobile acceptance. Browser/native jobs are deliberately left to the unchanged CI checks, not reported as locally passed.

## Direct-script CI follow-up

The next CI advanced beyond the first checks and exposed three stale direct-script contracts: access-template proof still selected an isolated AB parent; C permission script still expected module-authorized return to be forbidden; Routine FQC historical display test still expected the obsolete two-POST apply/save sequence instead of the existing guarded atomic save-local-v1. Corrected these test contracts without runtime edits, removing no safety checks. Added module return status/readback plus continued final-approve denial, and exact atomic-save patch/guard assertions. The broader account audit also now separately exercises valid/invalid final-platform grants; a missing view dependency is rejected without state mutation.

Verification: all 32 Account standalone scripts passed after repairing the two stale oracles (audit 648 cells, 111 workflow cases, zero mismatches); quality integration 1,116/1,116 plus whole-page tests passed; C operation alignment 7 groups/244 handler invocations passed; approved history 34/34 passed; combined original source/reporting regression 61/61 passed; lint passed. Native Chromium is unavailable in this local workspace, so native tests remain required GitHub CI and are not counted as locally passed. No runtime, deployment, merge or production-data changes in this follow-up.

## Windows checkout regression

The newly added workflow dependency test split raw YAML on LF-only boundaries, unlike the existing checks in the same file. This deterministically fails with Windows CRLF checkout. Normalize checkout line endings only, then exercise both LF and CRLF representations while retaining every exact dependency assertion. Local reproduction confirms all three original CRLF path scans failed; corrected source/reporting tests pass 57/57 and the complete Equipment no-poll/local-Save step passes 286/286 with the unchanged 15-second per-test limit. No runtime changes. The prior GitHub final job log was not yet available at upload, so new CI is still required to establish whether any other failure remains.

## C permissions read accounting follow-up

The Windows Local safety bounded-read step exposed a stale identity-read count in `test-ipqc-c-permissions-read.cjs`. The approved C return-for-correction rule now checks `ipqc-c.view` and `ipqc-c.return` independently, whereas the prior final-platform reader made one identity check. Actors with C view therefore make exactly one additional fresh revocation check; denied actors retain their former count. This change updates only the synthetic test, not runtime authorization or storage.

The regression directly traces the actual C review helper: final approval still uses its independent platform reader, return checks the exact module cells, and revoking the session between view and return denies the operation. All twelve actor cases retain exact request counts, responses and no-write assertions. Required five-key hydration, growth bounds, corrupt-record failures, history, retired restore and original-source proofs remain unchanged. Local step 32 commands pass: C bounded read (9 groups), C permissions read (9 groups), AB bounded read (7 groups), access template reuse (5 groups / 114 comparisons). These synthetic counters do not establish live latency or physical-device acceptance.

Downstream non-browser preflight also passed: bootstrap 13 groups; feedback cloud/layout 53 tests plus admission/open-authorization/review-refresh scripts; PROCESS canvas 180 and lifecycle 93 tests; FQC lifecycle/matrix/readiness 108; isolated snapshot capability/transport (seven test files), startup 16, incident recovery 42, v19 22, synthetic observation 23+4, and SSR/controller 23. Counts are separate suites, not an aggregate total. Compiled-native/Chromium stages remain for GitHub CI and are not claimed as locally run.
