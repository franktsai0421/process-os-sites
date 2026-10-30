# 線別與工段管理 CLOUD 30102026 — 候選交接

基準 main：`a870fc5882a1ec6ebe3308e540c1c69282e05dc1`。分支：`codex/lines-stages-cloud-30102026`；工作目錄 `/workspace/lines-stages-cloud-30102026`。

使用者最新指示：現在不建立 PR，由使用者整理對話後安排 DOT 建立。已完成下列隔離修復及驗證；公開預覽、實站核對及剩餘驗收仍未完成，**不得視為可直接整合／發布**。未通知 DOT，未 merge、未改既有站台或真實業務資料。本文件取代前輪未完成項目表；JSON 保留各階段證據。

## 修改及根因

1. 新、舊主檔 UI 移除「新增線別」按鈕與事件，保留新增工段及合法線別 API。
2. 線別有子工段時，UI 顯示工段代碼並阻擋刪除；workflow 在真正 CAS 寫入時以 previous 再檢查，回 `LINE_HAS_STAGES`。legacy shared-state 也套用相同保護，避免未採用新草稿的資料繞過。
3. scope 讀取捕獲原控制項、scope、頁面及身分／epoch；離頁或換人後，延遲回應不能改目的頁。沿用既有 `canLeave()`，沒有建立第二套導航機制。
4. Apply 拒絕後的 rollback 會替換 snapshot，原 modal closure 指向脫離的 line，導致重試關窗卻未寫入。改用 stable ID 重新找目前線別／工段；若原工段已變更則拒絕覆寫並要求重開。新增、改名及遺失回應重試均有讀回驗證。
5. `STAGE_IN_USE` 在伺服器保留完整引用阻擋；回應才以最新身分及 AB/C/editor 查看權限過濾明細。UI 顯示來源／紀錄與有權限的模組連結，隱藏項目只顯示一般提示。文字以 DOM textContent 呈現；連結固定導向模組，並非精確定位到每一個歷史方塊。

共用影響檔案：`master-admin-ui.js`（AB/C、表單、版本列）、`master-data.js`（舊入口）、`index.html`（cache version）、`master-workflow.ts`、`master-stage-references.ts`、新 `master-stage-reference-response.ts`、master workflow 與 legacy shared-state routes。未更改權限設定頁、共享草稿協定、導航 coordinator、業務 schema 或資料格式；無資料遷移。

## 相依與現有保護

已讀取 `cloud/lines-scope-rights-29102026`，tip `2dddf1028fc67b9cac5e2b1bb8e6717e7584e552`。其線別共用 scope 權限說明仍由權限任務負責；沒有 cherry-pick 其整個分支或重做權限介面。線別與 AB/C 共用同一 master scope，DOT 應逐段合併上述重疊檔案。

新增／刪除有效工段仍連動必要 PROCESS 範本；PROCESS 有草稿或待審時保留現有阻擋。送審使用**最後已保存的快照**，並非所有未保存 working 修改；套用只同步 working，保存才建立 saved，核准才更新 active。沒有為速度略過權限、引用、CAS、收據或歷史。

引用掃描現況：active 類別／產品路線；draft、pending、pending-test 版本；working/saved 與此次 previous 路線；未採用 authoring 時的 approved/draft/pending/pending-test 流程版本與 processEditor 工作區；authoring active/working/saved 與 pending cases。隱藏但仍存在的 operation 仍檢查。**不是所有 superseded 歷史一律阻擋**，完整歷史政策仍須與既有規格／任務協調，未擅自擴大或移除。

## 實際驗收

所有帳號、密碼、產品及工段均為合成隔離 fixture。`frank` 表示測試中的 primary 規則，不代表登入既有站台真實 Frank。原生瀏覽器測試使用完整編譯 app、真實版本 UI、正常密碼登入 API、原生 workerd/D1/R2；不是外框替身。另有小型表單測試使用替身外框，證據分列。

