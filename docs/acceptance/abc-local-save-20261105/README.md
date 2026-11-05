# AB／C 主資料：本機編輯與原子存取候選

Depends on **#77**. Exact base: `0af6d57e912e5615250959c9e76210fecd55d96b` (`integration/draft-save-20261104`). Branch: `feature/abc-local-save-20261105`. Main remains `85fa4a36442b3b72323eb4a6eeb105b867c4856a`. Product/build/test pins are in [checks.json](checks.json); the Draft PR and its Actions run identify the final review head. This is source preparation, not a Site deployment or business-data acceptance.

## Behavior and boundaries

- AB and C products, categories, group defaults, product exceptions and the selected line/stage entry use a RAM-only local overlay. Form **完成／Hoàn tất** queues ordered guarded changes locally and makes no workflow POST. Search/filter and polling retain the overlay. A later poll does not replace original field or membership guards.
- Explicit Save sends one `save-local-v1` command with ordered `input.batches` and the matching flattened patch list. The adapter runs each guarded Apply only in request memory, validates each intermediate structure and persists the final working/saved/receipt through the existing single CAS. A failure in any batch leaves no partial shared Apply.
- Edit grants Save through effective server permissions; create, delete, Submit, restore and review retain their own gates. Raw commands and permission revocation are checked. AB never saves C. Separate field changes merge; same-field, changed group membership, route/line dependencies and deleted references reject without replacing local input.
- Submit rejects local batches or an open editable form both before confirmation and immediately before dispatch. No implicit Save and no submission of an older saved snapshot. Existing saved-ID/revision, pending locks, no-change, return/withdraw/resubmit and fixed linked PROCESS approval remain.
- SPA destination changes use the existing delivery adapter's silent local abandonment. Native departure/reload does not prompt or Save. The current shell replaces its authenticated projection between product and line/stage destinations, so these destination changes also abandon unsent input. The internal AB/C selector abandons the old scope only after the new scope loads and the original view/actor still owns the transition. Search, filters and version browsing do not shrink the Save scope.
- Durable Begin markers are separated by actor **and AB/C scope**. Save retains the original command, ordered patches/guards, generation and operation ID before dispatch. Unknown Begin/Save can leave/reopen without deleting these markers. Recovery reads only the original receipt; 404, a newer generation or an unreadable readback does not allow another POST or false success. A late Save projection cannot replace a newer observed state revision.
- A local product rename checks deletion references using its authoritative original code. A proven unsent insert can be deleted locally before Save; the backend still checks full retained references, permissions and guards in the atomic command.

Old clients keep legacy Begin/Apply/Save and exact receipt replay. Existing inline/whole-R2/records-v1 data stays in its current format. There is no schema migration, adoption-condition expansion, account migration, cleanup, real-media access or data conversion. PROCESS authoring/templates/machines are outside this change; only the established pinned stageProcessLink follows AB/C approval.

## Product and integration delta

|Files|Purpose and scope|
|---|---|
|`public/process/master-data.js`, `master-admin-ui.js`, `master-shared-client.js`|AB/C overlay, completion, Save/Submit admission, polling fence, safe departure and reference preflight|
|`lib/master-workflow.ts`|AB/C ordered atomic Save; retain reference history, delete/create, per-field and entered-field validation|
|`public/process/shared-draft-client.js`|Exact AB/C durable Begin endpoints/keys and Save readback/unknown departure; no generic default change|
|`lib/versioned-shared-workflow.ts`|Only master:AB/master:C edit-implies-Save and identified Begin allowlist|
|`public/process/index.html`|Version pins for the four changed scripts only|
|`.github/workflows/abc-local-save.yml`|Dedicated dependency-base CI; existing Local safety workflow unchanged|
|Tests/scripts|Actual handlers/transport, compiled browser, measurement and existing regression fixture updates|

The shared transport/route opt-ins are isolated in commit `a3edb52`. Parent integration must merge these changes semantically with tooling #78, BOM and IPQC A/B. This branch contains none of those candidates and retries none of their denied operations. No #51/#52 handoff branch was cherry-picked.

## Verification and evidence

See [checks.json](checks.json), [compiled Chromium receipt](browser.json) and [paired measurements](benchmark.json). All fixtures are generated synthetic data in isolated SQLite/Map R2 or nonpersistent local workerd D1/R2; no private snapshot or hosted account was used.

