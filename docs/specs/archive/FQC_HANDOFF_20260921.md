# Deprecated — 歷史規格／交接

原位置：`KD/FQC_HANDOFF.md`；保留當時獨有決策、來源及證據，不作目前工作指令、DBschema、branch或验收結果。替代來源：[HANDOFF.md](../../../HANDOFF.md)。原文內路徑依原位置／repository root解讀。

---

# FQC 功能交接與前置技術分析報告

- **交接負責人**：AG (前置分析與規格交接)
- **實作負責人**：Codex (後續程式碼開發與部署)
- **專案根目錄**：`<WORKSPACE>/中控系統`
- **指定 Excel**：`data-import/FQC/FQC標準 FQC-C TRIL 1.xlsx`
  - **SHA-256**：`5BC8CC4B55C4194DA08E18E4F9E75CE65D4FB50967B2A0BB2F861B5845FCF257`
  - **檔案大小**：67,272 Bytes
- **對照主資料快照**：`data/canonical/`（本地 Canonical 快照，manifest generatedAt: `2026-09-18T07:27:38.989Z`）
  - *明確聲明：本階段僅對照本地快照，未連線或宣稱已驗證 Production*。

---

## 一、工作區與 Git 當前狀態

1. **分支資訊**：
   - 當前工作分支：`codex/dual-process-quality-framework`
   - 本地最新 Commit：`a8888bf Merge pull request #5 from franktsai0421/codex/staging-canonical-sync`
   - 遠端 `origin/main` Commit：`b1fce01 Merge pull request #9 from franktsai0421/codex/fix-sites-demo-login`
2. **工作區未暫存修改 (Dirty Working Tree)**：
   - `modified: AI_CONTEXT/AI_CONTEXT.md`
   - `modified: AI_CONTEXT/CHANGELOG.md`
   - `modified: public/process/i18n.js`
   - `modified: public/process/index.html`
3. **未追蹤檔案 (Untracked Files)**：
   - `data-import/`（包含本次指定 Excel）
   - `public/process/dual-system.css`
   - `public/process/dual-system.js`
   - `scripts/test-dual-system.cjs`
   - `KD/`（包含本交接文件、規格書、分析程式與 UI 參考圖片）
4. **現有 Git Worktrees**：
   - `<WORKSPACE>/中控系統\.worktrees\bom-runtime` (`main`, `bd22fec`)
   - `<WORKSPACE>/中控系統\work\draft-workflow-loading` (detached HEAD, `b1fce01`)
   - `<WORKSPACE>/中控系統\work\editor-final-clean` (detached HEAD, `8f9ebab`)
   - `<WORKSPACE>/中控系統\work\editor-image-preview` (detached HEAD, `d232120`)
5. **保全確認**：
   - **本階段嚴格保留所有現有工作，未切換分支、未執行 reset、未清除或覆蓋任何檔案**。
   - Codex 接手時，應在確認未提交檔案與最新 `main` 狀態後，依專案規範建立或接續專用功能分支。

---

## 二、Excel 檔案分析與資料統計

由可重跑腳本 `KD/fqc-analysis/analyze-fqc.cjs` 解析獲得：

| 項目 | 數量 / 狀態 | 備註 |
| :--- | :--- | :--- |
| **工作表數** | 2 | `產品資料` (509 列)、`產品類別` (40 列) |
| **垂直合併儲存格** | 290 個 | 集中於 `產品資料` 欄 0 (類別: 34)、欄 1 (錯誤代碼: 94)、欄 2 (名稱: 94)、欄 16/17 (公式: 68) |
| **產品類別數 (Sheet 1)** | 34 個 | 均存在於 Sheet 2 及 Canonical 類別中 |
| **產品類別數 (Sheet 2)** | 39 個 | 包含 5 個在 Sheet 1 中尚無檢驗項目的空類別 |
| **錯誤代碼總數** | 164 個 | 各類別獨立管理，序號連續 |
| **檢查項目總數** | 508 個 | 每一列對應一個檢查項目 |
| **檢查編號 (CheckNo)** | 508 個 | **100% 全域唯一，零重複** |
| **內嵌圖片數** | **0 張** | XLSX ZIP 容器中 `xl/media/` 目錄為空，無任何二進位圖片 |
| **檢查方式敘述** | 0 筆非空 | 來源欄 5 全為空白 |
| **檢查方式圖片** | 0 筆非空 | 來源欄 6 全為空白 |
| **檢查工具種類** | 66 種 | 均為越文原文，如 `Mắt` (300筆)、`Thước đo dây` (15筆) 等 |
| **季檢查勾選** | 0 筆 YES | 508 列均為 `NO` |
| **月檢查欄位** | 缺漏 | Excel 中無此欄位，依規格預設未勾選 (`false`) |
| **啟用狀態** | 508 筆 YES | 預設全部啟用 |
| **版本與變更原因** | 508 筆一致 | 版本 `V1.0`，原因 `Mới thành lập`，時間 `2026-09-18` (`46283`) |

