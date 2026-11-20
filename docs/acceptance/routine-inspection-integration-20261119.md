# 例行 FQC／IQC 整合的範圍與驗證

基底為公開 main `f173bd2474d6070c6411736f91a5707e1e49be4b`。從完整來源差異擷取業務程式，只新增一條一般審查分支。

| 範圍 | 程式入口 | 驗證 |
| --- | --- | --- |
| FQC 週、月、季、半年、年排程與生效版本 | `lib/routine-fqc-calendar.ts`、`lib/routine-fqc.ts` | `tests/routine-fqc-calendar.test.cjs` 涵蓋所有週期配對、已建立計畫、不重疊完整下一期、無計畫立即採新週期、停用與復用 |
| 標準時間頻率及舊值相容 | `lib/time-frequency-policy.ts`、FQC／IQC／模具／檢具工作流與主檔 UI | `tests/time-frequency-*.test.*` 涵蓋拒絕新增或更改自訂時間、保留舊值、可改選標準及按批次仍適用 |
| FQC 逾期與文件工作流 | `app/api/routine-fqc/route.ts`、`public/process/routine-fqc.js` | 核對送審／撤回／發回和歷史、復測核准回報告、處置確認及原回執 |
| IQC 定期工作與 ERP 批次 | `app/api/routine-iqc/`、`lib/routine-iqc*.ts`、`public/process/routine-iqc.js` | `tests/routine-iqc-{source,workflow,ten-case}.test.mjs` 涵蓋正式時間來源、排除到貨與舊純文字、批次 pcs、合格／異常分流、復測、處置及照片 |
| 正確的審核入口及明確錯誤 | `public/process/delivery-navigation.js`、`public/process/iqc-master.js` | 主檔顯示於品質資料庫，例行文件各在例行審核，並保留核准權限檢查 |
| 中越文手機版面、勾選與送審 | `public/process/approval-tabs.css`、`public/process/routine-{fqc,iqc}.css`、例行工作元件 | 窄版 CSS 與元件測試。實體 iPhone 驗收另列 |
| 資料儲存與相容 | `lib/snapshot-*.mjs`、`lib/process-state.ts` | 使用既有 SQLite／R2 模型，例行 IQC 新增受保護的 JSON 資料鍵與照片命名空間。無 SQL 遷移，既有 FQC 文件及 page-v1 持續由原端點處理 |

保留 #128 的例行入口 GET、權限共用計算及最終 revision/session 檢查。新曆法由空白 FQC 文件工作區的起始設定啟用。既有使用舊排程或 page-v1 的工作區延續原格式，尚未移轉個別文件格式。IQC 主檔以及其他模組保留各自審核與資料擁有權。
