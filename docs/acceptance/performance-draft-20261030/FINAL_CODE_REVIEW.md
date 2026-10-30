# 最後一輪：限定範圍獨立程式碼審查

> 歷史輪次紀錄（本輪現況已更新）：本文件保留前一輪的量測、發現與當時限制。製程三選項接線、未知逆操作恢復、原生瀏覽器與最新審查請以 [Round 5 獨立整合審查](ROUND5_INDEPENDENT_REVIEW.md) 及 [本輪總報告](PROCESS_PLATFORM_ROUND5.md) 為準；不要沿用此處舊的「尚未接線」狀態。


2026-10-30，審查者 `review_round3`。本次四項產品修改與下列直接相依中，**未發現尚未處理、可具體指出的新增回歸**。此結論是程式碼審查，不代表全站效能已低於 500 ms、所有草稿流程完成或瀏覽器驗收全部通過。實測結果以主代理最後配對報告為準。

工作目錄 `/workspace/process-os-performance`；分支 `codex/performance-draft-20261030`；基準／HEAD `ca6647977a8680038444ce2c1ba4e80f2343cd0a`。審查的是包含既有未提交修改的工作目錄。遵循根目錄 AGENTS.md，保留他人工作，只新增本文件及更新本人維護的 [矛盾盤點](FINAL_CONTRADICTIONS.md)；未修改產品、執行基準測試、push、建立 PR 或發布。

| 本輪修改 | 獨立查核與結論 |
| --- | --- |
| 主資料有效版本比較 | [master-workflow.ts](../../../lib/master-workflow.ts) 第 40–48 行、[shared-draft.ts](../../../lib/shared-draft.ts) 第 61–76 行：只將 `matchingActive` 的兩次 canonical JSON 字串化換成既有 `sameDraftValue`。AB／C／PROCESS 都仍先嘗試 workflow 指定且內容相符的 approved 版本，再尋找首個內容相符的 approved 版本；找不到仍回 409。JSON 輸入的物件 key 順序不影響比較，陣列順序、欄位存在與純量型別仍有意義。沒有變更 Save、Submit、自審、授權或 CAS。 |
| 比較器的 prepared model 邊界 | [state-records.ts](../../../lib/state-records.ts) 第 29、145、175、210 行：當次解碼對 aggregate／必要 body 保留 SHA 檢查，body alias 來自當次 cache 中的已解碼 JSON。相同物件可直接判等，不是用未驗證 reference 跳過儲存校驗。舊字串路徑仍 JSON.parse；此判等結論限儲存可產生的 JSON 值，未對任意含函式、循環或稀疏陣列的 JavaScript 物件擴大承諾。 |
| 主資料橋接減少複製 | [master-shared-client.js](../../../public/process/master-shared-client.js) 第 49–71 行：Apply 保留 before／next，Save 保留 before，其餘動作省略未使用的深拷貝。before 與 generation 仍在 auto-Begin 的 await 前擷取；Save 的表單版本擷取與 flush 時點未移動，避免開表單競態改變基值。Apply 的 identify／diff、群組成員 guards、連動 PROCESS 核准讀取、unknown／busy／失敗處理仍走原路徑。Save 的「不包含尚未套用表單」規則未改變，也未因此完成儲存並離頁。 |
| 製程編輯台完成時點與重畫 | [process-authoring-v3.js](../../../public/process/process-authoring-v3.js) 第 9–13、38、99–127、341 行：只抑制同一個 readiness 等待的 mandatory read 內重複 repaint；真正讀取、adopt 與最後畫布 render 仍會完成才 resolve。同上下文同時呼叫共用一個 promise；帳號／登入代次／delivery／category／line／tab／reset／requiresReload 改變時不能把舊結果算作新頁 ready。只有既有且屬於目前身份／delivery 的 flow 可避免新的 read。一般 polling、approval/process 與非同一個 read 的後續更新仍自行 repaint；advisory inspection 並非可操作畫布必要條件，沒有假稱送審檢查已完成。 |
| 新載入與使用者互動競態 | 同檔第 118–125 行：mandatory read 已 adopt、但使用者已開表單／拖曳／聚焦欄位或更改畫布時，保留 `editorAwaitingPaint` 並拒絕 ready；下一次呼叫不會只因已有 flow 就誤稱完成。清除互動後可重新 render；navigation.reset 清除此上下文的 gate。既有已顯示且 ownFlow 正確的畫布仍可保留正在操作的內容。 |
| 僅撤銷本人未存修改的 planner | [owned-draft-revert.mjs](../../../public/process/owned-draft-revert.mjs) 第 27–63 行：補入 `unchanged === false`、本人收據連續 revision、最後收據 revision 等於目前 flow revision，堵住他人將值改走又改回的 ABA 漏洞，包括相同帳號另一 client。先在私有副本反推，失敗不動呼叫者內容；仍只支援有明確前值 guard 的 set，回傳目前 expectedRevision，後續必須走正常 Apply 授權／CAS。沒有新增直接寫入捷徑。 |

