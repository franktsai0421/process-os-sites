# Feedback integration with merged main

Integrate main `bad04632d354f290850632976bf6eb69b8e2d3c9` (#85/#87) into the existing Draft #86, retaining both parents and all source history. No merge to main, deployment, migration adoption or feature activation.

## Change / risk / verification

| Area | Resolution | Required evidence |
| --- | --- | --- |
| Shared client | Preserve main pre-dispatch WeakMap identity, equipment terminal readback, master ACK readback, A/B diagnostics and departure rules. Restore only isolated metadata observations. | Exact projection to pinned main bytes; Begin/no-resend, ACK, transfer, A/B and PROCESS tests. |
| Versioned route | Main body plus original actor/action-authorized opt-in action metadata. | Strict metadata inverse before unchanged batch3 and historical Begin inverses; actual handler and receipt rejection checks. |
| Entry/cache | Reporter before merged shared client; retain all main module pins and feedback entry pin. New shared pin `20261105-events-batch3-1`. | Exact uniqueness/order and compiled source-derived bundle checks. |
| Tests/docs | Union current assertions and both document histories. Preserve main CI commands. Add reporting projection proof to feedback CI. | Targeted tests, lint/typecheck/build, compiled cross-module browsers and complete exact-head remote CI. |

All fourteen selected module/controller/handler files in the integration proof remain byte-identical to merged main. Shared client and both receipt handlers project to exact pinned main hashes after removing only reviewed reporting spans. Historical source hashes, offsets and negative mutation checks remain; new accepted successor requires its own complete hash and exact byte inverse. No production source normalization.

## Unchanged limitations

`ACCESS_EVENTS_ENABLED` remains default-off; `scripts/access-events-schema.sql` is an isolated candidate, not an adopted migration. Cold first-capability failure still holds new reporting metadata only in memory and may lose that central copy on reload; the original unknown guard remains. Legacy dynamic scopes, canvas and unidentified old markers are not fully collected. No claim of all-users/all-sources synchronization.

Synthetic isolated validation only. Exact commit, test counts and workflow links are reported with the final delivery; passing earlier heads is not acceptance of this integration. Native Windows PowerShell execution is unavailable locally and remains a remote CI gate. Physical devices, native IME, cross-machine, live data and release/migration acceptance are not run.
