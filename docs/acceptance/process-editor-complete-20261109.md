# 製程編輯台完整目標與整合狀態

本輪產品固定 `a2c5f551d0b897f19bceb4205fcf934daf759467`，tree `cb17482250ecabed17a5626c3c9f4d61370b568a`。真實合入 #102 固定 `dfdfe76`、草稿衝突固定 `88a4a2c`、版本查看 owner 固定 `2e4d20f`，保留 main `9fbba823`（含 #99／#100）、#101 計數、畫布目前 scope Save、全部既有核准歷史及 UNKNOWN 收據。沒有拷入其他工作樹 dirty 程式，也沒有獨立重寫版本查看 owner 的 API／selector。

完整程式尚未上傳 GitHub、合併或部署。#101 遠端仍是 Draft `8f1f243`，#102 遠端 Draft `ee7d4fd`；前者舊 CI 不能代替本輪完整 HEAD。page-v1 marker 未啟用，不能把本機 writer 合樹說成正式資料已拆分。[精確相依](process-editor-remaining-dependencies-20261109.md)。

| 完整目標 | 本機證據／行為 | 尚待驗收或整合 |
| --- | --- | --- |
| 篩選後切頁，不把系統補的空工段當未存 | 已納入假 dirty 比較修正，同頁群組／類別仍屬同一份製程草稿 | 實站空白／不同群組與類別離頁；40 秒原因未查明 |
| 切頁、線別、工段放棄未存，不確認、不恢復 | RAM-only 與 silent departure，保留已送 UNKNOWN 防重送紀錄 | 原生瀏覽器、實體手機與 IME |
| 一鍵存取當前畫布 | 節點、內容、連線同存；其他畫布已存內容與本機修改保留；送審送整份已存製程 | 真實帳號完整流程 |
| Save 才比對，整組我的／對方，保留無衝突修改 | fresh GET→一次 POST→GET，revision/CAS、刪除、連線、同編號新增與選擇中 peer 改版保護 | 兩人及失敗流程實站 |
| UNKNOWN 不重送 | 保留原 operationId、anchor、sent 與 registry；只查原收據，不當未存恢復刪除 | 實站斷線／晚到回覆 |
| 移除同步、最新共享、undo/redo、未存恢復及固定輪詢 | 畫布舊入口已移除；#100 無輪詢、所有歷史 fresh 權限及固定前身負向檢查保留 | 頂部／全螢幕／舊快取巡查 |
| 類別主要工段、自訂流程與機器連動 | 類別已核准 defaultStages 優先，明確空設定及 legacy fallback；新增工段繼承自訂流程型別、機器依線別／工段 | C/GIA CONG 與新增→核准→類別→畫布 |
| 真正不同頁面各自草稿與權限 | #102 AB.catalog／C.catalog／LINES writer、來源驗證、CAS 與基本 UI 已合樹，marker 未開；same-page filter 不另拆模組 | 完整主資料 UI、例行 FQC 整頁接線與安全資料切換 |
| 送審、撤回與審核權限分開 | 整份已存製程送審，固定核准快照、pending／角色／CAS 保留，核准不可撤回 | 全角色實站生命週期 |
| 原頁只讀核准歷史 | 舊 13 組頁面與新 AB/C/LINES 原頁 selector 都已合樹；保留來源身分與 late display／actor／revision fence；回草稿 fresh 權限 | 例行 FQC 新整頁 owner 歷史、原生與實站 |
| 存取後步驟／流程數立即更新 | #101 計數使用 visible canvas projection | 實站數字 |
| 等待時間及完整驗收 | 本機合成、signed route、SQLite／Map R2 分別留證 | 桌面、iPhone、IME、兩人、測試站；>5 秒優化、>10 秒優先；40 秒未查明 |

草稿衝突88增量已納入 PROCESS 照片／排序、IQC 晚到輸入與供應商順序、FQC 刪除、例行 FQC late ACK、Tooling 只在 Save 上傳照片及 UNKNOWN 保護。Tooling 保留原 history display epoch 與舊 handler 防護，shared client 保留比較前／回呼後 owner 檢查，沒有覆回較舊共用檔案。

本輪另修正 `42cdba6`：public state 在移除私有 workflowScopes 前，先完成正式 AB/C 類別及工段來源驗證；否則可能把另一筆已核准工段當成目前正式來源。12 個 inline／records 案例 PASS，獨立 reviewer 用舊程式反證 8 個拒絕案例失敗；新程式全部通過，GET 零寫入。

版本查看 owner 的 2e4d20f 已修正原新三頁 approvedOnly 422；合樹後新三頁與畫布歷史63 PASS。舊 `PAGE_HISTORY_OWNER_HANDOFF.md`／422 probe 是交接前重現紀錄，不能再當本輪故障。例行整頁與主資料完整 UI 仍由草稿拆分 owner 處理。

最終來源／快取／前身鏈／導覽／收據／無輪詢完整套件2030 PASS、0 FAIL、0 SKIP；來源composer 16 PASS。獨立產品語意複核182 PASS，無新 must-fix；原始輸出為reviewer工具stdout，沒有另造測試log。

本輪檢查分批保留：88受影響功能317 PASS；既有歷史／C回呼272 PASS；新page／畫布歷史63 PASS；page public authority、review、runtime、UI全部 PASS；lint、非增量TS與正常 guarded build PASS。套件有重疊，不能相加為全站覆蓋率。25 固定來源、76 current、1180 inverse、226 bounded 真 Git objects、79 原歷史 requests；原固定 pins、173 物件及5MiB guard保留。來源證據與合成測試不能代替實站驗收，最終收據見外部 delivery manifest。

使用者已確認舊草稿可不保留、A 可送整份 AB、例行 FQC 整頁一份草稿；不是待答問題。真資料／schema／ACL／connector／發布均未操作。舊243-path create_tree UNKNOWN 缺原payload與未執行證據，設備tree既有拒絕保留；不以 #101、新PR、拆分或其他executor重送。V42未知操作未重送。完整目標仍 NOT_READY。
