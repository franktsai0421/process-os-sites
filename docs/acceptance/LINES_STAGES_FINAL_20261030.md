# 線別與工段 CLOUD 30102026：公開原始碼交接

線別／工段的範圍切換、編輯失敗重試、引用刪除保護及 saved 送審確認已修正。本次不包含舊資料自動轉換；原來源提出的首次轉換專用程式與驗收已依決定移出。此分支供 DOT 審查並建立 PR；沒有合併、部署、正式資料操作或其他 AB/C 任務整合。

## 版本與範圍

- 目標倉庫：`franktsai0421/process-os-sites`（公開）。交接分支：`handoff/lines-stages-final-20261030`。
- 原始基準：`a870fc5882a1ec6ebe3308e540c1c69282e05dc1`。
- 原本機 HEAD：`926b7d4adf942e3b25c968441f0b5e291fe96969`，另有後續未提交修改。來源封存識別：`LINES-CLOUD-30102026-R5-FINAL-20261030T112552Z`。
- 整理前遠端 main：`ca6647977a8680038444ce2c1ba4e80f2343cd0a`，僅唯讀核對，沒有納入此分支。DOT 需自行檢查與最新 main 的衝突。
- 本分支以原始基準建立單一乾淨交接提交，內容包含下列五個本機提交的必要程式／測試，以及其後所有本任務程式／測試修改。沒有將原五個提交直接作為祖先，避免其產生報表進入本次推送歷史；原提交與未提交工作樹完整保留在本地。

|原本機完整 SHA|內容|
|---|---|
|`ee84d0b34f6fa68f54a621a9c659dd2de818ac5c`|移除新增線別入口、阻擋連帶刪除子工段|
|`fd47fb46fee0ea16e66c2b4b065a53b109b9e1ad`|失效範圍回應隔離與驗收|
|`a6b41a3838b9604f6694021fa57a7f65f660e490`|編輯拒絕後保留輸入並允許重試|
|`ea17970bddf831aab09ac2031d0469a6e216f325`|引用明細權限與原生審核恢復|
|`926b7d4adf942e3b25c968441f0b5e291fe96969`|前期交接與隔離預覽清理|

只納入必要程式、合成測試產生器及本交接說明；不提交真資料、DB/R2、帳號匯出、密碼／憑證、ZIP、截圖、build/cache 或測試產生的 JSON/CSV/HTML/Markdown 表格。原本地證據及 ZIP 保留。此文件中的少量摘要是交接說明，不是業務資料。測試帳號／密碼於隔離執行時產生，沒有正式帳號憑證。

## 本次儲存格式界線

正常 Begin／Apply／Save 使用既有 encodeValues，不將 legacy 自動轉成 records-v1。移除本分支新增的首次轉換 helper、initializer 專用參數及轉換驗收；state-records codec 與目前 main 相同。既有 records-v1 解碼、更新與 legacySources 保留，沒有實際資料或歷史刪除。原轉換設計可查來源提交 `2203d5869ae14a756dbab18959689bd855936a5b`，不作為本次交付功能或驗收要求。

legacy 仍沿既有整份 inline／whole-R2 路徑，仍有處理全部歷史的成本。本次沒有採用原含自動轉換候選的 600 產品速度數字；不宣稱相同加速。格式保留驗收見 `scripts/test-master-legacy-format-retention.cjs` 與[整合交接](PR52_MAIN_INTEGRATION_20261030.md)。

## 其他修正與共用檔案

- `master-admin-ui.js`／`master-data.js`：範圍晚回應保護、C 輪詢登記、權限一致、欄位／錯誤重試、取消及焦點、局部更新；不重建第二套導航。
- `master-shared-client.js`／`version-draft-ui.js`：保留 first-match 語義的 identify 索引、確認最後成功 saved、未保存內容告知、另一人重存時阻擋靜默替換；不自動保存未納入送審的內容。
- `master-stage-references.ts`／reference API／viewer：隱藏畫布及各受保護來源仍阻擋刪除；細節依 scope／來源查看權限過濾；精確指定來源與紀錄，過期來源不替換成其他快照。
- master／shared-state API／`master-stage-link.ts`：子工段不可因外部引用為零而連帶刪除，刪除時重查，保留核准的 PROCESS 連動。
- `user-access.js` 只補「線別頁入口」與「AB/C 操作」權限說明；沒有重寫另一任務的權限介面。`index.html` 只更新相關資源版本與新 viewer。

DOT 整合時需逐段比對上述共用檔案，保留 AB/C、草稿、權限及小幫手其他任務的修改。此分支沒有合入或解決那些任務的分支衝突。

## 原來源測試紀錄（不等於此次整合驗收）

下列表格是原來源候選的歷史驗證；此次移除轉換後的候選 SHA/tree、重用範圍與新驗收以交付收據為準。原完整最後驗證於 2026-10-30 在 Node 24、Chromium、原生 Worker／隔離 D1/R2 執行。40 個本任務程式／測試檔以 SHA-256 核對與該次候選完全相同；其餘程式沿同一原始基準。此次僅按實際差異重用未受影響證據；轉換相關數字與完整 PASS 不直接套用到整合候選。

