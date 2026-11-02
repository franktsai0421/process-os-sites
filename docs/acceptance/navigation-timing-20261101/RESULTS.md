# Windows checkout and immediate Stop/Clear follow-up — HOLD

This small follow-up is relative to private review `aa66e8bad0e0b78885a1cfb6f700ee946a26987f`; all earlier evidence below remains retained. Source contract fix: `1a725210e9ea0d38d8f022a9243099ff6c1ce04f`. Diagnostic-page compiled/native source: `522b971a5578d11f34993c67a97e479cc8544a46`; subsequent differences are the native test's non-deprecated load-event wait and this documentation. No public upload or deployment.

## Actual Git checkout RED → GREEN

Two source-only local checkouts were created by Git with `core.autocrlf=true`, not by manually replacing line endings. At aa66, process-state retained its committed CRLF, while state-records (436 lines) and session-revocation (22 lines) changed only LF→CRLF. The original test yielded **1 PASS / 2 FAIL**, both `complete timing candidate bytes changed`. Their committed hashes were unchanged.

The exact inverse now receives `git show HEAD:<path>` bytes, with the same candidate/baseline hashes and all original inverse tamper assertions. A separate working-copy fence accepts only CR immediately before LF; comparison is byte-based, with no UTF-8 decoding, trimming, semantic normalization or broad ignored region. It rejects other byte changes, invalid UTF-8, trailing spaces, bare CR and removed final newline. The inverse itself continues to reject converted EOL bytes.

Fixed actual autocrlf checkout: **6 PASS / 0 FAIL**. An additional real working-file mutation changed one non-EOL byte in state-records while retaining CRLF: the committed inverse still passed and the working fence failed. Restoring the byte returned all six tests to PASS. Private receipts retain exact commit/working hashes and newline counts for RED/GREEN. `.gitattributes`, the inverse implementation, span pins, old hashes and product auth/storage files are unchanged.

This reproduces Windows Git text-checkout behavior on the selected **Linux** host. An actual `windows-latest` runner/full Windows CI was not available or run; it remains the parent's CI gate. No alternate executor or remote action was used.

## Pending control races

Stop and Clear are always enabled, including while Start/Refresh/Export awaits the config/auth response. Either control increments a private action sequence, aborts only that diagnostic GET and releases busy state immediately. Late success/failure/finally cannot restart collection, download, restore cleared rows or overwrite a newer action. Unmount also invalidates/aborts. There is no polling, ACL change, business-request cancellation or new credential.

Actual TSX with controlled hook/HTTP/storage ports: the same eight assertions against aa66 were **0 PASS / 8 FAIL**; fixed source **8 PASS**. The transport deliberately ignores abort to prove the sequence guard independently. Cases cover all six pending-action/control combinations, an old failure arriving during a new request and unmount before export. This is a controlled JSX-element test, not native browser evidence.

Compiled Chromium targeted test: **7 checks PASS** — all six pending-action/control combinations against delayed actual authorized config responses, plus no browser POST and byte-identical synthetic shared state. Stop/Clear act before the held response is released; late delivery cannot reload/export. The final test waits on the actual load event and does not use deprecated `waitForNavigation`.

Targeted source/TSX suite: **14 PASS**, no skips. Typed lint on the four changed test/UI files, full TypeScript, compiled build/auth audit PASS. Final source-history receipt is supplied with the delta. Unchanged business suites and performance measurements were deliberately not repeated. The previous default-off-versus-main latency gap remains unmeasured; no new speed claim is made. Parent independent review and normal Windows CI remain required.

---

# Authorization hardening — HOLD, not deployed

This follow-up supersedes the earlier security behavior below. Admin hardening is in `26f72ac`; final Clear repair and compiled/native measured source are `df1bd204149168f6cac9000e7fd039e54f5c4a48`. The earlier pre-Clear measured run `b287f020e19a2a7fadb9b48ee4d55b0aff84b765` is retained separately. Later changes are tests/documentation only. Final commit and exact-head build/history receipts accompany the private delta package. No live Site, public source upload, business data or ACL was changed.

## Security changes and checks

