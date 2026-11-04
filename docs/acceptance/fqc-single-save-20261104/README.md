# FQC single-save candidate — 草稿流程統一與加速計畫

Base: main `85fa4a36442b3b72323eb4a6eeb105b867c4856a`. Independent branch `feat/fqc-single-save-20261104`. Source-only candidate; no merge, publication or business-data mutation.

## New contract

FQC forms complete into this page's memory. Matrix clicks and filtering do not write shared business state. One explicit 存取 sends guarded field changes and touched matrix cells and atomically creates the shared saved snapshot. Edit permission includes this save; submit remains separate. Different fields/cells merge, equal intended values converge, genuine field conflicts require explicit comparison/confirmation. Confirmation rebases locally; another explicit Save commits. Pending locks, identity, generation, CAS, immutable cases/history and original operation receipts remain authoritative.

FQC navigation automatically abandons unsent local input using the checked departure lease. Unknown Save can leave but its original durable operation marker remains; receipt queries never re-POST. Other modules do not opt into automatic abandonment. This does not implement a cross-module pending-save/export screen.

## Existing-data inventory and rollout

The repository contains working, saved snapshots/saves, fixed pending cases, active versions, historical versions, and durable browser receipt markers/local matrix recovery records. No live datastore/session was inspected, so live counts and the existence of the previously reported unknown operation are **not verified**. All tests use synthetic SQLite/R2 and synthetic sessions.

This change does **not** reset working to saved and does not delete or migrate any existing server record. A pre-upgrade applied-but-unsaved working body is preserved and remains the starting baseline. Legacy browser unknown receipts and historical local recovery records remain supported. New ordinary matrix choices are not written into the legacy recovery store.

Before any future cleanup: take an authorized consistent backup, inventory each scope's working/saved generation/revision and hashes, pending/active/history counts and referenced media; separately inventory unresolved receipts without clearing them. Compare working to saved in an isolated copy. Only a separately reviewed, scope-pinned reversible transition may retire old working content; retain the original immutable backup and audit mapping. Unknown operations must be resolved by original receipt first, never guessed absent from 404. This PR needs no cleanup approval because it performs no cleanup. A cleanup proposal would require exact inventory, recovery evidence and confirmation before mutation.

## Verification

- Native new command/client tests: atomic save, independent actor merge, same intended value, real conflict all-or-nothing, permissions, pending/generation/deleted/product guards, exact known-rejection discard and unknown denial.
- Browser tests: local forms/matrix, filtered choices, shared refresh, desktop/mobile and Chinese/Vietnamese, distinct-actor merge, images/equipment, saved submission/withdrawal, receipt-only unknown recovery and automatic departure.
- Navigation regression: automatic FQC opt-in retains target preparation, identity fences and other-module blockers.
- Synthetic benchmark: `node scripts/benchmark-fqc-single-save.cjs`. Paired five samples with 256 items: median Apply+Save 95.53 ms versus single Save 49.37 ms; HTTP 4→2, POST 2→1, R2 GET 51→25, R2 PUT 3→2, wire bytes 416473→277647. In-memory/synthetic measurement, not live latency or an SLO.
- Physical phone/IME, cross-machine employee sessions and hosted acceptance: NOT_RUN. Old immediate-Apply UI tests require migration to the new contract; original API compatibility tests remain relevant. Final exact-head CI status is reported in the PR/task handoff.

## Integration and deployment risks

Shared files: `versioned-shared-workflow.ts` (FQC-only permission mapping), `shared-draft-client.js` (FQC save receipt/rejection handling and checked unload opt-in), `delivery-navigation.js` / `navigation-lifecycle.mjs` (opt-in auto-abandon), `index.html` (asset versions). Other module branches must merge these changes semantically.

No schema or data-package change. The new combined save deliberately uses the conservative full reader: the older optimized Save path assumes working is unchanged. Deploy API support before/new with updated cache-versioned UI. Older cached editors still support legacy Apply until refreshed; preserve their writes and receipts. Downgrading UI must not erase newly saved snapshots. External equipment replacement is a separate existing workflow, not converted by this FQC editing PR.