The API/transport suite covers AB/C inline and records, ordered edits, last-batch failure atomicity, same/different fields, separate scopes/CAS, group membership guards, entered fields, raw create/delete/Submit permission, revocation, no-change, retained published/history references, pending locks, Begin receipt identity, lost Save/Begin ACK, reopen/404 and generation fences. Existing PROCESS, authoring and shared transport checks retain their assertions.

The real compiled browser covers category creation/rename, product creation and transient create/delete before Save, exception/group inheritance, line/stage creation, filters/search, polling, two actors, fast repeated Save, return/withdraw/resubmit/approve through the review page and linked templates. Desktop 1280 and narrow 390 run in Chinese/Vietnamese; cancel and reload discard unsent input with zero beforeunload dialogs. Lost ACK tests retain exact marker bytes and never duplicate the business POST. Simulated viewports are not physical phone tests.

Some old test helpers lacked the already-required Submit revision or expected old saved snapshots to submit while shared working differed. They now capture a fresh revision and explicitly assert `UNSAVED_CHANGES_SAVE_REQUIRED` before guarded correction. The 172-row permission test reverses only the authorized edit-implies-Save cell and verifies the original baseline digest for every other cell. It does not replace the old oracle with a candidate-generated hash.

Source boundary and changed-file sensitive-data scans pass. The full generic scanner still reports two **unchanged synthetic security-test strings** in `tests/multiuser-iqc-local-recovery-composition.test.mjs` and `tests/multiuser-local-recovery-helper.test.mjs`; their base/current blobs match. No scanner was disabled or exclusions widened. Its full-run exit is recorded as BASELINE_FINDINGS, not a universal PASS.

## Performance limits

The paired handler workload is ten guarded name edits plus Save on an already-open draft, five fresh samples for each AB/C × inline/records format. Baseline and candidate run sequentially in the same executor with the same synthetic fixture and instrumented production handler; no browser/UI/Begin/network latency is included. POST/CAS drops from **11 to 1**. The complete numeric medians and samples are retained in benchmark.json. The browser separately observes zero workflow POSTs for completed forms and one Save POST (with read-only rendering requests). These measurements do not establish Site speed, private-data scale or whole-platform speed.

## Local safety contract follow-up

The dedicated CI result for the original review head did not trigger Windows Local safety: its pull_request base filters exclude `integration/draft-save-20261104`. A read-only cross-module review then passed 453 tests, ten additional scripts, compiled delivery and eight compiled Begin recovery cases, but identified two obsolete AB departure cases and a pinned historical-source mismatch. Those failures are retained as the reason for this follow-up, not relabeled PASS.

The AB cases now first prove completion is local, explicitly Save once, then prove completed unsaved input and an open form disappear on silent departure without another write. Whole persisted state and saved content stay unchanged. Unknown-Save cases inject failure at explicit Save, retain exact sent snapshots/guards/markers across AB→C→dashboard→AB, preserve JSON/non-JSON403 denial checks and refuse a retry even after view permission returns.

The historical helper accepts only the exact reviewed successor SHA and reverses the two once-occurring AB/C opt-in lines to the **original** `8734ac32…` afterHash before running the unchanged Begin inverse to the **original** `8a35f8bd…` beforeHash. Both old hashes and all original rule offsets remain. Unknown source, unsafe Begin, permission escalation and PROCESS-scope expansion still fail closed; real old handler rejection still proves zero D1/R2 changes. This is a test-only projection; production handlers are unchanged.

Local follow-up results: 287 targeted tests, all 13 existing departure browser cases, four strengthened final unknown-Save cases, four cold-start observer cases, four-module old-server rejection and IPQC-C historical bounded-read/permission groups (9/8) pass; lint and TypeScript pass. Overlapping reruns are recorded separately rather than added to a unique test count. [Exact source hashes and evidence](contract-follow-up.json).

The dedicated #80 workflow now includes old-server rejection plus existing cold-start/departure suites so this gap is visible on its own dependency base. Local safety's branch filters, full checks and timeouts are unchanged. The complete Windows Local safety gate remains for the final combined integration candidate; no merge or deployment is implied.

## Remaining gates

- Exact-final-head remote Actions are a separate gate until GitHub confirms them; a local build or a pushed commit is not CI PASS.
- NOT_RUN: Site/live HTTPS, true business data, native OS IME, physical iPhone/Windows UI, cross-machine employees and long-duration/real-scale acceptance.
- No merge, Ready transition, deployment, true-data backup/restore, data cleanup or platform reconnection was performed.