- Existing verified identity results now admit only current non-demo admins to diagnostics. Any failed/restricted identity check suppresses that request permanently. Credential login supplies its verified account role/type after successful password/session creation. No extra per-API identity/storage call is added. The client header remains untrusted opt-in, not proof of privilege.
- Quota is consumed only after authorized success. A real-identity test sends forty anonymous 401s, then obtains all thirty admin sample slots; request 31 still returns the ordinary 200 body without timing. Non-admin 200 bodies remain unchanged and emit no metrics.
- Start, Refresh and Export recheck the current no-store config/auth gate. Denied, unavailable, off or expired responses stop recording and hide the displayed summary. Native tests independently revoke the session before Refresh and before Export: both receive 403, remove activation, hide the table and produce no download. Existing files/local bytes cannot be recalled; this is action-time enforcement, not continuous revocation of previously seen data.
- Clear empties recorder RAM and storage and prevents subsequent snapshots or queued save callbacks from re-persisting rows. Both unarmed Clear→pagehide and armed Stop→Clear→snapshot counterexamples pass; Stop still retains summaries.
- The inactive diagnostic page now only reads retained rows. It installs no fetch wrapper, observer, events, timer or badge. Repeated stop is safe and restores fetch only if it still owns the wrapper. Tests cover double setup, double teardown, a later fetch owner, and stopping on a missing authorized sample without changing the business response. Missing timing (including quota exhaustion) conservatively ends local recording.
- Bounded pre-auth spans stay in request memory until admission. Revocation is checked through existing authority checks and UI actions; no polling, extra auth cache, new persistent credential or permission change. Per-token revocation still depends on the existing rollout flag. In-flight requests already authorized before revocation are not retroactively cancelled.

Final diagnostic suite: **22 PASS** (27 including five existing build tests), including genuine identity/admin/non-admin/anonymous/demo/disabled/deleted/authEpoch/revoked/revocation-read-failure, off/expiry, quota, observer teardown and three exact source inverses. A 131-test run covered the earlier 16 diagnostic tests plus 115 existing build/FQC required-dependency/conflict/login/bootstrap regressions. A separate 67-test run covered the then-19 diagnostic tests plus 48 existing AB auth-phase cases. Counts overlap; they are not 198 distinct tests. All runs have zero failures/skips.

Native compiled Chromium: **11 checks PASS**, including existing login/dashboard/FQC ready, safe export, 390px layout, both revoked actions, Clear with no snapshot resurrection and byte-identical business shared state. The synthetic fixture enables existing token revocation and inserts/deletes synthetic revoked-token rows only for the negative tests. Login retains its normal counter/cookie writes. First launch failed before browser tests because the default Playwright binary was absent; the retained rerun uses installed `/usr/bin/chromium`. No live environment fallback was used.

Source contracts: `source-eol` **20 checks PASS**, identity-prefetch **42 cases PASS**, access-template **5 groups / 114 comparisons PASS**, including FQC T5. The new `navigation-timing-source-spans.json` pins complete candidates and exact reversible spans for process-state, state-records and session-revocation, restoring exact `c129318` bytes before the existing inverses run. All older baseline/candidate hashes, FQC tail hash, allowed spans and negative assertions remain unchanged. Each new span has changed/deleted/duplicated negatives; outside-span bytes, extra suffix and EOL tampering also fail. No broad regex stripping or history-guard exception was added. The identity-prefetch runtime still executes the instrumented candidate with the real default-off timing implementation.

Typed lint, full TypeScript, compiled build/auth audit and full source-history guard passed during this follow-up; final exact-head receipts are included in delivery. Source review of the new inverse pins remains a parent review gate. These checks are not a deployment approval.

## Current bounded cost measurement

Same isolated compiled Worker, same synthetic snapshot, existing session revocation enabled; n=5 per arm, AB/BA/AB/BA/AB, no concurrent lint/build jobs or artificial network delay. This is diagnostic overhead within the SAME candidate, not the original employee-site speed acceptance. **Default-off runtime latency versus main c129318 has NOT been measured.** Removing the recorder from compiled HTML below is a byte-accounting comparison, not a fresh baseline build or a runtime baseline.

| Operation | Off median / max ms | On median / max ms | Paired on-minus-off median |
| --- | ---: | ---: | ---: |
| Dashboard bootstrap GET, complete body | 18.66 / 38.20 | 21.72 / 26.20 | +0.61 ms |
| Full document to existing dashboard ready | 227.67 / 239.19 | 207.44 / 231.50 | -18.40 ms |

