# Round 5 獨立整合審查

審查範圍：製程編輯台 authoring／editor、共用導航 adapter／coordinator、owned draft ledger／revert planner、canvas lease，以及本輪 IPQC 與 authoring 的請求內計算重用。審查者未修改產品程式。這不是全站草稿模組、所有帳號權限或正式站安全驗證。程式根目錄 `/workspace/process-os-performance`；完整修改前 build 保存在 `/workspace/process-platform-round5-before/dist`。

## 審查發現與處理

| 發現 | 證據與影響 | 狀態 |
| --- | --- | --- |
| 原操作仍忙碌時開啟離頁視窗，ACK 後選項仍不可用 | 路由沒有刷新已有離頁決策。使用者可能卡在停用按鈕。 | 已修復：狀態事件刷新既有決策；完成後由使用者繼續，不產生第二次 Save。最終原生 busy Save→離頁案例 PASS，只有一次 Save POST。 |
| Back 後改成本頁內選單操作，未先恢復實體歷史位置 | URL／history cursor 與尚未離開的 source 不一致。 | 已修復：先恢復來源歷史位置，再執行最新本地 intent；lease 保留到執行。 |
| 點目前頁面的 no-op 未取消恢復佇列裡的舊意圖 | 使用者選擇留下後，舊事件仍可能晚到跳頁。 | 已修復：處理 queued／replaying／uncommitted intent 後才判定 no-op。 |
| inverse Apply 結果未知後重新整理，可能回到通用重送 | 舊 `owned-draft-ledger.mjs:35,184` 的 `revertAttempt` 只在記憶體。`shared-draft-client.js:255–258` 會把普通 Apply 留在 sessionStorage；reload 後 `process-authoring-v3.js:369` 可走 `resolveUnknown → 404 → retryUnknown`。成功 ACK 後 projection read 失敗也需要保留未完成核對的識別。 | 已修復並獨立覆核 ledger `ad441bfca7be`：inverse 前先保存並讀回 actor/scope marker；reload 只查原 receipt＋fresh state；404／cleanup 失敗保留阻擋，缺少完整 before-value proof 時回 NeedsReview，不冒稱已完成 discard。封鎖位於 ledger 與 authoring/canvas 的實際入口，不是所有模組 transport 的全域策略。最終 native receipt200／404 兩案均 PASS，原 inverse 沒有重送。 |
| Begin 繞過 marker mutation gate | `beginDraft` 直接 `c.begin()`；inverse ACK 後 read 失敗、另一人核准關閉草稿後，reload 仍可能建立新的 draft。沒有重送 inverse、清除 marker 或繞過 backend 權限，但與恢復期間應停止新寫入不一致。 | 已修復並讀碼覆核：handler 在 `c.begin()` 前檢查 recovery marker，按鈕同樣停用；作者新增 Begin 阻擋與正常 Begin 回歸。 |
| 原生 dialog.close 的非同步 close 事件使 local Discard 無法離頁 | `discardLocal()` 只 close dialog，`modal=null` 尚未執行；authoring 立即 inspect 仍看見 dirty form，錯誤拒絕 lease。VM stub 的同步 close 未揭露此問題。 | 已修復：successful close 後同步釋放精確 modal ownership，原 close 事件仍負責 unmount/remove，並補 delayed-close 回歸。`departure-final` 原生 local-only Discard 已 PASS。 |
| 新三選項按鈕未達本次可讀性驗收門檻 | 中文原生視窗按鈕的高度／字級未滿測試的 36px／14px 門檻。 | 已修復且原生 computed layout 通過：三選項均 16px／50px，vi390 視窗左16、右374。Stay 後 selection 另有下列問題，不能因尺寸通過把整案標 PASS。 |
| Stay 後原生 input selection 範圍遺失 | `departure-final` 的 zh 與 vi390 皆從 `[0,4]` 變為 `[0,0]`，焦點與文字仍在；導航只恢復 focus，未完整恢復文字選取。 | 已修復並原生 zh／vi390 PASS：捕捉 range/direction、scroll 與 owner，實體 history 回到來源後下一 task 還原；新 pointer／keyboard／input 或 owner 變更取消舊 snapshot。來源 URL 復位＋兩個 animation frames 後核對 `[0,4]`／forward 與原值一致。 |

