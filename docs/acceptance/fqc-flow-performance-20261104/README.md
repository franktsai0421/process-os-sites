# FQC flow latency — independent candidate, not deployed

Base: latest fetched main `35949445ad073812863c0004acbee13ed3535747`.
Branch: `codex/fqc-flow-performance-20261104`. Scope: source changes, synthetic
verification, independent review and a separate Draft PR. No merge, deployment,
real business-data write, credential/access change or pending V31 unlock.

## Incident evidence and what was reproduced

The task supplied v39 UI observations from 2026-11-04: adding an error took over
a minute to finish the screen flow; saving/accessing a draft took roughly 20+
seconds. There is no retained waterfall for those interactions. Neither number
is a measured duration for one API request.

The earlier read-only log summary supplied with the task contains seven
successful FQC POSTs (wall 5.85–12.43 s, median 7.84 s) and eleven full GETs
(wall 4.00–6.11 s, median 4.98 s). A new read-only Sites log retrieval during this
task returned eleven recent events, none for FQC. The older sample therefore
could not be independently re-extracted or correlated to the minute-long UI
operation. Its numbers remain attributed prior observations, not this task's
new measurements. No real-data POST or live performance probe was attempted.

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
- A request-local reader overlaps at most two **aggregate** GETs. It never
  speculatively consumes the next object's text, SHA or JSON. The current
  aggregate's nested bodies and projection complete before next aggregate text
  is consumed. Nested body reads remain serial; they may coexist with one held
  aggregate stream. This is not a claim that all resource types are capped at two.
- The same-key next reference is read later, separately. Invalid/null next
  pointers cannot mask an earlier GET/integrity/JSON error. No cache survives a
  phase or snapshot; required POST authorization finishes before any business
  aggregate request, and both terminal-GET snapshots independently reread.
- Fault observation changes only by allowing the next valid selected aggregate
  GET to start before the current aggregate completes. On an earlier failure,
  next text is not consumed and its unused stream is cancelled when available;
  late GET rejection/cancellation failure cannot replace the earlier error.
  No extra module is selected. Missing/corrupt required objects still fail closed.
- Full structural checks, original dependencies and allocation history, immutable
  writes, fresh revocation checks, revision/CAS retries, idempotent receipts,
  manual Save and unknown-outcome protection are retained. Matrix still reads
  its full existing closure; it does not gain the narrower ordinary-form writer.

## Paired measurements

Reproduce with `node scripts/benchmark-fqc-flow.cjs`. The script overrides the
exact main359 server files using Git objects, and runs the same current client
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

## Verification and review

Environment: fresh managed Linux checkout; Node 24.19.0, repository-locked npm
install, ephemeral in-memory SQLite and synthetic R2, installed system Chromium.
No workstation connector was opened, recreated or reconnected.

| Risk / scope | Evidence and result |
| --- | --- |
| Required authority/dependencies, corruption, CAS, receipts and client settlement | Initial combined core suite: 196 PASS; includes ACK, authority bodies, Apply reliability, matrix-last-apply and the initial read-ahead tests. |
| Final malformed-pointer repair, cleanup, snapshot freshness, exact-route/other-adapter isolation | Final targeted suite: 106 PASS (26 read-ahead + 80 required-dependency tests). These overlap the initial suite; counts are not additive. |
| Unknown/generation recovery, known rejections, matrix multiuser, lifecycle and conflict discard | 85 PASS using actual routes and synthetic clients/DOM. |
| Native desktop/mobile-size forms, Save/reopen, unknown recovery and abandonment, zh/vi | 43 PASS at 390/1280 px using Chromium and actual handlers; not a physical phone or native IME acceptance. |
| Shared-reader compatibility and historical performance baseline integrity | Original identity-prefetch regression PASS; LF/CRLF/inverse negative contracts 71 PASS with original baseline/tail/prefix pins unchanged. |
| Static checks and source boundaries | Full typed lint, TypeScript, diff whitespace and Sites source-boundary check PASS. |
| Build | Normal `npm run build` PASS, stamped with candidate `47025673ea47455679fa6b7eeb65041641f44f7a`; known public-auth client check PASS. [Safe build receipt](build-result.json); this does not approve distributing compiled server output. |
| Independent review | Reviewer independently reproduced a null-next-pointer fault-precedence defect; fixed by validating next before inspecting its key. 14 targeted reviewer checks PASS on the final runtime hashes; this is a subset, not additional scenarios. Final source/measurement/document review completed on `4702567`: no remaining blocking findings. |

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
