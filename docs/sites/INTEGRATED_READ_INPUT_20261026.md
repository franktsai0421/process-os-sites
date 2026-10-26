# Integrated bounded reads and terminal editor ownership

Local candidate; not published. Combines [automatic backup changes](AUTOMATIC_BACKUPS_DISABLED.md) and [input/viewer lifecycle](INPUT_RESOURCE_LIFECYCLE.md) without changing their protected data, history, draft, approval or authentication boundaries.

## Bounded reads

- Ordinary equipment GET selects only users, custom roles, role-template overrides, access control, maintenance mode and equipment control from the same state snapshot. It retains full active/draft/pending/history output and existing authorization. Effective-catalog GET, POST and workflow reference checks are unchanged.
- After the existing authorized projection, deferred media with no exact raw `data:image/` or `data:video/` marker returns a fresh outer object and values map without hashing or derived-cache I/O. Raw strings remain exact. Marker-bearing values keep the existing transform/cache/restore path; original image bytes, MIME, ACL and no-store remain unchanged.
- Synthetic final-code comparison: equipment 15 object GETs / 234,527 bytes becomes 13 / 104,090, with one state SELECT in both. Eligible deferred bootstrap keeps three state SELECTs and its final identity/revision fence; the tested fixture avoids two derived-cache operations. These are bounded fixture counts, not live latency or peak-memory measurements. Unrelated corrupt aggregates and optional poisoned caches are intentionally isolated; required-data corruption still fails.

## Terminal ownership

- Shared draft transport blocks new, queued and explicit-retry mutation I/O when delivery requires reload. Receipt GET, existing GET ownership, server ACL, command format and authoritative late-response bookkeeping remain unchanged. A sent-unknown operation remains in memory and exact durable recovery bytes until its existing authoritative outcome; a blocked retry is not a claim that the original operation was never sent.
- IQC dialog factory and managed lists / parts / error codes / items privately retain their exact DOM, base, closure arrays and selected files when ownership is invalidated. Terminal marking precedes detachment. Owned keyboard handlers are removed; normal close/reset/render/refocus, draft clearing, receipt cleanup and automatic apply/reload are not used. Retained callbacks and delayed uploads/catalog reads/results cannot revive or adopt old content. Current-owner 403 rejection preserves the editor.
- This is document-lifetime containment, not durable recovery after refresh/close. No reopen or cross-actor recovery API is added. Other modules' editing overlays and direct mutation paths are not claimed fixed; the shared transport admission is not a universal overlay fence. Full-list rendering cost remains outside this change.

## Verification boundaries

Focused tests execute actual handlers/helpers and IQC/client callbacks with synthetic SQLite/R2/DOM/transport ports. They cover authorized shapes, storage formats, fully consumed history streams, corruption, original-image restoration, final bootstrap fences, receipt/queue races and stale editor callbacks. Relevant integrated regressions, typecheck, normal build and independent source review are separate gates; branch-only results are not integrated acceptance.

Native Chinese/Vietnamese IME, actual browser visuals, real-data first-open/warm-return/reload latency, all-route image usability and heap measurements remain unverified. Existing FQC serial reads remain. The reported real-site slowness is not resolved by a synthetic PASS. No existing backup is removed; derived-media cache writes remain possible on the unchanged marker path.
