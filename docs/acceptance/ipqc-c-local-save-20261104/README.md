# IPQC C local editing and atomic Save candidate

Base: main `85fa4a3` (merged #73). Independent branch `feat/ipqc-c-local-atomic-save-20261104`. Not merged or deployed. No business data, schema, account, backup or Site changes.

## Behavior and implementation

Ordinary error/item create, edit and delete now stay in browser RAM. The form's Done button updates the local working view; Save (存取/Lưu) uploads selected photos and sends one `save` command containing guarded local changes. CPK, sampling rules, equipment selection and photo references use the existing structural checks. The server allocates real IDs/codes, applies the batch to a private aggregate, saves the resulting shared snapshot and commits once through the existing state CAS. One outer receipt owns the entire result; internal transitions never persist receipts. Historical reserved codes and records remain intact.

A fresh server read and per-field guards preserve other editors' distinct changes. Same-field conflicts reject the complete batch; input remains local. Deletion guards are deliberately conservative (full row, and the full item list for error cascades). A simultaneous unrelated item change can therefore require a cascade deletion to be reconsidered. No overwrite/rebase is automatic.

Edit permission now also permits Save; an existing explicit Save-only grant still permits saving already-shared working content, but cannot apply a local-edit batch. Submit remains independently authorized. Pending locks, create/delete gates, photo existence, effective equipment checks, authority recheck and CAS remain enforced. Old clients' Apply and ordinary Save remain compatible.

Search/filter and refresh preserve queued local edits. Committed navigation discards RAM input without prompting or saving. In-flight/unknown operations retain their existing conservative guards, durable operation identity and receipt-only recovery; this candidate does not silently unlock unknown operations. A lost/malformed Save acknowledgement is recovered by its original receipt, without issuing a new Save.

Photos remain browser-local until Save. Immutable photo blobs are uploaded before the atomic state commit; a failed commit may leave an unreferenced blob, which is retained rather than deleted. State references and saved content commit atomically. Existing legacy explicit history restore remains on its guarded shared-workflow path.

## Legacy inventory and data boundary

Source inventory identifies `workflow.working`, `saved`, `saves`, `cases`, active versions, reserved codes and durable browser operation markers as separate stores. Begin retains legacy working without relabeling it saved. This change never resets working to saved, migrates or clears old shared unsaved content, pending cases, formal versions, history, photos or unknown markers. Actual live counts and ownership were NOT read; any live inventory/cleanup remains with the coordinating parent task and requires its existing limited authorization. No seed, migration or cleanup script was run.

## Evidence

All tests use synthetic identities and isolated SQLite/R2 or local Chromium. No test Site writes.

- `test-ipqc-c-local-save.cjs`: one CAS for create+edit+Save, stable allocated references, exact receipt replay, distinct-field edits from separate actors, same-field and late-batch rollback, edit-implies-save/independent-submit, create gate, photo/equipment rejection and pending lock.
- `test-ipqc-c-local-browser.cjs`: Chromium 1440×844 and 390×844; zero mutation on form Done, filter/read input preservation, one Save POST, photo upload deferred to Save, CPK/rule persistence, Chinese/Vietnamese label switching, silent local departure/reload, malformed ACK receipt recovery without a new POST, horizontal overflow check. Native IME and physical devices NOT_RUN.
- Existing operation-permissions, Save-boundary, create-mutation and Save-projection client checks passed. Only old edit-only Save-denial assertions changed to the newly confirmed rule; other denial/history/legacy assertions remain.
- Existing read-recovery, coverage-parity, entry-apply and submit-coverage checks passed.
- Lint and JS syntax checks passed before final documentation/CI packaging; final exact-head results belong to CI.

`benchmark-ipqc-c-local-save.cjs` compares ten old Apply calls + Save against one batch Save, five measured rounds after warm-up: median 173.03 ms → 15.48 ms; state CAS count 11 → 1. In-process actual handlers with synthetic data; excludes network, browser, image upload and live Site latency. This is a composed protocol comparison, not a whole-site performance claim.

## Coordinated integration gates

No FQC/IQC/canvas/shared transport implementation or shared shell file was edited. Parent integration must update the `ipqc-c.js` cache version in `public/process/index.html` and reconcile the shared specification, QUALITY, DATA_MODEL, CHANGELOG and HANDOFF links to this note. This avoids competing writes with concurrent modules. No unconfirmed pagination UI was added.

Build requires `PROCESS_PROGRAM_COMMIT` naming the fixed candidate; the initial unpinned invocation correctly refused before build. Pinned-candidate build passed (safe build/auth-client checks); exact-head CI, cross-module integration, live latency and authorized test-Site acceptance remain separate gates. Draft PR is not release approval.

## CI follow-up: completion boundary

PR #75 run `41821384280` passed the atomic API test but failed the browser assertion at line 42: departure was `busy`, not `clean`. The test had treated `localChanges.length === 0` as operation completion. Receipt recovery clears that queue before the final data/permission read finishes, so this was a premature assertion against a valid departure guard.

The browser fixture now waits for both an empty local queue and `busy === false`. It also deliberately holds the recovery data GET, verifies exactly one original-receipt lookup and the retained `busy` departure guard after queue clearance, then releases the GET and verifies completion. The one-POST assertion and all original UI/data assertions remain. This follow-up changes only tests and this evidence note; no product guard, timeout, permission or CI requirement is relaxed. Local Chromium 1440/390 and lint passed; updated-head CI is tracked separately.
