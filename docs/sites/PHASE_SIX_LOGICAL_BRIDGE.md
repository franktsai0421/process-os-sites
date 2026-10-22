# Explicit R1 logical-member bridge and private media — checkpoint

Historical checkpoint: [phase seven](PHASE_SEVEN_STRICT_R1.md) supersedes the
missing structural contract, `{tables}` assumption and unimplemented descriptor
parser statements below. The true outer archive/runtime remain unqualified.

This supersedes the unimplemented logical-core/configuration items in
[phase five](PHASE_FIVE_STATIC_AUDIT.md). The real R1 descriptor parser and outer
archive reader remain unimplemented. No real data, account credential or runtime
was used. All edits are in the existing independent M1 derivative; old source,
daily 3000, R1 and policy-denied operations are untouched.

## Implemented scope

- `lib/r1-logical-bridge.mjs`: an explicit normalized logical-member reader and
  layout -> Snapshot V1 source. It recognizes the known old format identifier,
  pinned `manifest.json` / `database.json`, source revision and the old four-table
  column contract. It emits the three business tables; source session-revocation
  records are schema-checked and excluded. Account IDs, roles, per-user grants,
  ownership, revisions and history remain; structural verifier/password/session
  fields are scrubbed by the existing transform engine.
- `lib/r1-private-media.mjs`: explicit image-member -> private URL / R2 object /
  ACL index mapping. It hashes bounded reads, checks complete member coverage,
  preserves multiple URLs referencing identical image bytes, and requires valid
  explicit view permissions. It never infers an ACL from a filename or role name.
- `lib/snapshot-d1-r2.mjs`: the existing transformer is now shared independently
  of database bindings. The bridge supplies byte readers directly, without
  pretending to execute SQL or opening SDK/native storage.
- Snapshot V1 adds source kind `r1-logical-members`, with pinned original
  manifest/database/explicit-layout hashes. It must not be labeled as a live Site
  export. Old Site snapshots remain valid. The three-table transport schema hash
  and all SQL migrations are unchanged; this is an additive provenance contract.
- `privateAssetDecision` in `site-security.mjs` is shared by the actual company
  asset handler and fixtures. A server-authenticated actor still needs an
  effective view grant; a bare admin label does not substitute for that check.
- `lib/sites-publication-readiness.mjs`: missing, all-zero, malformed or
  64-character tree-fingerprint values refuse as `PROCESS_PROGRAM_COMMIT`.
  `local-build.mjs`, the non-serve Vite branch and old release-command boundary
  call it. No build or publication was executed. A valid-shaped value is only
  a prerequisite: Git existence, source correspondence, review and platform
  publication remain unverified/unauthorized. Old release commands still refuse
  even when this prerequisite is supplied.
- Both templates remove the unused `PROCESS_AUTH_MODE`, document the required
  commit separately, and leave its actual runtime value unset. They preserve
  DEMO=false and the normal existing account-session/role implementation; no
  OAuth replacement or actual account setting is introduced.

## Explicit layout, not an invented real R1 parser

The new core requires `PROCESS_OS_R1_EXPLICIT_LOGICAL_LAYOUT_V1`, pinned to the
original manifest hash, plus a virtual reader's complete named-member inventory.
Each logical object mapping explicitly supplies the named storage key, the
`objects/<sha>` member, length, digest and HTTP/custom metadata. Each static image
explicitly supplies its `static-assets/` member, preserved `/process/...` URL,
digest/type/length and view-permission list. The manifest's object hash multiset
must match the complete explicit mapping. Every source member must be accounted
for; duplicate names, unmapped members and missing objects refuse. Same-content
objects may still have multiple logical references.

This is a **new normalized input interface tested with synthetic members**, not
a statement that these descriptor field names match the unseen real R1 manifest.
The current recognized database envelope is explicitly `{tables: ...}`; unknown
outer envelope fields or source columns refuse rather than being discarded.
Only named old schema/table facts from successfully read sources were used.

`decodeR1ManifestLayout()` deliberately stops with
`R1_DESCRIPTOR_SCHEMA_EVIDENCE_REQUIRED`. No CLI accepts the true R1 ZIP. No old
restore/updater command, failed excerpt read or equivalent denied action was
invoked. The pure converter does not forge old approved/status/release markers
or assert that old dependency compatibility applies to this derivative.

