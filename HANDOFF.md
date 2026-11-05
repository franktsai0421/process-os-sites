# 2026-11-05 — Minimal access-event collection follow-up (local only)

Draft PR #86 remains pinned to approved a08384a. The separate local follow-up collects only approved metadata and follows existing view/edit/exchange permissions, without other-account receipt access. Candidate SQL and owner-isolated reporting queue remain default-off pending retention/activation policy; no migration adoption, data change, merge or deployment. Raw input/media/secrets are excluded. Exact validation is reported separately; not all legacy scopes or module lifecycles are covered.

# 2026-11-05 — Feedback dual-source candidate

Independent from main `2b58eae`; only feedback UI/API, synthetic tests and focused documentation. Helper pending/completed views reuse existing storage and authority. Access-confirmation source is explicitly disconnected; centralized retention/authorization/history and the new export format remain decisions. No shared workflow/client changes, migration, live data, merge or deployment. Exact validation is reported with the candidate commit; source and test files describe partial implementation only.

## 2026-11-04 — Unknown Begin follow-up in Draft PR77

The isolated candidate adds identified Begin and durable receipt-only recovery for FQC/IQC/IPQC C/process authoring. Preserve pending operations, local comparison bases and existing data; no blind retry, cleanup, merge or deployment. Exact-head CI and compiled browser results must be checked separately from prior cfb5429 success. [Current evidence, V39 source gap and remaining gates](docs/acceptance/draft-save-integration-20261104.md).

## 2026-11-04 — Draft PR77 independent-review follow-up

Fixed the reviewed IQC unsaved Submit, canvas reused-saved-ID acknowledgement and IPQC C create/delete batch-order issues in the same isolated integration branch. Preserve explicit Save, exact receipt recovery and genuine peer-conflict guards. [Latest evidence and remaining gates](docs/acceptance/draft-save-integration-20261104.md). No main merge, publication or business-data changes.

## 2026-11-04 — 隔離草稿整合候選（未合併／未發布）

FQC #74、IPQC C #75、IQC #76 在獨立 integration 分支語意整合；畫布004b2ff已交接並納入，追加檢查式無提示離頁與跨模組驗證。共用離頁／收據與快取保留各模組範圍，修復舊草稿首次保存相容性。[來源、測試與剩餘門檻](docs/acceptance/draft-save-integration-20261104.md)。

## 2026-11-04 — FQC 草稿流程統一與加速首階段候選

Based on main `85fa4a3`, independent `feat/fqc-single-save-20261104`: local editing, atomic shared Save, cell merge and checked automatic departure. No live data cleanup, merge or deployment. [Scope, test evidence, legacy inventory limits and integration risks](docs/acceptance/fqc-single-save-20261104/README.md).

## 2026-11-04 — IQC local editing / atomic Save candidate

Independent branch from main 85fa4a3. Local Apply, guarded atomic Save and opt-in silent departure; legacy shared data remains intact. No deployment. [Evidence and integration gates](docs/acceptance/iqc-local-atomic-save-20261104.md).

## 2026-11-04 — IPQC-C create-item independent candidate

Fixed necessary-record creation read, atomic allocation update, post-storage session check and a bounded 45-second create-item wait. Isolated tests and independent review passed; real latency/original unknown remain unverified. Draft PR #73 is open. Follow-up narrows the mandatory create readback and adds measured POST+GET evidence; original unknown stays intact. No deployment/FQC V31 change. [Scope, evidence and limits](docs/acceptance/ipqc-c-create-20261104.md).

## 2026-11-04 — FQC #72 integration with merged IQC #71

Integrate main `6247c00220bf366e41c92c5b684d9f9744076cad`, retaining IQC unknown-result recovery/timing and FQC bounded read overlap. Both document histories remain below. Integrated-source regressions, build, independent review, paired performance against main6247 and complete CI are separate gates from earlier candidate results. [Current evidence](docs/acceptance/fqc-flow-performance-20261104/README.md). No PR merge, deployment, live data change or V31 unlock.

## 2026-11-04 — FQC flow latency candidate

