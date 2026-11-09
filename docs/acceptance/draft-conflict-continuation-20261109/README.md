# 草稿衝突處理續作與整合

本批從真實本機交付 `7ef04ed741249816aac2f1336cf15f888ff92fa0` 繼續，不改寫原交付。保留已合併 main `9fbba823090f03da8385c8d92f5e59293d19d2f1`（#99／#100）、取消背景定時檢查及明確操作權限核對。這是獨立整合候選，尚未上傳、合併或部署。

## 已決需求與工作分界

只有明確存取才比較原始基準、本機最終意圖、目前共享草稿；所有真正衝突共用一次「用我的／用對方的／取消」。保留雙方非衝突修改，選後換版重比，同次 Save 接續一次原子 workflow 存取；CAS 拒絕及 UNKNOWN 不自動重送。File 留本頁 RAM，選擇完成且權限／身分／世代有效後才上傳圖片。圖片 immutable PUT 與 workflow CAS 是兩個既有儲存步驟，不冒稱跨儲存原子交易。

已確認：舊未核准工作草稿可以放棄；A 權限可按已確認規則送整份 A/B；例行 FQC 整頁一份草稿。這三項不是待使用者再決定。它們不授權刪除 pending、已核准歷史、immutable Save、原收據或媒體，也不自動補帳號權限。

#102 負責所有頁面的持久草稿分界、ACL、舊 writer fence、storage／HTTP／UI 接線及資料切換；本批只提供可安全組合的衝突修正及等價純 validator。版本查看與製程畫布由原工作負責，未整份覆蓋其檔案或同時寫其 PR。不能用本批測試取代 #102 全站拆分或已核准查看驗收。

## 逐頁實作狀態

| 頁面 | 本批處理與保留 | 尚有相依／界線 |
| --- | --- | --- |
| 製程編輯台／畫布 | 保留 7ef 的整組選擇、原子 Save、owner／receipt fences | 畫布同頁篩選、#101 計數與已核准查看由原工作整合；本批未納入舊 807 候選 |
| AB 產線與類別、C 產線與類別 | 保留產品／類別／路線穩定 ID 合併及整組選擇 | 現有 AB/C combined owners 分離由 #102 接線 |
| 線別與工段 | 保留同頁 AB/C 兩邊 RAM、真離頁放棄；現有 owner 可整組選擇 | 目前 Save 仍按選定舊 AB/C scope；目標單一 LINES 頁 owner 未啟用 |
| 流程資料／模板／機器 | legacy src 主照、尾照、獨立 metadata 與排序三方合併；ACK／原 receipt 只退休原送出前綴，晚到輸入留待下次明確 Save | 重複／不完整 src、混合 ID、無原主照、別名不一致或無法可靠配對的換 src 維持明確整組衝突，不猜造 ID |
| FQC | 保留全頁 chooser、File RAM 及既有復原；追加相同墓碑的最終刪除意圖與 payload 保留、相片 metadata 及真 form／File regression | 被刪除列的 product matrix 沿既有忽略規則；不冒稱先勾矩陣再刪列的選取可留在墓碑 |
| IQC | rules 穩定 ID 新增／刪除／排序、supplier membership／primary、相片獨立 metadata；舊 form 與 late ACK 不丟 peer 新增、不重設 peer 排序 | 無法可靠辨識的 ID、照片重排仍保守整組比較；原照片端點沒有 durable receipt |
| IPQC A/B、IPQC C | 保留原整頁 chooser、同頁篩選及原子存取／世代／CAS／原收據 | 本批沒有改 API、scope 或核准政策 |
| BOM | 保留原 occurrence／path／引用 guards、非衝突合併及同頁 journal | 結構無法證明仍拒絕，不猜測連結或放寬 BOM interlocks |
| 模具（tooling） | 保留照片獨立排序，真正競爭排序才選；File 由即選即 PUT 改為明確 Save 後上傳，取消不 PUT；已確認 URI 可重用 | 上傳結果追查僅本 document RAM；沒有新增 durable upload receipt 或跨 reload File 還原 |
| 檢具與測試設備（routine-equipment） | 保留同頁 drawer／File／父層及 coherent photoId／photoHidden 比較 | 跨品質移轉原交易界線不改 |
| 例行 FQC | 修正 late ACK 的真正衝突不能無聲選 mine；整頁比較純函式可重用，同一 preference 涵蓋 documents | 現有存取仍單文件，整頁 owner／labels／原子 page Save 由 #102 接線；samples 是不可拆原子值 |
| 問題回報 | 帳號私人 IndexedDB 草稿原樣保留 | 不納入多人業務 chooser，不遷移或刪除 |

本批沒有新增自動背景讀取、SQL／migration、真實資料讀寫、帳號設定、connector 操作或 Site 發布。檢查文件及完整回歸結果見交付 manifest 與日誌；本文件不能當成實站完成證明。

## 與其他候選的具體整合契約

例行 FQC 保留既有 `save-local-v1`、expectedRevision、staged full-command receipt 與原子 guards；#102 的 `validateRoutineContentEdit` 只從完全相同的原 structure body 提取，不能以 #102 整檔取代現有 Save。整頁 comparer 先不帶 preference 收集全部衝突，一次取得 choice，重新讀取固定 membership／owner／generation／revision／source／pending／permissions 後再 materialize，一次 page Save。`conflicts` 在帶 preference 後仍描述原衝突，不能逐文件反覆選擇；UI adapter 需保留文件標籤。

已核准查看需同時識別新的 catalog／LINES／routine-page scope 和舊 immutable case／Save／receipt owner；不可以數張舊 approved 文件拼成新核准整頁。畫布 gate 必須組合新 history display epoch／readOnly fences，不能只貼舊 807 gate。#101 計數及 selector 的不同功能應語意合併。

## 外部上傳狀態

目前任務有 GitHub 上傳授權；本批沒有重新要求一般上傳授權。舊 243-path tree 操作的 exact payload 仍未找回，兩個品質 tree 結果 UNKNOWN，GET 404 不能證明未執行；另一設備 tree 曾被自動審查拒絕。本批不重送、不拆包或換工具規避這些操作。原操作結果與完整重疊範圍未釐清前，不能以新檔名或新批次代替送出同一內容。獨立本機實作、回歸與可審查交付持續完成，遠端 CI／PR／部署另按實際回執報告。