## 已讀的安全與一致性邊界

- 離頁 Save 先套用目前表單，再處理尚未同步的畫布，最後建立 Save。`savedId`、generation、revision 必須與 Save receipt 一致，並確認 `saved.content` 等於權威 working。表單和 canvas lease 保留至目的頁準備成功；失敗不授予離頁。
- 表單 owner 包含身份世代、delivery、workspace 與草稿 generation。套用 yield 前後及晚到結果再次核對。Apply 成功、外層 Save 失敗時仍保留目前表單；新方塊第一次 Apply 後轉為既有方塊，避免重複 insert。
- readonly album 只有 adapter 精確擁有的 dialog 可在成功 commit 時關閉。目標讀取失敗保留來源 viewer；其他模組 dialog 並未一概略過。
- owned discard 的基準為這個 tab 首次可證明的修改前 checkpoint。它可保留進頁前其他人的共享未儲存內容；不表示整份共享草稿等於最後 Save。後續／交錯外部寫入（含 ABA）一律拒絕；只支援具完整收據鏈的本 tab 操作。
- 原 remove、無法安全證明的結構 membership 變動不強行還原；insert／order 的逆操作仍走正常 Apply 與既有權限、guard 和 revision 檢查。刪除墓碑不回復成未刪除。
- canvas lease 阻止本機 edit／travel／sync；先等既有寫入與 flush，再核對結果。只有已確認 owned inverse 後才丟棄本機 journal。`observe` 不可把未知 inverse 洗成已保存。
- Begin 僅將 advisory content inspection 移出可操作的等待鏈；必要權限仍需確認。Submit 保留明確 saved snapshot 規則，沒有默默包含 Save 之後的 Apply。
- IPQC error map、BOM roots 與 prepared master 都是單次請求／context 的重用，沒有新增跨使用者、權限或資料版本快取。AB 隱藏明細仍先計算完整內容，只有 DOM 在展開時建立；標準文字展開與圖片解碼必須另計，不能把第一層選項 ready 當成全部圖片完成。

## 驗證證據的界線

已閱讀作者的 authoring 19 案、ledger 28 案、planner 26 案、canvas departure 5 案、transport recovery 4 案，以及路由／協調器相關來源。Transport 測試使用真 client 原始碼、kernel 與 stub fetch；審查者未自行重跑這些單元，不把作者 PASS 擴大為原生整合通過。實際 Worker 與原生 UI 結果另列如下。

修改前完整瀏覽器鏈曾通過 41 個邊界；其資料在 `.sites-runtime/process-platform-round5/full-baseline-functional-final/`，標示為功能驗證，不可作正式前後速度比較。

第一版候選 build `a7c0e1cde13111fb660323534cd338e980a0a05f908fce986f9061fbc18b8a88` 在 `.sites-runtime/process-platform-round5/full-candidate-functional/` 完成至 Approve 共 37 個邊界且無 page error，然後停在測試錯誤：新增斷言要求舊 active 仍為 approved，與既有 `lib/versioned-shared-workflow.ts:83` 的 superseded 規則不符。已修正為舊版本仍存在、狀態為 superseded、snapshot 完整不變。保留失敗原始紀錄；最後四步尚未因此宣稱通過。

marker 候選 build `4b27b6248aa3b0c8a8613455b1777a166e02160e931b0423895d5c975b8aa160` 的完整功能鏈已在 `.sites-runtime/process-platform-round5/full-candidate-marker-final/` 通過 42 邊界、18 項持久化／快照檢查、14 次唯一寫入，無 page error。新增的 AB 展開標準主文與圖片計時分開；圖片另記從相關原生動作起算的完成時間。這一輪仍是功能單輪，不能據此宣稱效能改善。

`.sites-runtime/process-platform-round5/departure-marker-lang-corrected/results.json` 實際執行 20 案為 16 PASS／4 FAIL。四項已逐一區分：產品的原生 close 事件時序、按鈕可讀性；以及 harness 的 mobile drawer 判斷錯誤（`isVisible` 不能識別 transform 到畫面外，改用 bounding box 後原生點 menu）、inverse unknown 情境建立不完整（丟 POST 回覆後原 receipt 立即 200，產品合理完成導航；測試須暫時使初次 receipt GET 503 才建立真正 unknown）。沒有把這批標成通過。更早 `.sites-runtime/process-platform-round5/departure-marker-final/` 因 harness 把實際 zh-Hant 誤認為 zh，已標停止而非完成。

