# IPQC C repeated editing and receipt recovery

Base: latest fetched main `2882f35`. Branch: `fix/ipqc-c-repeat-local-save-20261106`. Synthetic fixtures only; no hosted Site, real data, backup, diagnostic route, migration, approval or deployment used.

## Evidence and cause

Normal legacy draft adoption, first Save and two consecutive new-error Done/Save cycles pass in desktop/mobile Chromium. The coordinating live UI check later confirmed the long-running Save succeeded with a real allocated item code; it is not a proven listener failure or no-op. The exact cause of the earlier second DROP form and the long latency remain unproven. A read-only new tab without unknown controls cannot resolve a prior tab's unknown operation; OPERATION_NOT_FOUND is not a confirmed write rejection.

A deterministic separate fault reproduces a defect: commit a local new-error Save, lose its ACK, return 404 to original-receipt GET, then permit the original receipt. Before the fix, explicit Check reports success and removes the transport unknown barrier while the already-saved create remains in localChanges (expected 0, actual 1). A later Save could duplicate the create. The Save-button recovery path already cleared that queue; the explicit query path did not.

## Change

Keep a RAM-only pin of the sent local Save operation/generation, exact queue reference and serialized changes. Only the transport's verified original receipt/readback plus unchanged actor/epoch/delivery/mount/input may settle that exact batch. Begin recovery is separate; no marker is forcibly removed. 404 remains unknown, GET never resends. After verified settlement, the ordinary authorized full read adopts current shared state. Changed local input is retained rather than cleared.

Local Done now explains an unknown-operation barrier instead of silently returning. Save immediately disables its button before asynchronous work; an existing legacy recovery pending state displays a query-required message rather than silently returning. Neither behavior unlocks writes. Existing CAS, edit/create/delete/submit permissions, pending cases and whole-module Save remain.

## Verification

- Chromium 1440×844 and 390×844: consecutive error creation, local Done with no POST, first legacy Save, repeated edits, photo upload deferred to Save, CPK, batch fixed count 3, two synthetic approved equipment identities, product/stage/search switching, Save/readback/reload, malformed ACK, original receipt 404 and later confirmation, post-query new Save with original create count exactly one, explicit unknown-blocked Done message, no resend, conflict/peer preservation, Chinese/Vietnamese and departure.
- Isolated atomic API local Save test: PASS, including CAS/allocations/receipts, peer fields, rollback, permissions, equipment/photo validation and pending lock. Extended same fixture through Submit, unauthorized editor approval refusal, Withdraw, same fixed-snapshot resubmit, reviewer Return, resubmit and distinct reviewer Approve; persisted fixed contents and old withdrawn case preserved.
- 64 Begin/recovery/submission/rejection contract tests: PASS. Save projection and read recovery client suites: PASS. Lint: PASS before final documentation packaging; exact head CI tracked separately.
- Legacy `test-ipqc-c-workflow-v3.cjs`: FAIL at synthetic login initialization (503 before any workflow), not classified as a product workflow failure. Current local-Save fixture completed the workflow cases above.
- Live reported Save-click cause, real-device IME/touch, compiled hosted Site acceptance: NOT RUN. Historical unknown operations were not reissued or classified failed.

No data-model or persistent format change. Integrate after main's #75 and identified Begin/recovery work; this branch already starts from that main. Coordinate `ipqc-c.js` changes with module-boundary work. Parent integration must update its asset cache pin in `public/process/index.html`; that shared shell is deliberately left to integration. No dependency on AB performance or permission redesign.