Final paired differences retained: API -16.48, +7.54, +0.61, -3.79, +2.11 ms; document -34.46, -24.79, +19.50, -18.40, -9.34 ms. The prior pre-Clear run had API off 18.69/27.10 versus on 18.74/22.27 ms (paired median +0.29), document off 215.12/239.42 versus on 220.28/227.66 ms (paired median +8.39). Its complete raw pairs are retained in the delta package too. The opposite document signs show variability; the newer lower value is not evidence of a speed improvement. API body is 10,409 bytes in every row; timing header max 2,045 bytes. The server did not add auth/DB calls in the direct on/off identity comparison. There remains measurable/variable browser cost; no zero-cost, no-regression or live speed claim is made.

## Default-off byte proposal — NOT implemented

The new compiled recorder is 13,560 raw bytes (its script element adds 17); the actual compiled process shell is 18,233 bytes. Removing only that script for comparison leaves 4,656 bytes. Thus current off-path delivery still adds **13,577 raw / 4,076 local-gzip bytes**. Local gzip sizes are estimates, not observed hosted transfer sizes.

The smallest proposal is to minify **only the new recorder at build time** using the already installed transformer. A disposable measurement reduced that compiled recorder to 8,950 raw bytes; the resulting hypothetical HTML is 13,623 raw / 5,269 gzip versus current 18,233 raw / 5,992 gzip: **4,610 raw / 723 gzip bytes saved**. It adds no request, preload or business-bundle change. Only parse/script-boundary checks were run for the proposal, not semantic/browser acceptance; no generated minified code or product loader change is included.

An opt-in lazy collector could remove most off-path bytes, but would change coverage: requests before an authenticated admin explicitly enables and the collector finishes loading would NOT be sampled. It must not claim complete initial/login coverage, must not block bootstrap and needs contention/first-request testing. No lazy script, preload or whole-app compaction was added. HOLD remains pending independent review and a decision on acceptable cost.

---

# Previous candidate evidence — retained, not current security acceptance

Measured compiled code: `0616ced168af9d1f6eea5e9507dd036df3d44a03`, based on `c129318cbf373076cef66ca6f164e4c3ccd49aa4`. Later documentation-only commits do not replace this measurement identity. Exact final build/source-history receipts are private under `.sites-runtime/navigation-diagnostics/`.

## Current checks

- Typed lint and full TypeScript: PASS.
- Diagnostic/privacy/binding/stream tests: 8 PASS; existing script/style build tests: 5 PASS.
- Targeted existing FQC Apply/ACK/required-dependencies, revocation, CAS, unknown/receipt, conflict Discard, login-intent and bootstrap contracts: 178 PASS, 0 failures/skips. These ran against the candidate before subsequent diagnostic-only UI/logging refinements; business guards were not changed afterward.
- Compiled Worker build plus auth audit: PASS; final exact documentation HEAD is rebuilt before handoff.
- Native Chromium UI: anonymous configuration 403; anonymous bootstrap with timing opt-in 401 and no timings; authorized start, login-ready/submit, dashboard and FQC-ready, R2 labels, refresh/export, stop/clear, 390px bilingual controls and no page overflow PASS.
- The recorder emitted no business POST. The only browser POST was one synthetic credential login; fixture setup also logged in once outside the browser. Business shared-state revision and bytes before/after are identical. Existing login counters/cookies were not mislabelled as zero writes.
- Compiled default-off recorder: one sessionStorage lookup; no observer/fetch/event installation or recorder HTTP request. No live Site/account/data was read or changed.
- Full source-history guard: required without added exceptions; final result is in the handoff receipt. The initial reserved directory-name failure was corrected in unpublished source, not bypassed.

## Minimal load check

One nonpersistent Miniflare D1/R2 fixture, one Chromium desktop context, same snapshot and compiled version. Five interleaved paired rounds (AB/BA/AB/BA/AB), n=5 per arm. No artificial network delay. Browser interception denies non-loopback traffic and disables the HTTP cache for both arms. After the final build, the final measurement ran alone, without concurrent lint/type/build jobs. This is a small instrumentation-cost check, not an employee-site benchmark or proof that all functions never slow down.

| Operation | Disabled median / max ms | Enabled median / max ms |
| --- | ---: | ---: |
| Dashboard bootstrap GET, complete body | 16.12 / 21.81 | 17.72 / 21.07 |
| Dashboard full-document → existing ready | 209.18 / 216.10 | 207.69 / 229.69 |

Paired enabled-minus-disabled differences, preserving every round:

- API: -0.74, +2.20, -2.17, +1.63, -0.10 ms (median -0.10).
- Document-ready: +5.27, +5.36, +27.39, -5.42, -9.81 ms (median +5.27).

No zero-overhead or statistically stable speed claim is made. In this sample, enabled complete-body medians are 1.60 ms higher, while the paired API median is slightly lower; document paired median is 5.27 ms higher despite the pooled median being lower. Do not select only the favorable statistic.

Both API arms returned 10,409 body bytes. Diagnostic headers were at most 1,902 bytes in this fixture. The compiled shell HTML has 12,649 additional raw bytes (local gzip estimate +3,877 bytes; hosted compression was not measured). The recorder itself is 12,627 compiled inline bytes. These bytes also exist with recording off, so default-off is not a claim of identical transfer size to main. There is no extra recorder request and normal business assets/protocols are not preloaded or compacted.

Private `final-ui-result.json` retains the ten API rows, ten document-entry rows and native check outcomes. `inline-cost.json` retains the source/HTML byte comparison against c129318.

## Earlier attempts are retained

- Initial external-recorder UI check: API disabled 18.81/26.16 vs enabled 19.41/22.67 ms; no whole-entry burden conclusion.
- Corrected external-recorder check: API 19.76/34.36 vs 24.90/48.81; document 432.53/505.46 vs 573.73/754.94 ms. The blocking recorder request was rejected and removed.
- First inline check: API 22.38/51.75 vs 35.50/61.03; document 527.11/681.13 vs 420.00/691.69. Lint/types were running concurrently, so cross-run variability is not a clean causal comparison. Duplicate non-streamed metric logs were subsequently removed. All rows remain preserved.
- Development failures (missing URL in the isolated VM fixture, log-capture fixture mismatch, parser initially omitting the digit in R2 labels, and an overstrict exact-function-string comparison after bundling) were fixed or corrected, and the relevant checks rerun. No failed check was counted as passed or removed from private evidence.

## Remaining boundaries

No existing test-Site observation or deployment occurred here. Parent-reported browser CUA recovery remains the live-test prerequisite; this worker did not change executor or read private browser state. No remote CI, physical iPhone, real employee concurrent load, global disabled-versus-main latency study or final merge with #56 was performed. The full repository suite was not rerun; selected security/regression checks and normal CI wiring are explicit above.

The synchronous CPU timing limitation of Worker clocks remains. Partial/header-only intervals and missing streamed logs cannot be converted into invented DB/network/CPU causes. Known login HTML latency outside the app Worker span remains a separate platform/network investigation.

This is a reviewable diagnostic candidate for a short authorized observation window. It is not approval to deploy, not the rejected acceleration candidate, and not completion of the original safe-speed improvement goal.

## Exact proposed source scope

31 files relative to c129318:

- `.github/workflows/local-safety.yml`
- `AI_CONTEXT/CHANGELOG.md`
- `AI_CONTEXT/modules/RUNTIME.md`
- `HANDOFF.md`
- `app/api/fqc/workflow/route.ts`
- `app/api/master/workflow/route.ts`
- `app/api/navigation-diagnostics/route.ts`
- `app/api/platform-login/route.ts`
- `app/api/process-authoring/workflow/route.ts`
- `app/api/process-bootstrap/route.ts`
- `app/api/routine-equipment/workflow/route.ts`
- `app/layout.tsx`
- `app/login/login-client.tsx`
- `app/navigation-timing/page.tsx`
- `docs/acceptance/navigation-timing-20261101/README.md`
- `docs/acceptance/navigation-timing-20261101/RESULTS.md`
- `lib/login-limit.ts`
- `lib/navigation-timing-client.mjs`
- `lib/navigation-timing-loader.mjs`
- `lib/navigation-timing.ts`
- `lib/process-state.ts`
- `lib/process-styles-build.mjs`
- `lib/session-revocation.ts`
- `lib/state-media.ts`
- `lib/state-records-response.ts`
- `lib/state-records.ts`
- `lib/versioned-shared-workflow.ts`
- `public/process/index.html`
- `tests/navigation-timing-browser.mjs`
- `tests/navigation-timing.test.mjs`
- `tests/photo-entry-cloud-fixture.mjs`

Source, synthetic tests and text documentation only. Private raw JSON, measured builds, installed dependencies, browser state, log files, original archives and source-history receipts are not proposed uploads. No persistent credential or business-data migration is included.
