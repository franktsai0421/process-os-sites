## 2026-11-09 三路語意整合候選（本機，未切換）

#102 已以實際 merge 納入製程 `7e409a0`、統一已核准查看 `a57aa1d`、權限 `ea58111`，並保留本題 `f79c046` 的 master 進階／Excel 操作、例行 FQC 照片 UNKNOWN 防重送與本人發回規則。十三個實際功能頁仍各自擁有草稿／送審；篩選不建立新模組，線別工段只在自己的核准後供其他頁引用。例行 FQC 為整頁 owner。新已核准版本選擇器含 RF 整頁；舊封存最後身分與版本檢查保留。

依 Frank 指示，本次移除草稿還原入口，新的還原預覽／命令拒絕；保留已核准歷史只讀、原收據與原資料。衝突中選「我的」保留同 ID 的被刪項目及 File，並非草稿還原功能。

權限 resolver 已接入實際伺服器，但只在受信任 `processAccessControl` 的 `draftReviewPolicy:page-v1`、schema 2、primary binding 及可驗主要管理員授權來源一致時生效；無標記維持舊判斷，標記不支援或來源不明則拒絕高階審核／送審／更正，不新增 view/edit/save。所有選擇性身分讀取同步讀取此來源。沒有 initializer、真人授權或真資料切換。缺稽核的真人高階授權仍須另行核定。

本機十三頁 signed owner／fresh-view／跨頁收據檢查及十三組核心送審流程通過；RF HTTP14／UI12／照片6、master 進階11及 account/source policy67 通過。最終來源見證、建置及其餘回歸以固定提交收據為準，不能以先前批次代表本候選。沒有實站或原生瀏覽器驗收。測試選檔曾誤含原生 account password 測試而再遇同一 socket EPERM；已記錄並停止，未換途徑。

公開 create_tree 成功回執後讀回404仍為 UNKNOWN；未重送、未建立遠端commit/ref、未合併或部署。獨立審查仍因原內容安全中止而未完成。切換前仍需完整原資料／待審案件盤點、baseline adoption 及經確認的切換方案；不可把允許捨棄舊工作草稿解讀為刪除待審、已核准歷史、收據或照片。

# 全站各功能頁草稿分界：實作與驗收矩陣

原始基準為 GitHub main `d4ac309fe05c89288af226b52c18161865ccdcb8`，已語意合併 main `021f0f388b16ebcdff0f64ff44039d2ea07f4165`（#99），並在獨立本機相容分支整合 `9fbba823090f03da8385c8d92f5e59293d19d2f1`（Frank 已合併 #100）。保留 #100 的取消背景定時檢查規則及程式；只有 CHANGELOG、SHARED_DRAFT 的並列文件標頭需語意合併。本分支是未啟用的分界 runtime 候選；僅語意整合已記錄的 88a RF domain 相依，沒有整批帶入其他未發布候選。不是全頁拆分已完成，也不是可啟用切換的版本。

## 2026-11-09 主資料進階操作、十三頁合成驗證與 RF 照片結果恢復（未切換）

本批在 e5c3c78 後補主資料 owner Excel 及進階本機操作。AB/C 匯出只帶產品／類別與唯讀已核准線別參考；LINES 一檔保留 AB/C 分區。新格式與舊完整／外部中越文格式可讀；舊 combined catalog 的 lines 不會進入 catalog 草稿。匯入匹配本頁穩定 ID，外來新 ID 重新分配；保留未知原欄位，未支援改寫拒絕。完整新格式保留 omitted/null/空白與原順序，不暗中新增隱含類別。產品規格／單位／越文、類別 rename 同步本頁產品、篩選、依既有最大路線／例外規則整理與順序調整已接。全部先留本機，明確 Save 才沿 owner/CAS 保存；取消／晚到／撤權保留原 File 並阻擋不相符操作。匯入匯出使用該頁 exchange 與原 legacy capability，不借用其他頁的 exchange。

RF 照片 P2 已修候選：原 File 於 Save 前計算 input SHA，送出前保存 origin/sessionStorage 帳號隔離 sent 記錄；同 File 已知成功重用原 photo ID。server 驗原 bytes hash，既有 lossless policy 後以實際 canonical hash 存圖，先記 actor-scoped `routine-fqc/page-uploads/<actor>/<inputHash>` outcome。未知時停 Save，只 GET `/api/routine-fqc/page/photo?uploadId=<原hash>`；404/缺 media/錯回覆均不重 PUT。查證成功才續存；重開執行環境仍讀原 sent journal。已知未開始且無 R2 write attempt 的驗證拒絕才回 `uploadNotStarted:true`，允許修正輸入。原 workflow UNKNOWN/收據不變；不是以 404 當作未執行。此 R2 outcome 是原媒體送出記錄，須與目前／歷史圖及原收據一併保留；不是可刪快取。

依權限工作 ea58111 與 Frank 規則，本人發回不再新增 admin／本人核准確認；仍查發回權限、原因、pending 及版本。本人核准確認與 RF 原 admin gate 保留；新 return receipt 不新增 admin，既有 ledger 的原 caps 不重寫／放寬。共用核心仍記錄 selfReview。十三頁均以實際 signed handler 檢查 owner Begin 或原收據、跨 owner receipt 隔離、即時 view 撤權，並逐 scope 核對共用核心 Save/Submit/本人發回/核准；不代表十三頁所有業務 effects、layout 或原生 UI 都完成。

已核對最新相依：製程 7e409a0（已合 e5）、查看 a1c52dd、權限 ea58111；沒有整批覆蓋其來源。製程交接的 legacyArchive 最後 session/revision fence P2 及新 page approvedOnly/history 協定由查看 owner 修，不由本題另作版本查看。其餘權限 resolved policy／完整整合、真實 baseline adoption 與原樣 DB/R2 還原仍未完成。主資料新操作與照片結果恢復均只有本機合成證據；先前獨審內容安全中止、Chromium EPERM、公開 create_tree UNKNOWN 保留，沒有重試／換路或啟用真資料。

