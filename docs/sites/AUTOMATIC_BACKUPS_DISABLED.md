# Ordinary automatic backups disabled — local candidate

This candidate disables periodic snapshots, before-change protection snapshots
for ordinary application mutations, and implicit top-100 snapshot pruning.
Existing backup rows and R2 objects are not deleted or migrated. Retained
`backupSettings` values cannot reactivate the disabled periodic entry.

## Covered application paths

- Bootstrap and shared-state GET no longer run a scheduled backup check.
- Shared-state saves, account management, equipment replacement, routine FQC
  and the independent IPQC-C workflow no longer create protection snapshots.
- The common versioned writer covers master data, FQC, IQC, IPQC-AB, BOM,
  tooling, routine equipment and process authoring, including their ordinary
  save/submit/review actions. Their draft and review histories remain intact.
- Legacy IQC, IPQC-AB, IPQC-C and equipment mutation routes also stop creating
  automatic snapshots.
- Where protection insertion previously supplied an early revision check,
  `stateRevisionIsCurrent` now checks the revision without reading the full
  state or writing a snapshot. The final revision-conditioned UPDATE, conflict
  handling, operation receipts and no-change/replay behavior remain.

The legacy cloud backup screen reports this disabled state without attempting
its unavailable `/api/backups` service or flushing unsaved business input.
Existing menus/layout and the separate local-disk maintenance mode are retained.

## Explicit maintenance exceptions retained

This does **not** promise that every possible maintenance operation creates no
backup. These protected, separately invoked paths remain:

- Release-state draft capture and its coupled before/after replacement snapshots.
  The recovery HTML calls capture only on localhost; hosted release access still
  requires its separate maintenance credential and existing gates.
- Local tooling handoff's explicit pre-migration snapshot; its local-only and
  administrator gates are unchanged.
- Explicit account/access migration tools retain their own local protection receipts.
- Snapshot import/activation restores supplied historical rows under its existing
  target, owner, integrity and phase gates; it is not an ordinary save backup.
- Local ZIP backup/restore tools and their own configuration/safety mechanisms.

No new restore tool, scheduler, service identity, maintenance endpoint or release
hold is introduced. Shared snapshot helpers no longer implicitly prune, even
when used by an explicit maintenance operation. No existing backup cleanup is
implemented here.

## Recovery and verification boundary

Ordinary future changes lose these periodic/pre-change recovery snapshots.
Delete confirmation, auth/CSRF, drafts, approval rules, immutable history and
CAS still apply, but they are not replacements for a full recovery backup.

Focused verification uses actual handlers with synthetic SQLite/R2. Ordinary
workflow fixtures retain 150 historical rows and reject every attempted backup
INSERT/UPDATE/DELETE. Explicit maintenance capture is tested separately.
No real Site, account, backup or business data is exercised by these tests.

Deferred media can still write derived R2 caches, and routine report generation
remains a separate business write. This is not a globally write-free GET change.
Actual Site speed remains unaccepted; stopping backups is not proof that all
page latency is resolved. This candidate is not published.
