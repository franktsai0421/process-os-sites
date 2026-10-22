# 2026-10-08 本機路線與畫布提交

Task：使用者授權將 3020 本輪程式修復做一次本機 commit。基底 codex/ipqc-ab-local / 84278d837898f4e836ec003f7adb67ff38f785c8；不 push、merge 或部署。

## Changed

- AB/C 群組預設與最大路線、產品例外直顯、移除產品／例外的查看路線按鈕；換類別保留既有路徑。
- 畫布依核准最大路線顯示，隱藏工段保留完整流程、媒體、座標、連線、BOM 與 IPQC 引用；舊類別 workspace 不刪除。
- 群組更新的產品／工段 guard、預設路線引用檢查；輪詢回應與帳號競態、捲動位置保留。
- 混合檔案採區塊提交；FQC、模具、整份文稿權限政策及其他 IPQC 功能保留在工作區，未納入此提交。

## Tests

精確候選快照由基底 Git archive 加上本次差異建立，位於專案外；未以完整工作區通過結果冒充提交結果。

- PASS：test-group-route-canvas.cjs 9 項，使用隔離記憶體 API；7 個既有隱藏流程在正常手動 Save / Submit / 明確自審 Approve / 恢復後保持完整；非法新引用仍拒絕，其他模組資料未變。
- PASS：test-master-route-client.cjs 3 項，舊請求／舊帳號不可覆寫較新狀態。
- PASS：test-group-route-order.cjs 9 項，驗證 ABCD + ABCEDE、A/B/C、循環順序、例外保留。
- PASS：本次全部 JavaScript 語法與精確候選 TypeScript 全專案型別檢查；定向測試共 21 項。
- 候選版舊整合測試 test-group-routes 在一般員工無 approval.submit 時得到 403；test-group-maximum-routes 對已採用最大路線的 revision262 送審得到 NO_SUBSTANTIVE_CHANGE。這些依賴另批政策／資料前置，不包含在本次提交測試集合。完整工作區先前 37 PASS 不代表這份拆分提交全功能通過。
- 全庫 lint 仍有既存 app.js/master-data.js 29 項診斷；實體 iPhone、完整發送／播放、Windows 登入啟動未驗證。
- Astra iteration12 獨立複審仍等待連接恢復，沒有標示完成。

## Data / Backup / Restore

本次 commit 不執行任何業務寫入，也不收錄資料快照、媒體、帳號、憑證。此前 3020 已正常核准 C V6 / revision262，3060109、3060113 已移到 INOX，路徑 C-CHI → C-INOX 保留；本次不重做。Git commit 不等於資料移轉。

程式增加 categoryGroups[].defaultStages 與 products[].routeMode 的相容欄位及驗證；無 schema migration、新 storage key 或新埠。完整資料保全報告留於本機 docs/ipqc-reference/20261008-group-route-canvas.md（不以此提交宣稱所有前置功能已入 Git）。

提交前索引、原 HEAD、所選檔案與文件原文、候選完整程式及測試日誌：

`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/ipqc-local-commit-20261008`

業務最新可恢復來源仍是同層 whole-module-20261007/3020-route-canvas-20261008.json 與原 isolated-photos；不可用舊快照覆蓋運行中資料。需要回復程式時審閱本 commit 的精確反向差異並保留並行工作；不要 reset --hard 或覆蓋整個目錄。