## 2026-11-09 例行 FQC 整頁 runtime 與本機驗收候選

例行頁已接上受儲存 `pageDraftLayout:page-v1` 守門的 `/api/routine-fqc/page`、`routine-fqc:page` 單一 owner，以及明確 Save 才送出本機新增／修改／取消與 File 的頁面。每份文件保留穩定 ID、kind、plan/case/correction links；不建立假的逐文件 flow 或核准案件。一次 Save 固定整頁內容，一次送審固定 changedDocumentIds、原 immutable Save 與 jobs/cases 來源；核准只對該固定變更執行既有業務 effects 一次，與整頁 CAS／原收據同交易。新來源仍須先取得可核准的 baseline；本候選沒有 initializer、資料 adoption 或真資料切換。

既有原 documents/flows/Save/cases/receipts 原樣保留；marker 後舊 writer 拒絕，原收據仍可讀，`/api/routine-fqc?legacyArchive=1` 只提供真正舊已核准文件的原 scope／案件／Save，只讀且不冒充整頁核准。新頁的已核准歷史查看仍交統一查看工作接線；主資料 UI 的匯入匯出／進階整理等價、權限 resolved policy、其餘衝突候選與十三頁整體驗收尚未完成。不能把本機 RF 功能或全頁 owner 盤點稱為全站實站完成。

Save 前重新讀取、比對目前身分／權限／世代／版本，衝突一次選我的或對方，保留無衝突，取消保留文字及原 File；同一被刪結果可沿原 ID 恢復。晚到輸入保留；UNKNOWN 只查原操作收據，不重送。圖片走本頁已驗簽名／限量／權限的既有媒體格式。唯讀收據查詢在 aggregate SHA 驗證後只投影原 ledger，不需目前或歷史內容 body；正常頁回應省略歷史 body，compact wire 保留獨立可修改複本。

本批另採用製程整合 42cdba6 的三行來源權威順序修正及十二組合成測試：先解析核准 page catalogs，再移除私人 workflowScopes，避免錯採過期相容鏡像。沒有整批匯入 25305c1。原三項業務決策均已答；後續順序依 Frank 指示先完成 #102，與 #101／製程整合核對更新，再做其他整合。

十三組整頁 kernel、十四組實際 HTTP（inline／immutable records、隔離 SQLite／R2）與九組真 client／合成 DOM／File 測試已通過；最終固定提交的回歸與建置結果另附 evidence receipt。不是獨立審查或原生／iPhone 驗收。獨審內容安全中止、原生 Chromium OS socket EPERM、舊公開 create_tree 成功回執後讀回 404 的 UNKNOWN 均未重試／換路；未建立遠端 commit 或移動 ref。沒有真資料、真人權限、schema、部署、合併變更。

## 前批歷史紀錄（以下保留當時狀態，以本頁最新段落與矩陣為準）

## Managed layout 邊界與最新並行來源

作者另在 inline／records 自查重現一般 legacy aggregate replacement 可附加新 layout／owner baselines 的缺口。現已把 pageDraftLayout、AB.catalog／C.catalog／LINES active／versions／workflowScopes 視為 server-managed 欄位；一般 shared-state 寫入無論提出或已持有這些欄位皆拒絕，不能以一般帳號的 JSON replacement 啟用／降版。原樣切換仍走另行確認的資料方案，本題未建立自助切換入口。review regressions 增為十組，修正前反例與拒絕無寫入均保留。此項是作者自查，沒有獨審 PASS。

最新衝突候選為 88a4a2c6959dea76acfbaee24c11eb8e20494d5f（tree 6b3c533844ecd3b14fd9d426b533744a0fa82d5e），包含 7ef04ed。本次唯讀核對其 RF domain 24 行 validator 整合、routine UI late ACK 及 PROCESS photo/ordering 改動，沒有整批匯入。此處 master page comparator 僅允許 AB／C／LINES，不能拿 7ef 的舊 PROCESS photo 分支替代 88a 的照片組／別名／排序行為。後續合併須保留 88a 的 per-document atomic localSave、實際晚到輸入與 File／圖片上傳修正，再接本題整頁 owner；版本查看／畫布候選也不由此覆蓋。

## Runtime 初審發現與修正（獨立審查未完成）

972e3a8／ddff7a2 的獨審回報兩個 P2：恢復舊線別時可附帶新工段而未查 create；本頁 baseline 正確時，另一 owner 的 active body 未逐一核對核准來源。已在 inline／records 重現失敗反例，修正為整份復原 subtree 各 ID／原 parent 的歷史來源判別，以及所有 companion 的 approved body／pointer／唯一 ID 解析。合法舊 parent＋child 仍可由 edit 恢復，新 child 仍需 create；unknown reserved ID 不復用。驗證、相容讀取及 public/stage references 均只由驗證後來源組成，不信任過期 compatibility mirror。新增八組來源／復原 review regressions（另加兩組 managed-layout controls），包含無寫入拒絕及合法恢復正控制。

該獨審子工作在完成兩項回報後，被內容安全機制以 possible cybersecurity risk 中止，**沒有完整審查 PASS**。沒有重送／改寫同一審查要求，已查房間近訊息但未取得針對此中止的新使用者指示。後續修正目前是作者自查／合成測試，不以先前 build 或部分審查取代新 tree 複審。原生 Chromium 的 OS socket EPERM 也仍未解；沒有更換 flags／executor 繞過。

既有 test-master-read-projection 在本候選與還原乾淨的 8560869 副本均因 fixture 缺 ProcessAccountTransition 而失敗；沒有修改該 fixture 或放寬產品守門。歷史 #100／事件／例行來源 pins 原值保留，新 test-only exact inverse 只回復本 runtime delta 後驗原歷史來源，還原 bytes 不執行；新增來源順序／快取斷言保留精確 bytes 與順序。

