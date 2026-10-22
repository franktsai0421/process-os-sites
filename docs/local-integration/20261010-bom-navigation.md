# 2026-10-10 BOM 離頁判定檢查點

## 已確認與最小修復

唯讀日常 BOM 資料：working 與 saved.content 完全相同，workflow revision 8、V5 draft、pendingId=null；保存 ID 8c639169-d133-47f3-baf3-9308de1996c3。此為讀取當下證據，不是限制使用者後續操作。未保存、放棄或處理任何日常案件。

原離頁判定以 edit 物件存在當作修改；只進入修改模式也會警告。未套用匯入仍可保存舊 working，容易讓人誤認匯入已保存。現在只對實際欄位差異、未套用差異、待傳送修改、保存未完成／未知結果提示；空比對不阻擋離頁。含差異的匯入必須先套用或放棄，再保存。重新開啟只重載沒有實際輸入的修改模式，保留真正未存內容。未改 API、CAS、權限或待審鎖。

## 驗證

- PASS：test-bom-navigation.cjs，實際 UI 函式搭配隔離 transport：單純開啟、空修改模式、真正修改、成功保存／重開、保存失敗／重試、未套用與零差異比對、中越文錯誤、遠端更新、待審及未知結果保護。
- PASS：test-ui-review-refresh.cjs 八組定向回歸；test-bom-workflow.cjs 真實 API 合成 SQLite/R2 的權限、衝突、保存／待審及引用保全。
- PASS：JS 語法；修改前副本差異審查。
- CUA 部分 PASS：3033 合成 fixture 單純查看與進入修改但不改值，均可離頁。真實修改後仍停留原頁、輸入保留；原生 confirm 沒有暴露可確認的 dialog，因此不宣稱原生提示像素驗證通過。
- 未完成：本輪 CUA 保存後重開、中越文／手機完整矩陣；Chrome 選取檔案尚未實測。先前有效 UI／API 證據只涵蓋未受影響範圍。
- 使用者截圖只有轉交 OCR，未取得像素，不以 OCR 當已讀圖。

## 保全與交付界線

備份／資料證據：<TEMP>/bom-navigation-20261010-01，含 source-before.json、bom-control.before.json、diagnostic-before.json。資源版本 bom-nav1；既有開啟頁不被強制重載。

資料模型：無變更。日常 3000 不重啟，未寫入業務資料。沒有 commit/push/merge/部署。只按逐檔差異恢復程式，禁止整庫回灌。canonical rollback、旧 self-review 及其他既有未完驗證不因本輪 PASS 而清除。

3033 是本輪合成記憶體服務 PID19780；瀏覽器測試時觀察到輸入額外變化，未替該頁保存或丟棄，保留頁籤供續接。
