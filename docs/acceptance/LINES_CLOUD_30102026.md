# 線別與工段管理 CLOUD 30102026 — 未完成／阻擋整合

基準：main `a870fc5882a1ec6ebe3308e540c1c69282e05dc1`。
分支：`codex/lines-stages-cloud-30102026`。獨立工作目錄 `/workspace/lines-stages-cloud-30102026`。
本文件是候選交接，並非完整需求驗收或發布授權。未通知 dot。

## 本次修復

- `master-admin-ui.js`、`master-data.js`：移除新版及舊版「新增線別」按鈕／事件；保留新增工段與既有合法 API。
- `master-admin-ui.js`：線別仍有子工段時顯示工段代碼並阻擋刪除。
- `master-workflow.ts`：真正寫入時以此次 CAS 的 previous 檢查子工段，不能以無外部引用為由連帶刪除。錯誤碼 `LINE_HAS_STAGES`；沒有 schema／資料遷移。
- 範圍切換等待回應時捕獲原控制項、原 scope、頁面、身分與 identity epoch；離頁／換人後不改 scope 或重繪。使用現有 `MasterDataWorkflow.canLeave()` 拒絕忙碌時切範圍，不新增共用導航機制。
- `index.html`：只更新上述兩支腳本的 cache version。

## 相依與重疊

已用 Git 讀取 `cloud/lines-scope-rights-29102026`，tip `2dddf1028fc67b9cac5e2b1bb8e6717e7584e552`；它以使用者權限系列為基礎，包含 master-data.js 線別共用 scope 權限說明。沒有 cherry-pick、重新實作權限頁或納入其他模組修改。
AB/C 與線別共用 master scope，因此本次安全刪除驗證也影響同 scope 的 API 寫入。master-admin-ui.js、master-data.js、index.html 是與 AB/C／草稿／導航任務的重疊檔案，需 dot 逐段合併。
現有流程對新增／刪除有效工段會連動必要 PROCESS 範本；PROCESS 有草稿或待審時保留既有阻擋。歷史引用規則沒有擴大或移除：現有掃描不是所有歷史狀態一律阻擋，完整歷史政策待確認。

## 驗收證據與邊界

`scripts/test-lines-cloud-api.cjs`：記憶體 SQLite/R2，真實 route handler、簽章 session、CAS；非 hosted Worker。五組通過：子工段阻擋、未使用工段及空線別刪除、跨人競爭、完整審核序列、隱藏畫布／類別／產品引用。
`scripts/test-lines-cloud-browser.cjs`：Chromium、真實 master controller／表單／bridge／API 與登入；外框與 VersionDraftUI 小型替身，因此不宣稱全站外框或版本確認平台 GUI 通過。測試帳號為 admin；未使用真實 Frank 或既有業務資料。
`tests/navigation-lifecycle.test.mjs`：現有 coordinator 回歸通過；不代表左側每一按鈕實際點擊通過。

