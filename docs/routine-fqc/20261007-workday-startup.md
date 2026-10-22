# Codex／ChatGPT／3040 開機接續

使用者於2026-10-07授權登入Windows後開Codex、恢復原「設計例行檢查流程」ChatGPT連線及開3040參考頁。工作分支`codex/ipqc-ab-local`／HEAD `84278d8`；無commit、push、merge或部署。

## 設定

- Windows登入啟動項：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Codex-FQC-3040.lnk`。保留其他啟動項。
- 實際入口：`%LOCALAPPDATA%\CodexFqcStartup\start.ps1`，內容來自 [ASCII啟動器](../../scripts/fqc-workday-launcher.ps1)。此機捷徑COM儲存中文Arguments會變成問號，使用ASCII入口再以明示Unicode字元組成專案路徑；未改系統語系或執行政策。
- 主腳本：[start-fqc-workday.ps1](../../scripts/start-fqc-workday.ps1)。使用已安裝的PowerShell7，先驗證isolation.json及既有runtime資料庫/session/config，然後固定3040啟動現有local-server。已有同服務則沿用；埠被其他程序使用會停止，不殺其他程序或換埠。沒有呼叫local-init/setup或重新seed。
- Codex使用已安裝的`codex://threads/01a11470-77ad-76f3-98e9-32faedaef621`入口；本機參考頁由系統預設瀏覽器開啟。ChatGPT只在Codex內建瀏覽器操作。
- 一次性對話自動接續：`fqc-chatgpt`，名稱「明天開機接續 FQC 與 ChatGPT」，2026-10-08起每5分鐘檢查，到真正完成原對話连線與3040頁面後暫停。無變化保持安靜，不代做業務或手動演練。
- 啟動結果／日誌為私人本機metadata：`.wrangler/local-only/routine-fqc-3040/workday/`，不含密碼或商業資料快照。

## 驗證與現況

2026-10-07：確切安裝入口CheckOnly PASS；NoWindows正常接續PASS，沿用原3040 PID並核對連線，無重新初始化。WindowsPowerShell5因既有執行政策拒絕腳本，改用原已安裝PowerShell7；未放寬政策。

2026-10-08：原3040未運行，啟動器從既有隔離runtime冷啟動成功，PID18220，`GET /process/`200。首次依賴載入約2分鐘。資料保留，未操作3000／3020／3030。真正重新啟動Windows與登入事件尚未實測（此次OS bootAt仍為2026-10-07）；不能把對話接續當成重開機驗收。

3040已在內建瀏覽器透過現有ADMIN示範入口開到實際FQC清單，只建立登入session、不填密碼或代辦檢查；使用者後續已操作手動演練3/4，其現有核准／異常紀錄保留。`connectionChecked`只代表doctor命令已完成，新增`connectionReady`與`connectionRepairNeeded`區分真正健康和仍需頁面修復，不能把CLI退出0當作ChatGPT已恢復。

實測發現後續doctor可回報本機健康／repair false，而ChatGPT管理頁仍為舊地址。此檢查曾FAIL，已改以`connection-repair-pending.json`保留尚未完成的頁面修復；`localConnectionReady`與`connectionReady`分開。只有原對話成功呼叫workspace_info驗證工作區後才可清除marker，不可因doctor退出0自行清除。

ChatGPT健康檢查發現舊安全地址失效，需要同名連線替換；原chat URL和session DONE保留。管理頁將刪除標示為「永久刪除、無法復原」，已向使用者請求這一步確認，尚未刪除或新增。自動接續尚未標記完成，避免宣稱已恢復；不應再次詢問同一個確認或自行點刪除。

2026-10-07一次自動審查拒絕` sandbox-allow `持久權限變更；已改用單獨doctor/update-check，原sandbox白名單健康，無權限變更。此拒絕不影響3040啟動。

## 2026-10-08 3040載入失敗恢復

Task：3040前端載入失敗恢復。當前分支`codex/ipqc-ab-local`／HEAD `84278d8`，保留並行製程編輯器與其他未提交工作；未修改程式碼。

原服務PID18220的`GET /process/`200，但新加入的`editor-graph.js`、`process-editor.js`與`process-editor.css`均404；檔案存在，runtime的public映射指向目前checkout。頁面載入器在editor-graph中斷。推斷為既有Vite服務的新增靜態檔清單未更新。

核對3040的程序命令與isolation.json後，只停止該PID並執行既有start-fqc-workday.ps1 -NoWindows，固定原3040與原隔離runtime。新PID22284；約兩分鐘依賴重新載入後三檔均HTTP200，FQC清單重新載入PASS，顯示尚待完成2／待審核1／異常未結案2／已逾期0，先前手動演練紀錄可見。沒有初始化、整庫覆蓋、換埠、資料修正或3000／3020／3030操作。

證據畫面：`<USERPROFILE>/.codex/visualizations/2026/10/07/01a11470-77ad-76f3-98e9-32faedaef621/fqc-3040-load-recovered-20261008.png`。文件修改前保全：`%TEMP%/routine-fqc-load-recovery-20261008/`。資料模型影響：無。本次只驗證載入恢復，未重跑已通過的完整业务流程或實體手機；ChatGPT原連線仍未恢復，未刪除／重建。未commit、push、merge或部署。

## 停用與復原

停用只需將本次`Codex-FQC-3040.lnk`移出Windows Startup資料夾，再於Codex暫停`fqc-chatgpt`。不要變動其他啟動項、ChatGPT連線或其他任務checkpoint。刪除腳本或helper前先保全；不需要整庫還原、清除照片或改帳號。交接文件修改前保全位於`%TEMP%\routine-fqc-workday-20261008\HANDOFF-before.md`。

資料模型影響：無。風險界線：登入／明確刪除確認仍可能需使用者操作；未保證關機或離線期間連線不中斷。排程需要電腦與Codex正在運行，詳見 [官方Scheduled tasks文件](https://learn.chatgpt.com/docs/automations?surface=app)。
