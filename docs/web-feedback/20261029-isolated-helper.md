# 2026-10-29 網頁問題回報／小幫手隔離交付

基準：`2cac307f29b8017a2bb6dc5229d47720f2deab33`（開始時 GitHub main，收尾重新 fetch 仍相同）。分支：`codex/web-feedback-helper-20261029`。主工作目錄是獨立 clone；基準效能另用此 SHA 的獨立 clone。沒有使用或修改 dot 的工作目錄／分支／未提交內容。

## 修復與邊界

- 移除「我的處理」及 helper 內「問題清單」，保留清單內私人備註、完成／重開與交接。
- 後端 `identity()` 的既有 primary 可信身分是刪除依據；不由前端姓名／角色判定。只有正常 Frank 最高管理員能刪除，保留 CAS、same-origin、maintenance、權限與帳號核驗。
- 刪除使用 tombstone；問題、備註、附件、批次與既有 immutable ZIP 保留。容量不因軟刪除釋放。
- 備註操作收據與版本控制阻止失 ACK 重試重複寫入；清單成功更新後只改相關列／明細／統計。新回報會重新核驗清單，未保存備註或未確認交接期間保留輸入。
- helper 在右下角、可視畫面內排版；中越語介面分開顯示。原始輸入不翻譯；窄畫面及長文字保持可操作。實際瀏覽器發現 composition 屬性未接收事件，已修正監聽綁定。
- 透明標記層攔截早期 pointer/mouse/touch、drag、click；wheel／touch 可捲動原頁或內層區域，Esc／取消恢復操作。定位保存穩定標識、標籤及座標備援；辨識失敗顯示原始回報，不改標另一個元件。跨來源 iframe 只有外框／位置備援，不能檢查框內 DOM。
- 唯一共用程式檔 `public/process/index.html`：只改第 81 行 helper 入口版本參數。修改前已在任務中列出原因與影響。未重構 bootstrap、導航、共用權限／讀寫／草稿；其他業務模組不變。
- 資料變化僅回報 JSON 的可選欄位，無 SQL migration。前後端須配套整合；舊 handler 不理解 tombstone，不可直接回滾到舊版本解讀已刪除案件。

## 實測

環境：Linux、Node 24.19.0、npm locked dependencies、Chromium 154.0.8037.57、實際編譯 Worker／隔離 D1/R2。正常 `/api/platform-login` 登入三個合成帳號，沒有跳過登入或放寬產品權限。

- PASS：TypeScript `--noEmit --incremental false`、typed lint、build／postbuild auth audit。
- PASS：59 項 `scripts/test-web-feedback.cjs` API／資料完整性檢查。
- PASS：44 項 `web-feedback-cloud`／`web-feedback-layout` VM／幾何／身分生命週期檢查。
- PASS：16 組 `web-feedback-browser.test.mjs` 真實 Chromium／編譯 Worker 流程：正常三角色登入與刪除 API 拒絕、取消／失敗／成功刪除；私人備註／完成／重開／重新整理；交接與 ZIP 每個 manifest digest／所選 ID／中越文；helper 附件草稿保存；按鈕、圖片、輸入、文字、畫布、空白與捲動後標記；觸控捲動、Esc、恢復輸入；重複點擊、慢回覆、失敗重試、失 ACK 不重複備註；失效元件提示；320/390/768/1365px 中越文版面；反覆進出標記模式的 global listener 數不增加。
- PASS：6 項 locator fixtures、10 項新鮮授權／草稿檢查、inline/records/chunks/R2 四種 auth storage 回歸、bootstrap feedback admission 檢查。最後比對 shared_state 值與 revision 未變。
- PASS：source-only history/worktree preflight，未讀真實業務資料。
- 尚未驗證：既有 hosted 測試站在 ChatGPT 與一般 Chrome、相同網址／真實登入身分的對照；Google Chrome 品牌版、實體手機與原生 OS 中文／越文 IME。Chromium synthetic composition 事件不算真實輸入法驗收。

本地 Chromium 首次開啟及重新整理均能顯示 helper；晚於 `process-ui-ready` 的載入競態已用回歸重現並補救，入口加上版本參數。沒有實站同帳號證據，不能斷言這就是使用者原本看到差異的原因。

重現命令（獨立 checkout、先安裝）：

```bash
export PROCESS_PROGRAM_COMMIT="$(git rev-parse HEAD)"
mkdir -p .sites-runtime
npm run build
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint -- --format unix
node scripts/test-web-feedback.cjs .sites-runtime/feedback-api
node --test tests/web-feedback-cloud.test.mjs tests/web-feedback-layout.test.mjs
FEEDBACK_BROWSER_PATH=/usr/bin/chromium node tests/web-feedback-browser.test.mjs
FEEDBACK_BROWSER_PATH=/usr/bin/chromium node tests/web-feedback-performance.mjs candidate
```

`FEEDBACK_BROWSER_PATH` 使用環境現有瀏覽器；未設定時依序使用 Playwright bundled browser／Chrome channel。合成 credentials 只在 fixture 記憶體產生，不輸出、保存或供正式登入。

## 相同條件效能

同一台機器、相同瀏覽器／1365×900、相同 60 筆合成資料生成器、正常登入、相同測量腳本，分開先後執行。基準是上述 main SHA，修改版是此分支候選程式。數字為單次樣本，不能視為穩定百分比提升或正式站 SLA。

總時間包括瀏覽器操作與等待兩次 animation frame；「最後 API 後穩定」包含測試驅動等待與畫面繪製，並非純 CPU render 時間。API 等待由 Resource Timing 的 responseStart−requestStart；各原始 API total/bytes 與圖片載入另存在 `.sites-runtime/feedback-performance/*.json`。

