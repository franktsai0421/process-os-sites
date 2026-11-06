# IPQC A/B operation speed — 2026-11-06

Candidate from `franktsai0421/process-os-sites`, clean baseline `2882f35de8e68370304a2d2235c039e226a2e4e5`, branch `perf/ipqc-ab-speed-20261106`. Parent confirms task creation settings `gpt-6.1-sol` / `high`; the runtime exposes no separate model identifier for independent verification. Source and build hashes, exact commands and outcomes accompany this report. No hosted data, schema, credentials, account, pending case or Site version was changed.

## Result and boundaries

The candidate uses the existing request-local permission phase on the exact IPQC A/B workflow route and overlaps at most five selected aggregate GETs. Every selected key, SHA/JSON/body validation, history/allocation scope, photo check, original receipt, pending lock, revision/CAS and final fresh-session gate remains. No authority or response-body projection is broadened. Begin and mixed outer envelopes keep serial reads; ordinary A/B Save/Submit/Withdraw opt into read scheduling only. Photo and page GET/PUT overlap their existing selected authority records. There is no cross-request authorization/content cache, schema change, altered media encoding policy, early success or removed readback.

Three alternating baseline/candidate pairs demonstrate the repeated authorization cost: permission GET revocation queries 13→2, complete module GET 26→4, each Save/Submit/Withdraw POST 13→4. End-of-phase, pre-encoding and post-encoding/pre-CAS checks remain fresh. R2 GET counts are unchanged; peak overlap remains ≤5. The actual decoder's ordered-fault, bounded-stream and cancellation tests are reused at the same unchanged decoder bytes.

The nine original observations were **browser + automation end-to-end** measurements supplied by the parent. Original CSV `/workspace/scratch/73c7e87b530a/qa-reports/ipqc-ab-a-bosen-timings-20261106.csv` is in the parent environment and is absent here. This environment's isolated synthetic data is smaller and uses synthetic `GROUP-1`, not the real BOSEN data. Do not subtract the following figures from the original seconds or claim the hosted 5s target passed.

## All nine operations

The following **in-browser wall-time medians (ms, n=3 each)** come from the complete compiled Worker + Chromium, isolated synthetic D1/R2, a deterministic 1200×800 lossless PNG, 1280×850 Chinese viewport, normal signed fixture identity, new context each round and warm within-round navigation. UI completion, visible photo decode and reference-load completion are awaited. Each report also records Node Playwright duration and browser resource timings. No artificial network delay is used in these browser runs.

| Operation | Parent baseline (s) | Isolated before→after (ms) | Diagnosis / outcome |
| --- | ---: | ---: | --- |
| Save with image | 39.997 | 615→529 | Repeated workflow authority and serial aggregate waits reduced; same one photo PUT, identified Begin and one atomic Save. Media normalization/upload remains a major cost. |
| Confirm Submit→pending/locked | 18.339 | 259→248 | Same POST, terminal GET, complete page reread and references. Reduced authority I/O; no early lock/success. |
| Confirm Withdraw→editable | 16.537 | 231→221 | Same fixed case, audit and saved data retained; authority/read overlap improved. |
| Warm reload | 5.879 | 329→341 | Page aggregate reader improved; browser wall-time benefit **not established**. Same 18 requests in round one; shell/bootstrap/network/parse still contribute. |
| Reload after Save | 6.534 | 312→328 | Same persisted image/content verified; wall-time benefit **not established**. |
| Open Submit confirmation | 5.947 | 121→71 | Fresh complete module read remains; repeated authorization reduced. |
| Reload after local deletion | 7.024 | 320→335 | Local deletion stays unsaved; reloaded saved item restored. Wall-time benefit **not established**. |
| Return from IQC | 5.134 | 94→100 | Same router and fresh A/B page/permission reads; benefit **not established**. |
| Close fixed case | 5.003 | 50→59 | All six runs issued **zero requests** while closing. No product rewrite justified by the original tool-inclusive number; real BOSEN/tool split still unmeasured. |

