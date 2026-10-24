# Version19 authenticated recovery: local review only

Default-off integration of the accepted primitive; no commit, publication, real
credential or live mutation in this phase. Old request:
`787e1f35-5e06-4db9-a9f9-cc5fc61b8670`, nonce
`9517c2ec-3e4b-4590-97a7-2b4889fbbac9`, request SHA
`7545c9f10691d093183e35a3e6faaa077737db42251c3c5574cdd49520087257`.
Its request hash proves expectedVersion19; committed cursor272 is authoritative.
c273 matched current bytes, not historical request success or root cause.

## Entry, admission and atomic boundary

`PROCESS_V19_RECOVERY_ENABLED=1` selects the new adapter at the existing import
route. `PROCESS_V19_RECOVERY_JSON` must contain format
`PROCESS_OS_V19_RECOVERY_V1`, exact program commit, fixed UUID nonce, maintenance
digest/ID/times and independent restricted-grant digest/ID/times. Old recovery
and c273 observation must be off; conflicting modes fail closed.

Only GET `v19-plan`, GET `v19-status` and one POST `v19-resume` are accepted.
Maintenance bearer/no cookie, exact origin, owner eligibility, program/config,
nonce/plan and fixed incident pins are verified before admission. Server builds
the full plan; the client supplies only its hash and nonce. Owner/time are checked
again after admission. The builder returns guarded statements and the adapter
immediately dispatches them with a fresh expiry guard, without async work between
final clock and dispatch. No generic SQL/target/unlock or role endpoint exists.

Schema-only0008 adds two empty singletons, bringing the model to22 tables:
`process_import_verify_v19_admission` persists pending/unknown/complete before
dispatch, preventing a second POST after ambiguity; the accepted
`process_import_verify_v19_supersession` completion receipt commits atomically
with the fence. Separation is necessary: failed atomic work must retain admission
without pretending recovery committed. Neither record resets. The consumed0006
maintenance singleton is captured in full, compared and never modified.

The atomic batch rechecks every before-image field, all3 operations, chunk count
and bytes, absence of activation and owner revision. It changes19→20 without
advancing272, revokes only the old restricted grant, inserts the new restricted
grant and completion receipt, and releases only the exact old budget lock. Every
write has an in-transaction changes()=1 assertion. Old unknowns, operations,
attempts, charges, chunks, business records and maintenance history remain.
Old advance first causes rollback; recovery first fences the old version.
Lost ACK is read back, never replayed. Unknown admission stays consumed even
when the transaction did not commit. Truncated tool output is not a before-image.

## Restricted continuation and existing host

The existing independent restricted capability table/scope is reused; old staging
code cannot authenticate the new grant. baseline_version stays19 as the original
unverified anchor; verified/checked/cursor stay0. Supersession establishes20/272.
Current owner, expiry, generation, pins, revocation and fence remain checked
before I/O. Upload, reconcile-existing, copy, restore and activate are forbidden.

Existing CLI adds `--run-v19 <reviewed Site commit>` and exclusive marker
`.sites-runtime/incident-v19-verify-generation.json`; old marker is retained.
Same host generates independent32-byte secrets internally, outputs digest/config
metadata only, waits for matching configuration confirmation, then accepts the
Site bearer through hidden stdin. Raw application/maintenance secrets never leave
the process for output/files/argv/env. Fixed T0 includes setup waiting: maintenance
10min, operation4h, receipt5h. No extension or regeneration on restart.

One resume POST, readback, handshake and receipt-count checks precede the first
window272→288 (version21). Exact complete nonce/hash, zero planned/pending/failed/
unknown and open/no-in-flight budget are required for the bounded review pause.
Nonsecret continue frame binds grant/checkpoint/transfer/manifest. Same process,
provider and keys then run verify/audit only. Errors/expiry/EOF clean up; ambiguity
permits only bounded receipt reads. JavaScript string references can be discarded,
not guaranteed securely erased. Process exit is not platform bearer revocation.

## Evidence and practical limits

14 primitive +8 authenticated-adapter +1 schema +15 real host/session lifecycle
cases passed. Complete TypeScript and build passed. Seven narrow compiled HTTP /
actual workerd D1 groups passed: auth/nonce/plan refusals, both race orders, final
write rollback, delayed owner crossing expiry after admission, restricted scope,
and actual manifest checksum refusal. First D1 attempt failed in synthetic seeding
because the `values` column was unquoted; fixture correction let all7 groups run.

Compiled synthetic data cannot reproduce the true pinned manifest. Tests prove
invalid bytes cannot advance cursor; they do not claim real272→288, full live
audit, remote performance or recovery succeeded. Successful host windows use
synthetic responses. CI wiring exists but no remote CI was launched in this phase.
Fresh projection uses committed source; projection of this uncommitted patch is
deferred to later PR CI. PR13 control-cost changes remain; new remote latency is
unmeasured. Nothing here changes current version19/cursor272/unknown/lock.

## Single future live approval, after independent review

1. Normal commit/PR/exact-head CI/review/merge; official source sync and private
   test Site deployment with schema-only0008 (two tables). Pin actual Site source
   commit in runtime/config. Keep old recovery and observation off.
2. Run reviewed `--run-v19` host once. Configure its nonsecret digest metadata and
   new mode using native tools, preserving Frank password/audience. It creates
   new in-process maintenance and verify/audit secrets with fixed10min/4h/5h.
   A new Site entrance bearer is required; no lost raw bearer is assumed reusable.
   Native tool→same-executor hidden stdin only. Platform bearer expiry/immediate
   revocation remains unguaranteed and is a separate disclosed risk.
3. Fresh-read complete incident/pins/charges/operations/lock. Execute only the
   exact19→20 CAS if before-image still matches. Revoke only the old restricted
   grant, preserving all staged bytes/history. Drift or unknown stops writes;
   do not reset admission, replay POST or issue replacement keys.
4. Rehash272→288 first and inspect its clean checkpoint. Then explicitly continue
   the same host before original expiry for remaining verify/audit. No reupload,
   copy/restore/activate, data deletion or business enablement.
5. Close the new recovery mode/config after finish or stop; retain both singleton
   receipts. This does not claim immediate revocation of the platform bearer.

Root coordinates this future approval; none of these live actions happened here.
