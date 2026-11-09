# Canvas / Tooling global Save choice — local candidate

Baseline: `b06394ce0065849733399423afd2d906761d69c1` from the opened unified
checkout. Work is isolated on `work/canvas-tooling-global-choice`. No remote
write, data conversion, deletion/migration, deployment or connector action.
Relevant Canvas fixes were semantically carried from the retained
`canvas-recovery-20261108/consumer-bundle` candidate; that candidate was not
modified. Main's equipment delivery recheck and content equality remain intact.

## Behavior

Canvas keeps one `process:platform` draft. Save reads current authority and
compares **all** current-page journal workspaces/stages together. One dialog
chooses mine, theirs or cancel for every true conflict; independent local and
peer fields survive. A stable choice continues the original Save directly to
one atomic POST/CAS. The local Delete action already confirms removal; new
peer-dependent edges are listed in the global conflict dialog and its mine
choice confirms the entire deletion group, without a second Save confirmation.

Tooling keeps one whole-library local edit buffer. Form completion and same-page
filters write nothing. Save performs the same global field comparison, preserves
nonconflicting fields, then shares working and saved atomically using the
existing `save-local-v1` adapter.

After a conflict choice, both modules perform another unconditional readonly
read. Changed generation, permission, pending/draft identity is rejected; changed
revision/content restarts the global comparison from the **original unchanged**
journal/local basis within that same Save. The user sees the new peer values
before choosing again. No Save POST is dispatched until the comparison is
stable. Every final patch has an exact latest-value guard and the command has
`expectedRevision`; a change after the final read is still rejected atomically.
A sent/unknown operation never enters this comparison loop or becomes a new
operation; only its original receipt may settle it.

Canvas remote removal never resurrects deleted nodes. Immutable node-ID
collisions and legacy whole-node dependency blockers still fail closed. Tooling
cannot recreate removed immutable source/code/history records by choosing local
fields. Those structural safeguards remain separate from editable-field choices.
The existing 256 Canvas patch bound rejects the whole batch; no split Save is
introduced. Existing authorization, create/delete distinctions, pending locks,
submit/effective/history rules and durable receipts remain.

Fixed Canvas/Tooling draft polling is removed. Existing explicit entry, Save,
read-only comparison and operation-receipt actions remain. Unsent input remains
page-local and is silently discarded by existing departure adapters; same-page
filters preserve it. Unknown receipt markers remain through departure. Canvas
manual Sync/local recovery controls are removed from current UI; legacy receipt
settlement stays supported. Shared read-only preview no longer offers an earlier
conflict rebase that would require another Save click.

## Verification

- `node --test` over the ten affected files below: **462 PASS**, including actual
  production controller/transport, signed handlers with SQLite/R2 fixtures,
  real production conflict-dialog DOM and production Tooling forms.
- `node scripts/test-tooling-ui-request.mjs`: **48 groups PASS** with synthetic
  DOM/clock/HTTP ports. Former fixed-poll assertions now verify no timer loop.
- Full `tsc --noEmit`: PASS, zero diagnostics.
- Targeted oxlint over nine changed runtime/adapter files and two handler/DOM
  test files: PASS, zero diagnostics.
- `git diff --check`: PASS.
- Native Chromium desktop/iPhone-width tooling test: **NOT AVAILABLE**. Browser
  startup aborted at `process_singleton_posix.cc:297`, `socket() failed:
  Operation not permitted`; no browser UI case ran. No retry or permission bypass.
  This candidate does not claim native layout, touch, keyboard, physical iPhone,
  cross-computer, full-site or production-data acceptance.

Affected test files:

```
tests/canvas-save-conflict-choice.test.mjs
tests/canvas-deletion-groups.test.mjs
tests/canvas-pending-form-admission.test.mjs
tests/process-canvas-atomic-save-stack.test.mjs
tests/process-canvas-atomic-save-client.test.mjs
tests/multiuser-canvas-recovery-store.test.mjs
tests/multiuser-canvas-recovery-authority.test.mjs
tests/canvas-departure.test.mjs
tests/canvas-manual-sync.test.mjs
tests/tooling-global-save-choice.test.mjs
```

These cover multi-workspace/three-stage mine/theirs/cancel, same-Save re-choice
before the only POST, a peer change after the final read, dependency deletion,
no extra deletion confirmation, local input while POST is in flight, permission
revocation, actor/delivery/generation/pending fences, original lost-ACK receipts,
unknown/no-resend, immutable command downgrade/tamper probes, storage faults and
silent departure. Fixtures contain synthetic data only.

## Integration dependencies

- `shared-draft-client.js`: Canvas-only private rejection capability binds the
  original issued Save, exact command, original POST and private HTTP/pre-fetch
  proof. It does not change equipment or opt other modules into weaker retries.
  The bilingual revision-error wording is shared and says operation, not Submit.
- `canvas-recovery-store.js`: opaque Save command pins and existing unknown
  protocol are retained; only the explicit `process:platform` / `*` Save sentinel
  permits sent entries from multiple Canvas scopes. Legacy references stay exact.
- `lib/process-authoring-workflow.ts`: only `save-canvas-v1` admits the whole-scope
  sentinel. Every underlying path is still validated with the narrowed Canvas
  field/stage rules; all patches use the existing single workflow transaction.
- `process-authoring-v3.js`, `process-editor.js`, `canvas-local.js`,
  `effective-version-notice.js`, `process-ipqc.js`: process editor integration;
  current preview is read-only and all editable conflict resolution is at Save.
- `tooling.js`: library-local comparison/dialog and removal of fixed draft poll.
- **No `app.js`, platform-list UI, `index.html`, cache tag, schema, model format,
  deployment file or common AI_CONTEXT/HANDOFF/spec was edited.** Parent owns
  common documentation/cache/source-freeze integration. Another platform-list
  owner must merge overlapping Canvas files semantically, not replace them.

Data-model impact: no persisted schema/format migration. The explicit Canvas
Save command source now uses `canvas-v2:["process:platform","*"]` for global
batches; older original commands/receipts retain their original source and scope.
