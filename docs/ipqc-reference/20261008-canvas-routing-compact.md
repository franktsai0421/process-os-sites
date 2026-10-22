# 畫布緊密排版與走線再優化

狀態：EXECUTED；針對本次走線與間距回饋，不代表任意手動重疊圖均能無交叉。

## 基線與範圍

- 同一 checkout，`codex/ipqc-ab-local`，HEAD `ba6c7a25b211f83df9bbe7caf82bf646737bdbca`；保留未提交及FQC/模具並行修改。
- 3020原服務不重啟；`127.0.0.1`原資料、`localhost`既有合成驗收副本。開始備份時原revision332、合成revision41，比上次327/39新，沿用最新內容。
- 所有驗收整理只進入瀏覽器journal，未同步、Save、送審或核准；結束復原驗收產生的本機變更。未操作3000/3030、新port、commit/push/merge/deploy。
- 程式與最新快照保全：`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/canvas-routing-20261008/`。

## 原因與修改

原autoLayout先拓撲分層，又將非進站整體向右移500px，產生不必要首欄空白；固定180px水平及110px垂直間距放大整圖。端點按operation/nextIds陣列順序，而不是對端上下位置，造成分支與匯合交叉。每條線優先嘗試相同中央通道，在密集分支產生交叉階梯。

- `public/process/editor-graph.js`：entry/exit在rank內配置；雙向排序與等序壓縮，保持方塊不相碰且鏈路中心對齊；水平基本96px、每條額外跨層線14px（額外最多128px），垂直64px；未連接方塊在下方104px起。來源內容、nextIds不變。
- 同檔routes：端點依對端中心排序；短連線先行；上行、下行折線分別按順序安排通道。既有正交避障、部分重疊禁止、無路可走警示保留。
- `public/process/index.html`：只更新editor-graph資源版本為20261008-compact3。
- `scripts/test-canvas-routing-compact.cjs`：中越文5/10/15直線、分支、密集分支及目前画面離線幾何測試。
- `scripts/canvas-routing-evidence.cjs`：GET快照與SHA256比對工具，不還原、不寫入服務。
- 更新PROCESS_EDITOR、PROCESS、CHANGELOG、HANDOFF及本報告。無API、權限、資料模型或schema變更。

## 定向驗證

| 項目 | 結果 | 證據／界線 |
|---|---|---|
| 5/10/15 中越文純幾何：直線、分支、密集分支 | PASS | 18組；線重疊、交叉、穿方塊、方塊重疊、blocked均0；未做20方塊 |
| 直線水平與零折彎 | PASS | 6組variable-height鏈路，bends=0 |
| 整理穩定、保留連線與內容 | PASS | 輸入JSON不變，重複輸出相同 |
| 現有8方塊画面只讀取尺寸/連線離線比對 | PASS | 整理寬3320→2456px（-26.0%），高962→916px；交叉1→0；未將計算結果寫回原畫布 |
| 原手動位置僅更新走線 | PASS offline | 位置不動，交叉1→0；shared/through/blocked=0 |
| 3020合成10方塊實際UI | PASS | 整理、再按一致、復原回無dirty、重做相同；9條線，全數可見 |
| 中文/越文實際卡片及照片 | PASS UI | desktop-compact-zh.png、desktop-compact-vi.png；沿用字型及原內容 |
| 390×844視窗 | PASS limited | clientWidth=scrollWidth=375（含15px捲軸）；10cards/9wires/0blocked；mobile-390.png。未驗實體觸控 |
| 本機journal回歸 | PASS | test-canvas-local.cjs 13項，含同期編輯、衝突、復原、恢復；不是重跑全部後端驗收 |
| 定向lint | PASS | editor-graph及本次兩個cjs工具；CJS入口明確豁免require-import規則 |
| API/角色/送審與持久化完整矩陣 | NOT_RUN本輪 | 本輪未改動，沿用前報告證據，不把它列本輪PASS |
| 任意手動重疊/極端回折圖保證零交叉 | 不作保證 | 規則仍保留避障失敗警示，不默默隱藏連線 |
| ChatGPT獨立複審 | BLOCKED/未重送 | 上次connector與C2C權限阻擋未解；未獲新授權，不修改共享設定 |

`geometry-tests.json`和`geometry-output.txt`保存20組幾何案例（18組指定尺寸+2組現有畫布離線比對，**不是20方塊測試**）。15方塊密集分支舊版交叉146處→0；單次本機route耗時記錄於JSON，受暖機及VM差異影響，不能當正式P95或網路速度比較。

## 保全與回復

原/合成完整只讀快照為`primary-snapshot.json`、`synthetic-snapshot.json`；前後鍵值比對結果另存`primary-preservation.json`、`synthetic-preservation.json`。`before/`保存本次修改前檔案；已包括原有未提交內容，不能拿Git HEAD覆蓋。
原3020結束仍為revision332，13個state key SHA256全部相同；未寫入原資料。
合成副本結束仍為revision41，13個key也全相同；UI整理已全部復原。定向diff whitespace檢查通過（僅CRLF提示）。

若撤除此幾何修正，逐檔比對`before/public/process/editor-graph.js`及`before/public/process/index.html`後，只還原本次幾何/資源版本差異，保留後續並行修改；不回填整庫。自動整理仍先本機，可按復原，使用者確定後才同步畫布。

遺留限制：沒有修改卡片尺寸或自動縮字；很長的單一路徑仍需橫向平移。未改原本手動位置，既有頁面需載入新版資源後才用新整理算法；有未同步工作應先處理，不能強制重整使用者分頁。
