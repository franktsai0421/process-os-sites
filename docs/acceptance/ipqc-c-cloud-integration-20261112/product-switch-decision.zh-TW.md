# IPQC C 產品切換：目前有效決策

2026-11-12 Frank 最新明確原文：

> 在同一個模組下切換產品可以保留 如果切換分頁就不保留 例如都在ipqc c下面 就保留 但是切換頁面到FQC就不保留

此決策取代先前「對要放棄未存修改」及10:14產品捨棄結論。舊捨棄版本、測試紅綠與CI僅是歷史候選證據，不能當目前政策；也不把早期5df6f865的整體保留提案回溯視為當時已核准。

| 入口 | 本次處理與核定界線 |
| --- | --- |
| 同一 C 模組的產品側欄按鈕 `data-ipqcc-product` | 保留未 Save 的完整 C journal／working及未上傳照片，產品往返不做Save／Begin，不寫DB/R2；之後只有明確Save才提交 |
| 離開 C 到FQC等其他模組頁，`navigation.departure/reset` | 靜默放棄未送修改／照片，不提示、不自動Save；返回C不還原未送表單 |
| 已存草稿／待審／正式／歷史 | 保留，不因瀏覽切換改寫；核准歷史維持唯讀，不恢復覆寫 |
| 已送 UNKNOWN／在途操作 | 與未送表單分開，保留原operation／receipt與去重；不能重送或以離頁當取消 |
| 普通搜尋 | 維持既有保留，不變更工作選擇 |
| 工段、coverage、待補／驗證定位及其他選擇器 | 這個產品例子沒有重新確認它們；本次不擴大保留政策，維持既有候選處理。不得宣稱它們因本次原文全部重獲核定 |

實作限產品按鈕改呼叫 `retainProductDraft`；保留同模組目前操作owner、localChanges、working及localPhotos，原Save可正常結算並清除已提交journal。真正模組離頁仍沿原departure/reset清除RAM並退休舊presentation，主要transport保留原已送收據。原編輯modal阻擋直接切另一產品的限制沒有另改。

最新來源C SHA-256：`393941c3f4716bd5542f17f0eac9b65619e6da4f858ffc5cd0ec81b5a7b0e29f`；C cache tag：`20261112-c-product4`。main與#103/#104來源不覆寫，七檔精確逆轉只更新C/index的afterHash/span，原beforeHash與負向證據保留。

最新回歸：同C產品往返保留兩產品修改、未傳照片可在返回後實際上傳並Save；零額外寫入、同scope/generation/draftId；C→合成FQC目的頁使用實際departure/reset後RAM與照片清空、DB/R2不變、返回不還原；原UNKNOWN／晚ACK／衝突／歷史案例保留。測試結果與CI以[驗證](verification.json)及PR目前HEAD為準，未完成不報PASS；FQC目的頁為隔離容器，不冒稱真人站或整個FQC業務驗收。
