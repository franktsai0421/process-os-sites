# PR #51 與最新 main 的本地整合

來源 PR #51：`3063f70cd26d2add038c988a606cf4a426da274a`（tree `b9b89fb5a84c507bd217ac3ed952c585a038ecda`）。
主線：`11151dfdc90a2a1920f694da0624d9ff50c76311`（tree `4ee8d6fea70f75070d39cd94f2467524277a3588`）。
本候選保留兩邊歷史，供既有 #51 fast-forward 更新；未 push、合併 GitHub PR 或部署，全部驗證只用合成隔離資料。

衝突處理保留 main 的獨立 restore 權限、owner/epoch/delivery fences、還原新增/刪除保護、BOM view 檢查、已核准流程模板選用及照片變更；同時保留 #51 路線、歷史、未儲存離頁與收據復原。入口使用新的資源版本且保留精確一次檢查。文件各保留其獨立主題與歷史證據。

語義複查補修：bridge 歷史還原以 history/edit/restore 權限判定，不再要求無關的 submit 或一律 delete；後端仍依實際還原影響要求 create/delete。送審確認後再次核對身分、epoch、delivery、generation、savedId，固定 snapshot 不因 working 更新而自動儲存。產品/類別刪除保護增加仍存活的 publishedProcess 快照，沒有更改其資料。stable ID 索引保留原 first-match 行為。

#52 仍獨立，且 legacy 首次 records-v1 自動轉換尚未批准，不包含於本候選。全站三選項離頁/個人放棄/測速工程尚未提供最終來源；本候選保留 #51 現有 Save/Cancel 行為，不宣稱納入該工程。多人共用草稿新方案未擴寫。網站仍舊版。

驗證結果以本次整合交付收據及實際候選 commit/tree 為準。原作者報告是來源證據，不代替此次整合驗收。main #53 工具與未受影響檔案保留，未重跑其已通過工具收尾。實體手機、OS IME、真資料容量/速度及正式站均未驗證。

畫布整合界線：離頁儲存不能代替手動同步，未同步位置/連線或本地 editor 修改時留在原頁；只對已共享未 Save 的內容提供儲存離頁。既有直接 Save 的 beforeSave 明確詢問「同步畫布並儲存」流程未在本次擴寫，沒有背景同步。更嚴格只允許工具列同步入口的要求需與全站草稿任務協調。
