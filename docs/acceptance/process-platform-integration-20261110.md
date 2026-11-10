# 製程平台新分支整合：範圍與未完成項目

基底 main `9fbba823090f03da8385c8d92f5e59293d19d2f1`，新分支 `codex/process-platform-integration-20261110`。本次為新雲端工作副本；#101/#102 保持已關閉、未合併，來源分支保留。#103 帳號權限獨立工作，不帶入其程式。

**完整清單尚未完成，不能合併或部署。** 本輪先沿用可獨立確認的 #101 畫布計數成果，保留 main 已完成的其餘功能；沒有重新修理已驗過的舊功能。這份候選只有兩個產品檔：`editor-line-selection.js` 與它的 index cache tag。其他項目仍按下表列明，不能把盤點或舊版 PASS 說成新整合版驗收。

## 來源分類與不重做原則

| 分類 | 證據／本輪處置 |
| --- | --- |
| 已合併 | #77 原子存取 merge `2b58eae`、#96 未啟用歷史 helper merge `dc34874`、#99 工段類型 merge `021f0f3`、#100 無固定輪詢 merge `9fbba823` 已在 main；其產品檔不改寫 |
| 舊測試站曾驗證 | 使用者表示以前有測試站驗證；現有交接與 PR 資料沒有足以將整份 20 項清單綁到某個 live URL／commit 的部署收據。本輪保留既有產品程式，不補造實站 PASS。舊 compiled／synthetic CI 明確只作其原版本證據 |
| 舊分支可獨立沿用 | #101 `8f1f243` 中計數來源 commit `e2591c6fb70a01770d3c7ae12a6780c58c1fe6a3`；本輪 selector 檔逐 byte 相同，只組合自己的 cache tag 到最新 main，沒有恢復 #100 已移除的 4 秒輪詢 |
| 舊分支仍待整合 | #102 `55d4672` 含 390 個 app/lib/public/scripts/tests 差異，混合多頁草稿、品質、帳號、歷史與來源證明；不能整包套用。完整畫布候選的本機交接含已知跨頁相依，必須逐項抽取完整依賴 |
| 新需求尚未驗證 | 最新 main + 本輪計數以外的整體新候選尚不存在；完整多人、歷史、分頁、BOM/IPQC、真實效能與實站驗收不可引用舊 PASS 代替 |

## 其他製程分支的保全核對

精確 SHA／blob 比對在 [branch inventory](process-platform-branch-inventory-20261110.json)。benchmark 補充的 10 個腳本／測試及 #99 的 4 個程式／測試檔與 main 逐 byte 相同，不重做。舊 preview 自身 27 個程式／測試路徑中，11 個與 main 現況相同，24 個的原 blob 已在 main 歷史；其餘三個是預覽專用 title/i18n 標示與啟動合成資料腳本。已唯讀確認 i18n 與 main 只差標題的「流程資料驗收副本 CLOUD 29102026」前綴；index 是獨立驗收入口，launcher 只建立合成 fixture。本輪不將預覽入口或 seed 帶入平台，也不刪除其來源。其他已是 main 祖先的原子存取、local Save、bounded-writes-clean、fullflow、portable save response 直接保留；原始非 portable 分支尚不以名稱或 diverged 狀態推定可刪除。

## 完整目標、相依、風險與驗證矩陣