|操作|基準總時間 ms|修改後 ms|API 等待 ms（基準→修改）|最後 API 後穩定 ms（基準→修改）|
|---|---:|---:|---|---|
|first-open|469|422|9 → 10|128 → 69|
|detail|64|64|無 API → 無 API|— → —|
|note-save|106|88|12 + 8 → 10|50 → 49|
|complete|114|97|15 + 8 → 9|49 → 51|
|reopen|115|98|13 + 8 → 8|44 → 51|
|prepare-zip|93|93|19 → 16|39 → 42|
|handoffs|97|98|8 → 9|52 → 49|
|return-list|82|82|無 API → 無 API|— → —|
|helper-first|94|97|7 → 5|47 → 51|
|helper-reopen|77|91|6 → 5|37 → 54|
|submit|108|108|9 → 9 + 7|52 → 35|

首次清單圖片載入：基準 16 ms、修改 18 ms（各 7,081 bytes），未宣稱圖片加速。清單／明細切換讀取已在記憶體中，不增加 API。備註、完成、重開各少一次 list GET；原解壓 JSON 約 72 KB／次（傳輸 gzip 約 3.3 KB），不混稱傳輸量。送出後新增一次 list GET 是修復清單失效，確保新案件立即可見。helper 再開啟本樣本較慢，未隱藏退步或宣稱全模組全面加速。

## 追加：首次開啟速度（同分支，未發布）

使用者要求繼續改善首次開啟。本輪基準為 `808a61c8b84bc5e993007c1d0d94e4d861f3e06d`，不是前表的原始 main。

實測發現 `loader → JS/CSS → list` 的串接等待。現在只在使用者要求開啟問題頁、且登入與目的頁有效時，將 list 讀取與 JS/CSS 並行；一般頁面的小幫手初始化不預讀問題或私人草稿。後端每次核驗、前端帳號／delivery fence、失敗重試與單一請求去重均保留；沒有新增快取或調整資料模型。模組入口版本改為 `20261029-feedback2`，共用 `public/process/index.html` 仍只改該版本參數，修改前已列明範圍。

`tests/web-feedback-startup-performance.mjs`：相同 Chromium／1365×1000／60 筆合成資料，正常登入後每次建立新的 browser context，沒有瀏覽器資源快取。從目的頁 navigation 起，到首次 animation frame 出現真實問題列，分別各量 5 次取中位數。120 ms 情境使用 Playwright 對本模組每個資源／API 請求加入固定等待，並非真實行動網路；其餘共用入口未加延遲，也未修改。

|項目（毫秒，中位數）|808a61c8|本輪候選|
|---|---:|---:|
|一般冷啟動：navigation → 問題列呈現|596|566|
|加入延遲：navigation → 問題列呈現|1,021|859|
|一般：loader 請求開始 → 問題列呈現|74|64|
|加入延遲：loader 請求開始 → 問題列呈現|440|304|
|一般：list 請求總時間|13|24|
|加入延遲：list 請求總時間|133|145|
|一般：list 回應結束 → 問題列呈現|30|24|
|加入延遲：list 回應結束 → 問題列呈現|29|27|
|一般：圖片請求總時間|16|16|
|加入延遲：圖片請求總時間|135|135|

冷啟動範圍：一般 557–617 → 563–586 ms；加入延遲 987–1,597 → 820–872 ms。這是小樣本，有波動，不能當正式站 SLA。並行後 list 本身沒有變快；改善來自重疊等待。總時間包含共用啟動，不將其全歸因於本模組。本輪使用首次可見 frame，與前表包含 automation／兩次 rAF 的 reload 測量方式不同，不能直接比較。

重現：先設定 `PROCESS_PROGRAM_COMMIT`、建置，再執行 `FEEDBACK_BROWSER_PATH=/usr/bin/chromium node tests/web-feedback-startup-performance.mjs before` 或 `after`。產物在 `.sites-runtime/feedback-startup/`：JSON 保留每次資源等待／總時間／圖片時間；`after-desktop-zh.png` 是收合小幫手、選取短問題後的後台實測圖，截圖操作在效能取樣之後。

本輪 PASS：TypeScript、typed lint、build／postbuild auth audit；49 項 VM／layout 檢查（新增並行載入、三種身分／delivery 失效及失敗重試）；17 組編譯 Worker＋Chromium 流程（新增慢資源並行與清單失敗重試）。先前 API 59 項結果沿用，因本輪未改後端。線上 Chrome／ChatGPT 同帳號、原生輸入法、實體裝置及公開預覽仍尚未驗證。未發布，因此既有測試站不會因本次提交而加速。

## 再追加：載入／讀取／交接寫入（同分支，未發布）

本輪基準為 `558a5d7c200ca5aee2c04a91cb0a6f4e9b86b796`。限定回報模組，無共用權限、讀寫或 schema 調整；共用 `public/process/index.html` 仍僅入口參數更新為 `20261029-feedback3`，修改前已說明範圍。

- 明確進入問題頁且已有登入身分時，entry 在 loader 下載期間啟動首個新鮮 list 與 JS/CSS 預載；一般頁面 UI-ready 不預讀任何問題／私人草稿。首讀只能被同 owner／delivery 的 loader 消費一次，不是跨請求快取。失敗、401、切換身分、重試及去重已驗證。實際瀏覽器確認 list、核心 JS、CSS 各只讀一次。
- 清單附件及交接最新狀態用本次請求的 ID 索引，避免重複線性搜尋；每張附件的原有授權檢查保持。
- ZIP 原圖同一請求內按 ID 去重，最多 4 個並行讀取；同圖仍保留每個問題原本的檔案路徑／manifest 項目。所有讀取完成且每張原圖雜湊正確才寫入 ZIP，再以原 CAS 保存交接；任一缺圖／損壞會等待進行中讀取結束後拒絕，不寫成功紀錄。30 MB 按每個重複 ZIP 項目累計，未放寬上限。
- ZIP CRC32 改為固定 256 項查表，仍產生相同 UTF-8 STORE 格式。沒有降低 SHA-256／CRC 校驗，也沒有提前回報保存成功。