權限工作 0c89b6a／98789f9 的十三頁 fixture 曾核對舊前置介面；本批 RF endpoint 已改為 `/api/routine-fqc/page`，其 registry hash／endpoint fixture 需由權限工作更新，尚未接入其 resolved policy。四項現用權限差距仍不算解決，缺主要管理員明確稽核的真人高階映射仍交 Frank 決定；沒有套用真人帳號／角色資料。版本查看仍由另一工作實作。

## 2026-11-09 主資料 runtime 接線候選（未切換）

新增 `/api/master/pages?scope=AB|C|LINES`，使用既有登入、權限、識別 Begin、原收據、全 shared_state revision CAS 及 immutable-record codec。只有受信任資料中已存在 `pageDraftLayout:page-v1` 與三個已建立的獨立有效 baseline 才接受；查詢／環境變數不會啟用、初始化或轉移資料。目標 versions／workflowScopes keys 是 `AB.catalog`、`C.catalog`、`LINES`，active 同時保留各 owner 內容與僅由核准來源組成的 AB/C 相容讀取。沒有 SQL schema 或新 shared_state key。

catalog writer 只改 products/categoryGroups，引用已核准 LINES；LINES writer 只改 AB/C 分區的 lines/stages，同頁篩選共用一份 Save／pending。完整 topology 沿用既有引用阻擋與 PROCESS 模板鎖，整頁只產生一份 union pinned PROCESS link，核准於同次 CAS 處理，不採用其他頁 working。每次新 Save 固定 owner revision／目前身分／權限；編碼後再查 session。固定案件綁原 immutable Save。舊 combined writer 與 generic master 寫入在 marker 後拒絕，舊 owner 的收據／歷史保持只讀。

新的生效 catalog 回應是 `catalog:{kind:approved-page-composition-v1,sources:{catalog,lines},content}`，來源各自指向原核准版；不是新 combined 核准案件／版本。FQC 可讀新舊兩種協定。一般站台 payload 只帶 approved 相容 active、PROCESS 有效版本及 layout，避免輸出新舊私人草稿／root extensions。

前端候選以各頁 owner 持有本機輸入，明確 Save 才傳送。整組選我的／對方後保留無衝突並續存；取消不傳送、保留文字；對方刪除可在同一原父項下恢復已知原 ID（新 ID 仍需 create）；UNKNOWN 沿原 endpoint 查原操作。新增選用欄位以原父 entity guard 證明不存在，避免 JSON 丟失 undefined。未新增本模組圖片輸入；File／媒體契約仍須在其他頁及例行整頁完成驗收。一般離開模組丟棄未傳送輸入；UNKNOWN markers 保留。

實際 inline／records 路由與合成 DOM＋真 transport 已測；原生 Chromium 啟動遭 OS socket EPERM，未繞過，桌面／390px／觸控／布局未驗收。仍需完整 UI 功能等價（既有匯入匯出、進階整理）、版本查看工作對接、真資料 adoption／原樣 DB/R2 還原與明確切換確認；例行 FQC 仍只有未註冊整頁 Save 核心。本候選不可視為全站拆分完成、Ready、合併或部署許可。

## 獨立公開候選邊界（此前小批，歷史）

相對 #100 的 main，本機候選包含主資料頁面預演／名稱 Save／整頁生命週期、十三頁 owner 合約、切換規劃及例行 FQC 整頁 Save 核心，合計七份定向合成測試已列入 AB/C CI。現用程式差異還包括 master route 的未支援 page marker 拒絕、`scope=LINES` 明確映射 `lines.*`，以及例行 FQC 原結構／retest 驗證抽為同一個純函式供兩種 Save 使用。沒有改帳號或角色權限值，沒有接入新頁面的 UI／master writer／storage/CAS、執行 migration 或啟用拆分；#99 工段及 #100 定時檢查改動保留。

公開 main 已核對，本機相容分支沒有納入其他未發布功能，也沒有匯入舊 243-path／quality／equipment 上傳 payload。既有本機整合歷史沒有整段上傳；遠端 #102 仍是 ee7d4fd，後續公開範圍須按最終來源另核對授權與審查；舊 UNKNOWN 仍保留 UNKNOWN，不能把樹查詢 404 當成未執行證據，也沒有以改用工具、重建連接器或拆舊 payload 的方式接續。草稿 PR 只供審查這個未啟用的小批，三項業務決策與正式資料切換不在其範圍內。

## 逐頁現況

| 真正功能頁 | 現行草稿所有權 | 本批結果／未完成 |
| --- | --- | --- |
| 製程編輯台 | `process:platform` | 已是整頁一份；workspace／類別／工段為內部畫布。未改 runtime，跨畫布 Save 本輪 NOT_RUN |
| AB 產線與類別 | 目前實站 `master:AB`；候選 `master:AB.catalog` | 新入口 writer/CAS/基本 UI 已接，受資料 marker 守門；未真切換，Excel／進階操作已補合成候選；完整 UI／原生驗收未完成 |
| C 產線與類別 | 目前實站 `master:C`；候選 `master:C.catalog` | 同上；不含線別草稿 |
| 線別與工段管理 | 目前實站借用 AB/C；候選單一 `master:LINES` | 完整 topology writer、同 CAS union PROCESS link 與基本 UI 已接；AB/C 是同一 content 分區。Excel／路線整理合成候選已補；未真切換，仍待完整 UI／原生驗收 |
| 流程資料 | `master:PROCESS` | 已獨立；模板、名稱、媒體與設備總表／機器 modal 同頁，不拆成新模組 |
| FQC | `fqc` | 已獨立；錯誤碼／項目／矩陣為內部視角，生命週期本輪 NOT_RUN |
| IQC | `iqc` | 已獨立；零件／項目／供應商等同頁，生命週期本輪 NOT_RUN |
| IPQC A/B | `ipqc-ab:module`，另保留 legacy 群組相容入口 | 現用整模組；A/B／群組／工段不拆，生命週期本輪 NOT_RUN |
| IPQC C | `ipqc-c` | 已獨立，生命週期本輪 NOT_RUN |
| BOM | `bom` | 已獨立；樹、根件、匯入不是新模組，生命週期本輪 NOT_RUN |
| 模具 | `tooling` | 已獨立；內部目錄／表單不拆，生命週期本輪 NOT_RUN |
| 檢具與測試設備 | `routine-equipment` | 已獨立；跨品質替換另有交易契約，生命週期本輪 NOT_RUN |
| 例行 FQC | 現行 `routine-fqc:<documentId>`；目標 `routine-fqc:page` | 整頁 runtime／建立取消更正／固定送審核准 effects／HTTP codec-CAS／UI-File／原收據及舊 writer fence 已接，受資料 marker 守門；尚未切換，查看工作與原生驗收待整合 |
| 問題回報 | 帳號私人 IndexedDB drafts | 私人回報，不納入多人業務草稿 |
| 帳號／權限、例行報告及建置中頁面 | 即時管理或 placeholder | 不因有表單就建立業務草稿 |

