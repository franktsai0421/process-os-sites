## 2026-11-09 全站取消背景定時檢查

全站所有頁面取消固定秒數／分鐘向伺服器查詢、刷新、同步的背景檢查，不改成另一頻率。進頁、使用者明確更新及操作需要時讀取。草稿於存取時比對；存取、送審當下必要的最新版本、權限、狀態、CAS 和送出結果不明的防重送保護保留。歷史視窗也改於明確操作時核對權限；不承諾閒置畫面即時得知撤權或別人的修改。畫面時鐘、請求逾時和操作觸發的單次 UI 回呼不屬於背景輪詢。這項政策不等於已完成全站草稿拆分、衝突選擇或未存表單恢復移除。[候選逐頁盤點與驗證界線](../../acceptance/global-background-checks-20261109.md)。

## 2026-11-09 — 同頁篩選追加核對

同一頁的 AB/C 篩選保留兩邊暫存；這不等於已完成線別工段頁獨立持久草稿，Save 仍按目前舊範圍。畫布篩選清除問題另有未整合候選；其他頁面追加修正及相依見[逐頁報告](../../acceptance/draft-filter-followup-20261109/README.md)。正式切換所有權、版本查看與全站背景檢查依其各自候選核對，不能因共用程式存在而算完成。

## 2026-11-09 — 全頁草稿存取衝突的共同規則與候選界線

本次確認取代逐欄／逐項選衝突及定時內容同步：只有明確 Save 比對原始基準、本機最終意圖與目前共用內容；一次選「用我的／用對方的／取消」套用全部真正衝突，保留雙方非衝突修改。選後重新讀取發現版本改變必須重比，穩定後同次原子 Save；已送操作及 UNKNOWN 不自動重送。未送本機內容離開真正模組頁時無提示放棄，同頁搜尋／線別／群組篩選保留。已核准版唯讀、不可撤回；權限、pending、原收據、世代、CAS 與引用驗證不放寬。

本機整合候選已涵蓋各實際業務草稿；**線別工段仍與 AB/C 共用既有持久 scope**。每真正頁面獨立草稿是未完成的架構切換，closed split admission 保留，不能以現有候選宣稱已切換或上站。[逐頁盤點、驗收與分拆切換方案](../../acceptance/unified-draft-save-choice-20261109/README.md)。私人問題回報不併入共用業務草稿。

## 2026-11-09 — 全部草稿的存取衝突要求與首批界線

使用者要求只有按存取時核對衝突，整組選「用我的」或「用對方的」，沒有衝突的修改保留，取消原多人同步，並要求各分頁草稿獨立。這是待完成的全站要求，不宣告現有 scope 已分拆。首批 AB/C 候選僅處理既有產品名稱／規格／單位與線別／工段名稱；混入結構、類別或路線修改仍保留原 guards。PROCESS、各分頁持久草稿隔離與 master 取消輪詢整合仍未由此批完成。[實作範圍與驗證界線](../../acceptance/abc-field-save-choice-20261109/README.md)。

## 2026-11-05 AB/C: local completion and one explicit Save

This AB/C candidate covers master products, categories, group defaults/product exceptions and the selected AB/C line/stage entry, separately from IPQC A/B. Form completion retains ordered original-basis guarded changes in the current page; only explicit Save atomically shares them and creates/retains the saved snapshot. Edit includes Save; create/delete/Submit/review remain distinct. Search/filter/poll preserve local input. Leaving the current editing destination/scope silently drops only unsent input; current product↔line/stage destination changes replace the shell projection and therefore also drop unsent input. Unknown Begin/Save retain original scoped markers, generation, operation and sent guards through departure/reopen; only original receipt lookup can settle them, never a 404 retry. Submit refuses local unsaved content and never auto-saves or sends an older snapshot. Existing shared working/saved/pending/effective/history and linked PROCESS cases remain. This supersedes older two-stage Apply/Save and prompted departure wording only for this candidate. [Implementation and acceptance boundary](../../acceptance/abc-local-save-20261105/README.md).

## 2026-11-05 — Equipment candidate scope

