> Latest continuation: [implemented runtime fixes and current evidence](IMPLEMENTATION-2.md). Earlier unresolved findings below are historical; live acceptance remains pending.

# 2026-11-16 quality/process operation speed — independent candidate

Base: genuine remote main `a1775a8a342d58335edf96d199a9c42844227dc6`. Separate branch `perf/quality-operation-speed-20261116`; #121/#124/#125 were open Drafts when compared. No merge, publication, live diagnostic injection, data/schema/account/ACL/configuration change or prohibited connector use.

## Office observations and route matrix

All seconds below are **individual successful request durations**, not operation totals. Repeated handoff values are the same samples, not new independent observations. None is post-fix acceptance. Browser initiator/HAR and deployed bundle-to-source identity are unavailable in this checkout; route mapping follows current clients, with uncertain mappings explicitly retained.

| Office request / seconds | Current source path | Evidence and candidate action | Remaining proof |
|---|---|---|---|
| Editor bootstrap from overview 20.56, FQC 17.14, AB 20.71; ~678 kB transferred / ~12 MB decoded | `app/api/process-bootstrap/route.ts` → destination plan, selected records, runtime catalog, company/media projection, fresh authority | Selected aggregate GETs were serial outside identity-only reuse; enable existing max-five scheduler, unchanged keys/payload/final checks | Office payload composition, actual object latency, full ready-to-edit timing, and payload reduction remain unverified |
| Editor content verification 14.60, 16.21, 15.91, 15.16 | `process-authoring/workflow?contentIssues=1` | Repeated same-snapshot `can()` calls each read session revocation; one request-local phase plus fresh fence. Existing selected keys, BOM/IPQC checks and validation cache remain. Enable aggregate scheduler | Exact per-sample initiator/role timeline not available; do not assign those timings to invented stages |
| Editor connection Save 28.42 | `process-authoring/workflow?channel=canvas-v2`, `save-canvas-v1` | Full fallback now schedules aggregates; snapshot-bound authorization phase. Atomic working/saved/CAS unchanged | Hosted snapshot and connection workload equivalence |
| Editor platform Submit 23.01, Withdraw 26.81 | shared workflow; Process Flow capability or full fallback | Existing process capability readers schedule all original aggregates; full fallback uses same scheduler; no target/dependency reduction | Hosted latency and exact command eligibility |
| FQC Submit 13.97, Withdraw 14.88 | shared workflow → FQC lifecycle8 reader | Existing lifecycle8 reader omitted aggregate scheduling; enable it while retaining every SHA/JSON/body/fault boundary and CAS | Hosted profile and final response/render timing |
| IQC Save 26.86, Submit 26.38, Withdraw 26.84 | shared workflow / IQC adapter | Full read remains conservative; aggregate scheduling plus same-snapshot permission evaluation. Paired lifecycle verifies identical response and persisted manifest | Full-read unnecessary body cost remains; live R2/D1 attribution not established |
| IPQC AB Save 23.41 / readback 10.85, Submit 21.65 / readback 10.53, Withdraw 20.99 | AB module workflow, `save-local-v1`, shared workflow | Main already has AB request-local phase and aggregate scheduling; **no new AB runtime reduction in this candidate**. Existing exact lifecycle/CAS/fault regressions retained | Still unresolved: actual aggregate/body/history volume, response projection, hosted request profile |
| IPQC C second Submit 20.46 / readback 18.58, Withdraw 20.15 / readback 18.00 | dedicated C workflow | Main already has phase and full-reader scheduling. Existing C Save capability now schedules aggregates, but this does **not** establish improvement of reported Submit/Withdraw/readback | Those reported C operations remain unresolved; do not claim C acceptance from unrelated Save helper change |
| IPQC C first round 17.39, 22.64, 17.62, 20.92, 17.72 | **unmapped samples** | Retained without invented Save/Submit/GET labels | Need exact request URL/method/initiator/timestamp association |

