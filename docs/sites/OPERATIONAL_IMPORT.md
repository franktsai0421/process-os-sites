# Operational import preparation

The full R1 transfer was cancelled by the owner. Never resume it, reset its
budget lock, activate it or purge its staging as part of an offline conversion.

`snapshot-operational.mjs` derives an offline selection from the pinned completed
normalization plan and its original browser handoff. Keep current business rows
and feedback byte-for-byte, traverse every current record dependency, and retain
all standalone media plus private-media mappings and feedback archives. Bare
hashes are conservatively resolved to every matching name. Only the global
`state_backups` table becomes an empty array in this NEW candidate; the original
100 backups and every original object remain in the local R1/view. Business
approval/version records reachable from current state stay included.

The local writer creates a new nonoverlapping directory, aliases original chunks
and copies only small replay deltas. It audits every selected payload, hash,
reference, private-image index and account structure before marking COMPLETE.
Wrong pins, missing references, corruption and occupied output refuse. It does
not initialize a database, configure credentials or upload anything.

Run `node scripts/prepare-operational-handoff.mjs --source <original-snapshot>
--parent-handoff <completed-full-handoff> --view <completed-normalized-view>
--output <new-directory> --parent-manifest-sha256 <verified-full-view-sha>` from
the clean committed source. Paths are ordinary separate arguments. Output
OPERATIONAL-PROFILE.json reports actual logical/delta sizes and local audit.

A selected view is not a hosted runtime acceptance. A new manifest pin, reviewed
source, supported transport and explicitly scoped disposition of old cloud
staging/control rows are required. Preserve the target owner verifier. Never
silently reuse the cancelled transfer or bypass its retained in-flight marker.

Progress and bounded batching are still in preparation in this work branch;
the cancelled serial uploader is not a validated new import method.
