# IPQC C 完整需求與成果對照

此台帳對照本工作此前完整交接與 Frank 後續要求，補入原 PR #106。不是只核對最後幾點，也不是將既有 PASS 重新標成待開發。

**目前有效產品政策已改為同模組保留。** Frank最新原文：「在同一個模組下切換產品可以保留 如果切換分頁就不保留 例如都在ipqc c下面 就保留 但是切換頁面到FQC就不保留」。這取代先前「對要放棄未存修改」及10:14捨棄結論；不能再把舊版當最終需求。見[決策與逐入口範圍](product-switch-decision.zh-TW.md)。

遠端盤點起點dcf3e637a6ae8d24293f70166df727b52cd4ec32仍為產品捨棄候選；已先查明HEAD／tree／main與在途CI，沒有盲目重送或回滾。最新修正只讓C產品側欄切換保留未送journal、working、待上傳照片；真正離開C才沿原departure/reset丟棄未送內容。已存資料與已送UNKNOWN分開保護。

## 核定依據與工作選擇分類

- 本次Frank最新原文直接核定同C切產品保留，C→FQC等其他頁不保留未送內容；先前產品捨棄回答與10:14紀錄現在是**已被取代的歷史決策**。
- 11/4 Dot提案不能冒充Frank批准；11/4編輯modal限制與11/9工段／離頁規則不因這次產品例子自動重定義。工段、coverage、待補／驗證定位等其他選擇器**本次未重新確認，不擴改**。
- 產品按鈕改productCode但保留同C模組draft owner／scope／generation／draftId；只刷新所選產品視圖。普通搜尋沿用保留。真正模組離頁清RAM與照片、不提示、不做Save；已送收據繼續原結果查證。
- 本工作透過對話取得原文，沒有獨立重讀原Dot thread；較早轉述及測試預期不當作過去已批准的證據。舊版紅綠只描述當時候選，不代表新版合格。

狀態：**已涵蓋**為對應程式／合成證據；**最新修正**為依此次保留規則補測、待新版集中預檢與CI；**未驗收**為真人／測試站等不能以模擬替代的項目。

## 逐項需求、證據、缺漏與處理

