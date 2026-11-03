# Simple draft departure — scoped follow-up to FQC PR #65

## Independent PR #66 follow-up, 2026-11-03

Review started from GitHub head `b42294f0d884992be6d72f841450e439ab8d8f82` in a new standalone Linux checkout. The previous writer stopped modifying #66. GitHub reports this PR as draft with no submitted reviews; prerequisite #65 remains open and has newer changes. Do not resolve that stack by overwriting either branch. After #65 merges, integrate its final main state and rerun the affected checks before requesting final review/merge. A green historical run is not verification of that future integration.

Independent review reproduced a canvas handoff defect: apply a form locally without Sync, choose abandonment, then fail the target preparation. The local journal was correctly discarded but the retained source card still displayed the discarded name and retained the old card handler. The controller now refreshes the source canvas after checked local cleanup, before handing navigation over. This does not restore discarded input, save, submit an inverse, or change shared data. A compiled-browser regression checks the displayed card, reopening the form, empty local journal, unchanged server content and zero extra POSTs at 390px/Vietnamese and 1280px/Traditional Chinese. The first probe incorrectly assumed the public `navigate` helper returned a Promise; after fixing that test setup, the content mismatch was reproduced and then fixed.

New verification in the isolated Linux checkout:

- PASS: locked dependency installation and normal collaboration-hook setup in this standalone checkout; no previous hook was replaced. This is dependency/bootstrap setup only, not employee data-package acceptance.
- PASS: 303 focused module-binding, controller, canvas, navigation, cache-tag and source-EOL tests. Added 18 local-plus-shared abandonment cases across nine actual adapter configurations, including revoked edit access, and 36 late identity/epoch/unknown/reload cases. Existing canvas storage-failure coverage now also checks the visible retained-input count.
- PASS: 15 historical authoring panel/performance equivalence cases, typed lint, source boundaries and build. The exact SHA-pinned departure inverse was updated only for the new refresh statement; the original whole-baseline hash and performance assertions remain intact.
- PASS before this fix: the five existing compiled-browser departure tests at the reviewed head. The new failure case passed after the fix; final committed-source browser/CI results are recorded in the PR.
- PENDING: latest-head full GitHub CI, independent re-review of this follow-up fix, integration after #65 merges, and Frank's final review. No merge, deployment, real account, live business data or schema change.

Coverage limits remain explicit: the nine extracted real adapter configurations are master-data, BOM, FQC, IQC, IPQC-AB, IPQC-C, routine equipment, tooling and routine FQC. They are binding tests with synthetic transport, not end-to-end browser acceptance of every page/subtab. Compiled native coverage here is AB/C departure, process authoring and user forms. Unknown-result paths outside the inherited FQC contract, Feedback, all-module photo/new-tooling workflows, real IME, physical devices, and true cross-computer acceptance remain NOT_RUN or outside #66's implemented scope. #68 owns its separate unknown-result expansion; none of its unreviewed code was imported here.

The user asks to abandon unsent changes and browse other pages without retaining a copy or offering restoration. Abandonment does not undo acknowledged shared changes or cancel an unknown request. This follow-up is stacked on `fix/fqc-authority-body-recovery-20261103`; it must not be treated as independent main-ready code until that prerequisite is reviewed/merged and this branch is rebased/rechecked.

## Implemented boundary

The common VersionDraftUI adapter now offers explicit local-input abandonment for eligible dirty pages even when the same scope has acknowledged but unsaved shared changes. It invokes the module's existing local cleanup and issues a separate navigation lease; it neither calls Save nor clears shared attribution/receipts. Controls remain frozen until the navigation handoff ends. The old whole-shared discard remains forbidden. Unknown, queued, failed, changed-identity and unsupported states do not become clean.

Process authoring has a separate local-only abandonment path: it clears the unsent canvas/forms but never invokes `ownedLedger.discard`, the existing operation that can submit a guarded server inverse. Persisting the cleared canvas must succeed; storage failure restores the live journal and refuses departure. This is deletion of the current unsent draft, not a new archive/restore feature. Existing history/unknown evidence is not bulk-deleted.

Routine FQC can cancel its owned open dialog in the same choice. Users gains an adapter for unsent account forms; no account/password mutation or browser password copy is made. The FQC unknown lane from PR #65 remains distinct and retains its original operation marker and mutation lock.

