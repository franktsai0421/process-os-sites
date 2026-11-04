# FQC flow latency — independent candidate, not deployed

Current integration base: main `6247c00220bf366e41c92c5b684d9f9744076cad` (merged IQC #71).
Original FQC base: `35949445ad073812863c0004acbee13ed3535747`.
Branch: `codex/fqc-flow-performance-20261104`; [Draft PR #72](https://github.com/franktsai0421/process-os-sites/pull/72). Scope: source changes, synthetic
verification, independent review and a separate Draft PR. No PR merge, deployment,
real business-data write, credential/access change or pending V31 unlock.

## Integration with merged IQC #71 / main6247

The previous successful CI run `41767225296` verified #72 against main359. It is
historical evidence, not acceptance of this integration. Main6247 includes IQC
unknown-result recovery, scoped server timing, shared-client changes, the new IQC
CI suite and the intentionally changed bounded IQC 45-second deadline expectation.

The three text conflicts were new sections at the top of `HANDOFF.md`,
`AI_CONTEXT/CHANGELOG.md` and `AI_CONTEXT/modules/QUALITY.md`; both histories are
retained with a new integration note. The common route and CI YAML merged without
text conflicts. Static review confirms IQC timing/finalization and FQC's strict
outer-envelope/classifier guards are both present. The shared client and IQC files
are retained from main6247. No independent partial-writer capability, domain
validation change, unknown-result relaxation or schema/data change is added.

Both benchmark scripts now compare against exact main6247, while their historical
main359 results remain in Git history. The fixture whitelist adds the exact new
base without removing older pinned references. Existing inverse-baseline pins and
negative contracts are unchanged. Updated integrated measurements and validation
receipts below are separate from pre-integration results.

Integrated local checks: 320 core tests, 45 native Chromium tests (43 FQC and
2 IQC), original record-mutation 57 groups and lifecycle8 178 groups, typed lint,
TypeScript, 71 inverse/EOL contracts, identity baseline, 14 Sites delivery source
contracts and Sites source boundaries PASS. The native checks cover 390/1280 px
and zh/vi. Independent static review confirmed both implementations are retained;
no product blocker was found. Build and fresh complete PR CI remain required.
Prior results below retain their pinned source/commit context.
The earlier branch-protection read was denied (`Forbidden`); it has not been
retried through another path. This integration does not authorize PR merge or
Site deployment.

## Pre-integration CI follow-up — restore conservative POST admission

Full CI for head `6541e13`, [run 41762598326](https://github.com/franktsai0421/process-os-sites/actions/runs/41762598326),
failed in `scripts/test-fqc-record-mutation.cjs:87`. Its mixed
`{action:"begin",command:{action:"apply",...}}` envelope must follow Begin. The
read-ahead opt-in checked only the inner command, so it incorrectly enabled
speculation before the outer Begin dispatch. With a missing unrelated tooling
body it returned the same 500 and attempted zero writes, but fetched one extra
11-byte aggregate (15 GET / 14,493 bytes rather than 14 / 14,482). This was a
product scheduling/fault-observation regression, not a reason to relax the test.
The earlier claim that all Begin paths were unchanged was too broad.

Expanded local validation also caught `test-fqc-lifecycle8-record-mutation.cjs:120`:
unsupported Save fields incorrectly enabled speculation (16 GET rather than 15).
The repair requires an exact command-only outer envelope and reuses the existing
ordinary Apply/Save classifier. A private matrix read-scheduling classifier
allows only its known envelope fields, valid common identifiers/sequence/generation,
and an input object containing only the `items`/`products` arrays. Unrecognized
command/envelope shapes and selector-bearing commands retain the original serial
fallback.
Matrix still uses its original full dependency reader, context, validation and
writer; this classifier grants no partial-write capability. Row/domain validation
continues at its original phase. Exact route/scope guards remain unchanged.

The original two integration scripts and their exact assertions are unchanged.
Eighteen new route regressions cover healthy/missing-body Begin+Apply/Save,
unknown outer/command fields, forbidden matrix fields, malformed identifiers
and input shapes, and normal Apply/Save/matrix. On the original `6541e13` source,
all 15 negative cases fail while the 3 positive cases pass; on the repaired
source all 48 read-ahead tests pass. They assert complete GET/text observations,
unchanged D1 rows/R2 objects, zero attempted writes and retained normal overlap.

Pre-integration repaired product hashes: `state-records.ts`
`792cdde3070c1048083d10076b345cb5b3d0284e5a17099c2be167db57f87c1e`;
`versioned-shared-workflow.ts`
`8dbb9d6bf06b92a147d882531f47e1beaf354617417754f88acd27c065147914`.
Pre-integration post-repair measurements at `a910f42` passed all 80 native
browser and 140 route/client samples with unchanged paired counts/bytes. Those
artifacts remain in Git history; the current tables below are newly measured
against main6247. The pre-repair verification section and build receipts remain
historical.

Confirmed local repair checks: 173 core tests (48 read-ahead, 80 required
dependencies, 45 Apply reliability), 43 native Chromium tests (4 Apply,
25 unknown/recovery, 14 abandonment), typed lint, TypeScript, 71 inverse
contracts, original identity baseline and Sites source boundaries PASS.
Independent review separately passed all 48 read-ahead tests and both untouched
integration scripts: record mutation 57 groups and lifecycle8 178 groups.
Process Save 38 groups and Process Flow 114 groups also passed. These overlap
parts of the full-stage run and are not additive acceptance totals.

The full previously failing CI stage was then exercised locally: 130 of its
131 commands exited zero; the remaining grouped command passed 217 tests but
its native `powershell.exe` exit-propagation test is unavailable on Linux. That
Windows-only test is unchanged and remains required in official CI. A separate
browser startup initially lacked the default Playwright cache; its supported
`CHROME_PATH=/usr/bin/chromium` option used the installed native Chromium and
the test passed. No test assertions, deadlines or CI gates were changed.

Normal build stamped with repaired product commit
`a020ee30ebdcba8d2f2d6a58b0af00d283c4a4cb` and the known public-auth client
check PASS: [safe build receipt](build-result-admission-fix.json). This does not
approve distributing compiled server output. The repaired exact-head GitHub CI
result is tracked on [PR #72](https://github.com/franktsai0421/process-os-sites/pull/72)
and remains required; local checks are not a substitute for the full Windows run.
Independent final source/document review found no remaining local blockers and
recomputed the measurement tables from raw samples, verifying all source hashes
and paired counters.


## Incident evidence and what was reproduced

The task supplied v39 UI observations from 2026-11-04: adding an error took over
a minute to finish the screen flow; saving/accessing a draft took roughly 20+
seconds. There is no retained waterfall for those interactions. Neither number
is a measured duration for one API request.

The earlier read-only log summary supplied with the task contains seven
successful FQC POSTs (wall 5.85–12.43 s, median 7.84 s) and eleven full GETs
(wall 4.00–6.11 s, median 4.98 s). These remain attributed prior observations:
the older samples could not be independently re-extracted or correlated to the
minute-long UI operation. The initial new query returned eleven errors-only
events and no FQC; that filter did not establish that successful FQC was absent.
A corrected read-only query (`errors_only:false`, 240-minute window, latest 100
entries) returned twelve successful FQC GETs carrying `since`, `caseMetadata`
and `compact` parameters: wall 1.810–2.626 s, median 2.1835 s; CPU 18–26 ms,
median 23 ms. These are **current unmodified-site observations**, not candidate
results. Status 200 plus `since` does not prove an unchanged response or a
preflight-only path. They cannot substitute for full-GET or UI timings. The
wall/CPU gap points to waiting outside CPU, but does not isolate R2, D1 or network
latency. The latest-100 result did not contain the earlier POST/full-GET sample.
[Sanitized live-log summary](live-log-summary.json). No real-data POST or live
performance probe was attempted.

The exact-main synthetic handler/client reproduced the serial cost structure:
Apply/Save is one POST followed by one mandatory fresh GET; each GET selects
independent authority and domain snapshots. Authority audits can themselves
require immutable body reads. Multiple selected aggregates were waited on in
sequence, in addition to sequential nested body hydration. The matrix command
uses the existing full dependency reader, so it also traverses unrelated
aggregates. The measured per-action I/O counts below include all these checks.
This establishes a storage-round-trip amplification mechanism, not the precise
cause of every second of the original live interaction. R2/D1 placement, live
payload sizes, network transfer and UI rendering were not measured here.

## Implementation and preserved boundaries

- `RecordRead.aggregateReadAhead` is server-only and enabled for the exact FQC
  GET route, required-dependency Apply/Save phases and Apply/Save fallback reads
  (including whole-matrix Apply). Other adapters, selectors with `scope`,
  identity-read tokens, legacy formats and Begin/review/restore POST paths keep
  their existing behavior. No browser code, wire format or deadline changes.
- A request-local reader overlaps fixed windows of at most five **aggregate** GETs. It never
  speculatively consumes the next object's text, SHA or JSON. The current
  aggregate's nested bodies and projection complete before next aggregate text
  is consumed. Nested body reads remain serial; they may coexist with up to four held
  aggregate streams. The window is not refilled while pending entries remain.
  A synthetic stream-occupancy regression, including nested bodies, peaks at five;
  actual provider buffering and memory consumption remain unmeasured.
- Any repeated key ends the current speculative window and is read later, separately. Invalid/null next
  pointers cannot mask an earlier GET/integrity/JSON error. No cache survives a
  phase or snapshot; required POST authorization finishes before any business
  aggregate request, and both terminal-GET snapshots independently reread.
- Fault observation changes by allowing up to four later valid selected aggregate
  GETs to start before the current aggregate completes. Thus an early rejection
  may start up to four unnecessary selected reads. No next text is consumed;
  all unused streams are cancelled when available;
  late GET rejection/cancellation failure cannot replace the earlier error.
  No extra module is selected. Missing/corrupt required objects still fail closed.
- Full structural checks, original dependencies and allocation history, immutable
  writes, fresh revocation checks, revision/CAS retries, idempotent receipts,
  manual Save and unknown-outcome protection are retained. Matrix still reads
  its full existing closure; it does not gain the narrower ordinary-form writer.

## Integrated candidate — native browser end-to-end measurements

Reproduce with `node scripts/benchmark-fqc-browser-flow.mjs`. This is a fresh
post-integration run against main6247 using native Chromium at 1280 px in Chinese, the unchanged real
FQC component/client, actual guarded TypeScript routes and ephemeral SQLite/R2.
Timing starts at the DOM button click and ends at usable UI, closed form, clear
unknown state and two animation frames. Every action must perform exactly one
POST and one fresh GET and pass an independent stored-content oracle. Boot/Begin,
text entry and the oracle are outside the window. Five pairs alternate execution
order; all 80 samples pass, with no discarded sample and equal paired SQL/R2 counts.
It ran alone after all local tests/reviewer probes completed. Source hashes are
checked before and after timing and include the DOM measurement helper.

This is the complete component action through storage and UI settlement,
**not the live full application shell, HTTP/TLS path or compiled workerd**.
The 256-item synthetic fixture and 200 ms per-R2-GET sensitivity scenario are
assumptions, not measured live size/latency or a calibrated deployment forecast.
SQL and PUT wait is 5 ms. The no-added-wait profile separately exposes local
UI/CPU overhead. All UI timings include mandatory readback; API part medians
need not add to the whole-flow median.

| Click to usable UI | No added wait, median s before → after | 200 ms R2 sensitivity, median s before → after | Sensitivity max s before → after |
| --- | ---: | ---: | ---: |
| Existing error Apply | 0.280 → 0.258 | 5.392 → 3.154 | 5.443 → 3.196 |
| New error Apply | 0.246 → 0.234 | 5.592 → 3.367 | 5.601 → 3.386 |
| Matrix Apply | 0.234 → 0.261 | 7.982 → 4.766 | 8.025 → 4.788 |
| Save | 0.278 → 0.274 | 5.593 → 3.400 | 5.638 → 3.438 |

| Sensitivity flow | POST median s before → after | Fresh GET median s before → after | R2 GET / SQL, unchanged |
| --- | ---: | ---: | ---: |
| Existing error Apply | 2.504 → 1.507 | 2.652 → 1.448 | 28 / 14 |
| New error Apply | 2.731 → 1.727 | 2.652 → 1.450 | 29 / 15 |
| Matrix Apply | 5.100 → 3.097 | 2.649 → 1.448 | 41 / 13 |
| Save | 2.736 → 1.731 | 2.655 → 1.447 | 29 / 14 |

[All 80 post-integration native samples](browser-performance-summary.json).
No-wait values are retained in the table; this is not a universal speedup
claim. Required bodies, authorization, immutable writes and independent terminal
snapshots still cost time. This does not prove the original minute-long incident
is resolved. Mobile/Vietnamese regressions establish behavior, not performance.
Pre-integration samples remain available in Git history at `a910f42`; their hashes
were not relabeled as integrated-source evidence.

## Integrated candidate — route/client read coverage

A fresh separate run of `node scripts/benchmark-fqc-flow.cjs` covers full and
saved draft reads, receipts and writes through actual handler/client fixtures.
It is not browser timing. All 140 samples pass, with paired storage counts,
consumed bytes and response bytes equal. No other tests or benchmarks overlap.
The 30 ms and 200 ms scenarios are distinct artificial sensitivity cases.

| Handler/client flow | No added wait, median ms before → after | 30 ms R2 / 5 ms SQL+PUT, median ms before → after |
| --- | ---: | ---: |
| full-read | 12.42 → 11.18 | 408.22 → 226.83 |
| existing-apply | 62.89 → 60.87 | 912.19 → 576.70 |
| insert-apply | 56.06 → 58.92 | 945.43 → 610.75 |
| matrix-apply | 47.53 → 52.40 | 1289.93 → 804.46 |
| save | 99.05 → 95.18 | 981.59 → 637.35 |
| receipt | 6.21 → 6.19 | 436.10 → 253.36 |
| saved-read | 16.27 → 16.94 | 448.65 → 264.68 |

[All 140 post-integration route/client samples and counters](route-performance-summary-window5.json).
Any no-wait regressions are shown, not discarded.

## First-round paired measurements — two-read window, historical

These retained results belong to the first-round two-read window at `4702567`,
not the final five-read candidate. The reusable command is `node scripts/benchmark-fqc-flow.cjs`;
running it on the final source measures that final source. At `4702567` the script overrode the
exact main359 server files using Git objects, and ran the same then-current client
against candidate and baseline. Five pairs alternate execution order for every
profile. Seven actions include full read, existing/new error Apply, 256-row
matrix Apply, Save, receipt and saved read. Fixture initialization is outside the
window; actual handler, response-clone evidence and client settlement are inside.
No failed sample is discarded; successful paired SQL/R2 counts, consumed bytes
and response bytes are asserted equal. Source hashes are pinned before/after.

The fixture has 256 items with 512-character descriptions, one serialized
synthetic authority audit body, and six unrelated aggregates (16 KiB metadata,
32 KiB body each). This is not a claim about the real database's shape or size.
Controlled storage wait adds 30 ms per R2 GET and 5 ms per SQL/PUT. Those delays
are artificial and **not a deployment prediction**. No timing threshold is used
as a functional test.

| Whole flow | No added wait, median ms before → after | Controlled wait, median ms before → after | Controlled reduction |
| --- | ---: | ---: | ---: |
| Full GET | 13.08 → 11.06 | 411.28 → 319.56 | 22.3% |
| Existing error Apply + GET | 69.34 → 59.84 | 928.52 → 769.15 | 17.2% |
| New error Apply + GET | 57.14 → 62.32 | 970.76 → 806.76 | 16.9% |
| Matrix Apply + GET | 51.34 → 55.40 | 1300.74 → 1017.84 | 21.7% |
| Save + GET | 105.97 → 102.48 | 972.35 → 834.45 | 14.2% |
| Receipt GET | 7.44 → 7.21 | 437.91 → 345.58 | 21.1% |
| Saved full GET | 17.04 → 18.11 | 447.65 → 359.19 | 19.8% |

Controlled profile split (medians; medians of parts need not sum to whole):

| Flow | POST ms before → after | Terminal GET ms before → after | R2 GETs / SQL calls, unchanged | Consumed R2 bytes, unchanged |
| --- | ---: | ---: | ---: | ---: |
| Existing error Apply + GET | 476.39 → 413.20 | 445.59 → 347.91 | 28 / 14 | 633,837 |
| New error Apply + GET | 519.13 → 450.32 | 443.31 → 348.25 | 29 / 15 | 832,762 |
| Matrix Apply + GET | 848.79 → 662.20 | 440.17 → 349.02 | 41 / 13 | 1,152,676 |
| Save + GET | 518.67 → 469.16 | 438.87 → 349.53 | 29 / 14 | 879,898 |

[All 140 raw samples, ranges, CPU/wire/I/O counters and source hashes](performance-summary.json).
The no-added-wait profile has small regressions for insert, matrix and saved
read; this is not a universal CPU-speed claim. The earlier exploratory run
overlapped large test suites and is not used for this table. Full suites finished
before this run; an independent 1.74-second reviewer probe overlapped its early
no-added-wait window. The controlled-wait profile began after that probe ended.
No sample was dropped or adjusted. Real provider stream buffering and live R2
latency remain unmeasured.

## Pre-repair five-read window — verification and review, historical

The pre-repair runtime source is `state-records.ts` SHA-256
`792cdde3070c1048083d10076b345cb5b3d0284e5a17099c2be167db57f87c1e`;
`versioned-shared-workflow.ts` remains
`053cded33f0f639fc6b338c1db6be58ff32943d3f8244d5bfc9b24109e4537c1`.
The pre-repair measurement artifacts in Git history at `6541e13` pin those
source hashes. Current measurement tables/files above were rerun after main6247 integration
and pin the integrated route hash.

| Check | Final five-window result |
| --- | --- |
| Core actual-route safety | 155 PASS: 30 read-ahead, 80 required-dependency and 45 Apply reliability tests. Includes five-stream occupancy through nested bodies, 11-object window rollover, repeated-key boundaries, all four late cleanup paths, corruption, authority phases, revocation, CAS and receipt contracts. |
| Independent review | 30 read-ahead and 71 historical inverse contracts independently PASS. Reviewer checked original baseline pins/spans unchanged, runtime hashes and both measured artifacts. Final overall review of product commit `a5a9e99` and current evidence completed: no remaining blockers. These tests overlap mainline checks, not additional scenarios. |
| Static and historical checks | Full typed lint, TypeScript, original identity-prefetch regression, 71 LF/CRLF/inverse contracts, Sites source boundaries and diff check PASS. Changed-source/data scan: no findings. |
| Native behavior | 43 PASS on final source: Apply/forms 4, unknown/recovery 25, abandonment 14; Chromium at 390/1280 px and zh/vi. Includes lost ACK, no duplicate replay, 404/delayed commit, collaborator updates, Save/reopen and departure barriers. |
| Exact-source build | Normal `npm run build` PASS, stamped `a5a9e99b95118888d735d58cd17795e08fccfae4`; known public-auth client check PASS. [Final safe build receipt](build-result-window5.json). This is not approval to distribute compiled server output. |
| GitHub CI | Draft PR #72 exists. First-round head `79b9f9a` passed FQC forms/reliability, typed lint, TypeScript, build and compiled abandonment steps; full run was still in progress. A fresh exact-head run is required after the final evidence commit; PR status is the source of truth. |

The first typed-lint attempt in this round found two test-only `.sort()` calls
without explicit comparators. Both were fixed; the full normal lint then passed.
No runtime assertion, deadline, CI requirement or safety gate was relaxed.

## First-round verification and review — two-read window, historical

Environment: fresh managed Linux checkout; Node 24.19.0, repository-locked npm
install, ephemeral in-memory SQLite and synthetic R2, installed system Chromium.
No workstation connector was opened, recreated or reconnected.

| Risk / scope | Evidence and result |
| --- | --- |
| Required authority/dependencies, corruption, CAS, receipts and client settlement | Initial combined core suite: 196 PASS; includes ACK, authority bodies, Apply reliability, matrix-last-apply and the initial read-ahead tests. |
| First-round final malformed-pointer repair, cleanup, snapshot freshness, exact-route/other-adapter isolation | Final targeted suite: 106 PASS (26 read-ahead + 80 required-dependency tests). These overlap the initial suite; counts are not additive. |
| Unknown/generation recovery, known rejections, matrix multiuser, lifecycle and conflict discard | 85 PASS using actual routes and synthetic clients/DOM. |
| Native desktop/mobile-size forms, Save/reopen, unknown recovery and abandonment, zh/vi | 43 PASS at 390/1280 px using Chromium and actual handlers; not a physical phone or native IME acceptance. |
| Shared-reader compatibility and historical performance baseline integrity | Original identity-prefetch regression PASS; LF/CRLF/inverse negative contracts 71 PASS with original baseline/tail/prefix pins unchanged. |
| Static checks and source boundaries | Full typed lint, TypeScript, diff whitespace and Sites source-boundary check PASS. |
| Build | Normal `npm run build` PASS, stamped with candidate `47025673ea47455679fa6b7eeb65041641f44f7a`; known public-auth client check PASS. [Safe build receipt](build-result.json); this does not approve distributing compiled server output. |
| Independent review | Reviewer independently reproduced a null-next-pointer fault-precedence defect; fixed by validating next before inspecting its key. 14 targeted reviewer checks PASS on the final runtime hashes; this is a subset, not additional scenarios. First-round source/measurement/document review completed on `4702567`: no remaining blocking findings. |

The original dependency race fixture used a global `concurrentWrite` flag to
exclude a peer's nested reader; overlapping FQC reads could be mislabeled as
peer activity. It now prepares the peer's immutable state before measurement and
swaps the row at the same hook. The original exact three-business-read and
no-attempted-CAS assertions remain. No assertion or deadline was relaxed.

Initial typed lint found missing `void` on new test registrations and unbound
fixture methods; these were fixed and normal full lint passed. Initial npm
installation could not create its default cache outside the writable workspace;
the same locked installation succeeded with a task-specific `/tmp` cache. No
security refusal, authentication workaround or guard change was used.

## Data impact and remaining limits

No schema, migration, persistent keys, account permissions, data package or
business-record changes. The fresh checkout installed the unchanged locked
dependency set; no employee dataset, clone bootstrap/import or live backup/restore
was run. Those data workflows are outside this source-only task.

Required before claiming live acceptance: exact-head normal CI, Frank's review
and merge, separately authorized test-site deployment, then the same live UI
flow with a network waterfall and provider timing. The current candidate cannot
prove that the minute-long observation has been eliminated or that real FQC is
sub-second. IQC is a separate investigation; this PR does not alter its behavior.
