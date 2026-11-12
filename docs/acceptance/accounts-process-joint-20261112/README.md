# Follow-up requirements and backup-work boundary

[Current complete requirements audit, two added omissions and remaining acceptance](requirements.md) · [Follow-up verification checkpoint](followup-validation.md) supersedes older gap wording below. Old backups are retained; new backup creation/retries and backup/restore rehearsals are stopped. No deletion occurred. PROCESS history is now independently implemented from confirmed #108 sources; original UNKNOWN32 remains historical and untouched. The following record describes the initial 481297ed checkpoint, not the new functional candidate.

# #103 + #104 independent integration — 2026-11-12

This is an isolated verification candidate, **NOT_READY for merge, activation or deployment**. Keep source PRs #103/#104 open Draft and unchanged. No live account, stored ACL, database, photo, migration, policy flag or remote environment is changed. Source records below describe their own checkpoint; this document supersedes earlier claims that no joint branch exists.

Sources: main `9fbba823090f03da8385c8d92f5e59293d19d2f1`; account #103 `fb62c25929fd6b6c117aa66a3fd8f2e4dd72cc37`; process #104 `15a5acb404edb1d4f1826b13430f61376e3accb4`. Remote branches and open PRs were checked before creating `codex/accounts-process-joint-20261112` in an independent worktree. Both exact source commits are parents of local integration checkpoint `25101694b9e9c58ec59a2e3589fef14a55da4528`. They each have successful source-head CI; those results do not prove this joint candidate.