下一版 build `b2d93556fe1d3e9868d77598f1f3941bb7658012da961f8ed9319eacbcf39857` 的 `.sites-runtime/process-platform-round5/departure-final/results.json` 已完整跑 20 案：18 PASS／2 FAIL，僅 zh／vi Stay 的文字 selection。其餘包括原生取消 reload、local／owned／prior shared discard、交錯拒絕、畫布內頁與系統切換、rapid history、Save403／409／offline、busy 單次 Save、readonly album／目的頁403，以及實際 inverse POST 結果未知後 reload 的 receipt200／404 均 PASS。未知情境為真 Worker 寫入成功後丟棄回覆，暫時使第一次 receipt lookup 503，重新載入後再允許真200或注入404；沒有以模擬成功寫入取代 backend。

最終 selection 修補 build `bf47a1aabc31a1ceb6ec541adb824e619e8d6cf25f01b9c687f90cecfe4d2589` 的 departure-accepted/results.json（本機證據 `.sites-runtime/process-platform-round5/departure-accepted/results.json`，依公開交接規則不提交） **20／20 PASS，程序正常退出**。先前每一批失敗原檔保留，沒有覆寫或用另一版結果補成通過。審查者與主代理實際查看 中文桌機視窗（本機證據 `.sites-runtime/process-platform-round5/departure-accepted/stay-focus-selection-zh-decision-open.png`，依公開交接規則不提交） 與 越文390視窗（本機證據 `.sites-runtime/process-platform-round5/departure-accepted/stay-focus-selection-vi-decision-open.png`，依公開交接規則不提交）：三選項完整可讀、無水平溢出、Stay 焦點框可見；這是 Chromium viewport 模擬，非手機實機。

本次限定審查已提出的八項發現均已修復或有通過證據，未留下另一個可證實的新增回歸。這一結論限上述程式與 20 案製程原生情境。正式五對速度、不同資料量、未測的瀏覽器／實機／全站其他模組，以本輪總報告另列，不能從本頁功能 PASS 推算速度。

本頁最終覆核的關鍵來源 SHA-256 前12碼：navigation `9155002c25fb`、coordinator `39cbc7ca46f7`、authoring `e3b69e14c1f4`、editor `bbc65d4e7b56`、owned ledger `ad441bfca7be`、planner `3edfbd75969b`、canvas `8a6c140c263ee`、authoring backend `5ae0cc754a79`、IPQC domain `56bccf4e17ab`、IPQC route `7e30f3466b69`、IPQC client `35b54d439ab0`。三選項 adapter 目前只驗製程編輯台，不代表其他既有草稿模組已接妥或全流程通過。

## 最後追加：審核清單 advisory 局部更新

本段只讀覆核 `process-authoring-v3.js` SHA-256 `01f1437d86e0167787b2693dea0d8fb8ff05499dbc7bd9211bac963d23970732`，對照 `/workspace/round5-review-status-before/process-authoring-v3.js`。產品差異限第 335、337 行：固定保留 `data-authoring-review-inspection` 狀態節點，另以 `textContent`／`hidden` 更新 advisory。其餘案件、正式版本、錯誤與權限仍參與原卡片 markup 比較；內容驗證的 pending／完成／失敗不再因文字改變重建 toolbar，避免替換使用者正要點擊或已聚焦的按鈕。

審查結論：未發現此最小差異新增的實質回歸。狀態仍使用原 `inspectionStatus()`（第 64 行）與 actor／delivery／generation／revision 的 inspection 檢查（第 57、65–75 行）；非空時顯示原文，空時隱藏空節點，沒有提前顯示成功。`textContent` 保留純文字邊界，既有 `[hidden]{display:none!important}` 支援隱藏。每次 reviewPanel 仍重新綁定目前案件 handler；View 的 fresh read、權限、pendingId 與 generation 核對（第 342–352 行）及 explicit Submit／Approve inspection 沒有刪除。沒有新增快取、請求省略、權限放寬或寫入路徑。

