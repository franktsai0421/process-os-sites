dispatch.view-only 原可直接 POST 更改 dispatchBoard。後端增加 dispatch.edit 必要條件，前端發送與槽位按鈕同步限制；其他 shared-state 寫入規則不變。

發送介面查看不能寫入。本分支以 `cloud/lines-scope-rights-29102026` 為比較基準，僅檢視這一層差異；上層相依分支須先核對，不能將每個分支都改以 main 比較而當作獨立無相依變更。

使用者已確認明確勾選授權、保留既有資料與保護。本輪完整編譯瀏覽器版本為 `4b8c0d2ba5e6642f67eb13725a4c5212f4f5c9e6`，只用合成帳號與非持久 D1/R2。對應測試、前後速度、實際檔案、相依及未測範圍見 `docs/acceptance/USERS_CLOUD_CLEAR_RIGHTS_29102026.md` 和結果 JSON。此分支本身未逐一單獨 build，不能以最上層組合驗收當作所有中間分支獨立通過。

Draft only：未合併、未發布，既有測試站／正式站未改。外部預覽及 GitHub API 目前受環境限制。需 dot 核對與其他任務重疊後，再做整合版本回歸。最終驗收文件在 `cloud/permissions-verified-29102026`。

產品檔案範圍：

- `app/api/shared-state/route.ts`
- `public/process/index.html`
- `public/process/permission-controls.js`
- `public/process/version-workflow.js`
