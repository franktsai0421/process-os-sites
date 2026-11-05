> Integration handoff: remote canvas004b2ff is now composed into `integration/draft-save-20261104`; checked silent departure is implemented and validated there. The independent-candidate history below describes its earlier boundary. See [combined evidence](draft-save-integration-20261104.md). No live conversion, main merge or deployment.

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

後續依授權執行 `npm ci --ignore-scripts --no-audit --no-fund`，安裝 lockfile 所列完整依賴；未更改 dependency/lockfile。完整 `npm run build`、原始設定的 `npm run lint`（包含 typeAware/typeCheck）及 `tsc --noEmit --incremental false` 全部 PASS。型別 lint 發現的四處測試 Promise 已補上 `void`，沒有停用規則。

### 桌面原生瀏覽器驗收

`tests/process-draft-lifecycle-browser.mjs --isolated-desktop` 使用編譯程式、loopback ephemeral Miniflare、非持久 D1/R2、合成帳號與瀏覽器真實 DOM 點擊；worker outbound 阻擋，沒有呼叫 live Site。既有 CI 預設限制保留，桌面使用明確的新入口，不假報 CI。

Linux Node 24.19.0、npm 11.9.0、Playwright 1.62.1、系統 Chromium 154.0.8037.57，1365×900 桌面視窗。5 輪 × 18 階段共 90 個量測全 PASS，pageErrors 0；第 2/4 輪切換繁體中文，其餘越文。覆蓋 Begin → 本機自動整理/方塊完成 → 原子 Save → Submit → Withdraw → Resubmit → Return → Resubmit → Approve。每輪本機自動整理/方塊完成均零 POST；Save 每輪只有一個 POST，working/saved 相同且 workflow revision 只增加一。撤回/發回/核准狀態、固定 saved、正式投影、其他 seed values 不變均由隔離 fixture 讀回核對。測試保留既有待補確認，未放寬審核。

截圖檢查修復方塊完成與刪除提示的舊「同步」文案，以及共用版本 UI mount 後製程 Save 按鈕文案；只改製程端，不改共用版本或導航。截圖/報告：`.sites-runtime/process-canvas-desktop/saved-{1..5}.png`、`.sites-runtime/process-draft-lifecycle-browser-result.json`。手機驗收依使用者偏好不執行。這不是 live HTTPS 或實際資料效能保證；多人衝突、unknown/receipt 故障仍以隔離 HTTP/VM 測試為證據，未聲稱本輪原生瀏覽器覆蓋全部故障。

Playwright 自帶 Chromium 下載因 `cdn.playwright.dev` 網路政策回覆 403 Domain forbidden；未改政策或重試繞過，使用已安裝系統 Chromium 完成驗收。

### 三個 skip 的確切原因

`canvas-post-authority-stack.test.mjs` 的 100 次本機編輯 JSON/network 配對，以及 20-row、1000-row request/response bytes 配對，都需要 immutable commit `c82a395244ec26d1787f78bd12039d3b471f223f`。目前 repository 不是 shallow clone，但沒有此 object；對既有 origin 查取此 exact SHA 回覆 `upload-pack: not our ref`。故保留這 3 個明確 skip，不用 main 或其他 commit 替代基準，也不宣稱相對加速。其他功能測試照常執行。

### 重現

在乾淨相同 head 安裝 lockfile dependencies；build 的 commit pin 是來源證據，不是發布批准：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
PROCESS_PROGRAM_COMMIT="$(git rev-parse HEAD)" npm run build
PROCESS_PROGRAM_COMMIT="$(git rev-parse HEAD)" CHROMIUM_PATH=/usr/bin/chromium node tests/process-draft-lifecycle-browser.mjs --isolated-desktop
node --test tests/process-draft-lifecycle-browser-contract.test.mjs tests/process-canvas-atomic-save*.test.mjs tests/canvas-manual-sync.test.mjs tests/canvas-departure.test.mjs tests/multiuser-canvas-actual-transport.test.mjs tests/canvas-pending-form-admission.test.mjs tests/canvas-post-authority-stack.test.mjs tests/process-draft-lifecycle-route.test.mjs
```

需要 Chromium 的環境可指向已授權可用的 `CHROMIUM_PATH`；不得用此 runner 繞過已拒絕的 socket/browser 能力。共用導航與真實資料轉換/發布仍未執行。

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
