# Hosted workflow read deadline

On 2026-10-25 the private Site's three startup files and index completed. The
owner overview rendered, but reloading the editor still showed the bootstrap
failure screen. The DOM included `signal is aborted without reason`.

Production evidence, using the same normal owner session and read-only requests:

| Request | UTC | HTTP | Worker wall time |
| --- | --- | --- | --- |
| shared-state | 01:13:17.433 | 200 | 24,144 ms |
| process-authoring/workflow | 01:17:37.796 | 200 | 23,896 ms |
| effective-versions | 01:18:46.868 | 200 | 16,116 ms |

The editor's `readyForEditor()` awaits the authoritative workflow read before
the bootstrap gate is removed. The browser transport canceled these reads at
15 seconds. Independent normal-session reads completed with revision 496;
the workflow response contained its control and the effective-version response
contained 39 identifiers. No business data or credentials are copied here.

The minimal client correction gives GET reads 45 seconds, matching the existing
shared-state read budget. Mutations retain 15 seconds and the existing durable
unknown-command / receipt-first behavior. The effective-version notification
uses the same 45-second read budget and retains its one-in-flight guard. The
boot gate displays its workflow-loading stage and still fails closed on error.
No permissions, server checks, records, credentials, schema or retry policy change.

This is a deadline correction, not a measured backend speed improvement. Current
record decoding loads module records serially and workflow authorization performs
several checks; their exact share of production latency has not been instrumented.
Do not label either as the measured root cause of backend latency.

Regression evidence: virtual-clock tests run the real transport/notice code and
cover 24-second success, 45-second read expiry, unchanged mutation timeout and
unknown fence, actor changes, and single-flight notification failure. Bootstrap
fixtures retain the gate until readiness and reject a failed authoritative read.
Live editor first-entry and reload acceptance require the corrected deployment;
local tests and the one successful overview do not establish that acceptance.
