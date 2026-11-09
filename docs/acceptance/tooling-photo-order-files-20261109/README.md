# Tooling photo ordering and File timing continuation

Base: `7ef04ed741249816aac2f1336cf15f888ff92fa0`, isolated local contribution.
No remote, native browser, backend scope, schema/data or approved-view policy changes.

## Ordering

Two actual stageChanges → signed route/kernel → Save cases reproduced silent
loss of local photo order: `[a,b]` → `[b,a]` saved as `[a,b]`; a peer append `c`
also saved `[a,b,c]` without a conflict, clearing the local journal. The first
photo is used as the list image, so this loses the local primary-image choice.
Negative log: `/tmp/tooling-photo-order-before.log`, 2/2 FAIL.

The stable-ID merge now retains the single changed surviving order, preserves
independent additions in their relative slots (tail additions stay after all
existing photos), and groups incompatible order/anchor changes into the existing
single Mine/Theirs/Cancel decision. Row fields and disjoint appends remain merged.
The existing post-choice fresh read/recomparison, owner, revision/CAS, pending,
permissions and original receipt/no-resend paths are unchanged.

PASS: `tests/tooling-global-save-choice.test.mjs`, 32/32 with actual full frontend
closure/event handlers and signed real handlers against synthetic SQLite/R2.
Includes original grouped choices/recompare/authority/unknown, new reorder-only,
reorder plus peer append, incompatible order choices/cancel and shared-slot controls.
Log: `/tmp/tooling-photo-order-after.log`. These are synthetic DOM/clock tests,
not native rendering or live account acceptance. The File timing follow-up is
separate from this ordering change.
