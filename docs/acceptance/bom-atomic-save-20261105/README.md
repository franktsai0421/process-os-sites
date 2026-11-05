# BOM local edits and atomic Save — dependent Draft candidate

Depends on unmerged Draft PR #77. Fixed base: `0af6d57e912e5615250959c9e76210fecd55d96b` (`integration/draft-save-20261104`); main at task start: `85fa4a36442b3b72323eb4a6eeb105b867c4856a`. This branch contains only the BOM increment and its narrow shared opt-ins. It does not import PR #78 or IPQC A/B work. No merge, deployment, hosted connection, business data, real account, schema/migration or cleanup action.

## Behavior and preservation

- Finish, cancel, search and comparison operate on the page's local editor. `save-local-v1` sends the confirmed ordered manual/import operations in one Save. Unapplied comparison still blocks Save. Submit checks local input again after its asynchronous confirmation; it never submits an older saved snapshot on behalf of unsaved input.
- The adapter stages each original operation only in request memory, using the existing manual editable-field/L2/guard checks and Digiwin import privilege, semantic digest, user decisions, incremental merge and legacy omitted-occurrence rules. One route CAS commits working, saved and the original receipt together. Any rejection preserves shared state, including rejection after an earlier staged operation.
- Disjoint stale manual fields merge when their original guards still match. Same-field, removed occurrence, import basis and generation conflicts refuse. Confirmed import decisions are never recalculated against a new basis. Current working, saved, pending cases, approved versions, historical saves, source metadata, IDs and process references remain.
- BOM edit grants Save in the effective server permission projection; submit, approve, withdraw and exchange remain separate. Session revocation is rechecked after immutable encoding before the new atomic Save CAS. Failed CAS may leave an unreferenced immutable object, as in the existing storage model; nothing is deleted to fake rollback.
- Checked automatic departure uses the existing navigation coordinator. Unknown Save retains both the BOM helper journal and primary receipt-only marker; identified Begin uses the existing Begin journal. Departure retains sent command identity in memory, abandons only the visible unsent buffer, and returning reads the original receipt. A missing receipt remains unknown. Legacy unidentified command bytes are preserved and never classified as clean; they cannot manufacture a departure anchor. Historic local recovery records remain explicit, never automatically restored or deleted.
- No generic transport replacement. Shared-file increments: `versioned-shared-workflow.ts` (BOM Save permission, identified Begin admission and pre-CAS session check); `shared-draft-client.js` (BOM-only durable Begin/unload, selected Save details and audited failures, cached observation only during input); `index.html` asset versions; `local-safety.yml` dependency-base trigger and BOM checks; shared departure binding fixture. Integrate these semantically with #78/A/B; do not overwrite their files.

## Change → risk → evidence

| Change/risk | Executed evidence | Scope/limits |
| --- | --- | --- |
| Atomic ordered batch; no partial Apply | `bom-atomic-save.test.cjs` actual handler, SQLite/R2 inline and records, deliberate CAS retry, ordered manual/import/manual, exact replay, receipt lookup | Synthetic actors/data only |
| Collaboration and privileges | Actual concurrent handler saves, disjoint fields, same-cell and late-operation rejection, import privilege, edit-only Save, pending lock, revocation before and after encoding, stale generation | No real account modification |
| Saved/review/formal/history/reference retention | Save → submit → withdraw → resubmit → other-actor approve, old saved/case/version and process-reference assertions | Existing route/kernel; no consumer redesign |
| Local journaling/unknown/legacy | BOM transport, authority, RAM limits, helper lineage, cleanup failure, damaged journal, legacy identity and actual departure closure tests | VM fixture ports; crash fixture intentionally retains journals |
| Real UI and transport | `bom-atomic-browser.test.mjs`, compiled Worker + Chromium, 1280 Chinese and 390 Vietnamese, Finish/cancel/filter, Excel partial adoption, peer edits, double click, actual SPA and native departure, unknown Begin/Save lost ACK + 404 + original receipt | Synthetic loopback; not hosted/phone/IME |
| Shared scope regression | Shared Begin/receipt/navigation regressions, all-module departure bindings, resource build and submission/pagehide tests | Other module product code unchanged |

