# 2026-10-08 產品移轉與畫布隱藏保全

狀態：EXECUTED／REVIEW_BLOCKED。Astra iteration12 已收 EXECUTED，但 workspace_info、read_file、execution_output 均回 MCP -32603，未得獨立複審結論。只操作原3020；未操作3000/3030，未commit/push/merge/部署。

## Task / Changed

- 分支 codex/ipqc-ab-local，HEAD 84278d837898f4e836ec003f7adb67ff38f785c8。既有185項未提交／未追蹤及並行FQC／模具工作保留。
- 3060109、3060113 從 C/PVC 移到 C/INOX，stable ID、原 C-CHI → C-INOX 及其他欄位保留。PVC 18→16、INOX 5→7；全C141產品不變。
- AB/C產品及例外移除查看路線按鈕與死處理器，inline路徑保留。換類別不自動改路徑。
- app.js 以核准產品共用 maximumRoute 計算可見工段；載入順序已修正。隱藏工段不參與產品／BOM自動同步或選取，完整workspace持續保存。
- master-data legacy reconciliation 不再刪除隱藏工段、流程或失去類別的workspace；新非法引用仍受後端拒絕。
- 修改：public/process/app.js、master-data.js、master-admin-ui.js、index.html；新增 scripts/test-group-route-canvas.cjs。未改後端權限或schema。

## 3020 正常資料工作流

起始258，原子Apply259，手動Save260，固定Submit261，明確自審Approve262。C正式V6，case ce860a85-04a8-42cc-a715-589a20218557；saved 8948b886-3af8-4d11-b430-1b1a2f0b513f。操作者為隔離Isolated admin，原因與selfReviewConfirmed保存在正常案件／收據。

核准整份C包括此前已授權 TIEN/GIA CONG defaultStages及routeMode；執行前白名單核對無其他產品／路徑變更。第一次Apply因欠缺精確欄位guard回422，已證實所有values未改；補齊guard重試成功。送審後讀取專用reviewCase回應，未重複送審。

前後逐key比較只有masterDataControl改變；processAuthoringControl、IPQC、分配、發送、其他模組完全相同。C/PVC最大路線為C-PREP → C-PVC → C-FINAL；既有手動預設C-PREP → C-PVC保留，不靜默採用。

## Tests

| 項目 | 結果 |
| --- | --- |
| test-group-route-canvas.cjs | PASS 9：A/B/C最大路線、空群組、legacy完整隱藏內容、V3正常Save/Submit/Approve/Restore、非法新引用拒絕及其他key保全 |
| test-group-maximum-routes.cjs | PASS 12 |
| test-group-routes.cjs | PASS 13，權限／CAS／並行插入／待審／固定快照 |
| test-master-route-client.cjs | PASS 3，舊請求及舊帳號結果不覆蓋 |
| JS syntax | PASS app/master-data/master-admin-ui |
| Focused lint | PASS master-admin-ui及新測試；app/master-data各16/13項既有診斷，修改前後code/message完全相同，全面lint仍FAIL基線 |
| 實際3020 | PASS API與UI重整：C V6、產品7/16、PVC3工段1流程、INOX2工段1流程；AB/C查看路線按鈕0；產品換類別預覽保留路徑並取消 |
| 手機390×844模擬 | PASS整頁無橫溢（client/scrollWidth均375）；中越切換。既有越文canvas部分混語仍在，未擴大改無關翻譯 |
| 實體iPhone、完整發送／播放業務操作 | 未測 |
| Windows登入自動啟動 | 未驗證；本次晨間未見3020監聽，依交接人工恢復原服務，未宣称登入鉤子PASS |

隱藏／修改其他工段／整份儲存送審核准／恢復的7個真實既有A-CUT流程，使用同快照的記憶體fixture執行，逐項完全一致；不是在實際3020刪改路線。實際3020的PVC隱藏CHI/INOX本為空陣列，未混稱7流程發生於PVC。legacy含媒體、座標、連線、BOM、IPQC的保全另由定向資料驗證。

桌面與手機畫面已在瀏覽器檢視；截圖顯示於本回合工具結果。瀏覽器寫檔遭read-only EPERM，截圖檔未落盤，不能宣稱已保存截图附件。

## Backup / Restore

專案外證據：<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/group-route-canvas-20261008/，有files-before、docs-before、git-status-before、測試日誌、3020-before-transfer.json、3020-saved-transfer.json、3020-review-transfer.json、3020-workflow-records.json、3020-after-transfer.json。備份內可能含帳號資料，只留本機，不貼入ChatGPT。

最新可啟動快照：../whole-module-20261007/3020-route-canvas-20261008.json（revision262），與原isolated-photos191檔同目錄。使用原 scripts/ipqc-isolated-server.cjs --source <此快照> --port 3020；若已有服務不得重啟／覆蓋。這是3020記憶體fixture，關機前若有新寫入須先重新匯出；不是日常3000資料移轉。

業務回復應由正常C草稿把两產品category設回PVC後Save/Submit/Approve，保留後續並行變更。整庫258快照只供隔離災難恢復，必須先停寫與核對無較新資料，不可直接覆蓋。程式回復採本次精確diff反向，不用整檔備份覆蓋並行修改。

## Documentation / Data model / Risks

GROUP_ROUTES、PROCESS、MASTER_DATA、DATA_MODEL、CHANGELOG、HANDOFF已定向更新。無新資料模型、migration、binding或storage key。隱藏流程仍保留歷史引用；重新顯示可能出現既有待補提示。完整媒體實體載入、所有下游業務實測未涵蓋；不可以保全測試取代全面功能驗收。

Astra：沿用製程平台IPQC建議、c2c_9fa2 iteration12；不改共享FQC session/checkpoint。完成複審後更新此狀態並暫停ipqc排程。

## 複審接續（2026-10-08）

本機doctor正常，但ChatGPT工具未抵達目前bridge。並行「建置例行檢查系統FQC 3040」已提出替換失效connector的當次刪除確認，尚待使用者回覆；本任務不重複提問、不操作其共享指標。保留37項已過測試，不重做產品移轉或核准。連線恢復後在原IPQC Astra對話重新驗證workspace_info，再請完成iteration12複審；讀此報告與execution_output，不能直接標DONE。

一次性ipqc排程保留只待複審，完成才停用；3020與原ChatGPT分頁保留。登入啟動器source已更新至262快照，避免下次啟動退回258。另查明晨間啟動失敗原因：Codex更新後舊版本exe路徑不存在；改為從既有官方安裝bin選取最新可用exe。修正後--check驗證，真正Windows登入仍未測。
