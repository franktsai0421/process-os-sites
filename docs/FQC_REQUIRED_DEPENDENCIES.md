> Follow-on (2026-11-04): bounded aggregate GET overlap changes waiting only; see [current flow measurements](acceptance/fqc-flow-performance-20261104/README.md). The pinned measurements and GET-unchanged statements below remain historical.

# FQC Apply/Save required dependencies — local candidate

Baseline: merged PR #57, `848be13da54c7ae747bcdd96df19e01129fe980a`.
This is a separate, not-published follow-on. The user explicitly approved a new
fault boundary: unrelated modules are not read and their corruption does not
block FQC; necessary dependencies remain fail-closed. It is not a claim that
unread data is healthy. No account, data, schema, Site, or migration is changed.

## Exact first-stage coverage

Only the exact FQC workflow POST, without a `scope` selector, and the recognized
ordinary `apply`/`save` command shapes use the new records-v1 capability. Apply
includes new/edit error and item, batch product assignment, matrix choices,
soft deletion and adopted-workflow equipment replacement. The original adapter,
full structural validation, guards, numbering and manual Save boundary remain.
The #57 client deadline/ACK/receipt/terminal-read implementation is unchanged.

| Operation | Required content / compatibility boundary |
|---|---|
| Recognized ordinary Apply | Five auth keys; complete selected quality aggregate and its original live/selected bodies; AB master; routine equipment; original quality allocation index when required |
| Insert Apply | Same closure; verified allocation index, or original complete FQC history when no index exists, so reserved numbers cannot be reused |
| Soft-delete Apply | Same closure; original delete permission and complete FQC parent/child validation. Tombstones do not delete referenced AB products or equipment sources |
| Batch/matrix Apply | Same closure and original per-field guards; optional expected-AB effective-version check stays in the adapter |
| Adopted equipment replacement | Same closure; current approved equipment/availability and equipment snapshot rules. The separate legacy cross-module replacement route is not changed |
| Save | Same eight-key closure because the current adapter context always reads AB and equipment; working→saved only, no implicit Apply/active promotion |
| Begin, submit, approve, return, withdraw | Original routes/readers unchanged, including current case selection and review permissions; not claimed accelerated |
| Historical restore / preview | Original full dependency and selected saved-body read, strict revision, restore/create/delete and parent/child checks; not claimed accelerated |
| Ordinary, receipt, permissions, history GET | Unchanged. In particular ordinary/receipt GET retain the independent auth preflight and second selected snapshot; full fresh terminal GET is still mandatory |
| HEAD, other scopes, legacy formats, unusual command fields | Existing compatibility behavior, not a new read/write capability or pre-auth zero-business-read claim |

Auth keys are `platformUsers`, `processCustomRoles`,
`processRoleTemplateOverrides`, `processAccessControl`, `maintenanceMode`.
Business keys are `qualityMasterControl`, `masterDataControl`,
`routineEquipmentControl`. Here “required” selects and validates each existing
entry; it does not invent a new mandatory-key schema. Legitimately absent AB or
equipment entries keep the original empty/default context, including existing
expected-AB and new-equipment availability guards. A present reference whose
object is missing/corrupt is different and remains an error. The source FQC adapter has no global
`needsReferenceHistory`/`beforeCommand` cross-module deletion scan; this patch
does not invent a claim that such a scan happened. Whole selected quality/AB/
equipment decoding remains conservative; this is not a nested-body projection.

## Read and write authority

1. One D1 row pins the POST's revision and complete immutable manifest.
2. Selected auth aggregates pass SHA and JSON validation before any business
   aggregate fetch. Authority bodies produced by the normal serializer (including
   audit.before) use the existing SHA-verifying decoder without deferred history;
   JSON validation covers both original aggregates and hydrated values. Missing,
   corrupt or unresolved nested bodies fail before authorization/business reads.
   A literal property/string name is not a reference. See the
   [authority-body regression](acceptance/fqc-authority-body-20261103.md).
