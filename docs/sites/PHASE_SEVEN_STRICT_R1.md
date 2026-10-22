# R1 strict logical-member parser: synthetic qualification

Historical checkpoint: [phase eight](PHASE_EIGHT_LOCAL_R1_CHECKPOINT.md) adds the
outer reader, observed real-header profile, metadata result and exact remaining
private-output permission blocker. Full real conversion/runtime still unaccepted.

This supersedes the missing-schema/parser statements in
[phase six](PHASE_SIX_LOGICAL_BRIDGE.md). The confirmed contract came from the
previously authorized source and structure-only inspection. This batch did not
read the real archive, database rows, images or account verifiers. All source
edits remain in the same independent M1 derivative.

## Implemented contract

- `lib/r1-contract.mjs` requires exactly `schemas` and `tables` at the database
  root. Schemas are `{name:string,sql:string}` records for the four known source
  tables; missing, duplicate or additional schema names refuse. SQL strings are
  bounded metadata only: they are neither executed nor used to create tables.
  Unknown source columns/tables refuse. The three business tables are exported;
  `process_revoked_sessions` is checked and excluded. Source data is never a
  substitute for the reviewed target migrations.
- `lib/r1-strict-layout.mjs` accepts a read-only, already decompressed member
  reader with `list()` and bounded `readRange()`. It verifies the pinned raw
  `pack-v5/manifest.json`, database digest, logical-object descriptors, exact
  named member coverage, lengths, digests, path safety and classifications.
  Physical `objects/<sha256>` members may serve multiple logical keys; those
  references are preserved rather than deduplicating history away.
- The static contract is `PROCESS_OS_PRIVATE_STATIC_MEDIA_V1`, with exactly
  `format`, `status`, `sourceSnapshotManifest`, `records`. Every record has
  exactly `path`, `bytes`, `sha256`; `path` is program-root-relative and its
  archive member is `static-assets/` plus that path. The paired checksum is
  exactly 64 lowercase ASCII hex characters plus LF, over the raw JSON bytes.
  CRLF, filenames, reserialization, wrong hashes and missing members refuse.
  The source-snapshot reference remains opaque; it is not falsely required to
  equal the curated package's manifest digest. The observed status is retained
  as bounded text, without inventing an unobserved status enum.
- Known `public/process/iqc-media/` and `public/process/routine-media/` image
  paths become private asset URLs with effective `iqc.view` / `routine.view`
  grants. Anonymous and other-scope actors refuse. The only two recognized UI
  SVG paths (`public/favicon.svg` and
  `public/process/assets/canonical-placeholder.svg`) require separately reviewed
  program-file size/hash pins. They are custody-classified source UI, not
  business R2 objects or arbitrary public files copied from the package.
- Curation/provenance digest, revision 495 -> 496, parent digests, identity,
  fixed retention flags, current record references and the two changed model
  references are checked. Original manifest/database/layout hashes, static
  manifest/checksum, inventory, curation and parent references survive in the
  Snapshot V1 `source.origin.delivery` receipt.
- The checksum files, static index, provenance, README and the two recognized
  UI members are individually accounted and rehashed before completion. Their
  names, classifications, lengths and hashes are retained as custody receipts;
  their raw metadata bodies/SQL are not installed into the application. The
  unchanged original delivery remains their source of record. This is a data
  migration format, not a byte-for-byte archival replacement for R1.
- `lib/r1-logical-bridge.mjs` connects the strict decoder to the existing
  streaming scrub/rekey/export/transport/isolated-local restore pipeline.
  Snapshot provenance validation in `snapshot-contract.mjs` accepts the
  additive, strictly keyed delivery receipt; existing Site snapshots remain
  valid. No SQL migration, table/column contract, lock dependency, application
  login or platform sharing setting changed.

Credential exclusion retains business account identities, roles and per-user
grants, and removes password/verifier/session/secret fields through the existing
transformer. It does **not** mean the original accounts have no passwords. The
restored receipt remains `authReady:false`; this batch neither reads nor moves
real account-verification material and cannot qualify actual account login.

## Actual verification

Parent-task result files, all synthetic and using existing tools only:

