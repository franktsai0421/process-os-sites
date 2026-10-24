# One-shot c273 observation (local implementation, not live)

Purpose: determine whether the currently stored 14,234-byte c273 object can be
read and hashed now. A match does not establish the historical cause of request
787e1f35-5e06-4db9-a9f9-cc5fc61b8670, finish that request, or advance cursor 272.
The version-19 incident remains stopped, including its lock and all charges.

## Fixed access and effect boundary

Reuse the existing Frank platform session, current admin/master.export checks,
same-origin POST and normal private Sites gate. No API key or maintenance grant
is added. The old maintenance credential is consumed/unavailable and is not
reused. No cookie is extracted. This code does not create an observation during
page load or a metadata GET. Only an explicit owner POST can claim it.

The server-owned case in `lib/snapshot-c273-observation.mjs` fixes project,
origin, owner, target, transfer, manifest, version 19/cursor 272, exact unknown
request/operation 3, counters, and expected c273 size/hash. Caller-controlled
keys, SQL, transfer IDs or alternative objects are rejected. Recovery must be
closed. Incident drift prevents the read; no original records are changed.

Schema-only 0007 adds a single consumed observation slot, not a permission table.
The conditional INSERT happens before provider I/O, guarded by the incident and
owner before-image. Concurrent/repeated requests return the same stored slot.
Lost claim acknowledgements consume it without issuing the read. A new window,
refresh or deployment cannot rearm it. Never delete or reset this receipt to retry.
Without this durable row, absence of a previous network response would not prove
that no read occurred. New metadata operations and a reserved single R2 GET are
separate diagnostic usage, not changes to the old import budget or proof of a
successful provider read.

At most one R2 GET; no HEAD/list/put, fallback or retry. The fetch-through-body/hash
window is at most 15 seconds and cannot exceed the configured observation expiry;
body consumption alone is at most 10 seconds. D1 and owner-control awaits have
5-second bounds each, so 15 seconds is not a total HTTP response-time promise.
Provider get/cancel cannot be guaranteed abortable: late objects are cancelled,
and no late result may advance the transfer. Cancellation cleanup is not awaited
indefinitely. Settlement is one metadata UPDATE; ambiguous settlement is not
retried. Existing receipt GET remains owner-authorized after the window closes.

Responses/logs contain only fixed `status`, `stage`, `size`, `sha256`, `elapsedMs`.
No object body/metadata, provider exception, headers, verifier or credentials.

## Future live operation: one complete decision, none executed here

1. Review the exact local diff, normal PR/CI/merge and official private Site
   publication. Retain project/audience/bindings and real source/runtime pins;
   apply only schema-only 0007 (20 total tables), no business migration.
2. Confirm the original incident/counters still match. Keep recovery disabled.
   Set only nonsecret `PROCESS_C273_OBSERVATION_ENABLED=1` and
   `PROCESS_C273_OBSERVATION_JSON`:

   ```json
   {"format":"PROCESS_OS_C273_OBSERVATION_V1","programCommit":"ACTUAL_DEPLOYED_SITE_COMMIT","issuedAt":0,"expiresAt":0}
   ```

   Replace both times with server-clock Unix milliseconds at execution, with
   expiry no later than T0+600000. The placeholder is not an executable setting.
   Source publication may need its separately approved source credential; this
   observation itself requires no new application/platform bearer.
3. In Frank's existing normal browser session, open
   `/setup/import?observe=c273`, read readiness, then click the one-shot button
   once. No file selection or password reset. If no supported browser control is
   available, this is one necessary owner action, not a reason to export cookies.
4. Read the sanitized receipt, close the observation flag, retain the consumed
   row, all staged chunks and original unknown lock. A timeout/unknown result is
   not permission to repeat the read. Any later version-19 CAS recovery is a
   separate decision and cannot reuse the old version-18 plan.

## Evidence boundary

SQLite control-positive tests use an explicit mocked reader because a synthetic
fixture cannot reproduce the real pinned SHA. Separate pure-reader tests hash
genuine synthetic bytes; compiled D1/R2 tests must demonstrate wrong-body checksum
refusal, one-shot replay behavior and normal owner authentication. Neither is a
real c273 success. Physical desktop/mobile browser QA and real object observation
remain untested. No secrets, live GET, grant, deployment or live state mutation is
authorized by this document.