檢具主檔採本機表單／照片預覽、一次明確原子 Save 與無提示放棄未送輸入。修改權可存取，送審獨立並在確認前後檢查本機修改；未知 Begin／Save 保留原世代、原 guards、operation 與收據，離頁不清除 barrier、不重送。既有無識別標記不轉成已確認。這不包含設備替換的跨品質 scope 交易，也不改其他候選預設。 [檢具候選與限制](../../acceptance/equipment-local-atomic-save-20261105/README.md)。

## 2026-11-05 IPQC A/B：本機編輯與一次存取

A/B 錯誤碼、檢查項目及矩陣入口沿用全模組草稿加速要求：完成表單不逐筆寫入共享 working；按一次存取才依原欄位／格子基準合併並保存全模組。修改權包含存取，新增、刪除及送審仍各自驗證。未送出輸入離頁可直接放棄；未知操作保留原識別，不重送、不以 404 當成未寫入。

本次確認採 identified Begin + Save：員工只按一次，首次尚未初始化時可有兩個 POST/CAS，後續存取一個 Save POST/CAS。Begin 結果不明則停止，不接續 Save；查回 Begin 仍不自動存取，必須保持原世代與基準。已保存、待審、正式、歷史及舊 unknown 不清理。[候選實作與驗證界線](../../acceptance/ipqc-ab-draft-save-20261105/README.md)。

## 2026-11-04 三模組隔離整合範圍

FQC、IQC、IPQC C 候選均以頁面本機編輯及明確存取為原則，保存時保留權限、欄位基準、世代及 CAS 保護；送審仍獨立。整合不得以導覽例外解除帳號層未知寫入鎖，不轉換或刪除既有 shared working／saved／pending／formal／history。畫布與模具不得因共用程式存在就視為已完成轉接。[候選及驗證界線](../../acceptance/draft-save-integration-20261104.md)。

未知 Begin 的復原要求：送出前保留原帳號、模組及操作識別，後端以同一 CAS 保存開始修改結果收據。中斷或重開頁後只查原收據；目前存在草稿、404 或逾時都不能證明原操作未執行，不能自動重送。允許離頁只放棄尚未送出的本機輸入，保留未知識別及寫入限制。查得 Begin 不等於已存取，不清除仍在頁面的本機編輯／原比較基準、不接續 Save 或 Submit；換代需重新核對。首次存取亦必須比對原 Begin 收據與權威讀回的世代；不同時保留本機修改、比較基準及原收據，禁止自動改綁新世代，重按存取也不可重新 Begin 或送出舊修改。舊版未提供識別的未知 Begin 不可事後假造成功證據。本次不增加跨模組待確認畫面、匯出、人工解鎖或跨瀏覽器復原；實作及驗證狀態仍以候選報告為準。

## 2026-11-04 FQC：本機編輯、一次存取（最新確認）

FQC 編輯不即時同步；表單完成與矩陣勾選先保留於本次頁面，搜尋／篩選不清除勾選。按一次「存取」才逐欄位／逐格合併並原子保存共用快照；不同人的不同格保留，相同結果可收斂，真正衝突才確認。修改權包括存取，送審權獨立。離頁直接放棄未送出的輸入，不跳提醒；未知結果可離頁但保留原識別與寫入鎖，不得重送或刪除未知操作。已存、待審、正式、歷史及既有已同步未存內容均不自動刪除。此要求取代本文件較早的 FQC 整矩陣最後套用覆蓋及兩階段 Apply/Save 規則；其他模組另案實作。[候選與資料界線](../../acceptance/fqc-single-save-20261104/README.md)。

Canvas atomic Save may reuse an existing saved ID when the new working content returns to that saved content, even when the command changed working and its receipt is not marked unchanged. Acceptance still requires the original operation receipt, authoritative readback and durable owner checks; never resend to obtain a different saved ID.

## 2026-11-04 IQC latest requested flow

For the IQC candidate, form edits remain local until Save atomically shares and saves the module. Unsent input is abandoned on departure/reload without confirmation; search/filter retains it. Edit permits Save; submit remains separate. IQC Submit requires explicit Save of all local changes first; an open form, local snapshot or unresolved Save cannot silently submit an older saved version. Recheck local input after the asynchronous confirmation; preserve edits and never auto-save. Unknown operations retain original receipts/write locks while allowing departure. Existing shared data is preserved pending separately authorized conversion. This supersedes older IQC per-Apply synchronization descriptions, not other modules. [Candidate evidence](../../acceptance/iqc-local-atomic-save-20261104.md).