| Result file | Cases | Result |
| --- | ---: | --- |
| `sites-r1-strict-results.json` | 12 | PASS |
| `sites-r1-logical-results.json` | 10 | PASS |
| `sites-adapter-fixture-results.json` | 20 | PASS |
| `sites-format-integration-results.json` | 10 | PASS |
| `sites-fixture-results.json` | 18 | PASS |
| `sites-types-results.json` | scoped compiler | 0 diagnostics; `checkJs:false` |

The strict fixture uses the actual existing record encoder/decoder with fake
current/history models, 14 fake business identities, two business images,
same-content multiple references, two pinned fake UI SVGs, all four source
schema records and three business tables. It crosses Snapshot V1 transport and
the actual local adapter with fake DB/R2 bindings. Assertions cover semantic
restore, role/grant preservation, credential canaries excluded, SQL not exported,
source bytes unchanged, missing/extra/duplicate/unsafe members, schema/format
refusal, corruption, curation links, source mutation, interrupted export retained
without completion, and nonempty target refusal before writes.

Two intermediate failures were classification/expectation issues, not successful
unsafe imports: CRLF was already blocked by the checksum size limit, then given
the specific checksum error; traversal was already blocked by inventory safety,
then the test was corrected to expect that earlier error. The failed synthetic
reports are retained outside the source copy. No limit or security check was
removed to obtain PASS. One initial mixed-format command used an incorrect test
filename and exited before running tests; the existing correctly named suite
subsequently passed. No dependency was installed.

Use `sites-source-freeze-phase-seven.json` and
`sites-source-diff.phase-seven.json` in the parent task for the source pin and
precise delta. The phase-six pin is historical. A source hash is not the reviewed
40-character commit required for eventual publication.

## Explicit limits and remaining blockers

There is no outer R1 archive opener/CLI in this batch. Its external delivery ZIP
uses DEFLATE; that is separate from the already tested internal feedback STORE
ZIP codec. No real R1 has been decoded, converted or restored. The strict
manifest whitelist recognizes only fields supported by the confirmed contract;
an additional actual header, schema/index name, member class or variant fails
closed and requires its own structural evidence. SQL is opaque metadata, so
passing it does not prove semantic equivalence of arbitrary SQL definitions.

Bounds remain: metadata/database up to 8 MiB; static manifest and README up to
1 MiB; total serialized source table rows up to 4 MiB and 1,024 rows per table;
14,000 named members; 10,000 logical objects; 2,000 static URLs, 64 MiB per image
and 1 MiB private ACL index. Reads are bounded (64 KiB hashing blocks, at most
1 MiB transfer chunks). Known large immutable JSON uses the earlier streaming
codec; these metadata limits have not been raised. The fixed profile requires
the known 495 -> 496 curation and two model changes. Unsupported variants refuse.
Arbitrary free text and image metadata are not claimed semantically secret-free.

No Workers/Sites CPU, memory, request/DB capacity, actual binding, SDK, complete
build, real login or runtime cutover has been accepted. Existing G3/C1/MF and
D-drive Git/CIM refusal boundaries were not retried or bypassed. No platform,
repository, permissions or cost-bearing resources were created.

## Smallest next real-data step (proposal only, not started)

Before any real read/conversion, agree the exact selected archive and a new
private, empty local output directory outside M1, daily 3000 and the original R1
folder. The previously matched R1 archive is
`development-data-curated-from-rev495-20261019-TEST.zip`, 1,781,028,009 bytes,
SHA-256 `b986fdf80859488aaf5f712f591b9fbeb53a1ec2752102e9c310c826e4765714`.
Its complete-package capacity/format acceptance is still unknown.

The minimum proposed operation is one local, read-only input -> new private
Snapshot V1 staging conversion, with a bounded outer-ZIP member reader and
reviewed source-UI pins. Validate archive/source stability and all members,
current/history references, classifications, credentials excluded, counts,
checksums and complete/failed staging markers. Unknown actual fields or limits
must stop with a non-content error; keep the input and failed output for review.
Do not automatically relax limits, delete histories or retry unsupported formats.
It needs approval for reading real package payloads and writing the exact new
staging destination. No DB, SDK, website, upload, production write or credentials
are needed for that data-only step. A true local runtime restore and credential
provisioning remain separate later operations, as do platform creation, binding,
migrations, fees, sharing and deployment.
