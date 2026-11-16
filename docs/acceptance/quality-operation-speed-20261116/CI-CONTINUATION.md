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
