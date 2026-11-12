# IPQC A/B integration — 2026-11-12

Source-only candidate on `codex/ipqc-ab-integration-20261112`, based on remote
main `9fbba823090f03da8385c8d92f5e59293d19d2f1`. No merge, deployment, migration,
real-account change or business-data write is authorized or performed.

## Sources and boundaries

- Main already includes #87 atomic A/B Save and #100 removal of fixed background
  checks. Those features are inherited, not reimplemented.
- `perf/ipqc-ab-speed-20261106` `c2e0bbf704c9e534ccb02e10e49546d0f20bb827`
  documents `8a0f476` authority phases and bounded aggregate overlap. Its
  applicable runtime improvements also exist in the selected successor below.
- Closed #102 `55d4672cb8004d0b01715714cbc91fbce6b22d2b` is a source container,
  not a claim of current defects or successful integration. Selected A/B changes:
  `a45ea24` global choices/lineage/single-ID restoration;
  `1aff13c` stable-ID photo/rule merges; `6fc2b96` approved history;
  `978bbc4` history cache invalidation. Only A/B and required shared hunks are
  integrated; no C, account, master-page, BOM or canvas feature is imported.
- #103 (`codex/accounts-permissions-cleanup-20261110`) and #104
  (`codex/process-platform-integration-20261110`) remain separate. Common
  history/transport/server files require semantic coordination at later merge.
  Their unmerged role-policy changes are not replaced by this PR.
- New differences from the old candidate: line/group/stage changes silently
  discard unsent input; confirmed raced Save rejections re-enter comparison;
  UI completeness follows submission applicability and includes required gauges.

The user-reported 2026-11-06 PHAODIEN B-line V11 submit/withdraw/resubmit/approve
and reload retention are retained as historical live evidence. This task does
not reproduce them or infer a regression from #69/#102 failures. PHAODIEN's 78
and all 24 groups' 517 are different scopes, not an asserted arithmetic defect.

## Seven requirements and evidence

| Scope | Candidate behavior | Verification / remaining boundary |
|---|---|---|
| Speed | Exact A/B permission phase; bounded aggregate read overlap; two concurrent photo workers; original receipt/authoritative readback preserved | Historical synthetic speed evidence belongs to c2e0bbf; current API/read tests and CI are separate. Real BOSEN >5s/>10s acceptance NOT_RUN; no hosted speed claim. |
| Completeness | Enabled, assigned, nondeleted items count missing standard/method/frequency/equipment; coverage gaps count per applicable product. Group label explicitly identifies scope. | `ipqc-ab-completeness.test.mjs`: 8 PASS, including 24 synthetic groups and actual module validator. Historical difference-of-one not independently reproduced. |
| Shared draft/conflicts | One A/B module; disposable conflict plan, one mine/theirs/cancel decision; nonconflicting fields and stable-ID list edits survive. Cancel leaves RAM/base/Files/receipts unchanged. | Actual-handler + synthetic DOM two-actor tests. Confirmed revision rejection is retired before fresh comparison; no unknown payload resend. At most two automatic read continuations prevent unbounded churn. |
| Delete/retain | Persistent tombstones; authorized mine restores one original ID/parent/product association, never a new item or entire snapshot | Existing exact guards, edit/create/restore gates, pending/generation/CAS and single-item restore limit retained. Multiple simultaneous deleted-item resurrection remains refused atomically. |
| Photos | RAM preview; upload only during Save after comparison; original File pins, content hash/provenance, unknown-ACK guard | Conflict/cancel/revocation/unknown photo cases in actual-handler DOM suite. No C-only duplicate-photo claim. |
| Navigation/background | Line/group/stage changes abandon unsent RAM/Files silently; persisted module and original sent operation markers remain. Existing actual module departure retained; no fixed polling introduced | Three actual filter-event tests plus inherited departure/receipt tests. Equipment picker filtering remains inside the open form. |
| Permission/history | Edit permits Save; create/delete/restore/submit/withdraw independently checked. Approved versions are original-page readonly selections backed by immutable approval evidence | Synthetic normal signed actor sessions; permission/revocation and approved-history suites. Real employee accounts and hosted acceptance NOT_RUN. No rollback/restore UI added. |

## Validation ledger

- PASS: selected pre-adjustment candidate: 239 actual-handler/synthetic DOM tests.
- PASS: updated combined run: 240/241; the one failing assertion expected the old
  manual second Save. Corrected to assert automatic fresh chooser; focused rerun
  7/7 PASS, without relaxing persistence, request or identity assertions.
- PASS: completeness 8/8; TypeScript and syntax; source-only boundary check.
- Local Chromium BLOCKED: process launch fails before any page, with
  `socket() failed: Operation not permitted` in ProcessSingleton. The attempted
  legacy browser run is not functional PASS and is not evidence of product bugs.
- Final lint, exact-head build, source proof, complete current synthetic run,
  GitHub CI and compiled browser results must be recorded below when available.
- NOT_RUN: live Site, real BOSEN/PHAODIEN latency, real employee accounts,
  cross-machine sessions, physical phones and native IME.

No database schema or migration changes. Additive cold-origin lineage metadata
is written only during explicit initialization; existing history, approved
versions, pending cases, photos and old receipt obligations are preserved.
Test-only exact byte inverses preserve original main/history hashes and negative
controls; they are never imported into runtime and do not declare current
behavior equivalent to old behavior.
