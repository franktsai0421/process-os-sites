原矩陣難辨角色繼承與個別覆寫，且 edit 隱含可還原歷史。改成四個常用欄位＋詳細展開、來源標籤與保存前差異；後端新增明確 restore 與依賴檢查。保留原151格、Frank身分、一般admin授權上限與資料歷史。

使用者設定、角色範本與還原授權基礎。本分支以 `main` 為比較基準，僅檢視這一層差異；上層相依分支須先核對，不能將每個分支都改以 main 比較而當作獨立無相依變更。

使用者已確認明確勾選授權、保留既有資料與保護。本輪完整編譯瀏覽器版本為 `4b8c0d2ba5e6642f67eb13725a4c5212f4f5c9e6`，只用合成帳號與非持久 D1/R2。對應測試、前後速度、實際檔案、相依及未測範圍見 `docs/acceptance/USERS_CLOUD_CLEAR_RIGHTS_29102026.md` 和結果 JSON。此分支本身未逐一單獨 build，不能以最上層組合驗收當作所有中間分支獨立通過。

Draft only：未合併、未發布，既有測試站／正式站未改。外部預覽及 GitHub API 目前受環境限制。需 dot 核對與其他任務重疊後，再做整合版本回歸。最終驗收文件在 `cloud/permissions-verified-29102026`。

產品檔案範圍：

- `app/api/user-access/route.ts`
- `lib/draft-restore-access.ts`
- `lib/user-access.ts`
- `lib/versioned-shared-workflow.ts`
- `public/process/access-policy.mjs`
- `public/process/bootstrap.js`
- `public/process/index.html`
- `public/process/shared-draft-client.js`
- `public/process/user-access-initial-read.js`
- `public/process/user-access.css`
- `public/process/user-access.js`
