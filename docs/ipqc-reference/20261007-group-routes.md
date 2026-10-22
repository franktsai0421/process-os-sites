# 2026-10-07 群組路線與工段連動

STATE: EXECUTED；TASK c2c_9fa2／iteration 8。Astra 已透過 connector 獨立複審 DONE（僅此輪群組路線）；[複審紀錄](evidence/20261007-group-routes/astra-review.txt)。本輪只處理最新七項路線／捲動回饋，先前 ADMIN 審核、重複案件及歷史收折另列待續，不以本報告宣稱完成。

## 修改與根因

實際 checkout `<WORKSPACE>/中控系統`，分支 `codex/ipqc-ab-local`，HEAD `84278d837898f4e836ec003f7adb67ff38f785c8`。保留開始時全部未提交內容及 Routine FQC／模具並行工作。

- 原本產品逐列展開路線，沒有可核准的群組路線設定。新增 `categoryGroups[].defaultStages`、`products[].routeMode`；`products[].stages` 繼續保存有效產品路線，相容既有 IPQC／發送／播放／產品狀態。核准前只改草稿。
- 舊資料只顯示建議，不自動寫入；按完整有序路線統計，最常見路線為建議，同票列候選數量與排序依據。明確套用後相同路線產品沿用，其他產品保留例外。群組修改以一次 Apply 原子處理，產品集合 guard 防止並行新增／換群組／改例外被漏掉。
- 群組卡提供查看、修改、排序、移除預設；移除預設保留所有產品原路線為例外。真正移除產品路線工段需既有刪除權限及確認，列出受影響產品；不刪 IPQC 標準、流程、分配及歷史。工段主檔刪除另檢查群組預設引用。
- 清單改名「產品清單」，不再展開完整路線，提供個別查看／修改與繼承狀態。每頁 40 筆只限畫面，儲存及送審仍涵蓋整份模組。
- 畫布先按核准群組順序，再追加例外所需工段。修正原先僅按類別造成 A／C 同名類別混用的風險。AB 工段選單從整線改為群組實際路線；路線外舊標準保留獨立查閱入口，未刪標準。
- 流程彈窗原來記住上次 IPQC 頁籤，現在重新開啟預設基本資料。
- 捲動根因：未採用共享草稿的 scope 缺少可比對 token，加上輪詢所有曾載入 scope，造成反覆載入／重繪；大量產品路線 DOM 加重負擔。新增 revision 輕量回應、僅輪詢可見 scope、舊請求與身分失效保護；必要重繪保留捲動、篩選、焦點及展開狀態。編輯彈窗獨立於清單，不因輪詢被移除。產品表改自然頁面垂直捲動及局部水平捲動。

實際 UI 操作摘要：[操作紀錄](evidence/20261007-group-routes/ui-operations.json)。

## 定向驗收

| 項目 | 結果與證據 |
| --- | --- |
| 群組推導、順序／例外、Apply 原子性、固定手動保存送審、待審鎖、跨 ADMIN 核准 | PASS，真實 handler 隔離測試 [13項](evidence/20261007-group-routes/backend.log) |
| 並行修改、新增產品、換群組、切換例外；失敗不覆寫 | PASS，同上，409 且 revision 不變 |
| 未變更／舊來源成功回應／舊帳號成功及失敗回應 | PASS，[3項客戶端測試](evidence/20261007-group-routes/client.log) |
| 主資料工作流／工段 PROCESS 連結既有回歸 | PASS，[7項](evidence/20261007-group-routes/master-regression.log)、[8項](evidence/20261007-group-routes/stage-link.log) |
| C/PVC 實際 UI Cancel、Apply、Save、重整、Submit、版本台明確自審核准 | PASS，15 沿用／3 例外；[編輯](evidence/20261007-group-routes/c-route-preview.jpg)、[套用](evidence/20261007-group-routes/c-route-applied.jpg)、[自審](evidence/20261007-group-routes/c-self-review.jpg)、[核准](evidence/20261007-group-routes/c-approved.jpg) |
| A/INOX 與 B/VANPHAODONG 跨類別整份保存，另一 ADMIN 確認 | PASS，[B設定](evidence/20261007-group-routes/b-route-applied.jpg)、[跨帳號](evidence/20261007-group-routes/ab-cross-admin.jpg) |
| 產品3030101改例外、保存、重開，再恢復群組保存 | PASS，[重開](evidence/20261007-group-routes/product-exception-reopen.jpg)、[已存API](evidence/20261007-group-routes/product-exception-saved.json)；最後工作／保存與核准內容相同，未重複送審 |
| B群組IPQC與畫布3工段；C畫布預設2工段+例外3工段 | PASS，[B選單](evidence/20261007-group-routes/b-ipqc-stages.jpg)、[B畫布](evidence/20261007-group-routes/b-canvas.jpg)、[A畫布](evidence/20261007-group-routes/a-canvas.jpg) |
| IPQC-C例外產品3050404及產品狀態仍C-PVC→C-FINAL | PASS，[IPQC](evidence/20261007-group-routes/c-ipqc-exception.jpg)、[產品狀態](evidence/20261007-group-routes/product-status-route.jpg) |
| 相同流程切IPQC後重開回基本資料 | PASS，[實際重開](evidence/20261007-group-routes/basic-reopen.jpg) |
| 輪詢捲動穩定、縮減回應 | PASS，[捲動前後](evidence/20261007-group-routes/scroll-check.json) y=1232不變；[大小](evidence/20261007-group-routes/response-size.json) 266596→173 bytes。此次實測約612/617ms，沒有宣稱後端延遲降低 |
| 桌面／390×844、中越文、Escape取消、無整頁橫向溢出 | PASS，[手機查看](evidence/20261007-group-routes/mobile-route-view.jpg)、[越文](evidence/20261007-group-routes/mobile-route-vi.jpg)；實體手機未測 |
| TypeScript及定向lint | PASS，[typecheck](evidence/20261007-group-routes/typecheck.log)、[focused lint](evidence/20261007-group-routes/lint-focused.log)。app.js/master-data.js廣範圍lint仍有既存問題，[原始輸出](evidence/20261007-group-routes/lint.log)、[29筆基線比對](evidence/20261007-group-routes/lint-baseline.json)，不宣稱全庫lint通過 |
| 舊分配、IPQC、發送、權限、其他模組、所有原產品有效路線 | PASS，[逐鍵比對](evidence/20261007-group-routes/3020-preservation.json)；234→248僅masterDataControl改動 |
| 發送／播放 | 既有入口讀取現行內容PASS；未執行新發送、媒體完整播放或完整端到端驗收 |
| 日常3000路線資料／所有群組逐一UI／真機 | 未測／未操作。本輪未代核准日常路線，也未批次改寫所有群組 |

