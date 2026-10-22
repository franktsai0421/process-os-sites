# IPQC 本機實作與隔離驗收 — 2026-10-06

**結論：四項本機程式已實作；C 完整隔離通路通過。AB 真實成功分配仍未測，不能宣稱整包 12 項全部 PASS。**

工作目錄 `<WORKSPACE>/中控系統`；分支 `codex/ipqc-ab-local`；HEAD `84278d837898f4e836ec003f7adb67ff38f785c8`。開始時 33 個追蹤檔案已有修改，另有原始 KD／參考檔案。未還原、commit、push、merge 或部署。19 個原有修改檔案內容 hash 完全未動，14 個於原內容上做本批必要修改；見 [保全比較](<evidence/20261006/baseline-comparison.json>)、[開始時修改檔清單](<evidence/20261006/initial-git-status.txt>)、[相對本次開始的 diff](<evidence/20261006/task-vs-start.patch>)。新增檔案另列於後面。

**實際來源與限制**

來源是日常 Local D1／R2 的唯讀擷取，revision 409；結束檢查 revision 409。擷取僅取指定業務 keys，不含帳號密碼／cookie／token。隔離 DB 為 `node:sqlite :memory:`、R2 為記憶體 Map；測試使用新建的測試身分，所有保存、送審及核准只落在此副本。品質來源保持擷取狀態。

- C 真實來源：核准版 `72a3dc5c-762e-440c-b5eb-0c73e008d40d`，產品 `3012902`、工段 `C-TIEN`、項目 `ipqc-c-item-row-2`，標準 `14.50mm ± 0.05mm`。兩個標示「隔離驗收」的製程方塊作為新關聯的測試目標。
- AB 所有 24 scope 都沒有 active 核准來源；`A:BORUAXE1021` 有舊 superseded／draft，但沒有偷改成 approved。來源不可選提示有實測；正向分配／正引用需合法核准來源後再補驗。
- 一般設備／流程媒體未全部複製二進位；IPQC 原有檢查照片已複製。多圖控制測試另外暫選兩張驗收截圖，最後取消，未保存為品質標準。
- 日常 Local 的業務寫入、正式發送及實體手機未測。內建瀏覽器能讀畫面但點擊／Enter 未生效，功能驗收改以專案既有 Playwright headless Chrome 測試方式進行。全部截圖均來自實際本機 SPA，非設計稿。

**現況差異與保存邊界**

原本流程設定只有基本內容及自由文字 IPQC；C 表單檢具／頻率平行右欄，無製程反向引用；畫布與彈窗顯示模板預設媒體。本批新增同層分頁、核准項目分配與反向讀取，C 改單欄，並只移除指定預設媒體展示。

勾選與基本欄位先留於彈窗暫存物件，切分頁不清空。取消用原有快照還原。套用走既有共享同步，成功才關閉；同步衝突留表單供處理。反向引用只讀伺服器已保存的 working（標明已同步未 Save）。手動 Save 建立快照，再 Submit 固定送審內容；核准才改 active。移除 working 關聯不影響已核准快照。沒有第二套保存 API。

`ipqcAssignments[]` 只新增於既有 operation JSON，內容為 source／scope／itemId／sourceVersionId／productCodes。占用鍵不含來源版本，以 source+scope+stable itemId 判斷；後端在最終整份工段工作內容驗證，CAS 重試也不能繞過。不存在或條件變動的舊連結保留並列待補。無 schema／migration／正式資料轉換。

**交接包 12 項**

