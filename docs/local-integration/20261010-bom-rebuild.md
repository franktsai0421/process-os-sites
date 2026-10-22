# 2026-10-10 日常 3000 BOM 重建交付

## 真實狀態

本任務已收到人類直接授權：依 ZIP 重建日常 BOM，先備份，保護製程引用與共用草稿，完成後驗證。工作區 `<WORKSPACE>/中控系統`，`codex/ipqc-ab-local`，HEAD `8b182626085bb2aa1f3a216903c5b373ee82bc44`；起始 288 筆既有未提交／未追蹤項，沿原 checkout 保存其他工作。日常原服務 PID 22004、3000，使用原 `.wrangler/state`。

**目前是真實待審案件，不是已生效版本。** 日常 451 → 452 begin → 453 apply → 454 save → **455 submit**。Save ID `ad1cad3b-1206-4ae7-b418-7f930bb2e54a`，案件 `2194e2ec-6f1c-4c8f-9501-e480b9148924`。新清單 11 主件、227 列，与原 ERP 比較零差異；原正式 330 主件／6,237 列仍有效。依 ZIP `01_DOT_CODEX_TASK.txt:19`「不靜默自動核准」，留待具權限人員在 BOM 頁查看案件後核准。本次不是合成測試送審。

沒有 commit、push、Git merge、遠端發布或部署，也沒有 SQL migration。最終22檔程式候選清單見外部 `analysis/final-code-manifest.json`，集合 SHA-256 `2bfb6ccc560625a4cfe07e0d99f56c15a74901238d7a57b2250d8cc5af406992`；最後 `daily-final-receipt.json` 仍為455，原25鍵與回報不變。已保留載入 `20261010-bom2` 的乾淨日常審核分頁，關閉本任務舊頁／隔離頁，恢復瀏覽器尺寸設定。

## 來源與備份

- ZIP SHA-256：`4508ff3ff176143c77c83d562325ef2879bfe6fbaf8d2a13bf7ff6abc47568f1`；32 個 manifest 項目逐項長度與雜湊相符。
- ERP：`BOMR0220261009000053202610090001.xlsx`；SHA-256 `06916f8d805a3da10a3988d903b30bd007301e23c992bf8ff99458ede51778a8`。
- 原始階層統計：L0 11／L1 117／L2 55／L3 33／L4 11。
- 外部備份根目錄：`<USERPROFILE>/Documents\PROCESS-OS-Backups\bom-rebuild-20261010-01`。`source` 原來源；`code-before` 本輪變更前檔案；`daily-before` 完整資料；`analysis` 完整引用盤點；`pre-apply` 套用前新鮮收據。
- `daily-before` 共 1,631 檔、7,828,731,946 bytes，revision 451；SQLite 一致性副本、integrity_check、非資料庫檔案雜湊及備份前後所有表摘要通過。
- `restore-rehearsal` 為全量獨立還原副本：逐檔 SHA／大小、SQLite integrity、目前功能與 schema 相容性通過。manifest SHA-256 `2a4a8fda8622ef2847f59b808c68d56bd89b0cd886b24c0345203837878bf905`。沒有覆蓋日常資料。

日常恢復優先使用既有撤回／歷史流程，避免回復整庫而覆蓋之後的新工作。完整災難復原須先停正確日常服務、另備份最新狀態，在全新目錄以 `scripts/verify-bom-backup-restore.mjs <daily-before> <new-external-directory>` 準備並驗證副本，再按既有復原程序處理最新撤銷紀錄及新資料；**本格式不是可直接傳给 `restoreLocalBackup` 的 manifest，勿直接覆蓋或啟動備份副本連到日常服務**。原始 backup 与 rehearsal 保留。

## 保全與資料關係

`daily-saved-receipt.json` 與 `daily-submitted-receipt.json` 由 production decoder 讀回真實 D1/R2：原 25 個值雜湊全相同，問題回報表與備份相同；新増 `bomMasterControl`。沒有變更原選取、畫布、IPQC、機器、其他共享草稿或歷史。

完整含歷史盤點共 **1,161 個引用出現位置，皆 missing-root**；來源涉及的原根主件均不在這 11 個新根中，因此成功映射 0、歧義映射 0、缺根待確認 1,161，不做猜測。完整根／操作／路徑清單在 `analysis/reference-audit.json`。正常 API 延後載入舊 immutable history，工作流畫面本次提示 **691** 筆載入內容引用；這不是完整歷史總數。原歷史透過原歷史入口與完整盤點可追溯。

新 `bomMasterControl` 以既有 V3 kernel 保存 `{bom, referenceIssues}`。核准才在同一 CAS 投影 `bomOverrides` 的 `PROCESS_OS_BOM_OCCURRENCES_V3` replaceAll wrapper。一般 shared-state 覆寫与 canonical sync 改 BOM 被拒絕，必須使用 BOM 工作流。canonical 投影保留 occurrence ID。新選取以 occurrence ID 辨識，舊 code-only 字串保留。