## 3020資料、備份與回復

本輪先保存使用者當時最新 revision234，沒有用舊222復原。3020沿原 `scripts/ipqc-isolated-server.cjs --port 3020`，以同源最新保全副本續開；未新增埠、未操作3000／3030服務。隔離資料是記憶體資料庫，持續保全不可省略。

正常 UI 形成 C主資料V4（`5dc3caf2-1c2c-4313-a02b-9d8137680e07`，admin明確自審）及AB主資料V8（`9ff3eac8-02f5-4e9a-b959-e53032e5ad43`，admin送、admin2核准）。[紀錄](evidence/20261007-group-routes/3020-preservation.json)保留理由與actor；未直接改status。C補測後留有內容等同生效版的已儲存草稿。

私有備份：`<USERPROFILE>/.codex\visualizations\2026\10\06\01a10f85-7632-7cb0-b39a-8257d8cdf705\group-routes-20261007`。`3020-before.json`與`3020-before-restart.json`為234，`3020-after.json`為248；SHA見比對JSON。`files-before/`、`start.patch`保全修改前程式。機密及完整業務資料不放入可讀證據目錄。

若3020需重啟，先再保全當時最新狀態，不能以248覆蓋後續新修改；現有延續來源為私有 `whole-module-20261007/3020-group-routes-resume.json`，同目錄保留既有 `isolated-photos`。核對狀態、停止原3020後才用原命令續開。資料回復優先從固定歷史建立新草稿、核對差異後正常保存核准；未做破壞性回復演練。共用checkout程式可供日常使用，但本輪隔離案件與資料不會自動移入3000。

## 修改清單及文件

程式：`master-admin-ui.js/css`、`master-data.js`、`master-shared-client.js`、`master-review.js`、`app.js`、`process-ipqc.js`、`ipqc-ab.js`；後端`master-workflow.ts`、`master-stage-references.ts`、`versioned-shared-workflow.ts`、`ipqc-ab.ts`。測試`test-group-routes.cjs`、`test-master-route-client.cjs`、`collect-group-routes.py`。

規格：[GROUP_ROUTES](../specs/current/GROUP_ROUTES.md)；實作：MASTER_DATA／PROCESS；資料模型：CORE；階段：HANDOFF／CHANGELOG。[本輪diff](evidence/20261007-group-routes/task-vs-start.patch)、[修改SHA](evidence/20261007-group-routes/changed-files.json)。共享檔案不得整檔回復。master-stage-references.ts 的修改前單行版本由本輪唯一新增引用掃描反向重建，用於精確diff；其他受影響舊檔有事前副本。無schema migration、無全域儲存架構替換，無commit/push/Git merge/遠端部署。

已知界線：同一群組不同產品有不同順序時，畫布顯示群組共同順序及例外額外工段；各產品完整順序以自身有效路線為準。刪除產品路線工段會改變該產品現行適用工段，但保留原標準／流程／歷史，不保證舊標準仍出現在「現行路線」篩選下。主資料歷史差異列表在缺少舊base正文時可能顯示成新增；固定案件查閱仍可用，此既存審核UI問題另列待續。