| 項目 | 結果 | 實際證據與界線 |
| --- | --- | --- |
| 01 | PASS | C-TIEN-01／02 固定目前方塊；A 自動 AB、C 自動 C；無來源切換器。 |
| 02 | PASS | 長越文流程名稱與勾選跨分頁保留；取消後名稱／勾選還原，後端引用數維持 0。 |
| 03 | PASS（C）／未測（AB 成功） | C 勾選→套用→已同步未 Save→手動 Save→重整→重開保留；第二節說明 AB 限制。 |
| 04 | PASS | 真實 C 不同項目分給不同方塊，同項目顯示 C-TIEN-01 占用；同錯誤代碼不同 ID 與 AB 多產品另有明標 synthetic 的演算法測試。 |
| 05 | 未測（完整 AB/C 成功配對） | 真實 C 核准項目通過；全部 24 個 AB scope 沒有 active 核准版，未自動核准或用假標準代替。AB 多產品只有獨立 synthetic 單元測試。 |
| 06 | PASS | 兩個獨立 Session 同時分配同項目到不同方塊：一筆 200、一筆 409，重新讀取只有一個占用者，成功者內容仍在。 |
| 07 | PASS（位置與 C 真實引用）／未測（AB 正引用） | AB/C 卡片、查看、修改均位於頻率正下方；C 顯示成功儲存的 V2 方塊引用，AB 顯示真實無引用狀態。 |
| 08 | PASS | 未套用與取消不產生引用；在核准後新草稿移除項目，核准引用仍存在。 |
| 09 | PASS（隔離操作） | C 的 9 組主欄位順序有 DOM 斷言；多圖、備註、位置、排序、CPK、batch/time 頻率及檢具選擇器實際操作，取消後原內容不變。未替使用者核准品質修改。 |
| 10 | PASS（程式／資料／元素保留） | 指定預設媒體與舊文字欄移除；下拉、機器及作業圖片元素保留；真實 UI Save 後 legacy ipqc 仍為原值。隔離副本未完整攜帶一般設備媒體二進位，相關縮圖可能顯示原有 fallback；未據此宣稱所有媒體檔案的載入都通過。 |
| 11 | PASS | 實際 handlers：Save→固定 Submit→獨立 reviewer 核准→核准 payload 保留兩筆分配；未分配留固定待補且可核准，pending lock 不變。入口讀取 payload 驗證通過；未正式發送或操作播放台。 |
| 12 | PASS（瀏覽器視窗模擬） | 1366×768、1920×1080、390×844 實際 Chrome headless 頁面操作與截圖；長越文、中文介面、鍵盤分頁、捲動、底部按鈕及多圖。非實體 iPhone 驗收。 |

**執行檢查**

- PASS：`test-process-ipqc.cjs`：真實 C、AB 未核准拒絕、雙 Session 競爭、Save/Submit/Review、待審鎖、原引用保留、偽造來源拒絕、legacy 防重複與唯讀線別權限。
- PASS：`test-process-ipqc-ui.cjs` 核心操作；`--extended` 圖片／原欄位／讀取失敗；`test-process-ipqc-ui-extra.cjs` AB 位置、媒體元素、雙語、鍵盤與尺寸。
- PASS：既有 `test-process-authoring-v3.cjs` 共享草稿回歸、`tsc --noEmit`、新增程式定向 oxlint。
- FAIL（既有基線）：把 legacy `app/api/shared-state/route.ts` 全檔加入嚴格 oxlint 時，其既有 `any`／unknown 字串化規則不通過。本批新增程式 lint 已修正並通過，未擴大重寫 legacy 型別。
- 未測：成功真實 AB、多產品真實 AB 成功路徑、全部一般媒體 binary 載入、日常 Local 寫入、正式發送／播放、實體手機。

測試中遇到的 fixture 初始化旗標、代理 Origin 重複及測試 selector／非同步等待問題已修正；不把修正前失敗輸出稱為產品通過。核心 UI 曾完整 exit 0；新增案例以 `--extended` 續跑 exit 0，避免重複無關測試。

