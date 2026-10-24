# Owner-session application of an already-sealed import

Entry: `/setup/import?continue=apply`. One explicit Apply action uses the normal
owner session/master.export and existing same-origin server protections. It
fresh-reads configuration, fully verified transfer state and durable activation
state. Only sealed/copying/restoring/data-ready can proceed; active is read-only.
No files, upload, verify/audit replay, native grant, new key or schema is involved.

Existing copy/restore/activate services retain the per-object hash/readback,
conflict refusal, bootstrap pin, CAS, budget and lock protections. Owner responses
include post-release budget state for these actions, as for verify/audit. Final
activation can confirm complete/no-lock in that same response before the previous
owner session becomes invalid. It preserves the target Frank verifier, updates
the actual account storage reference and authEpoch, and requires normal re-login.
Source employee credentials remain excluded and are not silently provisioned.

The client permits one run and one request at a time. Each response must progress
the allowed phase/version/counters; unknown, malformed, conflicting, quota,
permission, payment or timed-out outcomes stop. POST120s/GET10s, Stop/unmount and
two bounded read-only reconciliation calls retain the established behavior.
An ambiguous activation is not reported inactive. No automatic POST retry or
unlock exists. Closing the page stops subsequent requests; reopening fresh-reads
the durable state without restarting completed stages. There is no background
queue and no promise to continue after closing the page.

Display elapsed time, confirmed object counts/row counts and current server phase;
do not advance counters by timer or infer provider quota from the budget. Shared
capacity remains unknown. Existing finite approved budget, quota/payment refusal
and preservation of staged/source data remain mandatory.

This source implements the approved private test-Site application scope. Local
synthetic/compiled tests are not live activation or full business acceptance.
After review/CI/private publication, use only the selected already-sealed target.
Preserve original3000/R1, staged chunks, retirement/native history and owner
credentials. Subsequent full data/reference and normal role/function checks must
be recorded separately before claiming the test Site is ready for employees.
