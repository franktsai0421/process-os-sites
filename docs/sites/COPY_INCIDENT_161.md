# Fixed copy incident and lower-cost materialization

Normal owner entry: `/setup/import?continue=repair-copy`. No new credential,
schema, general unlock input, arbitrary SQL or selected transfer is accepted.
The reviewed production case is fixed in `snapshot-copy-incident.mjs`.

The owner action checks the exact stopped request, version1419/cursor161,
budget policy/charges, verified transfer, bootstrap before-image and every
completed receipt. It reads and hashes the next source and any existing target.
Only absent or matching target permits the atomic transaction. That transaction
preserves old stopped history, charges and receipts, records a single-use marker
in the existing attempts table, fences the old version and reopens this budget.
Assertions inside the D1 batch make a failed condition roll the whole batch back.
Uncertain POST never replays: the client reads status once and stops; a confirmed
marker can be followed through the ordinary apply entry. Successful recovery
continues normal copy/restore/activate with retained owner password.

Copy uses a sealed-only, manifest-pinned context instead of reloading all three
business tables each batch. Per-object source SHA and full target readback stay.
Complete receipt/cursor updates are atomic; owner debit uses its existing exact
conditional UPDATE fence without a redundant pre-read. There is no parallel
writer, larger request, cross-request cache or skipped integrity check.

Copy failure logs contain only generated request ID, fixed stage and error kind.
Import authentication failure logs contain only a fixed reason code. Provider
messages, keys, cookie values, verifiers and payloads are never serialized.
These diagnostics cannot retroactively establish the lost historical exception.

Individual-object quarantine is not implemented here. It requires separate scan
and completion semantics, failed-item evidence and a complete-set activation
guard. Global authorization/quota/CAS/unknown outcomes must still stop writes.

Synthetic cost counts are not remote performance evidence. Require reviewed
source, exact-head CI, private deployment, fresh incident proof and actual live
receipts before claiming recovery or speed. Preserve original3000/R1, staging,
all history and Frank credentials; no public or paid resource changes.
