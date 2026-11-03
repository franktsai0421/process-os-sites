# FQC authority-body compatibility regression

Base: fetched GitHub main `f23fb5e9cce9e4c1cb89e556151e8d5ff229d830`, including merged PR #63/#64. Work branch: `fix/fqc-authority-body-recovery-20261103`. Remote branches and open FQC PRs were checked before work; no competing open FQC PR or earlier authority-body candidate was found. The checkout had no uncommitted changes.

## Cause and scope

The supplied live v37 observation at 2026-11-03 10:33:55 UTC reported POST 500 with `stage=required-state-read`, `reason=AUTHORITY_BODY_INVALID`. This task did not access the live Site or its data. An independent synthetic reproduction through the production serializer generated `processAccessControl.audit[].before.__immutableBody`; the unmodified base then returned the same stage/reason for both Apply and Save. This establishes the storage-reader incompatibility for that shape, not that every historical 500 has this cause.

`encodeRecordValues` normally externalizes object-valued `before`, `snapshot`, `content` and `working` fields. FQC's required-state reader had rejected all actual immutable authority references before the ordinary decoder could verify and hydrate them. It now uses that existing SHA-verified decoder on the same five pinned authority keys, with no deferred history. Raw aggregate JSON is validated even when a maintenance overlay later overrides it; hydrated values are also validated before any maintenance overlay and again after it, and remaining nested immutable references are rejected. Missing objects, SHA mismatch, invalid JSON and transient failures do not fall back to a second snapshot or reader.

The original current identity/permission and revocation checks still precede all business hydration. The one-use write capability, original manifest, preserved authority/unrelated pointers, field guards, revision retries/CAS, receipts and anti-replay behavior are unchanged. The authority fix introduces no writer/schema/migration/data-package change. The current departure follow-up below discards unsent inputs without adding a browser archive or restoration feature. It retains existing unknown receipt evidence, grants navigation-only coverage and advances affected frontend cache versions; server storage is unchanged. Hydrating required audit bodies adds their necessary reads; this is not a latency improvement claim.

## Recovery and safe departure

The main branch already contains PR #63's recovery behavior. Browser regressions now run with a real serializer-produced authority audit body:

- Begin, edit/create error and item, Apply, explicit Save, reload.
- Lost ACK, second click, receipt-only lookup, retained later input, a new explicit guarded Apply after confirmed recovery, and no duplicate creation.
- Missing receipt and failed terminal readback keep the original uncertainty and input; no POST retry or unknown-marker deletion.
- Two actors' different fields merge; same-field changes require reconfirmation without overwriting the other actor.
- Unknown state keeps Save and whole-draft Discard unavailable; the separate explicit input-abandonment choice below can permit SPA departure while retaining the write lock. After a verified original receipt, explicit Apply and Save, the actual departure adapter is clean, `canLeave()` is true, and Chromium navigates away without an unload warning.
- Matrix recovery, historical receipts after withdraw/return/approve, durable cleanup failure and new-runtime recovery retain existing protections.

**Existing unknown operations without a verifiable receipt retain their write lock.** Fixing the first-Apply cause prevents this failure chain for new operations; it does not prove that an earlier unknown operation never committed. There is no automatic reset, resend, force leave or live recovery. The explicit input-abandonment choice described below permits SPA departure in the new client while retaining that write lock. The task therefore does not claim to have unlocked the already affected browser/session. A separate verified recovery decision is needed if its receipt remains unavailable.

## Verification

Cloud Linux, Node 24.19.0, native Chromium, actual TypeScript routes with ephemeral SQLite and in-memory R2 only. Synthetic network interception permits the fixture origin; no production credentials or business content were used.

| Check | Result and boundary |
| --- | --- |
| Before-fix reproduction | Apply and Save failed with the exact supplied stage/reason using normally serialized synthetic audit data |
| Focused authority regression | PASS 10: Apply/Save, unchanged pointer/no authority leakage, missing/SHA/JSON/transient faults, ordinary-reader equivalence, revocation during hydration, current permission denial despite historical granted rights, and unresolved bodies hidden by a maintenance overlay |
| Required dependencies/capabilities | PASS 80 plus 10 focused tests (90 total in the follow-up run); preserved maintenance precedence, denied permissions, unrelated-fault isolation, selected snapshots, CAS races, one-use capabilities and compatibility |
| Apply/receipt/matrix/navigation regression | PASS 207; first actual 500 before/after CAS, retained form, second-click guard, receipt lookup, ACK projection, generation recovery, multiuser matrix and departure coordinator |
| Actual browser forms/recovery | PASS 29; 390/1280 px, Traditional Chinese/Vietnamese, plus collaborator, historical and matrix cases described above |
| Clean source clone | PASS for the initial candidate: standalone clone of implementation commit `c9fcc4a799e1db518dfb41fae34d5db17696cdfa`, locked dependency install, 9 focused tests, source-boundary check and clean worktree; no original node_modules or business package reused |
| Full typed lint | PASS, exit 0 |
| Build | PASS, exit 0, existing postbuild auth-client check passes; build stamped with the verified base SHA, not represented as a deployed candidate |

326 distinct tests passed after the overlay follow-up (10 focused + 80 dependency + 207 regression + 29 browser). The initial extra focused rerun is not counted twice. New focused tests are included in the existing Local safety CI job; the browser job already executes the augmented browser files.

Commands:

