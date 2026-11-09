# 製程編輯台完整目標與整合狀態

本機程式固定於 `59027b163535f2b4af0f328782a2552cd7bebf83`，tree `041d625fa71f0e29d59aa538f2dedcee863db9b0`。保留已合併 #99／#100 的 main `9fbba823`、#101 計數、d1／807、歷史 `e3d92846` 與未啟用 #102 前置的真實血緣。此候選尚未上傳完整程式、合併或部署。

使用者要求完整製程編輯台一起上同一 PR；#101 保持 Draft，遠端仍是計數元件 `8f1f243`，該元件四組 CI 成功不能代替完整候選的新 HEAD CI。#102 負責全站真正頁面草稿接入，未凍結的 dirty 程式未拷入。

| 目標 | 本機整合結果 | 尚需完成 |
| --- | --- | --- |
| 篩選後可切頁，不把系統空工段當修改 | 空工段比較修正已納入；群組／類別篩選留在同一份製程草稿 | 最終實站切頁；40 秒現象未重現 |
| 切頁、線別、工段直接放棄未存，不提示、不恢復 | RAM-only 及已審 silent departure；59027 將線別／工段接回 checked abandonment，類別篩選保留 RAM | 實體 IME、原生瀏覽器及實站 |
| 一個存取草稿 | 當前畫布節點、內容、連線一起原子保存；其他畫布已存及未送修改／表單保留 | 真實資料驗收 |
| Save 時才比對、整組我的／對方、保留無衝突內容 | fresh GET→POST→GET；目前畫布衝突範圍、結構依賴、選擇中改版、revision/CAS 均保留 | 兩位真實使用者流程 |
| 刪除／連線／同編號新增與 UNKNOWN | 實際控制器與 signed SQLite route 已測；UNKNOWN 保留原 operationId、anchor、sent 快照與 registry，只查原收據，不重送 | 實站失敗流程 |
| 取消同步、多餘按鈕及背景檢查 | 移除畫布 Sync、最新共享、未送恢復、undo/redo UI，保留 UNKNOWN 防重送；#100 無固定輪詢整合 | 頂部／全螢幕／舊快取實站巡查 |
| 類別主要工段及機器連動 | 類別已核准 defaultStages 優先；#99 新工段繼承已核准 catalog、自訂類型與獨立 ID；機器依線別／工段 | C/GIA CONG 實際設定及新增→核准→類別→畫布 |
| 不同頁面各自草稿及權限，同頁篩選不拆模組 | 此候選保持 process:platform；只納入未啟用 b172 前置 | #102 真正 codec/CAS、舊 writer fences、審核／歷史／UI 與安全轉換 |
| 送審整份已存製程，核准固定快照，不可撤回 | 現有 workflow、pending／權限／CAS guards 保留，Save 不偷送審 | 完整角色及實站生命週期 |
| 原頁已核准歷史唯讀，不回填 writer | 真實 merge e3d92846：13 組頁面含畫布、PROCESS 模板機器、IPQC AB、例行 FQC；返回草稿 fresh edit/save permission，display epoch 拒絕舊 handler／排程 filter | #102 新 ownership 與原生／實站整合 |
| 存取後流程數立即更新 | #101 投影計數已合入，同一 visible canvas projection | 實站數字核對 |
| 速度 >5 秒優化、>10 秒優先及完整驗收 | 本機功能證據保留 | 桌機／iPhone／IME／兩人／測試站；40 秒原因未查明 |

三項草稿規則已由使用者確認：舊草稿可不保留、A 可送含 AB 修改的整份案件、例行 FQC 整頁一份草稿；全部草稿頁在 #102 統一。這些不再是待答問題，但尚未實作完成或切換真實資料。

## 本輪驗證與限制

- 59027 相關畫布、歷史、選擇器、Save 與設備合併套件：223 PASS、0 FAIL、3 個既有 optional performance SKIP。SKIP 缺固定 c82a395 基準，不當作效能通過。
- 線別／工段首輪 11 PASS；獨立 reviewer 產品複核 PASS，history×line 競態 2 PASS。UNKNOWN 測試補強後另 1 PASS，實際非空 anchor、sent、registry bytes 不變。
- f61a00b1 是 e3d 後的測試交付，沒有新產品差異。逐段納入 18 個 signed 設備案例、processMaster fixture、persisted reader 及必要 CI；沒有覆寫 root 當前畫布 Save 或歷史 permission gate。18 新案例加 4 原路由樣本共 22 PASS，這是本機證據，不是上游 173 PASS／3 SKIP 的重貼。
- Save 舊測試預期 POST→GET 已改為 fresh 比較 GET→POST→GET，確認 only one POST、fresh expectedRevision、peer 其他畫布保留。另 4 signed route 反例驗證比較前撤權零寫入、比較後 peer 修改由 revision/CAS 拒絕；未只更改 count 斷言。
- 前一相同歷史功能 runtime 的 13 頁實際堆疊 383 PASS、核心 355 PASS、送審 feedback 60 組 PASS；本輪線別政策增量另列，不能把不同批次或重疊套件相加為全站覆蓋數。
- 59027 正常 lint、非增量 TypeScript、guarded build 均 PASS。初次 build 缺必要 PROCESS_PROGRAM_COMMIT 而拒絕，保留 log；提供精確程式提交後正常 build 成功，未繞過 guard。
- 精確來源：20 固定 targets、58 current、777 projections、189 bounded 真 Git objects、79 原歷史 requests；原 173 物件與固定 targets 順序／值完整保留。只替換前 current e9 的 4 個 source-chain 物件；e9 完整證據另存。contract 5,223,479 bytes，未提高 5MiB 限制。這不是功能或實站驗收。
- 完整來源歷史、乾淨 consumer 與最終 source gates 以本次外部 manifest／logs 的實際結果為準；之前 27a 的證據不能代替新 HEAD。

## 發布阻擋

舊 243-path create_tree 結果仍 UNKNOWN，缺原精確 payload／未執行證據；404 不足。原設備 tree 拒絕亦保留，未以 #101、新 PR、拆分或其他管道重送。PR #101 說明文字更新另已獲使用者明確同意，與程式傳送分開。

未啟用頁面資料／schema／ACL 切換、未接觸真實業務資料、未啟動或重連中控系統 connector、未合併或部署。原 V42 結果未明不重送。真實瀏覽器、手機／IME、兩人、效能及測試站仍 NOT_RUN，完整製程目標尚未完成。