## 實作

- `public/process/bom-domain.mjs`：前後端共用十欄解析、原始數值精度、parent stack、位置識別、比對與引用盤點。
- `lib/bom-workflow.ts`、`app/api/bom/workflow/route.ts`：共用核心 adapter，import privilege、guard、CAS、Save／Submit／review。
- `bom-workspace.js/css`、index：原 BOM 入口的搜尋／四分頁／完整關聯樹／欄位編輯／原檔比對／精簡匯出；沿用版本列與歷史檢視。
- app／process-editor／version-workflow／process-authoring：L1 消費、穩定選取識別、A/B 分母及 C 欄位限制。shared-draft-client 歷史按主件展开 BOM rows。
- process-state／shared-state／canonical-data：私人草稿投影及有效 BOM 寫入邊界。

## 驗證結果與限制

| 結果 | 驗證 |
| --- | --- |
| PASS | `test-bom-domain.mjs` 原檔11/227、L5、0/空白、前導零、重複位置、缺父層、一般多主件匯入、結構組、字段採用、base guard、聲調查詢、忽略欄位零差異 |
| PASS | `test-bom-workflow.cjs` 記憶體 SQLite/R2 真實 route：import 權限、唯讀拒絕、原有效版保全、並行409、結構欄拒絕、Save／Submit／待審鎖／核准、private projection |
| PASS | `test-bom-consumers.mjs` canonical穩定ID與guard、原始L1、同料號不同位置、無舊庫回補、C不顯示數值、A/B分母與0、原Excel儲存精度 |
| PASS | 既有 `test-process-editor-integrity.cjs`、`test-routine-fqc-bom-boundary.cjs`；舊 codec 以正確 base 執行 `node scripts/test-bom-excel.cjs public/process` |
| PASS | 3002 隔離 UI 實際原檔匯入、Apply、Save、重載，最後輸入格直接上方 Save、503 保留與收據重試、L2無數值輸入、角色唯讀、227節點／11匹配位置、匯出227列10欄及深層留空 |
| PASS | 3000 正常登入 → BOM → begin → 原檔 chooser → 11差異組 → 全採用 → Apply → Save → 重新開頁 → 同檔匯入零差異 → 放棄零差異比對 → 真實 Submit。重新上傳期間發現 chooser 重繪失效，修正後實際重驗通過 |
| PASS | 1366×768 隔離桌面目視與無整頁溢出；3000實際390×844越文窄版、按鈕換行、樹區捲動、中越文切換及954寬桌面；不等同實體手機驗收 |
| PASS | 日常455讀回原檔零差異、25保護鍵及回報表不變；備份與獨立全量還原 |
| FAIL（保留） | `test-process-authoring-v3.cjs` 舊測試期待 SELF_REVIEW_FORBIDDEN，現有核心回 CONTENT_ISSUES_CONFIRM_REQUIRED；本輪未修改該自審核心規則 |
| FAIL（保留） | `test-canonical.mjs` 舊隔離失敗回復流程得到 LOCAL_RESTORE_FAILED_STOP；本輪沒有繞過復原安全檢查。BOM限定canonical檢查與本次全量獨立還原另為PASS，不能當成該完整回歸已通過 |
| NOT_AVAILABLE | 1920×1080 指定尺寸未能穩定套用到正在檢查的分頁，實測尺寸另列，不能宣稱1920通過 |
| NOT_RUN | 真實日常服務重新啟動後再登入；核准後正式發送／播放的人工端到端驗收；實體iPhone；完整無關功能套件 |

隔離匯出已從 Downloads 移至外部備份 `analysis/fixture-export-not-business.xlsx` 含測試用第一個3060301用量2.234567，**不是正式來源或日常交付資料**；日常讀回為原檔2，零差異收據已證明。測試 SQLite/R2 只在3002記憶體，不回灌日常；收尾已核對並停止本次 fixture PID9992，合成資料随程序清除。密集完整森林需垂直捲動，未宣稱預設一屏可讀3–4個完整根樹。

## 操作路徑

日常 `http://127.0.0.1:3000/process/?system=process&view=data&dataTab=bom` → 資料後台 → BOM 資料 → 查看送審案件。核對 11／227、原文與引用提示後，由具權限者依既有審核操作核准或退回。核准才正式替換原330主件。

後續匯入：開始修改草稿 → 匯入Digiwin報表 → 選原始 ERP `.xlsx` → 比對採用／保留 → 套用至編輯區 → 上方儲存草稿 → 送出審核。同檔未改值應為0差異；可直接放棄該次比對。待審時不能再匯入或修改，須先完成審核或按原流程撤回。
