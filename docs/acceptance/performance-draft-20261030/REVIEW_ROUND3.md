# 第三輪效能修改：獨立程式碼審查

2026-10-30，審查者 `review_round3`。結論：本輪最終程式差異與下列直接相依中，未發現尚未處理的具體新增回歸。這是限定範圍的程式碼審查，並非全站安全、效能達標或瀏覽器驗收證明。

工作目錄 `/workspace/process-os-performance`；分支 `codex/performance-draft-20261030`；HEAD／基準 `ca6647977a8680038444ce2c1ba4e80f2343cd0a`。審查對象包含工作目錄內未提交修改；HEAD 本身不代表本次候選內容。保留既有修改，審查者只新增本文件，未修改產品程式、執行寫入測試、push、建立 PR 或發布站台。

| 審查範圍 | 查核依據與結果 |
| --- | --- |
| Excel 按需載入 | [spreadsheet-loader.js](../../../public/process/spreadsheet-loader.js) 第 9、25、36、60 行：資源請求共用一個 Promise；載入失敗可重新取得程式資源；操作檢查帳號、登入代次、資料交付代次、路由、選取及元素存活。操作開始後維持單飛至原 handler Promise 完成。失敗保留檔案選取；既有處理函式已開始後不提供資料操作重送捷徑。 |
| Excel 使用端 | 逐一查讀 [app.js](../../../public/process/app.js)、[master-data.js](../../../public/process/master-data.js)、[master-admin-ui.js](../../../public/process/master-admin-ui.js)、[bom-workspace.js](../../../public/process/bom-workspace.js)、[bom-excel.js](../../../public/process/bom-excel.js)、[fqc-excel.js](../../../public/process/fqc-excel.js) 的修改及 workbook helpers。現有包裝入口讀取 `event.target` 或閉包，不依賴 dispatch 結束後失效的 `event.currentTarget`，也沒有需要同步呼叫的 `preventDefault()`。BOM 與線別匯入在載入後重新檢查適用權限／可編輯狀態。 |
| 共同入口與預載 | [index.html](../../../public/process/index.html) 第 17 行、[bootstrap.js](../../../public/process/bootstrap.js) 第 11、66、76 行：兩個政策模組沒有相互初始化依賴，平行 import 可保留原結果；它們的預載內容只有程式碼。提前執行的 `shared-state.js` 不依賴尚未建立的 body 或頁面元素。資料啟用、登入、授權投影與 catalog 檢查仍先於業務腳本預載／執行。navigation 預載 URL 與既有 import 相符。 |
| 上輪腳本合併的相依 | [process-scripts-build.mjs](../../../lib/process-scripts-build.mjs) 保留頂層宣告與 directive 邊界，排除私有種子及 vendor 路徑；新 loader 可獨立執行。bootstrap 要求 bundle 尾端完成標記，避免只因 script onload 就認定所有註冊完成。本次沒有重做上輪全部 bundler 驗收。 |
| 版本確認平台繪製 | [master-review.js](../../../public/process/master-review.js) 第 24、32、65 行：版本索引只存在於單次讀取，保留 scope、重複 ID 首筆與非字串 ID 的舊比對行為；清單、選取與待審數使用同批資料。`Intl.DateTimeFormat` 只共用於單次 render，保留雙語、無效／缺少日期及 fallback 行為。沒有新增跨帳號、權限或版本的資料快取。 |
| PROCESS 寫入序列化 | [master-workflow.ts](../../../lib/master-workflow.ts) 第 31、54、67 行：`serializeModel` 僅供 PROCESS，沿用相同 root 組裝；AB／C 保留字串路徑。查讀 [versioned-shared-workflow.ts](../../../lib/versioned-shared-workflow.ts) 第 194–234 行及 [state-records.ts](../../../lib/state-records.ts) 第 85–132 行，確認仍經過當次身份／權限、命令驗證、重播收據、revision 檢查與資料庫 CAS；普通 encoder 仍拒絕 partial read 及不受信任 immutable reference。[process-master-references.ts](../../../lib/process-master-references.ts) 確實不讀 `masterDataControl`，省略 PROCESS context 的重複字串化未刪除引用來源。 |

審查過程發現並已由實作者修正：

- Loader 原先會在完成時恢復舊 `disabled` 值，可能解除原 handler 新設的業務鎖定；目前只建立／移除自己的狀態訊息，沒有改動按鈕鎖定值。
- 舊操作被新選取取代後，若選取回到原值，舊 owner 判斷可能再次成立；目前第 48 行同時核對操作 record 身分，已被取代的操作不能復活。第 63–69 行檢查檔案物件身分，只有尚未開始的舊操作可被新選取取代。
- 新增等待期間的同頁選取、檔案重選及線別匯入權限複查已補入；已開始的操作不因連點而再次執行。

