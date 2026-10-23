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

## Transport and progress

The browser streams missing-receipt pages: it can acknowledge a batch from page
one before scanning page two. Frames hold at most16 original chunks and8MiB
decoded bytes. Optional gzip has the same decoded cap; unknown/truncated/extra
frames, duplicate/out-of-order chunks and wrong hashes refuse. All hashes are
validated before storage. A server-computed durable quote reserves batch bytes,
R2 calls and D1 receipt statements once; existing wrapped storage consumes that
reservation before each mutation. No refund/reset/unlock or new credential.
Receipts insert transactionally; a partial provider failure retains its objects
and reservation and stops the campaign. A lost client reply is reconciled read-only,
never blindly resent. Single-chunk transport remains compatible.

HTTP verification handles at most16 chunks; semantic audit/copy process up to4
resources and8MiB per request (one larger streaming resource/multipart step stays
bounded by its existing reader). Each cursor/version persists before continuing.
Direct service defaults retain their old one-resource behavior.

UI shows preparation, receipt scan, confirmed bytes/chunks/requests, verification,
reference audit, materialization, database restore and activation. It never uses
budget debit as ACK progress or advances by timer. Stable ACK samples alone may
show an upload-stage ETA; other stages remain indeterminate when no reliable
denominator exists. Stop/error reads back budget state without reusing an aborted
signal and disables writes on unknown/in-flight receipts. Nothing auto-resumes.
The import login link returns only to the fixed /setup/import route after normal
login; arbitrary/duplicate/reserved Sites destinations remain refused.

Desktop/mobile pixel QA remains unavailable while the browser tool is absent.
Synthetic/compiled checks do not constitute the new real hosted import.
