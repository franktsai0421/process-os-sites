# 私有完整開發資料包

目前已接受 42de 原程式 ZIP／rev495 的 I2 完整首次匯入、正常私有 ADMIN 與三 DEMO 登入／登出及限定唯讀 GUI；f722 完整容量 TEST 更新、重複、拒絕與恢復另有分項證據。這些不代表 Git clone、原業務資料更新或新版 ZIP 冷安裝已通過。原 rev495 含既有 pending／草稿時仍應拒絕更新，不清理原資料。工程來源：17e06098a104…（1,560 檔；`Temp/sol61-i1-u1-execution-root-20261017/current-u1-source-checkpoint-v5.json`），完整容量更新器行為證據另屬 f722。17e0 的啟站程序已將本程序 SIGINT／SIGTERM 清理順序化：先等候既有 Vite／公開資料引擎與 HTTP 關閉及租約釋放，再透過原 EventEmitter 執行原有回呼。原安裝執行環境 Node 24.19.0 的實際正常啟站／關站已通過；七個自有程序全部退出、主程序回傳 0、無強制停止，私有安全檔未變。69 項純時序控制與該檔 lint 0 另有證據。這不證明全部 SDK 私有佇列或舊版原生失敗根因；舊失敗保留。直接證據依唯一索引的 `serialized-signal-normal-root-actual.json`。 配對包只作私有 TEST 保存，不代表正式發布或全站驗收。實際來源／建置清單、程式／資料 ZIP、版本、大小、SHA-256 及另一代理的實際核對結果，以外置 `PAIR-RESULT.json` 與唯一交接索引為準。資料固定為使用者接受的 2026-10-14 rev495，不混入 QA 站或日常3000；新版 ZIP 全新匯入及 Git clone 尚未重跑。 當前狀態依 [HANDOFF](../../HANDOFF.md)及其唯一索引。

此包與 canonical 協作資料分開。它包含指定快照的目前資料、全部歷史、草稿、送審／核准案件、角色與個人 overrides、feedback 與全部索引 R2 objects；不作為 Git 種子，也不傳送到雲端。

分發包只包含該次經獨立驗證的資料目錄、`static-assets/` 與分發 README。資料目錄名稱與 manifest SHA-256 必須取自同一次交付的 README／最新交付指標，不沿用舊包路徑；還原命令中的 `<私有包目錄>` 指向該資料目錄。禁止分發 inspection-copy、acceptance-target、早期失敗包、診斷或來源帳密。production 密碼、hash、session、token、簽章 secret 已移除；原身份與權限保留。正式帳號不沿用 production 密碼。

移除登入憑證不代表匿名化。完整 runtime 資料仍包含原帳戶的業務身分、角色／個人權限、ownership、歷史、feedback 與媒體，只能依明確授權的接收者及資料範圍私下提供。可先選擇只交程式／建置與合成資料；需要完整業務快照時，須另外確認接收者與上述內容範圍，不自動公開或上傳。

原始參考 Excel 不屬於 runtime 資料包；人物圖片、供應商聯絡及作者／編輯者 metadata 的散發須另行決定，不能因完整性／安全格式檢查通過就視為已獲准。必要歷史及原件保留；若選擇最小化衍生包，須另建並驗證，不能宣稱現有完整包已匿名化。

在核對過的程式 ZIP 或 checkout，使用全新、短的本機程式目錄，完成 `npm ci --foreground-scripts`；尚未啟動 dev、尚無 `.wrangler` 時執行：

```powershell
node scripts/dev-package-restore.mjs --package "<私有包目錄>" --manifest-sha256 <獨立核對的manifest SHA256>
```

工具先驗 manifest、資料庫、所有 objects 與已列來源相依檔；再原子取得全新本機 storage，使用 checkout migrations 建立實際 Miniflare D1／R2。所有 rows、objects 內容與 metadata 均回讀核對。個別 object 上限 64 MiB；超限在寫入前停止，不跳過。chunks 編碼仍不支援，須另行審查而不能冒稱可還原。

成功時只在忽略的 `.wrangler/local-only/private-development-login.json` 產生獨立開發用 **ADMIN** 帳號（`role: admin`、`inheritRole: true`、密碼驗證）；它與 demo-admin、Frank 都分開。這不是一般員工權限。原身份、角色、其他 business values 及歷史不變；新帳號使用 revision／values CAS 新增。新的 session secret 只在目標環境產生。建立此帳號及還原仍須符合該次明確授權，不能把本文件視為重試遭拒操作的批准。請保護此登入檔，不提交或加入資料包。

已有 storage、Cloudflare 憑證／remote 環境、checksum 不符、未知 schema 欄位、相依檔不符均拒絕。失敗副本保留 `development-package-incomplete.json`；自動初始化與 session 啟動會拒絕它。先保全失敗目標及輸出，再依診斷與適用授權決定修復或新的全新目標；不能移除 marker 強行啟動或覆蓋既有資料，也不自動重試匯入。

