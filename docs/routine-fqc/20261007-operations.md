# 例行 FQC：22 項操作回饋驗收

Task：`routine-fqc-operations-3040`。2026-10-07，開啟工作目錄 `<WORKSPACE>/中控系統`，branch `codex/ipqc-ab-local`，HEAD `84278d837898f4e836ec003f7adb67ff38f785c8`。保留當前未提交 IPQC、模具、品質與整份文稿工作；無 commit、push、Git merge 或部署。

最新需求已加入 [ROUTINE_FQC 第12節](../specs/current/ROUTINE_FQC.md)。本輪完成本機操作改善，沿用3040隔離資料、照片、session及排程。

STATE: EXECUTED。原ChatGPT「設計例行檢查流程」透過connector独立複審 iteration1 回覆DONE，核對目前程式、P1/P2/P3實測與 execution_output #41；此結案範圍不含新的3000移轉或部署。

## Changed 與資料模型

- `lib/routine-fqc.ts`、`app/api/routine-fqc/route.ts`：可復原捨棄、相依保護、目前案件復原檢查、報告占用單一判斷與更正版系譜；照片未保存的錯誤回傳穩定欄位路徑。
- `lib/shared-draft.ts`：trusted adapter 只對 routine-fqc scope 允許 Submit／Withdraw 空操作理由；其他 scope、發回理由、自審權限及固定案件保護仍保留。
- `public/process/routine-fqc.js/.css`：分開計畫／報告與申請分類，方框旁草稿／待審記號、放大結果選擇、樣品未選自動展開、收折提醒、報錯／待補分區與修改導引、行內捨棄／復原、自審勾選及平台審核。
- `approval-tabs.js`、`master-data.js`、`quality-review-overview.js`：新增例行檢查第四分頁及四子模組，FQC分類、計數與實際固定案件審核；移除品質資料庫的例行重複入口。
- `dual-system.js`、`index.html`：修復品質系統重開 approval 網址誤回總覽，更新受影響載入版本。
- 驗收腳本 `test-routine-fqc-operations.cjs` 及 `routine-fqc-operations-{audit,prepare,ui,races,network,platform,read-race,ownership,review1,evidence,output}.cjs`；規格、QUALITY、DATA_MODEL、ROUTINE_FQC模型、CHANGELOG、HANDOFF同步更新。

Document新增 optional `cancelled` 與 `lifecycle[]`，保留原文件／草稿／照片／案件，不硬刪。GET的 familyId、reportAvailability、dependencies、workingIssues、savedIssues是唯讀投影；沒有 SQL schema、migration、bindings 或日常資料回填。[資料關係與權限](../../AI_CONTEXT/models/ROUTINE_FQC.md)。

實際根因：使用者 plan10 是 plan9 的更正版，report20仍屬於plan9。原前端只查新planId，後端卻按jobId阻擋重複，因此顯示可建立卻回409。現前後端共用逐項可填報投影，最新計畫接續原報告；原紀錄與連結未改寫。計畫編號和相同預設名稱也不再重複列印。

## Tests：逐回饋結果

可讀證據：[22項JSON矩陣](evidence/operations-22-comments.json)、[總結](evidence/operations-summary.json)、[實際命令與輸出](evidence/operations-command-outputs.json)。本輪33組定向检查PASS；原FQC流程12組、共用草稿14組、TypeScript及受影響JS語法PASS。最終驗收FAIL 0；執行期間失敗與修正保留於下方及命令輸出，NOT_RUN獨立列明。

| 回饋 | 結果 | 實測與證據 |
| --- | --- | --- |
| 1 | PASS | 計畫草稿捨棄、釋放原兩工作、保留歷史、復原為未存草稿 |
| 2 | PASS | 兩個已占用項目的方框旁顯示草稿記號 |
| 3 | PASS | 原送審入口移到版本確認平台，開同一固定案件 |
| 4 | PASS | 第四例行分頁、四子入口、FQC四類；其他入口建置中 |
| 5 | PASS | 計畫與報告分頁分開，計畫不顯示虛擬實測樣品 |
| 6 | PASS | 執行報告草稿可捨棄並從同一計畫重建 |
| 7 | PASS | 無報告正式計畫可刪除及復原；有相依時阻擋且連到文件 |
| 8 | PASS | 建立報告確認按鈕有文字；未選項目留視窗並提示；確認實際建檔 |
| 9 | PASS | 一般UI移除反確認／建立更正，以安全刪除／重建替代 |
| 10 | PASS | 結果按鈕至少46px高，明示請選取與選中顏色 |
| 11 | PASS | 未選樣品初始直接展開 |
| 12 | PASS | 選定樣品可收折，保留展開選取提醒 |
| 13 | PASS | 合格樣品與實測值完整、原因空白可送審核准 |
| 14 | PASS | 必要問題有修改按鈕，實測聚焦照片上傳控制 |
| 15 | PASS | 處置草稿捨棄後原不合格案件仍open，可重建申請 |
| 16 | PASS | 報告／免做／處置可分类，送審平台另分計畫與執行／複測 |
| 17 | PASS | 處置缺照片可存草稿但不能送審；真實上傳後核准 |
| 18 | PASS | 業務待補與技術報錯分開，穩定line/result欄位導引；後端缺漏仍阻擋 |
| 19 | PASS | routine送審與撤回空操作理由，不跳理由視窗；其他scope不放寬 |
| 20 | PASS | 更正版歸同一計畫、目前清單一筆；並行建立一成功一409 |
| 21 | PASS | 核准無理由視窗；Admin自審勾選不可省略，重開即清除 |
| 22 | PASS | 最新計畫連回原報告；部分填報與捨棄後重建都按同一占用判斷 |