IQC data-state notes retain counts for unstructured formal frequency and unselected optional suppliers outside content-missing totals. Their source is the currently selected draft or fixed version; they add no submission gate.

## 2026-11-03 IQC completeness presentation clarification

For IQC, draft and submitted-case missing counts use the existing server content-issue definition and count individual missing issues. Valid source rules and optional supplier information do not become missing merely because they lack structured cadence or selection. Import notices remain distinct. Label the loaded working draft separately from a fixed submitted snapshot; unavailable inspection is not zero. This presentation correction does not change which content may be submitted, structural validation or any authorization guard. [Implementation evidence](../../acceptance/iqc-content-issues-20261103/README.md).

## 2026-11-03 使用者澄清：放棄未存輸入後可以離頁

使用者要求所有草稿頁面可以明確選擇放棄未存輸入後切頁查看資料；不需要保留、checkpoint 或還原。放棄只處理本機未送出輸入，不代表撤回已共享內容、取消在途請求、清除 unknown 或允許重送。未知操作的原識別、結果追查與寫入鎖必須保留；404 不證明未提交。新 FQC 候選實作單獨導航許可，後續分支提供一般共用草稿與製程本機輸入的放棄離頁；其他模組 unknown 及 feedback 仍未完成，不能聲稱已全部支援。逐頁界線見 [後續驗收](../../acceptance/simple-draft-departure-20261103.md)。此項新要求取代下列歷史離頁規則中「必須保存所有輸入才可離開」的解讀；在途寫入、身分變化和無法證明鎖仍存在時繼續保守處理。

## 2026-11-02 FQC matrix interaction clarification

User-confirmed rule: pressing matrix Apply immediately writes the entire captured matrix selection to shared working. Last successful server commit wins, including replacing choices from an earlier editor's stale screen; only matrix relations may be overwritten. Hidden/search-filtered data remains part of the full selection. Changed product/item collections reject and require reload. Upper Save separately saves the latest whole FQC shared snapshot; approval stays separate. Permissions, pending locks, original receipts, safe unknown-result query and other forms' guarded conflicts remain. [Candidate details and verification](../../acceptance/fqc-matrix-last-apply-20261102/README.md).

## 2026-11-01 FQC necessary-dependency fault boundary

User-approved FQC policy: an eligible operation checks necessary authorization, FQC, AB product and equipment dependencies rather than unrelated modules. Unread unrelated data is not certified healthy or repaired; its fault alone need not block that FQC operation. Necessary faults still fail closed. Apply is not Save or approval; per-field guards, actor/operation receipts, pending locks, fresh revocation and global revision/CAS remain mandatory. The initial local implementation limits this policy to ordinary records-v1 Apply/Save and complete selected aggregates; GET/review/restore and unsupported formats retain their existing behavior. [Implementation and test boundaries](../../FQC_REQUIRED_DEPENDENCIES.md).

## 2026-10-30 AB／C 送審與歷史操作說明

AB/C 送審明示本次已儲存快照的時間／儲存者，分頁列出未包含的產品、類別、線別與工段變更；若要送最新內容，取消後先儲存。提示不自動儲存、不改原固定快照契約；確認期間被另存時仍須重新確認。版本選擇器處理目前版本／草稿，歷史區集中唯讀與還原，不重複提供歷史快切。歷史分頁讀取期間停用連點，成功後才更新游標；失敗保留原頁碼與內容，允許明確重試。還原影響分開列線別與工段數（含順序變動）；無差異明示無需還原並停用套用。篩選不縮小整份 scope。驗收見[後續修正](../../acceptance/AB_C_DOT_HANDOFF_20261030.md)。

## 2026-10-30 草稿切頁（AB／C 修復）

未修改的新草稿與 active 相同時顯示「尚無變更」，不要求先儲存。已套用但尚未手動儲存的內容離頁時，確認後呼叫原模組 Save，只有確認完成、身分及目標仍有效、沒有新增未保存輸入才切頁。取消、UNKNOWN、已拒絕／排隊寫入、開啟表單、登入／權限變化仍留在原頁；不清除旗標或自動重送。UNKNOWN 沿原操作編號查詢，完整讀回 saved 後才解除離頁阻擋。連點只共享一次儲存，最後仍有效的目的地才提交。

