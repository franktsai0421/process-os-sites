# #51 先、#52 後的順序整合候選

獨立候選均保留，沒有改遠端 PR/base：#51 為 integrate/pr51-20261030；#52 為 integrate/pr52-20261030。此分支 integrate/pr52-after-pr51-20261030 是共同檔案經語意整合後的 #52 下游候選，供 root 在 #51 交付後更新原 #52，不能當成新增第三個 PR 的要求。精確 SHA/tree/證據見交付收據；若 main/來源更新，先核對實際版本。

共同區塊保留：

- #51 全歷史產品/類別引用（含存活 publishedProcess）、路線與舊引用規則；#52 工段引用、權限遮蔽、精確 viewer、子工段防刪與 prepared model。
- #51 actor/epoch/delivery fences、busy receipt recovery、明確 restore 能力；#52 first-match 索引及最新 scope 讀取。
- #51 scoped projection optional chaining 與表單所有權；#52 stable identity 重取後重試及 legacy code 保留。捲動使用 #51 零值避免多餘排版，焦點使用 #52 按鈕屬性選擇器。
- 送審僅顯示一份 #51 詳細 snapshot 差異與分頁，加入 #52 有未保存差異時必須勾選的 saved-only 確認；確認後再次核對 savedId/帳號/世代。沒有自動 Save。
- 真正 line-admin 路由納入離頁 Save 保護；未同步畫布仍不能由離頁 Save 發布。直接 Save 的既有明確同步確認流程不在此次擴寫。
- 正常 writer 無首次 legacy→records-v1 自動轉換。已存在 records-v1 繼續讀寫；legacy 原 whole-R2 路徑保留。

#52 獨立候選與此下游候選不是相同 tree，不可只用獨立測試宣稱共同版本通過。本次共同版本另跑定向單元、API/權限/格式、編譯與瀏覽器驗證；原 #51 非共同檔案及 #53 已有證據按差異重用。遠端 CI、main 合併後及正式站尚未執行；沒有 push、merge、部署、帳號或真實資料操作。