[Fixed source trees, complete file lists and semantic choices](sources.json) · [Adjacent #105–107 dependencies](adjacent-dependencies.json)

## Composition decisions

The source PRs overlap in 127 changed paths: 90 already byte-identical, 37 different. #104 has three additional unique regression files. Sixty-nine marked conflict blocks in 31 files were reviewed, with account-aware projections and the broader dependency graph retained where #103 supersedes a process predecessor. No whole-file ours/theirs resolution was used. Current `app/`, `lib/`, `public/` bytes equal the reviewed #103 head: it already contains #104's Canvas/authoring product fixes. This is an evidence-based reuse, not a second implementation of staging-verified work.

- User/access: retain thirteen Edit→Save resolvers without writing derived grants back to raw ACLs. Fresh View, Edit for content changes, Submit and final approval remain separate. Lines-only approved catalog visibility does not grant AB/C workflow access.
- Review: retain primary confirmation audit provenance, later denials, fail-closed invalid policy and module correction versus final platform approval. Approved versions cannot be withdrawn/overwritten. No policy or page adoption is enabled.
- Independent pages: retain AB.catalog, C.catalog and LINES boundaries, Save-only empty batches and fresh Edit on actual batches. Current working, pending, immutable saved/cases/history and source/media retain their original owners. Routine whole-page/receipt permissions remain part of the source #103 candidate.
- Shared client: both latest sources already have the early authoring access guard and release-before-source-repaint fix. Keep the additional Routine departure/history routes and structural object equality for confirmed Save readback. UNKNOWN, owner/epoch/delivery, receipt-first and no-extra-POST protections are unchanged.
- Shell: keep the account/Routine dependency DAG and independently reviewed 57-source inventory, including the seven additions and original VersionDraftUI dependency move. Keep exact bytes, IDs, served content, completion receipts and negative tests; no count-only accommodation.
- Additional #104 coverage: preserve three unique regression files byte-for-byte, expand original authoring Begin tests to same/successor/fresh realms, and retain all original deadlines and native lifecycle runners.
- Bootstrap fixture reconciliation: the account resolver intentionally omits inactive policy metadata. Retain exact old DTO plus approved restore/Feedback/catalog deltas, explicitly reject any inactive metadata addition, and retain the process-origin active policy handler test across records/inline/chunks/R2. Do not add inactive fields to production just to satisfy an older fixture.

## Verification checkpoint

At the composition checkpoint: the first 218 tests pass, then 1,708 tests in the remaining account/process source suites pass; 38 direct scripts pass. These groups overlap in scope and are not a coverage percentage. Full typed lint and nonincremental TypeScript pass. The separate per-cell audit reports `PASS_WITH_DOCUMENTED_LINES_SCOPE_DEPENDENCY`: 161 synthetic settings writes and 283 requests; lines.view can enter its approved page while the AB workflow endpoint correctly remains 403. This is not an all-workflow PASS. The local dependency directory is a physical copy with identical package/lockfile inputs, not a fresh install. Complete commands, per-command logs, network-denial receipts and commit/tree evidence are retained outside the source checkout.

The adapted bootstrap suite is separately rerun after an initial AssertionError string-wrapper mismatch. It verifies exact rejection code/actual/expected/message and all active-policy authority checks; no product policy changes. Final build/source-preflight and GitHub results must be read at the published candidate HEAD, not inferred from source PR green checks. Original Windows workflow is byte-identical to main.

| Functional boundary | Joint candidate verification | Remaining acceptance |
| --- | --- | --- |
| Accounts / role matrix | Actual memory-handler writes, frontend/server cells, primary/peer/DEMO refusal, override/reset, session revocation and bounded projection suites | Compiled joint-head role API + account browser CI; real identities not used |
| Canvas `process:platform` | Atomic current-canvas Save retaining other saved canvases, grouped mine/theirs/cancel, peer changes, pending locks, source/history fences and durable receipts | Original compiled 5-cycle lifecycle/Begin; extra 1365/390px × zh/vi Save and silent stage departure CI |
| AB.catalog / C.catalog / LINES | Actual route/UI boundary, Save-only/actual Edit, review/withdraw/return/approve and source-retention suites | Shared-head native flows; real adoption not authorized |
| PROCESS master | Existing source route/legacy compatibility retained | Original UNKNOWN32 owner/prepareRender gap remains; no replay or alternative delivery |
| Routine whole-page | Actual domain/save/route/photo outcome, audit/receipt ownership and approved history suites | Real cutover inventory/tooling and later #105 reconciliation |
| BOM / FQC / IQC / IPQC A/B / IPQC C / tooling / equipment | Current #103/#104 compatibility and source closure; existing full Windows safety workflow retained | #105–107 newer comparison/history/photo fixes explicitly excluded; no complete whole-site claim |
| Late input / identity / cancellation / page change | Current VM/handler/source and Canvas native lifecycle contracts retain fresh fences and zero unwanted writes | Physical IME/device and real multi-person tests not performed |

## Offline switching rehearsal and integrity

The current-source `test-master-page-boundary` and `master-page-retention-snapshot` suites run on isolated synthetic copies. Before/after checks cover full root/digest, stable IDs, original legacy strings, saved/pending/approved/historical cases, receipt fingerprints, baseline versions and referenced history-only/pending-only photos. Source revision/body drift, missing/corrupt immutable records/media, partial reads and nonempty restore targets refuse without publishing a database. The original source and media copies remain unchanged.

A deliberate negative rehearsal confirms the redacted distribution snapshot recursively normalizes JSON-looking business strings and original receipt fingerprints. It **is not an exact recovery backup**. The strict cutoff/receipt checks reject it; this is a tested safe refusal, not a successful migration or permission to alter the guard. Real activation still requires a separately authorized exact immutable backup, full pending/UNKNOWN/grant/session inventory and restoration proof. No real data was read or copied here. Routine live adoption and an exact production-sized migration rehearsal are NOT_RUN.

## CI and unverified boundaries

The existing account and process workflows run on the independent Draft PR. Extra CI keeps original Begin/process/FQC loops and Windows safety tests; adds compiled role denial/session revocation and desktop/mobile Canvas Save/departure using only ephemeral synthetic storage. Local native Worker/browser checks are unavailable under the established environment restrictions and are not retried through a different executor. New native tests are NOT_RUN locally and await actual GitHub results.

No true two-person/two-computer, staging site, physical iPhone, real Chinese/Vietnamese IME, production-sized data, or real-site latency acceptance was performed. Browser viewports and synthetic actors do not stand for those layers. Source-only build/CI is not deployment.

Original UNKNOWN32 remains unresolved and untouched. #105–107 are separate active work; their commit histories and complete payloads are not imported. Their common client/index/history/policy/source-proof paths must be reconciled later using then-current heads. No merge, source PR closure, branch deletion or deployment is authorized by this verification.