### 首次載入：控制後端，交替前端版本

最初非交替的 5 次測量，一般網路 541→680 ms、120 ms 延遲情境 810→709 ms。分段資源記錄顯示一般網路多數額外等待發生在模組開始前，不能只報較快的樣本。因此新增 paired 模式：同一編譯後端、同一份 60 筆資料及登入，各次使用全新 browser context，交替舊／新前端且每輪翻轉先後順序。只把本模組 entry／loader／core 資產回覆替換成基準或候選 bytes，其餘載入流程相同；不是舊後端和新後端的端到端比較。每組各 5 次，以下為中位數。

|毫秒|基準前端|候選前端|
|---|---:|---:|
|一般：navigation → 真實問題列 frame|579|571|
|一般：loader 請求起 → 真實問題列 frame|63|54|
|模組每請求增加 120 ms：navigation → 真實問題列 frame|811|678|
|同延遲：loader 請求起 → 真實問題列 frame|302|173|
|一般：API 回應開始等待（不含人工排程）|12.1|11.4|
|一般：list 回應結束 → 真實問題列 frame|27.9|30.8|
|延遲：list 回應結束 → 真實問題列 frame|26.5|31.4|

一般冷啟動範圍 556–593 → 549–602 ms，差異小且重疊，不能宣稱大幅改善。延遲情境範圍 753–860 → 668–741 ms。改善來自重疊請求，非 CPU render 或後端授權變快；共同啟動仍佔大部分時間，其他模組不在本次範圍。

重現 paired 模式（先正常設定 `PROCESS_PROGRAM_COMMIT` 並 build）：

```bash
FEEDBACK_BROWSER_PATH=/usr/bin/chromium node tests/web-feedback-startup-performance.mjs round3-paired 558a5d7c200ca5aee2c04a91cb0a6f4e9b86b796
```

### 讀取／寫入：Node handler／SQLite 隔離資料與合成儲存等待

`node tests/web-feedback-io-performance.cjs <label>`：60 案，交接選 20 案、每案 2 張圖，合計 40 個 ZIP 圖片項目、8 個唯一原圖。正常簽章合成 Frank session，實際模組 handler、記憶體 SQLite／附件 Map；並非 D1 或 R2 線上速度。每組 5 次，前後同資料與腳本，表中為中位數。

|操作|基準 ms|候選 ms|
|---|---:|---:|
|問題清單|1.86|1.96|
|備註／狀態保存|2.27|2.25|
|交接紀錄讀取|2.05|2.01|
|ZIP 生成（沒有人工儲存延遲）|50.77|25.39|
|ZIP 生成（每次附件 GET／PUT 增加 40 ms）|1,754.25|141.23|

ZIP 的原圖 GET 40→8 次、並行上限 1→4；ZIP PUT 仍 1 次、交接 CAS 仍 1 次。一般清單、備註、交接讀取沒有可宣稱的顯著改善，不把 Node 的 2 ms 說成雲端使用者保存時間。瀏覽器既有端到端單次樣本中，備註 API total 15.1→16.3 ms、送出 API 14.6→12.6 ms、交接 API 25.5→20.1 ms、圖片 17.0→19.8 ms；包含自動化／繪製的操作時間及完整 API／圖片時間保留於 `.sites-runtime/feedback-performance/round3-before.json`、`round3-after.json`，不能用單次波動宣稱寫入／圖片全面加速。

### 驗證與整合

PASS：型別檢查、typed lint、build／auth audit；64 項 API（含新增共圖去重、並行上限、缺圖／損壞零寫入、容量上限）；52 項 VM／layout（含 entry 首讀／失敗重試／401）；17 組 Chromium＋編譯 Worker；新增 ZIP CRC 已知向量／空檔／邊界／1 MB／中越檔名／central directory；既有 snapshot ZIP reader 的 4 個相容與損壞拒絕案例。瀏覽器回報→備註→完成／重開、交接／下載、刪除三角色、標記不穿透與草稿重試仍通過。未以人工延遲模擬冒充實站驗證。

dot 須一起整合 entry、loader、對應版本參數及後端 ZIP 生產器；仍無 migration。公開預覽與實站同帳號 Chrome／ChatGPT、原生 IME、實體裝置尚未驗證。GitHub API 仍 Forbidden，因此 Draft PR 尚未建立；不會自行 merge、auto-merge 或覆蓋既有 Site。

本輪收尾再次明確 fetch 全部 GitHub heads（不只分支預設 fetchspec），main 仍為原基準。另發現 `cloud/users-permissions-29102026`（`7af150adaf9f51c24fbb17e297fe812ebb92b995`）及 `codex/photo-standard-cloud-29102026`（`19855a067e89692a63376794160b67f5b1062499`）與本分支重疊 `public/process/index.html`、`AI_CONTEXT/CHANGELOG.md`、`HANDOFF.md`。下方兩個既有 fix 分支仍重疊 index／CHANGELOG。只比對遠端提交，沒有合併、接管其工作目錄或推斷哪個開啟中 PR 屬於 dot。

