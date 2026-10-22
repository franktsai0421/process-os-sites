# 2026-10-08 製程編輯台回饋修復

狀態：EXECUTED（本機修復與定向驗證）；非獨立複審通過。使用者已取消舊自動複審；本輪未重送 ChatGPT、未改共享 C2C 指標。

## Task / baseline

使用者回報中越文方塊重疊、線路彎折／疊線／穿框、入口出口和套用遲緩，以及機器選擇缺照片。分支 `codex/ipqc-ab-local`，HEAD `ba6c7a25b211f83df9bbe7caf82bf646737bdbca`。以實際未提交成果補修，未覆蓋 FQC／模具並行工作；本輪沒有 commit、push、merge、部署或其他 port 操作。

## Changed

- `editor-graph.js`：按實測卡片高度對齊鏈路中心，直線優先，分支採獨立通道；檢查部分重合及過近平行段，轉彎和交叉加成本；簡單路線先求解，必要時才使用網格避障。並非對任意圖保證全域最優。
- `process-editor.js/css`：文字或照片改變高度時重新測量，顯示層避讓不寫入流程內容；路線未變則重用，避免每次按鈕／重畫重算。儲存結束更新畫布按鈕鎖定狀態，仍受原權限／待審鎖控制。機器選擇加入來源照片與相簿，照片點擊和勾選分離。
- `app.js`：V3 直接產生新工作區，沿用原上方模板，避免先完整產生舊畫布再丟棄。
- `process-authoring-v3.js`：僅 diff 當前 workspace；保留完整 operation guard、CAS。套用成功後待補檢查非同步更新，檢查網路失敗不冒充套用失敗；手動儲存及送審仍維持原流程。
- `index.html`：本次相關資源版本更新。需新載入頁面才能取得新程式；已開的編輯表單不強制重整。
- `ipqc-isolated-server.cjs`：沿原 3020 服務提供本機 canonical 圖片，重用既有 manifest／大小／SHA 驗證；修正 localhost 合成副本的 Origin；大型 API 讀取序列化，新封存落到本任務磁碟，成功 API 寫入後原子保存可恢復 checkpoint。

## Tests

| 檢查 | 結果 | 證據／界線 |
|---|---|---|
| 5/10/15/20，zh/vi，變高卡片、長名稱、照片、分支與單鏈 | PASS | [17 案原始輸出](evidence/editor-feedback-20261008/geometry-output.json)；單鏈零轉彎 |
| 桌面真實 DOM，20 方塊20連線 | PASS | [幾何結果](evidence/editor-feedback-20261008/browser-geometry-check.json)：重疊0、穿框0、疊線0、交叉0；20線共10轉彎 |
| 越文20方塊實際 DOM | PASS | [越文結果](evidence/editor-feedback-20261008/browser-vi-geometry-check.json)；重疊／穿框／疊線0 |
| 復原整理不改內容 | PASS | [完整 working 深度比對](evidence/editor-feedback-20261008/undo-check.json) |
| 套用、跨分頁保留、手動儲存、重開、取消放棄 | PASS | 合成資料人數1→2、重開仍2，取消9仍2；[記錄](evidence/editor-feedback-20261008/ui-checks.json) |
| 套用非同步待補、跨workspace保留、CAS失敗保留輸入 | PASS | [6 項輸出](evidence/editor-feedback-20261008/sync-output.json) |
| 儲存後畫布解鎖、權限／待審仍鎖定 | PASS | `node scripts/test-process-editor-controls.cjs` 4項；實際 UI 儲存完成後出口可選 |
| 機器來源照片／點圖相簿 | PASS | [實際照片](evidence/editor-feedback-20261008/machines-vi.jpg)，圖片API 200；原照片引用保留 |
| 390×844越文表單 | PASS（模擬） | [截圖](evidence/editor-feedback-20261008/mobile-vi.jpg)；分頁可橫捲、底部按鈕可讀；實體 iPhone NOT_RUN |
| 既有 graph／BOM／並行／鎖定／儲存送審撤回定向回歸 | PASS | `test-process-editor-geometry.cjs`、`test-process-editor-integrity.cjs`；隔離記憶體 handler，liveBusinessWrites=0；完整 integrity 原始輸出未另存，見本輪工具記錄 |
| 語法 | PASS | node --check 六個修改JS與隔離server |
| 3020恢復後並行讀取 | PASS（短測） | [12次API回應](evidence/editor-feedback-20261008/concurrent-read-recovery.json)全部200；4請求一組3.1–4.1秒 |
| 成功寫入的恢復checkpoint | PASS | [合成副本實際手動儲存](evidence/editor-feedback-20261008/checkpoint-write-check.json)，revision17、saved actor admin；封存6個磁碟物件 |
| 長時間穩定性／正式瀏覽器 INP／實體觸控 | NOT_RUN | 不把工具耗時當 INP，不宣稱所有載入已瞬間完成 |