已閱讀的驗證程式包括 [loader 六組測試](../../../tests/spreadsheet-loader.test.mjs)、[Excel 瀏覽器測試](../../../tests/spreadsheet-lazy-browser.test.mjs)、[審核清單等價性測試](../../../tests/master-review-render-performance.test.mjs) 及 [prepared model 比較程式](../../../scripts/test-master-prepared-model.cjs)。它們分別涵蓋失敗重試／操作所有權、真實 BOM 下載及遲到載入、HTML 等價與更新、完整內容／歷史／重播及引用阻擋。**審查者未執行上述測試，也未執行 lint、型別檢查、建置或效能量測；執行結果應以主代理另附的原始紀錄為準。**

未測／範圍限制：未連線既有雲端測試站、未使用正式資料、未獨立操作瀏覽器、未驗證實體 iPhone／Safari 下載限制；未重做所有草稿模組、長時間記憶體、真實多人並行與離頁流程。FQC 的 `exportWorkbook` 首次需等待資源，其現有頁面沒有呼叫者；目前停用的非 BOM Excel 入口不能列為已驗收功能。上述限制不以單元測試或程式碼閱讀補算完成。此輪沒有 schema／遷移修改；未對其他任務或上輪全部差異作整體批准。

審查時核心檔案 SHA-256（後續若變更，須重新核對相關部分）：

```text
c143a5255cc5cec054c80a4f58c7fea97c7a75696d50d4e1f6db37f901a980ee  public/process/spreadsheet-loader.js
205e7cbbb7e32504f2276efef42a3060eb4c8fe43d65393d308d2b31aa65872e  public/process/bootstrap.js
9e9363a9490ae486f4cc83fe9c2d291d87b8e256cd42a2d5e46a6bfee45b0c76  public/process/index.html
51e33fe3c953ea8a1197104a5544112dc13411141d814ce8c65cb9055a545028  public/process/master-review.js
23cc40c214df17880075147292b4c9be86e7ba1693df9ed164fa3435a3964a80  lib/master-workflow.ts
```

補充審查：最後加入的流程引用查詢優化（同日）。

查讀 [master/references/route.ts](../../../app/api/master/references/route.ts) 第 8、14 行、[process-state.ts](../../../lib/process-state.ts) 的 `readState`／`identity`／`can`、[state-records.ts](../../../lib/state-records.ts) 第 203、210 行及引用掃描直接相依。此修改指定 `modelKey: 'masterDataControl'`，使用同一次解碼產生的模型，省略解碼後字串化與 route 再解析。模型、body cache 仍限當次 request；沒有新增跨請求資料或權限快取。

未發現此補充修改造成的具體新回歸。讀取 key 範圍與各模組 `deferVersions` 判斷保持相同；所需 aggregate／body 仍經既有讀取與 SHA 驗證，載入或解析失敗仍回覆 `REFERENCE_CHECK_FAILED`／503。前置與完整 state 的身份／`templates.view` 檢查都保留，`editor.view` 明細遮蔽及 working 優先於 active 的選取也保留。舊 inline／chunked／R2 儲存格式沒有 prepared model 時仍使用原 JSON 解析。`processMasterReferences` 讀取製程編輯、發送等引用來源，不依賴 `masterDataControl` 字串；本 route 沒有修改模型或寫入儲存。

另讀 [test-master-references-prepared.cjs](../../../scripts/test-master-references-prepared.cjs) 及既存本機紀錄 `.sites-runtime/perf-500ms-round2/master-references-prepared.json`；紀錄中的 candidate SHA 與目前 route 相符。紀錄列出 13 個 PASS 案例，測試程式比較前後完整回覆及讀取順序、確認沒有寫入，涵蓋引用來源、template alias、working 優先、明細限制、無身份／無權限／停用帳號、無效或不存在的目標、舊 inline 格式、aggregate checksum 損壞與引用 JSON 損壞。這些是其他代理已執行的紀錄，審查者未重新執行。

| 既存 handler 量測紀錄 | 次數 | 修改前中位／最慢 | 修改後中位／最慢 |
| --- | --- | --- | --- |
| 合成小型 catalog | 每版本 5 次，交錯執行 | 6.9／7.7 ms | 6.6／12.0 ms |
| 同資料加合成照片 | 每版本 5 次，交錯執行 | 27.8／39.0 ms | 15.5／21.6 ms |

上述為實際 route handler 搭配記憶體 SQLite／R2 的程序內時間，含 instrumentation；不是 HTTP、瀏覽器或既有雲端測試站時間。小型 catalog 的最慢一次增加，不能聲稱所有情境均加速。兩情境的紀錄均為 9 次 GET、0 次 PUT；master root 字串化由 1 次降為 0 次。紀錄的 `masterStringifiedCodeUnits` 是 UTF-16 長度，不能當作網路傳輸位元組。本補充沒有驗證真實儲存延遲、請求中途撤權或每一種 body 故障；不改變前述未測限制。

```text
f9b44bfe07df0c4a1e3751fdeb9e04b627999f15cf2f390cd16e3c65f94bd796  app/api/master/references/route.ts
2ddf115f66f070985e8c626a68a32bb7b04519cc589df9debbe422a55fd06299  scripts/test-master-references-prepared.cjs
7d6d764288b3e904bc4b952bde2381f8481e83f509ff8bebe9c8102f52a19b7f  .sites-runtime/perf-500ms-round2/master-references-prepared.json
```
