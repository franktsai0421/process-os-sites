# Cancelled campaign quarantine

This is an explicitly approved owner operation, separate from upload/resume.
It never deletes staged objects, chunks, attempts or original business data.
Migration0004 appends one retirement table; applied0000–0003 bytes stay unchanged.
The active budget and target pointer can change only after the old budget,
target and transfer metadata have been archived in an atomic fence transaction.

The server-only PROCESS_IMPORT_RETIREMENT_JSON has exact fields:

```json
{
  "format": "PROCESS_OS_CANCELLED_CAMPAIGN_V1",
  "projectId": "<existing-test-project>",
  "ownerId": "frank",
  "targetFingerprint": "<same-target-sha256>",
  "oldManifestSha256": "<cancelled-manifest-sha256>",
  "oldPolicySha256": "<read-back-old-policy-sha256>",
  "oldTransferId": "<read-back-cancelled-transfer-id>",
  "expectedActiveRequest": "<read-back-unresolved-request-uuid>",
  "nextManifestSha256": "<reviewed-new-data-manifest-sha256>",
  "issuedAt": "<actual-enable-time-UTC>",
  "expiresAt": "<no-more-than-24-hours-after-issuedAt>"
}
```

Only the existing test project/frank and receiving/verify_cursor0 qualify.
Semantic-audit/materialization/activation rows refuse retirement. The selected
new bounded policy must match every target pin. New dataset selection requires
the owner's current3000 parity requirement; an older R1 audit alone does not pass.
No actual runtime values are configured by this source or template.

The ordinary owner session, admin/export permission, same-origin check and
closed bootstrap remain required. Configuration reports retirement-required
without exposing its archive; upload stays disabled. The explicit page button
POSTs only confirmation of the server-pinned old transfer. No password/token,
cookie export or source credential grants retirement authority.

Fencing snapshots and compares all durable counters/policy/active request. A
constraint-checked D1 batch rolls back on a concurrent change. After fencing,
the old budget remains stopped until a second atomic batch switches only the
singleton target and active budget; its original values remain in the archive.
Old attempts/receipts and uncertain provider writes are not counted in the new
campaign. Repeated retirement after completion reads the receipt; it cannot
reset the new counters. Remove the one-time retirement runtime setting after
confirmed completion, preserving normal import/visibility settings and signer.

Already-issued R2 operations might still finish in the exact old staging prefix.
They are quarantined, not presumed cancelled. New admission and metered writes
check current policy/request ownership; late old completion cannot release,
stop, debit or acknowledge the new campaign. No automatic lease expiry or refund.
The fixed known staging format and registered retired IDs are paged and checked;
unknown objects, foreign transfer prefixes or business objects refuse admission.
All other freshness/owner/reference/hash/activation checks remain. Fresh-target
checking no longer mistakes a valid >100-object staging page for an occupied
business target; unknown cursors/layouts still refuse.

Lost batch ACK is reconciled via read-only receipts without resending a batch or
counting confirmed bytes twice. A partial/unknown provider outcome stays stopped.
Retired transport namespaces remain excluded from normal business snapshots by
the existing strict reserved-format export rule.

Synthetic service and compiled HTTP tests are not a live retirement/import or
browser pixel acceptance. The original cancelled full package must never resume.