| Page / adapter | Ordinary unsent / acknowledged-shared departure | Unknown result |
| --- | --- | --- |
| AB, C, lines, process master | Shared adapter; local form/name cleanup; no server save/rollback | Still blocked: original generic transport and scope proofs must be extended separately |
| FQC | Shared adapter plus original matrix cleanup | PR #65 supports intact FQC Apply receipt marker only; no automatic retry/404 settlement |
| IQC | Existing checked local editor/batch cleanup | Still blocked, including pending error-name batch evidence |
| IPQC-AB, IPQC-C | Existing owned local buffers/dialog cleanup | Still blocked: module/scope and editor identities have separate recovery states |
| BOM | Existing verified own local-recovery discard; shared BOM unchanged | Still blocked; `discardOwnRecovery` explicitly refuses unknown |
| Tooling, routine equipment | Existing local dialog/photo cleanup | Still blocked, including Begin-recovery states |
| Routine FQC reports/inspection | Local document buffers and owned dialog cancellation | Still blocked: `s.retry` and its custom receipt mechanism |
| Process editor/canvas | New local-only path, no ledger inverse | Still blocked: original canvas pending batch/inverse receipt states lack a verified navigation-only contract here |
| Users | New unsent account-form cleanup | Still blocked: `writeUncertain` is not operation-bound receipt proof |
| Feedback | Separate opt-in host; unchanged | Not implemented/tested by this follow-up |

**The all-pages request is not complete.** Unsupported unknown states above still block navigation; bypassing them or clearing their markers is not accepted. No claim is made that every draft page has been browser-verified. The exact unresolved work is to provide independently reviewed navigation-only evidence for each custom unknown transport while retaining its mutation barrier, then test late completion, return, reload and actor transitions. No storage timeout, 404 or matching visible value is proof of noncommit.

## Verification and evidence

All data, accounts and passwords are synthetic. Compiled Miniflare D1/R2 is nonpersistent; browser routes permit only each fixture's localhost origin; no live Site or business data was accessed.

- PASS 338 unit/controller/router/actual-module-binding cases, including common local+shared abandonment, unknown refusal, actual authoring ledger path, canvas storage failure and prior protections, including new input/failure arriving during target preparation. Author follow-up found and reproduced three failing process-editor handoff cases: late form input, late canvas input and an expired canvas runtime lease. The held lease now rechecks local input, ledger state and canvas ownership before permitting departure; these three regressions pass after the fix.
- PASS 5 compiled Chromium cases: four AB/C and process cases at 390/1280px in zh/vi. They verify departure, return, abandoned input absence, shared content equality and zero added mutation requests. The process case explicitly synchronizes the canvas first, proving the later abandonment does not undo acknowledged content. The fifth verifies user-form abandonment has zero account writes and no password persistence; its asynchronous close/removal race was fixed with synchronous DOM removal.
- PASS 11 actual FQC unknown departure tests on the expanded branch; original late-commit/404/foreign-marker/actor protections remain.
- Full lint/build passed for the implementation; final tests and CI are reported in the PR. Builds before commit are not exact-commit release artifacts. Physical iPhone/IME, all-page native acceptance, independent review and production deployment are NOT_RUN/PENDING.
- Initial native fixture failures were test setup errors: compiled `state` is lexical rather than `window.state`, and applying a process form does not replace the separate explicit canvas Sync action. Both were corrected; no application guard was relaxed.

Environment: build source validation refused a dependency symlink; it was removed and exact locked dependencies installed into this checkout. The install's collaboration-hook postinstall then refused this linked worktree (`COLLABORATION_SETUP_REFUSED stage=repository`), without replacing hooks. The common repository's original guarded checkout is retained for any remote push; its installed pre-push hook is unchanged. No push from the unguarded linked-worktree path is used. This is not a successful clean-clone bootstrap acceptance. Initial npm default-cache writes were unavailable; the supported writable `/tmp` cache was used without changing package integrity or versions.

The Local safety workflow adds this stacked target branch and the new compiled native regression; no check is removed or made optional. Merge/deployment, schema changes, live unknown settlement and historical-data deletion are outside this task. Existing v37 tabs do not acquire these changes until an approved release/transition.

Historical performance-fixture follow-up: the source-EOL check also detected that the new process departure code changed its full historical panel baseline hash. Six exact SHA-pinned departure inverse spans now reconstruct that original baseline; the actual candidate stays complete. Original whole-baseline hash and performance assertions remain. PASS 50 EOL/source-drift checks (including changed/missing/duplicate departure spans), 42 identity-equivalence cases, 15 panel-equivalence/performance cases and 24 authoring-controller tests. These performance fixtures do not assert old/new departure equivalence; the deliberately new behavior is covered by the controller/native tests above.
