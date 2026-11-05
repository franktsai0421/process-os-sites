# Third batch — local source candidate

Only isolated source integration and synthetic verification are authorized. No upload, PR, main merge, deployment, real data/migration, routine-fqc or #86 change.

Base: merged PR85 `f0ab66fc27b7c9615c42a28fcc40a4864fb3a047` (parents PR77 `2b58eaeabeaf0744e9658c47afb752cb5a5d97ca` and batch2 `4a58c51`). Fixed heads: #81 `4b5cdfbc0838556ecc39125e92edb1611f010dcd`; #82 `4f810663174fe9c0a2e275c5f17dec3d5080522b`; #83 `40cb76a499b582d760d670718665fd87b658e2d0`; #84 `933277781a9549e2191dfb0d1aa91d0300e8c96a`. All retained through explicit merge ancestry.

## Change → risk → evidence

| Area | Retained boundary | Required evidence |
|---|---|---|
| Equipment #81 | exact route opt-in; one atomic Save; separate create/delete/Submit | atomic/storage/transport + native and compiled browser |
| IPQC A/B #82 | exact module=1; ordered sent snapshot, confirmed-but-read-denied feedback, current actor/epoch/delivery | local/browser/caller and full compiled acceptance/gaps; genuine poll conflict |
| PROCESS #83 | prefix-only ACK/receipt settlement, Later/replacement guards, missing RAM pin never inferred | bridge/save/browser, ownership and linked approval |
| Transfer #84 | FQC explicit whole shared working Save; IQC/C/AB guarded Apply and target manual Save | unit/four-module and compiled transfer with #82, Begin GET503/sent unknown/receipt404/reload, private WeakMap proof |
| Shared union | #85 ACK POST1+GET1/CAS1; lost ACK POST1+receipt GET1+authority GET1, no resend | AB/C bridge; exact byte/history/cache contracts and permission regressions |

## Semantic merge record

- `lib/versioned-shared-workflow.ts`: preserve the exact scope/key permission union for IQC, BOM, tooling, AB/C, PROCESS, equipment; keep IPQC A/B limited permissions and requiresCreate. Begin scope union retains all opt-ins; post-storage session guard is the union of Begin, BOM atomic Save and equipment. No create/delete/review permission expansion.
- `shared-draft-client.js`: union exact route admission; retain AB/C scope-bearing Begin marker keys alongside equipment/IPQC A/B. Compose equipment terminal ACK with #85 master readback; PROCESS remains on its original bounded terminal path to avoid duplicate readback. Keep #84 original Error/attempt/identity/journal WeakMap proof, with scope-bearing keys.
- `index.html`: one precise shared-client cache pin `20261105-batch3-integration1`; preserve all module-specific latest source tags.
- `workflow-begin-source-contract.cjs`: preserve original Begin, BOM and AB hashes/offsets, add strict complete-source batch3 projection (six exact spans to PR85) and fixed equipment/PROCESS predecessor projections. Old test source-specific checks use their immutable pinned inputs; current union has separate mutation rejection tests. No generalized matcher or normalized source admission.
- `navigation-adapters`, `receipt-recovery`, `multiuser-module-departure-bindings`, `shared-draft-begin-v1`: retain union of every source scenario and scoped RAM/unknown behavior; explicit cache expectations include all modified assets.
- `.github/workflows/local-safety.yml`: retain existing commands, ordering/dependencies and Windows exit propagation; add current-union source test and full compiled A/B acceptance/gaps. PROCESS workflow retained. The inherited AB/C browser fixture now waits for navigation readiness before choosing the line scope, retaining its original C-scope assertion and all lifecycle checks. A/B full compiled acceptance uses the configured Chromium executable or the standard Playwright installation so Linux-only executable paths do not break the preserved Windows gate.
- `master-shared-client.js`, `app.js`, master/process equipment and `routine-equipment.js`: retain fixed source prefix settlement, unsent input and target Save semantics. No shared code from #86.

## Evidence boundary

First pre-final focused run: 378 PASS, zero FAIL. This is not exact-final-commit evidence; final run ledger and recoverable bundle will be delivered outside the repo. Source CI remains source-only evidence. The delivered external ledger records exact tested commits, executed commands, final outcomes and any byte-identical reused evidence; this source note does not substitute for that ledger. Full-tree sensitive scanning retains two unchanged synthetic negative-fixture findings; changed-source scanning is clean.

Windows native exit execution is BLOCKED on Linux; remote CI, live/test Site, real company BOM data/assets, physical phones/native OS IME/cross-machine and real backups are NOT_RUN or BLOCKED. Four catalog HOLD_OWNER_FAULT_POLICY_DECISION decisions remain. Missing private BOM baseline acceptance remains. No permission/protection/credential/connector changes. Independent final source review and separately authorized exact-head CI are subsequent gates.

## PR87 Windows compiled A/B artifact-path follow-up