Some candidate tails are slower. Raw min/max and every sample are in `summary.json` and `paired.json`; no sample was dropped. Product latency, browser observation and ChatGPT automation costs are different boundaries. ChatGPT bridge/audit transport is not reproduced, measured or assigned a fabricated residual. No real BOSEN regression or site-wide speed acceptance is claimed.

## Controlled server I/O sensitivity

Actual TypeScript handlers run against memory SQLite/R2 with a fixed **10ms added per DB method and R2 GET**. This exposes waiting sensitivity; it is neither Cloudflare CPU time nor a hosted estimate. Median ms (n=3):

| Boundary | Before | After | Revocation queries before→after | R2 GET count |
| --- | ---: | ---: | ---: | ---: |
| A/B page GET | 193.3 | 167.6 | 3→3 | 10→10 |
| Workflow permissions GET | 193.1 | 57.3 | 13→2 | 5→5 |
| Complete module GET | 424.7 | 141.7 | 26→4 | 14→14 |
| Save POST | 377.4 | 166.6 | 13→4 | 19→19 |
| Submit POST | 384.9 | 182.6 | 13→4 | 20→20 |
| Withdraw POST | 386.1 | 177.9 | 13→4 | 20→20 |

Resource timings separately identify API/image/shell requests, TTFB, duration and decoded byte counts. For example, pair one's image PUT was 205.4→219.7ms while total Save improved: this change does **not** claim to accelerate image compression. Fresh complete snapshots and reference refresh still cost work; their integrity is retained. Resource spans overlap and must not be summed as wall time. Pure server CPU, real network upload bandwidth and real browser/tool bridge timing remain unmeasured.

## Change → risk → verification

| Change | Main risk | Evidence |
| --- | --- | --- |
| Exact A/B workflow request-local permission phase | Stale authorization, identity or retry reuse | All four fresh write/read gates reject revoked sessions; storage failure fails closed; header/auth-state binding and distinct-request tests. Existing master-AB/FQC checks 159 PASS. |
| Existing aggregate overlap on A/B workflow/page/photo | Reordered corruption, unbounded memory, skipped dependencies | Unchanged decoder ordered-fault/stream tests; bounded A/B output/role/format parity; unrelated corrupt record blocks a full write without CAS. No selection reduced. |
| Preserve atomic Save/media/fixed cases | Missing photo, duplicate write, changed history | Compiled whole application desktop Chinese and narrow Vietnamese lifecycle; saved photo GET/decode; both Withdraw entries; explicit self-review; unknown ACK GET-only recovery. |
| UI test completion and distinct users | False positive from internal receipt settling before render | Old assertion retained and now awaits query UI detachment. Two separate actors (`preview-editor` / `preview-ab-only`) merge independent cells and resolve same-field conflicts. Held Save rejects repeated clicks. |
| Historical source compatibility | Accidentally masking unrelated source changes | Exact four-file hash/offset inverse composes before the existing reporting/historical proofs. Unknown/appended/non-Buffer/unsafe changes remain rejected; all predecessor hashes retained. |

## Validation ledger