## 操作是否卡住：額外恢復驗證與修復

基準為 `1654d2dfcbb7d92f08a9749fc0bf55bb4c291c46`。既有 17 組瀏覽器檢查仍通過；新增邊界操作重現三個缺陷，並已修復：

1. 勾選 21 案後，原前端先建立 pending 交接，後端以 `SELECT_1_TO_20` 拒絕，選取及切換仍被鎖定。現在建立 pending／發送前就提示 1–20 案；可取消第 21 案後成功交接 20 案，並正常切到交接紀錄。後端上限未變。
2. 另一位 admin 先修改問題，自己的備註保存遇到 `CASE_CHANGED_RELOAD`，原本只能重試過期版本，更新又受未保存備註保護阻擋。現在顯示「讀取最新狀態，保留備註」：重新核驗清單、保留原文，要求再次確認保存，不自動覆寫他人狀態。恢復讀取失敗可以再次重試；嘗試切頁被未保存備註保護擋下時，恢復按鈕也保留。若新的狀態不符合原篩選，仍將文字保留在原案件 ID，不能誤套給下一案。
3. 保存期間仍可輸入，舊請求成功會清掉後續文字。現在保存期間顯示保存中、備註唯讀（可選取／複製）、保存按鈕暫停；成功或失敗後恢復。沒有在成功回覆前清空輸入，也沒有變更後端更新收據／CAS。

新增 `tests/web-feedback-recovery-browser.test.mjs` 使用實際編譯 Worker、隔離 D1/R2、正常 Frank／其他 admin 登入。初次結果 3 FAIL／2 PASS，證據保存在 `.sites-runtime/feedback-recovery/before.json`；修復後新增附件／搜尋檢查，共 **6 PASS**：超額交接恢復、雙管理者版本衝突（含讀取失敗重試與篩選）、保存期間輸入保護、交接成功回覆遺失後同批重試且僅一筆紀錄、交接紀錄失敗重試、附件放大實際載入／Esc 回焦與空搜尋／篩選恢復。

既有全流程再次 **17 PASS**，合計 **23 組瀏覽器流程**，並通過 52 項 VM／layout、TypeScript、typed lint、build／auth audit。保存狀態現在先顯示「保存中」，既有失敗重試測試已改為等到真正的失敗提示才重試，避免把載入提示當成操作完成。後端本輪未修改；前輪 64 項 API 證據沿用。合成 business shared_state 值與 revision 比對未變。

修改限模組前端、專屬測試與文件；共用 `public/process/index.html` 只更新已事先說明的入口版本 `20261029-feedback4`。無資料模型或權限政策變更。這是隔離 Chromium 驗證；尚未發布、未驗證既有實站同帳號 Chrome／ChatGPT、實體手機及原生 OS IME，也不宣稱所有可能的網路故障都已涵蓋。

## 剪貼簿追加驗證（功能程式未變更）

使用者追問截圖複製貼上，新增 `tests/web-feedback-clipboard-browser.test.mjs`，以實際 Chromium Clipboard API 寫入隔離合成頁面的 640×280 截圖，再透過鍵盤 Ctrl+V 觸發原生 paste，不是注入 ClipboardEvent。正常帳號／編譯 Worker／隔離 D1/R2，3 組 PASS：

- 標記模式中點小幫手文字框貼截圖，只新增一張縮圖，標記模式仍有效；Esc 退出、附件放大與關閉可用。
- 中越文文字 Ctrl+V 正常插入一次、仍可編輯，不被圖片貼上處理器攔截。
- 多標記切換、刪除其中一筆附件、重新整理後還原、送出兩筆問題與後台讀取附件均通過；提交後原圖解碼像素逐位元組等於貼上的瀏覽器截圖。shared_state 值與 revision 未變。

檢查結果在 `.sites-runtime/feedback-clipboard/results.json`；合併前輪 23 組，共有 26 組已執行瀏覽器流程證據。本次未修改功能、未重跑不相關整套測試，也未發布。既有任意位置標記／早期事件攔截／捲動／取消恢復操作的證據仍見原流程。

操作為「點選網頁位置」→ 點一下欲回報處 → 自動退出選取並編輯；Esc／取消也可退出。只在選取期間攔截底層操作，小幫手自身控制項保留。剪貼簿圖片不是內建自動截圖功能，需先由外部截圖工具取得圖片，再貼入小幫手；每個標記最多 6 張，每張 5 MB，PNG／JPEG／WebP。實體 OS 截圖工具、使用者裝置 Google Chrome、線上剪貼簿權限與跨來源 iframe 內部定位仍尚未驗證／受既有位置備援限制。

## 最初 main 與目前實作的完整重測比較

使用者要求修改前後對照，重新量測最初 main `2cac307f29b8017a2bb6dc5229d47720f2deab33` 與目前實作 `5d5c68f75779783aea3ab7485b2e61f382c43ff5`。同一台機器、Chromium 154.0.8037.57、60 筆相同合成資料生成器、正常登入，各測 5 次。一般操作交替版本並翻轉先後順序；冷啟動各自建立 5 個全新 context，先後執行兩版。核對兩個 checkout 的模組 JS 與各自編譯資產雜湊一致，未更動任一版本的功能程式。

|操作（毫秒，中位數）|原始 main|目前實作|
|---|---:|---:|
|首次冷開啟問題頁|585|594|
|首次冷開啟，模組每請求額外等待 120 ms|962|705|
|重新整理整頁|492|473|
|切換問題明細|64|64|
|保存備註|107|104|
|標記完成|131|98|
|重新開啟|114|98|
|準備 ZIP（2 案）|93|92|
|交接紀錄|98|98|
|切回問題清單|82|81|
|小幫手首次展開（已進入問題頁）|98|98|
|小幫手再次展開|94|94|
|送出文字回報|108|108|

