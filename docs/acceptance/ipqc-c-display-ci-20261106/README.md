# PR93 display CI compatibility — source-only candidate

Isolated worktree/branch `fix/ipqc-c-display-media-proof-20261106` starts at published display head `0d5ed8a2bdc7319bec43623f8090ddd8f5948228`. The CI edits contain none of the separate local C409, B or role-layout changes. Already merged main4baca404 (#91 read-path optimization) is now inherited unchanged for exact integration testing. Product files, original bounded-image policy, dependencies, schema, data and application asset pins are unchanged. No live operation, source/history export or deployment is involved. Final candidate HEAD/tree and remote CI are reported separately after their exact checks.

## Bounded media: exact reproduced source-contract failure

On exact0d5, `node --test tests/bounded-media-loading.test.mjs` reproduced46 PASS/1 FAIL: the historical ipqc-c.js:318 rule's original expanded-image source is no longer inline after the display refactor. New equipmentDetailHTML uses eq.photoId, while preserving lazy/async and the original photo endpoint. A different audited original location432 already uses eq.photoId; replacing318's expected tag would collapse distinct locations. The policy fixture and its assertions are retained unchanged.

A test-only exact inverse reverses precisely the three display spans, then runs the original historical image policy assertions. Full source hash, unique exact byte offsets/content and inverse full-source hash bind it to C display7c797314… and priorcc9e17f5…. Current mode reads the raw Git HEAD blob and requires actual working source to match exactly except CRLF checkout equivalence; no normalization occurs inside the pure inverse. Unknown HEAD/worktree drift, missing/duplicate/changed/moved display spans (including ALL markers missing), changed URLs/images/lazy/async hints, wrong-file/mode and baseline substitution reject. Explicit external readonly fixture trees retain their original checks and actual callbacks; absent markers never select legacy mode for the current checkout.

Projection applies **only** inside the historical policy loop. Current helper/render/viewer tests execute actual source, and actual C browser asserts original selected URLs, real image decode, async/lazy hints and visible placement at1440 Chinese/390 Vietnamese. Existing selected fullsize/eager and original-photo rules remain. Compiled delivery browser independently exercised100 original512×256 synthetic images: far sentinel deferred until scroll, fullsize original dimensions, no page errors/unexpected mutations. Request observations came from an existing warm listener and are not a cold-load budget claim.

Targeted bounded/display checks:52/52 PASS. The exact Local Safety step28 file group initially produced220 PASS/1 environment failure on Linux because powershell.exe is unavailable; its original exit-code assertion is not skipped or modified. Native Windows execution remains a remote CI gate. The EOL update adds another bounded case; final group count belongs to final-head execution.

## Feedback: separately established harness race

The unmodified exact0d5 `access-event-two-tabs-browser.test.mjs` passed locally. The CI message `page.evaluate: Promise was collected` was **not literally reproduced**, and a unique CI root cause is not claimed.

A controlled delay of the authentic product client import on that exact source establishes a concrete defect in the old count probe: public flush() returns undefined before initialization, the probe's open(name,2) creates a new empty v2 DB, and its onsuccess handler throws NotFoundError from transaction('events'). The page emits that error while the outer Promise remains pending. Observed events were upgrade then success with an empty store list; no business POST or business-state change occurred. This supports repairing that harness race without labelling the CI failure flaky.

After establishing this independently, the public role test at200dc033/d560a584 (blobaea9af0e…) was consulted as comparison only. Its initialization/read-only principle is relevant; the role layout/product changes are not imported, and its separate CI status is not attributed to PR93.

The new test-only probe aborts any creation/upgrade, rejects missing/blocked/schema/error/abort/timeout conditions, closes connections (including eventual callbacks after an earlier refusal) and returns data only after readonly transaction completion. It never creates the product schema or accepts an empty malformed DB. The current actual product still initializes its own DB.

The second browser context deliberately holds authentic client bytes, proves an early probe rejects without leaving a DB, releases those bytes and waits for actual public `received` readiness before checking the original empty outbox. The departing page also reaches actual readiness. Original two-tab record counts, minimal metadata, closed-tab durable recovery, unique server row, zero BOM business POSTs and exact business-state assertions remain; successful receipt status is also awaited. The first getAll probe uses the same closed/transaction-complete reader. Page errors are asserted empty.

Nine browser control checks independently cover missing count/all without creation, broken v2 stores, blocked v1 upgrade and eventual abort, newer-version refusal, actual product storage read, abort after request success, no-event timeout, and invalid mode. The actual dual-tab/closed-tab command and these controls pass with no page errors/business mutations. They are registered in Feedback CI; no runtime telemetry or business recovery behavior changes.

## New-main reporting proof compatibility

After the first follow-up head ef0cc4b was uploaded, Feedback run42256188477 failed earlier than the browser steps: access-event-main-integration.test.cjs expected the unchanged reporting predecessor58d06589…, but newly merged main's C route was0610032b…. This is distinct from the original IndexedDB race; its browser tests had not run in that CI attempt.

The isolated work branch normally incorporates already merged main4baca404; its pre-fix tree exactly equals GitHub's generated CI tree520ed609…. The same old safety-byte assertion reproduces locally. Only this direct test entry composes the already reviewed C I/O inverse0610032b…→67dfc685… before the unchanged metadata inverse67dfc685…→58d06589…. No original pin, shared inverse, production route, authority code or B entry is changed. The existing central Begin/Local Save chain remains untouched. Exact complete predecessor equality, wrong-file/raw-buffer boundaries and partial/repeated/predicate/actor/CAS drift negatives are added; unknown source still cannot satisfy the original pin.

## Verification and review boundary

Before same-PR publication, run on committed combined HEAD:

```sh
node --test tests/bounded-media-loading.test.mjs tests/ipqc-c-equipment-display.test.mjs
node scripts/test-ipqc-c-local-gauge-browser.cjs
node tests/sites-delivery-browser.test.mjs
node tests/access-event-outbox-probe-browser.test.mjs
node tests/access-event-two-tabs-browser.test.mjs
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run sites:source-check
node scripts/sites-ci-preflight.mjs
PROCESS_PROGRAM_COMMIT=<exact-head> npm run build
```

Compiled fixtures require their standard PROCESS_PROGRAM_COMMIT environment and a supported Chromium path. Exact original Local Safety step28 and the Feedback workflow's metadata/receipt/schema group also run. A new independent in-place review is required for all new bytes. No GitHub formal review, readiness, merge, deployment, hosted/physical-device or combined A+B+C acceptance is implied.

Feedback path filters now also include the C route and its two reporting-proof inverse dependencies. A regression checks these exact paths; existing filters and checks remain.
