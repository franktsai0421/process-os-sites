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

## dot 整合與外部限制

- 已讀取 repo CI：兩份 workflow 都由 pull_request 觸發、測試用途；沒有 push／PR 自動發布命令。README／DEPLOYMENT 指明私人 GitHub source 與 Site-bound source 為不同目的地；本次不更新 `.openai/hosting.json`，不執行 release、merge 或 auto-merge。
- GitHub API 被目前 restricted policy 阻擋；`api.github.com` 已存入環境設定草稿，未套用。Git read/fetch 可用；不能因此推定 API／webhook 查詢已可用。無法查「開啟中 PR」狀態或遠端 webhook／GitHub App 自動部署設定，此項 BLOCKED。
- 已唯讀 fetch 所有遠端分支並對未合併 main 的分支比對：`fix/authoring-save-response-20261027`、`fix/ipqc-ab-read-ownership-20261029` 與本次同改 `public/process/index.html`。請 dot 合併時保留其他 script 變更與本次 helper version。這是遠端分支比較，不冒稱已查證其 PR 開啟狀態或 dot 未推送修改。
- 共用文件 HANDOFF／CHANGELOG／DATA_MODEL 只追加本模組指標／欄位說明，整合時保留雙方條目。
- 本環境沒有 Sites 建立／發布工具、部署身分或外部預覽入口。獨立可操作公開預覽尚未建立；沒有將 localhost 當作交付網址。需要可建立全新 Site、獨立 D1/R2、正常登入配置及來源發布的受控平台連線。不得以既有 Site ID 或公開隧道繞過限制。
- 公開預覽須標示「Codex 預覽副本」及實際 branch/commit；只有在上述平台條件具備後才能完成，不能把本地合成通過標成已發布或使用者可驗收。