一般首次開啟沒有變快，不能宣稱全面提升；數字也會隨機器排程波動，非固定保證值。冷啟動計 navigation 至真實問題列的首個 frame；其餘操作包含測試驅動及等待兩個 frame。API 與畫面合計不能直接相減當純 CPU 時間。備註／完成／重開各由 2 個 API 請求減為 1 個；送出回報由 1→2 個是成功後更新清單的正確性修復。大量共圖 ZIP 的優化另見前段不同負載測量，不混入此處 2 案的小批次結果。

原始資料為兩個隔離 checkout 的 `.sites-runtime/feedback-performance/final-compare-{before,after}-{1..5}.json`、`.sites-runtime/feedback-startup/final-cold-{before,after}.json`，匯總位於開發 checkout 的 `.sites-runtime/feedback-performance/final-compare-summary.json`。這是本機版本對照，非既有網站與候選部署對照；實站連線仍被環境網路規則阻擋，新增允許網域的設定草稿尚待使用者套用。

## 收尾補驗與尚未完成項目

本輪從 `145eaa81bf0d46dca70069ee3b3d4192dc11192f` 繼續，沒有修改功能程式。新增 `tests/web-feedback-final-browser.test.mjs`，使用現有編譯 Worker、正常登入與隔離 D1/R2：

- PASS：延遲交接紀錄回應後返回清單、連續選取 20 筆，舊回應不能覆蓋清單或最後一筆明細。
- PASS：刪除未送出標記後，經總覽頁／瀏覽器返回、三次展開收合與重新整理，剩餘原文保留、已刪標記不復活、window/document 事件監聽數不累積。
- PASS（有條件）：等標記遮罩完成兩個 animation frame 後，跨來源 iframe 內按鈕的 pointerdown/mousedown/click 均未觸發；回報保存 iframe 外框 ID／tag／座標，退出後內部按鈕恢復。外部網址由 Playwright 本地 fulfill，沒有連到真實外站。
- **FAIL／未修復**：不等待遮罩第一幀、立刻以 CDP 座標輸入點擊跨來源 iframe，曾觸發 iframe 內部 pointerdown/mousedown/click，且未完成標記。暫設 iframe inert 的嘗試仍失敗，已撤回，沒有把無效修正交付。此項不是因沒有實站憑證而未驗證，而是隔離 Chromium 已重現的切換瞬間保護缺口；不得宣稱跨來源 iframe 在所有時序均不穿透。

正常補驗 3 PASS，加先前三組 suite 的 26 組，共 29 組通過情境；另保留上述 1 項失敗診斷，不能用 29 PASS 抵銷。首次跨頁測試誤把進入資料後台預設頁當作返回問題頁，涉及不完整合成 master 資料；已改用正常總覽／瀏覽器返回驗證本模組，不修改其他業務或放寬其資料門檻。52 項 VM/layout 再次通過，功能程式與既有已建置版本相同，因此沿用先前 type/lint/build/API 證據。

結果：`.sites-runtime/feedback-final/results.json`；首幀失敗證據：`iframe-immediate-failure.json`。重現正常驗收：

```bash
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) FEEDBACK_BROWSER_PATH=/usr/bin/chromium node tests/web-feedback-final-browser.test.mjs
```

另加 `FEEDBACK_PREPAINT_PROBE=1` 可執行保留的首幀時序診斷（存在已知失敗，非預設通過測試）；新跑的結果與既有證據應分開保存。

### 外部交付狀態

|項目|狀態／必要條件|
|---|---|
|Draft PR|尚未建立；GitHub Git 可用，但目前環境仍未允許 api.github.com。PR 說明已整理，須套用已保存的環境網路草稿後重試 API。|
|獨立公開預覽|尚未建立；沒有 Sites 建立／發布工具、部署身分或公開入口。須接上能建立全新 Site、獨立 D1/R2 與正常登入的受控平台。名稱固定「Codex 預覽副本｜網頁回報與小幫手」，標示分支與部署 commit。|
|實站 Chrome／ChatGPT 同網址同帳號比較|尚未驗證；目前執行環境也未允許測試站網域，且沒有同帳號已登入瀏覽器會話。只能唯讀比較既有站，寫入必須在獨立預覽。|
|一般網路首次開啟改善|尚未達成可量測改善；585→594 ms，不承諾實站提速，也不越界修改共用啟動。|
|實體手機、原生 OS 中越文 IME／截圖工具|尚未驗證；模擬尺寸、composition 與 Chromium Clipboard API 證據不能取代。|
|iframe 切換瞬間保護|上述隔離診斷 FAIL，仍需修復／複驗；穩定繪製後外框標記通過。|

環境設定草稿 revision 3 已有 api.github.com 與 process-os-test.franktsai0421.chatgpt.site；本輪 environment_status 的執行設定仍為 revision 1、無新增網域／capabilities／secrets／outbound identities。沒有重複新增憑證需求或嘗試繞過代理。尚未提供預覽網址、未聲稱 PR 已建立、未發布／merge。

### 最新遠端重疊檔案

再次唯讀 fetch 全部 heads，main 仍為原基準。只列尚未被 main 包含的遠端分支，按各自 merge-base→分支的修改與本次交集；這不是開啟中 PR 狀態，也無法代表 dot 未推送的修改。