---

## 三、欄位對應、預設值、編碼規則與異常摘要

### 1. 欄位對應與預設值

完整 JSON 定義位於 `KD/fqc-analysis/fqc-field-mapping.json`：
- `category` (欄 0)：產品類別名稱（合併儲存格向上繼承）。
- `errorCode` (欄 1)：錯誤代碼（合併儲存格向上繼承）。
- `errorName` (欄 2)：錯誤代碼名稱（合併儲存格向上繼承，保留越文）。
- `checkNo` (欄 3)：FQC 檢查編號（唯讀，每列唯一）。
- `checkItemName` (欄 4)：檢查項目名稱（保留越文原文）。
- `checkDesc` (欄 5)：檢查方式敘述（來源為空，保留欄位）。
- `checkPhotos` (欄 6)：檢查方式圖片（來源為空，系統結構支援 R2 圖片陣列 `mediaItems[]`）。
- `tool` (欄 7)：檢查工具（保留越文原文，標題不加「照片」）。
- `isMonthly`：月檢查標記（**系統補足欄位，預設為 `false`**）。
- `isQuarterly` (欄 8)：季檢查標記（來源 `NO` 轉為布林值 `false`）。
- `productCodes` (欄 9)：適用產品（逗號分隔字串轉為字串陣列 `string[]`）。
- `isEnabled` (欄 10)：啟用狀態（來源 `YES` 轉為布林值 `true`）。
- `version` (欄 11)：版本號（來源為 `V1.0`）。
- `versionDate` (欄 12)：變更時間（數值 `46283` 解析為 `2026-09-18`）。
- `versionReason` (欄 13)：變更原因（來源為 `Mới thành lập`）。
- `creator` (欄 14)：建立者（來源為空，系統改由登入帳號動態寫入）。
- `note` (欄 15)：備註（選填字串）。

### 2. 編碼規則與前綴特異性

- **常規規則**：
  - 錯誤代碼：`<類別前綴>-FQC-L<2位序號>`，如 `BORUAXE1021-FQC-L01`。
  - 檢查編號：`<類別前綴>-FQC-L<L號>-<2位序號>`，如 `BORUAXE1021-FQC-L1-01`。
- **5 個特殊類別前綴（必須相容來源合法編碼，不得強制用類別名稱替換）**：
  1. `BRX1021-CO3360` → 前綴無連字號：`BRX1021CO3360-FQC-L`
  2. `DAUTUOICAY-RUAXE` → 前綴無連字號：`DAUTUOICAYRUAXE-FQC-L`
  3. `ONGHOI-CAOAP/BRX-CAOAP` → 前綴無連字號與斜線：`ONGHOICAOAPBRXCAOAP-FQC-L`
  4. `PHAODIEN` → 來源拼寫特徵：`PHAODIEM-FQC-L`（`N` 拼為 `M`）
  5. `PVC(2)` → 前綴無括號：`PVC2-FQC-L`

### 3. 異常摘要 (共 142 筆，詳見 `KD/fqc-analysis/fqc-anomalies.json`)

1. **3 個半成品編號（47 列次）**：
   `103SM00012` (類別 `BOSEN`)、`104A10202` (類別 `BOVESINH`)、`108BR4005` (類別 `ONGHOI-CAOAP/BRX-CAOAP`)。存在於 `data/canonical/parts.json` (`kind: semi-finished`) 與 `bom.json`，但未在成品主資料 `products.json` 中。
