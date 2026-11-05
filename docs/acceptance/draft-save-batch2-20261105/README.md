# Draft workflow batch 2 integration — 2026-11-05

Isolated branch `integration/draft-save-batch2-20261105`, dependent on Draft #77. This is source-only integration of #78 tooling, #79 BOM and #80 AB/C, not a release approval. No main merge, draft-to-ready, protection/review change, deployment, business-data/schema migration or connector reconnection. The separately blocked IPQC A/B candidate and equipment candidate are excluded.

## Pinned sources and preservation

| PR | Exact source head |
| --- | --- |
| #77 base | `0af6d57e912e5615250959c9e76210fecd55d96b` |
| #78 tooling | `03249249a844017bdc22aa922c030534eb0a4cb2` |
| #79 BOM | `8c4a73bb76256d0c66797a27a5fa52a8952327ae` (test-only follow-up to `9507202…`) |
| #80 AB/C | `d05a85eab2a49e735a604078873578898edf1535` |

The PR targets `integration/draft-save-20261104`, so its diff contains only this second batch. All source heads are retained as ancestors. [Byte preservation audit](source-preservation.json) compares independent files with their actual source heads. Original feature branches/PRs are untouched. Source-head rechecks and exact final CI are reported on the PR; a feature-head PASS cannot establish integrated readiness.

## Semantic resolutions

- Shared edit-implies-Save is the exact union IQC + tooling + BOM + master:AB/C. `master:PROCESS` remains excluded. Begin admission combines existing scopes with tooling/BOM/AB-C without broadening generic routes.
- BOM retains original ordered guarded/import operations, pre-CAS atomic-Save identity revalidation, payload-size-derived 413 rejection proof and `hasUnknown(observedOnly)` behavior. No unknown receipt is cleared or blindly resent.
- AB/C retains actor+scope-keyed Begin markers, generation checking and `masterSaveReadback` in direct Save, receipt and unknown recovery. PROCESS keeps its prior flow.
- Tooling retains staged photo lifecycle and live `view:data` **and** `tooling.edit` write gates, including restricted-role behavior. All independent domain/handler implementations remain byte-identical to their sources.
- Shared source SHA256 is `30f7e9c9d5de3207bb89eba34fb3b82d23b965d4e77d3d191b5fa5115be309d9`. Only this exact successor admits three once-occurring reverse spans: scoped Save permission union, Begin scope union, BOM pre-CAS validation. These restore the unchanged original afterHash before the original offset-based Begin inverse restores beforeHash. Original offsets/hashes, unsafe-Begin, unknown-source, privilege-escalation and PROCESS-expansion negatives remain; tooling-key and BOM-session-bypass negatives are added.
- Shared client asset is `20261105-batch2-integration1`; tooling/BOM/AB-C module-specific tags are retained and precise cache-contract assertions cover all changed assets.
- Existing master departure binding fixture lacked `localDirty`/`discardLocal` and treated acknowledged peer state as document-local input. It now extracts the real bridge accessors, retains the original permission/owner/no-write/late-mutation assertions, and adds completed-local-batch abandonment. No failures become skips.
- Full Windows Local safety retains all original gates, timeouts and protections. Existing tooling/BOM steps are combined and explicit AB/C unit, compiled-browser and cold-start steps are added. The AB/C dedicated workflow remains additional evidence.

## Verification record

Managed cloud Linux, Node 24.19.0; isolated synthetic SQLite/D1/R2 and loopback only. Installed from the unchanged lockfile in a standalone clean clone with normal postinstall/main guard. No private datasets or credentials copied.

| Check | Result |
| --- | --- |
| Typed lint, full TypeScript | PASS |
| Primary integration suite | PASS: 431 tests, zero failures/skips |
| BOM recovery/authority/permissions and shared unknown/submission suite | PASS: 278 tests, zero failures/skips |
| Real departure bindings | PASS: 150 tests, included in primary suite (not additive) |
| Historical Begin inverse / actual old-handler rejection | PASS: FQC/IQC/IPQC-C/authoring/BOM reject `begin-v1`, zero D1/R2 mutation; negative exact-source tests retained |
| IPQC-C bounded historical source proof | PASS: 9 groups |
| IPQC-C permissions/source proof | PASS: 8 groups |
| Tooling UI/workflow/checks and master v3/stage-link/route/field-guard/legacy scripts | PASS |
| Source-only history/worktree preflight | PASS |
| Real tooling Chromium 1280 Chinese / 390 Vietnamese | PASS with installed `/usr/bin/chromium`; deliberate lost-ACK 503 is expected |
| Production build at `58ee1122e8639edffc79d7602002f9ee8f38c0d3` | PASS, safe-output/private-auth postbuild check |
| Compiled AB/C browser, BOM browser, native departure/cold-start | PASS: AB/C scenarios, six BOM scenario groups, 17 native tests, no page errors/prompts |
| Shared departure/resource contracts and terminal/Begin contracts | PASS: 269 and 68 tests respectively |
| Canvas atomic Save | PASS: 30 tests |
| Actual integrated lifecycle/CAS/review races | PASS: ten modules |
| Photo/resource tests and actual synthetic routes | PASS: 28 tests plus 19 route cases |
| Lines permission matrix | PASS: 72 original operation cells plus 16 edit/save combinations; independent Submit remains denied |
| Account/restore/legacy permission scripts | PASS: six scripts |
| Compiled destination delivery browser | PASS, no page errors |
| Delivery contracts including native Windows exit test | BLOCKED on Linux: 81 PASS, one process FAIL because `powershell.exe` is absent; original test unchanged |
| Additional compiled Begin recovery browser | BLOCKED: existing CI-only admission assertion rejected local environment before execution; gate unchanged |
| Full Windows Local safety on integrated final head | BLOCKED / NOT_RUN: public upload denied, no branch/PR/run URL; mandatory independent gate |