|分支|SHA|重疊檔案|
|---|---|---|
|`cloud/users-permissions-29102026`|`a8c988841e7cf3b1616f321a7eb55280f7379738`|`AI_CONTEXT/CHANGELOG.md`, `HANDOFF.md`, `public/process/index.html`|
|`codex/photo-standard-cloud-29102026`|`19855a067e89692a63376794160b67f5b1062499`|`AI_CONTEXT/CHANGELOG.md`, `HANDOFF.md`, `public/process/index.html`|
|`codex/preview-process-flow-cloud-29102026`|`f91f758f85a481819801274f656b4f917e798ffa`|`AI_CONTEXT/CHANGELOG.md`, `AI_CONTEXT/DATA_MODEL.md`, `HANDOFF.md`, `public/process/index.html`|
|`codex/process-flow-cloud-29102026`|`10de4c27f8c7a32e46938acded575b77eee9231e`|`AI_CONTEXT/CHANGELOG.md`, `AI_CONTEXT/DATA_MODEL.md`, `HANDOFF.md`, `public/process/index.html`|
|`fix/authoring-save-response-20261027`|`4674df6cc419b6cf14cbb6808d0f99061cbd8a5c`|`AI_CONTEXT/CHANGELOG.md`, `public/process/index.html`|
|`fix/ipqc-ab-read-ownership-20261029`|`6b56bf68c0c892aa11cdfb7d266995d5dd7f921c`|`AI_CONTEXT/CHANGELOG.md`, `public/process/index.html`|

只讀取與比對，不合併或接管以上分支。index 整合只保留本次 feedback entry 版本參數，其餘共用入口由 dot 語意整合；文件保留雙方條目。

## 建議 1–4 實作與驗證（本輪基準 2b05c6f）

使用者明確要求處理標記安全、首次載入、回報引導及大量清單操作。以 `2b05c6fc12d4fa8695e726c592ea6f405adb35ab` 繼續同一獨立分支；以下為最新狀態，前段紀錄保留為各輪歷史證據。

### 實作及未解決範圍

1. **標記安全：部分改善，未完整修復 iframe 首幀問題。** 現在先顯示「準備標記中」，兩個 animation frame 後才顯示可點選／十字游標；準備中的同頁事件仍攔截，尚未就緒不建立標記。這避免在遮罩剛插入 DOM 時就宣稱可選取，但不是跨來源 iframe 首幀保護的修復。嘗試過獨立合成環境的 native modal、提前 pointerdown、iframe inert／visibility 與合成層方案，仍有失敗且侵入原頁互動，均未納入產品。`tests/web-feedback-iframe-transition.diagnostic.mjs` 不等待就緒、立即實際座標點擊，最後 3 次皆送達 iframe 的 pointerdown/mousedown/click，回傳 FAIL；保留測試和失敗，不用正常就緒後通過取代。
2. **首次載入：完成模組內調整與隔離量測，實站仍未驗證。** 明確 `view=data&dataTab=web-feedback` 網址，在 entry 載入時只預載公開 loader／core JS／CSS。沒有提前執行核心、讀 API、核驗帳號或開啟私人 IndexedDB；一般頁面不新增預載。授權 list 仍依原 owner／delivery、每次新鮮核驗且只消費一次。共用 `public/process/index.html` 僅版本參數更新為 `20261029-feedback5`，已在修改前說明；沒有重構 bootstrap／導航。
3. **回報引導：完成。** 標記後聚焦原說明欄，不清除文字；顯示位置、附件張數、尚未送出／送出中／尚未確認成功。成功仍只以伺服器回覆判定。fallback 元件名稱改用中越文「圖片／輸入欄位／畫布／外部內容／網頁位置」，不顯示 DOM tag；內部 locator／位置備援照常保存。
4. **清單操作：完成本次範圍。** 桌面工具列與篩選 sticky，窄螢幕保持正常流避免遮住畫面。同一分頁以 origin＋核驗帳號保存篩選、勾選 ID、目前問題與清單 scrollTop，跨交接頁、總覽／返回及重新整理恢復；不保存案件內容、私人備註或授權。每次成功取得 fresh list 後才套用，排除不存在／不可交接 ID，驗證日期／選項並 escape 文字。sessionStorage 不可用時不阻擋保存。維持完整讀取，沒有為加速省略資料或引入分頁。

### 驗證

- PASS：53 項 VM/layout（含新增公開資源預載在無登入時不取 API／草稿、不執行核心）；完整 TypeScript、typed lint、build/auth audit、source-only preflight。
- PASS：既有 17 組主流程、6 組恢復、3 組真實剪貼簿、3 組收尾流程；新增 `tests/web-feedback-workspace-browser.test.mjs` 3 組，共 32 組正常瀏覽器情境。新增覆蓋篩選／勾選／選取／scroll 跨頁／重整、sticky 幾何、帳號隔離、無效 ID、惡意日期不插入 DOM、就緒後選取聚焦、中越文狀態、失敗重試。均為編譯 Worker、正常登入、隔離 D1/R2，shared_state 值與 revision 不變。
- **FAIL**：上述首幀前跨來源 iframe 診斷 3／3；正常模式等待可選取訊號的 iframe 外框標記通過。兩者不是相同時序，不能合併成全面 PASS。
- 後端程式未變更，沿用前輪 64 API 證據。真實站台、相同登入身分 Chrome／ChatGPT、實體裝置及原生 OS IME 仍尚未驗證；非本輪已通過清單。

新證據：`.sites-runtime/feedback-workspace/results.json`、`.sites-runtime/feedback-iframe-transition/results.json`、原 browser/recovery/clipboard/final 的最新結果。新增診斷命令（目前預期會揭露失敗，不能標記通過）：

