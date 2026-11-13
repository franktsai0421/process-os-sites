# A/B、C 主資料雲端候選

本次範圍是中控系統 A/B 與 C「產線與類別」主資料，不是 IPQC。由 main `f0f425d90ea883bab479801dd54f5deaed6cce69` 建立獨立分支 `codex/abc-master-cloud-integration-20261113`；只建立一個 Draft PR，不合併或部署。線別／工段管理與流程資料另有工作，本候選不另建其 PR、不改其 domain/reducer。共用 editor 的進度／讀取重試呈現由同一檔案供既有頁重用。

## 來源整合矩陣

| 可核實來源 | 本次處理 | 限制 |
| --- | --- | --- |
| main f0f425d；已合併 #110 head 17c66115 | 保留全部主線；共用 transport 原設備／模具、品質及 PROCESS 行為透過精確 inverse 回到完整 main bytes 再跑既有 proofs | 不把 #110 原 PASS 當本次最新候選 PASS |
| #111 head 91575d63149f4b7599d35b3b6462523a03a04c5f | 唯讀核實為 open Draft，基於 main f0f425d；不擅自吸收其他正在整合的 PR | 共用 shared-draft-client/index 仍須未來合併時語意整合，保留兩邊 exact proofs |
| #102 `codex/module-draft-boundary-main-20261109` 55d4672cb8004d0b01715714cbc91fbce6b22d2b | 核實新 page workflow/editor 已在 main；不再整支搬回。main 比舊版多 Save-only 權限與空 batch 過濾，保留 main | 舊 master-shared-client 的分支差異不可全檔覆蓋新版 |
| `handoff/ab-c-final-20261030` 828d1d38699dddb5b70f4503bb5ce4fdde706a24；[原交接](../AB_C_DOT_HANDOFF_20261030.md) | 核實分支與文件；沿用已進主線的路線／引用／CAS 成果，依最新要求選擇 | 舊版切頁阻擋、歷史還原、輪詢描述已被後來要求取代，不恢復；原私人970次操作／效能原始輸出不在本次雲端交付中，未宣稱重驗 |
| `feature/abc-local-save-20261105` d05a85eab2a49e735a604078873578898edf1535；#80→已合併 #85 | 核實既有本機編輯／原子 Save／原收據模式；保留目前主線及其現有回歸 | 既有 legacy AB/C 的 combined ownership 不冒充已啟用的獨立 page-v1 |
| [#108 adoption 界線](../accounts-process-joint-20261112/requirements.md) | 保留 trusted stored marker、approved baseline、legacy writer fence | 沒有改資料標記，沒有 real page-v1 adoption |

## 補查 #101／#102 本機候選描述

補查時發現：PR body 所稱未上傳的候選commit物件現在實際可由GitHub完整SHA讀回，並已fetch為真Git物件：#102 `2a1d415`（tree a50783e）、`ae8c208`、產品`e14f268`；#101 `25305c1`、產品`a2c5f55`。這修正了「僅因沒掛分支便視為不存在」的可能誤判；不表示舊PR已更新或舊上傳UNKNOWN已全部解決。

[逐檔來源選擇矩陣](source-selection.json)保留15個相關路徑×7個固定來源的blob。#101 head的`app.js`與main同blob `e127874d8d7b9015ae3864afa6bcc4e19668ffb3`，計數成果已保留；較後本機描述候選的page workflow／ownership核心也已存在main。差異集中在更舊legacy history／bridge及Save-only前權限：本候選保留main新page dispatch、approved-history constructor/cache、PROCESS readonly lease、獨立page reviewer及Save-only修正，不以441行舊bridge替換新主線。完整本機測試輸出／私人交付包未取得，PR body裡數量及真人／實站結果不當本次驗證。沒有重送任何歷史UNKNOWN或已拒操作。

## 推送前主線更新

2026-11-13重核main已前進`ba315149e7478c288d2f3af45c8668aa60070919`，為#111的實際merge。獨立分支語意合入新main：shared transport保留新送審分類與本次catalog I/O；index／三個cache測試同時保留#111版本；HANDOFF保留雙方；來源inverse先精確還原到ba31514，再走未改pins的#110／#111雙向證明。初期f0f425d的檢查是歷史紀錄，最新合樹需另跑受影響回歸與CI。

## 本次變更與風險

- A/B、C exact durable catalog routes（legacy workflow 與新 page owner）取消固定15/45秒 elapsed abort。其他模組與 LINES 的期限不變。沒有定時輪詢、沒有自動重送；網路失敗仍保留原操作並只查原收據。這不表示服務永不斷線或必然成功。
- 新 AB/C page Save 使用既有權威重讀契約，核對原收據、actor/generation、正確 page owner、savedId／內容與最新可見權限；重讀失敗保持 UNKNOWN，不把POST ACK當最終完成。unknown 的頁面離開權限保留原 marker。
- editor 提供 aria-busy、步驟進度與初次讀取失敗重試；busy期間鎖控制，重複點擊不排第二次寫入。
- 修正新增空類別更名誤把「全部類別」變成該類別篩選，造成下一個新增產品列隱藏。新增產品採目前線別／類別篩選並清搜尋，仍保留本頁其他未存修改。
- `previewMasterCatalogHandoff` 是離線純函式：接受完整已水合來源與 exact revision/root digest/approved version pins，列出原 workflow/save/case/version/receipt 的原 owner、ID與內容digest。舊 AB/C 的候選頁標示 catalog＋LINES，收據仍只屬舊owner。未知結果輸入固定原 endpoint/actor/operation/generation，缺收據或不符保持待查且 replayAllowed=false；不跨owner找同名ID、不推斷未提交、不產生新Begin或寫入權。
- 無 schema、正式或測試站資料、帳號政策、備份、部署或公開設定變更。沒有新增或移除匯入／匯出入口；main 已有的 page editor Excel 程式保持。

## 21 項覆蓋與適用界線

「程式／隔離驗證」不等於「資料啟用」或「真人驗收」。下表以 page-v1 已合法建立的隔離 fixture 為新頁驗證範圍；marker-absent 舊站仍走 legacy，相應獨立所有權／原頁唯讀歷史不能在切換前宣稱現站完成。

| # | 需求 | 程式與驗證證據／剩餘項 |
| --- | --- | --- |
| 1 | A/B、C、LINES 草稿隔離 | 各owner原API保留；新增AB/C生命周期逐次比對另一catalog及LINES原bytes；不執行真資料split |
| 2 | 每頁保存／送審／撤回／核准／權限 | 新AB/C UI鏈＋既有runtime/review權限回歸；真帳號未驗 |
| 3 | 同頁類別／線別／篩選保留輸入 | 實際editor本機filters測試；新增產品可見缺陷修復；不建立新draft |
| 4 | 跨模組無警告棄未存、保留已存 | departure與既有導航回歸；新測離開重入／重讀保存；原UNKNOWN marker保留 |
| 5 | 舊資料與不明操作歸屬 | 新固定來源read-only盤點與原收據分類；真資料盤點／銜接決策／切換尚未執行 |
| 6 | 取消背景定時比對 | 原#100保留，synthetic DOM setInterval禁止；只在明確操作比對 |
| 7 | 整組用我的／對方，保留非衝突及ID | AB/C各三選擇，對方defaultStages獨立變更保留；既有同ID還原／路線merge回歸 |
| 8 | 取消零寫入、選擇期間更新重比 | 實際editor兩次peer修改、再次對話框、取消POST零增加 |
| 9 | 未知先查原結果，不盲重送 | AB/C lost ACK、404、重入markers、fresh readback失敗；皆一POST、原收據GET |
| 10 | 只列核准歷史、原頁唯讀 | main page history actual route/DOM中越文回歸；真資料 adoption 前legacy入口不冒充新頁 |
| 11 | 禁歷史編輯或覆蓋現行 | page-v1 handler拒絕restore、歷史DOM stale callback／Save無寫入回歸；legacy舊restore未在本案偷偷轉換 |
| 12 | 產品／類別／已核准路線，繼承／例外 | main groupRoute與page validation保留；CRUD／路線回歸；LINES domain另案 |
| 13 | 更名連動產品、引用類別不可刪 | 新AB/C更名後product category核對；刪引用類別拒絕；移除產品先獨立Save再刪類別，保留原guard |
| 14 | 僅引用核准線別工段 | page runtime未核准stage拒絕、approved-source回歸；沒有新增正式引用 |
| 15 | 類別defaultStages→畫布，C五工段 | 既有group-maximum/process-page-lifecycle案例重跑；真C類別未操作 |
| 16 | 逐鈕實際作用 | 新建、修改、保存、重讀、送審、撤回、再送、核准、刪除及取消／衝突／查原結果；歷史、路線工具走現有回歸；不是全站所有按鈕驗收 |
| 17 | 取消過短截止，慢處理進度防連點 | 兩代AB/C durable route virtual120秒讀寫；實際UI延遲gate/一次POST；讀回失敗不假成功；未聲稱實站提速 |
| 18 | 無輪詢或舊本機表單恢復 | 保留#100，只有已送操作marker；不恢復舊查看最新共享／繼續未完成／本機恢復 |
| 19 | A/B、C完整生命週期 | 各自實際editor→signed handler→SQLite/Map R2新測；編譯瀏覽器另列結果 |
| 20 | 隔離、雙身分衝突、慢操作、連點、切頁 | 新actual transport/handler與現有shared/navigation回歸；同機合成兩身分不是真人跨機 |
| 21 | 瀏覽器／窄版／規模與速度分列 | 編譯Chromium runner加入現有CI，1280/390 × zh/vi；本地socket EPERM及browser下載損毀限制獨立記錄；真人／實體手機／IME／實站規模NOT_RUN |

## 檢查狀態

本地程式候選 `51d024f6e2da4ddd7b6f74ca63d453a367bd90b1` guarded build通過，後續僅測試cache pins與文件修訂。完整lint及TypeScript已通過；actual catalog UI14/14、source/handoff/transport/history55/55、品質來源與cache／deadline165/165，及master runtime、review、boundary、LINES相容、C五工段→Canvas lifecycle、其他模組deadline13/13通過。共用回歸首輪447/449，兩項為舊cache tag精確預期；修正預期後相關完整組重跑通過，未放寬斷言。獨立group-maximum runner前9項PASS後因缺SOURCE fixture參數退出，未當完整PASS；不讀真資料補參數，以現行process-page-lifecycle C五工段實際handler鏈補覆蓋。遠端head與CI另以PR檢查為準。初始失敗（新增類別篩選缺陷、測試未遵循先移除產品Save再刪類別、型別及lint）保留雲端原輸出；修復後需有重跑PASS才改列完成。測試批次有覆蓋重疊，不加總為唯一操作數。

實際資料啟用、legacy working/saved去向、pending在原owner結案、UNKNOWN原收據、approved baseline與ACL審查及可相容切換，仍須以真來源另行決定與授權。本函式不是可執行遷移器，也不是外部備份或真資料驗收。