需求來源：[固定 55d 完整清單](https://github.com/franktsai0421/process-os-sites/blob/55d4672cb8004d0b01715714cbc91fbce6b22d2b/docs/acceptance/process-editor-complete-20261109.md)、[PROCESS_EDITOR](../specs/current/PROCESS_EDITOR.md) 及使用者最新指示。下列沿用 main 表示程式未改，不表示本輪重新驗收。

| 目標 | 本輪結果 | 必要後續／風險 |
| --- | --- | --- |
| 1 工段橫向畫布、搜尋、縮放、全螢幕 | 沿用 main | 桌面／手機互動，完整流程只能調視角 |
| 2 新增、拖曳、平移、連線、產品高亮 | 沿用 main | 手勢／照片／端點誤觸與跨線別來源 |
| 3 類型適用分頁、隱藏舊資料保留 | 沿用 main | 不能以隱藏 UI 刪資料；新增工段類型沿用 #99 |
| 4 雙語卡片、作業文字及本方塊照片 | 沿用 main | 長名稱、共用／產品媒體來源及讀失敗重試 |
| 5 連線規則、刪除影響、自動整理 | 沿用 main；舊候選有刪除相依群組增量待抽取 | BOM、入出邊、刪除與同 ID 競態須一起測 |
| 6 編輯視窗、跨分頁輸入、Apply 後明確 Save | 沿用 main | 原生 IME／輸入、Apply 與伺服器保存不可混為一談 |
| 7 產品與跨工段 BOM 唯一性 | 沿用 main | 真正 handler 的引用、權限、重複占用與多人 CAS |
| 8 IPQC 占用及機器線別工段篩選 | 沿用 main | 不改品質／機器主檔；跨頁來源與權限仍需完整流程 |
| 9 主資料先顯示、輔助失敗不誤報空流程 | 沿用 main | 冷啟動、失敗重試及舊快取 |
| 10 篩選補空工段不誤判 dirty／不阻擋離頁 | 待整合舊畫布成果 | 需和新 shared client／navigation 語意一起核對；40 秒原因未查明 |
| 11 切頁／線別／工段直接放棄未送修改 | main 有部分；舊候選後續 changeCanvasView 待整合 | 必須保留已送 UNKNOWN／原收據，不能把一般 RAM 放棄當取消保存 |
| 12 單一 Save 保存當前畫布、保留其他已存畫布 | #77 核心保留；舊候選 scoped/filter 保留增量待整合 | 同頁篩選不是新模組，送審仍整份已存製程；檢查跨畫布 journal |
| 13 fresh 比較、整組我的／對方、無衝突保留 | 舊 ec5b2eb／後續成果待抽取 | 節點刪除、新邊、撞號、peer 再修改及 revision/CAS／UNKNOWN |
| 14 取消固定輪詢／多餘恢復／undo redo | #100 保留；舊畫布入口清理增量待整合 | 不移除必要權限 fresh 核對及原結果查詢；不得帶回舊 count 分支輪詢 |
| 15 類別 defaultStages 決定畫布 | 沿用 main | C/GIA CONG 真實類別、明確空設定、legacy fallback 未重新實站驗收 |
| 16 核准新工段與流程類型、機器連動 | #99 保留 | 先工段核准再引用；不能複製別工段機器；page-v1 writer 相依另核對 |
| 17 製程與主資料頁草稿／權限分離 | #102 page-v1 相依待整合 | 不混入 #103 帳密修復；沒有啟用標記、遷移真資料或授予真人權限 |
| 18 送審／撤回／核准權限分開 | main 防護保留；新頁規則待整合 | 固定 saved 快照、pending/CAS、核准不可撤回、前後端一致 |
| 19 原頁選核准版本只讀、切回草稿 | #96 helper 已在 main；完整 API／selector／display fences 待整合 | UNKNOWN32 包含後續 PROCESS history 重繪修復，不能用舊 baseline 宣稱最新完整通過 |
| 20 Save 後流程數及速度 | **已沿用 #101 計數**；本機／新 CI 定向驗證 | 只計 allowed category stages 的目前 V2 投影；效能未量測，>5 秒優化、>10 秒優先 |

## 本輪計數實作與來源

舊 header 使用 held `editorByCategory`，Save 後 V2 卡片已使用更新的 CanvasJournal projection，導致數字落後。本輪直接沿用原修正，頁首與卡片按同樣可見工段投影計數；不寫資料、不存取、不查其他工段、不改 journal。中文／越文及 legacy／V2 未載入保留原行為。

新來源證明保留 main #100 的所有 background contract hashes、Rules 和舊前身；只允許精確的新 index 反向移除本計數 tag，再進入原無輪詢／Routine 來源驗證。非 Buffer、回退、部分 tag 或任何非精確 byte 均不能被當成已知 successor。來源 helper 不執行或恢復舊產品程式。定向 CI 與既有 CI 均保留，沒有修改原 UNKNOWN32 的 workflow 或測試修復。

## 原 UNKNOWN32 阻擋與外部操作

原操作 `github.create_tree`：base tree `d52e44319e6453a45bf9db8b0ff66d3f0c0ebec9`，expected tree `5005cba09d970cec70334d6bd540db1b599858d2`，32 paths。歷史工具在約 4789 秒後由使用者中斷；沒有後續 create_commit/update_ref。舊讀回 422，本輪唯讀 GET tree 再回 404；仍不是原操作「確定沒執行」的證據。**狀態 UNKNOWN，沒有重送、拆分、換工具或建立重疊替代上傳。** 另有 243-path 及設備歷史限制，本輪沒有重試。

本輪與該 32 檔只有 `public/process/index.html` 路徑相交：只改 `editor-line-selection.js` 的計數資源 tag。沒有帶入該批 app.js、version-draft-ui.js、PROCESS history 重繪、role fixtures、source-proof helper 或其 workflow 內容。這是已確認遠端 #101 的獨立成果，不是舊 UNKNOWN 操作的替代重送。

新分支建立成功。新 Draft PR、上傳與 CI 必須以本次實際外部收據為準；完整整合仍受上述相依與 UNKNOWN 限制。未重開、刪除、合併 #101/#102；未改 #103；無部署、DB/R2、schema、資料包或真人帳號操作。

## 驗證狀態

PASS：113 個定向 VM／來源／導覽／無輪詢案例，含原 #101 四個實際 selector＋CanvasJournal 計數案例、3 個新精確組合負向測試、原 background/Routine/reporting pins；既有線別選擇腳本 PASS。lint 0 findings、非增量 TypeScript 0 diagnostics、diff whitespace PASS。來源歷史預檢在 bc0fe0e 檢查 605 commits／5,329 unique blobs／2,015 working files，PASS；最後候選另以實際預檢收據核對。guarded build 在真實本機 commit 8c8ba548204fc199a9b05853cd0a69ae3866e044 回 exit 0，postbuild auth boundary PASS；其產品來源與最後文件候選相同，但不稱為遠端新 HEAD build。前次以縮寫 SHA 啟動在編譯前被既有 guard 正常拒絕，後續改為完整真 SHA，沒有改 guard。

定向 VM／來源檢查只驗證上述計數與組合；依賴重用相同 lockfile 的實體副本，不是全新 npm 安裝驗收。各組有重疊，不相加為覆蓋率。沒有重試既有原生 socket 限制。

NOT_RUN：原生桌面、實體 iPhone／IME、實站兩位使用者、完整 20 項新整合候選、C/GIA CONG 真資料生命週期、進頁／切頁／Save／Submit 的真實資料效能與部署驗收。