```bash
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) FEEDBACK_BROWSER_PATH=/usr/bin/chromium node tests/web-feedback-iframe-transition.diagnostic.mjs
```

### 效能比較

修改前先量一般冷啟動 579 ms、每個模組請求加 120 ms 時 694 ms（各五次）。完成後再使用同一編譯後端／60 筆合成資料／Chromium 154.0.8037.57，交替基準與候選前端、每輪翻轉先後順序，各 5 個全新 context；共享目前 CSS，差異在 entry/loader/core JS。以下為這個交替實驗的中位數，不能與前輪不同方法直接拼接。

|毫秒|基準 2b05c6f 前端|本輪候選|
|---|---:|---:|
|一般首次列呈現|566.2|575.9|
|一般範圍|560.7–595.4|531.7–584.3|
|每模組請求加 120 ms：首次列呈現|687.5|668.6|
|同延遲範圍|673.6–701.7|641.2–695.7|
|一般 list API 回應開始等待|12.2|7.9|
|一般 list 回應結束→首個列 frame|34.2|30.6|
|延遲 list 回應開始等待（不含人工排程）|10.4|8.6|
|延遲 list 回應結束→首個列 frame|31.6|21.6|
|一般圖片請求合計|14.9|15.8|
|延遲圖片請求合計|132.6|132.9|

loader 請求開始一般 513→475 ms、延遲情境 521→463 ms；改善機制是重疊公開資源下載。一般首次沒有可宣稱的改善，延遲情境只有小幅樣本改善且範圍重疊，不作 SLA 或顯著性保證。清單 API 仍約 navigation 後 510–527 ms 才開始，共用啟動佔大部分；未越界修改共用入口流程。圖片沒有加速。

測量腳本新增 navigation、共用資源時間與登入分段，沒有寫入產品畫面。登入一次樣本至問題列約 997 ms、API 回應開始等待約 7.1 ms；導航後 Playwright 未提供該登入請求結束時間，記為 null，不捏造 API total，也不把總時間當純登入服務時間。原始資料 `.sites-runtime/feedback-startup/round5-paired.json`；重現 `node tests/web-feedback-startup-performance.mjs <label> 2b05c6fc12d4fa8695e726c592ea6f405adb35ab`（先設正常 build 與瀏覽器環境變數）。

### 整合與外部條件

無 SQL migration 或共用讀寫／權限改動；新增資料僅模組自己的 sessionStorage UI 偏好。Draft PR／獨立公開預覽／實站測速仍缺原先列明的外部能力，沒有以分支或 localhost 冒充交付。

最新 fetch main 仍是原基準；與尚未被 main 包含的遠端分支交集如下（非 PR 狀態，不代表 dot 未推送內容）：

|分支|SHA|交集|
|---|---|---|
|`cloud/users-permissions-29102026`|`1f88a7e24936fa63b387eb40637e32aa0d892c6d`|`AI_CONTEXT/CHANGELOG.md`, `HANDOFF.md`, `public/process/index.html`|
|`codex/photo-standard-cloud-29102026`|`19855a067e89692a63376794160b67f5b1062499`|`AI_CONTEXT/CHANGELOG.md`, `HANDOFF.md`, `public/process/index.html`|
|`codex/preview-process-flow-cloud-29102026`|`929bed7b4929d974338ced74dbecafd2420d48a5`|`AI_CONTEXT/CHANGELOG.md`, `AI_CONTEXT/DATA_MODEL.md`, `HANDOFF.md`, `public/process/index.html`|
|`codex/process-flow-cloud-29102026`|`ea20ffab7aa782f628d0107c99e0f150fc76aaf1`|`AI_CONTEXT/CHANGELOG.md`, `AI_CONTEXT/DATA_MODEL.md`, `HANDOFF.md`, `public/process/index.html`|
|`fix/authoring-save-response-20261027`|`4674df6cc419b6cf14cbb6808d0f99061cbd8a5c`|`AI_CONTEXT/CHANGELOG.md`, `public/process/index.html`|
|`fix/ipqc-ab-read-ownership-20261029`|`6b56bf68c0c892aa11cdfb7d266995d5dd7f921c`|`AI_CONTEXT/CHANGELOG.md`, `public/process/index.html`|

未合併或接管以上工作；由 dot 整合 index 版本參數與文件條目，整合後須複驗原生輸入／捲動及三角色授權。

## 跨來源 iframe 切入瞬間修復（feedback6）

本段取代前述「首幀診斷仍失敗」的目前狀態；前段保留歷史測試結果。修復前來源 `f29f0383a938cfa76ff47b897d72bcc9f382e0b3`，仍沿用原 main 基準與獨立分支。只有本模組核心／樣式與專屬測試變更；共用 `public/process/index.html` 僅將 helper query 由 feedback5 更新 feedback6，修改前已列出原因、最小改法與只影響 helper 載入快取的範圍。

### 原因與修正

iframe 的舊合成命中區在新遮罩第一幀前仍可能接收輸入；單靠新增遮罩、最後 click 或 iframe inert 不足。現在切入選取時，同步以 `display:none!important` 撤下 iframe 的渲染表面並完成 layout，同位置放置可選取的外框佔位。保留原 iframe 節點、src 與 browsing context，不移除、重建或重載它；跨來源內容暫時不顯示，介面明示「外部內容暫停互動；可標記此位置」。只識別外框與位置，不聲稱識別內部 DOM。

舊命中區還可能轉移鍵盤焦點，即使其內容未收到 pointer/mouse/touch 事件。補測曾發現 Esc 因而失效；現在僅在焦點確實進入暫停中的 iframe 時，於下一 task 收回焦點，讓 Esc 可用。回收前再核對目前焦點，避免搶走小幫手輸入框／附件控制。完成、Esc、取消、關閉、導航及身分清理沿同一出口還原 iframe 的 display、刪除佔位、撤除 listener／observer／timer。