|身分／範圍|操作|預期畫面／資料|實際結果|耗時|
|---|---|---|---|---|
|合成 primary／AB、C|首次進頁、建立草稿|scope 正確、可編輯；A/B 不合併|原生 GUI PASS，兩版本各 5 輪|下表|
|合成 primary／AB、C|新增工段、套用|working 新增一次，active 不變|GUI＋D1 PASS|下表|
|合成 primary／AB、C|保存、送審|saved 快照、正確 scope 待審鎖定|完整 GUI＋D1 PASS|下表|
|合成 reviewer／AB、C|平台查看、退回|原頁解鎖、案件退回|完整 GUI PASS|下表|
|合成 primary／AB、C|再送審、撤回、再送審|撤回與審核退回分開；狀態一致|完整 GUI PASS|下表|
|合成 reviewer／AB、C|核准|active 工段與 PROCESS 範本生效|完整 GUI＋D1 PASS|下表|
|合成 primary／AB、C|下游產品／類別工段選單|核准工段可選；取消不改原路線|原生 GUI＋D1 PASS|未獨立 5 次計時|
|合成 reader／AB、C|直接 URL、API|可看，不顯示新增／保存；apply/save/submit/withdraw/approve/return 拒絕|12 次 API 403＋UI PASS|非速度量測|
|合成 staff／AB、C|直接 review API|approve/return 拒絕|4 次 403 PASS|非速度量測|
|合成 staff／C|明確允許 edit/save/submit/withdraw|可套用、保存、送審、撤回自己的案件|原生 GUI PASS|未獨立計時|
|合成 admin|scope GET 503／重試|原 AB 選取保留，重試 C 成功|小型真實 API 表單瀏覽器 PASS|故障測試|
|合成 admin|新增／改名 Apply 422、重試|輸入保留、stable ID 不換、讀回成功|小型瀏覽器＋SQLite PASS|故障測試|
|合成 admin|雙擊 Apply，已寫入但回應遺失|查 receipt，僅插入一次|小型瀏覽器＋SQLite PASS|故障測試|
|合成 primary／AB|Save 422 後明確重試|working 保留，第一次 saved 不變，第二次保存成功|原生 GUI＋D1 PASS|故障測試|
|合成 primary／AB|Save、Submit 已提交而 ACK 遺失|處理中／UNKNOWN 阻擋切頁；reload 後查 receipt|原生 GUI＋D1 PASS；各 1 POST、1 receipt GET，無盲目重送|故障測試|
|合成 primary／AB|未套用表單切頁、保存後切頁|未套用輸入保留；保存成功可切 C|原生 GUI PASS|故障測試|
|合成 admin|新建未使用工段刪除、空線別刪除|移除 working，其他線別不變|API＋瀏覽器讀回 PASS|追加量測另列|
|合成 admin|含子工段線別刪除、跨人競爭|拒絕並保留子工段、舊 revision 不可寫入|UI＋新舊 API PASS|未獨立計時|
|合成 a/b|受限引用明細|兩者都不能刪；無 editor.view 者看不到私人 op/version|API PASS；有權者 GUI 顯示連結|未獨立計時|
|合成 primary|1366px／390px，中越文、長名稱、Esc|表單可操作、不水平溢出、取消不套用|4 組原生 GUI PASS＋目視檢查|不適用|
|—|本模組照片上傳、搜尋、工段排序按鈕|目前線別頁無此入口|不適用；不新增功能或挪用產品搜尋結果|不適用|

### 導航實際點擊盤點

完整編譯外框的資料分頁：AB、C、line-admin、process-master、bom、users、quality-fqc、quality-iqc、quality-ipqc-ab、quality-ipqc-c、quality-mold-equipment、quality-routine-equipment、quality-routine-reports。

主導航：dashboard、player、dispatch、productStatus、editor、approval、quality-dashboard、quality-search、quality-reports、quality-inspections、quality-fpy，以及 data 入口。版本平台分頁：master、process、quality、routine。以上實際點擊與標題／URL／就緒檢查 PASS；不是其他模組所有業務功能驗收。

額外通過：同目標雙擊只一次 bootstrap；Back 尚未完成後的新 click 成功／503 回滾；舊 GET 不採用；目的地 403 保留原頁；同 ID 撤權；4 輪 dashboard/IQC 往返。intervals 5→5、全域 listeners 101→101、object URLs 0→0；timeouts 3→5，沒有測長時間趨勢或峰值記憶體，不宣稱無任何資源洩漏。IQC dirty/Save 遺失回應是共用導航證據；線別的保存／送審故障另有上表專屬驗證。

### 證據與重現

- `scripts/test-lines-cloud-api.cjs`：6 組真實 route handler/CAS/簽章 session，memory SQLite/R2。
- `scripts/test-lines-legacy-api.cjs`：未採用新版 scope 的 legacy API 子工段保護。
- `scripts/test-lines-cloud-browser.cjs`：真實表單/controller/bridge/API，外框與 VersionDraftUI 為小型替身；[結果](lines-cloud-retry-results.json)。
- `tests/lines-native-browser.test.mjs`：完整 app 原生審核／權限／UI；`LINES_RECOVERY=1` 加入故障與下游檢查；[結果](lines-native-results.json)。
- `tests/sites-delivery-browser.test.mjs`：完整外框導航；本次只增加 `CHROME_PATH` 支援；[結果](lines-navigation-results.json)。
- `tests/navigation-lifecycle.test.mjs`：既有 coordinator 回歸 PASS。
- lint、TypeScript、候選 build/post-build known-auth 檢查 PASS。程式碼自我檢視已完成；尚非 DOT 或獨立審查。