2. **5 個前綴符號簡化類別（90 列次）**：如上述特殊前綴說明。
3. **5 個 Sheet 2 空類別**：`CONNECTOR`、`DAUVESINH`、`TECACLOAI`、`YUTA`、`56464654`（在 Sheet 1 產品資料中尚無檢查項目）。

---

## 四、現有程式架構、可沿用機制與建議修改位置

### 1. 入口與導覽掛載

- **`public/process/dual-system.js`**：
  - 目前定義了 `qualityDataTabs`：
    ```javascript
    const qualityDataTabs = {
      'quality-fqc': 'FQC',
      'quality-iqc': 'IQC',
      'quality-ipqc': 'IPQC',
      'quality-routine-reports': '例行報告資料庫',
    };
    ```
  - 第 51 行 `qualityDataPage(tab)` 目前為佔位 HTML（`功能建置中`）。
  - **建議修改位置**：當 `tab === 'quality-fqc'` 時，調用 FQC 主模組 `window.FQCMasterUI.renderWorkspace()`，渲染 FQC 專屬之「版本列 → 歷程 → 篩選 → 錯誤代碼 → 檢查項目 → 覆蓋矩陣 → 未涵蓋產品」完整版面。

### 2. 版本管理與資料模型

- **可沿用機制**：
  - 參考 `public/process/master-data.js` 的 `masterDataControl` 與 `public/process/version-workflow.js` 的生命週期：
    - 結構：`{ active: { ... }, versions: [ { id, scope, number, status, snapshot, ... } ] }`
    - 狀態：`draft`（草稿）、`pending`（主管審核中）、`approved`（已生效）、`superseded`（歷史核准）。
- **建議實作方式**：
  - 在 `shared_state` 中新增 key `qualityMasterControl`（或依規格共用版本框架，建立 `qualityFQCControl` 等），維持相同的 D1 序列化與 `revision` 樂觀鎖定。
  - 確保 FQC、IQC、IPQC、例行報告各自獨立管理版本號，不互相干擾。

### 3. 版本確認平台 (審核平台) 整合

- **`public/process/approval-tabs.js`**：
  - 目前第 17 行僅包含兩分頁：`['master', 'process']`（主資料送審、製程版本確認）。
  - **建議修改位置**：依據規格 **REQ-FQC-08-05**，在 `approval-tabs.js` 增加 `'quality'`（品質系統資料庫）分頁，並掛載待審案件數量徽章。
- **`public/process/master-review.js`**：
  - 現有的 `MasterReview.diff()` 與審核視窗可擴充支援品質系統資料快照的詳細比對（錯誤代碼、檢查項目、產品勾選、圖片、變更理由）。

### 4. Excel 匯入與匯出

- **可沿用機制**：
  - 現有 `public/process/vendor/xlsx.full.min.js` 已被載入並在 `bom-excel.js`、`master-page-excel.js` 中使用。
  - 參考 `master-page-excel.js` 結構，建立 `fqc-excel.js` 模組，處理工作表解析、合併儲存格展開與完整匯出。

### 5. 後端持久化與環境隔離

- **`app/api/shared-state/route.ts`**：
  - 檢查 `ALLOWED_KEYS`，將品質系統所需的 shared-state key（如 `qualityMasterControl`）納入允許清單。
- **`data/canonical/quality/fqc.json`**：
  - 現已預留標準 schema（`{"domain": "fqc", "records": [], "schemaVersion": 1}`），供 `npm run data:sync` 進行團隊同步。

---

## 五、草稿保存與重新登入載入的資料流、風險與證據

使用者回報重大問題：「**儲存草稿後關閉網頁、瀏覽器或登出，再登入草稿消失**」。以下為深入查明之現有流程分析：

### 1. 現有資料流分析

1. **儲存觸發**：使用者點擊「儲存草稿」→ 前端呼叫 `localStorage.setItem(key, json)`。
2. **攔截同步 (`shared-state.js`)**：
   - `shared-state.js` 覆寫了 `Storage.prototype.setItem`，將變更寫入記憶體鏡像 `inMemoryState`，並觸發異步批次傳輸 `flush()` 至 `/api/shared-state`。
   - `/api/shared-state` 驗證權限與 `revision` 後，寫入 Cloudflare D1 `shared_state` 表（若大於 512KB 則寫入 R2 `STATE_ARCHIVE`）。
