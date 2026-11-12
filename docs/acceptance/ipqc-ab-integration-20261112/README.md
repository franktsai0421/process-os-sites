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
  fresh whole-set choice; if a peer resolves the conflict to the same value, the
  original Save continues once and retains other edits. Cancel retains
  File/base/journal with zero Save POSTs.
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
  create-error batch includes an invalid equipment reference so untrusted ACK
  tests still reach the real server validator; invalid stages are rejected by preflight before POST.
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

## Final local validation ledger

Runtime/build commit `bcf170610edc4df24de40fe882982ca2f2f4bcb1`;
compiled entry SHA-256
`c7f2c40c5806724adf22c7a2aa183d6ae9653c5f9ee51adbd67940e7e1a109d2`.
Later `d34449a` changes only the compiled photo fixture; the final documentation
commit does not change executable source.

| Check | Result and scope |
|---|---|
| Lint / TypeScript | PASS, `npm run lint`; `tsc --noEmit --incremental false` |
| Guarded build | PASS exit 0 and known auth-client postbuild gate; private server authentication retained |
| A/B browser callers | 182/186 in the broad isolated run; remaining 4 failures corrected and PASS 4/4 final targeted rerun. Coverage: create/Save/conflict, actor/epoch/delivery drift, stale callbacks, original receipts and filter departure |
| Compiled full app | PASS 4/4: desktop zh, 390px vi, restricted roles, unknown Save departure/reload/404/GET-only recovery |
| Shared compatibility | PASS 307/307: AB/C local Save, master permission phases, shared receipt/Begin recovery, ownership, navigation and snapshot dispatch |
| Compiled photo policy | PASS 10/10 synthetic stages across all six photo modules and feedback: exact actor, permission/source gates, lossless normalization, idempotency, format/size refusals, feature/maintenance protections |
| Shell bundles | PASS 4/4; exactly 50 sources, 2 assets; execution/order/private-seed exclusions retained |
| Final history, exact source and merged-main guards | PASS 93/93 after the last DOM fence change, including raw-byte inverse and negative controls; earlier 67/67 source checks also PASS |
| Final conflict/departure edge checks | PASS 5/5: changed/added/resolved conflict, unrelated peer edits, photo-only receipt departure |
| Source-only history/worktree | PASS: all reachable commits/blobs and 2,022 worktree files; 32 exactly reviewed historical findings; no live data or credential values opened/returned |

The broad 341-case development sweep recorded 339 PASS and two failures while
final edits were being made: an uncommitted source-byte pin and the obsolete
expectation that a resolved same-value conflict must stop. Both were corrected
and reverified in the 67 + 5 final targeted checks above. This is a combined
evidence ledger, not a claim that that earlier 341-case invocation was clean.
The final four browser failures were the three foreign-DOM quarantine paths
and a premature UI redraw assertion after legacy receipt settlement; all four
were reproduced and passed after correction. Raw exploratory failures remain
in private temporary evidence. The new PR
workflow runs the final committed source independently on GitHub.

No SQL schema/migration, business records, permissions, production or deployment
were modified. New R2 photo outcome metadata is additive and actor-scoped.
Real hosted acceptance, physical devices, native IME and the historical BOSEN
latency observations remain outside these synthetic checks.

## First GitHub CI follow-up

At uploaded head `6263b3d6`, A/B core CI passed 271/272. The sole failure was
the extracted Save-caller fixture omitting `rejectForeignBatch`, a new
dependency of the already-tested private DOM fence. The fixture now supplies
an explicit quarantine-check port and asserts it executes before any authority
read or command preparation; actual product code and all refusal conditions
are unchanged. The full Save/revision-fence file then passed 23/23 locally,
with targeted lint PASS. GitHub will independently re-run the corrected head.
AB/C, PROCESS, Feedback and IPQC-C CI were already successful on `6263b3d6`.

## Windows compatibility fixture follow-up

At head `940b0b5a`, A/B integration CI independently passed core 272/272,
browser 186/186, compiled full-app 4/4, guarded build and both synthetic
performance runners. AB/C, PROCESS, Feedback and IPQC-C CI also passed.
Windows Local safety subsequently reported failures in the performance/departure
and shared submission contract stages. Local reproduction found outdated
extracted-fixture dependencies: photo receipt/cleanup/history closures and
history display epoch, plus a normal legacy HTTP request missing its expected
actor header. The fixtures now load the actual source declarations and current
owner metadata. No executable product source or CI gate is changed.

After correction: actual departure bindings 154/154; entire performance and
departure group 453/453 plus all six paired synthetic comparison scripts PASS;
entire shared submission group 212/212; targeted lint PASS. Missing-closure
negative controls and all original permission, snapshot, cancellation and
zero-write assertions remain enforced. These fixes await a fresh Windows run
on the uploaded successor.

## Equipment-to-A/B compatibility follow-up

At uploaded head `980632b6`, A/B integration (272 core, 186 browser, 4 compiled),
AB/C, PROCESS, Feedback and IPQC-C CI passed. Windows Local safety passed the
previously repaired departure and submission stages, then exposed a real
equipment-to-A/B compatibility gap: the existing transfer client supplied an
actor ID but omitted the A/B API expected-actor header. The client now pins
`X-Process-Expected-Actor` to the original transfer dialog owner. Fresh server
authorization, owner/intent checks and CAS remain required. Its script cache
tag advances; exact historical source projections now include this narrow
equipment change without masking arbitrary changes.

The compiled transfer suite passes 7/7 across desktop zh and 390px vi; transfer
ownership/save regressions pass 27/27, photo routes 19/19, navigation/cache
contracts 72/72 and the repaired direct inverse proof 53/53. Normal synthetic
A/B photo and transfer setup requests now supply their actual expected actor;
anonymous, wrong-actor and permission-refusal cases remain unchanged. Guarded
build, lint and full TypeScript pass.

The Windows snapshot/source stage was also exercised locally in original
command order: commands 1–46 passed. Command 47 (`snapshot-adapters`) reaches
18 passing cases, then its existing Windows UNC-path assertion fails on Linux
because `path.resolve` treats the Windows path as relative. This unrelated
main-source behavior is not changed in the A/B integration; the actual Windows
workflow remains the cross-platform acceptance gate. Remaining commands 48–50
(chunked/ZIP profiles and Sites security) also passed locally. No snapshot permissions
or CI conditions were relaxed.