- [backend-test.log](<evidence/20261006/backend-test.log>)
- [authoring-regression.log](<evidence/20261006/authoring-regression.log>)
- [ui-core.log](<evidence/20261006/ui-core.log>)
- [ui-extended.log](<evidence/20261006/ui-extended.log>)
- [ui-extra.log](<evidence/20261006/ui-extra.log>)
- [typecheck.log](<evidence/20261006/review2/typecheck.log>)
- [lint-new.log](<evidence/20261006/review2/lint.log>)

**修改檔案**

實作：

- [lib/process-ipqc.ts](<<WORKSPACE>/中控系統/lib/process-ipqc.ts>)
- [app/api/process-ipqc/route.ts](<<WORKSPACE>/中控系統/app/api/process-ipqc/route.ts>)
- [lib/process-authoring-workflow.ts](<<WORKSPACE>/中控系統/lib/process-authoring-workflow.ts>)
- [app/api/shared-state/route.ts](<<WORKSPACE>/中控系統/app/api/shared-state/route.ts>)
- [public/process/process-ipqc.js](<<WORKSPACE>/中控系統/public/process/process-ipqc.js>)
- [public/process/process-ipqc.css](<<WORKSPACE>/中控系統/public/process/process-ipqc.css>)
- [public/process/app.js](<<WORKSPACE>/中控系統/public/process/app.js>)
- [public/process/system-upgrade.js](<<WORKSPACE>/中控系統/public/process/system-upgrade.js>)
- [public/process/version-workflow.js](<<WORKSPACE>/中控系統/public/process/version-workflow.js>)
- [public/process/version-draft-ui.js](<<WORKSPACE>/中控系統/public/process/version-draft-ui.js>)
- [public/process/ipqc-ab.js](<<WORKSPACE>/中控系統/public/process/ipqc-ab.js>)
- [public/process/ipqc-c.js](<<WORKSPACE>/中控系統/public/process/ipqc-c.js>)
- [public/process/ipqc-c.css](<<WORKSPACE>/中控系統/public/process/ipqc-c.css>)
- [public/process/index.html](<<WORKSPACE>/中控系統/public/process/index.html>)

隔離測試工具：

- [scripts/ipqc-assignment-fixture.cjs](<<WORKSPACE>/中控系統/scripts/ipqc-assignment-fixture.cjs>)
- [scripts/ipqc-isolated-server.cjs](<<WORKSPACE>/中控系統/scripts/ipqc-isolated-server.cjs>)
- [scripts/test-process-ipqc.cjs](<<WORKSPACE>/中控系統/scripts/test-process-ipqc.cjs>)
- [scripts/test-process-ipqc-ui.cjs](<<WORKSPACE>/中控系統/scripts/test-process-ipqc-ui.cjs>)
- [scripts/test-process-ipqc-ui-extra.cjs](<<WORKSPACE>/中控系統/scripts/test-process-ipqc-ui-extra.cjs>)

現行文件／交接：

- [docs/specs/current/PROCESS_WORKFLOW.md](<<WORKSPACE>/中控系統/docs/specs/current/PROCESS_WORKFLOW.md>)
- [AI_CONTEXT/modules/PROCESS.md](<<WORKSPACE>/中控系統/AI_CONTEXT/modules/PROCESS.md>)
- [AI_CONTEXT/modules/QUALITY.md](<<WORKSPACE>/中控系統/AI_CONTEXT/modules/QUALITY.md>)
- [AI_CONTEXT/models/CORE.md](<<WORKSPACE>/中控系統/AI_CONTEXT/models/CORE.md>)
- [AI_CONTEXT/DATA_MODEL.md](<<WORKSPACE>/中控系統/AI_CONTEXT/DATA_MODEL.md>)
- [AI_CONTEXT/CHANGELOG.md](<<WORKSPACE>/中控系統/AI_CONTEXT/CHANGELOG.md>)
- [HANDOFF.md](<<WORKSPACE>/中控系統/HANDOFF.md>)
- [docs/ipqc-reference/20261006-acceptance.md](<<WORKSPACE>/中控系統/docs/ipqc-reference/20261006-acceptance.md>)