端點選取工具往返299ms，套用至關閉2579ms；包含工具／API時間，沒有同條件完整前後基準。20卡越文路線快取命中時重畫約2.6ms；單次原API讀取仍約1秒，大快照後端尚非瞬時回應。

## 3020 保全、停止事件與恢復

本輪原資料 baseline 是 revision292（不是早期262），13個資料鍵。操作／整理／儲存寫入只在 localhost 同埠合成副本；未對原資料送審或核准。

11:51 原隔離服務PID7372觸發 Node約4GB heap上限並停止。大約131MB全量快照、同時輪詢解碼及記憶體封存造成壓力；已限制同時解碼並將後續封存放磁碟，沒有以調大heap掩蓋。恢復後短測的程序工作集曾約2.77GB，儲存後回落約1.85GB；此次短測不能替代長時間穩定性驗收。停止前最後保全點11:40；本輪未在原資料做寫入。合成測試副本在停止後回到保全點，先前測試證據仍保留，測試人數／整理變更不是業務交付。

原3020已從最新保全292恢復，PID33180；[逐鍵比對](evidence/editor-feedback-20261008/preservation-final.json)13鍵均同於本輪開始，未用258/262覆蓋。登入仍用原隔離 fixture-account（重啟後需刷新隔離cookie），沒有改真實帳號。

私有備份根目錄：
`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/editor-feedback-20261008/`

- `before/`：本輪程式／文件基線；`primary-before.json`：131MB原快照；`runtime.json`：啟動來源與PID。
- 現服務持續更新 `runtime/primary-latest.json`、`runtime/synthetic-latest.json`，兩者不可混用；原子rename成功後才回API成功。
- `runtime/primary-archive/`、`runtime/synthetic-archive/` 保存後續封存物件，不刪除歷史。
- 原媒体讀取：`../whole-module-20261007/isolated-photos/`（相對本備份根目錄），canonical 機器照片來自 repo `data/canonical/assets/web`，沒有讀取3000。
- 啟動參數仍 `scripts/ipqc-isolated-server.cjs --source <原快照> --port 3020 --editor-fixture <合成快照> --runtime-dir <本任務runtime> --media-root <原isolated-photos>`。已有服務不要重啟。下次停止後應先使用runtime最新快照；該快照若移到不同目录，須以`--media-root`明確提供原isolated-photos（fixture新增可選參數，預設行為不變），不能默默改媒体來源。

## 回復與剩餘界線

[本輪精確程式差異](evidence/editor-feedback-20261008/task.diff)以開始前備份為基準，非整個git dirty diff。回復需逐段反向套用且比對並行內容，不能 git reset 或整檔覆蓋。服務資料回復也要先保存當下最新資料並比對；不可拿報告的292覆蓋之後成功寫入。備份含完整私人資料，未複製到repo。

資料模型：無 schema／migration／業務關係變更；只增加隔離服務的磁碟恢復證據。主要風險：極端密集／反向手動圖可能仍需繞路；無法避開時標記受阻，不刪線。API大型快照仍有約秒級成本；後續若增加資料量須進一步profile。Astra獨立複審未跑，不恢復已取消的自動任務。

原資料最終畫布（100%，保留原座標，只做顯示避讓）：

![原資料畫布](evidence/editor-feedback-20261008/primary-final-zh.jpg)
