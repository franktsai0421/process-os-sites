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
2. 另一位 admin 先修改問題，自己的備註保存遇到 `CASE_CHANGED_RELOAD`，原本只能重試過期版本，更新又受未保存備註保護阻擋。現在顯示「讀取最新狀態，保留備註」：重新核驗清單、保留原文，要求再次確認保存，不自動覆寫他人狀態。恢復讀取失敗可以再次重試。若新的狀態不符合原篩選，仍將文字保留在原案件 ID，不能誤套給下一案。
3. 保存期間仍可輸入，舊請求成功會清掉後續文字。現在保存期間顯示保存中、備註唯讀（可選取／複製）、保存按鈕暫停；成功或失敗後恢復。沒有在成功回覆前清空輸入，也沒有變更後端更新收據／CAS。

新增 `tests/web-feedback-recovery-browser.test.mjs` 使用實際編譯 Worker、隔離 D1/R2、正常 Frank／其他 admin 登入。初次結果 3 FAIL／2 PASS，證據保存在 `.sites-runtime/feedback-recovery/before.json`；修復後新增附件／搜尋檢查，共 **6 PASS**：超額交接恢復、雙管理者版本衝突（含讀取失敗重試與篩選）、保存期間輸入保護、交接成功回覆遺失後同批重試且僅一筆紀錄、交接紀錄失敗重試、附件放大實際載入／Esc 回焦與空搜尋／篩選恢復。

既有全流程再次 **17 PASS**，合計 **23 組瀏覽器流程**，並通過 52 項 VM／layout、TypeScript、typed lint、build／auth audit。保存狀態現在先顯示「保存中」，既有失敗重試測試已改為等到真正的失敗提示才重試，避免把載入提示當成操作完成。後端本輪未修改；前輪 64 項 API 證據沿用。合成 business shared_state 值與 revision 比對未變。

修改限模組前端、專屬測試與文件；共用 `public/process/index.html` 只更新已事先說明的入口版本 `20261029-feedback4`。無資料模型或權限政策變更。這是隔離 Chromium 驗證；尚未發布、未驗證既有實站同帳號 Chrome／ChatGPT、實體手機及原生 OS IME，也不宣稱所有可能的網路故障都已涵蓋。

## dot 整合與外部限制

- 已讀取 repo CI：兩份 workflow 都由 pull_request 觸發、測試用途；沒有 push／PR 自動發布命令。README／DEPLOYMENT 指明私人 GitHub source 與 Site-bound source 為不同目的地；本次不更新 `.openai/hosting.json`，不執行 release、merge 或 auto-merge。
- GitHub API 被目前 restricted policy 阻擋；`api.github.com` 已存入環境設定草稿，未套用。Git read/fetch 可用；不能因此推定 API／webhook 查詢已可用。無法查「開啟中 PR」狀態或遠端 webhook／GitHub App 自動部署設定，此項 BLOCKED。
- 已唯讀 fetch 所有遠端分支並對未合併 main 的分支比對：`fix/authoring-save-response-20261027`、`fix/ipqc-ab-read-ownership-20261029` 與本次同改 `public/process/index.html`。請 dot 合併時保留其他 script 變更與本次 helper version。這是遠端分支比較，不冒稱已查證其 PR 開啟狀態或 dot 未推送修改。
- 共用文件 HANDOFF／CHANGELOG／DATA_MODEL 只追加本模組指標／欄位說明，整合時保留雙方條目。
- 本環境沒有 Sites 建立／發布工具、部署身分或外部預覽入口。獨立可操作公開預覽尚未建立；沒有將 localhost 當作交付網址。需要可建立全新 Site、獨立 D1/R2、正常登入配置及來源發布的受控平台連線。不得以既有 Site ID 或公開隧道繞過限制。
- 公開預覽須標示「Codex 預覽副本」及實際 branch/commit；只有在上述平台條件具備後才能完成，不能把本地合成通過標成已發布或使用者可驗收。