Initial primary run: FAIL 13 obsolete master binding cases (417 PASS); repaired as described, then 431 PASS. A later lines permission script also failed on the obsolete Save403 expectation; its 72 operation cells now preserve every other original gate, and 16 explicit combinations prove edit-or-save admission, both-denied rejection, independent Submit and unchanged D1/R2 on denial. No assertion/gate removal. Playwright's bundled Chromium download is BLOCKED by network policy (`cdn.playwright.dev`, HTTP 403 Domain forbidden); no manual retry or policy exception (the installer itself made its standard repeated attempts). Installed system Chromium is used through the tooling/BOM supported executable selector and AB/C's existing system-browser support. Windows CI installs its own supported browser normally.

Hosted/test Site, live HTTPS, real business data/scale, physical phones, native OS IME, cross-machine and long-soak acceptance: NOT_RUN. Missing private baseline-dependent legacy BOM consumer/Excel runners remain BLOCKED as documented in #79; synthetic actual-handler/import/browser evidence does not replace private-data acceptance. No performance claim beyond source-head synthetic measurements, which are not rerun or represented as integrated/live timings.

## Publication consequences and remaining gates

Repository visibility was reverified **public** before source publication. Only source, tests and text/JSON synthetic evidence are included. No media, databases, snapshots or secrets are uploaded. All checked-in workflows trigger on pull requests (no push deployment); the dependency base enables full Windows safety and AB/C checks. Draft creation does not deploy Sites. Any exact-head failure must remain visible and be repaired within scope before readiness is claimed. #77 ready transition remains the owner's separate blocked operation.


## Final local delivery and precise publication blocker

[Complete command/results and limitations](verification.json), [actual compiled browser outputs](browser-results.json), [safe build output](build-result.json), and [source byte audit](source-preservation.json) are repository deliverables. Program/build evidence is pinned to `58ee1122e8639edffc79d7602002f9ee8f38c0d3`; subsequent changes are tests/evidence only. Product/API/client/workflow hashes are unchanged. Source head metadata was checked repeatedly rather than trusting PR prose (notably #78's old aa840c8 body).

Automatic approval review **denied** `github_create_blob` for `.github/workflows/local-safety.yml` in public `franktsai0421/process-os-sites` before creating a blob. Stated reason: the general continue/merge instruction did not explicitly authorize public disclosure of this integrated payload to this destination. User-message history was read after the denial; no materially new relevant approval was present. No retry, alternate upload transport, ref creation, Draft PR, main/review/protection change or deployment occurred. The operation is denied, not pending or uncertain. Full Windows CI has no integrated run URL and remains BLOCKED/NOT_RUN; source #79 run `41964702710` subsequently FAILED in Integrated entry and read-only delivery contracts. Latest source #79 run `41967667273` is separate and was in_progress at the follow-up check; no integrated or source CI PASS is inferred.

The owner must explicitly authorize publishing this exact integrated source/tests/evidence to that public repository and creating the dependent Draft PR before the denied upload can be retried once. This does not request a policy exception and does not authorize a merge or deployment. The local branch, reviewable patch and Git bundle retain the complete work meanwhile.


## PR79 latest-source test-only integration

Locally incorporates #79 `8c4a73bb76256d0c66797a27a5fa52a8952327ae` after prior integration `d2ef6760cb5645a8b85e3d0f9cac7f3f1b5cee21`. [Exact commands/results](bom-source-followup.json) and [source/CI recheck](source-heads-followup.json) supersede the earlier #79 source pin/status. Existing bundles remain the prior immutable delivery; a separately named follow-up bundle accompanies this local revision.

Production files, dependencies, the original historical contracts/offsets and all three integrated union projection rules are unchanged. The source helper now requires a raw Buffer before hashing, and preserves #79's independently pinned BOM-only inverse (`6a85a7…` to `8734ac…`) alongside the existing union-only inverse (`30f7e9…` to `8734ac…`). The BOM helper cannot accept union bytes; all original historical/IPQC hashes and final pre-Begin bytes remain exact. No runtime code is transformed.

The ten imported test cases now exercise both fixed BOM source-history bytes and current union source, retaining the original eight mutation negatives and complete Git-history comparisons. They additionally verify integrated raw-string/Uint8Array refusal, wrong-file/unknown-file refusal and exact once-occurring Windows test commands/exit propagation. The old-server handler runner now covers BOM as its fifth module without weakening the original four modules or D1/R2/receipt equality assertions.

PASS: ten projection cases; five actual old-handler rejections; 87 Begin/receipt/module-generation regressions; IPQC-C historical bounded9/permissions8 groups; typed lint. Full Windows CI remains BLOCKED/NOT_RUN with no integrated run URL. Product build/browser/TypeScript evidence is reused only for byte-identical product inputs. No upload retry, remote ref/PR change, main merge, deployment, real data or schema action.