Windows Local safety run `42056110699`, job `127344824646`, reports failure in step 22 (full compiled IPQC A/B acceptance). At the initial investigation the job was still running and its complete log returned BlobNotFound. Later readback confirmed Windows ENOENT from the diagnostic path; that masked the original exception.

The inherited full-browser fixture has four hard-coded `/tmp` paths for progress/error/screenshot output. At that checkpoint the original two-file CI command passed 4/4 on Linux; injecting absence of only those fixed Unix artifact paths reproduces ENOENT (2 failed full-browser cases, 2 gap cases still pass). The failure diagnostic write also masks the initial failure when the directory is absent. This is a diagnostic-only local fault reproduction, not a native Windows run or proof that the diagnostic path was the only underlying failure.

The fixture now allocates a fresh directory through `os.tmpdir()` + `mkdtempSync` and uses `path.join` for every artifact. Failure diagnostic-write errors are reported separately and the original test error is still thrown. The same command with a nondefault temporary base and the same absent-fixed-root fault passes 4/4; all original assertion call expressions, case names, timeouts, data/permission/receipt checks and the workflow command are unchanged. No app/lib/public/scripts/schema or migration change. Original run outcome and new exact-head Windows CI remain separate evidence; this fix does not declare full CI passed.

## Isolated Windows step22 diagnosis

The corrected `4a9f2ec` native Windows run `42059903955`, job `127358464331`, still fails step22. Its first diagnostic error was not sufficient to establish the underlying browser failure. A Linux disposable `core.autocrlf=true` checkout with its own unchanged-lock offline install/build passes the exact command 4/4, so checkout newline representation alone does not reproduce the native failure.

A separate, PR87-only Windows diagnostic initially checked out the PR head while GITHUB_SHA identified the GitHub merge commit; the unchanged source guard correctly refused SOURCE_CI_COMMIT_MISMATCH before build/browser execution. It now checks out the GitHub PR merge commit, matching GITHUB_SHA and PROCESS_PROGRAM_COMMIT, uses the existing source guard/build and the original two-file step22 command with unchanged test timeouts/assertions. Its shorter terminal job makes the real native failure log available without disabling or replacing any full Local safety step. Read-only contents permission, pinned actions, nonpersistent synthetic D1/R2 and outbound-denial fixture boundaries remain. No diagnostic success can substitute for the full workflow or independent browser acceptance.

## PR87 late permission input and photo decode follow-up

The `4a9f2ec` native Windows log shows desktop 1280/zh stuck in the new-error dialog before Add item, and narrow 390/vi failing complete/naturalWidth before photo decode. In the latter case all four groups, atomic Save, photo upload and per-group reload had already passed. The temporary-path fix was diagnostic only and was not the sole cause.

A deterministic actual-controller/transport/SQLite/R2 test holds the real permission response, opens the local new-error modal, types a bilingual name, then releases the response. Before the product fix the name becomes empty; four stale actor/epoch/delivery cases also repaint a disconnected input (5/5 RED). The controller now captures input before repainting only while the captured input owner remains current, and passes the same predicate to permission settlement. Actor object/id, epoch, delivery, scope/generation, host/lifetime/client guards remain mandatory. Input remains unsent until explicit Apply/Save; no additional network write or schema/format change. New generation/host and current 403/503 coverage checks stale replies and denial gates. Asset pin is `20261105-ab-scope-input1`; shared-client pin/history inverse are unchanged.

The compiled photo test awaits the image's actual decode promise before the original complete/naturalWidth assertion. Broken image decode still rejects. All 41 assertion call expressions (AST-compared against `4a9f2ec`), test timeouts, data/permission/receipt checks and the original full compiled CI command remain. An added synthetic 350ms photo GET latency run at the pre-fix Linux checkpoint passed 4/4; it did not independently reproduce the Windows photo race and is not claimed as RED evidence.

Local test/build results, final commit and exact remote CI are reported separately after execution. The PR87-only diagnostic uses the same GitHub merge-commit identity as the full workflow and retains the existing source guard. Local safety adds the response-gated regression as a separate command with Windows exit propagation, retaining every old command. No full CI or native Windows success is implied by local results. Independent review, real devices/IME/cross-machine, four catalog HOLD decisions and private BOM/live-data limitations remain.

Local pre-commit verification: controlled permission races/403/503 9/9 PASS (initial five cases RED before controller fix); cache/receipt/history/source contracts and A/B handler subset 157/157 PASS; typed lint and TypeScript PASS; source boundary PASS; all 13 changed/new files have zero sensitive-content findings. YAML syntax/read-only permissions/checkout identity and CR-aware diff checks PASS. A first local build invocation correctly refused absent PROCESS_PROGRAM_COMMIT; the exact candidate build uses the actual commit value. Broader caller/browser suite, final compiled acceptance and remote CI results follow separately and are not counted here as complete.
