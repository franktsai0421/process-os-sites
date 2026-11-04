# 製程畫布一次原子存取候選

基準：`85fa4a36442b3b72323eb4a6eeb105b867c4856a`；分支 `feat/process-canvas-atomic-save`。未推送、合併或部署。

## 實作

- 製程專用 `save-canvas-v1` 使用既有 `apply` transport 外殼（不是兩次 Apply/Save 請求），保留完整 command fingerprint、actor、sequence、generation、guard、結構驗證及 pending lock。額外要求 save 權限。
- `process-canvas-save.ts` 在 request-local workflow 上建立 immutable saved snapshot；一個成功 CAS、一個 workflow revision、一張外部收據，同時確認目前畫布修改及整份已存製程。空畫布變更仍可存取；真正無變更沿用 saved ID。
- 新命令因 moduleAction 不符合舊 mutation capability，走完整依賴讀寫路徑。未修改 shared-draft、versioned-shared-workflow、state-records 或 FQC；沒有加速完整讀寫的效能宣稱。
- Canvas durable preparation、unknown reference、receipt-only recovery 沿用既有通道。新命令直接由 durable transport 處理，不誤歸類成 owned inverse ledger 的未存 Apply；保存後 canonical model 更新 ledger。舊 Sync/收據 API 保留相容，畫面不再提供獨立 Sync。
- 表單欄位可與同方塊其他欄位合併；刪除仍鎖被刪方塊與受影響連線來源。Legacy editor 保留整個方塊依賴 guard。BOM/IPQC/graph 在每次 CAS attempt 的最終資料重新驗證。
- 未改動待確認畫面／匯出設計。

## 隔離驗證

所有資料為合成；HTTP handler 使用記憶體 SQLite 與 Map R2，沒有 live network/DB。

- `process-canvas-atomic-save.test.mjs`：首次空 Save、單 revision/receipt、view/edit/save 各別拒絕、pending/generation/guard 拒絕、精確重播與 actor/fingerprint、舊 saved/effective/history/receipts 保留、固定 Submit。
- `process-canvas-atomic-save-http.test.mjs`：inline/records-v1 真實 route；一次成功 DB CAS、整批衝突不寫入、新 incoming 關聯拒絕刪除、跨畫布拒絕、不同欄合併、錯誤 action 不寫入、不轉儲存格式。
- `process-canvas-atomic-save-client.test.mjs`：真實 transport/store/journal；連續編輯零 POST、一次 Save 一次 POST、空 batch durable recovery、遺失 ACK/404 不重送、reload 查原收據、新輸入保留、quota 與未完成表單拒絕。
- `process-canvas-atomic-save-stack.test.mjs`：真實 authoring controller + transport + journal/store + owned ledger + production route；inline/records-v1 × compact/full，CAS 競爭重試、整份 saved 與 effective 保全、Save 後 ledger clean、unknown 查收據不重送。
- 相關既有 canvas manual/departure/pending-form/actual-transport/process-lifecycle 與 POST-authority regression 另跑。舊 performance paired tests 缺固定歷史 commit 時明確 SKIP，不做相對效能宣稱。

最終定向組共 147 項：144 PASS、3 SKIP（缺 immutable paired baseline）。之後補上「已拒絕操作完成本機整理不能假報 Save 成功」修正，相關 27 項全 PASS，包含新增案例。

依賴 TypeScript 5.9.3、Oxlint 1.76.0 安裝在 repository 外的 scratch；無專案 lockfile/dependency 變更。JS 語法與定向非型別 lint PASS。專案原 lint 因缺 oxlint-tsgolint 無法啟動；獨立 scratch config 僅用於非型別 lint，未改專案設定，不能算完整 type-aware lint/typecheck。沒有執行完整 build/typecheck、真實瀏覽器桌面/iPhone、物理手機或 Site 驗收。

## 父任務整合需求（發布前）

1. 共用 `delivery-navigation.js` / `navigation-lifecycle.mjs` 尚須接製程無提示放棄：切線別、工段、離開編輯台都只丟未送本機輸入；跨頁 unknown durable evidence 不得清除，仍須查原收據。現有分支保守保留舊 departure，不能宣稱新離頁行為完成。勿直接把 inspect 改為 clean 或關閉所有寫入鎖。
2. 同步整合製程工段 handler、原生 pagehide/beforeunload：正常未送資料可丟棄；sent/unknown、原收據通道及跨 runtime lineage 保留。需測試 pending 與較新輸入混合、連點切頁、帳號/權限/世代變更、BFCache、quota 與清理失敗。
3. 共用資源版本入口需由整合者一次更新，避免 FQC 同時改寫；新 server/client 同版本部署。舊 server 不能接受新 command 卻僅 Apply，客戶端對目前 atomic ACK 有 saved 防護，但不可依靠混版部署。
4. 提交/推送前重新核對 main、FQC 分支狀態與 diff；本分支不直接改共用核心、資料編碼、導覽或資源入口。測試站發布由父任務協調。

## 轉換分類與復原界線

使用者已確認可在改版時放棄「已套用／同步但未存取草稿」差異。仍沒有執行任何真實資料盤點、清除或轉換。

| 類別 | 處理及必要證據 |
| --- | --- |
| 僅本機未送 entries/forms | 新離頁行為可以直接放棄；不能波及同一紀錄中的 dispatched evidence |
| working 與最新成功 saved 不同 | 在受控轉換中列入可放棄候選；先逐 scope/revision 與備份核對，非正常讀取時自動清除 |
| 沒有 V3 saved 的 legacy／新草稿 | 不可推定空白；盤點 legacy 已存版本及 active baseline，無法證明基準時保留並阻擋轉換 |
| saved、pending case、effective、歷史 | 保留內容、ID、actor、時間、引用及 immutable body；前後 digest/計數一致 |
| sent/unknown、404、未完成 disposition | 不列入可丟棄；保留原 operation/generation/channel/lineage，查原收據；404 不證明未提交 |

發布前由父任務安排：停止或隔離舊 writer → exact source revision/manifest 盤點（包含瀏覽器 unknown，單靠 server 無法證明不存在）→ 有可回復的完整 D1/R2/immutable references 備份 → 在隔離副本演練轉換與還原，核對受保護內容 digest → 制定舊 client 失效及新版本啟用策略 → 以同一基準的 CAS 執行獨立授權步驟。保留原快照及備份，不清 R2、歷史或收據。

目前合成測試證明新 Save 保留舊 saved/effective/history 與不自動轉格式，**不代表真實資料已盤點、備份或可復原演練通過**。沒有新增 migration、刪除命令或讀取時自動採用流程。