- **PASS:** baseline application build and baseline local 22 tests, plus both baseline compiled language/viewport cases.
- **PASS:** candidate full build, normal typed `npm run lint -- --format unix`, `tsc --noEmit`; fresh exact source-commit `8a0f47648976bde5d79559a96f50b78c640b01ac` build/check receipts all pass in `validation.json`. The follow-up evidence commit changes only this report and validation receipts; its product source hashes remain identical.
- **PASS:** current local browser 12 tests, including real distinct actors, held repeated Save clicks, image selection/upload, cancel/departure, lost Begin/Save ACK, missing receipt and GET-only recovery. Composition-event tests are synthetic; no native IME claim.
- **PASS:** scope-permission races + local atomic Save 20 tests; shared master-AB auth/FQC read-ahead/Submit/receipt regression 159 tests; historical reporting/batch3 proofs 34 tests; A/B bounded-read seven groups; transition kernel 15 checks; Save-ACK denied-read quarantine.
- **PASS:** new A/B phase/source/integrity/revocation tests; photo policy 19 cases; six photo routes 19 cases. The correct VM command is below. The retained first invocation without `--experimental-vm-modules` failed to start that VM fixture; this is not a product failure.
- **PASS:** compiled full application four scenarios: 1280px Chinese + 390px Vietnamese full lifecycle, separate restricted-role UI/API matrix, narrow lost-ACK recovery. Native fixture uses nonpersistent synthetic D1/R2 and no outbound service. No real-data or physical-phone claim.
- **PASS:** three complete alternating pairs: 54 browser observations across nine operations, plus 36 separate actual-handler observations. Source variants are pinned by baseline source and compiled build hashes; summary is descriptive, not a CI performance threshold.
- **FAIL (existing legacy fixture):** `scripts/test-ipqc-ab-workflow-v3.cjs` normal login returns 503 on both fixed baseline and candidate. Default Chrome distribution was initially absent; using the available system Chromium reaches the same baseline 503. No login safeguard was changed. Current compiled lifecycle tests use a working isolated fixture and pass; this old fixture is not counted as PASS.
- **BLOCKED:** old `scripts/test-ipqc-ab-api.cjs` needs its absent seeded isolated port-3002 server; connection refused before any write. No seeding or real local-server connection was attempted. Equivalent current compiled API/lifecycle cases are separately identified.
- **BLOCKED:** hosted BOSEN measurements/authenticated browser session unavailable. One anonymous GET to the allowed test host `/api/ipqc-ab?caseMetadata=1` executed and returned application **403** (`沒有查看 IPQC-AB 權限`), total 5.573s. No credential was configured, fetched, copied or synthesized for that Site. No hosted write was attempted; no policy refusal or tool-audit waiting is labeled a product bug.
- **NOT_RUN:** real BOSEN data-size/performance, native IME, physical phone/cross-machine, staging update and production deployment. GitHub/CI outcome is recorded separately; local PASS does not authorize merge or deployment.

## Reproduction

Dependencies: Node 24.19.0, locked 580-package install with `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/ipqc-npm-cache`; no package/lock change. The first install used an unavailable home cache, failed ENOENT and was corrected by selecting the writable task cache. No credential or network bypass was used. Install lifecycle hooks were deliberately not run or changed.

```sh
PROCESS_PROGRAM_COMMIT=<actual-source-commit> npm run build
npm run lint -- --format unix
node_modules/.bin/tsc --noEmit
node --test tests/ipqc-ab-speed-safety.test.mjs
node --test --test-concurrency=1 tests/ipqc-ab-local-browser.test.mjs
node --experimental-vm-modules --test tests/photo-routes.test.mjs tests/photo-upload.test.mjs tests/ipqc-ab-speed-safety.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium PROCESS_PROGRAM_COMMIT=<actual-source-commit> node --test --test-concurrency=1 tests/ipqc-ab-compiled-browser.acceptance.mjs tests/ipqc-ab-compiled-gaps.acceptance.mjs
```

`tests/ipqc-ab-speed-paired.mjs` requires explicit `IPQC_SPEED_BASELINE_SOURCE` and `IPQC_SPEED_BASELINE_BUILD`, accepts `IPQC_SPEED_FOLDER`, alternates three pairs and saves all raw reports immediately. Its child runners use `IPQC_SPEED_ROUNDS=1`; the browser can select `PROCESS_TEST_CHROMIUM`. The fixed baseline was extracted with `git archive 2882f35...` into ignored `.sites-runtime/ipqc-ab-speed/baseline-source`; its complete preserved build is `.sites-runtime/ipqc-ab-speed/baseline-dist`. This is evidence preservation, not an alternative executor or guard bypass.

## Delivery gates

Repository metadata was verified public, writable and currently at the baseline main SHA. Existing workflows are PR-triggered and do not deploy. This task keeps a work branch/draft PR only; Frank retains final review/merge. Test Site update requires applicable source approval and the relevant tests/review; none is implied by local performance evidence. The separately denied process-type upload is excluded and was not retried, imported or diagnosed. No backup diagnosis was started.

The exact local commit, remote/PR result, CI status and any denial/uncertain outcome are recorded in the final response and the local ignored `.sites-runtime/ipqc-ab-speed/delivery.json`. No destination-policy or approval refusal was bypassed. Files under `logs/` include original failure evidence as well as superseding successful checks.
