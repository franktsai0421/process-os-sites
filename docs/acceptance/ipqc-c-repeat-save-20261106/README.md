# IPQC C repeated editing and receipt recovery

Base: latest fetched main `2882f35`. Branch: `fix/ipqc-c-repeat-local-save-20261106`. Synthetic fixtures only; no hosted Site, real data, backup, diagnostic route, migration, approval or deployment used.

## Evidence and cause

Normal legacy draft adoption, first Save and two consecutive new-error Done/Save cycles pass in desktop/mobile Chromium. The coordinating live UI check later confirmed the long-running Save succeeded with a real allocated item code; it is not a proven listener failure or no-op. A second coordinated live round also completed three local Done actions and eventually saved after about 18 seconds while the button stayed available. This supports the missing immediate busy feedback defect; the earlier DROP form and long server/network latency remain unproven. A read-only new tab without unknown controls cannot resolve a prior tab's unknown operation; OPERATION_NOT_FOUND is not a confirmed write rejection.

A deterministic separate fault reproduces a defect: commit a local new-error Save, lose its ACK, return 404 to original-receipt GET, then permit the original receipt. Before the fix, explicit Check reports success and removes the transport unknown barrier while the already-saved create remains in localChanges (expected 0, actual 1). A later Save could duplicate the create. The Save-button recovery path already cleared that queue; the explicit query path did not.

## Change

Keep a RAM-only pin of the sent local Save operation/generation, exact queue reference and serialized changes. Only the transport's verified original receipt/readback plus unchanged actor/epoch/delivery/mount/input may settle that exact batch. Begin recovery is separate; no marker is forcibly removed. 404 remains unknown, GET never resends. After verified settlement, the ordinary authorized full read adopts current shared state. Changed local input is retained rather than cleared.

Local Done now explains an unknown-operation barrier instead of silently returning. Save immediately disables its button, sets aria-busy and shows 存取中／Đang lưu… before asynchronous work; an existing legacy recovery pending state displays a query-required message rather than silently returning. Neither behavior unlocks writes. Existing CAS, edit/create/delete/submit permissions, pending cases and whole-module Save remain.

## Verification

- Chromium 1440×844 and 390×844: consecutive error creation, local Done with no POST, first legacy Save, repeated edits, photo upload deferred to Save, CPK, batch fixed count 3, two synthetic approved equipment identities, product/stage/search switching, Save/readback/reload, malformed ACK, original receipt 404 and later confirmation, post-query new Save with original create count exactly one, explicit unknown-blocked Done message, no resend, conflict/peer preservation, Chinese/Vietnamese and departure.
- Isolated atomic API local Save test: PASS, including CAS/allocations/receipts, peer fields, rollback, permissions, equipment/photo validation and pending lock. Extended same fixture through Submit, unauthorized editor approval refusal, Withdraw, same fixed-snapshot resubmit, reviewer Return, resubmit and distinct reviewer Approve; persisted fixed contents and old withdrawn case preserved.
- 64 Begin/recovery/submission/rejection contract tests: PASS. Save projection and read recovery client suites: PASS. Lint: PASS before final documentation packaging; exact head CI tracked separately.
- Legacy `test-ipqc-c-workflow-v3.cjs`: FAIL at synthetic login initialization (503 before any workflow), not classified as a product workflow failure. Current local-Save fixture completed the workflow cases above.
- Live latency cause and real-device IME/touch: NOT RUN. The coordinating live UI verification below is distinct from this branch’s isolated tests and does not certify deployment of this candidate. Historical unknown operations were not reissued or classified failed.

No data-model or persistent format change. Integrate after main's #75 and identified Begin/recovery work; this branch already starts from that main. Coordinate `ipqc-c.js` changes with module-boundary work. Parent integration must update its asset cache pin in `public/process/index.html`; that shared shell is deliberately left to integration. No dependency on AB performance or permission redesign.

## Coordinating live UI acceptance — 2026-11-06

Reported by the parent task after normal-UI verification; this worker did not repeat hosted reads or writes. These observations concern the current test Site, not deployment of this PR.

- Full V28 draft listing: 174 pages, 1,735 rows (869 errors / 866 items). Formal V27: 173 pages, 1,730 rows (866 errors / 864 items).
- Comparing visible scalar fields and photo URL/name found only five added QA rows; all 1,730 pre-existing rows were unchanged within those compared fields. The additions are the prior empty QA L9 group; QA L10 group and L10-01 (standard disabled, photo, caliper, CPK on, batch fixed count 3); and QA L11 group plus L11-01, both soft-deleted (`deleted=true`). This is a visible-field comparison, not a claim about unobserved bytes.
- Second live round PASS: three consecutive local forms, required custom-time/AQL validation, Save after switching stages, QA group soft-delete Save and independent reload. Saved time displayed 18:04. Earlier Save completion was delayed but successful; no repeat Save was issued for that waiting operation.
- Independent image loading completed: QA photo naturalWidth 480, gauge photo naturalWidth 900.
- Whole-library UI still showed 66 incomplete items / 306 coverage issues. Live whole-V28 submission and approval were NOT RUN; parent was confirming the affected scope. The isolated fixed-snapshot review tests above do not approve the live draft.

PR #89 code head `9c2f60f`: IPQC C local Save (`42207882751`), AB C local Save (`42207882429`) and PROCESS local Save (`42207882975`) passed. Local safety (`42207882985`) was still running when checked. No submitted reviews or inline review threads were present. Documentation-only updates do not change these code-head results into exact-new-head results.