**實際前後畫面／操作證據**

- [before-process-basic-1366](<evidence/20261006/before-process-basic-1366.png>)
- [after-process-machine-basic](<evidence/20261006/after-process-machine-basic.png>)
- [after-process-basic-1366](<evidence/20261006/after-process-basic-1366.png>)
- [after-process-ipqc-1366](<evidence/20261006/after-process-ipqc-1366.png>)
- [after-occupied-1366](<evidence/20261006/after-occupied-1366.png>)
- [after-ab-no-approved-source](<evidence/20261006/after-ab-no-approved-source.png>)
- [before-c-editor-1366](<evidence/20261006/before-c-editor-1366.png>)
- [after-c-editor-top-1366](<evidence/20261006/after-c-editor-top-1366.png>)
- [after-c-editor-bottom-1366](<evidence/20261006/after-c-editor-bottom-1366.png>)
- [after-c-editor-bottom-1920](<evidence/20261006/after-c-editor-bottom-1920.png>)
- [after-c-editor-bottom-390](<evidence/20261006/after-c-editor-bottom-390.png>)
- [after-c-reference-card-1366](<evidence/20261006/after-c-reference-card-1366.png>)
- [after-c-view-reference-1366](<evidence/20261006/after-c-view-reference-1366.png>)
- [after-c-multiphoto-1920](<evidence/20261006/after-c-multiphoto-1920.png>)
- [after-reference-read-failure](<evidence/20261006/after-reference-read-failure.png>)
- [after-ab-reference-card](<evidence/20261006/after-ab-reference-card.png>)
- [after-ab-view-reference](<evidence/20261006/after-ab-view-reference.png>)
- [after-ab-edit-reference](<evidence/20261006/after-ab-edit-reference.png>)
- [after-process-ipqc-1920](<evidence/20261006/after-process-ipqc-1920.png>)
- [after-process-ipqc-390](<evidence/20261006/after-process-ipqc-390.png>)

**交接原始附件讀取**

依序讀取 00_README、01_CODEX_PROMPT、02_SCREENSHOT_INDEX，並以圖片工具逐張開啟全部 16 張原圖確認畫面與紅框。不可讀附件：無。以最新文字為優先。

- image(20261006-040142).png
- image(20261006-040822).png
- image(20261006-040837).png
- image(20261006-041044).png
- image(20261006-041403).png
- image(20261006-041729).png
- image(20261006-042024).png
- image(20261006-042206).png
- image(20261006-042239).png
- image(20261006-042252).png
- image(20261006-042302).png
- image(20261006-042312).png
- image(20261006-042709).png
- image(20261006-043157).png
- image(20261006-043213).png
- image(20261006-043351).png

**本機確認方式**

[隔離製程編輯頁](http://127.0.0.1:3021/process/?system=process&view=editor)；選 C → TIEN → C-TIEN-01，開啟 IPQC，已有一筆成功 Save 的真實來源關聯。

[隔離 IPQC-C 頁](http://127.0.0.1:3021/process/?system=quality&view=data&dataTab=quality-ipqc-c)；搜尋 3012902 → C-TIEN → 第一個錯誤代碼，查看項目頻率下的 V2 草稿引用。這是記憶體副本，停止伺服器後測試修改消失，與日常 Local 分開。

伺服器停止時，可由專案目錄執行 `node scripts/ipqc-isolated-server.cjs --source <USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/isolated-source.json --port 3021`。原始業務擷取副本只留本機，不複製到審查證據；重新啟動需重新套用驗收關聯。

**獨立審查與剩餘風險**

已收到 C2C 第 1 輪 NEEDS_CHANGES。第 2 輪修正與定向驗收見 [審查修正紀錄](20261006-review2.md)；尚待獨立複審，不稱審查通過。AB 真實正向分配／反向引用、一般媒體完整載入、日常 Local 寫入及實體手機仍未測。
