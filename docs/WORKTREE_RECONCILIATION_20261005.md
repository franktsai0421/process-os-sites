# 三份舊工作副本核對

2026-10-05；目標分支 `codex/ipqc-ab-local`，核對基準 `9811630`。核對結果及測試修正已提交於`cf7218a`。其後使用者授權清理下列三份舊副本；備份驗證後已移除，未處理目前 Local 業務資料。

| 來源 | 舊 HEAD | 未提交項目 | 核對結果 |
| --- | --- | --- | --- |
| `.worktrees/ipqc-c-local` / `codex/ipqc-c-local` | `1312189` | 6 修改、10 新檔 | IPQC-C 的模組、API、照片、入口、審核、解析與工具均已在目前分支；現版另含 V3、檢具、頻率規則及權限防護。 |
| `work/editor-final-clean` / detached HEAD | `8f9ebab` | 4 修改 | 當年的 package／文件衝突解決及瀏覽器儲存競爭測試已在現版；保留新版測試的有效 BOM／產品關聯 fixture。 |
| `work/editor-image-preview` / detached HEAD | `d232120` | 12 修改、3 新檔 | 草稿恢復、等待儲存完成、避免重複版本、照片、雙語及相關測試已被現版包含或延伸。 |

35 個來源檔案項目均在目標目錄有對應檔案；不是 35 個缺失功能。三個 IPQC-C 來源工具（audit、read、seed）與現版逐 byte 相同，本次只比對，未執行工具。兩份 editor 的 Playwright 版本皆為 1.62.1，現有 lockfile 沒有缺少其套件，無需降版或重裝。

## 保留現版的具體理由

- IPQC-C 舊入口只有 IPQC-C；現版另含 IQC／IPQC-AB。不能用舊檔覆蓋掉新入口、共用控制區、V3 legacy fence、records 支援及照片權限。
- 舊 editor 同步沒有目前帳號隔離及 stale-key 防護；舊 Save 判斷僅處理 `false`，現版要求伺服器明確成功。現版舊草稿恢復會重繪控制區，並由 V3 接管已啟用範圍。
- 現版照片測試保有舊情境，另有 smoke 入口；儲存競爭測試包含兩次寫入期間的修改、BOM、照片、位置、連線、重開及重新登入。
- 舊歷史說明已保留於 `docs/archive/CHANGELOG_THROUGH_20261003.md` 的 2026-09-17 製程與 2026-09-26 IPQC-C 紀錄。現在的模組及資料模型文件不改回舊描述。

## 本次實際修改與驗證

僅更新 `scripts/test-ipqc-c-api-fixture.cjs`：原測試已落後於非 BOM 匯入維護限制。隔離 fixture 使用隨機維護憑證，新增無憑證 ADMIN 拒絕、拒絕後資料不變及有憑證但非 ADMIN 仍拒絕的斷言；照片 R2 mock 補上 byte-read 介面。沒有變更正式 handler、權限或匯入規則。

- PASS：`node scripts/test-ipqc-c-api-fixture.cjs`，記憶體 SQLite／R2；維護初始化、冪等、權限、revision 衝突、編號、舊流程送審／撤回／審核、FQC 隔離與照片。
- PASS：`node scripts/test-editor-draft-persistence.cjs`，8 次隔離寫入；A/B/C 完整快照、照片、等待 Save、重複版本防護與較新草稿重開。
- 沿用前一階段未變動來源的完整瀏覽器儲存競爭、帳號隔離、V3 authoring 及1366／390中越提示證據，沒有重跑全部 T01–T45。
- 來源 SHA-256 清單保留在本機 `.wrangler/local-only/worktree-reconciliation-20261005/manifest.json`；提交前再驗證來源35項皆未改動。

本次無產品功能／資料模型變更，不代表 V3 整體完成。

## 後續授權清理

- 三份來源完整原始碼、未提交內容、舊`.wrangler`資料及驗收產物共3,019檔已備份到專案外，逐檔SHA-256核對一致；每份另有通過`git bundle verify`的完整HEAD歷史包。只排除可重建的`node_modules`及`.next`，套件連結另有記錄。
- 備份位置與精確清單見本機`.wrangler/local-only/worktree-reconciliation-20261005/archive-receipt.json`及其指向的`manifest.json`；備份含私人Local資料，不上傳Git。
- 已移除表列三個工作目錄與Git worktree登記；確認祖先關係後刪除已合併的本機`codex/ipqc-c-local`分支。兩個detached HEAD的歷史由bundle保留。
- 目前專案的`node_modules`與Local資料保留；兩個舊套件junction只刪連結本身。Local3000唯讀HTTP檢查回應200。
- 此階段未清理其他worktree；不push、不部署，不為清理重跑功能測試。

## 後續本機分支簡化

依使用者再次授權，核對`6043e22`的分支祖先關係後，本機僅保留日常開發分支`codex/ipqc-ab-local`與規則要求保留的`main`。

- 其餘11個分支全部已是目前HEAD的祖先，只刪除多餘本機分支名稱，commit歷史仍在目前分支。
- `codex/per-user-drafts-pr11`的個人草稿方案已淘汰，其不同歷史封存於備份後移除本機名稱；沒有將舊方案重新套入V3，也不宣稱該分支所有commit已合併。
- 刪除前建立含全部14個本機分支的獨立Git bundle，驗證bundle、全部ref／SHA及檔案雜湊。復原資訊見本機`.wrangler/local-only/worktree-reconciliation-20261005/branch-archive-receipt.json`與專案外備份manifest。
- 遠端分支、目前程式、業務資料及57個未追蹤本機附件均未更動。現存`main`與`draft-workflow-loading`工作目錄保留。
