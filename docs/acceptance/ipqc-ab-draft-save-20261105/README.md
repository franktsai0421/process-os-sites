# IPQC A/B local editing and atomic Save — Draft PR #82

## Delivery and source

- Branch `local/ipqc-ab-draft-save-20261105`; **depends on #77**.
- Draft [PR #82](https://github.com/franktsai0421/process-os-sites/pull/82) base `integration/draft-save-20261104`, pinned to
  `0af6d57e912e5615250959c9e76210fecd55d96b`. The task's remote read matched
  that head and main `85fa4a36442b3b72323eb4a6eeb105b867c4856a`.
- Server stage commits `9668851`, `5a56857` are ancestors. Reliability candidates
  `a0e4782` / `7db9af0` remain intact on `work` and
  `preserve/ipqc-ab-reliability-20261104`; no blind cherry-pick over #77.
- AGENTS, HANDOFF and applicable specs read; no repository `.agents/skills`.
- #69 is closed/unmerged according to parent evidence; no action taken on it.
- Parent approved identified Begin + Save after the server-stage decision.
  Earlier architecture hold is resolved. The new acceleration source was uploaded
  through the normal GitHub review path after its separate authorization; the
  earlier denied delivery remains outside this PR and must not be retried.

## PR #82 CI fixture follow-up (2026-11-05)

The first remote head `9b01f5f86bc7551f4473cd05faf8e330de27c14e` has the same
source tree as local `67ba584`. [Run 41977892070](https://github.com/franktsai0421/process-os-sites/actions/runs/41977892070)
reports step 10 (new A/B flow) PASS, step 14 (performance/departure) FAIL and
step 17 (manual synchronization/submission) FAIL. While the job is running,
its downloadable log returned `404 BlobNotFound` during initial diagnosis.
Local reproduction is recorded separately below; the PR update records final
remote-log correlation when the old job reaches a terminal state.

Local reproduction identified two unmigrated VM fixtures: departure bindings
still expected the previous shared group Apply/Save behavior and omitted the
actual `localPending`/local editing closures (23 failures among 444 cases);
submission pinning omitted `localScopes`, `localDirty` and the actual
`saveLocalModule` admission path (8 failures among 207 cases). Only these two
test files and documentation change in the repair; product code, permissions,
workflow, time budgets and pinned performance baselines remain unchanged.
Actual source declarations are now required exactly once, so missing extraction
fails explicitly. AB shared-only changes no longer imply a departure Save;
local snapshots are abandoned with zero writes. The obsolete AB departure Save
race is replaced by zero-write local handoff races; explicit Save stale-ACK
coverage remains in the existing caller/browser suites.

The migrated checks retain shared-state byte comparisons, zero dispatch on
unsaved input, original saved-ID/revision/generation pinning, late
identity/epoch/delivery refusal, revoked/pending guards and original unknown
receipt/sent-snapshot obligations. New cases cover multiple local groups,
completed/late local edits during Submit, and unknown departure without replay.
UI-only redraws from the current module refusal path are distinguished from
transport/helper/confirmation calls; other modules retain their original
zero-call admission assertion.

Local validation (Linux, Node 24, isolated synthetic inputs):

- PASS: complete step 14 command chain, exact `ca664797` six-file baseline hashes;
  baseline tests 2/2, departure/performance node group 447/447, and all six
  subsequent authoring/master/IPQC scripts. `/tmp/ci82-step14-final.log`.
- PASS: step 17 auth/replay 54/54 (`/tmp/ci82-step17-auth.log`), and full
  contract group 211/211 (`/tmp/ci82-step17-final.log`).
- PASS: A/B actual-handler/Chromium suite 11/11,
  `/tmp/ci82-browser-regression.log`, including desktop/narrow local edits,
  first/subsequent Save, matrix peers, unknown Begin/Save reload, legacy receipt,
  permissions, cancellation, polling and synthetic photos.
- PASS: scoped repository oxlint and diff whitespace checks. An initial direct
  ESLint invocation was unavailable because this project uses oxlint; the
  supported package lint command passed.
- Full build/TypeScript/compiled acceptance are reused from the unchanged
  product source. New exact-head Windows CI remains required. Physical devices,
  native IME, real data and live Site remain NOT_RUN.

## Behavior and data safety

Forms, new errors/items, deletes and matrix edits stay in page memory. Finishing
or canceling a form sends no workflow POST. Original group bases and local
snapshots survive group/line selection and language changes. Polling does not
adopt over local editing, including a read already in flight. Departure discards
only unsent local input. Photos remain blob previews until explicit Save.

The employee presses Save once. A missing module workflow first uses identified
Begin, then Save. This first initialization is **two POSTs/two transactions**;
Begin does not save edited content. Existing drafts use one Save POST/one final
shared-state CAS for the complete module. Empty local start/cancel does not
initialize shared state. No claim that first initialization is one transaction.

`save-local-v1` builds a request-private root using existing A/B adapters:

- Original generation/baseId checked per affected group. Scalars use exact
  original field guards; equal desired values converge. Matrix membership
  changes only touched booleans, retaining other cells and peer fields.
  Same boolean result converges; actual scalar conflicts show mine/current and
  require a choice plus another explicit Save. Removed rows/generation changes
  remain conservative refusals, not automatic rebases.
- Creates allocate server codes and map temporary parent IDs in the same Save.
  New groups may be initialized inside that Save when their null basis matches.
  Deletes guard the original row; references and peer edits reject. Any later
  failure rolls back all candidate group edits/allocations.
- Backend edit permits Save. Nested create/delete still require their own rights;
  Submit remains separate and cannot send old saved content over local changes.
- Shared core extensions are opt-in: exact A/B module endpoint/scope for bounded
  recovery and identified Begin; optional server `requiresCreate`; bounded A/B
  original-response rejection proofs. No global permission/default change.
- No migration or cleanup of working/saved/pending/formal/history/unknown anchors.
  Legacy numbering and review adapters retained. Photo objects can precede a
  rejected Save; existing content-addressed uploads may remain unreferenced,
  and this task does not delete them.

Unknown Begin stops before Save. Unknown Save/Begin keeps the original durable
marker; receipt 404 never proves no write. Reload discovers it and offers an
explicit original-receipt query. Query never repeats POST or automatically
continues Save/Submit. Runtime command/sent snapshot and error causes remain in
memory; persistent #77 markers contain receipt identity, **not business content**.
Unsent content is intentionally discarded on departure/reload. This does not
provide cross-browser recovery, persistent private drafts or recovery after
manual browser storage deletion. Older group/module operation markers are
queried through their original endpoint, never converted into new operations.
Old unidentified Begin retains its preexisting conservative barrier.

## Executed verification

Node 24 / managed Linux / Chromium `/usr/bin/chromium`, isolated SQLite and
Map-R2, synthetic sessions/data only. Browser routes invoke actual source handlers;
no live service or actual business record is involved. Fixture stubs only the
surrounding application mount/reference widgets, not workflow handlers or ACLs.

- `tests/ipqc-ab-local-save.test.mjs`: 11 route cases; one revision, replay,
  different cells/fields, same-field conflict, allocation rollback, temporary
  references, new groups, cross-group atomicity, deletion/reference checks,
  permissions, missing receipt and forced CAS retry. PASS.
- Combined A/B route + identified Begin contracts/receipts + #77 FQC/IQC/C Save
  and recovery/navigation regressions: **189 PASS**, `/tmp/ab-final-regression.log`.
- Current shared A/B create transport and Canvas atomic Save client/handler/stack:
  **93 PASS**, `/tmp/ab-transport-canvas.log`.
- Real browser local-flow cases: desktop 1280/zh and narrow 390/vi; initial and
  later Save; scope selection; lost Begin/Save ACK, receipt 404, departure/reload
  and original lookup; edit-only Save; two-editor distinct cells and true field
  conflict; saved-only Submit; simulated composition/language/poll retention;
  deferred synthetic photo upload; old group unknown recovery; empty start.
  **11 PASS / 0 FAIL**, `/tmp/ab-browser-final-all.log`.
- Earlier server stage: legacy multi-scope lifecycle 8 PASS, history VM 9 PASS,
  numbering 4 PASS. Numbering VM loader was repaired using the existing TS loader;
  original allocation assertions retained.
- Full lint and TypeScript passed (`/tmp/ab-final-lint.log`,
  `/tmp/ab-final-tsc.log`); final source checks/build recorded below.

The four immediate-POST caller suites have now been migrated **in place** to
current source, a real Chromium DOM and actual workflow handlers. No pinned
historical UI or opt-in source override is used by the current tests. Historical
204-case compatibility results remain evidence for the earlier stage only; the
migration consolidates duplicated VM setup and aligns the assertions with the
new write boundary. No test is skipped to make the old suites green. Their
original source remains recoverable at `518c409`; pre-edit copies also exist at
`/tmp/ab-test-migration-original/` in this environment.

### Migration coverage and findings

| Previous immediate-Apply invariant | Current assertion and evidence |
| --- | --- |
| Apply/create/matrix request count and exact sent batch | Forms and matrix emit zero POST/PUT and leave the complete storage snapshot unchanged; explicit Save commits one module batch. `ab-sent-batch`, `ab-create-next-batch`. |
| Input entered during an ACK must never be discarded or silently rebased | Save disables editing; detached handlers cannot append to its batch. Forced late local mutations retain original bases, command/snapshot and a fence against duplicate creates. Safe departure can retire the settled fence and start from authoritative data. |
| Old actor/epoch/delivery/host/tab/client/generation/lifecycle/revision/modal/operation cannot adopt or clean newer state | Pre-dispatch and every asynchronous completion are pinned to the original context. Late completion neither cleans local entries nor unlocks a newer busy attempt. Foreign identity loads quarantine original DOM without joining a new model. `ab-sent-batch`, rejection and unknown suites. |
| Created IDs/codes/parents, other local guards, malformed ACK rows and asynchronous photo aliases | IDs/parents/codes are allocated inside Save. Untrusted ACK rows are not adopted: a fresh authorized read supplies the real model. Tests retain missing/duplicate/deleted/parent/code/source/snapshot corruption cases and exact no-duplicate/state checks. Deferred photo upload keeps original row/array aliases and cannot continue Save under a replacement context. `ab-create-next-batch`. |
| Actual pre-CAS refusal may clean only its own proof; HTTP flags and cleanup failures cannot unlock creates | Real handler 422/409 proofs are checked by request UUID, scope and guard path. Missing/forged proof and post-commit HTTP failures remain unknown. Cleanup quota retains exact/foreign markers. Explicit retry uses the original private rejection proof without POST; corrected Save is a later action. `ab-create-rejection-caller`. |
| Receipt 404/malformed/late/foreign proof cannot authorize reconstruction or replay | Both runtime-present and reload-without-snapshot paths retain markers on missing/invalid receipt or unauthorized/stale readback. Valid original receipt plus fresh readback may settle without manufacturing a sent snapshot or repeating POST. Detached A query cannot switch to B. Peer Save after the original is preserved and displayed. `ab-create-unknown-map`. |
| Cancel, scope switches, polling, permission loss, references/history remain intact | Cancel and departure affect unsent memory only; A/B scopes save together. Poll and in-flight reads preserve original local guards. Real handler reference/rollback/ACL tests and original multi-scope/history/numbering assertions remain. |

The migrated assertions exposed and fixed A/B caller gaps rather than exempting
them: Save admission did not check the retained input owner; completion checks
omitted several UI/model boundaries; changed post-dispatch temporary rows could
be submitted again; old query handlers could inherit newer operations; and a
reload's stale working copy could hide a later peer Save after recovery. The
fixes are A/B-specific. The shared core, database schema and account rights were
not changed in this follow-up.

`localSent` is retained until a definitive settlement and unchanged snapshot,
or deliberate local abandonment after the transport has already settled. An
unexpected mutation of a sent snapshot pauses further Save instead of guessing
how to map temporary rows. Original receipts/unknown markers remain recoverable;
normal UI editing is blocked during Save. This rare forced-race condition may
require leaving and returning to the authoritative saved version.

The CI source workflow now invokes these suites and covers the intended exact
integration base. Browser fixtures prefer an explicitly configured executable,
then installed Linux Chromium, otherwise Playwright's installed browser. Local
checks do not constitute a Windows or hosted CI run.

## HTTP counts and timing scope

Editing emits zero workflow POSTs. First Save emits Begin + Save (2); subsequent
Save emits 1. Lost Begin test emits 1 total; lost Save test emits 2 total including
initial Begin; receipt query, departure and reload add no POST. A photo Save also
emits one PUT per newly staged photo. Reference/read GETs are not writes.

Browser timings measure explicit click through settled UI, excluding typing and
fixture login/setup, in one isolated in-process handler bridge. Initial and
subsequent states differ; these are descriptive observations, not a before/after
speedup benchmark, cold production budget, network RTT or test-site improvement.
No warm-up or relaxed timing/permission assertion was used. No comparable live
baseline is available. Final raw samples: desktop initial 263 ms / subsequent
221 ms; narrow initial 245 ms / subsequent 209 ms (one sample each). These
conditions differ and do not establish a percentage speedup.

## Remaining limits / risks

NOT_RUN: hosted/compiled full-shell browser, physical phone/native IME,
real deployment timing, real concurrent employees, remote exact-head CI. Simulated
composition events are not physical keyboard acceptance. Reference rendering is
stubbed in this browser fixture; server deletion/reference checks are real.
Two editors' field/cell semantics and rollback are covered; all possible master
catalog lifecycle changes are not exhaustively browser-tested. First Begin/Save
may initialize a draft even if Save later fails; no edited content is then saved.
Failed/unknown operations preserve identity and do not self-retry.

NOT_IMPLEMENTED by design: single-transaction first initialization, persistent
private local drafts, cross-browser recovery, data cleanup or migrations.

## Upload hold — unchanged

Action: earlier `create_tree` upload of the A/B integration candidate.
Target: public source-only `franktsai0421/process-os-sites`.
Reason: automatic approval review denied twice; exact original reason unavailable.
Outcome: **DENIED previously; NOT_RETRIED here**. Local edits/tests are authorized.
No push/create_tree/PR/merge/deploy/connector reconnection or live unknown action.
General instructions to continue do not lift the refusal. Source delivery must
exclude real data, photos, backups and credentials.

## Previous build and commit evidence

Product source commit: `21409189dc3f3d92fbaa2dca82b3c6c5bebc214b`.
`PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) npm run build` completed with
`PASS_BUILD_EXIT0_AND_POSTBUILD_KNOWN_AUTH_CLIENT_CHECK`, child/command exit 0,
postbuild authentication check 1 PASS / 0 FAIL. Log `/tmp/ab-ui-build-final.log`.
No build guard was bypassed; generated server artifacts remain local and are
not approved for public distribution. Final lint, TypeScript and diff checks
passed. The following documentation-only evidence commit does not alter built
product source. Local tree was clean before this documentation update.

Previous-stage accounting: 11 browser + 189 related API/core/navigation + 93 transport/
Canvas cases PASS; 204 legacy-UI compatibility cases PASS separately. At that stage the immediate-POST caller harnesses were interrupted; the
follow-up migration above supersedes that outstanding item. Earlier-stage 8 lifecycle / 9 history /
4 numbering checks remain recorded above. Physical-device, compiled full-shell
browser and live-site checks NOT_RUN; publication BLOCKED by the earlier denial.

## Migration follow-up validation

Current-source four-suite migration: 35 sent-boundary, 44 create/allocation,
30 rejection-proof and 57 original-receipt/reload cases, plus the existing 11
browser cases. Final combined current-source run: **177 PASS / 0 FAIL /
0 SKIP / 0 CANCELLED**, `/tmp/ab-migration-final.log`, exit 0. The migrated
four suites account for 166 of these cases; no historical UI source override
was used. Repeated earlier runs are not added to this total.

- Core/navigation/Begin/FQC/IQC/IPQC-C related suites: **321 PASS / 0 FAIL**,
  `/tmp/ab-migration-core.log`.
- Shared A/B create transport + Canvas atomic Save suites: **93 PASS / 0 FAIL**,
  `/tmp/ab-migration-transport.log`.
- Cache/bootstrap/script integration checks after A/B cache tag update:
  **92 PASS / 0 FAIL**, `/tmp/ab-migration-assets.log` (overlaps some core tests;
  do not add overlapping cases to a unique total).
- Original numbering assertions PASS, `/tmp/ab-migration-numbering.log`;
  original multi-scope lifecycle 8 PASS, `/tmp/ab-migration-multiscope2.log`;
  original history-entry 9 PASS, `/tmp/ab-migration-history3.log`.
  Their renderer/history harnesses now supply the real bounded client's current
  identity/storage ports. History still checks exact owner rejection before
  any GET; its current rejection code is `BEGIN_OWNER_CHANGED`. No business
  assertion or permission was removed. Template/VM limits remain explicit.
- Full TypeScript PASS, `/tmp/ab-migration-tsc.log`; lint corrections removed
  unused imports/parameters and obtain intentionally saved storage methods via
  property descriptors. They do not suppress lint rules or alter assertions.

Unknown reload is explicitly tested with `localSent === null` and no local
entries. Receipt HTTP 401/403/404/422/503, wrong operation/generation/revision,
malformed receipt fields, and failed authoritative readback never clear the
original marker, announce success or send another POST. With a valid original
receipt plus current authorized readback, recovery does not need private draft
content and does not reconstruct it. A peer's later Save remains intact and is
shown after recovery. Unknown Begin still never continues Save automatically.
The UI explicitly states that the original result remains unconfirmed.

NOT_RUN remains physical phone/native IME, full compiled-shell browser, Windows,
real employee concurrency, live-site operations and remote CI. No full
repository-wide 393-file suite or unrelated deployment/data-transfer tests are
claimed. The earlier upload refusal remains in effect; no denied action retried.

Final follow-up product commit: `b4e2af9be6772484fe06230f8309bb149f043c69`.
The complete build on that commit passed
`PASS_BUILD_EXIT0_AND_POSTBUILD_KNOWN_AUTH_CLIENT_CHECK`, command/child exit 0,
postbuild authentication check 1 PASS / 0 FAIL. Log `/tmp/ab-migration-build.log`.
Full lint and TypeScript on the same source passed:
`/tmp/ab-migration-lint-final.log`, `/tmp/ab-migration-types-final.log`.
`git diff --check` passed. Build artifacts remain local and are not approved for
public distribution. A following documentation-only commit records these facts.

The prior one-sample timings above are previous-stage observations. Migration
runs under concurrent browser/build load are correctness checks and are not a
performance comparison. No cold-start or request deadline was increased, no
permission was relaxed, and no test assertion was disabled or skipped. Initial
migration failures led to the caller fixes listed above and are resolved in
the final run. Earlier interrupted old-UI harness results are superseded by this
completed current-source run, not counted as passing evidence.

No additional local execution blocker remains for this migration. Remaining
acceptance limits are the NOT_RUN items above and the unchanged upload denial.
No push, PR creation, merge, deployment, live unknown, real record or connector
operation occurred during this follow-up.

## Fixed-candidate compiled follow-up

Independent read-only review and Linux full compiled-shell acceptance were attempted
on exact `8c773a4`. Final desktop/Chinese and narrow/Vietnamese compiled cases passed (2 PASS / 0 FAIL),
including four synthetic groups, both whole-module withdrawal entries and explicit
self-review approval. Desktop additionally covers silent departure and lost-ACK
reload recovery; limited-role/physical-device/live-catalog gaps remain explicit. See [itemized evidence and commands](compiled-8c773a4.md).
Product source is unchanged; prior source-level checks retain their stated scope.

Targeted compiled follow-up closes the specified narrow unknown and restricted-role
checks: each targeted case passed, using the same 8c773a4 build. Four synthetic
capability profiles were checked through real compiled UI/API; no-view entry
still shows a generic loading failure, so normal denied-role shell readiness is
not claimed. See the linked compiled report for exact assertions and limits.

Permission wording clarification: the restricted fixture's independent raw save
cell is false, but edit derives effective module Save=true. Compiled permission
metadata and successful UI Save are now asserted explicitly; Submit remains false
and rejected. The phrase "修改但無保存權" did not describe the effective behavior.
See the compiled report's clarification; no product or user rule changed.
