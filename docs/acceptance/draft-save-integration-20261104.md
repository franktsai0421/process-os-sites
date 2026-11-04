# 草稿流程統一與加速：隔離整合候選

## Pinned sources and isolation

- Base main: `85fa4a36442b3b72323eb4a6eeb105b867c4856a`.
- #74 FQC: `9392d30d71fb81bbdee2eca7378ebe6cc6f8553c` (complete Local safety and matrix preview passed).
- #75 IPQC C: `936041003940b46b945fe90bd055e993198c8c47`, including bounded fixture record-oracle reads and failure diagnostics after CI41824842814 transport failure. Integration retains isolated desktop verification, all90 timed lifecycle samples and15 additional navigation checks.
- #76 IQC: `fec2f69140997e6b76f7280044e3e920a888ba3c`, including edit/Save permission-test correction and compiled delivery silent-departure regression. CI41833531214 exposed an obsolete expected Stay dialog; the replacement verifies actual IQC → AB → IQC navigation, zero departure writes, unchanged durable state/markers and original receipt-only recovery. Observer contracts14/14 PASS locally.
- Isolated worktree `/workspace/process-os-integration`, branch `integration/draft-save-20261104`. Local merge commits preserve source ancestry. No PR/main merge, publication, live business-data mutation, schema change, or cleanup.
- Canvas: `004b2ff350fa2413f2c95cbadaa602c65a772a7c` from `feat/process-canvas-atomic-save`, fetched and composed after the three-module candidate `83e7b6196da8c1b88954d7e111ab9d6f88d59c6b`. No textual overlap with that candidate; shared-client/navigation semantics still require the regressions below.

## Order and semantic conflicts

Local composition order: main → #74 → #75 → #76 → #76 permission follow-up → canvas004b2ff. All candidates share the base; this order makes the FQC departure foundation explicit rather than asserting a hard Git dependency between module adapters.

Shared client unload must retain FQC checked `canUnloadWithoutPrompt`, IPQC C `browseWithoutSettlement`, and IQC `unloadAllowed`. Navigation-only exclusions must never change raw account/mutation unknown obligations, replay guards or unrelated modules. Keep each module's proven rejection recognition scoped to its endpoint/action/serialized command/request ID and original response.

Resolve shared navigation and test conflicts by retaining all module branches and fixtures. The FQC/IQC navigation coordinator implementations match; retain one opt-in `autoAbandon` coordinator. Preserve IQC `allowUnload` and FQC coverage checks. Canvas has an explicit checked opt-in in the follow-up below; tooling is not opted in.

Use `20261104-draft-integration1` for changed shared-client, delivery-navigation, bootstrap, IQC and IPQC C assets. Match lifecycle dynamic import and modulepreload exactly. Keep FQC's already delivered unchanged asset tags and all unrelated modules' versions. Version tests remain exact.

Preserve both FQC and IQC specifications/change notes; IPQC C evidence remains linked. Shared workflow permission mapping must include FQC and IQC separately; IPQC C retains its dedicated route. Edit grants Save, Submit remains separate, existing explicitly allowed Save-only compatibility remains where implemented.

## Integration fixes and data preservation

- Reproduce legacy pre-workflow IPQC C first form completion and IQC first Save failures. Stage without dereferencing absent workflow; after the first lazy Begin bind the newly created generation while retaining original local values and field guards. A replaced established generation still refuses saving.
- IQC status distinguishes retained shared working changes from an already saved snapshot, even with no current page-local edits.
- Validate IPQC C localChanges/change/patch/guard shapes before dereferencing or reading state. Malformed requests return a definitive422 with request ID and no DB/R2 changes.
- IPQC C batch field-conflict recognition requires an exact original POST proof and nested guard-path match; genuine unknown outcomes retain markers. Conflict recovery must require explicit user intent and preserve peer saved state.

No migration is needed merely to compose these source changes. Preserve existing working, saved snapshots, pending cases, formal versions, history, identities/codes, tombstones and recovery receipts. Existing working is a starting baseline, not a cleanup target. Photos uploaded before a rejected/abandoned Save may be unreferenced; no automatic deletion is authorized by this integration.

Before any later legacy-data cleanup, inventory counts, generation/revision and hashes, unresolved receipts and referenced media, take an authorized consistent backup, compare in an isolated copy and define a reversible scope-specific transition. No live counts were inspected here.

## Remaining integration/release gates

1. Canvas is now source-integrated with checked silent abandonment for stage/line/top-level navigation and native departure. Tooling's generic atomic-save/numbering/unknown-Begin interface remains a separate follow-up.
2. Unknown Begin is not automatically covered by the existing Apply/Save receipt mechanism. Specify operation identity, authoritative readback, safe departure and non-replay before claiming generic support.
3. Preserve source PR fixes or carry this integration branch forward without replacing module implementations wholesale. Any newer upstream head needs a delta review.
4. This combined candidate needs exact-head full Windows CI, independent review, and coordinated test-Site browser acceptance before release. Individual PR passes and local integration tests do not substitute for those gates. No merge or deployment in this task.