原 `test-master-ui-v3.cjs` 基準 fixture 缺 D1.batch，登入報 LOGIN_LIMIT_UNAVAILABLE；`test-master-stage-link-v3.cjs` 缺當前 dependency guard，報 422。沒有把這兩個舊 fixture 的失敗冒稱通過；本次專屬 fixture 使用目前契約。

## 效能：完整流程五輪

Node 24、同一機器 Chromium、loopback 原生 workerd、全新非持久 D1/R2。AB 初始 2 線／2 產品／2 工段；C 1 線／1 產品／1 工段。main 五輪完成後才跑候選五輪，未同時建置。候選報告的 `programCommit` 是當時 parent `a6b41a3`，尚未提交的內容以 `buildEntrySha256` 精確識別；不能把 parent SHA 冒稱完整候選原始碼。

以下是瀏覽器自動化端到端時間，非 API／DB 分層計時；新增包含填寫、套用及 D1 讀回，審核從已開啟案件的按鈕開始。原始樣本與 build hash 見 [量測](lines-native-timing.json)。正負波動混合，沒有證據宣稱全面加速。

|範圍／功能|次數|修改前中位／最慢 ms|確認目標|修改後中位／最慢 ms|中位變化（正值較快）|結果|
|---|---|---|---|---|---|---|
|first-entry|各 5|875.2 / 1690.1|基準階段，未訂新門檻|809.7 / 1258.1|7.5%|PASS|
|AB:begin|各 5|60.4 / 105.0|基準階段，未訂新門檻|67.7 / 72.8|-12.2%|PASS|
|AB:add-apply|各 5|134.4 / 210.8|基準階段，未訂新門檻|163.2 / 218.1|-21.5%|PASS|
|AB:save|各 5|70.3 / 77.5|基準階段，未訂新門檻|64.4 / 78.5|8.3%|PASS|
|AB:submit|各 5|161.8 / 204.6|基準階段，未訂新門檻|163.5 / 165.5|-1.1%|PASS|
|AB:return|各 5|120.6 / 258.3|基準階段，未訂新門檻|108.1 / 113.8|10.4%|PASS|
|AB:resubmit|各 5|163.9 / 178.5|基準階段，未訂新門檻|155.3 / 174.8|5.3%|PASS|
|AB:withdraw|各 5|105.6 / 106.8|基準階段，未訂新門檻|106.4 / 121.7|-0.8%|PASS|
|AB:submit-final|各 5|148.0 / 159.3|基準階段，未訂新門檻|148.9 / 180.2|-0.6%|PASS|
|AB:approve|各 5|168.8 / 175.0|基準階段，未訂新門檻|159.5 / 175.5|5.5%|PASS|
|C:begin|各 5|80.3 / 128.8|基準階段，未訂新門檻|73.4 / 79.2|8.5%|PASS|
|C:add-apply|各 5|141.1 / 190.4|基準階段，未訂新門檻|134.8 / 186.2|4.4%|PASS|
|C:save|各 5|59.3 / 74.9|基準階段，未訂新門檻|58.6 / 73.8|1.1%|PASS|
|C:submit|各 5|166.4 / 181.7|基準階段，未訂新門檻|153.1 / 171.0|8.0%|PASS|
|C:return|各 5|137.9 / 148.1|基準階段，未訂新門檻|109.2 / 123.7|20.8%|PASS|
|C:resubmit|各 5|169.2 / 193.6|基準階段，未訂新門檻|170.4 / 171.8|-0.7%|PASS|
|C:withdraw|各 5|110.6 / 213.4|基準階段，未訂新門檻|102.1 / 123.4|7.7%|PASS|
|C:submit-final|各 5|154.5 / 186.7|基準階段，未訂新門檻|144.9 / 160.2|6.2%|PASS|
|C:approve|各 5|160.2 / 204.4|基準階段，未訂新門檻|159.0 / 175.2|0.7%|PASS|

先前使用者已確認的兩項小型替身外框目標保留：C→AB 往返與工段開啟／確認／取消最慢 ≤150ms；候選各為 99.4ms、82.5ms，PASS，見 [先前樣本](lines-cloud-timing.json)。不得將此門檻套到不同的完整原生流程。

後續建議先以相同小型 fixture 的首次進頁最慢 2 秒、單次流程操作最慢 300ms 作候選目標，但尚未取得使用者確認，並非已承諾的效能標準。首次進頁仍最慢；尚無 API／DB 分層及實際資料量證據，因此不改共享載入策略、不引入過期快取。正式資料量與網路的目標另訂。

## 追加量測：重新進頁、範圍及編輯刪除