真實上傳使用交接包 `tests/assets/test-evidence-01.png`；成功PUT後重開與歷史影像naturalWidth有效。一般帳號approve403、未勾自審409、pending捨棄409、相依刪除409、舊revision409及占用復原409均實測。兩次Save點擊只有一份Save；已提交Apply回應遺失以本人收據恢復，離線內容與完全相同重試保留，無新增重複文件。

真實UI失敗及修正：上傳檔案input原本隱藏不能focus，改聚焦可鍵盤操作的上傳label；重開平台導回總覽的導航順序修正。測試期望碼與接續腳本也已修正；最终定向驗收PASS，未把失敗掩飾成未執行。

獨立複審第一輪追加：目前占用投影阻止取消更正版後，舊formal版本再建立或復原報告。P1核准、報告草稿捨棄、P2更正版核准／取消後，P1建立與報告復原均409；P2復原仍未存／未核准不能建立報告；工作改派P3後P1仍不可用，P2復原也409。原用户plan10/report20/照片及baseline逐筆不變。[真實HTTP／UI證據](evidence/operations-review1-evidence.json)。曾核准文件再次捨棄後的復原仍須原撤銷權限，不能降成一般草稿權限；較舊GET延後返回亦不覆蓋新取消狀態。

## 桌機與手機證據

1366×900、981×884、390×844浏览器模拟及中越文核對無整頁水平溢出。

- [計畫桌機](evidence/operations-plans-desktop.png)、[報告桌機](evidence/operations-reports-desktop.png)、[完整正式報告](evidence/operations-full-report.png)、[越文報告](evidence/operations-reports-desktop-vi.png)。
- [平台待審桌機](evidence/operations-pending-1366-zh.png)、[981畫面](evidence/operations-pending-981-zh.png)、[越文桌機](evidence/operations-pending-1366-vi.png)。
- [待審手機中文](evidence/operations-pending-mobile-zh.png)、[待審手機越文](evidence/operations-pending-mobile-vi.png)、[樣品與結果手機中文](evidence/operations-report-mobile-zh.png)、[手機越文](evidence/operations-report-mobile-vi.png)。

NOT_RUN：實體iPhone觸控／鍵盤遮擋、原生輸入法、全庫效能壓力、外部連結器業務資料寫入與远端部署。瀏覽器模擬不當作實體裝置驗收。

## 保全、復原與3000

操作前私人完整control保全：`.wrangler/local-only/routine-fqc-3040/operations-user-before.json`；來源標準另存`operations-source-before.json`。所有既有文件、案件、工作與照片引用逐筆比對不變，新增僅`rf3040-operations-*`三個標準及驗收文件；來源透過正常Save/Submit/Admin明確自審，不直接改status。使用者手動演練1/2已完成部分流程，3/4仍未操作；舊「四項未操作」是上一輪歷史時點。

修改前檔案保全：`<TEMP>/routine-fqc-operations-20261007`；檔名以`__`代替路徑分隔。API每次寫入沿用`backupStoredState`與原子CAS。復原單一捨棄文件使用頁面歷史的復原為草稿；會重檢權限、占用、案件及相依，需重新儲存／送審。不要整庫回覆舊baseline而覆蓋後續使用者工作。程式復原須對照備份語意還原本任務段落，保留並行修改；不要整份覆蓋共用檔案。

本輪没有3000業務資料寫入、起始日設定、測試帳號／報告／照片移轉，沒有操作3020／3030或另開埠。先前3000本機增量啟用結果仍見 [初次驗收與備份](20261007-acceptance.md)；這次共享程式碼改善供原本機載入，不做Git merge或部署。回歸風險主要為共享導航／審核分類及共用理由政策，已做固定案件重開、其他scope理由限制、權限／並行与原草稿核測；未全面重跑無關模組UI。
