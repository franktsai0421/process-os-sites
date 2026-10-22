# 品質檢具與測試設備

狀態：Current。整理 KD/ROUTINE 來源決策及後續品質紀錄；舊原型表名、binding、API 不作實作規格。

類別 → 子類別 → 規格群組 → 個別設備；保留空分類。相同資產編號的分件有獨立穩定身分，保留號碼與來源疑點，不按照片猜能力或合併實體。校正方式、週期、啟用、核准、來源確認狀態獨立。

版本流程依[共享草稿](SHARED_DRAFT.md)，送審維持品質驗證，不套用製程放寬。持久化沿用 D1 DB／R2 STATE_ARCHIVE；不得依舊原型新增 EQUIPMENT_DB／EQUIPMENT_MEDIA 或 equipment_* SQL 表。

FQC、IQC、IPQC-C、IPQC-AB 使用生效核准且 enabled 的設備；選擇／替換／反向引用按穩定設備及項目身分，保留人工內容、照片、正式版及歷史。待審案件不能被替換改寫，依現有 coordinator／revision 防護處理。舊可選數量不代表今日狀態，不暗中新增 confirmed／校正限制。

實作與例外見[品質模組](../../../AI_CONTEXT/modules/QUALITY.md)，欄位見[品質模型](../../../AI_CONTEXT/models/QUALITY.md)。[IMPORT_AUDIT](../../../KD/ROUTINE/IMPORT_AUDIT.md) 保留119筆來源匯入、照片及疑點，屬當時證據。

待確認：舊原型要求核准／發回必填意見，後續品質 UI 現況允許不填，而 V3 核心對非 approve 的 reason 另有要求。沒有足夠明確確認紀錄可統一，見[未決清單](../../DOCUMENTATION_INDEX.md)，不自行改規則或程式。
