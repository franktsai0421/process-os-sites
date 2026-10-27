# 有界寫入與製程解析重用 / Bounded writes and process parse reuse

## Scope / 範圍

This batch follows PR #36. It does not change the shared draft lifecycle or deploy the Site by itself.

| Path / 路徑 | Eligible optimization / 可採用精簡路徑 | Not included / 不涵蓋 |
| --- | --- | --- |
| FQC | Adopted records-v1, existing unique live item/error, guarded `set` Apply (including product matrix) | Insert/delete, Begin, restore, whole-library Save/Submit/review, ambiguous historical selectors |
| Process / 製程 | Adopted records-v1, pure draft Save; full authoring and master sources | Manual Sync/Apply, Submit/Approve, Begin/restore and mixed selectors |
| Process IPQC assignment validation | One call-local lazy decode per actually needed source | No cross-request cache, stale authorization reuse or reduced validation |

正式版、共享草稿、鎖定送審版仍依原流程運作。手動 Sync、Apply、Save、Submit 不合併、不自動執行。撤回與審查退回仍是不同操作，歷史及原有自審／待補確認不變。

## Storage safety / 儲存安全

- The server—not a request key list—selects a fixed dependency closure. FQC loads auth five keys plus full quality, master and equipment controls. Process Save loads auth five keys plus full authoring and master controls.
- Every aggregate remains SHA-checked in the original manifest traversal order. Necessary bodies retain original hydration and error order. Only unused bodies are skipped under the owner's narrowly accepted fault policies.
- A private, single-use, snapshot-bound capability permits only the designated target overlay. Ordinary partial states still cannot be saved. Unknown fields, refs, sibling libraries, auth mirrors, allocation indexes and immutable history are retained or conservatively fall back to the ordinary writer.
- All global CAS attempts, fresh identity/revocation checks, maintenance/pending locks, generation, sequence, operation fingerprint and receipt checks remain. Lost CAS and partial storage failure cannot publish a partially overwritten state; unreferenced immutable objects may remain as in the original writer, without cleanup/deletion.
- `expectedRevision` remains optional. When provided it must match. When omitted, an existing CAS retry may save the newly read working state; this change does **not** freeze the user's earlier intended snapshot or authorize blind retry of an unknown Save.
- No ACL, account, database schema, share/audience, client unknown quarantine, receipt retry or automatic resubmission change.

## Accepted fault-policy differences / 已同意故障差異

For the two eligible write paths only, a damaged **unused body** no longer blocks saving an otherwise valid target. Its original ref/content is not repaired, replaced or deleted. This is a deliberate, approved difference—not evidence of live corruption. Required source faults and aggregate integrity faults remain errors, never empty success. If the provisional narrow hydration fails, the original full reader determines the outcome; this preserves original multi-fault error priority even before ineligible pending state is classified. Each module has a regression for an earlier unused missing body plus a later required malformed body, proving original 500/no write rather than a changed 422. Legacy, noncanonical or ineligible requests retain their ordinary read/write behavior.

## Performance boundaries / 效能界線

FQC's matched synthetic fixture reduces 16→15 R2 GETs and 614,003→13,991 read bytes. SQL 11, fresh revocation 9, CAS 1 and R2 PUT 2 are unchanged. **Fallback may be slower:** +1 SQL and up to +14 R2 GETs in the shown pending/unadopted/missing-row and mirror fixtures (15→29 or 16→30 GETs).

The current frontend's existing edit/matrix commands fit the guarded-set format. The live Site's storage manifest, allocation index and canonical mirror eligibility have **not** been inspected or proven; version numbers alone do not prove fast-path eligibility.

Process IPQC validation's 80-operation synthetic fixture reduces JSON parses 160→3 and parsed bytes 26,851,480→666,296. This is local function work, not live Worker latency. Pure position changes/unchanged historical assignments already parse zero and get no claimed benefit.

Process Save's matched synthetic fixture reduces 20→18 R2 GETs and 615,218→15,182 read bytes; SQL 11, fresh revocation 9, PUT 1 and CAS 1 are unchanged. **Its fallback may also be slower:** pending/ambiguous/mirror examples 20→38 GETs, unadopted 21→40, plus 1 SQL; inline adds 1 SQL with no R2 reduction. The ordinary frontend Save command can be eligible, but live storage eligibility is not proven.

Lane evidence: FQC 54 actual-handler groups; Process Save 38 same-source ordinary-path/off-on groups and a separate local 37-group exact-source baseline run; 29 Process IPQC pairs. The portable CI test does not depend on a local-only Git commit. FQC 54 regressions also passed after Process Save integration. Focused local typechecking is not a clean full build; complete CI remains required. Eligible FQC Apply/matrix and Process Save use bounded paths. Process manual Sync/Apply and both modules' Submit/review retain their original writer read scopes; this batch does not claim to eliminate all observed 10–19 second waits.

## Verification and release / 驗證與發布

Required gates: actual handler normal/fault/auth/revocation/CAS/receipt pairs, negative capability/foreign-ref tests, unchanged ordinary decoder/encoder contracts, FQC regression after Process Save integration, unchanged source guards, complete GitHub clean build/type/lint/regression checks, and independent final source review.

Local fixtures use generated data only. Local dependency/type limitations and full-CI status must be stated separately; no native/live acceptance is implied. All related PRs must be reviewed and merged before one final private test-Site publication with its separate per-action authorization and credentials. Until then the Site remains v27.