|檢查|結果與覆蓋|
|---|---|
|AB/C 小型／600 產品五輪|PASS；新增、修改、刪除／引用拒絕、取消、保存、送審、查看、退回、重送、撤回、核准、歷史及還原；218 列操作／條件、962 筆候選樣本，非 218 個不同按鈕|
|新增確認／引用控制項|PASS；6 組情境，22 個中越文／1366、390 px 控制項計時，身分失效晚回應保護|
|登入／權限／多使用者|PASS；72 格允許／拒絕＋6 欄位相容性、16 個瀏覽器權限拒絕、staff 合法流程、同欄位衝突及另一人重存保護|
|恢復與導覽|PASS；Apply/Save/Submit/Delete 失 ACK／查收據、未知結果擋離頁；13 個資料分頁及 11 個目的頁導覽。僅驗其他模組導覽，不宣稱全站業務完成|
|穩定性|PASS；C 實際輪詢接收另一人更新；35 次進出＋120 秒停留後可操作，非數小時／實體裝置測試|
|儲存安全與相依|PASS；codec 40 筆歷史、線別 API 8、master workflow 7、field guards 29、產品路線 15、legacy 刪除保護|
|原完整候選靜態檢查|PASS；safe build＋known-auth、TypeScript、lint|
|本次公開分支補驗|PASS；獨立工作樹 npm ci（lockfile／ignore-scripts）、safe build、types、lint；上述 8 類 API／儲存／權限測試及 native recovery、新控制項、導航、固定歷史 Save／Submit 共 13 項命令全 exit 0；完整來源歷史掃描通過|

原包含首次自動轉換的效能比較不屬本次交付，已從此驗收文件移除。歷史來源提交保留原測量紀錄，不能套用到本次格式保留候選。

來源對照：原完整候選 build SHA-256 `a1dc7120dca5aa69ab39b8800cd6de53e3a7cab4881d4af32ccebfa1fe4ae9eb`；本次整理分支建置 SHA-256 `55861e55c22e7c6d3e8c52210a70026be0569fd42ea29723ea76585d3c2527f4`（建置標記使用原始基底）。全部 1,129 個程式／測試來源檔與最後候選逐檔相同，編譯差異含來源版本標記；本次未主張新的效能改善。原來源封存的全檔清單 SHA-256 `02617a06e8854b59708fe635e8bbb4f8e499c1202dbc38336d86bbdf29b561c2` 包含本地報表，不是本分支 Git tree ID。

### 可重跑指令（不表示本次全部已執行）

需要相容的 lockfile 依賴、Node ≥22.13 與 Chromium。所有測試只初始化隔離合成資料。native fixture 必填 PROCESS_PROGRAM_COMMIT；不能誤用 PROGRAM_COMMIT。命令使用 checkout 的實際 commit，沒有憑證值。

```bash
export PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD)
npm run build
npm run lint
npx --no-install tsc --noEmit
node scripts/test-master-legacy-format-retention.cjs
node scripts/test-state-records.cjs
node scripts/test-lines-cloud-api.cjs
node scripts/test-lines-legacy-api.cjs
node scripts/test-master-workflow-v3.cjs
node scripts/test-master-field-guards.cjs
node scripts/test-lines-permission-matrix.cjs
node scripts/test-master-product-route-mode.cjs
LINES_PHASE=verify-small LINES_EXTRA=1 node tests/lines-complete-browser.test.mjs
LINES_PHASE=verify-large LINES_PRODUCTS=200 LINES_STAGES=20 node tests/lines-complete-browser.test.mjs
LINES_PHASE=verify-edges LINES_SAMPLES=1 LINES_EDGE=1 LINES_POLL_CHECK=1 node tests/lines-complete-browser.test.mjs
LINES_RESULT_PATH=/tmp/lines-verify-additions.json node tests/lines-round3-browser.test.mjs
LINES_RECOVERY=1 node tests/lines-native-browser.test.mjs
CHROME_PATH=/usr/bin/chromium node tests/sites-delivery-browser.test.mjs
LINES_PHASE=verify-soak LINES_SAMPLES=1 LINES_SOAK=1 node tests/lines-complete-browser.test.mjs
LINES_PHASE=verify node tests/lines-save-benchmark.test.mjs
LINES_PHASE=verify node tests/lines-submit-benchmark.test.mjs
node scripts/test-lines-cloud-browser.cjs
```

執行會產生本地測試報表／合成截圖，請勿提交。初次完整驗證曾漏傳 build／fixture 的版本環境變數，導致 setup 失敗；補正後同來源重跑受影響檢查成功，沒有減少斷言。獨立公開工作樹初次 build／lint 因尚未安裝依賴無法啟動，完成 lockfile 安裝後重跑通過；沒有降低檢查或改產品。包裝與 Git 推送不代表新一次正式站測試。

## 原來源時點的未完成與交接界線

- NOT_RUN：正式站、真實帳號／資料／網路及全 DB/R2 備份／還原。
- NOT_RUN：實體手機、真正中越文 IME、跨電腦及數小時長測。
- NOT_RUN：完整員工業務資料初始化。本次已按 lockfile 在獨立工作樹安裝依賴，但沒有業務資料包或正式初始化；npm ci 使用 --ignore-scripts 避免不相容 worktree 的 postinstall 更動共用 Git hooks，未修改 hook 設定。
- NOT_RUN：整合最新 main／其他 AB/C 任務、遠端 CI、PR、合併與發布。此工作只推送指定獨立分支供 DOT 審查。
- N/A：本頁沒有搜尋、照片上傳、工段排序、線別 Excel 入口；新增線別按需求移除，未額外新增功能。

以上為原來源時點紀錄；後續 main／#51 整合與補驗見 PR52_MAIN_INTEGRATION_20261030.md 及本次收據。未驗項不能標成已完成，沒有合併或部署。
