# 離線完整資料快照更新（限定 TEST 驗收與交付狀態）

此流程是取得 Frank 核准發布的資料快照後，在員工本機更新完整業務資料。它不與 Local 3000 即時同步，也不提供自動上傳或公開下載。首次安裝依[完整私有資料包](PRIVATE_DEVELOPMENT_PACKAGE.md)；Canonical 的 data:sync 仍依[Local 資料協作](../../AI_CONTEXT/LOCAL_DATA_COLLABORATION.md)，不要混用。

## 目前狀態

f722 隔離完整容量 TEST 已完成 A→B、同包重複、修改／草稿／pending 拒絕與完整實體還原、階段匯入失敗恢復，以及 NEW_ACTIVE 後真正由完整備份複製恢復並完整讀回。各項只依其實際版本與收據接受，不代表所有中斷時窗或正式業務資料更新已通過。

工程來源：17e06098a104…（1,560 檔；`Temp/sol61-i1-u1-execution-root-20261017/current-u1-source-checkpoint-v5.json`），完整容量更新器行為證據另屬 f722。17e0 的啟站程序已將本程序 SIGINT／SIGTERM 清理順序化：先等候既有 Vite／公開資料引擎與 HTTP 關閉及租約釋放，再透過原 EventEmitter 執行原有回呼。原安裝執行環境 Node 24.19.0 的實際正常啟站／關站已通過；七個自有程序全部退出、主程序回傳 0、無強制停止，私有安全檔未變。69 項純時序控制與該檔 lint 0 另有證據。這不證明全部 SDK 私有佇列或舊版原生失敗根因；舊失敗保留。直接證據依唯一索引的 `serialized-signal-normal-root-actual.json`。 配對包只作私有 TEST 保存，不代表正式發布或全站驗收。實際來源／建置清單、程式／資料 ZIP、版本、大小、SHA-256 及另一代理的實際核對結果，以外置 `PAIR-RESULT.json` 與唯一交接索引為準。資料固定為使用者接受的 2026-10-14 rev495，不混入 QA 站或日常3000；新版 ZIP 全新匯入及 Git clone 尚未重跑。

TEST 資料包必須標示 TEST，不能當作最新正式業務資料。原 2026-10-14 rev495 快照與原件保留；其中既有 pending／草稿仍應使註冊／更新拒絕，不清除它們來取得通過。42de 的首次 ZIP／登入 GUI 與 f722 的更新證據分開，不外推成新版本冷安裝通過。當前階段與版本界線依 [HANDOFF](../../HANDOFF.md)及其唯一索引。

## 更新前

1. 收到同次程式版本、資料目錄、發布版本清單及管理者核對過的命令 JSON／SHA-256；不得自行把 approved 改成 true。核對目前版本、目標版本與程式相容性。
2. 使用此版本指定的 Node、lockfile 與 SDK；在短的本機路徑安裝。實際 Windows 儲存路徑超過支援預算或 SDK 來源不符時，必須在寫入前停止。不要調整系統長路徑設定或用連結繞過。
3. 先在正常畫面處理未儲存表單，正常停止本機開發站及其他資料工具。更新器不讀取瀏覽器緩衝，也不猜測應否捨棄。
4. 本機若有修改、草稿、待審或未知狀態，先停止更新並交管理者核對；不重設資料、不刪草稿、不自行合併。

## 命令與判讀

在目標程式目錄執行。每個命令各使用一份管理者核對過、固定雜湊且指定新收據位置的 JSON；下列占位字不能直接執行。

```powershell
node scripts/dev-package-update.mjs status --input <status.json> --sha256 <SHA256>
node scripts/dev-package-update.mjs register --input <register.json> --sha256 <SHA256>
node scripts/dev-package-update.mjs plan --input <plan.json> --sha256 <SHA256>
node scripts/dev-package-update.mjs apply --input <apply.json> --sha256 <SHA256>
```

register 僅對已成功匯入、與原始安裝收據和資料逐項一致的目標建立基準，不能把任意本機狀態登記成乾淨版本。plan 先檢查程式相容性及目前內容，通過後回報目前與目標版本、物件數與位元組；收據沒有獨立的 `compatibility: true` 欄位。`PLAN_READY_NOT_APPLIED` 代表可進下一步，尚未寫入新版業務資料。apply 真正完成的狀態是 `UPDATED_FULL_SNAPSHOT_VERIFIED`；同包經完整核對可回 `ALREADY_APPLIED_VERIFIED`，不能僅憑版本字串跳過或把 exit 0 當作內容驗證。

命令 JSON 必須固定目標與程式為同一真實目錄、程式依賴／更新器雜湊、資料 manifest 與發布清單雜湊、已清理瀏覽器未儲存輸入及收據位置。若程式或內容變動，重新核對，不覆寫原輸入或原收據。

## 備份、切換與保全

更新只替換該目標的 .wrangler 完整資料命名空間。先把停止狀態的全部檔案複製到 .process-update/transactions/<ID>/backup，逐檔核對大小與雜湊，再建立新的資料庫及圖片。新版快照的 SDK 暫存只在該目標的 .u1s 寫入；完成資料讀回及真正關閉後，整棵搬入既有交易暫存，核對後才切換。plan／register 等對目前資料的核對仍開啟該目標的正常儲存。原資料另保留，不刪除。

業務資料、圖片、草稿／歷史及關聯依核准完整快照更新；原有身分、角色及個別權限必須一致。本機已核對的 bootstrap、密碼雜湊、session／features 私有設定保留，session 撤銷紀錄取較新值。若權限或身分不一致，停止，不替使用者擴權。更新後的本機 CAS revision 可能高於發布快照 revision，兩者須分別記錄。

## 失敗與中斷

不要刪除 incomplete、lock、access-lease、.u1s 或交易目錄，不要重跑首次匯入器覆蓋現況。已接入防護的正常啟站及資料工具會拒絕未完成交易；直接 Wrangler 或未接入的歷史工具不在此保護範圍，不可用來繞過。先保留錯誤代碼及全部收據。恢復只允許同一交易、已核對的原備份與原持有者確實退出證據：

```powershell
node scripts/dev-package-update.mjs recover --input <recover-exact-transaction.json> --sha256 <SHA256>
```

需要由管理者產出精確恢復輸入。未知程序存活、外來檔案、備份不符、原生關閉結果未知，都保持 HOLD，不能清鎖硬啟。非終局交易恢復的成功狀態是 `RECOVERED_VERIFIED_BASELINE`；已終局交易只重新核對時為 `TERMINAL_COMPLETION_REVERIFIED_NO_ROLLBACK`。狀態字本身不證明走了原副本搬回或完整備份複製分支；恢復後必須實際讀回業務資料、圖片、歷史、關聯及權限，才可重新使用。首次測試安裝沒有舊基準時、中斷發生在完成收據缺漏窗口、或恢復程序本身再被中斷，仍可能保持 HOLD；不宣稱所有斷電時間點均能自動恢復。

.process-update、.u1s、.wrangler 與含憑證的安全覆蓋檔皆為私有操作資料，不加入 Git 或程式／資料交付包；不要把它們放入公司共享目錄。原安裝包與失敗證據保留。