## Verification

Local integration evidence: cross-module server/permission/restore/navigation batch134 PASS; shared departure210 PASS; cache/receipt72 PASS; preload15 PASS; FQC browser10 PASS; IQC legacy/atomic/readback62 PASS; scoped C rejection/multi-client13 PASS and bounded-recovery/FQC regression62 PASS. C actual API/local Save/permission fixtures and Chromium1440/390 pass including legacy first Save, malformed requests, photo upload, confirmed peer conflict cancellation/discard/fresh Save and delivery-change rejection. Full lint, TypeScript and source-history boundary checks pass; exact-head build result is recorded in the task handoff. Counts describe separate suites and must not be summed as unique cases. All local checks use synthetic/nonpersistent fixtures. Physical phone/IME, cross-machine employee sessions and hosted Site acceptance remain NOT_RUN.

## Canvas follow-up integration

Canvas Save retains its existing edit plus explicit Save authority, pending locks, CAS and durable transport; this follow-up does not broaden permissions. Stage/line/top-level navigation must abandon only unsent input through a checked lease, leave unknown state observable, preserve original operation/channel/generation/lineage markers and continue receipt-only resolution. No server working reset, data conversion, history removal or R2 cleanup. Native unload must fail closed on cleanup/quota/identity/context failure; an unknown operation is never reclassified as clean.

Initial integrated canvas contracts:118 PASS,3 SKIP for missing exact historical commit `c82a395244ec26d1787f78bd12039d3b471f223f`; no substituted baseline or relative-performance claim. Final departure, cross-module and compiled-browser results are reported in the handoff.

Final four-module directional regression:385 PASS,3 explicit historical-baseline SKIP (388 total); no functional failure. Includes original operation recovery, quota/identity/tamper/late-input fences, stage/line guards, multi-client isolation and FQC/IQC/IPQC C contracts. New silent-discard tests also prove pagehide persists cleaned unsent state and BFCache cannot restore abandoned input; sent snapshots and receipt markers remain intact. Exact compiled desktop/navigation and build results are reported in the task handoff.

## Latest upstream verification

The latest #75 and #76 test fixes are integrated without replacing product code or reducing lifecycle assertions. Old integration head6e7cb71 CI41837666208 failed the explicit-input-abandonment step; investigation and exact latest-head complete CI remain required. Prior head results are not attributed to this updated candidate.

## Compiled abandonment and delivery follow-up

On integrated product head `cf51f5d`, the old step18 canvas cases still selected the removed per-canvas Sync control and expected an abandonment dialog. They now use the normal visible `[data-av3="save"]` control to establish saved data, then verify silent departure. AB and account-form dialog assertions remain unchanged. Canvas cases retain exact persisted-state equality, zero additional POSTs, re-entry checks, failed-destination checks and gesture cleanup, and additionally reject native prompts. The fullscreen-only Save button is intentionally not used by these normal-view tests.

The compiled step18 command passed 13/13 (390px/1280px, Chinese/Vietnamese), with no CI environment spoofing. The compiled sites-delivery browser also passed: unsent IQC form and applied input abandon without prompts; a server-committed Save with its ACK dropped survives navigation and reload; recovery performs two original-receipt GETs and exactly one Save POST, with no blind retry. Unrelated persisted state remains unchanged. All data, actors and storage are isolated synthetic fixtures; this is not hosted-Site acceptance.

## Process Flow Canvas command contract

CI41840465372 step21 reached an obsolete exact source assertion for the Canvas Apply command. The regression now executes the actual uniquely located `ownedClient.prepare` expression for both legacy Sync and atomic Save, checking generation, action, original patches/guards, current-canvas source scope, and the Save-only `save-canvas-v1` module action. No product code or mutation/receipt assertions changed. The complete Process Flow isolated script passes114 groups; the four Canvas atomic Save suites pass18 tests. These synthetic checks do not claim completion of the remaining full CI run.

## Remaining step21 atomic-Save fixture alignment

The remaining step21 commands are being executed individually against isolated fixtures, continuing after independent failures. The first 64 commands exposed four stale fixtures (authoring unknown recovery, Save validation UI, Submit feedback, canvas-fit origin), addressed by separate coordinated test changes. Command048's other 218 tests pass; its PowerShell exit-propagation test cannot execute locally because Linux lacks `powershell.exe`. That Windows-specific check remains unchanged for CI.

Save validation and Submit feedback now execute the real `applyProcessCanvasSave` transition helper for `save-canvas-v1` commands, with the fixture's actual current-canvas context. Validation UI: 30 groups PASS. Submit feedback: 60 groups PASS. The migrated repeated-Save case verifies one atomic canvas command, one persisted saved snapshot and no confirmation; the submission case retains refusal while local input is dirty or Save is in flight, then checks explicit Submit against the exact saved snapshot after fresh inspection. Existing unknown receipts, identity/revision changes, late results, recovery and permission guards remain covered. No product behavior or live data changed in these fixture fixes.