已讀新增 `tests/authoring-review-status.test.mjs` 的完整 controller＋合成 DOM/transport 8 案，以及作者日誌 `/tmp/approval-perf-20261030/round5/review-status-tests.log` 的 8 PASS：中越 advisory 變更維持 toolbar 身分／焦點、失敗純文字與重試、案件與真正錯誤仍重畫、撤權與 fresh View、晚到 delivery。也已核對 `scripts/test-process-review-current.mjs:31–32` 僅補 querySelector advisory port 與兩個斷言，保留原 backend workflow 檢查；原 stub 缺 port 的失敗日誌保留，修正後日誌 `review-status-process-review-current.log` 為 PASS。審查者未再執行這些測試或新增瀏覽器批次。

原生 departure 20／20、100／500 項正式五對及 profiling 證據仍對應 **bf47** build；不可改標成此追加版本重新測過。主代理安排的新完整小資料五對包含 Review，結果與完整 build SHA 由本輪總報告記載。本段僅確認程式差異與既有測試證據，不先宣稱速度改善，也未驗證螢幕閱讀器對此 live region 的實機朗讀。

另完成診斷 harness 的三處 lint 修正：C probe 的 `clip` 改 const、RunTask suffix 改 `endsWith`、摘要 sanitizer 改逐 code point 將 0–31 置換為空白（保留 200 字元截斷及隱私過濾）。完整 `npm run lint` PASS，日誌 `/tmp/round5-lint-review-profiler-fixed.log`；未改產品或重跑 profiling。修正後 harness SHA-256 前12碼為 profile `795b49795345`、C probe `55e2086296bf`。

## 最終版本與五對證據收斂

已只讀逐份查看 `.sites-runtime/process-platform-round5/paired-review-readback-final/paired.json` 及全部十份 run JSON。這是全新完整五對，沒有拼接早先中斷批次：baseline server `5edd4de1e1b00987f6aa4ee35ee4ada1cb8b19926e8a32befa69af4339b07f5d`，最新候選 server **`c0a5d14599fa5a9f6a2309dac43148201d248f7439a528300da5954d59b02e49`**。兩版 fixture hash 同為 `65fe42ffbc8f1d0e10da0c0bd1bb3c952817369a21379955848db9549ee3fe60`；各五次完整 run 均 PASS，每次 42 個已完成邊界、18 checks（16 次持久回讀、effective hash、唯一寫入檢查）、14 次成功且唯一的 authoring POST、0 page errors。這批覆蓋最新 advisory 局部更新後的 Save／Submit／撤回／退回／再送／Approve 與歷史查看。

本批兩版均使用限縮為完整 authoring 解碼的新 fixture reader；產品與原 scenario 斷言未因此改變。讀取範圍、17 次舊新完整 JSON 等價證據、原 harness 失敗及修正界線見 [回讀 fixture 紀錄](ROUND5_READBACK_FIXTURE.md)。早先 `paired-review-final` 的 host bridge 失敗仍保留為 FAIL，不能由本批覆寫；本批成功也不能證明所有 Miniflare 中斷已根除。

功能通過不等於全面加速：`return-case-detail` 的五次中位／最慢由 baseline **871.0／1010.4 ms** 變成 candidate **875.4／4203.4 ms**。候選第 4 次的 4203.4 ms 原值保留，同窗口可見 advisory GET 1856.1 ms、state GET 1760.6 ms、since-state GET 565.2 ms、history GET 78.0 ms、另一次 advisory GET 538.4 ms、case GET 658.0 ms，皆為 200。這些請求可重疊，不能相加當 E2E 或把剩餘差額稱為前端 CPU；只能確認仍有長尾，完整觸發原因尚未定位。沒有刪除慢樣本、提前終止 readiness 或省略必要讀取。

最終驗證版本須分開保留：**小資料完整五對為 c0a5**；原生三選項 **20／20**、100／500 項五對與 profiling 仍是 **bf47**，本次沒有在 c0a5 重跑後三者，不補標完成。最新差異限審核 advisory 顯示與測試 reader，這是沿用既有證據的範圍理由，不是宣稱新版本所有頁面、權限、實機或全站草稿流程都已重新驗收。審查者本次只讀原始結果及補本文，沒有另跑產品、瀏覽器或效能測試。
