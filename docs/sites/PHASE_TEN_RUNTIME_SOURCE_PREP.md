# Runtime source preparation: source-backed staging, simulated verification

The [true R1 data result](PHASE_NINE_TRUE_R1_LOCAL.md) remains accepted at its
recorded source pin and manifest hash. Its E snapshot was not changed or rerun.
This subsequent batch prepares the existing importer without starting a runtime.

`snapshot-import-local.mjs` now uses `createReadOnlySnapshotStage` instead of
copying every transfer chunk into a second staging directory. The helper pins
the validated manifest descriptors, validates every received chunk, and rechecks
size/SHA whenever the restore adapter reads the original snapshot. Unknown,
unreceived, duplicate, incomplete and corrupted chunks refuse. Only the future
local R2/object store is written by the restore adapter; no additional full
transfer/image payload copy is created for staging. The original snapshot must
remain available throughout import. It is not needed to serve the app after a
successful actual restore, because the target then owns its local DB/R2 data.

All existing fresh-target, schema, local-only/remote-binding, network, migration,
failed-stage retention and authReady:false safeguards remain. The conservative
space requirement was not lowered. Read-only staging adds receipt metadata
`readOnlySnapshotStaging:true`, `storedTransferBytes:0`; it does not configure an
account, signer, SDK, environment or sharing policy.

Actual targeted synthetic evidence: `sites-readonly-stage-results.json`, **4 PASS**:
source-backed reads with zero persisted transfer bytes; incoming/source corruption
refusal; unreceived/duplicate/incomplete/wrong-scope refusal; and the actual local
restore adapter using fake DB/R2, preserving fake history, 14 identities and
images while leaving the source chunks unchanged. Compiler: 0 scoped diagnostics,
`checkJs:false`; importer syntax check passes. No true runtime, SQL execution,
database/R2 binding, credential generation, dependency install or network occurred.
The earlier affected checks/data audit are reused rather than rerun unnecessarily.

The conversion's exact source pin is phase nine. Current importer-source delta
and pin are `sites-source-diff.phase-ten.json` / `sites-source-freeze-phase-ten.json`
in the parent task. Schema, table contract and dependency lock remain unchanged.
This source preparation is not a real restore/login/Sites acceptance result.

Superseded next-step assessment: see [phase eleven](PHASE_ELEVEN_RUNTIME_HANDOFF.md).
The old C1 source-write refusal and observer os5 concern their exact PowerShell
operations, not an established platform-proxy prohibition. They remain stopped.
Phase eleven separately attempted a new fake-only native Workers probe and
recorded its actual runtime crash; this is not a true-data/app login result.
An independent session signer/normal verifier and actual isolated target still
require their exact future configuration. No GitHub/Site creation, upload,
deployment, permission or original data changed in this source-only phase.
