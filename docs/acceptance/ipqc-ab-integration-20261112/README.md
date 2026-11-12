# IPQC A/B integration — 2026-11-12

Source-only candidate on `codex/ipqc-ab-cloud-integration-20261112`, based on remote
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
| Speed | Exact A/B permission phase; bounded aggregate read overlap; two concurrent photo workers; original receipt/authoritative readback preserved | Current synthetic measurements below use byte-identical c2e0bbf runners. Real BOSEN latency acceptance NOT_RUN; no hosted speed claim. |
| Completeness | Enabled, assigned, nondeleted items count missing standard/method/frequency/equipment; coverage gaps count per applicable product. Group label explicitly identifies scope. | `ipqc-ab-completeness.test.mjs`: 8 PASS, including 24 synthetic groups and actual module validator. Historical difference-of-one not independently reproduced. |
| Shared draft/conflicts | One A/B module; disposable conflict plan, one mine/theirs/cancel decision; nonconflicting fields and stable-ID list edits survive. Cancel leaves RAM/base/Files/receipts unchanged. | Actual-handler + synthetic DOM two-actor tests. Confirmed revision rejection is retired before fresh comparison; no unknown payload resend. At most two automatic read continuations prevent unbounded churn. |
| Delete/retain | Persistent tombstones; authorized mine restores each selected original ID/parent/product association, never a new item or entire snapshot | Existing exact guards, edit/create/restore gates, pending/generation/CAS and per-item identity/parent guards retained. A whole-set mine choice retains each affected original item within one atomic Save; it never restores a snapshot. |
| Photos | RAM preview; upload only during Save after comparison; original File pins, content hash/provenance, actor-bound upload outcomes and durable unknown-ACK markers | Conflict/cancel/revocation/unknown photo cases in actual-handler DOM suite. No C-only duplicate-photo claim. |
| Navigation/background | Line/group/stage changes abandon unsent RAM/Files silently; persisted module and original sent operation markers remain. Existing actual module departure retained; no fixed polling introduced | Three actual filter-event tests plus inherited departure/receipt tests. Equipment picker filtering remains inside the open form. |
| Permission/history | Edit permits Save; create/delete/restore/submit/withdraw independently checked. Approved versions are original-page readonly selections backed by immutable approval evidence | Synthetic normal signed actor sessions; permission/revocation and approved-history suites. Real employee accounts and hosted acceptance NOT_RUN. No rollback/restore UI added. |

## Cloud handoff and current verification

All 7 text batches were recovered from the original user messages without
manual transcription. All 41 per-file byte counts and SHA-256 digests PASS.
Combined patch: 576,703 bytes, SHA-256
`0f09504b49826109fd4285cbd6ac93a274ed9ad44e6cf9687fe148a64f454117`.
The reported Dot source is `acc9d5e014be137119b7496d349997cf967d8952`;
that Git object was not transferred. Local import commit `0bf496c` records the
verified source on unchanged main. Transfer JSON/patches/helpers are outside
Git and are never part of this public PR.

Latest remote readback on 2026-11-12: main `9fbba823`; #103 advanced from
`2d2d79cb` to `fb62c259`, #104 from `429d3bfa` to `15a5acb4`. Both remain
separate Drafts. The new deltas concern PROCESS shell/build fixtures and
documentation, not additional A/B runtime fixes; they are not copied into this
branch. Neither source branch is modified by this task. The historical
UNKNOWN32 tree `5005cba09d970cec70334d6bd540db1b599858d2` GET returned 404;
this does not establish non-execution and that mutation is not repeated.
Shared dependencies of this A/B change and both PRs: approved-history,
versioned-shared-workflow, shared-draft-client, version-draft-ui and index.
This change keeps their main behavior plus the selected A/B hunks; it does not
absorb their account/PROCESS page policy or claim a jointly validated head.

Cloud follow-up fixes:
- Three floating test promises are handled explicitly.
- A successful photo PUT followed by revision drift automatically re-enters the
  same Save comparison, reusing acknowledged photos. Begin and unknown Save
  obligations remain independently fenced. New same-field conflicts require a
  fresh whole-set choice; cancel retains File/base/journal with zero Save POSTs.
- Photo PUT now accepts an optional opaque upload operation ID. The immutable
  actor-scoped R2 outcome is verified before success. Lost ACKs persist only
  operation metadata in sessionStorage, never form/File restoration. Explicit
  query is read-only; 404, missing media, revoked access or wrong actor cannot
  authorize another PUT. Confirmed success allows the original File's photo ID
  to be reused; definitive pre-write format refusals permit a corrected attempt.
- A photo-only unknown outcome participates in the existing departure protocol.
  Leaving drops all form/File RAM while owner-scoped receipt metadata remains;
  returning offers GET-only outcome verification without reupload or auto-Save.
- Whole-set mine handles multiple deleted items with exact per-item ID, parent,
  source and permission checks in the same CAS; general history restore is not
  enabled. Nonconflicting peer fields and matrix associations remain.
- Browser fixtures forward the actual expected-actor/upload headers. The invalid
  error-name case still reaches the real server validator for untrusted ACK
  tests; invalid stages are rejected by preflight before POST.
- Performance runners are reused byte-for-byte from `c2e0bbf` (the two
  `tests/ipqc-ab-speed-{measure,browser}.mjs` files). Synthetic timings remain
  distinct from real BOSEN/PHAODIEN and hosted performance.

Validation outcomes are recorded at the final candidate below. Exploratory
failures and predecessor 332/332 remain historical evidence, not a final PASS.
System Chromium is available in this Cloud executor. Playwright's optional CDN
browser download was denied by the network policy; no allowlist was bypassed.
The existing runner supports system Chromium and the native browser suite runs
against it. Real Site, employee/cross-machine sessions, physical phones and
native IME are NOT_RUN.

No database schema or migration changes. Additive cold-origin lineage metadata
is written only during explicit initialization; existing history, approved
versions, pending cases, photos and old receipt obligations are preserved.
Test-only exact byte inverses preserve original main/history hashes and negative
controls; they are never imported into runtime and do not declare current
behavior equivalent to old behavior.

## Current synthetic performance comparison

Three samples per operation; actual handlers with in-memory SQLite/R2 and fixed
10ms artificial I/O latency. Baseline is isolated main `9fbba823`, candidate
runtime `145a1389`. Medians, not hosted/BOSEN acceptance:

| Operation | main ms | candidate ms | revocation reads main → candidate |
|---|---:|---:|---:|
| Page read | 233.79 | 171.39 | 3 → 3 |
| Permissions | 197.59 | 57.19 | 13 → 2 |
| Module read | 452.00 | 156.51 | 26 → 4 |
| Save | 373.69 | 168.12 | 13 → 4 |
| Submit | 390.47 | 176.94 | 13 → 4 |
| Withdraw | 400.39 | 177.19 | 13 → 4 |

Actual compiled Worker + system Chromium, synthetic loopback, no artificial I/O
delay: 27 samples (9 operations × 3); browser medians image Save 1,025ms, Submit
280ms, Withdraw 245ms. The later departure change does not alter the measured
Save/upload path. Historical 40s/18.3s/16.5s timings are separate observations.
