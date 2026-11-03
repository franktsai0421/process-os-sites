# Simple draft departure — scoped follow-up to FQC PR #65

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