每次交付應分列最終程式來源、實建輸出、資料快照時間點／revision、各 manifest／archive 雜湊及獨立核對結果，並分開記錄真實 npm ci、全新目標匯入、正常 GUI 登入與 DEMO 開關驗證。舊來源的匯入成功、留用 QA 站台與靜態工具審查不可改標為新包接受；缺實際收據的欄位維持未驗，不填推測雜湊。首次安裝、來源更新、Canonical 同步與全庫失敗恢復各自遵守其目標／資料保全界線，完整私有快照不作覆蓋已有新寫入的更新捷徑。

`development-package-receipt.json` 的 Miniflare 還原 PASS 不等於 session middleware、GUI、跨電腦、實體手機或正式遷移通過；這些必須各自有證據。來源新鮮度僅適用包的明確快照與核对時間。[本次證據](20261014-github-upload.md)記錄具體版本、驗收及限制。

## 第一次安裝與登入

先核對同一次交付的程式來源、資料 manifest 與雜湊，依 package engines 使用支援的 Node，在全新、短的本機程式目錄執行 `npm ci --foreground-scripts`。保留交付 lockfile 與安裝腳本；依賴安裝失敗時先保存完整輸出並查明原因，不停用腳本或安全檢查求通過。若要匯入此完整快照，必須先完成上方還原命令，再 `npm run dev` 並開啟輸出的 loopback URL 加 `/process/`。不要先啟動 dev：空白環境的正常啟動會初始化 Canonical，之後完整快照匯入會因已有 storage 而拒絕。相依檔或 checksum 不符時停止，不修改 manifest 假裝相容。

Windows 顯示路徑與原生實體路徑可能不同。實際儲存路徑須符合該版工具與固定 SDK 的路徑預算；新版匯入器在寫入前檢查，舊包不能沿用此新防護聲明。不要調整長路徑政策、使用連結或替換 manifest 繞過。驗收使用的指定埠與外部程序時窗不等於一般 `npm run dev` 自帶自動收尾功能。

原業務身分保留不代表原密碼仍可用。先由獲授權的環境管理者在本機讀取目標 `.wrangler/local-only/private-development-login.json`：`id` 是正常登入帳號，`password` 是該目標產生的隨機密碼。若編輯器開出空白，停止且不要儲存新檔，由管理者核對同一檔案的實體路徑；不要重設密碼或再建帳號。一般員工的密碼與角色必須經既有、獲授權的管理流程設定，不共用這個 ADMIN，也不把登入檔放進聊天、Git 或分發包。原日常帳密不搬到開發站。

DEMO 是 `demo-admin`、`demo-rd`、`demo-staff` 三個測試快捷身分，與正常密碼登入不同。它們必須已是有效的 DEMO 身分，且環境開關允許，才可使用；`DEMO_LOGIN_ENABLED=false` 時應拒絕快捷登入及舊 DEMO session。不得為通過驗收更換身分、放寬開關或停用撤銷檢查。[Local 協作規則](../../AI_CONTEXT/LOCAL_DATA_COLLABORATION.md)維護空白初始化與 DEMO 的唯一共同規則。

## 後續更新與失敗還原

完整私有資料快照的新版更新入口與交易保全契約見[離線完整快照更新](OFFLINE_SNAPSHOT_UPDATE.md)。目前實作驗證中；成功的完整容量更新、重複執行、衝突阻擋及中斷恢復須各有實測收據，不能用拒絕測試代替成功更新。

先停止該目標的自有 Local server，保全尚未同步的輸入，依[備份／還原規則](../../BACKUP_AND_RESTORE.zh-TW.md)保存 D1／WAL／SHM、R2、草稿／歷史及必要 Local 設定，並核對可還原證據。更新已批准的程式與 lock 後安裝相依；不要刪除或重建既有 `.wrangler`，也不要對它重跑此全新環境匯入工具。完整資料包是時間點快照；後續程式更新、Canonical 協作與持續多人同步是不同流程。

既有資料庫若需要啟用 feedback／session revocation，使用明確的 `scripts/local-feature-upgrade.mjs` 流程，要求停止的目標 port、當前 `--expected-revision`、`--expected-values-hash` 與全新 `--backup-directory`。不得從舊快照猜這些值，也不手動套 SQL 或放寬失敗檢查；此處沒有授權在任何既有環境執行升級。

首次匯入失敗時保留新副本、incomplete marker 與失敗收據，不啟站、不移除 marker 或自動重試。程式更新失敗時保留新舊來源及診斷，回到已核對相容的來源；若 schema／資料已改動或已有新業務寫入，先完整保全現況，再按正式備份／還原與 CAS 規則處理，不以舊整庫覆蓋新寫入。上述操作說明經來源契約核對，不代表目前新候選已完成乾淨安裝、匯入、登入或裝置驗收。
