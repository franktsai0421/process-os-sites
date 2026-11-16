# Continued runtime fixes (isolated evidence; live acceptance pending)

The previous continuation document records an intermediate investigation. This stage implements additional runtime changes. It does not claim the Office requests now complete under ten seconds.

## Implemented causes and boundaries

1. The aggregate scheduler started a new batch only after the prior batch had drained. A slow fifth GET could postpone sixth and later requests despite available stream slots. It now refills a rolling window only on the next serial traversal step. The maximum remains five open aggregate/body streams; no speculative text, SHA, JSON or body consumption was added. Duplicate-key barriers, separate repeated observations, earliest error and cleanup semantics remain intact. A deterministic slow-fifth regression fails against exact pre-change4e3260c1 and passes after the change. Applies to already-opted AB/C writes and reads as well as IQC/process/FQC.

2. FQC `save-local-v1` was absent from `fqcAggregateReadAheadCommand`; the current local Save still used full serial reads. The validated exact command now opts into the same full-state scheduling. Unknown fields/invalid IDs keep the serial fallback, invalid local syntax keeps the original422, and an unrelated required missing body still blocks Save. No partial-write capability or dependency deletion was introduced.

3. Adopted editor bootstrap transferred the full approved authoring snapshot before the editor fetched its authoritative workflow, duplicating a large payload. The client now explicitly advertises `X-Process-Authoring: workflow-v1`. Only an editor destination with canonical adopted workflow uses an adoption marker `{activeVersionId,versions:[]}`; the required workflow GET still returns and validates the full active/draft/review state. Old clients and player/other destinations keep full approved data. A missing body can pass the deferred bootstrap but fails workflow loading; this is never ready/editable success. Existing ready/paint/navigation guards are tested with the actual marker. shared-state cache version is bumped.

## Office request mapping

Every Office number below is one request, not an operation-total component to add together. The deployed v53 source/bundle mapping is still unverified.

| Office sample | Candidate path / verified mechanism | Change and remaining limit |
|---|---|---|
| IQC save26.86 / submit26.38 / withdraw26.84 | versionedWorkflowRoute full fallback; logs state-read20–21s also include identity | Prior permission phase plus rolling GET window; counts/bytes and DTO/state parity checked. Not proof of R2 or D1 as sole live cause. |
| AB save23.41 / submit21.65 / withdraw20.99 | module workflow full-state read; local Save includes history/allocation requirements | Rolling window reduces batch stalls without excluding any aggregate/body. History/body costs remain data-dependent. |
| AB post-save10.85 / post-submit10.53 | UI domain GET and workflow GET are distinct; precise Office query missing | Both already use bounded selected readers; rolling scheduling applies. Small isolated domain/permission profiles show no established improvement. |
| C submit20.46 / withdraw20.15 | dedicated workflow full-state fallback | Rolling window; authorization, lifecycle, CAS and persisted bytes unchanged. |
| C post-submit18.58 / post-withdraw18.00 | UI read() requests domain GET plus permissions; general workflow GET separately reads more keys | Rolling window applies; cannot assign the Office sample to a particular GET without its URL/query. |
| FQC submit13.97 / withdraw14.88 | existing lifecycle reader | Prior scheduler wiring plus rolling window. |
| FQC local Save (Office request time not supplied) | save-local-v1 failed scheduling admission | Exact validated local Save now schedules reads; prior no-improvement finding superseded only for this isolated path. |
| Process connection28.42 / submit23.01 / withdraw26.81 | process mutation capabilities / shared workflow | Prior permission/read scheduling plus rolling window; same-state operation parity and CAS regressions. |
| Process content checks14.60,16.21,15.91,15.16 | contentIssues GET; exact sample roles not known | Permission phase plus rolling read schedule; full historical and current error/order/DTO proofs retained. |
| Editor bootstrap20.56 /17.14 /20.71, about12MB decoded | versioned editor bootstrap; mandatory workflow load follows | Defer duplicate approved authoring body only. Synthetic12.69MB→11.75kB; actual Office field distribution and real readiness remain to verify. |
| C first-round17.39 /22.64 /17.62 /20.92 /17.72 | Roles still unmapped | Retained as unassigned samples; no invented action mapping. |

## Paired measurements

Three pairs each, pinned main baseline, same generated initial snapshots, commands, fixed clock/UUID, complete response and persisted-row comparisons. AB/C use one normally created error plus20 distinct unrelated aggregates. Artificial GET latency is deterministic10–80ms by content-addressed key; both sides receive the same delay. Session SQL has10ms delay. These variable-latency figures are separate from the prior uniform10ms series, not comparable across series. No live improvement is inferred.

