# 3020 本機畫布、整批同步與自動整理

狀態：**EXECUTED／複審 BLOCKED**。程式已實作，以下區分 UI、API、受控模型測試及未測項目；不是全部項目的實機 PASS。

## 基線與資料保全

- checkout `<WORKSPACE>/中控系統`；分支 `codex/ipqc-ab-local`；HEAD `ba6c7a25b211f83df9bbe7caf82bf646737bdbca`。沿用未提交成果，未 commit/push/merge/deploy。
- 既有 3020 服務未重啟。`127.0.0.1:3020` 為原資料；同服務的 `localhost:3020` 為既有合成副本，不是新 PORT。未操作 3000／3030 或其他服務。
- 修改前與驗收中核對原資料都是 **revision 327**，13 個 state key SHA-256 全相同；包含草稿、版本、IPQC、BOM、權限、品質及派送。未替原資料送審／核准。
- 黃色測試切換帳號列只由 `scripts/ipqc-isolated-server.cjs` 注入 HTML，不在正式 `public/process/index.html`，本次未改登入、角色或自審規則。正常 Demo Admin／ADMIN 仍依原權限及明確自審確認／audit；**未操作日常 3000 驗證**。
- 媒體沿用原 fixture photoRoot、runtime archive 與 canonical manifest/assets；本輪不搬移、不覆寫媒體。原快照含現有資料及媒體引用。

所有證據與修改前檔案：

`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/canvas-local-20261008/`

關鍵檔案：`before/`、`git-before.txt`、`primary-before.json`、`primary-after.json`、`synthetic-before.json`、`synthetic-control-before.json`、`preservation.json`、`task.diff`、`task-files.json`。

## 根因與實作

原先每次放開方塊／完成連線就等 guarded apply，而服務所有 API 排隊，成功寫入又等待完整 checkpoint；前端同時把位置寫入視為整個畫布的互動鎖。這讓下一次手勢被略過，且回應與背景更新容易造成定位錯覺。不是單一網路延遲。

- `public/process/canvas-local.js`：獨立 journal 只記 x/y/nextIds 的 base/value。畫布投影與共享 working 完全分離；scope undo/redo、dirty 統計、固定批次、operationId 收據、origin/account/generation/tab 恢復隔離。
- `public/process/process-editor.js/css`：手勢立即本機更新；工具列自動整理／復原／重做／同步；新線虛線，合法端點綠色與磁吸，對齊輔助線／Alt、邊緣捲動、Esc取消、游標中心縮放。內容表單與刪除 guard 讀共享原值，不採本機投影。
- `public/process/editor-graph.js`：actual-size 分層排版、進站／出站左右邊界、未連接節點下方排列；拓撲不變。阻擋線以警示線保留，不能靜默消失。
- `public/process/process-authoring-v3.js`：本機可編輯條件不受內容 busy 鎖住；舊 revision 不倒灌；Save遇本機變更先確認固定 batch，再以 revision/generation 檢查 Save。
- `public/process/shared-draft-client.js`：可預先建立固定 command／查收據／重送同一 operationId，原有 command 呼叫介面保留。Canvas 使用獨立 transport channel，仍為同一正常 guarded API。
- `public/process/index.html`：載入 canvas-local 與新版 asset version。未更動測試登入注入或上方外觀。
- 規格、PROCESS、DATA_MODEL、CHANGELOG、HANDOFF 更新。伺服器 schema 與業務資料模型不變，新增的是瀏覽器恢復紀錄。

本輪驗收發現並修復：畫布 DOM 變數與 journal 存取函式同名造成線未繪製；同步成功摘要語系切換及儲存後措辭；Save跨 generation 的確認邊界。最終桌面 15 方塊有14條線、5方塊分支匯合有5條線、10方塊含未連接節點有9條線，沒有 blocked 路線。

## 驗收矩陣