同一原生 fixture 中各 5 個循環，main 完成後才跑候選；每次新建未用工段、改名保留 ID、刪除後讀回，恢復等量資料。量測包括操作與驗證；下表不與前面的五次全新 fixture 冷啟動混為同一批。詳見 [原始樣本](lines-native-extra-timing.json)。刪除欄包含 UI 確認／引用保護／寫入／讀回，尚未拆分引用查詢成本。

|功能|各次數|修改前中位／最慢 ms|目標|修改後中位／最慢 ms|中位變化|結果|
|---|---|---|---|---|---|---|
|reload-existing-draft|5|388.9 / 421.6|基準階段|404.8 / 417.8|-4.1%|PASS|
|sidebar-data-to-lines|5|199.9 / 226.6|基準階段|211.1 / 230.9|-5.6%|PASS|
|data-tab-to-lines|5|99.0 / 116.5|基準階段|100.1 / 101.5|-1.2%|PASS|
|scope-to-C|5|52.2 / 55.9|基準階段|49.0 / 52.2|6.3%|PASS|
|scope-to-AB|5|34.4 / 35.7|基準階段|30.7 / 51.8|10.7%|PASS|
|open-filled-stage|5|38.5 / 41.5|基準階段|42.1 / 43.3|-9.6%|PASS|
|AB:new-stage-apply|5|189.6 / 198.0|基準階段|185.0 / 205.7|2.4%|PASS|
|AB:rename-apply|5|183.7 / 199.4|基準階段|174.2 / 189.5|5.1%|PASS|
|AB:unused-stage-delete-with-check|5|147.0 / 149.5|基準階段|143.0 / 158.6|2.7%|PASS|
|C:new-stage-apply|5|191.9 / 196.4|基準階段|189.1 / 200.8|1.4%|PASS|
|C:rename-apply|5|152.7 / 182.5|基準階段|122.0 / 157.3|20.1%|PASS|
|C:unused-stage-delete-with-check|5|126.5 / 134.4|基準階段|77.6 / 141.1|38.6%|PASS|

## 預覽與交接方式

新增 `scripts/preview-lines-cloud.mjs`，重用原生 fixture，可操作真實 app；只聽 127.0.0.1 隨機埠，DB／R2 全新非持久、外連封鎖。四個合成帳號 frank/reviewer/reader/staff；隨機密碼只寫忽略的 `.sites-runtime/.../preview-access.json`，0600，不進 Git。Ctrl+C 會關閉並刪除該密碼檔。已驗證登入及 AB 權威讀取；沒有連接既有站台。

重現（從本分支，Node ≥22.13 與 Chromium）：

```sh
npm ci --ignore-scripts
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) npm run build
LINES_RECOVERY=1 PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) node tests/lines-native-browser.test.mjs
LINES_EXTRA_TIMING=1 PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) node tests/lines-native-browser.test.mjs
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) node scripts/preview-lines-cloud.mjs
```

可用 `CHROME_PATH` 指定 Chromium。launcher 輸出本機網址、密碼檔路徑、programCommit、build hash；build 與啟動必須來自同一乾淨 checkout。這是給具備此工作環境的人員使用的本機預覽，**沒有可交給使用者的公開預覽網址**。初始預覽提供 AB/C active 與不同權限帳號；草稿／待審／退回等可操作產生，未宣稱所有狀態與引用已預載。

## 仍未完成／整合條件

- 沒有 Sites 公開預覽發布工具；獨立 hosted DB／附件／帳號與可公開開啟網址尚未建立。不能用本機網址或截圖代替此驗收。
- 既有 Site `/login` 只讀請求被 proxy 403 擋下，無法核對其實際 commit／真實 Frank 權限或真實資料速度；不得假定與 main 相同。
- 實體手機／原生中文越文 IME、長時間 soak／記憶體趨勢、較大資料量、每個權限 cell 的所有允許／拒絕組合、完整歷史回放政策、所有刪除取消／離頁選擇組合仍未全覆蓋。
- 引用檢查與刪除確認目前是同一次操作路徑，未拆出伺服器處理與 DB 時間；下游更新、保存並離頁等也未全部各做五次獨立計時。
- PR 依使用者最新指示延後，並非需等待 PR 才能做本地工作。先前 GitHub REST/GraphQL `Forbidden` 已記錄；Git HTTPS 分支推送可用。未嘗試重新建立 PR、未通知 DOT。

建議 DOT：先協調權限／共用草稿分支與本次重疊檔；保留本次 stable-ID 重試及新舊 API 刪除檢查，再核對權限回應過濾與 scope 回呼；安排公開隔離預覽及剩餘驗收後由使用者審閱。無資料遷移、無新增正式站設定；本機 fixture 不得搬入業務資料庫。