3. View/action/create/delete admission and fresh session revocation precede
   business hydration. The existing post-body/pre-encode/post-R2/replay fresh
   checks and early global revision/CAS retry remain; every attempt starts over.
4. The optional inline users mirror is not authority. Its absence or valid old
   value is preserved. A defined maintenance override keeps its old priority and
   must be syntactically valid. Required integrity faults are not caught and
   turned into a second, potentially successful, full read. A missing state row
   is an error, not a reason to select another snapshot.
5. A private, one-use capability binds State, bucket, revision, original command,
   actor/client/operation and selection. Ordinary partial-state encoding still
   rejects. The adapter's actual flow/receipt is sealed; the original version
   projector is replayed against the captured parser basis and compared with the
   serialized target. Apply cannot change saved/active/history; Save cannot
   change working/active or prior history. Existing receipts and other client
   sequences remain pinned.
6. Only FQC quality and its derived allocation pointer may change. Other quality
   libraries and all unrelated envelope values, legacy sources, allocation refs,
   and opaque metadata are retained. Unread aggregate refs are not added to the
   trusted set. Existing trusted deferred-body provenance inside verified
   aggregates is distinct from having read/verified every such body.

The scope diagnostic records only policy, revision, fixed key names and a count
of unverified aggregate pointers. It contains no employee identity, header,
credential, content or object key. Existing explicit full-reader/backup tools can
still detect an excluded corrupt object; there is no background repair or audit.

## Performance boundary

The first-stage target is the POST's all-aggregate traversal. For a canonical
records manifest with N aggregates, eligible existing-set Apply/Save can omit
N−8 unrelated aggregate reads. Inserts additionally avoid unrelated body loads
from the generic path. Actual savings depend on the manifest and command.

The mandatory terminal GET retains its two independent snapshots and current
quality body reads. It is not claimed to become sub-second. No new latency result
is established by the dependency proof alone. Synthetic paired measurements,
actual route fault/permission/capability regressions and exact final CI are still
required before publication. Prior #57 measurements/CI are not this version's
acceptance.

## Current verification / compatibility distinctions

- Initial merged-baseline red: unrelated aggregate faults blocked ordinary Apply
  and Save; denied editing had already fetched business aggregates. The candidate
  moves admission ahead of those reads and implements the separately approved
  unrelated-fault boundary, not an equivalence claim about error precedence.
- A real malformed-records race was reproduced: the first invalid manifest could
  return “unsupported,” then select a repaired row and commit. Recognized corrupt
  records now throw from that first snapshot; only valid legacy format fallback
  is retained. A missing row also remains a one-SELECT refusal.
- The merged version already returns 500 before identity evaluation for a null
  patch (its `needsFullHistory` dereference). Malformed commands remain outside
  the new capability; the regression pins actual old behavior and does **not**
  call it an authentication-first success or an independently fixed issue.
- Early admission must preserve existing direct-denial response shapes. A legacy
  paired test caught an added requestId on LOGIN_REQUIRED; the candidate uses a
  request-private response-identity sentinel for those direct denials, not a
  caller flag. Kernel permission errors retain their requestId. This is tested
  separately from the fault-policy differences.
- Selected authority metadata is validated: a defined non-string maintenance
  override now rejects instead of silently failing the old `'1'` comparison.
  Valid override precedence and optional/stale users mirrors remain unchanged.
- The new pre-business fresh revocation boundary adds one SQL read to eligible
  Apply/Save. It is not removed to improve benchmark counts. The original late
  fresh checks and independent post-body create check remain.

The original B0 script keeps its pinned historical baseline. The lifecycle script
uses pinned merged-848 route bytes with the old lifecycle opt-in removed, so it
remains an optimization-contract comparison, **not** a true deployed baseline
measurement. Exact merged-848 server bytes are used independently by the new
paired benchmark. All fixtures are synthetic and ephemeral; no employee data,
persistent signer, account, login or native local-browser claim is involved.

## Paired synthetic measurements (2026-11-01)

