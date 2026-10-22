# Routine FQC V2 — 本機實作與驗收

獨立複審：原 [設計例行檢查流程](https://chatgpt.com/g/g-p-6aa92cd426048191b704fdcc0ad78631-zhong-kong-xi-tong/c/6ac36c38-501c-83ec-a5d6-e42870edb8b1) 以Astra／High在第二輪回覆 `STATE: DONE`，核對目前程式、測試腳本、execution_output 22–25、桌機／390px截圖及匯出。DONE僅指本機實作與獨立複審通過，不包含Git提交或遠端部署。

第一輪38項既定情境PASS後，ChatGPT獨立複審另找出兩個邊界缺口；第二輪已修正並補測，結果見下方及逐項證據，不以第一輪PASS取代補測。原3000已由revision448→449增量啟用，舊資料全部保留，起始日未設定。[日常畫面核對](evidence/daily-ui-evidence.json)、[3000截圖](evidence/daily-3000.png)。未將「已送複審」當作核准。

TASK_ID：`routine-fqc-3040`。正式需求為 [ROUTINE_FQC](../specs/current/ROUTINE_FQC.md)，前10節原文與 V2 包的 `02_ROUTINE_FQC_SPEC.md` SHA-256 完全一致；第11節保存使用者後續六項操作回饋。包內20個檔案未變更並逐一核對manifest；[回饋修正與手動演練](20261007-feedback.md)記錄新驗收。實作沿用 `codex/ipqc-ab-local`／HEAD `84278d837898f4e836ec003f7adb67ff38f785c8` 與當前未提交工作；未 commit、push、Git merge 或部署。

## 修改與操作

- 「例行檢查」提供 FQC、IQC、模具檢查、檢具與測試設備校準四入口。後三者明確顯示建置中；FQC 實作排程、批次計畫、逐項／逐樣品報告、整份手動 Save／固定 Save 送審、改善、複測、處置、免做、確認結案、歷史搜尋及正式匯出。
- V2 桌機方向落實數字卡、狀態色標、左右明細、完整報告展開、照片縮圖、時間線與篩選。共用 `VersionDraftUI` 的文稿／操作／報錯／待補／操作紀錄順序，保留中越文。
- 核心新增：`lib/routine-fqc.ts`、`app/api/routine-fqc/route.ts`、`app/api/routine-fqc/photo/route.ts`、`public/process/routine-fqc.js`、`public/process/routine-fqc.css`。
- 接入既有 `index.html`、`dual-system.js`、`master-data.js`、`quality-review-overview.js`、`fqc-master.js`。`process-state.ts` 增加3040獨立 cookie／私有 control 投影保護；登入登出使用所屬 cookie；備份還原待審檢查納入每份 FQC 文件。沒有重寫其他模組。
- 資料模型、欄位、權限、CAS、固定快照及排程交接見 [ROUTINE_FQC 模型](../../AI_CONTEXT/models/ROUTINE_FQC.md)。沿用 D1／R2，沒有新 SQL schema 或 migration。

## 驗收證據

逐情境結果：[38 項矩陣](evidence/matrix.md)、[CSV](20261007-acceptance.csv)、[機器可讀摘要](evidence/acceptance-summary.json)。矩陣以實際通過證據為依據；獨立 handler／核心 fixture 與真實3040 API／瀏覽器層明確區分，不能把 fixture 宣稱為日常業務操作。

先以正常密碼登入3040 Admin／staff，完成一份四結果混合計畫：同項目樣品甲合格、乙不合格，其他項目分別不合格／無法測試／無法判定。實際上傳兩張測試 PNG，核對照片雜湊、R2讀回、重登持久化，再通過正式送審、自審確認、逐項異常分流、失敗複測、合格複測與有權限者結案。記錄與文件 ID 見 [混合流程](evidence/mixed-flow.json)、[真實API結果](evidence/live-evidence.json)。沒有直接寫 status 或偽造 approval。

[UI 證據](evidence/ui-evidence.json)包含逐項樣品搜尋複選、缺照片可 Save／不可 Submit、實際 file input 上傳、Submit 不含後續未儲存輸入、版本台同案返回及正式 HTML 匯出。[斷線測試](evidence/network-evidence.json)實際提交後中斷回應，再以收據確認；離線輸入保留與完全相同命令重試皆通過。排程／頻率交接／跨期與反確認等補充由正式轉移核心驗證；[BOM例外](evidence/bom-boundary-evidence.json)使用正式 handlers 與正常登入的隔離記憶體資料，不更動日常 BOM。

| 檢查 | 結果／界線 |
| --- | --- |
| TypeScript、前端 JS 語法、定向 diff whitespace | PASS |
| `test-demo-auth.cjs`、`test-shared-draft-v3.cjs` | PASS；原簽章登入與共享文稿防護保留 |
| 1366／1920 中越文、390px 版面與鍵盤 | PASS；手機為 Edge viewport 模擬 |
| 20 檔包 SHA-256、正式規格一致 | PASS |
| 實體 iPhone、原生輸入法、列印機 | NOT_RUN |
| 遠端部署／正式發送播放／全面效能壓測 | NOT_RUN；本任務未部署 |

開發中曾修正測試腳本誤用 BOM scope（正確為 AB）及點擊收合篩選內的隱藏按鈕；其後以独立延續測試通過剩餘情境，沒有為重跑而重做已核准案件。另修正複測每次失敗都需新改善、關閉案件仍可查原不合格、重試權限重新檢查、固定送審照片實體存在檢查及窄版完整報告排列。失敗原始記錄保留於忽略的隔離目錄，正式矩陣呈現最後已驗證狀態。

## 第二輪獨立複審修正

1. 不合格後複測「無法測試」：送審可保留空的實測樣品；新文件逐項固定保存 `requiredSamples`，原案件未測義務保留。後續補測計畫須核准，錯誤樣品不能送審，正確樣品合格核准後仍需另外結案。未解決的原不合格不可用免做跳過，可依證據申請處置。畫面、歷史與匯出分開呈現應測／實測。
2. 五類文件更正：一般初測報告按原reportId／jobId找回各案件；複測報告、補測計畫、免做與處置保留caseId／planId／correctionOf。已結案報告更正會明示重新確認，原核准與結案事件留存；免做／處置更正延續終止狀態，不能覆蓋已有後續變更的案件。缺少連結回422／409並顯示中越說明。

第二輪使用正常密碼Admin與實際3040 API；在真實UI完成複測無法測試與處置更正的Save／Submit／明確自審。詳見 [補測結果](evidence/review2-evidence.json)。第一段因一次GET讀取逾時中斷，已先重讀確認處置核准成功，才延續未完成情境，沒有重複核准；輸出對登入cookie已遮蔽。缺失連結的故障注入僅在記憶體核心fixture，未破壞資料庫。

第二輪TypeScript與排程／轉移核心回歸PASS；[無法測試桌機](evidence/review2-unable-retest.png)、[處置更正](evidence/review2-disposal-correction.png)、[應測歷史](evidence/review2-required-history.png)、[390px應測／實測](evidence/review2-mobile-required.png)、[正式匯出](evidence/review2-unable-report.html)。手機截圖等待原側欄收合動畫完成，確認無遮擋及橫向溢出。最後3000唯讀驗證期間先遇登入500；原服务程序再次變更後重驗PASS，沒有重啟或還原日常資料。最新日常revision450由並行工作推進，整次唯讀驗證前後完全一致；448→449仍是本任務唯一啟用寫入。

## 畫面與正式匯出

- [1366 繁中](evidence/final-desktop-1366-zh-Hant.png)、[1366 越文](evidence/final-desktop-1366-vi.png)。
- [1920 繁中](evidence/final-desktop-1920-zh-Hant.png)、[1920 越文](evidence/final-desktop-1920-vi.png)。
- [390px 手機](evidence/final-mobile-390.png)、[手機照片](evidence/mobile-photo-390.png)、[結案歷史](evidence/closed-failure-history.png)。
- [正式報告匯出範例](evidence/exported-formal-report.html)：3040 測試資料，含真實上傳圖片、核准內容及歷史，禁止匯入日常。

## 3040 隔離與原3000銜接

3040 runtime：`.wrangler/local-only/routine-fqc-3040/runtime/`。D1、R2、照片、session secret 與排程 control 實體隔離；cookie 是 `process_demo_3040`，不能登入3000。程式目錄共用目前 checkout。初始來源 revision410，後續日常 IPQC／模具由其他工作推進到448；本任務沒有用410覆蓋448。[隔離證據](evidence/isolation-verification.json)。

3000的完整備份在 `.local-backups/routine-fqc-3000-20261007-before/`，包含 D1、R2、session 與設定，檔案 manifest 留於私有本機。備份期間3000短暫不監聽，首次capture的末端HTTP檢查失敗；保留完整副本。原服務重新可用後，核對固定D1與即時revision448內容相同，再驗證所有R2引用、blob大小、SHA-256清單及獨立D1副本重建。沒有在日常執行整庫還原。[備份驗證](evidence/backup-verification.json)。

銜接只透過現有 Local Admin 身分及專用 CAS API 加入 `routineFqcEnabled='1'`，不複製3040 control／帳號／報告／照片／起始日。具體前後revision、舊值保全與空白FQC狀態以[銜接收據](evidence/integration-evidence.json)為準。管理起始日保持未設定，須使用者於排程設定預覽後確認。

復原程序：先保存當時最新日常資料並停止需要復原的原3000服務；核對本備份manifest、D1 integrity及R2引用，在**獨立目錄**重建並檢查。若僅撤銷本功能，應以有授權的增量變更撤除啟用旗標並保留FQC已產生資料；不可直接把revision448整庫覆蓋後續日常。若確有全庫故障，按 [正式備份復原程序](../../BACKUP_AND_RESTORE.zh-TW.md)核對後續資料差異及授權再還原。備份可讀／独立重建PASS，不等於已在日常做回復演練。

3040保留既有測試狀態，可用runtime既有 `scripts/local-server.mjs --port 3040` 入口重新啟動；不要重跑setup、fixture或初始化。啟動前先查同埠現有程序。沒有操作3020／3030、沒有另開測試服務埠。

## 限制與接續

排程採開頁／日期或來源變更時補齊；停機後下次開頁補齊，不宣稱關閉程式仍有背景排程服務。無法解析的舊頻率保持待確認。日常後台FQC正式來源需要業務維護，未把測試標準當作日常正式標準。

目前沒有識別到其他模組資料回歸；仍需使用者實際手機與日常操作確認。ChatGPT連結沿用「設計例行檢查流程」，已在其可見介面選定 Astra／High供獨立複審；這不宣稱切換本次已執行的Codex模型，也不保證關機／離線連線永不中斷。