[Draft PR #72](https://github.com/franktsai0421/process-os-sites/pull/72) from main `3594944`: bounded five-aggregate GET overlap for FQC reads and Apply/Save, retaining fresh readback, authority phases, integrity validation and CAS. Full CI found overly broad POST admission; the follow-up excludes mixed Begin and unsupported commands without changing the original integration assertions. No deployment, live record change or V31 unlock. [Measured scope, regression evidence and limitations](docs/acceptance/fqc-flow-performance-20261104/README.md). This candidate does not diagnose or repair IQC.

## 2026-11-04 — Independent IQC unknown-result candidate

Based on main `35949445`, branch `fix/iqc-unknown-operation-20261104`. Preserve the live unknown operation; no retry, lock clearing or deployment. Longer client waiting is not a speed improvement. Draft PR, exact-head CI and final independent review are reported separately. [Scope, tests and limitations](docs/acceptance/iqc-unknown-20261104/README.md).

## 2026-11-03 — Simple draft departure follow-up

A separate draft branch extends simple input abandonment across ordinary draft adapters and process authoring. #66 now integrates IQC #70/main `f1a16f9` after #65/#67, preserving all three prerequisites. Prior-head CI failed one FQC fixture setup deadline before abandonment; independent FQC browser files now run sequentially with all assertions, deadlines and internal races intact. Fresh exact-head CI and independent review remain required. #68 waits for #66; do not merge #66 or publish the test site before the coordinated completion instruction. All-pages support is NOT complete: non-FQC unknown and feedback paths remain blocked/unimplemented. Do not merge/release as complete user acceptance. [Scope, evidence and blockers](docs/acceptance/simple-draft-departure-20261103.md).

2026-11-03 IQC language follow-up: targeted pending-label/message text updates preserve open details and unsaved forms during same-page Chinese/Vietnamese switching; browser reproduction and verification are recorded in the IQC acceptance note.

2026-11-03 follow-up: nonblocking IQC frequency/supplier counts remain visible separately; legacy shared-draft fixtures now assert the existing revision, no-change and unsaved-content contracts. Baseline reproduction and final evidence remain in the linked IQC acceptance note.

## 2026-11-03 — IQC content-issue source correction (local only)

Draft missing counts now use the same server content checks as submission; import notices are separate, unknown results stay unchecked, and fixed-case results retain their original snapshot source. No business-rule/data/permission change. [Implementation, tests and limits](docs/acceptance/iqc-content-issues-20261103/README.md). No push, PR, merge or deployment.

## 2026-11-03 — FQC PR #65 departure simplification

Current task follows the user’s later preference: abandon unsent input and browse other pages, with no new input archive or restore UI. The unmerged checkpoint implementation was removed. All-draft-page support is a separate expansion because process canvas discard can perform server rollback. PR #65 and the old live v37 session are not declared deployed/fixed; complete CI and independent review remain gates. [Evidence and limits](docs/acceptance/fqc-authority-body-20261103.md).

## 2026-11-03 — FQC authority-body compatibility candidate

Based on fetched main `f23fb5e` (merged #63/#64), this candidate fixes normal serializer-produced authority audit bodies being rejected by ordinary FQC Apply/Save. SHA/JSON, current permissions, revocation, CAS and receipt-only unknown recovery remain enforced. No live data, account, schema, merge or deployment changes. Root-cause scope, isolated regression and unresolved historical-operation limits: [acceptance](docs/acceptance/fqc-authority-body-20261103.md).

## 2026-11-03 — Remove PR #61 speed diagnostics

Removed the diagnostic page/API, browser recorder, timing wrappers and dedicated tests/documents at the user's request. Normal login, authorization, revocation, storage/CAS and merged #62 FQC behavior remain. No schema, business data, account, access or runtime-setting changes. [Removal acceptance and release gates](docs/acceptance/remove-navigation-diagnostics-20261103/README.md). Full CI log audit also found and repaired an existing equipment Begin fixture/runner false-success defect; product code remains unchanged by that follow-up. See the same acceptance report.

## 2026-11-01 — FQC conflict Discard recovery (#60 / local #59 integration)

Original Draft #60 passed supported CI on merged #58 / `0008df7`. The local integration now preserves merged #59 / `77e62ce` UI and advances only the two changed JS cache versions; it is not yet published. The separate #56 tests-only handoff is not included. The exact scoped repair and verification boundaries are maintained in [one acceptance note](docs/acceptance/fqc-conflict-discard-20261101/README.md). Unknown and other operations stay blocked; no employee data, permission, schema or deployment change. Integrated exact-head native/CI and source review remain release gates.

## 2026-11-01 — FQC required dependencies (independent local follow-on)

Baseline is merged #57 / `848be13da54c7ae747bcdd96df19e01129fe980a`; that earlier release is not this candidate's acceptance. This branch implements the separately approved FQC necessary-dependency fault boundary for ordinary records-v1 Apply/Save only. GET/terminal freshness and all other commands remain unchanged. No employee data, schema, accounts, deployment/access or Site changes. Exact closure, tests, performance limitations and remaining gates are maintained in [one engineering note](docs/FQC_REQUIRED_DEPENDENCIES.md). Not yet published or deployed; older entries below retain their original historical context.

## 2026-11-01 — FQC Apply ACK acceleration follow-on

Exact versioned Apply-only ACK omits duplicate POST live bodies after unchanged full projection validation; full fresh terminal GET, receipts, ownership and all fault/CAS checks remain. Synthetic n5 existing Apply 92.73→54.18 ms, wire 801,066→400,825 bytes; R2 counts unchanged, no live timing claim. See `docs/acceptance/fqc-apply-20261101/README.md` and reproducible benchmark. First CI lint found one test-only await diagnostic; fixed without weakening assertions. No migration/data/Site/deployment change.

# FQC Apply reliability — independent candidate

The current FQC early-abort repair, all-Apply caller coverage and verification boundaries are in [the isolated acceptance note](docs/acceptance/fqc-apply-20261101/README.md). It is based on merged #55 and does not incorporate routine-FQC, AB performance, login or canvas candidates. No Site/data/account change or deployment.

# #54 dot 本地整合（未發布）

最新來源、手動同步邊界與驗證進度見[本地交接](docs/acceptance/PR54_DOT_INTEGRATION_20261030.md)。#51/#52成果保留；私人43條另候選。下方 #54 原始報告保留其當時版本與限制。

2026-10-30 公開來源分支交接：[dot 最新交接](docs/acceptance/performance-draft-20261030/DOT_GITHUB_HANDOFF.md)。依使用者新授權，僅將本任務必要程式、測試與文字報告提交至 `handoff/sitewide-performance-drafts-20261030`；保留原基準，不合併 main／#51／#52、不建立 PR 或部署。舊文「未 push」是各驗收時點紀錄，遠端交付以此次 Git HEAD 核對為準。

2026-10-30 製程平台續修：最新狀態與完整交接以[本輪報告](docs/acceptance/performance-draft-20261030/PROCESS_PLATFORM_ROUND5.md)為準；[規則與剩餘建議](docs/acceptance/performance-draft-20261030/ROUND5_RULES_AND_REMAINING.md)、[獨立審查](docs/acceptance/performance-draft-20261030/ROUND5_INDEPENDENT_REVIEW.md)。接續原未提交工作，新增製程 Begin／Apply／Save 與 IPQC 讀取優化、製程三選項離頁及撤銷結果唯讀恢復。其餘模組不能沿用製程驗收。交 dot 統一上傳與整合，未 push／PR／merge／發布。下方各輪為保留的歷史交接，其「三選項未接入」是當輪狀態。

2026-10-30 最後收尾：[讀取／寫入／載入與矛盾交接](docs/acceptance/performance-draft-20261030/FINAL_OPTIMIZATION.md)、[規則與未完成清單](docs/acceptance/performance-draft-20261030/FINAL_CONTRADICTIONS.md)。減少畫布／草稿／基準比對重複工作，補本人撤銷ABA保守拒絕；完整Worker測量與同程式對照顯示明顯波動，不宣稱全站穩定500ms。三選項UI仍未接入；交dot統一整合，未發布。

2026-10-30 最新續作：[500ms 第三輪實測與完整交接](docs/acceptance/performance-draft-20261030/PERFORMANCE_500MS_ROUND3.md)。本輪加入 Excel 按需載入、審核 render／PROCESS 序列化優化；入口 39／51 項中位 ≤500ms，仍有超標與回退。未發布，原三選項 UI 待完成。

2026-10-30 續作：[500ms 入口優化、五輪前後量測與 dot 交接](docs/acceptance/performance-draft-20261030/PERFORMANCE_500MS.md)。共用樣式／腳本建置合併已驗證；未發布，三選項離頁仍待完成。

本輪進行中：[20261030 導航修復與待完成項目](docs/acceptance/performance-draft-20261030/README.md)。

# #51 → #52 順序整合候選（僅本地）

共同檔案已語意整合，本次不包含舊資料自動轉換，新增轉換專用程式已移除；交付順序與保留行為見[整合紀錄](docs/acceptance/PR5152_SEQUENCE_INTEGRATION_20261030.md)。獨立兩候選均保留，遠端 PR/base 未改。

# PR #52 本地整合候選（未推送）

一般線別／工段修正保留，本次不包含舊資料自動轉換，新增轉換專用程式已移除；來源、決策及相依見[整合交接](docs/acceptance/PR52_MAIN_INTEGRATION_20261030.md)。

# 線別與工段：指定分支交接

`handoff/lines-stages-final-20261030` 收錄本任務五個既有本機提交及其後未提交成果的必要程式／測試，從原始基準 a870fc5882a1ec6ebe3308e540c1c69282e05dc1 整理，不合入其他 AB/C 任務。原始本機成果完整保留；公開分支排除資料、憑證、ZIP、截圖與產生報表。版本、測試、既有格式相容及未完成事項，統一見 [DOT 交接](docs/acceptance/LINES_STAGES_FINAL_20261030.md)。不授權合併／部署。

# PR #51 已推送候選（未合併）

已正常 fast-forward 推送 e8c44a3855bc4cd2916f9a76903ae05b6875a413，保留最新 main 及 AB/C 成果；來源、衝突處理與驗證界線見[整合交接](docs/acceptance/PR51_MAIN_INTEGRATION_20261030.md)。#52 及全站離頁新方案分開。

本次 AB／C 產線與類別＋草稿切頁修復交給 dot 審查及建立 PR，最新公開來源交接見[AB／C 交接](docs/acceptance/AB_C_DOT_HANDOFF_20261030.md)。分支 `handoff/ab-c-final-20261030`，基準 `a870fc5882a1ec6ebe3308e540c1c69282e05dc1`；不整合線別／工段任務，不合併或部署。原始本地成果與證據保留。

測速／驗證工具補件（2026-10-30）：五個本機腳本已整理為參數化工具，輸出不覆寫歷史文件；規格、使用方式與針對性驗證見 [補件說明](scripts/benchmark/README.md)。產品功能與資料模型不變，圖片／trace 保留待安全附件交付。

補件審查已修正 preview smoke 跨來源 redirect 缺口與新增測試的 typed lint；CI 增加 Python／Node 工具及兩個 loopback 的 redirect 回歸。等待 root 核對本地提交及遠端 CI，尚未由此修復任務 push、merge 或部署。完整 runner 的 Linux 限制與 Windows 清理未驗證範圍見補件說明。

# 使用者權限 CLOUD 29102026 — 已修正，未部署

最新：[清楚權限修復／驗收交接](docs/acceptance/USERS_CLOUD_CLEAR_RIGHTS_29102026.md)、[設定→頁面→API 對照](docs/acceptance/USERS_CLOUD_PERMISSION_MAP.md)。使用者確認方案後完成簡化矩陣、明確依賴、獨立還原、5 個品質模組單獨保存／送審／撤回、線別範圍說明及發送查看者拒寫。基準 `2cac307f29b8017a2bb6dc5229d47720f2deab33`；完整編譯瀏覽器版本 `4b8c0d2ba5e6642f67eb13725a4c5212f4f5c9e6`；最終 UI build `33a1fd04a2abc9aeb2e2dd0477872f0ef2174223`（展開排列補修、完整頁面及五次測速補驗）；最終相依驗收分支 `cloud/users-permissions-layout-29102026`。各模組分支分開交接，不整檔覆蓋其他任務。

只用隔離合成資料；原站／正式站沒有修改。外部預覽及 Draft PR 受工具／GitHub API 網路政策限制仍未建立，PR body／base-head 清單已備妥；嚴格100ms開啟設定目標仍未達，真站效能與實體輸入法未驗證。不能標完整交付或放行整合。dot 須先核對 web-feedback-helper 與 ipqc-ab-read-ownership 的共用 index／讀取所有權等重疊，詳見交接。沒有 merge、auto-merge 或發布。

先前載入優化見[歷史載入報告](docs/acceptance/USERS_CLOUD_LOADING_29102026.md)；早期 audit-only 未修復狀態已由本輪候選取代，原始證據仍保留。

本次獨立候選：全站照片 CLOUD 29102026，基準 `2cac307f29b8017a2bb6dc5229d47720f2deab33`，分支 `codex/photo-standard-cloud-29102026`。已補做實際照片表單及小字放大修正。與流程修復 PR 分開，交 dot 按區塊整合；未合併或發布。入口與驗證見 [照片紀錄](docs/sites/PHOTO_STANDARD_CLOUD_29102026.md)。

首次進頁已拆量並局部減少遮罩後排版；五輪中位 708→658ms、最慢 759→927ms，完整流程 25 項通過，既有資產字串測試仍有 1 項失敗。見 [最新入口報告](docs/sites/PROCESS_ENTRY_PROFILE_29102026.md)。未發布既有站台。

流程資料補驗發現離開提醒缺口並局部修復；18 項原生離開／重整／背景恢復驗收通過。最後整合測速另見 [本輪紀錄](docs/sites/PROCESS_FLOW_DEPARTURE_PERFORMANCE_29102026.md)。

流程 CLOUD 29102026 最新產品來源 `74ab03f`：已補修流程專屬 reviewer 的平台載入，10 項審核／取消驗收與 39 項完整流程通過。已實際核對權限／小幫手固定分支：前三個共用 JS 無同檔變更，index 的最小入口補丁及文件衝突見 [整合核對](docs/sites/integration-cloud-29102026/README.md)；仍未建立公開預覽或 Draft PR。

流程 CLOUD 29102026 續修已驗：產品來源 `212a730`、瀏覽器 39 記錄及 native 14 組；名稱 Apply 併寫與真實 IME 事件修正。完整逐步清單、前後三輪測速、未測與公開交付阻礙見 [驗收](docs/sites/PROCESS_FLOW_CLOUD_29102026.md)。原獨立分支與 dot 整合界線不變。

本次獨立候選：流程資料頁面 CLOUD 29102026，基準 `2cac307f29b8017a2bb6dc5229d47720f2deab33`，分支 `codex/process-flow-cloud-29102026`。照片 PR 獨立；未合併或發布既有站台。實作、逐步驗收與預覽阻礙見 [流程紀錄](docs/sites/PROCESS_FLOW_CLOUD_29102026.md)。

本次獨立回報／小幫手工作： [隔離交付與 dot 整合事項](docs/web-feedback/20261029-isolated-helper.md)。分支 `codex/web-feedback-helper-20261029`；僅模組程式、專屬測試與文件，入口只更新 helper 快取版本。未 merge、未覆蓋任何 Site；公開預覽與 Draft PR 需要目前未提供的外部能力。建議 1–4 與 iframe 首幀修復證據見交付末段：同步暫代 iframe 畫面並恢復原節點，立即點擊診斷已通過；入口版本為 feedback7；最新明細局部更新、交接按需呈現及速度／雙語驗證見同一交付末段。下方其他工作的內容保持原樣。

# Isolated Sites implementation handoff

Current isolated performance candidate: [FQC readiness](AI_CONTEXT/modules/RUNTIME.md#2026-10-25-fqc-readiness-candidate-not-published).
Built from reviewed merged PR 24 commit `0620d0b7bca29888045a868ca027bf27c8baf9dc`
(tree `b989908f163345c75bce0f6adbf9f969f1d08e91`) without changing the release
checkout. The baseline sequential loader and a narrow active-equipment GET reduce
unneeded hydration, with actor/generation/event fences and no new client
permission round-trip or all-module revision retry barrier.
This candidate has not been pushed or published; full-page navigation is
unchanged. Exact local candidate commit/check receipts are retained by the task. All-major-pages persistent-shell design remains a separate material
lifecycle decision, not completed by this first bottleneck fix.


Current cloud-only candidate: [asset delivery read repair](AI_CONTEXT/modules/RUNTIME.md#2026-10-25-sites-圖片讀取候選未發布).
The frozen nine-file local handoff was hash/base-blob checked against Site source
`dbe84ce7b46c52f099df2be60136ec3970e0eb14` (reviewed GitHub baseline
`3f3b5594ae2103b782762809aaae6ef8fb2c26e3`). Cloud is the sole source writer;
the workstation task remains stopped. Exact producer fragments, bounded visible
asset scans and version metadata reads retain existing permission/adoption and
CAS fences. Compatibility and failed-body cleanup regressions were added during
review. Build stamps identify the reviewed baseline, not these uncommitted
changes. No commit/push/package/deployment or live data/session transfer occurred.
Synthetic checks are not live image, latency, memory or full owner/staff acceptance.
Historical phase notes below retain their original evidence boundaries.

Current local follow-up: [verification control cost](docs/sites/VERIFY_CONTROL_COST_REVIEW.md).
Three synthetic restricted GETs now execute 74 rather than 128 SQL statements;
fresh per-I/O authority/fence checks and all writes are retained. This patch is
uncommitted and not deployed. It does not implement version-19 recovery.

The [one-shot c273 observation](docs/sites/C273_OBSERVATION_20261024.md) was deployed
as private version 7. The owner observed matching 14,234 bytes/SHA in 675 ms;
the durable singleton receipt is retained. Observation was closed in env revision
14, deployment appgdep_6adc348aee848191a25e951c028f20a3. Recovery remains OFF.
Original request 787e1f35 remains unknown at version 19/cursor 272, with the lock
and charges unchanged. All payloads remain staged; no business restore/activation
occurred. Current readability does not establish the historical failure cause.
The preparation paragraphs below are historical, not current publication status.

Latest local follow-up: [restricted incident verification protocol](docs/sites/VERIFY_INCIDENT_PROTOCOL_20261023.md).
The default-off HTTP entry, separate persistent verify/audit scope and same-process
host are implemented locally. Evidence: 21 initial unit/schema, 6 compiled HTTP
and 7 local workerd-D1 probes pass; a subsequent delayed-owner expiry test passes
individually. The previous 34 were not rerun after that narrow fix. The final
build/type receipts and exact file hashes are recorded in the task-local final
review handoff. The build stamp is a real
ancestor, not a commit for these uncommitted changes. No true credential, source
push, live schema/control-table change, deployment or real recovery occurred.
The original [planner rehearsal](docs/sites/VERIFY_RESUME_DECISION_20261023.md)
is historical evidence, superseded for implementation status by this protocol.

Latest local-only incident work: [stalled native verify recovery](docs/sites/VERIFY_RECOVERY_20261023.md).
All 1,401 payload ACKs exist, but last observed committed verify cursor is 272;
the original host is absent and no online recovery was attempted. Bounded body
consumption / intent proof changes and an exact stopped-only CAS are prepared
for review. No lock release, credential renewal, deployment or activation is implied.

Current local preparation: [native import transport](docs/sites/NATIVE_IMPORT_PLAN.md).
The owner closed the stalled browser sender. A read-only 10:56:30Z live receipt
still showed open/no active request and unchanged counters. Native source reading
and drained four-way within-request writes are local changes only; the new
application capability/private Sites entry design awaits parent review. No new
credential, source push, deployment or resumed business transfer is implied.

The same branch now includes a Node CLI preflight/runner structure and guarded
injected transport. Cancellation/deadlines freeze further sends and perform
separate bounded read-only reconciliation; no provider, credential intake or
new hosted auth route is installed. See the proposed capability/nonce/revocation
protocol and explicit unknown official Sites entry-token lifetime in the plan.
The owner wants fixed-folder automatic import, not renewed browser file picking.

Stage-two photo work extends the portable lossless-first policy to process
editor and feedback uploads. Technical dimensions/alpha and existing JPEG/WebP
remain; no repeated lossy canvas pass. An offline new-copy converter rebuilds
image/JSON/private-index/ZIP references with independent pixel verification.
See [current photo policy](docs/sites/PHOTO_UPLOAD.md) and exact task receipts;
earlier startup-EACCES checkpoints below are historical. One formally reviewed
same-executor run connected and reached five native groups; the invalid-body-
length fixture is corrected for the final compiled run. No live import/deploy.

Photo work is saved on `sites/unified-photo-policy`, with no source push or live
change. [Shared photo policy](docs/sites/PHOTO_UPLOAD.md) records 19 helper plus
19 route fixture checks and the compiled-runtime startup EACCES blocker. Do not
retry that connection by changing permissions/executor. Owner reports current3000
unchanged; 13 fixed business source files match M1. No live DB comparison is
claimed, and old backup dates alone are not evidence of changed data.

Current work: [cancelled campaign quarantine](docs/sites/CANCELLED_IMPORT.md).
PR6 operational batching merged; a later approved retirement action archives old
control values without deleting staging or using cancelled progress. Keep source
validation separate from live retirement. User now requires program/data parity
with current3000 before activation; R1/rev496 cannot establish this. Browser and
current workstation connector are unavailable; never reconnect or retry refused
D-drive Git/CIM actions to fill that evidence gap. Media inventory/compression
evaluation remains local and does not alter originals or authorize old-data use.

Current work: [operational import preparation](docs/sites/OPERATIONAL_IMPORT.md).
The owner cancelled the full R1 transfer. Do not resume or activate that transfer,
reset its budget marker or delete its staging. Prepare a separate offline view
that retains current business dependencies/all media and leaves global backups
in the original local source. Actual slimming audit/progress/batching results
are separate from the earlier full-package CI and live version 3. The offline
candidate audit passed; bounded transport and receipt-backed UI are implemented
in this branch. Hosted acceptance/old campaign disposition are not implied.

Current work: [post-login pending import and recipe upload readiness](docs/sites/IMPORT_READINESS.md).
Incremental progress correction retains unknown capacity wording and shares the
authoritative traffic gate with activation-status/final reply; the client never
turns phase active alone into enabled success. No storage/auth guard is relaxed.
The client recognizes only the exact inactive-import refusal before preloading
private scripts. A recipe-backed resumable upload controller and read-only local
preflight reuse the completed normalized view. A protected owner-only browser
uploader now uses the existing same-origin session and a bounded local replay
handoff instead of cookie extraction or a new credential. Provider quota and real
file/transfer acceptance remain unverified. The verified-capacity mode remains;
an explicitly approved bounded-attempt mode now keeps capacity unknown and uses
durable server admission/counters rather than fabricated remaining quota. An
append-only migration adds two control tables; no owner password, signer or live
setting is changed by source preparation. Exact checks
and the current PR/merge are recorded in the task; do not treat source readiness
as successful live data import.

Current work: [inactive root entry](docs/sites/ROOT_ENTRY.md). Known inactive
GET/HEAD / renders a bilingual HTML entry shell instead of the data-gate JSON.
Database failures, other methods, APIs, Worker-handled business routes and images retain the
closed gate. No auth, secret, data or live platform setting changes. Exact local
and CI evidence remains in the task/PR; Frank merges before any publication.

Retained owner/source context: [private-test owner setup and pinned source main](docs/sites/PHASE_TWENTY_THREE_OWNER_SETUP.md).
The default-off owner initializer appends a schema-only one-time receipt table;
source guard changes are reviewable source only. Existing installed hooks and
platform settings remain unchanged. Real owner/signer/source access/publication
still require their precise actions. Frank reviews and merges the new PR.

Current source delivery: [source-only PR validation](docs/sites/PHASE_TWENTY_SOURCE_ONLY_CI.md).
The new private repository README root is joined without rewriting the derivative
history. The work branch's CI no longer requires an unpublished canonical data
package. Frank alone performs the final merge; this is not Site publication.
Exact new local/CI results and PR head are recorded in the parent task and PR.

Base M1: `7f5dc57239d6db483f096d96df6bd6cdd7357f5a`.
Current phase: [normalized initial import](docs/sites/PHASE_EIGHTEEN_NORMALIZED_IMPORT.md).
Phase eighteen adds recipe-backed content-address reconstruction, actual consumed
record/R2 owner storage adapters and a source-only fresh-migration projection.
Source-specific validation receipts remain outside the checkout. Platform/source
push, real credentials and live import remain separate and unaccepted.

Historical phase seventeen follows:
The selected test project ID is now preserved. New default-off protected initial
import, durable chunk/semantic/copy/restore/activation ledgers and the separate
schema-only fresh-target migration candidate have synthetic checks. Explicit
numeric options repair the two TS2353 errors without weakening CAS. Post-import
export recognizes only the reserved transport V1 namespace; unknown layouts fail.
Latest receipts are phase-seventeen files outside source, with real source/commit
pins. Real credentials/data/platform remain untouched and unaccepted. Source main
guard and adoption of fresh migrations still require a platform-source decision.

Historical phase fifteen: [Sites source and release handoff](DEPLOYMENT.md).
Last application build and compiled synthetic HTTP acceptance use commit
`efaedbd4893347a968b65cfa237358ffa8821316`; this source-delivery phase changes
documentation only and reuses those explicitly versioned results.
Hosting manifest has only DB/STATE_ARCHIVE bindings and no project_id. Installed
Sites 1.1.1 portable helpers and Windows tar are present; remote work has not run.
Parent-controlled creation must return the real project ID/source branch first.
An existing main-push guard may conflict with a returned main source branch;
preserve it and resolve the exact source workflow before pushing. The historical
0002 empty-singleton INSERT needs a schema-only fresh-target migration strategy.
Protected hosted resumable import and real account/bootstrap remain unimplemented.
The current source archive/manifest/safety receipt live outside the checkout in
the parent task's phase-fifteen handoff directory. A source ZIP is not a Sites
publication archive. No platform ID, credential, real data or remote action added.

Previous phase: [offline runtime configuration fix](docs/sites/PHASE_FOURTEEN_OFFLINE_RUNTIME_FIX.md).
The native outbound network-service object reproduced the probe crash on this
host; a supported deny-all callback fixes startup while preserving both Worker
and Node outbound denial. Shared guard native cases 3 PASS; full password/D1/R2/
HMAC probe 8 PASS. Actual compiled application development fixture 12/12 PASS
against the retained deb0e90 build, with synthetic/nonpersistent DB/R2/users only.
Final commit, fresh build and fresh application HTTP receipts are kept separately
in the parent task with actual commit fields; do not conflate those versions.
No true credential/data/platform acceptance or remote action. Existing R1 remains
unchanged. The old native failures and negative reductions remain evidence.

Historical phase-twelve checkpoint:
Fixed-lock install: 567 packages, exit 0; no lifecycle or package/lock change.
Full TypeScript: 0 diagnostics after the private IQC baseline source repair
(5 synthetic cases). Socketless native workerd: 1 basic + 4 password/HMAC PASS.
Miniflare serve still fails; direct workerd listener reaches ready, but an owned
Node loopback diagnostic proves connect EACCES. Network tests stopped; no elevated
retry. Real derivative commit remains parent-owned; no fake SHA/build bypass.
Current source freeze/diff/handoff: parent-task phase-twelve JSON receipts;
.npmrc and held legacy files are excluded without rereading. No true data changed.

Historical phase-eleven checkpoint:
Build prerequisite refused the missing reviewed derivative commit; no compiler
started and no dependency installation occurred. One distinct synthetic-only
Miniflare operation encountered native workerd failure (`ERR_RUNTIME_FAILURE`),
zero cases reached; it was not an old C1/observer retry. Source-boundary 4 and
affected security 18 checks pass; scoped types/syntax have separate receipts.
No actual application login, account configuration, Sites or release acceptance.
Current source manifest/delta: parent-task sites-source-freeze-phase-eleven.json /
sites-source-diff.phase-eleven.json. Handoff allowlist excludes three held legacy
package scripts without reopening them; it is not an uploaded/full legacy bundle.
The phase-ten source-backed stage remains; no full true snapshot was copied.

Accepted true-data checkpoint: [phase nine](docs/sites/PHASE_NINE_TRUE_R1_LOCAL.md).
The owner chose ordinary inherited E permissions and confirmed no sync; do not
request protected ACL approval again or claim the directory is ACL-private.
The real conversion is COMPLETE: session 78719 exit 0; source checks and full
9,387-chunk / 8,143,387,205-byte readback/reference audit pass. COMPLETE and
CONVERSION-VERIFIED exist; INCOMPLETE/FAILED do not. Parent report:
sites-r1-real-conversion-03.json. Data-only acceptance includes 100 histories,
14 identities/3 roles and 304 private image mappings; authReady remains false.
No SDK, runtime, true login, GitHub/Site or publication acceptance. Conversion's
exact source pin/delta: sites-source-freeze-phase-nine.json / sites-source-diff.phase-nine.json.

Historical phase-eight checkpoint:
Real selected archive size/hash and ZIP directory pass; real metadata contract
passes after an observed typed header extension. Full real conversion has NOT
run: exact new E private-directory ACL confirmation is pending, and no real-data
output exists. Added synthetic checks: strict parser 13, ZIP reader 8, read-only
audit/staging 5 PASS. No SDK/DB/runtime/platform acceptance. Continue using the
exact blocker/receipt instructions in phase eight; never fabricate permission.
Current source pin/delta: parent-task sites-source-freeze-phase-eight.json and
sites-source-diff.phase-eight.json. Schema and lock remain unchanged.

Historical phase-seven checkpoint:
Strict confirmed-contract synthetic cases: 12 PASS; affected logical bridge 10,
adapter 20, mixed formats 10 and account/role/media 18 PASS. Scoped compiler:
0 diagnostics (`checkJs:false`). Source pin/delta: parent-task
sites-source-freeze-phase-seven.json / sites-source-diff.phase-seven.json.
The schema-contract parser gap below is resolved for the known profile only.
Outer delivery ZIP reader, true R1 conversion, real credentials and runtime/
platform acceptance remain unverified; no real-data phase started.

Historical phase-six checkpoint:
New normalized-member bridge/configuration fixtures: 10 PASS; affected adapter:
20 PASS, format integration: 10 PASS, account/role/media: 18 PASS; scoped types:
0 diagnostics (`checkJs:false`). The real R1 descriptor parser is stopped pending
one de-identified schema contract; no real package/runtime/platform work occurred.
The earlier [static freeze](docs/sites/PHASE_FIVE_STATIC_AUDIT.md) is historical;
use parent-task sites-source-freeze-phase-six.json for that historical source pin.
Large JSON, known feedback STORE ZIP and legacy chunked v1 are connected to
export/transport/isolated-local restore with synthetic verification. Mixed
integration: 10 PASS; adapter: 20; account/role: 18; JSON codec: 8; ZIP/chunked
codecs: 4 each; scoped types: 0 diagnostics (`checkJs:false`). The outer R1
delivery ZIP is not a direct snapshot input. Full R1, runtime, authentication
provisioning and publication remain unverified.
Read [phase one](docs/sites/PHASE_ONE.md) and the parent task's copy, fixture,
type-check and diff evidence before continuing. This source-only copy does not
represent the running 3000 version and must not reconnect the old C2C workflow.

Test audience intent: Frank only. Formal audience intent: public login entry,
application-authenticated business data. No Site registration/sharing/deployment
has happened. Local derivative commits are recorded in the parent-task receipts;
the statement above does not prohibit the already approved local source commits.
The old R20/G3 work and refusal boundaries remain
separate and unresolved.
# Photo optimization in the independent derivative

Six authenticated photo routes share a bounded lossless PNG upload baseline;
see [policy and verification](docs/sites/PHOTO_UPLOAD.md). Other formats retain
their bytes; no original media or candidate is rewritten. This local source
work does not establish current3000 parity or authorize publication/import.

PR8 review correction: offline photo references are resource/module scoped;
unchanged feedback attachments no longer share bare-digest rewrites. Existing
optimized targets require order-independent byte/hash/full business metadata
equality. Nineteen synthetic copy cases and affected codecs cover these rules.
The prior local candidate is retained but requires a corrected JSON-reference
handoff; no live upload or activation is implied. See PHOTO_UPLOAD.md and the
parent-task photo-review-real-audit-20261023.json receipt.

# Native staging importer: local implementation, live HOLD

The `sites/native-import-transport` branch adds default-off capability/nonce/
operation metadata and an explicit pipe-only CLI using the existing fixed
handoff directories. See [current native contract](docs/sites/NATIVE_IMPORT_PLAN.md)
for the three-table migration0005, <=4h write/<=5h receipt windows, baseline
readback, unknown-effect rules and exact staging-only scope. No live schema,
credential, upload, audience, owner password or deployment has changed.
Security architecture requires independent review and informed per-action
credential approval before enabling. Copy/restore/activate are excluded.
