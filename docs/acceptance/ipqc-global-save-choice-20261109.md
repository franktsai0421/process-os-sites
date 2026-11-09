# IPQC A/B and C global explicit-Save choices — local integration

Base: `b06394ce0065849733399423afd2d906761d69c1`. Isolated branch
`work/ipqc-global-choice-20261109`; existing recovery candidates were read only.
A/B source: `8308ce0` (implementation `10b3952`) from the restored account/AB
candidate. C source: structural successor `3759398`, including compared-Save
`bdb7b07`. Integration used their common `dc348749` ancestor and preserved the
current baseline. No remote or connector operations, real records, schema,
migrations, deployment or upload retries were performed.

## Result

- A/B retains one module journal across A/B lines, groups and filters. C retains
  its separate whole-module journal across products/stages/filters. Form edits
  stay in memory. Explicit Save alone reads current draft authority and compares.
- A true conflict presents one set of mine / theirs / cancel actions covering
  every conflict. A selection continues the original Save; cancel preserves the
  original local journal, comparison base, photos and receipts without mutation.
  Both sides' nonconflicting edits remain.
- A/B rereads module and full authority after choice, with bounded read-only
  reconciliation if the two GET revisions differ before dispatch. C rereads
  after choice; any changed revision, workflow, basis or permissions starts a
  fresh comparison and grouped decision before Begin/upload/Save. A write racing
  after those reads is rejected by original revision/state/CAS guards. Dispatched
  writes are never automatically retried.
- C photo presence, immutable IDs, scalar photo fields and order are compared
  separately. Independent additions from both sides remain and are placed next
  to surviving ID anchors. Independent removals compose. Delete-versus-edit and
  incompatible ordering become one structural conflict unit; the global choice
  also covers any scalar conflicts. Exact compared `mediaItems` guards remain.
- Original File object/entry/preview pins protect selected photos while choosing
  and preparing. Uncertain photo ACKs remain blocked against blind upload retry.
- Create/delete/restore permissions, pending locks, generations, fixed saved and
  approved cases, historical data and original unknown Begin/Save markers remain.
  Submit stays separate and never auto-saves. Actual departure silently discards
  unsent local input while retaining unknown receipt obligations.

## Verification

All fixtures use normal synthetic login sessions, actual current browser IIFEs
and shared client, actual API handlers, isolated SQLite/R2 and synthetic DOM/events.
They do not establish real-browser or physical-device acceptance.

- A/B conflict UI and Save revision fences: **190/190 PASS**.
  `node --test --test-timeout=30000 tests/ipqc-ab-conflict-ui.test.mjs tests/ipqc-ab-save-revision-fence.test.mjs`
- C combined Save choices, structural choices, history interleavings, approved
  readonly history and original unknown recovery: **310/310 PASS**.
  `node --test --test-timeout=30000 tests/ipqc-c-save-choices-actual-stack.test.mjs tests/ipqc-c-structural-save-actual-stack.test.mjs tests/ipqc-c-history-save-interleavings.test.mjs tests/ipqc-c-approved-history.test.mjs tests/multiuser-ipqc-c-local-recovery-actual-stack.test.mjs`
- Additional late photo-list version drift: **1/1 PASS**; fresh grouped decision,
  no predecision POST, exact latest additions retained in one Save.
- A/B atomic local-save and C operation admission: **26/26 PASS**.
- `node scripts/test-ipqc-c-tombstone-revival.cjs`: **PASS**, including ACL,
  exact selected identity/children, atomic rollback, sequence/CAS and receipts.
- Final exact strict approved-history dependency: **40/40 PASS**.
- Syntax checks, affected-file typed lint and `git diff --check`: **PASS**.
  No full production build/deploy or live QA.

## Shared integration hunks and model boundary

Root integration must retain these shared dependencies alongside module files:
`shared-draft-client.js` C comparison capabilities/retirement and A/B confirmed
rejection classification; `versioned-shared-workflow.ts` A/B signed actor phase
and explicit restore gate; `process-state.ts` exact A/B permission phase;
`version-draft-ui.js` C approved readonly history delegation;
`iqc-master.css` hidden C overlay body scrolling; `approved-history.ts` optional
strict immutable-approval evidence used by the C readonly route.

A/B adds server-authored optional `coldOrigin` initialization metadata on newly
initialized group workflows and read-only lineage digests in GET. This is an
additive workflow metadata contract, not a migration or business data conversion.
No persistent format is rewritten by reading. Old scopes without a valid witness
fail closed. A/B's existing privileged single-item resurrection limit remains;
it does not grant broader restore/create rights.

Current module asset pins and shared documentation are intentionally left to the
root integrator. Historical exact-byte source-contract scripts are not rerun or
rewritten here; actual-stack behavior tests above prove the changed paths. C and
A/B desktop/iPhone layout and real devices still need visual acceptance; C keeps
44px wrapping choice buttons and keyboard focus/escape handling.