以上「已獨立」只表示程式中的 scope 分離，不代表存取／撤回／權限／多人整組選擇均已驗收。全站衝突、背景輪詢、歷史與權限另有並行候選；本批不以其舊測試替代最終合樹驗收。

定位證據：[主資料實際分頁及 line-admin 借用](../../public/process/master-data.js)、[PROCESS 設備總表與 modal](../../public/process/process-equipment.js)、[主資料 adapter](../../lib/master-workflow.ts)、[製程 scope](../../lib/process-authoring-workflow.ts)、[IPQC AB module 路由](../../app/api/ipqc-ab/workflow/route.ts)、[例行文件](../../lib/routine-fqc.ts)、[權限 cell catalog](../../public/process/access-policy.mjs)。其他模組 scope 見 lib/*-workflow.ts 與 app/api 對應路由。

## 已實作的小批

[master-page-boundary.ts](../../lib/master-page-boundary.ts) 取代「四份 AB.catalog／AB.lines／C.catalog／C.lines 就等於四個頁面」的推定，產生三個新所有權投影：AB catalog、C catalog、單一線別工段頁。PROCESS 原樣保留。舊 split-v1 與 line reducer 仍是未啟用相容證據，沒有冒充新整頁 writer。

預演必須固定同一來源 revision、完整 root SHA-256 與 AB/C/PROCESS 已核准版本向量。任何完整 root 變化（即使只有私有收據改動）、版本不符或尚未 hydrate 的歷史／working／saved／案件／PROCESS／extension body 均拒絕。取得來源後先複製再雜湊，防止 await 期間混入另一版本。

新文件只投影已核准內容；全部原 root 另保留於 `retainedSource`，含 working、saved、pending、歷史、收據、ID、照片引用與未知欄位，不改 status、不重建任何 Save／案件／核准人。這只是記憶體保全證明，**不是已驗證的 DB/R2／媒體備份**，不得作公共 API 回傳或提交真資料到 Git。

額外 Save 邊界驗證限制 AB/C catalog 只能寫自己的集合；LINES 的單次 ordered batch 可包含 AB/C 工段，但不能含 products/categoryGroups／PROCESS、整個 partition 或集合覆蓋。它不取代權限、真實引用、guards、CAS、世代、pending 及原操作收據驗證。

實際 HTTP 前置守門現在拒絕任何尚未支援的 `page` marker，防止新 caller 被忽略標記後落入舊 combined AB/C writer。新 preview 沒有 HTTP、storage、環境開關或啟用 writer；舊 route 其餘行為保留。

等待業務決定期間，另增 [master-page-name-save.ts](../../lib/master-page-name-save.ts)：只處理已存在線別／工段的名稱，整頁 ordered Save 在記憶體完成後只回傳一個 working＋saved＋sequence＋receipt 結果。後批 guard／validator 或權限失敗不改來源；沿用 shared kernel 的世代、pending、原 receipt 身分與精確重播。同次暫改又復原的欄位保留原貢獻者，不把中間態的修改者寫進最終 Save；其他真正修改仍歸屬實際操作者。只接受 `master:LINES` 所有權及完整 owned history，不建立初始草稿、不推定 ACL cell、不接 HTTP／storage/CAS；新增刪除、code／路線／結構與 PROCESS link 均不由此元件處理。未決的舊資料切換和分區權限沒有被預設或繞過。

測試以兩個合成編輯者及另一審核者呼叫真實 Save 元件與 shared kernel，驗證單一完整案件、整頁鎖、撤回／發回／再送、核准、原收據、序列化重開及非衝突保留；UI 全組選擇、真正 Begin、HTTP 身分驗證、CAS、備份媒體還原仍未測。測試中的 context 為合成授權，不代表已採納 `lines.*`／AB/C 可見性政策。

獨審補充後，名稱元件的 patch／guard 實體 selector 僅接受純 `{id:string}`（非空 ID），拒絕額外鍵、陣列或缺少字串 ID 的 selector，避免同一實體的不同外觀被誤當不同 contributor intent。拒絕發生在 staging 前，不修改原命令或 fingerprint；共用 kernel 與既有 writer 的相容格式不變。

## #100 後續本機生命週期增量

[master-line-page-workflow.ts](../../lib/master-line-page-workflow.ts) 僅接受已建立的單一 `master:LINES` approved control，不從舊 AB/C root 生成核准版，也不決定舊 pending/working cutoff。識別式 Begin 固定 basis／原 owner 收據；一份 AB/C content 共用 working/saved/case/generation。既有名稱 Save 沿用已複審的 selector admission；送審、撤回、發回、核准沿用 shared kernel 並產生同一頁的 NumericVersion 投影。開始修改／權限／來源及後批驗證失敗均不得改來源。

current-approved 引用只回傳固定版本的副本，不採用 working/saved/pending；版本改變或權限失效拒絕。這是後續 catalog writer 的依賴元件，尚未讓真實 AB/C 頁面改讀它。所有 control／版本／原收據要完整 hydrate；saved、pending、draft 投影不一致及重複實體識別拒絕，不自動修補。

18 組合成契約涵蓋完整既有名稱生命週期、雙人非衝突／衝突、全頁 pending lock、終止後原收據重播、no-change／確認版本、撤權、錯誤引用、序列化重開與媒體保留。context callbacks 是未來同一交易提供的完整頁面權限／引用驗證，沒有替使用者選定 AB/C 分區規則。新增／刪除／改 code、PROCESS link planner、歷史版 UI、codec／CAS、HTTP、舊 caller fence、資料 adoption 與實站仍未完成。新 Apply／restore 被拒絕；舊收據仍在原 owner 保留，不由此元件轉換或重送。

新元件初審在 13c6e02 重現 1 個 P2：pending case 與 NumericVersion 同向漂移時，尚未綁定原 immutable Save。已補所有案件 savedId／content 及 pending current saved／working 的一致性 admission，含待審及歷史的負控制；修正前會接受未存內容，修正後拒絕且保留來源。定向複審綁定其實際新 tree 回執；本增量未跑 build/browser，dc5bc6a 的舊複審只適用其原 tree。此處沒有新增備份診斷程式，也沒有執行真資料遷移、啟用或上傳。

## 資料安全演練與重大發現

[master-page-retention-snapshot.test.mjs](../../tests/master-page-retention-snapshot.test.mjs) 使用既有 record encoder／verifiedRecordRestore、分發快照匯出及 isolated-local restore，全部為記憶體 fake DB/R2。8 組測試涵蓋原樣業務 root／待審／原收據保留、尚未 hydrate 歷史與 partial read 拒絕、歷史 body／原 archival string 缺損或破壞、歷史／待審專用媒體缺失、來源改版、傳輸毀損及非空目標保護。分發演練另逐 byte 核對四份合成媒體（含跨 chunk 的待審圖片）；source fake DB/R2 沒有被 exporter 寫入，目標只寫 isolated memory bindings。

**已重現用途不相容：去機密分發快照不是原樣 cutoff 還原備份。** 現有 `snapshot-redaction.mjs` 的 `cleanJson` 會遞迴解析 JSON 外觀的字串，再去機密並 JSON.stringify。合法的自由文字／名稱若包含帶空白或 `1e2` 的 JSON 字串，分發重開後會改文字；原操作 fingerprint 字串若含該值也一起改變。合成資料中完整 root digest 與 fingerprint digest 均不同，原請求重播得到 `OPERATION_ID_REUSED`。穩定 ID、pendingId、版本數及媒體仍可存在，不能以它們判定原收據相容。這是目前分發 port 的已確認限制，沒有認定真實資料已受影響，也沒有在本題擅改全域 scrubber。

現有頁面預演使用原來源 pins 時會以 `MASTER_PAGE_SOURCE_CHANGED` 擋住這個分發重開結果；原樣 record restore 路徑則保留文字及 fingerprint，原請求可精確重播。原樣還原依下方精簡方案處理，不能以去機密分發快照代替。

## 精簡原樣保留／還原方案（文件準備，未執行真資料操作）

依 Frank 最新要求，**不新增備份診斷程式、排程、服務或維護入口**；本次只整理既有能力與已取得的合成證據，也不修改既有備份／redaction 程式。沿用受授權的維護流程時，最少保留以下四類，不額外複製每份畫布或每張案件成另一套業務資料：

| 保留內容 | 最小可驗要求 |
| --- | --- |
| 一致的完整 DB 原樣快照 | 含 schema、業務資料、working/saved/pending/active/history、receipts、sequences/generation、帳號／角色關聯及適用的撤銷／操作紀錄；不只摘出目前已核准 master root 或分發 port 的三張表 |
| 完整 R2／媒體來源閉包 | 保存每個被目前或歷史／待審引用的 immutable body、allocation index、`legacySources` 原字串及媒體 bytes；沿用原 key／ID／路徑。未分類物件先保留，不憑名稱當快取刪除 |
| 程式與版本識別 | 固定相容程式 commit、schema、全域 revision、master root digest 與 AB/C/PROCESS approved vector；必要的未提交成果另保全。這些 pins 要在整理／redaction 前從原來源取得，不能由轉換包自我產生 |
| 一份受控核對紀錄 | 記錄原樣備份及媒體的大小／SHA-256、物件／案件／版本數、原 receipt fingerprint 摘要，以及適用帳號／權限差異；只公開摘要，不把真實 payload、驗證資料或解密材料提交 GitHub |

只用無損壓縮或保留同一內容雜湊物件一次來減少重複，不能刪除看似相同但有不同原字串的 `legacySources`、舊收據或歷史。可重建的 build、node_modules、cache、測試輸出和診斷日誌不列為業務還原內容；沒有新增清理或刪除操作。

還原演練沿用既有受控流程，在**全新空白隔離目標**依序完成：

1. 固定原來源與獨立 pins，核對來源沒有改版；取得完整原樣副本及必要既有解密存取，不啟動新的備份服務或建立新憑證。
2. 先驗原始檔案／物件 hash 與 DB 完整性，再還原完整 DB 和 R2／媒體；保留原 owner、ID、路徑、status、世代及 receipt，過程不做 Begin、Save、Submit 或自動採用新 scope。
3. 依原來源逐項讀回：全部草稿／待審／歷史內容、案件與版本數、關聯、原文字／fingerprint、媒體 bytes 及權限。原收據用原 owner 的唯讀查詢核對，不向真系統重送原 POST；合成測試中的 kernel replay 不是重新執行真實寫入的授權。
4. 所有必要比較 PASS 才標記「該隔離還原已驗證」。缺 body／媒體、hash 或原 receipt 不符、來源改版、目標非空或還原不完整時保留副本與證據，不切換。正式拆分另受既有三項決策與完整 adapter 驗收限制。

切換前的原樣備份不能直接蓋回切換後的新寫入；若正式切換後已有新資料，先保全該狀態並另定前進修復／合併方案。本文件不授權覆寫現場或自動回退。

| 既有能力／證據 | 本方案可用範圍與目前結果 |
| --- | --- |
| `state-records-restore.ts`／現有 8 組合成演練 | PASS：驗全部 reachable record body／原 archival string，缺損拒絕；完整 hydrate 後保留原文字、pending、receipt。它本身不建立完整 DB／媒體備份 |
| 同一合成快照演練 | PASS：四份媒體 bytes、歷史／待審專用媒體缺失、來源改版、毀損傳輸和非空目標保護；並重現分發快照用途不相容。全部為 fake bindings，沒有真資料 |
| [既有 local ZIP 工具](../../lib/local-backup.mjs)／[CLI](../../scripts/backup-cli.mjs) | 是本機 `.wrangler`／SQLite／R2 目錄工具，會寫設定／稽核並有 retention 行為；這次不執行，不能直接套成雲端站的原樣備份命令。沒有在 Linux 上重跑其 Windows `tar.exe` 測試 |
| [既有部署／快照流程](../../DEPLOYMENT.md) | 去機密分發 port 另有用途；分頁資料查詢不是完整備份。現有能力不足以宣稱選定雲端站的完整原樣 DB/R2 還原已驗收 |

本次方案已可審查，重用 6645b42 的合成證據且未修改其測試或產品來源；不重複跑沒有受影響的 suite。**真實完整 DB/R2／媒體原樣備份與還原仍 NOT_RUN**，沒有執行 cutoff／adoption、改權限或啟用拆分。若現有選定環境沒有受授權的完整原樣取得／還原能力，就停在這個邊界回報；本題不另造備份診斷程式來補位。

## 三項已決政策與仍需保護的資料

使用者已明確選擇：舊未核准草稿可放棄、可送包含 A/B 的整份已存草稿、例行 FQC 全頁一份；並要求最終 #102 涵蓋所有草稿功能頁。這三項不是待答問題。線別頁使用自己的 `lines.*`，A/B 是同頁資料，不自動替帳號加權限。

「草稿可不要」不擴大為刪除待審案件、歷史／immutable Save、原 receipts、異常案件或媒體。未註冊的 `draft-page-cutover.ts` 固定完整來源 revision、master digest／approved vector 及例行 FQC 原字串 digest；待審（含 orphan pointer／舊 pending version）、來源缺損或 approved case 與原 Save 不符時整批拒絕，原資料不動。新的投影只引用既有已核准來源，沒有生成核准人、核准案件或新 workflow。PROCESS 原有草稿和其他九個已獨立模組不列為此次可放棄的資料。

唯讀實站資料檢視的 shared_state 欄位遭截斷，**未能確認完整待審／已核准版本數或 cutoff 可執行**。本機僅有合成完整來源驗證；不能把不完整讀取當作「沒有待審」。正式切換須先取得可完整核對的唯讀狀態、驗證原樣還原與全部 writer／UI 接線，再由使用者確認具體切換；本次不執行。

## 十三頁共同合約與例行 FQC 存取核心

`draft-page-boundaries.ts` 集中列出十三個真正頁面的 owner、endpoint、permission module 與現況遷移標記。`test-draft-page-boundaries.cjs` 直接載入現有 adapters／IPQC-C Begin／workflowAccess 核對 scope、storage key、篩選不變 owner、交叉 owner 拒絕及 LINES 不落入 AB/C／broad-data 權限。這是 owner／權限合約，不是十三頁 UI 或生命週期驗收。IPQC AB 群組 legacy Save／Submit 已拒絕，舊 Apply／案件／收據入口保留相容；私人 feedback 維持帳號隔離，版本確認平台也不另建草稿。

`routine-fqc-page-save.ts` 提供未註冊的單一 `routine-fqc:page` 既有文件 Save：多文件 ordered guarded edits 在同次記憶體暫存，只有一份 working／Save／revision／sequence／原 receipt。無衝突欄位保留，後批驗證／權限失敗不改任何文件或業務 domain；改回原值保留原貢獻者。原來源／retest 規則由 `routine-fqc.ts` 的同一純驗證函式執行，沒有模擬逐文件 Apply、產生逐文件收據或觸發核准副作用。14 組契約涵蓋多文件原子性、兩人／篩選、pending lock、世代／重播、不可變來源／正式文件／retest／照片驗證失敗及完整來源需求。

**仍未完成的例行整頁工作：** 文件新建／刪除／更正的整頁暫存、新版 Begin／固定整頁案件、核准副作用只對該固定差異執行一次、舊操作 fence／原收據查詢、媒體驗證、codec／CAS、toolbar／比較／review／歷史與正式文件輸出。現行 UI 仍逐文件；不能把此核心稱為全頁已接上。

## 本輪獨審修正與接線要求

獨審在 ff75a5c／e53b007 重現兩個 P2，修正前負控制已留存：整頁 Save 只驗改動文件，可能把另一張來源過期的文件一同保存；切換規劃未拒絕重複文件、案件或 immutable Save ID。現已在新 Save（包括零批次）之前驗整份 working 的原引用與結構，原操作收據重播先行且不受後來來源改版影響；未改動的正式／已取消文件仍可保留。規劃器拒絕不合法／重複 owner ID，避免以 find 任選其中一筆。14 組整頁 Save、10 組切換契約涵蓋這些反例；獨立複審以後續精確 tree 為準。ff75a5c 的乾淨 clone source check／受控 build 通過，只適用該修正前來源，不充當新 tree 的 build 證據。

先前 AB 整合中可確認的草稿要求納入本題後續接線驗收：修改與 File 先留本機，明確 Save 才保存與上傳圖片；衝突一次選我的／對方、保留無衝突並接續同次 Save；對方刪除而選我的時恢復同一項；取消保留原文字與 File；Save 重查身分、權限與版本，UNKNOWN 查原收據且防重送；他人先開草稿後可重新比較續存。這些是跨頁交付條件，目前純核心沒有 File／UI 行為，不宣稱已驗收；先核對既有 7ef04ed 行為再語意接入，舊 243-path 清單不完整且操作 UNKNOWN，不猜內容、不重送。

已核准版本查看統一由另一項工作負責；本題只提供 owner/scope 與保存／送審資料介面依賴，不重複修改其版本查看元件。需要該工作配合 LINES、AB/C catalog、routine-fqc:page 新 scope；其尚未整合項與 Canvas 失敗仍須各自處理。

## 例行 FQC 整頁接線的 domain 函式抽取（未啟用整頁）

最新相依核對已將 88a 的 RF domain 逐文件 atomic local Save 語意合入本分支，保留本題 metadata／explicit-content 抽取。新 Save 只在 request memory 套 guard edits，再產生一次原 Save／receipt／revision；原 receipt 重播仍查 edit，缺版本／錯 guard／撤權不變更 domain，改回既有 saved body 仍正確增加一次 working revision。新增兩組實際 kernel 整合負例，合計九組 helper 契約。這只整合 lib/routine-fqc.ts 的已知相依；88a 的 UI late ACK／PROCESS／IQC／FQC／tooling 等仍未整批納入，也不是整頁 RF owner。

另更新 batch3 的 test-only successor 接線：先按新全來源精確 hash 還原，再驗原 unchanged historical pin。原歷史 hashes／before bytes 不改；PROCESS scope mutation 對目前六個 master owner 的真實 span 執行，CAS／session／Begin／create 等負例全留。初次 100/102 與後續修正紀錄均保留，不能把第一次紅燈記成通過。


從現用 routine-fqc.ts 抽出 buildRoutineDocumentDraft（metadata/content，沒有 flow）、validateRoutineCaseLink、routineDocumentReviewIssues、以及 applyRoutineDocumentApprovalEffects（明確固定 Content 與 staged business domain）。原 addDocument 仍只在 legacy dispatch 建立逐文件 flow；原 approve dispatch 傳入 kernel 已核准的 active.content。原結構／retest／提交 issues 保留，同一原 outer receipt replay 不重跑 effects。新增七組 DB/R2 零讀寫契約，含無 fake flow 的 plan/report/disposal/correction business effects、來源與 owner 複本、requiredSamples、錯誤 links 無 domain 變更，以及真 legacy create/Apply/Save/Submit/Approve/replay。

這些 helper 不自行驗登入／權限、不作 CAS／receipt／revision、不提供 idempotence，也不是新 page approval。後續整頁 orchestrator 必須先核准固定 Save 案件，從 server 推導 changedDocumentIds 及依賴 pins，只對該固定差異執行一次，所有 domain/pageflow/receipt 同 CAS。不能循環呼叫 legacy executeRoutine 製造逐文件 Save/approval。

尚未完成：metadata-only effective document resolver、穩定新文件建立／取消／更正／followup 暫存、整頁 Begin/Submit/Withdraw/Review、codec/CAS/舊 writer fence、全部本次媒體與 File、整頁 toolbar 及與88a late ACK／衝突的完整接線。現用 routine 仍逐文件，不能說例行整頁草稿已完成。原始真人資料、待審與歷史未操作。

本次 helper 抽取：七組新契約及既有 Routine 254 項檢查通過，整頁既有文件 Save core 的 14 組仍通過；lint、TypeScript、diff 檢查通過。這些數字不包含原生瀏覽器或完整整頁流程驗收。

版本查看另一路已提供 2e4d20f4560fe1480576680d07edcf903b67fef9（tree 1c423112e0e6dc66e22b7f5b959a7565640466ac），處理新 AB／C／LINES 核准歷史 422。此處只記錄依賴，未匯入、覆蓋或宣稱與 88a4a2c 衝突候選及 Routine 整頁流程已整合；版本查看由原工作負責。

## 與全站衝突候選的協調

已唯讀核對另一工作提供的 `7ef04ed741249816aac2f1336cf15f888ff92fa0`（tree `336500430fbccb61dd7f42afef5704a38f284c6c`），未整批匯入或上傳。其 master bridge／master-data、routine-fqc UI、routine-fqc domain、versioned workflow 與本題後續接線直接相依；其中 routine 已有逐文件 localSave 原子化，仍不是整頁 owner。此處的 `validateRoutineContentEdit` 抽取需在該候選上語意合併，保留它的 localSave 與原 receipt 修正，不能用本分支整檔蓋回。文件／CI 也須保留雙方新段落；實際最終合樹另驗。已在記憶體語意組合該 routine module 與本純驗證抽取，13 組整頁 Save 契約通過且保留其 localSave 分支；沒有產生合併 tree 或改對方候選。後續版本查看候選 e3d92846 仍未發布且有既知 Canvas 測試失敗／80745895 未整合，須另核對其 master/routine/history UI 相依，不能把頁面數等同 #102 已整合。

## 後續接線與整合順序

- 固定實際來源、完整 DB/R2／媒體可還原備份與 cutoff，隔離演練。將 legacy archive 保持原 owner 及 receipt 查詢，不以新 scope 的 404 推定未寫入。
- 單一 owner 接 storage codec／讀取投影／CAS 與 writer inventory，原子接線 AB/C catalog、LINES、PROCESS link；舊 client 明確拒絕寫入新所有權。不可只改 URL 或打開 flag。
- 再接 line-admin／AB／C client、主資料審核平台、withdraw/history/readonly approved selector、引用與 runtime catalog；AB/C 只讀已核准 LINES。pending 及 PROCESS 關聯需同交易保護。
- 本批共用衝突點：`master-document-boundary.ts`、`abc-local-save.yml`、SHARED_DRAFT、WHOLE_MODULE_DRAFT、MASTER_DATA／DATA_MODEL、HANDOFF／CHANGELOG。與全站候選及 #99 語意合併；不要整檔覆蓋 master-shared-client、master-workflow、app.js 或 process-stage-link。
- 在最終合樹上以兩身分測各頁完整生命週期、視角切換保留、跨畫布不覆蓋、整組 mine/peer/cancel、選後再換版、撤權、UNKNOWN、不重送、備份還原與 linked PROCESS。未完成前不稱全頁拆分完成。

## 驗證與交付狀態

實際命令及最終輸出保留在工作區 `module-draft-boundary-evidence-20261109/`，摘要隨本次交付提供。新測試已加入 AB C local Save CI，沒有放寬既有測試。測試重用工作區既有依賴，沒有安裝、seed 或啟動開發服務。

- PASS：新頁面邊界／純預演的 11 組合成契約；實際 GET/POST 的 reserved page/split admission，DB/R2 零讀寫。
- PASS：單一 LINES 名稱 Save／真實 shared kernel 17 組合成契約，DB/R2 零讀寫；補上「暫改再改回」的貢獻者負控制、混合真修改及線別／工段／guard selector alias 反例。修正前會留下假貢獻者或接受 alias，修正後保留原歸屬並在 staging 前拒絕非純 selector；它不是完整新頁面 adapter 的生命週期驗收。
- PASS：資料保留／快照用途分界 8 組合成演練，含上述已重現的分發 port 限制及 cutoff 安全拒絕。合成目標 R2/DB 寫入不等於真實持久資料寫入。
- PASS：既有 document boundary 13 組、未啟用 line reducer 42 組、master workflow 及 stage link 8 組定向回歸。Line reducer 仍是舊 AB.lines/C.lines 隔離契約，不能算作新 LINES 的生命週期驗收。
- PASS：全專案 `npm run lint -- --format unix`、`tsc --noEmit --incremental false`、`git diff --check`。最初的型別窄化錯誤已修復，保留最初與最終日誌。
- PASS：首次合併 #99 後，在獨立乾淨 clone 重新執行當時的 11／14／8 組契約、document boundary、line reducer、master workflow、20 項 stage catalog、stage link、lines API 及 307 項 legacy bridge／Begin／permission／receipt 回歸。來源邊界、全專案 lint、型別與受控 build 也通過；沿用同版本既有安裝依賴，沒有重新安裝或改 build guard。後續未啟用名稱元件的貢獻者修正採 15 組及 lint／型別定向驗證；其餘實際 UI／API／writer／kernel 未變，既有結果按範圍保留，遠端 CI 綁定各自 head。
- NOT_RUN：新所有權 storage／CAS／HTTP／UI 全生命週期、雙身分、正式帳號、真資料遷移與備份還原、原生瀏覽器／手機／IME、Cloudflare 實站。
- NOT_RUN：新獨立候選的遠端 CI／原生瀏覽器；後續接線後須重新驗證真正最終程式。本機 build 不代表正式站或全部瀏覽器驗收。
- GitHub：本批只準備獨立草稿 PR，實際上傳／PR 狀態以遠端回執為準；不宣稱已合併或部署。舊 243-path create_tree UNKNOWN 與先前檢具 create_tree 拒絕保持原狀，本批沒有重送舊 payload、拆包接續或改用遠端路徑繞過。

沒有 schema／正式資料變更，沒有修改帳號／角色 cell，也沒有啟動或重連 C2C 連接器。

## 審查與其他 PR 的相依

首次讀回 #102 的 head `b172aaf53e6c2da6f9c5b1a6b331d15944340c03`：AB C local Save 與 PROCESS local Save 通過，Local safety 尚在執行；該結果不能冒充後續 head 的結果。當時沒有 GitHub review 或 comment。第一個貢獻者問題由作者自查重現並補回歸，不當作獨立審查通過。

隨後另一位審查者獨立核對 head `ee7d4fdc750ab5227f25559f52c9edac62b09086`／tree `fb3d634de91cfbfe52de9952bae0f22711e0a2d9`，實跑相關合成／lint／型別檢查，並以純記憶體案例重現一個 P2：額外 selector 鍵可把同一欄位分為不同 intents，繞過 reverted contributor 修正。此問題限未接線元件；已補 canonical selector admission 與 17 組回歸，保留修正前負控制。複審結果綁定其實際 tree 回執；獨立 Codex 審查不代替 Frank 的架構／資料／權限合併決定或 GitHub 人員審核。

| 對照 PR／本輪 head | 與 #102 的直接重疊 | 整合準備 |
| --- | --- | --- |
| #100，已由 Frank 合併為 main `9fbba823090f03da8385c8d92f5e59293d19d2f1` | CHANGELOG、SHARED_DRAFT | 已在本機相容分支保留兩者段落；#100 程式及測試不作變更。沒有現用程式檔案重疊，也沒有啟用新頁面元件的依賴 |
| #101 `8f1f24321764d7aaa51941bce8c48b2b6634ac6d` | CHANGELOG、HANDOFF | 畫布總數修正與本批守門／未啟用元件分開；文件標頭需語意合併 |
| #88 `f0e9ae37731411801fda72c2e8843d30e467d091` | CHANGELOG、HANDOFF | 沒有本批 runtime 依賴；#88 自身舊基準與 IQC 驗收由其 owner 另行確認 |

除 #100 已本機整合外，#101／#88 仍是指定 head 的檔案／來源分析，尚未合入；不以文件重疊分析代替完整合樹驗收，也不要求先合併 #102 才能處理其他批。未發布的全站整組衝突、權限與版本查看候選仍須在真正最終來源另驗，不以這張表推定相容。

本機已複審的 `dc5bc6a`／tree `e80d87a` 保留原提交；上述 #100 相容整合是後續來源，須另綁定驗證結果，不能沿用舊複審作完整整合背書。遠端 #102 仍以實際回執為準；先前目的地授權拒絕未重試，這次沒有上傳、合併或部署。
