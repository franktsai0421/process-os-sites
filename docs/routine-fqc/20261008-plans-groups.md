# 2026年10月8日FQC計畫分類與原樣品重測驗證

Task：計畫報告入口與建立狀態、進度捲軸、彈窗按鈕、合併改善複測、文件／案件分框及分類定位、10個未安排DEMO、同樣品多次測試。STATE: EXECUTED，驗證限制列於下表；保存指南另見[FQC設計與審核條件](FQC設計與審核條件_20261008.md)。

## Changed

前端planReportState依既有reportAvailability提供需要建立報告與對應報告入口。groupedList分類分框，jumpListGroup只定位清單內框、附數量且零項停用；holdFilterView避免篩選縮短明細時夾縮頁面捲軸。Modal補自身色彩變數、確認文字對比及焦點。

改善並建立複測使用既有followup notes，同次CAS記錄改善與文件，原分步資料相容。跨結果列同樣品重測允許；repeat-result只在當前buffer建立獨立ID、同樣品的空白列。保留同列唯一、來源範圍、100列與requiredSamples。樣品選取後即時啟用再測按鈕，無自動Save/Submit。

unresolvedFailureSamples依每份正式報告該樣品各次聚合，任一失敗不被合格列抵銷，合格混合未判定不解除前次失敗；後續全合格才能解除，仍另確認結案。舊正式內容不變。

scripts/routine-fqc-demo-10.cjs僅3040增量插入01至10，正常來源Save/Submit/明確ADMIN自審/Approve/Generate，建立時全數未安排，舊來源／工作／文件／案件逐項保全；重跑辨認既有前綴，不再插入。使用者已後續操作部分DEMO，不恢復前置快照。

## Tests

| 檢查 | 結果與範圍 |
| --- | --- |
| scripts/test-routine-fqc.cjs | PASS，既有核心轉移與權限／儲存條件 |
| scripts/test-routine-fqc-operations.cjs | PASS，既有取消／相依／復原等操作 |
| scripts/test-routine-fqc-actions.cjs | PASS，真實前端act/post接生產kernel記憶體fixture；合併改善、取消、收據重放、防重複、權限、CAS、待審、正式歷史與越文 |
| scripts/test-routine-fqc-navigation.cjs | PASS，捲軸／focus、計畫報告狀態及連結、分類定位、原樣品、空白再測列與buffer不寫資料；最後即時啟用修改後重跑PASS |
| scripts/test-routine-fqc-repeat.cjs | PASS，反覆Save/Submit/Approve記憶體核心、mixed outcome與列序、未判定保留、後續全合格、原快照、必要樣品不可改、同列唯一／越界／ID／100列 |
| JS語法与測試檔lint | PASS；影響程式完整lint仍FAIL為13項既有問題，無新增診斷 |
| 真實3040 DEMO增量建立 | PASS，10個新來源與工作；建立時unassigned10及舊資料保全。使用者之後已有操作，不主張目前仍10個未安排 |
| 桌機既有計畫／分組／modal／捲軸 | PASS，對應報告0027、進度篩選頁面y486保留；分類跳轉只改左清單；確認藍底白字／44px |
| 重開後3040桌機分類 | PASS，分類44px、無水平溢出、按鈕數量與分框；當時未安排5、草稿工作2，仅當時讀取證據 |
| 最後再測按鈕真實畫面 | NOT_RUN最終完成驗證：曾發現勾選後未重畫按鈕，已改為入口常在並即時啟用，隔離測試PASS；使用者打斷轉為保存設計文件，未完成最後重開點擊驗證 |
| 本輪新390中越文／實體iPhone | NOT_RUN；前輪的手機證據不冒充本輪最新修改通過 |
| 真實API新複測建立／保存／審核 | NOT_RUN，不代操作使用者文件；記憶體照片id不是R2上傳驗收 |
| 3000整合／3020／3030／Git發布 | NOT_RUN且未操作 |
| ChatGPT獨立複審 | NOT_RUN，原connector恢復需使用者另行確認，未刪除／重配 |

## Documentation and data model

更新現行規格15至16節、ROUTINE_FQC實作模型、QUALITY入口、DATA_MODEL路由、CHANGELOG及HANDOFF；新增保存指南、續談提示及本報告。無新SQL/schema/migration／持久欄位；既有ResultRow與improvements关系延伸，前端分類及標記只改檢視。其他模組的共用引擎與差異規則为建議，沒有開始實作。

## Evidence and recovery

- [桌機分類](evidence/plans-groups/desktop-groups.png)
- [合併改善複測彈窗](evidence/plans-groups/desktop-modal.png)
- 修改前程式與文件備份保留於專案外TEMP/fqc-plans-groups-20261008，含各階段hash與使用者頁面輸入唯讀備份；未輸出帳密。
- 3040原runtime與儲存沿用。入口引用其他並行工作新增canvas-local.js，但Vite啟動時靜態檔快取沒收錄，造成新分頁404；核對唯一3040程序後同命令重開、未初始化／換埠，資產HTTP200。原使用者頁面URL及輸入核對相同，未重整其分頁。
- 復原程式須與未來並行修改逐段合併，不整份覆蓋目前checkout。禁止用demo-recovery前置資料覆蓋使用者後續計畫／報告。DEMO不搬入3000，不自動刪除用户文件。
- material risks：校準／IQC等業務政策不得直接繼承FQC；最新再測畫面與本輪手機尚待定向驗證。13項既有lint未解，不能宣稱完整验收與正式發布。