| 項目 | 結果 | 證據與限制 |
|---|---|---|
| 5／10／15 實際尺寸、穩定排版、無方塊重疊 | PASS | `model-tests.json`；三種數量均有3020桌面操作，未做20方塊 |
| 分支／匯合／未連接 | PASS | 5方塊分支匯合、10方塊未連接；`desktop-5-branches.png`、`desktop-10.png` |
| 真實滑鼠拖動、定位、不誤開彈窗 | PASS UI | entry從80/745.5移至244.607/640.75；背景讀取後仍相同；dialog數0 |
| 連續拖動、內容busy仍可畫布編輯 | PASS handler | `gesture-tests.json`，直接執行實際event handlers；不是實機慢網路測試 |
| 刪線、重新接線、合法綠色端點、新線虛線、復原 | PASS UI | 刪線數1→重新接回0；新增不同線虛線1→復原0；原拓撲保留 |
| 自動整理復原／重做 | PASS UI/model | dirty移動15→復原0→重做15；不寫API |
| 同步期間繼續編輯、舊回應不清新變更 | PASS UI/model | 第一批成功後仍有1個新移動；`controller-tests.json` |
| 跨兩工段一次同步 | PASS UI/API | dirty範圍2→單次成功；`api-tests.json` |
| 內容Apply不夾帶本機畫布 | PASS UI/API | `content-separation.json`：文字更新、positionChanges=[]，本機dirty15仍保留 |
| Save前同步確認及已儲存狀態 | PASS UI/API | 真實確認視窗→同步→上方已儲存；保存固定expectedRevision，失敗不得Save |
| 共享內容、媒體、BOM、IPQC及其他模組保留 | PASS API/原資料hash | API欄位比對、`preservation.json`13keys相同 |
| 整批冲突不部分寫入 | PASS API | 一個stale guard造成整批409，另一欄位不變 |
| 雙帳號同位置競態 | PASS API | 同時admin/admin2，狀態[200,409]，僅一方成功 |
| 實際兩分頁衝突與放棄 | PASS UI | 明示A-CUT/pe-0/x；確認放棄才載最新，`two-tab-conflict.png` |
| 403／停用帳號／待審鎖 | PASS API | 403／401／409保留；合成案件正常Save→submit→另一ADMIN撤回 |
| 不復活已刪除ID | PASS API/model | ENTITY_ID_RESERVED拒絕重用測試舊ID；改用新合成ID，未取消保護 |
| 逾時收據恢復／同ID重試 | PASS controller/API | 模擬未知結果查收據，不重POST；API同ID重試revision不再增加 |
| 真實斷網中途／瀏覽器逾時 | NOT_RUN | 未中斷既有共用3020網路或服務；以上不是實際斷網證據 |
| 本機reload恢復、帳號／generation隔離 | PASS model/controller | JSON持久紀錄重建及隔離；瀏覽器未同步時離頁確認由工具取消，實際dirty reload列BLOCKED，不冒稱PASS |
| 已同步／已儲存後重開 | PASS UI/API | 頁面實際重載、API讀回；最後成功Save與working另行保留 |
| 中文／越文及390×844視窗 | PASS UI limited | `desktop-zh.png`、`desktop-vi.png`、`mobile-390.png`；非實體手機／觸控驗收 |
| Alt吸附暫停、邊緣自動捲動、Esc、游標縮放 | Implemented / 部分未測 | handler取消已測；上述各自完整實機矩陣NOT_RUN，不用程式存在代替PASS |
| 既有V3 kernel／poll／內容同步回歸 | PASS | 14 kernel群組、5 poll、6內容同步；`regression-results.txt` |
| 定向lint／diff check | PASS | 五個runtime JS oxlint無錯；diff check只有既有CRLF警告。無TS型別／schema變更，本輪未跑整個build |
| ChatGPT獨立複審 | BLOCKED | workspace_info仍MCP -32603；未送EXECUTED、未改共享指標 |

可讀測試輸出：`model-tests.json`（13）、`controller-tests.json`（7）、`gesture-tests.json`（6）、`api-tests.json`（17）。原程式測試入口為 `scripts/test-canvas-*.cjs`；API測試只用 in-memory copy，不改原業務資料。

最後合成副本Save：workflow revision39，savedId `3981bcf8-f75a-4bee-8e22-1a09a9cd3111`，操作者Isolated admin，2026-10-08T07:55:29.862Z；`synthetic-final-save.json`核對savedEqualsWorking=true。這是合成驗收快照，**不是原3020或日常3000核准版本**。

## 效能界線

`performance-segments.json` 使用同一fixture queue程式與相同handler，**在副本內量測，非線上服務逐請求trace**：背景讀取746.79ms；人工注入50ms等待的queue實測51.41ms；驗證／backup／寫入合計1788.89ms；checkpoint讀576.23ms、JSON編碼326.46ms、寫檔rename282.86ms，129,194,350bytes。checkpoint檔僅寫證據目錄，未還原或替換服務資料。

本機journal定向操作約0.08–0.97ms；5/10/15幾何約4.03/0.67/1.23ms。桌面DOM測得paint約0.5–3.5ms（快取路由0ms）；不是端到端P95，也不是所有硬體的保證。真實3020 API仍有排隊及checkpoint成本，沒有取消成功操作的可恢復性。本機手勢已不依賴該API完成。

## 已知界線、回復及後續

- 256個patch是原API上限；過大批次整批拒絕，不拆半份成功。須先減少本機變更，不能靠放寬guard解決。
- 其他人刪除仍有本機修改的方塊，保留衝突且不復活；確認放棄未同步變更後讀最新。不要手改localStorage或直接重播未知command。
- 修復回復以 `before/` 為**差異參考**，逐檔撤除此輪改動；不可整批覆蓋含並行工作的新檔。`task.diff`與manifest作定位。新增canvas-local移除時須同步移除index載入與adapter掛接，且先處理本機未同步／未知操作。
- 原3020資料未變，不需要資料回復。既有可恢復服務檔仍在 `editor-feedback-20261008/runtime/primary-latest.json`、`synthetic-latest.json` 及對應archive。將來重啟須使用當下最新快照與原媒體來源；本報告revision327備份不可覆蓋後續新資料。兩個host快照不得互換。
- 合成副本已由舊20方塊fixture減至15、5、10做本次驗收；舊ID保留tombstone，新增合成節點用新ID。沒有把合成產品、帳號、案件帶到原資料或日常3000。
- Connector恢復步驟 `c2c sandbox-allow --json` 需把C2C狀態目錄加入Codex config.toml writable_roots；自動審批拒絕此持久安全設定變更，理由是未有該具體授權。沒有繞過或重試其他寫入方法。技能doctor gate未綠，不向ChatGPT貼原始檔案或送C2C訊息。待取得授權且workspace_info恢復，再送此report作獨立複審，不能把此狀態記成REVIEWED。