```sh
node --test tests/fqc-authority-bodies.test.mjs tests/fqc-required-dependencies.test.mjs
node --test tests/fqc-write-failure.test.mjs tests/fqc-generation-recovery.test.mjs tests/fqc-recovery-diagnostics.test.mjs tests/fqc-known-rejection.test.mjs tests/fqc-unknown-recovery.test.mjs tests/fqc-apply-reliability.test.mjs tests/fqc-apply-ack.test.mjs tests/fqc-matrix-apply-lifecycle.test.mjs tests/fqc-matrix-last-apply.test.mjs tests/fqc-matrix-rejection.test.mjs tests/fqc-matrix-conflict-discard.test.mjs tests/fqc-matrix-multiuser.test.mjs tests/navigation-departure.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test tests/fqc-apply-browser.test.mjs tests/fqc-unknown-recovery-browser.test.mjs
npm run lint -- --format unix
PROCESS_PROGRAM_COMMIT=9736f8991b049c4358e9d6bfe3b5cc242bb0cc47 CLOUDFLARE_CF_FETCH_ENABLED=false WRANGLER_SEND_METRICS=false WRANGLER_WRITE_LOGS=false npm run build
```

NOT_RUN: live Site acceptance/recovery, physical iPhone/IME, real data performance, remote Cloudflare deployment or migrations. Viewport simulation is not physical-device acceptance. This is a source-only PR candidate; GitHub CI/review and any future release have separate gates. No merge or deployment is authorized here.

Reusable test improvement: storage compatibility tests should build their authority data through the real serializer, not solely hand-written inline JSON; otherwise normal audit history is absent from all success fixtures and the reader/writer mismatch is invisible.


## Explicit input abandonment (current source candidate)

The user subsequently clarified that unsent input should be discarded, without preserving a copy or providing restoration, and that this should ultimately cover all draft pages. The unmerged full-input checkpoint helper, browser archive schema, restore UI and bundle entry have been removed. Earlier checkpoint-only test counts and builds are historical evidence, not acceptance of this replacement.

The FQC choice **放棄未存輸入並離開（操作結果仍未確認）** / **Bỏ nội dung chưa lưu và rời đi (chưa xác nhận kết quả)** permits navigation for a current authorized FQC Apply unknown with an intact original receipt marker. It freezes the owned source controls and issues a runtime-only navigation lease tied to the same client, actor/epoch and marker. Only the final verified destination handoff closes the form/matrix buffers. A failed target preparation releases the lease and leaves the inputs usable. Nothing copies the abandoned form inputs into persistent storage or restores them on return.

The operation remains unknown. Existing receipt-only transport/matrix evidence is retained, as are write admission, CAS, fresh permission checks, native unload warning and original receipt recovery. The distinct `departing` navigation state is not `clean`. A later POST may still commit. The source never deletes the marker, retries the command, treats 404 as rejection or rolls back shared data. Another scope’s unresolved work, identity invalidation, an altered marker, in-flight work or a foreign editor still prevents this narrow FQC departure. On return, fresh authorized reads and original receipt recovery apply; abandoned inputs do not reappear.

A synthetic delayed-CAS probe already established that a genuine receipt 404 can precede successful completion of the original single POST. Matching visible field values and elapsed time are also insufficient settlement evidence. Existing source hydration changes fix the confirmed serializer/reader mismatch only; other historical 500s remain unproven.

**Old live v37 limitation:** an already open v37 page does not contain the new departure code. Removing the input-preservation requirement does not install this code or settle its original unknown. This task did not inspect/change the live site, delete markers, resend requests, merge or deploy. Live resolution remains blocked until approved source publication and a verified old-client transition; no guarantee about recovering old unsent inputs is offered or required.

**Broader scope:** the common VersionDraftUI adapter is used by AB/C/master data, FQC, IQC, IPQC-AB/C, routine equipment, routine reports, BOM and tooling. Process authoring uses its own canvas/ledger adapter whose existing discard can perform a server rollback. Users/feedback have separate lifecycle handling. Extending simple input abandonment to these paths needs its own implementation and multi-module tests; this FQC PR does not claim complete cross-module acceptance.

Verification entry: `tests/fqc-abandon-browser.test.mjs` (actual UI/router/transport and TS routes, synthetic SQLite/R2), plus existing form/receipt and shared navigation suites. The new cases cover zh/vi at 390/1280px, departure/return/cross-page browse, absent archives, real reload, delayed commit after 404, collaborator changes, failed target preparation, foreign unknown, actor/marker changes and unknown matrix receipt preservation. Latest execution results and CI are recorded in the PR, with explicit PASS/FAIL/PENDING boundaries. Independent review remains separate from author tests.

Prior CI findings were corrected without weakening gates: the removed checkpoint asset had required a new cache version and a bundle count of 50. The current design returns to the original 49 scripts and uses `20261103-fqc-departure2` for changed assets. Old-head CI is not a substitute for current-head CI.

Replacement validation (2026-11-03): PASS 40 actual Chromium tests (11 abandonment + 29 existing form/recovery), PASS 155 shared navigation/build/cache tests after correcting one removed-asset expectation (39-test affected file rerun passed), source boundaries, diff checks and local build. The initial local lint result was reported prematurely before reading its completed output; CI confirmed a test-only unbound-method error. It is corrected using Reflect.get without disabling the rule. An expanded binding test also found a source-extraction boundary that did not handle FQC’s wrapper; only that boundary is updated, preserving its actual module assertions. Full lint and these affected tests must pass before the next push. The build used the prior commit stamp with the changed source tree and is not represented as an exact-commit release build. Old checkpoint tests are removed because their behavior is no longer desired, not to hide a failure. Exact new-head CI, independent review and physical-device acceptance remain pending.

Follow-up: complete typed lint now PASS (exit 0); all 83 actual module-binding tests PASS after the extraction fix. No product behavior or check thresholds were changed by this test-only follow-up.

Navigation lease release also drops its references to detached form elements, so unknown receipt coverage does not retain abandoned DOM/input buffers. The 11 native abandonment tests and complete typed lint passed after this change.