| ID／需求 | 現有程式證據 | 測試證據 | 缺漏及處理結果 |
| --- | --- | --- | --- |
| C01 舊成果先校驗、盤點 main／舊分支／#103／#104，避免重造及覆寫 | [來源清單](sources.json)：17 檔 Dot 精確 patch；main9fbba823 已含 #91/#93/#96/#100；boundary55d4672 選擇性重用；兩 PR 分支僅讀取 | 接收時逐檔 bytes/SHA-256；[來源逆轉契約測試](../../../tests/ipqc-c-integration-source-contract.test.cjs)保留原歷史 hash、負向案例及 CRLF 證據 | 已涵蓋。傳輸檔與 signed transfer 留在 repo 外，未整包搬入其他模組，未重啟 Dot |
| C02 Save／送審慢：不能把合併視作部署，也不能把 V41 的20／48秒直接報已解決 | [C workflow](../../../lib/ipqc-c-workflow.ts)與[API](../../../app/api/ipqc-c/workflow/route.ts)保留單次 atomic Save、compact ACK、revision/CAS | [local Save benchmark](../../../scripts/benchmark-ipqc-c-local-save.cjs)、[完整路徑 benchmark](../../../scripts/benchmark-ipqc-c-local-path.cjs)、1735列原生 profile；既有合成 handler Save／Submit 中位數233／264ms，非實站延遲 | 程式與合成效能已涵蓋；**測試站延遲未驗收**，V41 現場延遲不結案。沒有部署授權，因此未以部署或正式資料補測 |
| C03 Save guard、完整 Save／送審流程保留，不因本次比較而自動儲存或重做已過成果 | [writeShared](../../../public/process/ipqc-c.js)保留明確 Save、未存不送審及 fixed savedId | [十模組實際 handler 流程](../../../scripts/test-integrated-workflow-cycles.cjs)：C Save／Submit／撤回／再送／核准、舊 cutoff、pending、no-change 與競爭拒絕 | 已涵蓋。重用 #89／#91 基礎；目前行為以新來源回歸證明，不宣稱舊真人測試等同本版驗收 |
| C04 C 頁獨立草稿，不與 A/B 或其他頁混用 | [beginIpqcWorkflow](../../../lib/ipqc-c-workflow.ts)固定 `createSharedDraft('ipqc-c',...)`；[API](../../../app/api/ipqc-c/workflow/route.ts)固定 `ipqcCMasterControl`；transport endpoint 固定 C | [compare-save](../../../scripts/test-ipqc-c-compare-save.cjs)新增兩產品共用 scope/generation、直接 handler 一次 Save 含兩產品內容、所有非 C persisted values 完全不變；另測無關 scope 查詢不能另拆草稿 | **本輪補證**。原先行為已正確，但缺少直接同時比對 A/B、BOM、FQC 與其他 persisted values 的斷言；新增。此為後端 scope 隔離證據，不授權 UI 跨工作選擇保留未送內容 |
| C05 同C切產品保留未存修改與照片；離開模組才捨棄未送內容 | [retainProductDraft／產品bind](../../../public/process/ipqc-c.js)保留C working／journal／localPhotos及在途owner；真正departure/reset仍清RAM | [原生browser](../../../scripts/test-ipqc-c-local-browser.cjs)：C100→C200→C100保留兩產品修改、一次明確Save；待傳照片往返後實際上傳；同scope/generation/draftId、瀏覽零寫入；C→合成FQC目的頁清RAM且DB/R2不變；UNKNOWN／晚ACK原receipt保留 | **最新修正**。依最新Frank原文保留，取代10:14捨棄結論。舊dcf3e63按新預期red為實際0／預期1。工段／coverage／定位等不因本次產品例子擴改或宣稱重獲核定 |
| C06 Save／送審前比較 base／mine／最新 server，整組一次我的／對方／取消，不逐欄位選擇 | [compareLocalSave／chooseSaveConflicts／compareBeforeSave](../../../public/process/ipqc-c.js)：只有整組按鈕，所有 clash key 同一選擇；Submit保留先Save及固定savedId/revision守衛，不自動套用未送內容 | [原生 browser](../../../scripts/test-ipqc-c-local-browser.cjs)兩欄位衝突、零逐欄位 input、整組兩方向選擇；[compare-save](../../../scripts/test-ipqc-c-compare-save.cjs)實際比較函式與 handler | 已涵蓋。Dot 原逐項選擇已在既有提交修正，本輪不重寫 |
| C07 整組選擇保留雙方無衝突修改，不能拿整份歷史覆蓋 | [compareLocalSave](../../../public/process/ipqc-c.js)從最新內容逐欄產生 guarded patches／必要 module actions；沒有提交歷史 body 作為替換 | [compare-save](../../../scripts/test-ipqc-c-compare-save.cjs)不同欄位、不同 item、相同值收斂；原生選我的保留獨立 peer item；[tombstone](../../../scripts/test-ipqc-c-tombstone-revival.cjs)拒絕 replacement／patch smuggling／history selector | 已涵蓋。非衝突來自雙方；歷史快照不是復活來源 |
| C08 取消零寫入且保留目前內容 | [chooseSaveConflicts](../../../public/process/ipqc-c.js)取消返回 null；初次衝突選擇位於照片上傳與 Save POST 之前，取消不送 Save | [原生 browser](../../../scripts/test-ipqc-c-local-browser.cjs)open choice 時 mutation0、DB/R2 snapshot 不變；Cancel 後 mutation0 且本機衝突內容仍在 | 已涵蓋。取消比較不是切頁捨棄；兩種使用者動作分開。已送出的照片上傳或結果不明操作不以取消抹除，也不當作未送內容 |
| C09 選後 server 再變動要重比對，不要再按 Save | [compareBeforeSave](../../../public/process/ipqc-c.js)選後與照片上傳後重讀；revision改變回到比較迴圈；writeShared只接受原 transport 的確定未寫入拒絕證據 | [原生 browser](../../../scripts/test-ipqc-c-local-browser.cjs)choice／upload／最終CAS三個 peer race；同一次 Save 自動重比對；UNKNOWN不得套用重試例外 | 已涵蓋。原409不是籠統重送授權，原不明操作不能用新 command 取代 |
| C10 刪群組遇 peer 新增子項需整組選擇 | [compareLocalSave](../../../public/process/ipqc-c.js)群組含 row及children 比對；cascade guard 含目前全部 children | [compare-save](../../../scripts/test-ipqc-c-compare-save.cjs)peer-added child 造成一個群組衝突；對方保留整組，我的經明確同意才cascade；其他群組保留 | 已涵蓋。取消、ACL或CAS拒絕均不產生部分 cascade |
| C11 必要原 ID、父子／產品／工段／來源／矩陣關聯保留 | [C workflow revival](../../../lib/ipqc-c-workflow.ts)只允許目前 tombstone 的原 ID；檢查 id/code/productCode/stageCode/errorId/sourceRow 及父項 guard | [tombstone](../../../scripts/test-ipqc-c-tombstone-revival.cjs)八種 standardEnabled/cpkEnabled/notApplicable 組合與原欄位／照片／檢具完整比對；選定 children、predeleted/peer-added 不誤復活；歷史及外部引用哨兵不變；ACL/CAS/session負向案例 | 已涵蓋。不是新增替代 ID，也不回填整份舊歷史；矩陣證據為合成資料，未冒稱真人矩陣驗收 |
| C12 #93 檢具切換名稱／照片成果保留 | [C equipment renderer／prepareLocalSave](../../../public/process/ipqc-c.js)使用選定檢具原圖與 server normalization | [gauge browser](../../../scripts/test-ipqc-c-local-gauge-browser.cjs)反覆換檢具、原圖decode、取消、停用／清除、一次Save、reload及舊核准快照名稱照片不變 | 已涵蓋。保留 main #93，不重新搬舊分支 |
| C13 換檢具、刪／新增子項後再刪父項的409 | 比較以原 preimage fold 刪除；[workflow](../../../lib/ipqc-c-workflow.ts)保留 equipment-origin及缺省欄位 guard | [compare-save](../../../scripts/test-ipqc-c-compare-save.cjs)換檢具後刪item、新child後刪parent無孤兒allocation；[browser](../../../scripts/test-ipqc-c-local-browser.cjs)create-first／delete-first兩順序各一次atomic Save；[tombstone](../../../scripts/test-ipqc-c-tombstone-revival.cjs)設備guard負向 | 已涵蓋。沒有放寬409、ACL、CAS或物理刪除保護 |
| C14 重複照片依群組判斷，不把所有照片都當重複 | [compareLocalSave photos](../../../public/process/ipqc-c.js)依每item內照片identity/hash分組；只解決有歧義的同組 | [compare-save](../../../scripts/test-ipqc-c-compare-save.cjs)同hash兩筆的一組衝突、無關 peer B與local C保留、重複引用／新增不去重；原生照片上傳與race | 已涵蓋。不是整個相簿或全庫一律衝突 |
| C15 離開C模組時未送內容靜默捨棄；無輪詢、表單還原或取消提示 | [discardUnsentScope](../../../public/process/ipqc-c.js)、`errorRecoverySupported=()=>false`、既有全站 departure 邊界 | [actual stack](../../../tests/multiuser-ipqc-c-local-recovery-actual-stack.test.mjs)RAM-only／無恢復入口／組字；[departure bindings](../../../tests/multiuser-module-departure-bindings.test.mjs)；[background proof](../../../tests/background-check-source-proof.test.cjs)；原生切頁/reload | 已涵蓋。保留 #100；不啟用舊恢復程式、不新增離頁提示 |
| C16 已送 UNKNOWN 必須單獨查證，不能當未送丟棄 | 主要 shared transport 保留原 operationId 與 durable receipt-only marker；404不解除不明狀態 | [admission](../../../tests/ipqc-c-operation-admission.test.cjs)malformed ACK、撤權後 receipt-only；[local rejection](../../../tests/ipqc-c-local-save-rejection.test.mjs)三模組未知隔離／其他transport保護；原生 lost ACK、404、reload只查原receipt | 已涵蓋。未建立新操作來掩蓋舊不明結果；既有原操作權限／帳號保護維持 |
| C17 晚回應不能覆蓋新資料、留下busy或鎖住再進頁 | [owner／mountSequence fences及mount](../../../public/process/ipqc-c.js)真正模組離頁退休舊presentation；產品切換保留同C owner；主要transport仍結算原operation | [原生 browser](../../../scripts/test-ipqc-c-local-browser.cjs)延遲已commit ACK後跨產品與直接remount、保留原marker、一次POST、無reload barrier／stuck Save；[actual stack](../../../tests/multiuser-ipqc-c-local-recovery-actual-stack.test.mjs)較新readback | 已涵蓋。晚ACK修正來源244adfe保留，未新增背景讀取或表單還原 |
| C18 同頁已核准歷史唯讀、不修改歷史 | [selectPageVersion／approvedHistoryClient](../../../public/process/ipqc-c.js)、[strict approved evidence](../../../lib/approved-history.ts)、[C API approvedHistory](../../../app/api/ipqc-c/workflow/route.ts) | [原生 browser](../../../scripts/test-ipqc-c-local-browser.cjs)兩次核准後選首個版本、無編輯/Save/restore、mutation0／完整snapshot不變；[admission](../../../tests/ipqc-c-operation-admission.test.cjs)拒絕未授權歷史與回draft重讀權限；[helper](../../../scripts/test-approved-history-evidence.cjs)strict與其他模組相容 | 已涵蓋。#96歷史基礎保留，只有已核准證據版本可進此入口 |
| C19 不允許新草稿／歷史還原；舊已接受還原僅原收據查證 | [API](../../../app/api/ipqc-c/workflow/route.ts)新preview／新restore POST拒絕；原已接受fingerprint/actor仍嚴格核對 | [shared restore admission](../../../tests/shared-draft-restore-admission.test.cjs)：C authorized/revoked/revision/pending零寫入；原已接受GET與精確重播不寫入，跨actor／改command拒絕。五項共享還原正向測試保留於支援的檢具模組 | 已涵蓋。沒有刪舊安全案例掩蓋C新規則；不是重新啟用C恢復功能 |
| C20 Save、送審、撤回與最終核准權限分離 | [operationAllowed/writeShared](../../../public/process/ipqc-c.js)、[ipqcCFinalReviewAllowed](../../../lib/ipqc-c-access.ts)獨立檢查 approval.view/approve/return；[API](../../../app/api/ipqc-c/workflow/route.ts)保留create/delete/pending/CAS | [operation permissions](../../../scripts/test-ipqc-c-operation-permissions.cjs)7組231次直接handler呼叫，module-reviewer被拒而platform reviewer可核准/退回；[admission](../../../tests/ipqc-c-operation-admission.test.cjs)送審確認後actor/delivery重驗；十模組撤回/再送/核准競爭 | 已涵蓋。未藉補測放寬權限、舊case、session或CAS保護 |
| C21 共用檔來源／依賴與其他模組相容，不互相覆寫 | [來源／共用依賴表](README.md)、[sources.json](sources.json)、精確source successor inverse | C、AB/C、PROCESS、Feedback、Windows五項CI於f5c41544成功；共用history／VersionDraftUI預設行為、固定source hash／negative proof保留 | 已涵蓋。本次只刷新index的C cache tag；VersionDraftUI、其他模組tag及順序不動。精確逆轉契約只更新C frontend/index兩個afterHash及span，原beforeHash與負向測試保留；舊PR分支不動 |
| C22 集中預檢、乾淨clone、逐批遠端HEAD/commit/tree/PR查證；CI失敗自修 | [verification.json](verification.json)及PR結果；來源掃描拒絕敏感／非source資料；package/lockfile不變 | f5c41544五項CI成功；Windows source scan612 commits/5378 blobs/2017files、145原生退出碼位置、219共享回歸及10模組流程成功；乾淨clone244adfe及f5c41544舊build屬歷史證據；C05需求更正後前端輸入不同，必須重跑本輪lint/types/build與相關來源／導航／原生回歸 | 已涵蓋。舊CI缺史／cache證據／fixture宣告／platform reviewer／舊restore斷言均先定位後修正，沒有刪原步驟或降預算。本輪新增斷言與文件另跑適量預檢，最後以新HEAD CI結果為準 |
| C23 真畫面／中越文／手機桌機／真人雙帳號／測試站延遲 | 現有UI保留雙語、原生原圖與唯讀歷史；沒有真帳號／正式資料／schema變更 | 1440/390 Chromium、中越文、1735列profile、合成兩身分handler競爭通過；這些不是實體手機或真人遠端會話 | **真人測試站、真IME、實體裝置與現場延遲仍未驗收**。不部署、不改正式資料或帳號來假造通過；此限制同時記在PR及驗證文件 |
| C24 結果不明操作先查證，不盲重送；禁止merge/deploy/刪舊分支/重連舊connector | 所有push後讀回ref／commit/tree／PR；main維持9fbba823；本輪不新增產品寫入 | 舊 UNKNOWN32 tree5005cba0 GET404，仍UNKNOWN；當前來源與CI逐次讀回，不沿用舊HEAD狀態 | 已涵蓋。UNKNOWN32不宣稱成功或失敗，未重送；沒有merge、部署、刪舊分支、修改#103/#104或恢復被拒的連接器／舊Dot工作 |

## 最新修正與證據重用界線

1. 24項原始需求保留；整組衝突、取消、非衝突、原ID／矩陣、照片分組、檢具刪除、核准歷史唯讀、權限保護不重寫。
2. 保留原直接handler兩產品scope隔離證據；同產品選單保留現在依**本次Frank原文**核定，不由scope相同自行推論。
3. 只改產品按鈕保留journal／working／待傳照片與同C操作owner。工段／coverage／定位保留原候選處理，不以這次例子擴改。真正C模組離頁仍零寫入捨棄RAM，原UNKNOWN receipt保留。
4. 前一dcf3e63及產品d8eca11的lint/build/CI不是最新前端通過證據。C來源與cache tag改為 `393941c3f4716bd5542f17f0eac9b65619e6da4f858ffc5cd0ec81b5a7b0e29f`／`20261112-c-product4`；最新原生、來源、導航、UNKNOWN與build另驗。
5. 真人雙帳號、實體裝置、真IME與V41測試站延遲仍未驗收；舊UNKNOWN32仍未知且未重送。不合併、不部署、不改正式資料／帳號。
