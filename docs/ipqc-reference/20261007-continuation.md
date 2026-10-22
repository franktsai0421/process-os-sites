# 2026-10-07 接續驗收

STATE: EXECUTED。核對昨天這個 IPQC 對話的未完成程序，補做可在本機隔離執行的驗收；前一輪結果見 [review5](20261006-review5.md)。工作目錄 `<WORKSPACE>/中控系統`，分支 `codex/ipqc-ab-local`，HEAD `84278d837898f4e836ec003f7adb67ff38f785c8`，原有未提交內容保留。

## 核對與完成項目

昨天主要實作、23 個 AB 草稿跨頁 Save／Submit、C/INOX Apply／Save 修復及交付證據已完成，沒有尚在執行或掛起的 IPQC 測試程序。現存 3020 是持續提供畫面的隔離服務（PID 21320），不是未跑完的測試；3030（PID 24604）由另一個模具匯入對話處理，本輪不操作。

| 項目 | 結果 | 證據及界線 |
| --- | --- | --- |
| 昨天未截取的藍色占用卡片 | PASS | 實際從 3020 開啟 A-CUT-02 的 IPQC 分頁；已選 0、其他流程使用中 2、尚未分配 5；展開 CUT-L1，兩個占用項目顯示 A-CUT-01，checkbox disabled、藍色卡片與移轉說明正確。取消後 dialog 數為 0，未套用或 Save |
| FQC 真實 handler 送審／自審 | PASS | ADMIN 正常 Save→Submit→明確自審確認→Approve；缺名称／無修改為固定待補。保留既有 FQC 僅 ADMIN 維護範圍；不是一般員工可維護 FQC 的宣稱 |
| IQC 真實 handler 送審／自審 | PASS | 有授權的 staff 正常 Save→Submit→Approve；缺名稱與無修改提醒不阻擋；空頻率值不阻擋，已填非法數值仍列阻擋錯誤 |
| 檢具設備真實 handler 送審／自審 | PASS | 有授權的 staff 正常 Save→Submit→Approve；缺名稱與無修改為待補 |
| 上述三模組技術保護 | PASS | 不確認自審時 SELF_REVIEW_CONFIRM_REQUIRED；viewer 403；錯案件 409；待審保存 PENDING_LOCKED。使用各實際 route／adapter，非僅共用 kernel |
| 新增測試 lint | PASS | `npx oxlint scripts/test-ipqc-continuation-20261007.cjs` exit 0；[日誌](evidence/20261007/continuation/lint.log) |
| 3020 程式及保存狀態 | PASS | GET 200；CSS SHA 與 checkout 相同；revision 190，最後儲存仍為 2026-10-06T09:56:13.997Z，pendingId null；[services.json](evidence/20261007/continuation/services.json) |
| 3000 | Not available | ECONNREFUSED，未自行啟動或改寫日常資料 |
| 其他模組全套實際 UI、自審跨頁及實體手機 | 未測 | 本輪三模組為實際後端通路驗收，不等於每個 UI 已點擊通過；528px 瀏覽器視窗不是實體手機 |
| 昨天擴大 lint | FAIL（前輪，未重跑） | 既有／並行程式診斷保留，詳見 review5；本輪只對新增測試執行定向 lint，沒有全庫 PASS 宣稱 |
| V3 全部 T01–T45、一般媒體完整載入及正式播放 | 未測／沿用原界線 | 沒有把完整產品驗收冒充本次已完成，不重跑已通過且未受影響的測試 |

![實際占用卡片](evidence/20261007/continuation/occupied-zh.jpg)

## 執行證據

新增 [test-ipqc-continuation-20261007.cjs](../../scripts/test-ipqc-continuation-20261007.cjs)，沿用既有 growth fixture／harness，每個模組建立獨立 SQLite `:memory:` 和記憶體 archive，不監聽新埠、不寫入 3020 或日常 D1/R2。完整執行輸出：[handlers.log](evidence/20261007/continuation/handlers.log)。第一版測試以 staff 呼叫 FQC Save 得到 403，原因是現行 FQC adapter 的 ADMIN 維護門檻；調整測試角色後通過，沒有放寬正式權限。初始紀錄另留於 [handlers-fixture-permission.log](evidence/20261007/continuation/handlers-fixture-permission.log)。

瀏覽器驗收經原本隔離帳號入口登入，從現有 A-CUT-02 開啟／展開／查看／取消。沒有批准新案件、改變分配、套用或儲存。原昨天畫面與資料操作證據仍保留。

Changed：新增一個隔離回歸測試及本輪證據，更新交接／變更入口與前輪報告的補驗收連結；本輪沒有修改 production 程式、schema、migration 或儲存架構。資料模型影響：無。風險：上述剩餘 UI／實體裝置／日常入口未驗證，不能推論全面功能已通過。未 commit、push、merge、部署或日常業務寫入。