3. **頁面重新載入 / 登入載入**：
   - 瀏覽器開啟時，在執行業務腳本前，透過 API 預先抓取後端 `shared_state` 並初始化 `inMemoryState`。

### 2. 潛在風險點與程式碼證據 (未重現前的架構風險分析)

> [!CAUTION]
> **遵照使用者原則：在未於瀏覽器環境精確重現前，不把以下分析宣稱為已確認根因**。

- **風險點 A：非同步傳輸中斷 (In-flight Request Loss)**：
  - 證據：`shared-state.js` 的 `flush()` 為非同步防抖/節流機制。若使用者在按下儲存後立即關閉瀏覽器視窗或分頁，該 HTTP POST 可能尚未抵達伺服器或被瀏覽器取消。若前端無 `beforeunload` 等待或無同步保證，資料將僅停留在該分頁的記憶體中。
- **風險點 B：登入初始化時覆寫現有草稿 (Default Seed Overwrite)**：
  - 證據：檢視 `public/process/master-data.js` 第 61-65 行：
    ```javascript
    let control = readStore(STORAGE, null) || initial();
    if (!Array.isArray(control.active?.C?.products)) {
      control = initial();
      localStorage.setItem(STORAGE, JSON.stringify(control));
    }
    ```
    若使用者登出或登入 Session 過期，後端返回 401/403 或空資料，前端 `readStore` 若拿到 `null`，會執行 `initial()` 並**主動呼叫 `setItem`**！這會將預設空資料寫回記憶體與後端，將原本存在的草稿沖掉！
- **風險點 C：製程編輯台歷史修復的啟示 (`autoOpenCurrentVersion`)**：
  - 證據：在分支 `fix/process-editor-draft-persistence` 的 commit `65d242f` 中，工程師曾修復過製程編輯台重新登入時草稿未被選取的 bug：
    ```javascript
    // test-editor-draft-persistence.cjs
    // 當時發現 autoOpenCurrentVersion() 在重新載入時沒有正確將 state.editorVersionId 設為草稿並重新 render，導致使用者以為草稿消失。
    ```
  - 這表明：有時後端資料存在，但前端初始化函式因選單未切換、或狀態變數未指向草稿 ID，導致畫面呈現「空狀態」或「生效版狀態」，讓使用者誤以為草稿已遺失。
- **風險點 D：登出清除邏輯 (Logout Cleanup)**：
  - 登出時若前端粗暴執行 `localStorage.clear()`，且依賴 local 快取，可能導致離線工作遺失。

### 3. Codex 修復指南 (針對 FQC)
- 草稿狀態必須直接儲存在後端 D1 物件的 `versions` 陣列中（`status: 'draft'`）。
- 登入與重整時，前端初始化邏輯第一時間檢查後端 `versions` 是否存在 `status === 'draft'`：
  - 若存在，自動選中該草稿，並將 UI 標記為「草稿編輯中」，切勿預設為 `initial()`。
  - 若後端讀取失敗或 401，立即顯示「載入失敗，請重新整理」，**絕對禁止發動任何自動寫入覆蓋後端**。
- 儲存按鈕需等待後端 API 成功回應（`await window.ProcessSync.flush()`），收到 HTTP 200 後始提示「草稿已儲存」。

---

## 六、已確認事實、推測及尚待驗證項目

### 1. 已確認事實 (Verified Facts)
1. 指定 Excel `FQC標準 FQC-C TRIL 1.xlsx` 存在，SHA-256 與大小已確實驗證。
2. Excel 內無任何二進位圖片（`xl/media/` 為空），欄 6 檢查方式圖片亦全為空。
3. 508 個檢查項目的檢查編號（CheckNo）100% 全域唯一，無重複。
4. Excel 中 34 個類別均存在於 Canonical 類別主資料中。
5. 發現 3 個在 `products.json` 找不到的產品編號，經查實為 `parts.json` 中的 `semi-finished`（半成品）。
6. 發現 5 個類別在錯誤代碼編碼時對特殊符號（`-`, `/`, `()`, 拼寫）進行了簡化。
7. 桌面端彈窗需要專門的視口置中定位與背景捲動鎖定機制。

