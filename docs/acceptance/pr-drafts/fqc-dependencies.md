實際 FQC 頁載入還要讀 AB 生效主檔及檢具目錄，單勾FQC會失敗。將既有 AB／檢具查看依賴明列於設定、保存驗證及載入錯誤，不擴張目錄API或自動補勾。

FQC 既有目錄查看依賴明列。本分支以 `cloud/dispatch-write-rights-29102026` 為比較基準，僅檢視這一層差異；上層相依分支須先核對，不能將每個分支都改以 main 比較而當作獨立無相依變更。

使用者已確認明確勾選授權、保留既有資料與保護。本輪完整編譯瀏覽器版本為 `4b8c0d2ba5e6642f67eb13725a4c5212f4f5c9e6`，只用合成帳號與非持久 D1/R2。對應測試、前後速度、實際檔案、相依及未測範圍見 `docs/acceptance/USERS_CLOUD_CLEAR_RIGHTS_29102026.md` 和結果 JSON。此分支本身未逐一單獨 build，不能以最上層組合驗收當作所有中間分支獨立通過。

Draft only：未合併、未發布，既有測試站／正式站未改。外部預覽及 GitHub API 目前受環境限制。需 dot 核對與其他任務重疊後，再做整合版本回歸。最終驗收文件在 `cloud/permissions-verified-29102026`。

產品檔案範圍：

- `public/process/access-policy.mjs`
- `public/process/bootstrap.js`
- `public/process/fqc-master.js`
- `public/process/index.html`
- `public/process/user-access.js`
