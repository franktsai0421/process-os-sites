# Scoped GET permission phase — local candidate, not a release

## Scope and boundary

This phase follows the separately recorded scoped-read checkpoint; it does not
silently replace that checkpoint's SQL increase or zero-wait regressions.
Only records-backed `GET /api/ipqc-c/workflow` and `GET /api/routine-fqc` opt in.
HEAD, legacy layouts, POST, ordinary `can()`, and the existing master AB phase
retain their behavior. No login change, database migration, employee-data write,
new Site, deployment, or published latency claim is included.

The earlier scoped reader removed unrelated aggregate reads under the explicitly
approved fault-isolation policy. Required authority, target and selected references
still fail closed. Whole selected master/quality aggregates are still required;
this is not scope-level isolation within those aggregates. An unread aggregate is
**unverified**, not healthy. The present phase changes neither that read set nor
its order: it removes repeated pure permission evaluation and the incidental
per-cell identity queries, not the independent security boundaries.

## Security contract

- Private WeakMap binding to the exact Request and selected State; factory admits
  only the two supported GET paths with read-only/partial markers.
- One D1 snapshot. Pinned revision, five raw authority values and five credential
  headers. No request-wide/global/session cache and no reuse after another request.
- Fresh signed-session/expiry/per-token-revocation checks at initial authorization,
  before business hydration, after hydration, and immediately before terminal JSON.
  Permissions-only C reads use initial plus terminal checks and no business GET.
- Terminal checks cover success and business 403/404/409 responses, receipt/history,
  and restore previews. A terminal revocation-store exception becomes the original
  route's 503 response rather than an unhandled async rejection or a business DTO.
- Pure decisions use the existing evaluator, including primary/custom/template,
  explicit operation cells, settings-without-edit, restore create/delete/revival,
  and receipt actor checks. No copied alternative role policy.
- Fresh checks use the **same selected authority snapshot**, not a second SELECT
  of the latest roles/authEpoch. Mid-read role/epoch changes take effect on the next
  request, as before. Per-token revocation remains observable at each fence.
- Read-only state cannot enter either persistence encoder. No writes/CAS are added.

## Paired evidence: scoped closure bytes → permission phase

Actual production routes in the in-process synthetic SQLite/R2 fixture; seven
cycles per source/route/profile, 56 samples. Final window
2026-11-01 05:52:41–05:53:54 UTC. These are not Worker, HTTPS, or UI timings.

| Route | SQL / revocation queries | R2 GET / bytes | Response bytes |
|---|---|---|---|
| C workflow | 16 / 15 → 5 / 4 | 8 / 5,367, unchanged | 925, unchanged |
| routine FQC | 14 / 13 → 5 / 4 | 15 / 9,492, unchanged | 3,136, unchanged |

Each sample has one request and one state SELECT, zero PUT/HEAD/CAS/write bytes.
R2 GET/body/text peaks remain 2; all active counts end at zero. These counters are
fixture-specific, not the earlier AB fixture or deleted acceptance-site samples.

| Route / profile | Before median / max ms | After median / max ms |
|---|---:|---:|
| C, no injected wait | 21.752 / 42.805 | 10.543 / 20.116 |
| routine, no injected wait | 30.088 / 54.207 | 9.246 / 34.616 |
| C, artificial 12 ms per SQL | 223.886 / 242.489 | 68.094 / 78.114 |
| routine, artificial 12 ms per SQL | 214.026 / 230.471 | 74.247 / 98.504 |

The artificial SQL wait is a sensitivity experiment, **not** an estimate of real
D1 latency. C artificial-profile system-CPU median regressed 4.267 → 4.569 ms;
CPU/heap/RSS also include the harness and GC. No `<2 s` or `<1 s` live SLA follows.

A separate public-main → final-candidate run (seven cycles, 56 samples) also
passed the original 84 healthy comparisons and 13 fault-policy pairs. Main C
SQL/R2 counts 14/26 become 5/8; routine 12/26 become 5/15. In that distinct run,
zero-wait median/max were C 26.975/38.001 → 6.052/13.284 ms and routine
23.918/58.585 → 10.489/34.100 ms. Artificial **R2**-12ms medians were
334.518 → 93.769 and 333.186 → 184.980 ms, respectively. This R2 experiment is
not mixed with the preceding SQL-wait profile or historical live samples.

