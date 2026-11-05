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
