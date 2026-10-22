# Phase two checkpoint — source written, not verified

Historical checkpoint; current fixture verification is recorded in
[PHASE_TWO_VALIDATION.md](PHASE_TWO_VALIDATION.md). Runtime/full R1 remains unverified.

Stopped at the parent's checkpoint request. No SDK/runtime, database/R2
connection, real-data import, credential setup, installation, build, browser,
Git write or deployment was executed in phase two. All source patch calls have
returned; there is no background execution or outstanding approval/tool call.

New files:

- `lib/snapshot-redaction.mjs`
- `lib/snapshot-d1-r2.mjs`
- `lib/snapshot-stream.mjs`
- `lib/snapshot-files.mjs`
- `lib/snapshot-local.mjs`
- `lib/imported-local-init.mjs`
- `scripts/snapshot-download.mjs`
- `scripts/snapshot-import-local.mjs`

Modified after phase one:

- `lib/snapshot-contract.mjs`
- `app/api/snapshots/route.ts`
- `db/env.d.ts`
- `scripts/local-init.mjs`
- `tests/sites-security.test.mjs`

The written adapter uses bounded D1 captures, R2 inventory pagination and ETag
conditions, credential scrubbing, chunked transport, completion markers,
schema/hash/reference checks, local-only staging and immutable-reference
rekeying. These claims describe intended code paths, not tested behavior.

Current conservative profile rejects JSON objects above 8 MiB, ZIP/unknown
containers and old state-chunks storage instead of claiming complete export.
Consequently this is not qualified for the retained R1/full-size dataset.
Current export code also needs a pinned PROCESS_PROGRAM_COMMIT at runtime.

Phase-one results (18 fixture cases, scoped types PASS) predate these edits and
do not verify phase two. The phase-one diff file also has not been refreshed.
The phase-one document's 501/adapter-missing description is now historical;
the replacement source remains unverified and must not be published.

Resume with fake-binding tests for the new source/target adapters, stream
truncation and completion, credential removal in current/history/encoded JSON,
reference rekeying/missing objects, local post-write verification, path/link
guards, metadata preservation and source-version/ETag drift. Then rerun affected
phase-one fixtures and scoped type checks. Review startup/authentication and
role projection regressions before attempting any separately permitted runtime.
Do not run G3/C1/MF operations or their equivalents; do not infer permission to
launch the local SDK importer from its presence as source code.
