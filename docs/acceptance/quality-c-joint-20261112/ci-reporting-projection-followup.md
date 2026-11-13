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