## Execution receipts

- `6012f1b03259ce69096e874d13fbebf47df23f6b`: 223 BOM handler/transport/UI groups passed; 147 shared departure bindings and 146 shared Begin/receipt/navigation cases passed. Lint and TypeScript passed. Production build passed its output/auth-client boundary. Later BOM-only lifecycle changes are separately rechecked below.
- `15e64adee3be313e5fabce8e4e3cff3d91bb17fc`: production build passed; compiled browser passed six scenario groups (both widths plus Begin/Save × SPA/native). The executed browser source included subsequent test-only selector corrections (wait for the visible search field and open the narrow-screen menu) and actual coordinator SPA return. No product source was substituted. Page errors and native/custom dialogs were empty.
- Final candidate results and exact-head CI are reported in the Draft PR and parent handoff after final checks. Earlier candidate PASS does not assert a later head passed. CI runs the final exact checked-out commit and compiled browser separately.
- Domain/incremental/no-op import/legacy workflow/navigation and wire-limit runners are targeted compatibility checks. Legacy `test-bom-consumers.mjs` requires removed bundled `public/process/data/imported-data.js`; legacy `test-bom-excel.cjs` defaults to old asset locations and also requires that company baseline. These historical runners are BLOCKED by missing source-only data, not waived or supplied with private data. New actual-browser Excel and actual handler/domain checks use synthetic records.

## Request and performance scope

Normal initialized UI Save: **one workflow POST plus one authoritative full GET**, regardless of confirmed groups. Finish/Apply-to-editor sends no workflow write. Lost ACK recovery sends no new POST; original receipt GET and authoritative readback remain required. Browser scripts may separately read metadata; no whole-site request/latency claim.

[Paired benchmark](benchmark.json): five fresh actual-handler pairs, identical three-row synthetic BOM and ten confirmed edits, records storage. The previous sequential algorithm used 11 workflow POSTs/CAS; atomic Save used one. Median handler wall time was 180.451 → 12.671 ms. This excludes browser, network and full GET time; it is not a test-Site or real-data speed claim. The adapter used for this measurement is unchanged by later departure/session checks; the benchmark is rerun for the final candidate where reported.

## PR79 CI cache-contract follow-up

Run [41961195152](https://github.com/franktsai0421/process-os-sites/actions/runs/41961195152), candidate `4de120ebe625eef6571862484ffc150af4a8c69f`, passed steps1–22 including the compiled BOM browser; step23 failed only the exact resource assertion in `shared-draft-receipt-recovery.test.mjs`. The index correctly references `shared-draft-client.js?v=20261105-bom-atomic1`, while that test still pinned PR77's `20261104-begin-receipt1`. Reviewing the index and actual executable delta confirms the cache bump is required for BOM durable Begin and atomic Save; reverting it would serve an old client. A second strict map in `navigation-adapters.test.mjs` also retained both old BOM/client versions and was reproduced locally before correction.

This follow-up changes only those three expected current-resource tokens and this evidence note. Exact single-reference `deepStrictEqual`, every other resource pin, historical Begin/receipt/deadline behavior, production files and CI gates remain unchanged. The earlier passing CI steps are valid reused evidence for unchanged product code. Local follow-up: the failed terminal/receipt/restore group plus navigation/resource checks passed117 cases, historical Begin contracts passed85, and the broader delivery run passed218 cases. Its unchanged `ci-integrated-exit.test.mjs` is BLOCKED locally because this Linux environment has no `powershell.exe`; the full native exit-propagation assertions remain enabled in Windows CI. No assertion or CI command was skipped/relaxed in source. Targeted reruns and fresh exact-head CI are reported in PR79; the failed original run remains failure, never relabeled success.

## Remaining gates

Physical phone, native Chinese/Vietnamese IME, cross-machine employee sessions, hosted/live HTTPS and real business-data latency: **NOT_RUN**. A 390px Chromium viewport is simulated narrow-screen coverage. No deployment or real-data acceptance is claimed. Keep this PR Draft and dependent on #77; reconcile shared increments with #78 and IPQC A/B before an authorized integration.
