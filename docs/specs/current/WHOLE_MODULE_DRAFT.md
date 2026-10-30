## 2026-10-29 後續明確權限規則（使用者已確認）

本次確認取代下文較早候選中「保留 IPQC-C 舊 review/view/withdraw 例外」的範圍：IPQC-C 要有本模組 view，撤回要有 withdraw；核准／發回依模組 approve／return，不另外綁 approval.view。版本確認平台入口仍需其自身查看，不能反向授予 IPQC-C 內容。legacy 創建者限制、pending、CAS、固定 saved 快照與自審確認保留。獨立還原授權與依賴見 [使用者權限規格](PERMISSIONS_ADMIN.md)，驗證及未測範圍見[候選交接](../../acceptance/USERS_CLOUD_CLEAR_RIGHTS_29102026.md)。

## 2026-10-27 C 操作權限補充（取代「僅 view 即可修改／儲存／送審」）

使用者明確要求 IPQC-C 與其他文稿的操作權限對齊，並與 FQC／IQC／IPQC-AB 預覽修正一起送 PR。保留現行頁面入口與檢視規則，不自動替帳號加權限；編輯、儲存、送審各自依相應 cell。V3 Save 可由具 save 者保存已有共用草稿；Submit 可由具 submit 者送出已成功手動 Save 的固定快照，不藉此修改內容。直接 legacy Save／Submit 因同時替換 snapshot，必須具它實際執行的 edit＋save（及 submit）能力。圖片上傳屬 edit；review／history／withdraw、待審鎖、歷史與原 owner 邊界不因本次改動而擴張。

本次未授權改真帳號／角色範本或 merge／deploy；自訂角色與個別 overrides 的影響需明列，不能以 shipped defaults 推定所有使用者均不受影響。實作細節與測試界線見 [Quality implementation](../../../AI_CONTEXT/modules/QUALITY.md)。

# 2026-10-07 整份文稿與 Local 3000 銜接

Current confirmed user requirements；取代逐群組部分成功及一般員工 FQC 禁止維護的舊政策。執行結果與未測界線見 [驗收報告](../../ipqc-reference/20261007-whole-module-progress.md)，本檔只保存有效需求。

2026-10-07 使用者補充授權：日常登入身分採既有 demo-admin；清除使用者指認的「111…」舊測試產品、錯誤代碼及其關聯，真實標準只移除錯誤引用，保留可還原歷史。不把其他數字內容推定為同一測試資料。

所有文稿模組逐一盤點：Save 涵蓋模組全部線別、類別、分頁的已套用／同步內容，不受畫面、搜尋或篩選影響。Submit 使用最後成功手動 Save 的整份固定快照；整份鎖定／Approve／Return／Withdraw，不同模組獨立。IPQC-AB 逐群組部分成功需修正；保留既有歷史、私人權限與多人 revision／CAS／guard。

文稿範圍為 AB／C／PROCESS 主資料、製程編輯平台、FQC、IQC、檢具、IPQC-AB、IPQC-C、模具；線別與工段管理使用 AB／C 主資料文稿。2026-10-07範圍原不含BOM；2026-10-10人類新授權依[BOM重建規格](BOM_REBUILD.md)將BOM接入同一V3核心的獨立bom scope，保留既有權限及製程互鎖。這不變更其他模組的草稿或本檔其餘規則。並行新增的例行 FQC 文稿由其独立任务驗收，不合併宣稱通過。

操作權限與無實質修改判定已由 [共享草稿最新規則](SHARED_DRAFT.md) 的 2026-10-25／10-29 確認取代本段舊敘述：ADMIN 跨帳號工作範圍保留，但仍須具該模組各動作的有效權限；入口／view 不授予 edit、Save、Submit、Withdraw 或審核能力。自審須明確確認且紀錄。前後端一致；停用帳號、非法已填內容／引用、CAS、待審鎖仍阻擋。內容缺漏依既有待補規則處理；核准後無實質修改不得再次送審，撤回／發回後則依相同 Save、有效基準與最後案件條件允許重送。此處只消除舊文矛盾，不新增或放寬業務規則。

3020 先保全現況及 IPQC 分配，不新增 PORT、不操作 3030。至少兩 ADMIN 與一般員工交叉驗證各模組。FQC／IQC／檢具實際 UI：修改→套用→Save→重整→Submit→版本台Withdraw→返回編輯→再Save／Submit→明確自審→Approve→重整。另測跨類別保存、跨帳號、待審鎖、失敗／重試不覆蓋。

製程 A/B/C 各選 1–2 真實類別，A/B 取 AB、C 取 C；驗證版本／產品／工段、勾選、唯一占用、Apply、整份 Save、重開與後台反向引用。來源需核准須正常工作流，不直接改 status。

明確授權隔離通過後銜接日常 Local 3000 的本次程式與持久資料：確認原啟動方式、D1/R2 路徑及最新資料；備份日常資料、媒體、權限、版本並留可還原證據；逐差異比對，不以3020整庫或舊checkpoint覆蓋，不帶測試帳號／名稱／流程／案件。日常 AB/C 全部既有標準以獲授權真實身分正常整份 Save／Submit／Approve 一次；已有有效核准版且不需新案則沿用；已有他人待審／並行變更不可撤回／覆蓋／重組，先完成獨立工作並列具體衝突。留操作者、理由、自審與版本歷史，不偽造簽核。日常与隔離核准分開記錄。

必要時確認沒有未完成寫入後沿用原服務、原資料路徑重啟3000，不改埠。重整／重開核對核准標準、製程來源、既有分配及其他模組完整性。Git 合併不是資料移轉。

交付逐模組 PASS／FAIL／未測、截圖、API、修改清單、備份、3000核准版本與復原方式；更新規格／HANDOFF，ChatGPT 透過 connector 獨立複審。可修復本需求，不無關UI重設、不覆蓋模具並行工作、不commit／push／Git merge／遠端部署。
