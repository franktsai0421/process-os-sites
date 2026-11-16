# PR #126 continuation — not completion

The original Office >10s acceptance list remains open. No merge/deployment or live measurements.

## Exact historical read reuse failure

GitHub run 43828413705, exact-head job 133167598699, head 59b50972b7c62b639ca13df748fd9e69f4a255ef, and the local original command both failed. The 4023 / 438212 bytes difference is a swap in GET initiation order, not proof of omitted content; repeated session SQL also changed. The old comparator expected the previously approved ten-key read-closure delta only, and therefore mixed the new scheduling/permission change into that old proof.

The original ordered I/O and counters assertions remain unchanged. A strict hash-checked source inverse supplies the genuine a177 main route as the intermediate candidate for the original historical rule/read-closure proof. A third unmodified current-route handler runs each of the same 17 success/fault/permission/history scenarios. It asserts identical complete DTO and headers, exact consumed object keys/bytes/SHA/order, unchanged non-session SQL, explicit session-fence counts, unchanged consumed byte totals, and no unselected/unknown object fetch. Every measured GET still checks unchanged tables/objects and zero writes. Existing bounded scheduler tests independently cover dispatch, stream cleanup and failure ordering.

Local result: PASS, 17 triples / 51 GETs, 10 domain cases, 3 denied-command pairs / 6 POSTs, 9 rule negative controls. No historical assertion was deleted or relaxed. This is test composition repair, not another product performance improvement.

## Feedback failure remains under investigation

Original run 43828413740, job 133167598121 used merge SHA d29617d267fc25c4b9bd9e093aeea8cd987abd5d, not the exact PR head. Full original job log reports INVISIBLE_TARGET at access-tab screenshot line 31; no geometry/artifact was retained by the original workflow. No evidence yet identifies a product defect or flakiness.

Local reproduction blockers: CI Chromium 151 download returned an invalid ZIP; installed /usr/bin/chromium aborts before login with `socket() failed: Operation not permitted (1)` in process_singleton_posix.cc. Local browser attempts therefore do not reproduce the CI failure and are not passing acceptance evidence.

The browser test now records failure-only synthetic geometry (fixed selectors, bounding rectangles, visibility/display and viewport), browser version and fixture build commit. It records no DOM text, credentials, URLs, storage or request bodies. CI retains this synthetic artifact. Existing failure/exit, screenshot retry limits and interaction/assertion sequence remain unchanged. Next required evidence is the fresh CI geometry/artifact, followed by a root-cause fix and the full browser sequence in a socket-capable environment.

## Remaining performance investigation

AB Save uses allocationKey and needsFullHistory for module-local changes; AB workflow GET already has selected keys and an authority preflight. C ordinary workflow GET still hydrates all aggregate keys; C Submit/Withdraw take full-state fallback, while Save/Create already use mutation capabilities. Both AB and C already have phase reuse and bounded aggregate read-ahead on main; claiming this PR adds either optimization to them would be false. The next isolated profile must separate aggregate metadata, selected current bodies and historical bodies and preserve current corruption/error-order contracts before choosing a narrower capability or body scheduler.

FQC Save synthetic pair did not improve; the existing fast Save route already uses its own bounded reader. Need a representative saved-content size and history/object distribution to locate remaining encode/read costs. Process bootstrap still returns identical payload: the 12 MB Office payload distribution and real browser readiness trace were not supplied, and the small isolated bootstrap fixture cannot establish payload or usable-time improvement. Need sanitized per-key sizes and timing of actual data/validation completion using existing permitted evidence; no production instrumentation is authorized or added.

AB/C paired profiles, bootstrap payload reduction and real usable-time acceptance are not complete. This file is an intermediate record and must not be reported as task closure.

## Follow-up checks and paired path profiles

The complete originally failing CI source step now passes locally: 463 tests, zero failed/skipped. The regression script itself needed an additional exact inverse entry; the prior manifests and all negative-source checks remain unchanged.

At c3f1f227, Feedback run43830577662 completed all browser steps successfully. No product or screenshot behavior changed; this does not explain the earlier INVISIBLE_TARGET. Original cause remains unconfirmed, with failure geometry retention now enabled.

Three paired runs / 144 actual handler requests: same initial state, command, fixed time/UUID, full response and persisted-row equality. Raw object counts/bytes and timers are in ipqc-path-profiles.json. These fixtures have only one normally created error and are not Office-scale benchmarks. No AB/C improvement is claimed.

| Module / request | Main median ms | Candidate median ms | GET count | Consumed bytes | Unrelated bytes |
|---|---:|---:|---:|---:|---:|
| AB save | 174.4 | 165.9 | 32 | 211142 | 180370 |
| AB save workflow GET | 133.8 | 133.6 | 15 | 57538 | 0 |
| AB save domain GET | 96.1 | 93.0 | 11 | 31772 | 0 |
| AB save permissions GET | 54.4 | 46.3 | 5 | 26144 | 0 |
| AB submit | 171.0 | 168.8 | 33 | 212837 | 180370 |
| AB submit workflow GET | 133.9 | 147.2 | 15 | 60607 | 0 |
| AB submit domain GET | 94.0 | 94.4 | 11 | 34841 | 0 |
| AB submit permissions GET | 45.8 | 46.3 | 5 | 26144 | 0 |
| AB withdraw | 175.4 | 179.5 | 33 | 215906 | 180370 |
| AB withdraw workflow GET | 133.6 | 136.1 | 15 | 62299 | 0 |
| AB withdraw domain GET | 105.8 | 101.7 | 11 | 36533 | 0 |
| AB withdraw permissions GET | 46.0 | 45.7 | 5 | 26144 | 0 |
| C save | 144.5 | 150.9 | 30 | 209526 | 180370 |
| C save workflow GET | 110.0 | 110.3 | 29 | 210777 | 180370 |
| C save domain GET | 71.8 | 73.4 | 9 | 30407 | 0 |
| C save permissions GET | 45.4 | 45.6 | 5 | 26144 | 0 |
| C submit | 148.5 | 149.9 | 30 | 210916 | 180370 |
| C submit workflow GET | 114.4 | 113.4 | 29 | 213048 | 180370 |
| C submit domain GET | 72.9 | 73.9 | 9 | 32678 | 0 |
| C submit permissions GET | 47.2 | 47.5 | 5 | 26144 | 0 |
| C withdraw | 147.8 | 147.0 | 30 | 213187 | 180370 |
| C withdraw workflow GET | 112.3 | 111.0 | 29 | 214328 | 180370 |
| C withdraw domain GET | 72.8 | 73.9 | 9 | 33958 | 0 |
| C withdraw permissions GET | 48.9 | 47.2 | 5 | 26144 | 0 |

C public/process/ipqc-c.js read() uses the domain GET /api/ipqc-c?caseMetadata=1 and a separate permissions GET. Both exclude the synthetic unrelated aggregates; C general workflow GET still includes them. Do not assign its isolated numbers to the Office post-submit/withdraw sample without the actual request URL/query. AB domain and workflow GET also differ.

Pending runtime work: AB/C write capability/dependency closure and historical-body costs; FQC Save representative content/encode profile; process bootstrap per-key payload distribution and browser readiness. Pending external evidence: Office request URL/query mapping, sanitized payload/object/history size distribution, and a socket-capable local browser or deterministic CI reproduction for Feedback. These are not delivered fixes.
