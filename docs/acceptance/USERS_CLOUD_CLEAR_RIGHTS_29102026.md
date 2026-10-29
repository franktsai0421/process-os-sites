# 清楚設定權限 — 已授權修正候選，未部署

2026-10-29 使用者確認四欄主表＋詳細展開、獨立還原授權、保存／送審分工與實際驗證。延續 `cloud/users-permissions-29102026`；開始基準與本輪確認的 origin/main 均為 `2cac307f29b8017a2bb6dc5229d47720f2deab33`。不改真帳號、真資料、既有站台或並行模組。

## 共用與使用者設定

- 使用者設定與角色範本分開；Frank 管理角色，其他 admin 的授權上限、自己／其他 admin 保護不變。
- 有效權限只顯示一份。主表查看／編輯／保存／送審，詳細展開其餘項目及列全選；收合顯示已允許名稱。每格標示角色／個別來源，可恢復繼承；保存前列出值、來源及角色差異。
- 詳細顯示必要條件，新增／刪除／還原依既有工作流需要查看＋編輯。伺服器拒絕新引入的不完整組合；既有 edit 依賴落差不會被自動改寫或阻擋無關欄位調整。view 依賴沿用原保護。
- 新增 11 個 `*.restore`，共 162 個 catalog 格。Frank 保持最高權限；其他帳號預設不自動取得新還原權限，須明確角色或個別授權。原有 151 格及儲存 JSON 不被批次重設。這是刻意收緊原 edit 隱含還原的能力，整合前須由 Frank 核對適用角色。
- 共用 workflow 還原預覽及 POST 都要求還原權限；實際套用後、持久寫入前比較新增／刪除差異。包含 tombstone 刪除、重新啟用已刪資料與 map 型集合；沒有該操作格的 BOM 仍依本模組編輯／還原語義。保留 adapter 原有更嚴格條件、pending、CAS、引用與歷史。IPQC-C 獨立 route 的修復另交接；IPQC-AB 整份 module restore 本來不支援，不新增該業務能力，單 scope 還原受新檢查。
- 共用影響檔案：access-policy、user-access API、versioned-shared-workflow、draft-restore-access、shared-draft-client；bootstrap/index 僅資源版本。沒有改共享保存核心、schema 或資料庫 migration。

## 第一階段證據

- `test-user-access.mjs`：原帳號／角色／會話隔離回歸及新增依賴 API 拒絕檢查。
- `test-users-cloud-browser.mjs`：17 組 Chromium 模組 UI＋真 handler／隔離 SQLite/R2 已通過；含 1440／390 越文畫面、IME 模擬、重複提交、逾時、舊回應、保存後讀回與角色 CRUD。不是全站導航驗收。
- `test-draft-restore-access.mjs`：IQC、FQC、equipment、IPQC-AB 的實際 handler，缺還原／缺刪除拒絕且不改資料，具權限成功；另檢查 resurrection／重排比較。
- TypeScript 檢查通過；lint／build／完整編譯 app 的後續結果完成後補齊。未部署／未合併。

不同業務模組的按鈕／權限修復以相依分支分開提交，避免將全部修復混入使用者模組 PR。最終驗證、版本、時間及交付限制待後續補齊，不把目前進度當成完整驗收。