### 2. 推測項目 (Conjectures)
1. 使用者回報的草稿遺失問題，極可能是因為「前端讀取異常時 fallback 到 initial() 並自動寫回」或「重新載入時前端預設選中生效版本而非自動定位至未完成草稿」所導致。
2. 示範截圖中的示範資料（如 `L1-01 Nhãn (標籤尺寸、文字、外觀)`）為使用者手動修改後之示範展示，非原始 Excel 原文（Excel 原文為 `Nhãn (đánh đúng size, ko bị lem màu, ko lem chữ, ko bị lũng lổ)`）。

### 3. 尚待驗證項目 (Pending Verifications)
1. **半成品納入產品主資料之決策**：現場主管是否希望將 `103SM00012`, `104A10202`, `108BR4005` 於匯入時正式登錄至 `masterDataControl.active.products`，抑或僅於 FQC 檢驗標準中保留其產品代碼？
2. **生產環境 CPU 限制與大資料傳輸**：FQC 完整匯入 508 筆資料後，狀態物件大小可能達到數百 KB，在寫入 D1/R2 時需確保於 Staging 與 Production 之 CPU 限制（1,000ms）內完成。

---

## 七、建議實作順序與驗收方式

建議 Codex 依以下 6 個階段逐步推進實作：

```text
Phase 1: 資料結構與 Canonical 協同基底
  ├── 新增 D1 shared-state key 允許清單 (app/api/shared-state/route.ts)
  └── 建立 data/canonical/quality/fqc.json 標準資料結構與驗證腳本

Phase 2: 後台 UI 主骨架與彈窗優化 (桌面版)
  ├── 於 public/process/dual-system.js 接入 FQC 主工作區 (quality-fqc)
  ├── 實現由上而下 7 大區塊佈局 (版本列、歷程、篩選、代碼、項目、矩陣、未涵蓋)
  └── 實作獨立 Modal 元件，修復視口中央定位與背景鎖定，避免跳動

Phase 3: 草稿持久化、版本管理與防遺失修復
  ├── 實作草稿建立、修改、變更理由記錄、刪除保護
  ├── 實作登出/重整後自動偵測並帶回後端草稿邏輯
  └── 撰寫自動化測試腳本 (驗證 browser close / reload / logout 下草稿不滅)

Phase 4: Excel 解析、匯入預覽與完整匯出
  ├── 實作 fqc-excel.js，完整支援 290 個合併儲存格解析與 5 特殊前綴相容
  ├── 實作匯入預覽視窗 (二次確認後寫入草稿)
  └── 實作匯出全部 Excel 與重匯還原驗證

Phase 5: 審核平台 (版本確認平台) 整合
  ├── public/process/approval-tabs.js 新增「品質系統資料庫」分頁與待審筆數
  ├── 實作差異比對視窗 (呈現錯誤代碼、檢查項目、產品、理由)
  └── 實作主管核准生效 (切換至 approved，舊版 superseded) 與發回繼續編輯

Phase 6: 三環境隔離驗收、備份與發布
  ├── Local 測試通過全流程
  ├── Staging 部署與完整驗收 (驗收 10 大項目)
  ├── Production 備份與還原演練
  └── 取得 Frank 授權後執行正式部署與結案報告

Phase 7: FQC 後台樣式統一與九大功能全面優化 (已於 Local 完成)
  ├── 統一後台 UI：全盤對齊 AB/C 規範 (版本列、工具列、表格、按鈕 signal/ghost)
  ├── 歷程與理由：對齊 details 摺疊，提供歷史曾用理由快速點選帶入
  ├── 雙語翻譯保護：擴充 exact 詞典，防止單字拼接，產品名稱與輸入框 data-i18n-skip 保護
  ├── 檢查頻率擴充：新增年檢查 (isYearly) 與自訂週期 (isCustomPeriod + customPeriodText) 及列表標籤
  ├── 多圖與獨立備註：累加上傳不覆蓋、每張獨立備註、上移/下移/設為首圖排序、穩定 ID
  ├── 縮圖與照片瀏覽：列表首圖縮圖與照片總數徽章 (📷 N)、全功能圖片檢視燈箱 (ArrowLeft/Right/Esc)
  ├── Excel Roundtrip：匯出包含新週期欄位與照片備註，匯入完全無損還原
  └── 核心修復：防止 master-data.js 覆蓋品質分頁 onclick，修復 FQC 分頁返回無反應問題
```