|身分|操作|預期畫面／資料|實際／狀態|耗時|
|---|---|---|---|---|
|隔離 admin|開始修改|顯示工段編輯鈕、建立 AB 共享草稿|瀏覽器通過|未單獨計時|
|隔離 admin|AB/C 往返|正確 scope、線別不合併|瀏覽器通過|見 JSON，5 次|
|隔離 admin|開啟既有工段|名稱填入可編輯|瀏覽器通過|見 JSON，5 次|
|隔離 admin|新增工段、雙擊套用|只插入一次、未核准不改 active|瀏覽器與 API 通過|未單獨計時|
|隔離 admin|刪除新建未使用工段|移除 working，重新讀取確認|瀏覽器與 API 通過|未單獨計時|
|隔離 admin|刪除含子工段線別|提示、資料保留|瀏覽器與 API 通過|未單獨計時|
|隔離 a/b|檢查後新增子工段再刪線別|舊 guard 拒絕，子工段保留|API 通過|未計時|
|隔離 a/reviewer|保存→送審→退回→再送審→撤回→再送審→核准|每個狀態正確；核准前 active 不變，核准後範本連動|API 通過；平台 GUI 未測|未計時|
|隔離 fixture|隱藏畫布、類別、產品引用|stable code 找到具體 op／route|掃描器通過；全面 ACL／引用明細未測|未計時|
|隔離 admin|C 回應延遲時切到產品頁|保留目的頁與 AB scope|瀏覽器通過|非速度量測|
|隔離 admin|中文／越文、390px|頁面無水平溢出|瀏覽器通過；實體手機／原生 IME 未測|不適用|
|—|本模組照片上傳|目前表單無上傳欄位|不適用，未新增功能|不適用|
|—|首次進頁、重新整理、再次進頁|完整資料與可操作|未做真實完整外框驗收|未測|
|—|所有左側導航與資料後台分頁連點|latest intent、URL/title/content 一致|未逐項實點；僅 coordinator 回歸|未測|
|—|慢網失敗重試、長時間停留、反覆進出、listener／poll 增長|可恢復、不累積|未完整驗收|未測|
|—|未套用輸入離頁取消、保存／送審逾時恢復|保留輸入、查 receipt 再重試|保留既有機制；本次未完整驗收|未測|
|—|改名、排序、重載、下游 AB/C 菜單更新|stable ID 與 effective 正確|未完整瀏覽器驗收|未測|
|—|Frank／其他 admin／一般人逐動作允許與拒絕|UI／直接 URL／API 權限一致|未做完整矩陣|未測|
|—|歷史保護全盤點、引用明細連結及無權者遮蔽|不洩漏、不自動解除|未完成，需與權限任務協調|未測|
|—|新增失敗輸入保留、保存並離頁、完整版本平台查看／修改／審核|整個流程可操作|未完整 GUI 驗收|未測|

## 速度

JSON 內是實際瀏覽器自動化端到端批次時間，不是 API 或資料庫時間。每 scope 只有 1 產品／1 工段；scope-C 標籤實際是 C→AB 往返，open-stage-edit 包含開啟、欄位確認及取消。不能拆成單向耗時，也不能當作原需求每項精確 click-to-ready 計時。完整各步 5 次、較大資料、分 AB/C、API/DB 分層仍未完成。

使用者已確認分階段目標：這兩項小型 fixture 最慢 150ms；不宣稱本次已完成效能優化。未為速度刪除權限、引用、CAS 或歷史防護。

## 外部阻礙／待交接

- GitHub GraphQL 和 REST PR 列表均 `Forbidden`；無法確認開啟 PR 或建立 Draft PR。Git HTTPS fetch 可用。推送結果另見交付回覆。
- 既有 Site `/login` 只讀請求被 proxy 403 拒絕，無法核對既有站台 commit；不得假定與 main 一致。
- 沒有 Sites／公開預覽發布工具，未建立公開可操作預覽、獨立 hosted DB／附件／帳號。沒有覆蓋既有 Site。
- 原 `test-master-ui-v3.cjs` 基準失敗：fixture 無 D1.batch，登入 LOGIN_LIMIT_UNAVAILABLE；原 `test-master-stage-link-v3.cjs` 缺當前 dependency guard，422。保留原檔；本次專屬 fixture 補齊對應契約。
- 建議 dot 先核對權限與共用草稿分支，合併本次模組入口／刪除保護，再比對 scope 回呼保護；完整 preview、權限矩陣、導航／審核 GUI 與效能表完成前維持阻擋整合。

|頁面／範圍|功能／按鈕|條件與次數|修改前中位／最慢 ms|確認目標|修改後中位／最慢 ms|改善幅度|功能結果|
|---|---|---|---|---|---|---|---|
|線別工段|C→AB 往返|小型合成資料，5 次|84.1 / 134.9|最慢 ≤150ms|48.6 / 99.4|42.1%|PASS；不推定真實資料速度|
|線別工段|工段編輯開啟／確認／取消|小型合成資料，5 次|89.4 / 119.9|最慢 ≤150ms|66.5 / 82.5|25.5%|PASS；不推定真實資料速度|

樣本見 [原始量測](lines-cloud-timing.json)。數值波動不作效能改善主張；本次修復以正確性為主。

最終檢查：npm run lint、npx tsc --noEmit PASS；候選 build 與 post-build known-auth 檢查 PASS；完整全站瀏覽器驗收仍未完成。