**The single missing evidence artifact** is a de-identified logical-member
schema contract for this R1: manifest object/static-media descriptor fields and
member-path rules, plus the database envelope keys. It can contain field names,
types and path templates only; no data rows, image bytes, passwords, verifier or
secret is required. This is needed to implement the real descriptor adapter.
The real outer ZIP layout/compression is a subsequent real-package qualification,
not something inferred from the feedback STORE codec.

## Actual results

`sites-r1-logical-results.json` in the parent task directory: **10 PASS / 0 FAIL**.
It covers three business tables, current/history links, business identity/role/
per-user grant retention, credential exclusion, images and private ACLs, shared
image bytes with separate URL grants, missing/checksum/unmapped-member refusal,
unknown format/incomplete mapping, traversal/invalid ACL/write grant/static codec
refusal, revision/schema/malformed metadata, source mutation during binary export,
provenance validation and unset/fake commit refusal. Metadata errors do not echo
input contents. Failed source verification does not publish snapshot completion.

The test crosses transport and the actual isolated-local adapter with fake DB/R2;
it does not import real R1 or qualify real credentials. Normal account verifier
exclusion **does not mean the original system has no passwords**. This work did
not read or move the original verifiers. Receipt remains `authReady:false`.

Affected checks: adapter **20 PASS**, mixed ZIP/chunked integration **10 PASS**,
account/role/media **18 PASS**; scoped compiler **0 diagnostics**, `checkJs:false`.
The compiler includes Vite config and new modules but does not run their SDK
plugins or a build. Existing unchanged codec-only evidence is reused; no broad
release suite was rerun. Lock dependency graph was not changed or installed.

Source/schema hashes and phase-five file delta are recorded in
`sites-source-freeze-phase-six.json`, outside this copy. The old phase-five freeze
remains a historical pin and is not overwritten. A source-tree hash is not the
40-character reviewed commit required for eventual build/publication.

## Remaining supported-format limits

The bridge is bounded by the existing table, object, chunk, transport and codec
limits. Static mapping currently supports JPEG/PNG/WebP/GIF only, with a 64 MiB
per-image ceiling, at most 2,000 URLs and a 1 MiB ACL index. Embedded JavaScript
datasets and other static types explicitly refuse until their typed format is
known; they are not copied as opaque secret-free data. Large source objects use
bounded reads, and binary emission is checked against its pinned digest at use
time, not merely by before/after inventory comparisons. Arbitrary free text/image
metadata still cannot be claimed semantically secret-free.

No real outer ZIP, complete R1, Workers CPU/memory/request limits, SDK import,
Windows filesystem cutover, real login, full build or publication is accepted by
these synthetic results. Hosted import remains 405; there is no automatic
local-to-production write path or first-data Site initializer.

## Minimal next-stage operation list — none started

| Step / environment | Exact target and potential writes | What must be confirmed first |
| --- | --- | --- |
| Finish descriptor adapter, source-only | Same copy; schema parser + small synthetic fixtures only | Obtain the one de-identified schema artifact above. No true R1 read is needed for that code step |
| Isolated runtime exercise | A newly agreed empty short local test directory, separate from this source, M1, R1 and 3000; SDK storage/logs and synthetic DB/R2 only | Exact directory, commands and dependencies; ensure this is not a retry/equivalent of G3/C1/MF. If denied scope applies, stop rather than changing tool/path |
| Real package qualification/conversion | Selected rev496 archive read-only -> a newly agreed private output directory; source remains intact; no upload | Explicit real-data read/output authorization, member/compression qualification, complete counts/hashes, retained histories/drafts and capacity. No credentials included or fabricated |
| GitHub source | Planned private `franktsai0421/process-os-sites`; code-only repository/branch/commit/push | Exact frozen source, actual Git commit/review, recipient/visibility and write authorization; no data package, merge or deployment implied |
| Sites test platform | Planned personal `process-os-test`, Frank-only; new Site-bound source Git, independent DB/R2, runtime values and private auth configuration | Exact Site/resource IDs, source synchronization method, permitted account setup, permissions and possible costs. This requires platform authorization; it is not direct arbitrary-GitHub publishing |
| Formal platform/data release | Planned personal `process-os`, public login entry; independent DB/R2 and application roles | Separate exact version/data target, authorized data/account migration, sharing/permissions/cost and publish approval after test evidence. No reuse of test bindings or automatic test-data return |

Current names/audience choices remain recorded preferences, not completed resource
creation or grants. Do not create secrets/bootstrap users or migrate real account
verifiers as a side effect of the source-only converter. Original account-password
compatibility uses the existing private management/migration flow when separately
authorized, not an invented replacement login system.