The [machine-readable summary](acceptance/fqc-required-dependencies-20261101/performance-summary.json)
contains all 80 sample timings: four actions × two variants × two latency profiles
× five samples. Order alternates per pair. Baseline is exact merged-848 server
source; both variants use unchanged #57 transport. Fixture: 256 FQC items, eight
required aggregates, 24 unrelated aggregates with 16 KiB metadata and 32 KiB
separate bodies each. Setup is outside timing; measured work includes the normal
POST plus mandatory fresh terminal GET and response-clone evidence overhead.
Source hashes were equal before/after. All samples succeeded; none were discarded.

| Whole chain | R2 GETs, before → candidate | R2 text bytes, before → candidate | SQL calls (including CAS), before → candidate | Response bytes (unchanged) |
|---|---:|---:|---:|---:|
| Existing Apply | 49 → 25 | 1,032,928 → 632,844 | 13 → 14 | 397,241 |
| Insert Apply | 74 → 26 | 2,018,971 → 831,769 | 14 → 15 | 397,453 |
| Soft-delete Apply | 74 → 26 | 2,020,128 → 832,926 | 13 → 14 | 397,602 |
| Save | 50 → 26 | 1,235,069 → 834,985 | 13 → 14 | 795,066 |

Each chain is still **one POST + one GET**, not a round-trip reduction. The extra
SQL read is the new pre-business revocation gate. The mandatory GET is unchanged.
The manifest's unrelated aggregate count and format are synthetic, not a claim
about the employee database.

| Whole-chain median | No added wait, ms before → candidate | Controlled storage wait, ms before → candidate |
|---|---:|---:|
| Existing Apply | 86.30 → 93.39 | 862.34 → 523.07 |
| Insert Apply | 73.18 → 113.94 | 1,266.23 → 537.26 |
| Soft-delete Apply | 76.81 → 101.34 | 1,287.69 → 557.69 |
| Save | 109.82 → 143.97 | 894.74 → 633.41 |

**Trade-off:** with in-memory storage and no added wait, the candidate is slower
in this measurement. Private state/provenance pins, sealed adapter-result
validation and exact projection comparison add CPU/allocation work. The second
profile deliberately adds 15 ms per R2 GET and 5 ms per SQL/PUT call to expose
storage-round-trip sensitivity; those milliseconds are **not live measurements
or deployment predictions**. This patch removes unnecessary I/O while retaining
its safety checks; it does not claim universal speedup or sub-second real FQC.
Future GET/raw-byte reuse requires a separately reviewed fault-observation
contract and is not implemented here.

Reproduce with `node scripts/benchmark-fqc-required-dependencies.cjs` (JSON stdout,
diagnostic stderr). No network or employee database is used.

## Acceptance state before publication

- New dependency/capability suite: 79 tests passed in the 147-test combined run;
  its one remaining test had a cross-VM prototype assertion mistake, corrected
  without dropping fields and separately passed all four paired variants.
- Existing #57 reliability/ACK suite: all 67 passed (includes the two added
  fifth-boundary revocation cases). The old 65 count is not added to this total.
- B0 and lifecycle contracts passed with exact documented policy/metadata
  distinctions; all original DTO/header/target state assertions remain.
- Independent reviewer: seven representative tests passed on the same runtime
  hashes; this is a subset, not seven additional independent scenarios.
- Affected typed lint and full TypeScript passed. The committed source-only
  history/worktree guard passed (275 commits / 3,338 unique blobs at c34e5e2).
- Normal full-repository lint is **BLOCKED**: its tsgolint subprocess was killed
  with SIGKILL. Normal build is **BLOCKED**: its child was killed with SIGKILL;
  the safe build receipt returned exit 1, no compiled-public-auth approval. These
  are observed resource/process terminations, not claimed lint/build passes or
  a diagnosed out-of-memory cause. Neither was retried with a weaker pipeline.
- Exact new-head normal CI and native-form browser tests remain required.
  Local browser execution is not claimed; prior #57 CI is not this candidate's
  acceptance. No merge, deployment, data or account changes are included.