The complete remainder comprises 128 commands. After the coordinated fixture repairs, 127 portable commands pass; command048 additionally has 218 passing tests but its Windows PowerShell exit-propagation check remains unavailable locally and must pass remote CI. These are command counts, not a count of unique tests.

Two dependent performance checks also required exact departure-inverse updates. The historical source `85fa4a36442b3b72323eb4a6eeb105b867c4856a` plus its original inverses still reconstructs historical baseline SHA256 `da8e3c709b0750c92305a59cdd37e9cce06684bfe3a1a7f3458520190b580a5c` (verified). The integrated candidate includes atomic Save and recovery/unload helpers outside those historical spans, so its updated control is explicitly a **current-source differential**, SHA256 `2ad12e4a6fc20395bc9f043be2615a1dfebc0342dfdcc1e583804ba4395e5722`. Historical provenance is retained in the fixture metadata; no unchanged historical whole-program comparison is claimed. The candidate remains untouched. All 76 EOL and changed/missing/duplicate-anchor checks pass, and all 15 panel UI/model/request equivalence cases pass.

## IPQC-C reviewed validation inverse

CI41845241676 step22 exposed the old route byte pin after integration added nested `localChanges` shape validation and the definitive 422 request ID. Review against candidate `ec6561a` confirmed that only this validation span changed; all remaining route bytes and the workflow adapter stayed identical. The inverse now removes that exact reviewed span and uses its adjusted byte offsets. The original route baseline SHA-256 remains `8e02233a3928309f28d478814610e4862fc8b331f20e273292f4f87f24c8eb07`; the reconstructed historical bytes still match exactly. Negative checks reject appended unreviewed source in both route and adapter and reject relaxing the 256-change limit. All four step22 scripts pass (9/8/7/5 groups), as does the local atomic Save/malformed-request suite. No product changes were made for this correction.

## Cold AB startup observability

Run `41849787228` on `ede958e` failed only the first AB390/Chinese abandonment case: the initial Begin selector timed out after30s (case total80.10s). The second AB1280 case passed in42.89s; the remaining12 cases overall and all later CI steps passed. A single local rerun of the unchanged compiled product passed13/13 in46.62s. These observations do not establish the startup root cause.

The two AB cases now explicitly wait for the exact data/AB destination-ready state before Begin, sharing the original30s action budget between readiness and click. Navigation remains cold, with no prefetch, warmup, automatic retry or timeout increase. On failure a bounded diagnostic reports navigation/action phase and elapsed time, URL pathname only, HTTP status, failed/pending request paths, error class and boot/navigation/Begin state. No query, header, credential or body is recorded. Snapshot collection is capped at1s and preserves the original thrown error.

Four synthetic contracts pass, including deadline sharing, no retry, sanitization and an unresponsive diagnostic snapshot. Both compiled AB viewport/language cases pass with the helper; other browser cases were not repeated after this test-only change. This improves readiness gating and failure evidence, not a claim that the unconfirmed cold-start failure is fixed.

## Independent-review blocking regressions

IQC originally accepted Submit with a staged local snapshot and could send the older saved ID. Actual post-handler regressions reproduced pre-confirm, legacy Begin and late-confirmation cases. Submit now rejects local input before any Begin/confirmation and again before command dispatch; the button is disabled while local input exists. No auto-Save, input reset or permission change. Handler/terminal/atomic batch46 PASS; real Chromium390/1280 tests use actual HTTP handlers to check forced Submit, open form retention, explicit Save then the new saved ID/case snapshot, photos, new tooling, filter persistence and reload. Both browser cases PASS and run in full CI.

Canvas return-to-saved content was reproduced in eight controller/HTTP combinations (inline/records, full/compact, direct/lost ACK): the backend legally reused the prior saved ID while the changed-working receipt had unchanged=false. Removed only the invalid assumption that a changed receipt must allocate a new saved ID. Original receipt identity, owner/session and durable-record gates remain; equal-revision authoritative saved ID/content mismatches still retain the unresolved record. Atomic/kernel/stack/peer-readback30 PASS; authority/storage/recovery233 PASS. Recovery uses the original receipt without another Save POST, including newer peer readback.

IPQC C mixed local create/delete order initially failed without peers: a new item carried a local code while the backend assigned a formal code. Map only server-owned codes of rows created earlier in this batch alongside their IDs; existing rows, user fields and full dependency sets remain exact guards. Real UI testing additionally found the existing optional notApplicableReason field was supplied locally but omitted by backend create; retain it when explicitly provided, keeping legacy absent-field shape unchanged. Actual API tests pass both operation orders, replay, optional-field retention and real/tampered-field conflicts. Real Chromium1440/390 with actual HTTP handlers passes both orders with zero editing writes and one Save, plus true peer conflict409 with unchanged persisted data and intact local edits/guards. Exact-source bounded-read9 and permissions8 groups pass; original historical inverse hashes remain unchanged. Full latest-head CI remains required for these product changes; earlier3c7216b evidence is not attributed to this follow-up. No migration, live writes, main merge or deployment.