| Module/request | Main median ms | Candidate median ms |
|---|---:|---:|
| AB save | 653.1 | 569.4 |
| AB save workflow GET | 466.0 | 467.1 |
| AB save domain GET | 376.7 | 325.7 |
| AB save permissions GET | 119.3 | 118.5 |
| AB submit | 676.8 | 598.8 |
| AB submit workflow GET | 496.6 | 485.9 |
| AB submit domain GET | 344.8 | 348.4 |
| AB submit permissions GET | 122.2 | 120.3 |
| AB withdraw | 669.2 | 600.5 |
| AB withdraw workflow GET | 497.5 | 482.0 |
| AB withdraw domain GET | 345.5 | 347.1 |
| AB withdraw permissions GET | 118.5 | 116.3 |
| C save | 608.3 | 534.9 |
| C save workflow GET | 518.1 | 448.1 |
| C save domain GET | 203.5 | 204.3 |
| C save permissions GET | 118.2 | 118.2 |
| C submit | 560.2 | 493.4 |
| C submit workflow GET | 525.4 | 452.2 |
| C submit domain GET | 204.7 | 207.0 |
| C submit permissions GET | 117.7 | 120.9 |
| C withdraw | 563.6 | 489.3 |
| C withdraw workflow GET | 532.4 | 463.6 |
| C withdraw domain GET | 213.0 | 213.6 |
| C withdraw permissions GET | 118.0 | 119.1 |

FQC one-item and process1,000-operation series uses the prior uniform10ms delay; same data and method within each pair.

| Module/request | Main median ms | Candidate median ms |
|---|---:|---:|
| FQC save | 417.8 | 174.1 |
| FQC save readback | 112.3 | 117.5 |
| FQC submit | 419.5 | 189.1 |
| FQC submit readback | 150.9 | 143.7 |
| FQC withdraw | 413.4 | 178.7 |
| FQC withdraw readback | 111.5 | 116.2 |
| Process save | 797.0 | 440.8 |
| Process save readback | 423.6 | 125.1 |
| Process save contentIssues | 348.5 | 263.8 |
| Process submit | 749.9 | 441.8 |
| Process submit readback | 507.0 | 174.7 |
| Process submit contentIssues | 390.6 | 409.4 |
| Process withdraw | 689.7 | 307.9 |
| Process withdraw readback | 483.9 | 157.4 |
| Process withdraw contentIssues | 377.6 | 254.0 |
| Process editor bootstrap | 258.5 | 200.0 |

Large approved bootstrap: 12691758→11752 response bytes; median 469.8→22.7ms. Generated1,000 operations with long instructions; no artificial I/O delay. This measures bootstrap only, not ready-to-edit. Complete workflow payload remains unchanged and must still load.

## Regression and browser evidence

Local:53 bounded I/O tests including maximum live streams, duplicate observations, first-error ordering, malformed fallback and FQC local Save;118 combined scheduling/readiness/navigation checks;20 actual atomic-save/CAS/permission/history regression tests;17 historical/current triples (51 GETs) plus6 denied POSTs. Large bootstrap exact payload boundary, legacy/player compatibility, full workflow parity, missing body and session revocation tests pass. Lint/typecheck/source boundaries pass. Exact source inverse mappings include runtime/client/cache/test changes, preserving prior pins and negative controls. Committed-source checks and new CI are required on the final commit.

The new native-editor CI job runs the compiled Worker and real Chromium with generated12MB data. It compares compatible/full and versioned bootstrap on the same binary, explicitly holds workflow loading and asserts that ready/edit are false, then requires all1,000 operations, editing permission and two animation frames. Three paired page loads retain readiness and per-request resource measurements. It is pending until CI results are obtained; neither this harness nor a Node response timer is Office acceptance. Local Chromium remains blocked by Unix socket permissions.

Feedback: both subsequent complete browser CI runs on c3f1f227 and4e3260c1 passed without changing screenshot behavior. Original INVISIBLE_TARGET root cause remains unconfirmed. Failure-only geometry and artifacts remain enabled; no retry/threshold was relaxed.

Overlap: shared-state/index cache change adds overlap with #125 index.html; preserve its independent version/display changes during eventual integration. No merge/deploy/account/data/config changes or prohibited connector use.
