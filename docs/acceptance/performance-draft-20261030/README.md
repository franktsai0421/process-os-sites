最新公開來源交接：[dot 交接與完成／未完成清單](DOT_GITHUB_HANDOFF.md)。產品驗收以[製程 Round 5](PROCESS_PLATFORM_ROUND5.md)、[版本分列速度表](ROUND5_SPEED.md)為準：製程三選項已接入，其他模組仍未完成。下方為歷史階段，不能將舊狀態或不同版本測速合併為最新全面通過。

前一輪收尾（歷史）：[實測](FINAL_OPTIMIZATION.md)、[矛盾](FINAL_CONTRADICTIONS.md)、[檢查](FINAL_CHECKS.md)。當輪三選項尚未接入的描述，對製程編輯台已由 Round 5 取代。
前次續作（歷史）：[500ms 第三輪優化、51 項前後表與 dot 交接](PERFORMANCE_500MS_ROUND3.md)。原三選項離頁及各模組完整流程未完成項目仍有效；以下保留各階段證據，不能合併不同環境毫秒數。

後續效能續作：[500ms 入口優化與五輪前後驗證](PERFORMANCE_500MS.md)。原三選項草稿待完成項目仍有效。

# 初期階段紀錄（歷史；最新狀態見上方最後一輪報告）

本輪只完成過期導航取消修復；不是全站效能與草稿流程完成報告。

工作目錄 `/workspace/process-os-performance`；分支 `codex/performance-draft-20261030`；基準及 HEAD `ca6647977a8680038444ce2c1ba4e80f2343cd0a`。本輪變更未提交，建置版本為此基準加工作差異。沒有 push、PR、merge、部署或真資料讀寫。

## 修復與根因

舊導航仍在 prepare 時，使用者開始編輯；新的導航被 canLeave 拒絕，但舊 transaction 未取消。若舊 GET 返回前又恢復可離頁，舊目標可能提交。現在在相同目標去重之前檢查離頁狀態；拒絕新意圖時取消尚未 commit 的舊交易。已 commit 頁面的 readiness 仍完成。

檔案：navigation-lifecycle.mjs、delivery-navigation.js、index.html；後兩項只更新資源版本。三個新增 regression 覆蓋不同目標、相同目標、已 commit 的 readiness。未新增三選項對話框，也未更動 Save/Submit/restore API、共享資料、權限或歷史。

## 驗證

- PASS：新增重現案例在修改前失敗、修改後通過。
- PASS：navigation-lifecycle、navigation-adapters、delivery-navigation、iqc-viewer-invalidation 四個測試檔。
- PASS：十個實際 handler 隔離流程；詳見 handler-cycles.jsonl。SQLite/R2 合成 fixture，不是瀏覽器或現有站台。
- PASS：npm run lint -- --format unix、npx tsc --noEmit、帶目前 HEAD 的 npm run build（包含 post-build auth audit）、git diff --check。
- 瀏覽器整合結果另存；未測項目不得由 handler 成功推定。

## 邊界與未完成工作

全站 baseline/after 五次測速、所有內部分頁、所有草稿模組三選項與完整 UI 審核、慢網路/斷線/長時間切頁尚未完成。現有 previous-turn 流程主資料基準不能代表其他模組；本輪沒有速度改善宣稱。

共有工作草稿與 Save 快照不同。把整份 working 還原到 Save 會撤掉別人的同步修改。已向使用者提出「僅撤銷可確認屬於本次的變更，逐欄位版本/前值檢查；衝突或未知時留頁」方案，使用者已確認此方案。不可用整份 restore 或刪除草稿代替此語意。

本 worktree 的 postinstall 協作安裝拒絕 linked checkout；未修改/停用防護。依賴及本機建置可使用，但不能宣稱 npm ci 全程成功。dot 整合至其正常 standalone checkout 後執行 npm ci，保留現行防護。

## dot 重現與整合

套用完整 patch 後，執行上述四檔測試、node scripts/test-integrated-workflow-cycles.cjs、lint、tsc、build。此處沒有新增依賴、設定、schema 或資料遷移，沒有憑證。index.html 與 delivery-navigation.js 是共用重疊檔，須與權限、小幫手、IPQC-AB 入口變更語意合併，不整檔覆蓋。已有 ca66479 合併內容均保留。

瀏覽器使用系統 /usr/bin/chromium、隔離本機 Worker、合成帳號/DB/R2；不是 127.0.0.1:3000 截圖原機或 process-os-test 站台。沒有新增公開預覽。

## 本輪編譯瀏覽器結果

PASS_COMPILED_DELIVERY_BROWSER，見 browser-result.json：13 資料頁籤、11 主入口，正常登入、pop/click 歷史協調、同目標快速連點、同帳號撤權、IQC 員工編輯/保存/重新讀取、保存 ACK 遺失後單次 receipt GET 核對而不重送。403 是明確測試預期的拒寫。四輪切頁前後 global listeners 均 103、intervals 均 5；不是長時間記憶體量測。單次 timing 不是五次中位數或效能改善。

啟動說明：本環境使用 /usr/bin/chromium。原測試的預設 browser channel 不適用，因此用一般 .mjs launcher 匯入 playwright，包裝 chromium.launch 將 executablePath 指向系統 chromium、channel 設 undefined、args 加 --no-sandbox，再 import tests/sites-delivery-browser.test.mjs。不要使用 node --input-type=module stdin；本次該入口在 Worker 初始化停滯，已停止，改為檔案入口後通過。這是工具啟動調整，未刪除或放寬斷言。

差異已人工檢查：僅取消未 commit 的導航；不取消已 commit 的 readiness；相同目標亦不能穿過 dirty gate。沒有其他 reviewer 的獨立審查；全站安全性與效能不因此宣告完成。

## 已確認規則後的實作進度

新增 `public/process/owned-draft-revert.mjs` 為純撤銷規劃器，目前尚未掛入頁面/transport，不代表三選項功能已上線。只支援具有原值 guard 與已確認 receipt 的 set 欄位修改；產出正常 Apply 使用的 patches/guards/generation/expectedRevision，沒有新增免權限端點。呼叫端仍須提供可信的本次操作紀錄，並維護 owner/epoch/unknown 狀態，不能從 DOM 或任意歷史內容猜測。

`node tests/owned-draft-revert.test.mjs`：13 案通過，包含實際 shared-draft 轉移核心：撤銷己方名稱、保留他人照片，saved/saves/cases 不變；晚到寫入 revision 與 edit 權限拒絕。跨 VM 測試物件比較先 structuredClone，無放寬業務斷言。新增兩檔 oxlint 通過。新增/刪除/排序目前明確拒絕，待模組引用/墓碑規則實作，不可冒稱已涵蓋。

第二次五輪入口 profile 已保存在 entry-profile-before.json：2 工段、30 範本、40 設備；fresh browser context、HTTP cache disabled、無節流，登入至流程資料可操作總時間 1522/1141/1111/1193/1076 ms，中位 1141 ms、最慢 1522 ms。它是另一批基準，不與前一輪混算；尚無對應 after，也不推定正式資料速度。該批當時未修改 bootstrap；後續入口建置合併與執行完整性檢查見 [500ms 報告](PERFORMANCE_500MS.md)，沒有刪除授權／就緒檢查。

待完成：可信操作帳本接入、各模組本機輸入/延遲寫入處理、三選項 UI 與目標導航接合、非 set 操作、各模組逐項瀏覽器驗收與五次效能前後比較。這一階段尚非最終 dot 發布交付。