This candidate is partial remediation, **not completion of every >10-second request**. No target of “all requests below 10 seconds” has been proven. The unresolved AB/C and large editor payload paths must remain open.

## Proven source causes and preserved boundaries

- `can()` invokes `identity()` on each cell. The existing `createWorkflowPermissionPhase` already supplies request-local exact-value/header/revision binding and fresh revocation fences for other modules. Exact IQC and process endpoint wrappers now use it too. No cross-request cache or permission policy changes. Process content checks use the same allowed cells and a fresh fence.
- Selected bootstrap/process/IQC reads and the existing FQC/process/C Save capability readers did not consistently use the already tested aggregate scheduler. It overlaps up to five provider GETs; text, SHA, JSON, body hydration and first failure remain in original order. Duplicate refs stop windows. Streams are released after earlier failure. Identity tokens retain their original serial path.
- No keys, history, validation, integrity checks or business records were removed. Ordinary partial state still cannot be saved. CAS retries acquire new state and permission phases. Existing UNKNOWN, operation receipts, review, withdraw and conflict policies remain unchanged.
- Main's AB/C optimizations are acknowledged rather than reapplied. Bootstrap still carries exactly the same bytes; no fabricated empty/zero ready state, hidden wait or early success was introduced. Approved authoring data is also consumed by legacy/public fallbacks, so removing it without a complete consumer proof would be unsafe.

Office v53 IQC logs: request `371347f3-4e1a-4fb1-b2b2-61dbc81e6d30` at 02:18:21.691 UTC total24535/state-read20276/version-projection208/record-encode1188/state-cas264 ms; request `c5342c1c-9f2a-4d55-8e05-b17d2190ba23` at 02:20:12.749 UTC total25311/state-read21009/version-projection213/record-encode1238/state-cas264 ms. `state-read` includes readState then phase/identity; these are **not pure DB durations** and do not prove R2 or D1 as the sole cause. No new hosted telemetry was installed.

## Measurement method and limits

See `measurements.json` for paired raw samples and source hashes. Actual TypeScript handlers run in Node24 with in-memory SQLite and Map-backed R2. Both sides start from exactly the same row, object map, command, clock and UUID sequence. Baseline is the genuine base commit for all changed runtime files; dependencies are identical. Handlers are loaded before timing. Timers include complete response consumption; every lifecycle pair requires full DTO and persisted row/manifest equality, same GET count/bytes, and exactly one successful CAS. GETs require zero CAS. Counts distinguish R2 GETs/bytes and session revocation SQL calls.

Artificial 10ms delay is applied to each R2 GET and revocation lookup on both sides. This is an I/O scheduling sensitivity experiment, not observed Cloudflare latency. Three pairs use the same 1,000-part IQC fixture / 1,000-operation process fixture and 20 unrelated synthetic aggregates. FQC uses one existing item and is **not** a scale match to Office. Baseline runs first in each pair; process scheduling/CPU noise remains. No statistical live percentile or live improvement percentage is claimed. The fixed wall clock makes the existing IQC server log durations zero in these tests; only external `performance.now()` samples are measurement evidence.

Early no-delay IQC measurements included regressions/noise despite lower query counts; retain this limitation rather than claiming universal CPU gains. Per-request raw time is never added to another request as a user operation total. Render/ready-to-edit latency, Cloudflare CPU/wall time, real data scale and device/IME behavior are NOT_RUN.

## Regression and source provenance