198 complete healthy contracts per source (594 across scoped baseline, candidate,
and true public main) retain complete DTO/headers/decoded state and UUID
relationships. Scoped baseline versus candidate also preserves every R2 key/order,
including HEAD and legacy exact counters. Fault-policy cases are separate from
healthy parity, not disguised as equality.

## Portable provenance and required source contracts

Public main remains `268a8e49ec751bb6849033e20a27d30194aad67c` with its real
history/required anchors. The prior local reviewed checkpoint `b62526...` is **not**
a public Git ancestor and is not required to exist in CI's object database.

The phase comparison instead reconstructs exact baseline bytes from the candidate
using reviewed unique, position-bound before/after spans and whole-file SHA256.
The 45-file dependency manifest is pinned by
`a2ec8dae0990c9d84236f5cdca9b819af74a7db749b58f3b26e05828741623e5`.
It includes earlier local candidate code, not only already-public main bytes.
The reconstructed directory has no `.git`; provenance is `baseline-bytes` with
`sourceCommit: null`. Missing/extra files, symlinks, size/hash changes, or unexpected
imports fail closed. No business records or private history are embedded.

Windows preparation admits only checkout CRLF conversion: all 47 allowlisted
runtime/oracle files must match their regular tracked HEAD blobs modulo CRLF,
pass exact inverse/hash checks, and be prevalidated before **any** write. Non-EOL
dirty input produces zero writes. The baseline JSON alone is explicitly `eol=lf`
in `.gitattributes`; an actual `autocrlf=true` checkout test protects its exact SHA.
A reviewer first reproduced the missing-attribute CRLF failure; that RED is retained.
This does not weaken strict EOL negative tests
in the inverse contracts.

T5 and P8/C9–C10 retain their original historical source pins. The new exact inverse
chain is phase → scoped closure → public main → the original historical deltas;
old pins are not replaced. Original FAIL logs are retained. P1/P2/P7 update only
measured exact SQL/R2 counters; role, DTO, revocation and fault assertions remain.
The old scoped suite similarly changes only the initial/HEAD fresh-count assertions.

## Validation and honest limits

- New phase: 229 cases passed in six disjoint complete shards, zero skips. Later
  source-pin/snapshot harness maintenance is separately identified in evidence.
  Final lint-only identifier aliases and extraction of the same alternating child
  order have an exact inverse to the measured harness; no assertion was relaxed.
- Original scoped suite: final 245 cases passed in six complete shards, zero skips.
- Independent reviewer: 42 representative phase cases passed; this is overlapping
  evidence, not 42 additional cases.
- Required T1–T5, P1–P8 and bounded C suite passed after preserving original REDs.
- Exact inverses: 94 mutation negatives; snapshot validation: six negative cases.
  EOL gate: five refusal modes, all zero writes, plus successful EOL reconstruction.
- Initial phase harness run exited 134 while serializing the large aggregate report.
  This was a harness memory failure, not a product assertion failure. Same 384 MiB
  heap, per-child durable reports and streamed output subsequently passed with all
  complete comparisons retained; the final report is about 100 MB, kept outside Git.
- Final cumulative affected typed lint and full TypeScript passed. Normal full-repo
  typed lint remains BLOCKED: its tsgolint child was SIGKILLed (wrapper exit 1),
  with no rule suppression or heap escalation. The required Windows gate remains.
- Source/full-history preflight and clean public-like CI entry verification are
  recorded in the final manifest, not inferred from these subsets.
  Windows required CI and real-site/UI performance are not yet run for this candidate.
- The independent FQC #57 work also changes `process-state.ts`. This branch is based
  on main268a, not that unmerged work. Future integration needs an exact merged-tree
  review and T5/P8/C10 reruns; neither side's whole-file pins may be overwritten or
  weakened to a broad regex.

This is the next GET checkpoint, not completion of the deferred cross-reference
AB Apply redesign. The separately fixed AB Save and routine initial-read candidates
retain their own provenance and publication authorization boundaries.