另針對原生線別／產品選單查讀 [editor-line-selection.js](../../../public/process/editor-line-selection.js) 第 14–26 行、[app.js](../../../public/process/app.js) 第 2285–2290 行、[process-editor.js](../../../public/process/process-editor.js) 第 47–58 行，以及 [delivery-navigation.js](../../../public/process/delivery-navigation.js) 第 52–62、67–92、136–140 行。現行線別／類別／產品選取會同步 render，不自行改 delivery generation，也不直接呼叫 `readyForEditor`；正常已載入畫布的選單操作不會自行產生新的 mandatory read。這個讀碼結論不能取代主代理另跑的原生選單瀏覽器回歸。

仍須明列的限制與驗收邊界：

- 若使用者在首次 mandatory read 期間先聚焦新頁的 input/select，新的 gate 會拒絕完成並留待重試；這是保護未完成畫布的保守行為，應以慢網路、鍵盤、原生 select 的真實瀏覽器操作確認提示與恢復順暢。本審查沒有測實體 Safari/iPhone，也沒有獨立操作這段 UI。
- planner 目前要求連續的本人寫入，所以其他人後續或交錯寫入**不同欄位**也會拒絕放棄。它仍依賴呼叫端完整可信的操作帳本，不能驗證收據真偽或偵測省略前綴；不支援新增／刪除／排序。產品尚未接上全模組三選項 UI，不能將 planner 測試計為離頁功能完成。
- 權限／未知結果／歷史保護仍依賴原路徑。四項改動未新增授權規則或快取；本審查沒有重新驗證全站每個權限組合、撤權時序、模組審核 UI、長時間記憶體或正式資料速度。
- [矛盾盤點](FINAL_CONTRADICTIONS.md) 所列 Save 與最新未套用輸入、Submit 固定快照、readonly dialog 導航阻擋、三選項未接線及逐模組未完成驗收仍須保留，不能因本輪效能改動而消除。

本次讀過的測試及其他代理既有執行紀錄：

| 證據 | 查核到的範圍；不是本審查者執行 |
| --- | --- |
| [test-master-baseline-equality.cjs](../../../scripts/test-master-baseline-equality.cjs)；本機 `perf-500ms-round4/master-baseline-equality.json` | 既存紀錄為 PASS、38 個比較／故障案例；candidate hash 與下表相同。涵蓋三 scope、prepared／舊路徑、active 指標 fallback、內容／型別／陣列差異及真實 decoder SHA 故障。這是 adapter／decoder 程序內證據。 |
| 本機 `perf-500ms-round4/master-workflow-cycles.json` | 既存紀錄為三個主資料 scope 的實際 route handler 隔離循環 PASS，含固定 Save 截止點、撤回／跨帳號退回／核准、並行衝突、停用帳號及歷史保護；不是編譯後網路或瀏覽器 UI 證據。 |
| [master-shared-clone.test.mjs](../../../tests/master-shared-clone.test.mjs) | 已讀六組測試，涵蓋實際 bridge 對照原版、8 actions × 3 scopes、auto-Begin／flush 開表單競態、guards、unknown／busy 與 409／503。實作者回報六組 PASS。 |
| [authoring-readiness-render.test.mjs](../../../tests/authoring-readiness-render.test.mjs) | 已讀完整 controller 搭配延遲 transport／最小 DOM 的測試，涵蓋首次／並行 readiness、polling、失敗重試、九種上下文失效與四種採納後互動。它會計算 render，不能證明真實瀏覽器每張圖已完成或原生控制項 focus 行為。 |
| [owned-draft-revert.test.mjs](../../../tests/owned-draft-revert.test.mjs) | 已讀最終 26 案，包含實際 kernel 的跨帳號／跨 client ABA、交錯／省略中段、ancestor replacement／restore、無變更收據／重播、Save 邊界與他人 no-op 不增 revision。實作者回報 26 PASS，原 planner 對照為 16 PASS／10 FAIL。 |

審查者本次沒有執行上述產品測試、lint、型別檢查、建置或效能量測。只驗證本文／矛盾盤點的本機連結、格式及審查版本 hash。更早 loader、bootstrap、master-review、PROCESS prepared serialization 與 references route 的限定審查見 [REVIEW_ROUND3.md](REVIEW_ROUND3.md)；該文件保留當時 hash，本文件的 master-workflow hash 才是最後一輪判等修改版本。

```text
a5b5e6214d6dc944d34c074bce3d69aef74b715a9b679049fe40a377d9f913bc  lib/master-workflow.ts
cf3428b1c0be3d3dfdea2992745d4651da15318e7c9ab43f108ed28d0d3ff7a9  public/process/master-shared-client.js
c2a97c4943eff54e14089971364e618ca9be05253922cfeb1fa7316bb54126dc  public/process/process-authoring-v3.js
a79811ea55ab4ce2674a82339ab00ad2bdf384a1c5724bd88646f35be9eb32f1  public/process/owned-draft-revert.mjs
1643d0cbe8dbf30550db7f41cdbf9adda36630d0730cd15bb418105442b8a8d6  tests/master-shared-clone.test.mjs
7ee07d9058048813dd9c6a7e3842d6afeeaa11fcf1aef790f0f79aaa6b853573  tests/authoring-readiness-render.test.mjs
3bea90f04958f175d041a06bfb1c868f94854bef9f3c093ca113ade9933ad228  tests/owned-draft-revert.test.mjs
fa50624a048f2f5c9528a12283badca66de2b1ad823fbff0e908c8c06956b113  scripts/test-master-baseline-equality.cjs
```