標記期間新增 iframe 也暫停；外部腳本更新 display 時保留其新值，退出恢復。佔位維持位置及外層捲動區，可捲動後保存原 iframe ID／tag／座標。準備中第一次點擊可能不建立標記，但不觸發原功能；顯示可點選後正常建立標記。沒有改任何 API、權限、資料格式或資料庫，也沒有因本修復新增背景 API 請求。

### 驗證與限制

- 原始立即座標點擊診斷不增加 ready／paint 等待、不減少斷言：修復前 3／3 FAIL；修復後 3／3 PASS，iframe 內事件陣列皆空。舊結果保存於 `.sites-runtime/feedback-iframe-transition/before-f29f038.json`，新結果為同目錄 `results.json`。
- 新增 `tests/web-feedback-frame-browser.test.mjs`：滑鼠、觸控、鍵盤三種進入方式各 3 次；立即點擊不穿透，退出／完成後原輸入保留、nonce 不變、iframe 載入次數保持 1，按鈕恢復。另測流式佔位的捲動與位置送到後端、動態 iframe／display 更新及取消後 observer 已清除，共 5 組。
- 相關既有流程包含主要 17 組、收尾 3 組、真實 Clipboard API／Ctrl+V 3 組；涵蓋普通位置的早期事件攔截、捲動、多標記、圖片附件、回報與管理／交接、不累積監聽器及商業資料 revision 不變。結果在各 `.sites-runtime/feedback-*` 目錄，全部寫入為隔離合成 D1/R2。
- PASS：TypeScript、typed lint、53 VM/layout（40 core＋13 layout）、build／auth audit 及 source-only preflight；沒有重跑未改動的 64 後端 API 情境，以先前通過結果為歷史證據。
- 本輪首次平行回歸中，既有主要測試的「core 固定延遲 200 ms」先後斷言失敗；公開預載可能比 bootstrap 早超過 200 ms，固定睡眠不能可靠代表 API 是否等待 core。測試改成在 list 發起前保持 core 不回傳，10 秒上限仍會使錯誤依賴失敗；重試與單次讀取斷言保留，沒有改產品啟動邏輯。
- 上述為雲端 Chromium 154／Playwright，跨來源 HTML 在本機 fulfill，沒有連到外站。使用者的 Chrome、實體觸控裝置、Safari／Firefox、實站同帳號、closed shadow root 內的 iframe 仍尚未驗證。顯示暫代外框不會停掉 iframe 自身背景 JavaScript；本修正保證的範圍是已測輸入攔截，非凍結外站程式。
- 本輪不改初次載入／API 讀寫路徑，未新增效能提升數字；前後速度數據仍見前段，不以 iframe 攔截測試代替測速。

重現（先正常 build；不需對外網路、正式帳號或業務資料）：

```bash
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) FEEDBACK_BROWSER_PATH=/usr/bin/chromium node tests/web-feedback-iframe-transition.diagnostic.mjs
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) FEEDBACK_BROWSER_PATH=/usr/bin/chromium node tests/web-feedback-frame-browser.test.mjs
```

本輪 fetch 後 main 仍為 `2cac307f29b8017a2bb6dc5229d47720f2deab33`。photo 分支更新至 `d9b2eb7c42d6f8d7700472858c28923aef8b5f0b`，preview-process-flow 至 `0874e872acc226c5679845e99c8349d51a4a7445`，process-flow 至 `d4ef8118425c5623c7245f8e5711c614ca9f6293`；與本分支的交集仍是上表共用入口／文件，沒有合併他們的程式。dot 須保留其他入口 script 及本次 feedback6 版本，整合後重跑以上時序回歸。開啟中 PR／外部部署 webhook 狀態仍未取得；沒有發布既有 Site。

## dot 整合與外部限制

- 已讀取 repo CI：兩份 workflow 都由 pull_request 觸發、測試用途；沒有 push／PR 自動發布命令。README／DEPLOYMENT 指明私人 GitHub source 與 Site-bound source 為不同目的地；本次不更新 `.openai/hosting.json`，不執行 release、merge 或 auto-merge。
- GitHub API 被目前 restricted policy 阻擋；`api.github.com` 已存入環境設定草稿，未套用。Git read/fetch 可用；不能因此推定 API／webhook 查詢已可用。無法查「開啟中 PR」狀態或遠端 webhook／GitHub App 自動部署設定，此項 BLOCKED。
- 已唯讀 fetch 所有遠端分支並對未合併 main 的分支比對：`fix/authoring-save-response-20261027`、`fix/ipqc-ab-read-ownership-20261029` 與本次同改 `public/process/index.html`。請 dot 合併時保留其他 script 變更與本次 helper version。這是遠端分支比較，不冒稱已查證其 PR 開啟狀態或 dot 未推送修改。
- 共用文件 HANDOFF／CHANGELOG／DATA_MODEL 只追加本模組指標／欄位說明，整合時保留雙方條目。
- 本環境沒有 Sites 建立／發布工具、部署身分或外部預覽入口。獨立可操作公開預覽尚未建立；沒有將 localhost 當作交付網址。需要可建立全新 Site、獨立 D1/R2、正常登入配置及來源發布的受控平台連線。不得以既有 Site ID 或公開隧道繞過限制。
- 公開預覽須標示「Codex 預覽副本」及實際 branch/commit；只有在上述平台條件具備後才能完成，不能把本地合成通過標成已發布或使用者可驗收。