驗收與逐頁界線：[AB／C CLOUD 30102026](../../acceptance/AB_C_DOT_HANDOFF_20261030.md)。

## 2026-10-29 權限設定明確化（使用者確認）

保存、送審可單獨授權；V3 各按鈕與 API 應使用相應權限，不以 edit 代替。新增「還原歷史至草稿」獨立權限，還原涉及新增／刪除時亦須具對應能力。不得默默補權或批次重設既有設定；保留 pending、CAS、歷史與引用。既有 legacy 取代快照仍需要其實際執行的編輯能力。實作與未完成範圍見 [候選報告](../../acceptance/USERS_CLOUD_CLEAR_RIGHTS_29102026.md)。

# 單一共享草稿與版本邊界

狀態：Current confirmed requirements。依 2026-10-05 使用者明確確認；實作細節見 [V3 現況](../../../AI_CONTEXT/modules/V3.md)。

- 每個適用工作範圍維持單一共享草稿。製程 authoring 為整個平台 process:platform；各品質／主資料模組維持自身 scope，不合成跨模組草稿。
- PR #11 的個人草稿及三值衝突方案已淘汰，不作實作或驗收依據。Canonical 檔案同步的三方合併是另一流程，不因此移除。
- 區分 working、成功手動 Save 的 snapshot、固定送審案件與 effective version；未核准內容不傳入正式使用端。同步／Apply 不等於手動儲存或核准。
- 保留權限、待審鎖定、revision／generation／相依防護及歷史。後端確認送審與審核結果；未知結果不能假報成功或覆寫他人工作。
- 2026-10-25 使用者澄清取代 2026-10-06 的無差異送審規則：初次尚無有效版本可送審；撤回或發回後，可再次送出同一份已成功 Save 的固定快照，無須為重送刻意修改。再次送出依伺服器最後案件為 withdrawn／returned、savedId／內容相同且有效基準未變判斷，不接受 client 放行旗標。核准後再送審，必須相對目前有效版本有實質修改，否則拒絕 NO_SUBSTANTIVE_CHANGE；僅改顯示 metadata 或修改後還原不算實質修改。內容未完成仍列待補交由審核者判斷；資料格式、真實引用、身分、角色權限、待審、CAS 與舊收據冪等保護不變。具該動作權限的人員自送自審仍須確認並記錄。
- 2026-10-07 最新确认見 [WHOLE_MODULE_DRAFT](WHOLE_MODULE_DRAFT.md)：儲存／送審涵蓋模組全部線別、類別、分頁，不因篩選縮小；Submit 使用最後成功手動 Save 的固定快照，不在送審時自動重存。IPQC-AB 改為單一整份案件與原子處理，舊逐群組部分成功政策已被取代。其他模組各自獨立，不合成跨模組案件。
- 2026-10-29 明確授權規則取代僅以入口推導操作的舊敘述：各操作須具本模組對應權限；入口／查看本身不授予編輯、保存、送審或撤回。ADMIN 的跨帳號工作流範圍保留，仍受個別有效權限及 pending／歷史保護；具審核權者自審須明確確認並留稽核。

- 2026-10-10 主資料審核：AB、C、BOM、線別工段及流程主資料共用案件列表；製程編輯台留在製程版本確認。待審清單只顯示待處理案件；確認、發回或撤回後移出，歷史保留人員、時間、原因及固定內容。發回／撤回須填原因；查看案件直接進入審核頁。

實作差距：V3 非所有現有 scope 都已啟用；讀取不得自動轉換。完整端到端、實機與容量驗收尚未結案，各輪隔離證據依各模組驗收報告；不代表日常資料或實機驗收。

## 2026-10-30 離頁放棄的確認邊界

使用者確認：離頁「放棄」僅撤銷本次可確認屬於自己的未儲存修改；不得整份還原而取消他人的共享工作。逐欄位核對前值與版本，同欄已被他人修改、身分/權限/世代變更或寫入結果未知時留在原頁，保留輸入並說明原因。已成功 Save 的快照、送審案件、正式版本與歷史不得刪除或重寫。儲存並離頁仍依既有規則儲存整個模組共用內容，需確認最新輸入已套用且後端保存成功。此為已確認需求，並非宣告所有模組已實作。