- Targeted isolated regression: 182 PASS across existing bounded read/failure order, IQC atomic Save with CAS retry/conflict/replay/photo validation, FQC lifecycle, process actual HTTP atomic Save and full client/receipt stack, plus new IQC comparisons and encoding-time revocation.
- New paired process/FQC tests verify connection Save, Submit, Withdraw, fresh readback, content verification and editor bootstrap. New IQC tests cover Save/Submit/Withdraw/Resubmit/distinct reviewer Approve, exact receipts, cell parity, state/header drift and post-encoding revocation.
- Existing IPQC AB/C real-handler lifecycle and corrupt/missing aggregate failures passed (7 cases in the earlier mixed58 run); this is regression evidence, not new AB/C performance acceptance.
- Bootstrap existing13 groups / IQC bounded-read10 checks PASS: destination DTOs, role boundaries, epoch/revision/revocation, legacy inline/chunks/R2, required corruption and read-only behavior.
- Source inverse restores each changed runtime file to exact public main bytes, with LF/CRLF and effective changed/removed-span/path/extra-byte negatives. Original historical manifests are unchanged. Focused39 source checks PASS.
- Initial FQC scheduler test expected IQC to remain serial; updated exact positive IQC route and added scoped negative, retaining original failure/stream assertions. Initial new fixture failures (invalid FQC local-save input, wrong canvas channel for platform Submit, short IQC clientId) were corrected at the caller only; product guards and assertions unchanged.
- Final lint/typecheck and source boundary check PASS. Source-only history/worktree preflight PASS on 57248c0d45d4549d49e7a218b426edb00c11fa4c: 814 commits / 7,300 unique blobs, no real data opened. Full source sweep and committed-source checks are tracked separately; running checks are not counted PASS. Initial sweep was started before commit and without the VM-module flag; those failures require exact reruns, not relaxed assertions. GitHub CI remains pending until the PR exists.

## Overlap and integration

Runtime overlap with #121: `lib/versioned-shared-workflow.ts`; retain inventory routing and this IQC/process phase/selection additions semantically. All #121/#124/#125 overlap in `scripts/quality-root-source-contract.cjs`; compose exact inverse adapters and keep original manifests. Documentation overlaps: CHANGELOG/HANDOFF and QUALITY for #121/#125. #124 changes user-access/account policy separately; this branch does not import its account overlay. #125 changes AB/C/front-end headers and cache tags; this branch does not touch those runtime files. No other PR head is modified.

No SQL schema, data package, migration, account grants, hosted assets or deployment configuration changes. Review this Draft as a partial candidate; merging or deployment requires Frank's separate decision and the unresolved Office-specific evidence remains necessary.

### Three-pair medians (synthetic milliseconds)

| Request | Base ms | Candidate ms |
|---|---:|---:|
| iqc / save | 554.5 | 231.8 |
| iqc / submit round 2 | 559.3 | 237.5 |
| iqc / withdraw | 554.5 | 227.5 |
| iqc / submit round 4 | 548.5 | 233.8 |
| iqc / approve | 535.1 | 231.2 |
| fqc / save | 405.7 | 440.0 |
| fqc / save readback | 112.0 | 111.3 |
| fqc / submit | 394.3 | 184.9 |
| fqc / submit readback | 111.3 | 111.8 |
| fqc / withdraw | 394.0 | 186.7 |
| fqc / withdraw readback | 112.2 | 113.8 |
| process-authoring / save | 784.2 | 450.4 |
| process-authoring / save readback | 420.6 | 124.8 |
| process-authoring / save contentIssues | 356.5 | 240.6 |
| process-authoring / submit | 750.6 | 453.5 |
| process-authoring / submit readback | 479.6 | 189.1 |
| process-authoring / submit contentIssues | 410.1 | 299.5 |
| process-authoring / withdraw | 713.2 | 343.0 |
| process-authoring / withdraw readback | 482.3 | 165.3 |
| process-authoring / withdraw contentIssues | 386.9 | 252.9 |
| process-authoring / editor bootstrap | 265.4 | 199.5 |

Build provenance: an initial successful local build used an inaccurate manually supplied commit metadata string and is excluded from exact-candidate evidence. The guarded build was rerun with verified `57248c0d45d4549d49e7a218b426edb00c11fa4c`. No generated output is submitted or published.
