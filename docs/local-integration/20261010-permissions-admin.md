## 2026-10-14 3035剩餘未同步輸入恢復：PASS，已修自動登入入口

使用者直接要求續完剩餘恢復驗收。舊tab已關閉，不能憑新頁推定原輸入可取回；另從原純合成rev5唯讀建立`process-recovery-20261014-rCjLkV`（6 QA帳號／1 QA案件／24私有檔），未重做Main備份還原或原功能suite。原3035 PID25824經PID／精確建立時間／命令／root／config／wrapper／listener核對後才停止，舊X67fxq保持原rev6及收據；新PID21152使用同一loopback3035，未新增埠或停止其他程序。[副本](../../Temp/recovery-fixture-20261014.json)、[切換](../../Temp/recovery-server-start-20261014.json)。

以正常frank登入及既有Send建立一次恢復驗收起點：真後端200/rev6及正確digest之後才丟ACK。未重做舊改回baseline測試。正常登出會先明確flush；唯一重試409後才出原生confirm，第一次立即查詢null因async尚未結束，實體讀回409後fresh getJsDialog為confirm，代理只對當次真物件accept，未換runtime／盲按／繞原生控制。確認後按帳號quarantine並真正同tab reload，登入manager只有自己的選單、沒有frank恢復入口；再frank正常登入，實際UI下載284 bytes，actorId=frank／baseRevision5／baseline原B線101CTP007／desired空ABC完整。[分項收據](../../Temp/recovery-complete-20261014.json)。

新FAIL：此時正常reload自動恢復frank，紀錄仍在但下載入口消失，因原UI只在platformLogin建立button。`data-safety-ui.js`改為身分套用、sync status、語言事件共同更新入口，下載當下重核currentUser、sync identity及recovery actor三者；舊按鈕不跨帳號匯出，不改queue／flush／CAS或保全格式。中越各自顯示，越文短標籤`Tải bản phục hồi`、完整title保留；`data-safety.css`只給此action44px及不換行，index更新兩個資產版本。修正後實際自動reload直接顯示按鈕，再下載與前檔SHA `e26f2f773cdf9b048a56a3c2e438c5e090b259b43c46c097f57cb436cd93d97c`完全相同。修前／修後DOM及像素在`Temp/recovery-ui-20261014/`；資料不自動回填或補送。

新增production-handler 5項定向PASS：自動身分恢復、stale按鈕跨actor、失敗後即出入口、單一語言更新、錯owner拒絕且0network；首次test缺normalizePlatformUser stub修harness，未改產品遷就。必要語法／限定diff檢查PASS。桌面1366×900與手機390×844的ZH／VI按鈕各單行且44px、在視窗內，Tab焦點可達；只是viewport模擬非實體手機。[UI數值](../../Temp/recovery-ui-20261014/layout-metrics.json)。最後06:53:25Z實體row SHA `8a0d965b…3c6b5d`、rev6／history4、POST仍[200,409]／1commit，重開、切換、下載均無自動重播。[最後讀回](../../Temp/recovery-state-download-final-20261014.json)。

本次剩餘恢復驗收完成；全站／V3 Save未知快照、跨機真人／實體IME／CWV與舊lint仍不宣稱完成。現有best-effort sessionStorage只屬本tab，關閉前應下載；沒有增加跨關閉tab持久恢復或無確認自動套用功能。未將原使用者關閉的tab稱為已恢復，亦不稱直接dirty-page beforeunload自動通過。本次無schema／持久欄位／登入憑證變更，Main3000及其他資料／服務不動；最新封存與build以[交付指標](../../Temp/current-merged-delivery-20261014.json)為準，1453/923fd舊包保留不回填。

## 較早紀錄：2026-10-14 真HTTP／瀏覽器失ACK，原tab關閉時recovery未驗

本階段按要求補真HTTP與官方CUA/IAB專用tab，不把先前程式包閉合當成完整隔離驗收。升級後官方工具實際可用，3035開頁與正常六合成frank登入沒有政策拒絕；CIM在預設shell讀取不可得，經批准的唯讀escalated檢查確認3000/3035/3040/3050無listener，未kill其他程序。從原u8GO0S rev5另建`process-http-fault-20261014-X67fxq`，只複製24份私有合成檔／169,527,864 bytes及最新1453的1357來源；在新副本讀回6QA帳號、1件QA案件、原rev5，DB/R2及config/hosting綁定正確，原來源未開SQLite且24檔未變。[副本準備](../../Temp/http-fault-fixture-20261014.json)。

新私有wrapper僅對frank、baseRevision5、單一dispatchBoard清空請求，在真正app/api/shared-state已回200/revision6及正確SHA收據後，才一次性destroy socket；沒有模擬後端或替換UI。原發送按鈕真實觸發後，瀏覽器保留未使用選擇、無成功提示而顯示儲存未確認；改回原101CTP007再按同一按鈕，HTTP409／衝突提示，選擇仍保留。實體row SHA`af5dca77…39785d`、revision6、空B線、4歷史不變，只有1筆成功commit及1筆明確409重試，05:03:23至05:09:21沒有背景POST重播。[真瀏覽器分項與阻點](../../Temp/http-fault-browser-20261014.json)、[最後實體讀回](../../Temp/http-fault-state-final-20261014.json)。

直接重開尚未通過：原官方tab.reload返回但沒有新bootstrap GET，getJsDialog=null；沒有可操作的離開確認物件，也未推定為URL政策拒絕。之後使用者表示已關閉原tab，fresh inventory為空，依直接指示「你自己再開吧」在同一IAB另開可見專用3035，正常載入QA synthetic primary／ADMIN與B線0/3，account menu沒有可見的未同步下載入口。原tab已關閉，不能由新頁無入口推論原輸入保留或丟失，更不能算同tab reload recovery PASS。未換runtime/CDP/native繞過、未重試原失敗reload方法；沒有重新送出、切換帳號或重建fixture。新頁後06:17:04Z實體rev6／同row SHA／POST仍[200,409]／唯一成功commit，只有「新頁未自動重播」分項PASS。[重開後實體讀回](../../Temp/http-fault-state-after-reload-20261014.json)、`Temp/http-fault-ui-20261014/reopened-tab.png`。同tab recovery為NOT_AVAILABLE（原頁關閉及先前支持工具無可處理離開提示），實際跨actor transition仍NOT_RUN；完整隔離驗收未完成。PID25824及新tab留作handoff，日常3000及其他fixture不動。

單B線預設A的範圍：PROCESS_WORKFLOW.md:27承諾核准版／權限／適用路線的下游驗收，PROCESS_EDITOR.md:77不重設播放發送介面；已查本輪spec／03:13 owner報告未找到自動初選B修復承諾，不能推論全部人類歷史從未承諾。原報告只在正常選B後支持rev5/player PASS，該已知限制未修，不由本次queue改動造成。

本段是1453/923fd程式封存後的驗收進度，不改產品／重建ZIP或build；既有FAIL、22功能與3+4/15封裝檢查不重跑。最新版資料模型沒有新欄位，真Main完整495副本及原合成rev5未寫；V3 Save未知快照、手機／跨機／CWV及既有lint仍保留原界線。

## 2026-10-14 未知儲存結果的直接補驗與最小修正

本階段只補升級後續接所指定的未知收據缺口，不重跑原22項功能／rev5 GUI、備份、還原或其他模組。先以03:13候選`30151ca4…e33ccc0`的actual shared-state／shared-draft-client／dispatch handler配記憶體storage與假server回應，7個直接情境PASS：server已commit但ACK遺失，保留pending與recovery、不報成功、不背景重送；明確重試依CAS保守拒絕而無第二次commit；獨立workflow的operationId查詢只解決自己的未知操作，不清另一條shared-state pending。[原候選直接證據](../../Temp/unknown-receipt-direct-20261014.json)。這不是V3 Save未知快照、真網路故障或browser故障注入驗收。

新增「未知結果後把產品改回舊baseline」的直接邊界先FAIL：server仍QA-P，desired空清單，dirty卻歸零並toast已發送0／render。[失敗保留](../../Temp/unknown-receipt-revert-before-20261014.json)。只修shared-state.queue的未變更清除條件：paused或blocked時，即使desired等於舊confirmed baseline，也保留待確認鍵；不改CAS／actor／in-flight／伺服器校驗，不刪recovery，不加入自動重送。資產版本`20261014-uncertain-revert1`。

新定向3項PASS：上述改回舊值保留選擇與recovery、沒有誤報／第二次commit／背景重試；正常未送出的改回舊值仍可零POST取消；已知拒絕後可明確確認原值no-op而不永久鎖住。因核心queue更動，只定向重驗既有identity/recovery4情境，same-ID新世代／跨actor／舊in-flight與上一世代保全均PASS；其餘22項不重跑。語法及新測試lint PASS，shared-state仍為相同5項既有lint，無新增。[修後直接證據](../../Temp/unknown-receipt-revert-after-20261014.json)、[定向來源與身份核對](../../Temp/uncertain-revert-source-check-20261014.json)。這些是production函式的記憶體fixture；不把03:06的rev5 UI或03:13 build延伸為新檔browser驗收。V3 Save未知快照與真跨機／手機／CWV仍未驗；單B線初始A預設仍為已知未修限制。

前版`30151ca4…e33ccc0` manifest及ZIP`76e4ec92…ecae`／510輸出保留。新版只在該1356來源上增加shared-state條件／資產版本、必要工程文件及一個回歸腳本；最終版本及完整hash以[目前交付指標](../../Temp/current-merged-delivery-20261014.json)、[本階段建置](../../Temp/final-merged-build-unknown-20261014.json)及[本階段封裝](../../Temp/final-merged-package-unknown-20261014.json)為準。沿用既有獨立依賴，不重新安裝或開服務。未動日常3000、現有SQLite或原合成rev5資料、登入與分頁；未做Git／C2C／正式migration／發布，沒有新持久欄位。

## 2026-10-14 03:13封存階段：唯讀投影、BOM摘要及實際派送播放

原密封Main副本未改寫；production restore另建私有 `process-full-20261014-yItjpD`，2380檔／8,172,592,757 bytes保留，新59b來源1351檔覆入且Canonical零衝突。3035無listener後才以新root啟動PID13748；獨立IAB新tab正常示範ADMIN登入（原14帳號中既有3demo，不提取真人密碼、不注入身份），服務端驗收wrapper阻擋所有業務寫入，允許正常登入。實體讀回rev495／14帳號／100歷史／6撤銷／1726 R2物件，見 [還原準備](../../Temp/full-restored-site-20261014.json)、[網站狀態](../../Temp/full-restored-state-before-20261014.json)；這是密封備份衍生驗收，非重新擷取Main。

實際頁面已讀354主件／6105構成、AB/C/PROCESS版本、BOM統一歷史、製程審核V9、回報案件與圖片、流程照片。例行報告資料頁為建置中，BOM多餘定位按鈕不存在。製程資料說明原在VI逐字混譯，已縮短並加整句翻譯；圖片alt保留流程名稱，連動表單值不翻譯。390×844實測欄寬約288px、頁寬375，手機頂列原30×38/38px已增至44px，越文標題單行、選單導航後正常收合；非實體iPhone驗收。[文字候選](../../Temp/process-language-fix-20261014.json)、[頂列候選](../../Temp/mobile-header-fix-20261014.json)。Main runtime唯讀核無3000 listener或主目錄開發程序，無停止／重整／登入／代存日常頁；[保護紀錄](../../Temp/main-runtime-protection-20261014.json)。

新API `reviewMetadata=1` 只投影BOM清單案例／版本metadata與generation、pending、現時權限；不帶working/saved/active/固定body。sharedCaseMetadata先排除body鍵再取值，避免觸發immutable lazy getter。client摘要token不推進完整模型token，actor／revoked-view／新舊full revision fence保留；真正動作前重讀完整控制及權限，差異展開才載入完整案件與BOM domain。未變更輪詢不重繪。新定向API5／controller5檢查PASS（記憶體fixture，非真案件寫入），正常scope讀取200，實際BOM摘要370,425 bytes，相較原compact6,298,327 bytes降94.12%；條件回應187 bytes／52ms。初次15MB為非compact相容格式，不能視為前端實際負載；摘要首次為程式更新後樣本，不作steady-state延遲或LCP/INP聲稱。[效能收據](../../Temp/bom-review-summary-live-20261014.json)。沒有trace工具，不安裝設定或繞工具限制。

清單metadata3的中越文與內層捲動已分項核對：表格捲動366.29px，重新整理按鈕原已可見時頁面與內表位置均保留；按鈕原不可見時Browser Use自動捲入視野不算捲動回歸。390px的final3圖與DOM只證明該CSS及文字範圍，不能當最新整體程式的完整手機接受。證據在 `Temp/full-restore-ui-20261014`。

完整副本的唯讀wrapper曾擋下兩次自動POST：refresh的舊applyActive鏡像同步，以及fresh-tab啟動的legacy工段補種。修正shared-state.projectProcessMaster只更新本機唯讀鏡像、不排dirty或確認revision；queued／in-flight／待審目錄保留。app存在master/V3 control時不做legacy啟動補種；真正空白legacy仍可初始化。新VM5項PASS；guard2 fresh tab及refresh沒有新增POST，歷史blocked仍2。最後實體副本rev495／row SHA `d327683f1cba5c377a03f50fff324869288506c1e65cf7b52ec7f88ba83ccf5e`、14帳號／100歷史／6撤銷／1回報／1726 R2物件不變。[純讀取修正](../../Temp/read-projection-fix-20261014.json)、[最後唯讀狀態](../../Temp/full-restored-final-state-20261014.json)。03:13封存時unknownReceipt只有來源未清除之保全，當時未做專項fixture；後續直接情境及邊界修正見文首，不回填此階段為新版測試。

只為新metadata動作及未驗Send/player另建六合成3035 `process-entry-qa-20261014-u8GO0S`，不使用完整副本的真實案件。正常frank登入後從統一主資料送審頁核准新案`qa-20261014-bom-review`，pending清空，result保留frank及`QA synthetic metadata hydration approval`。原完整唯讀程序經PID／時間／root／config核對後退出，3035確認釋放才啟動新fixture PID2108；未停止其他服務。

Send首輪被舊validator誤擋：V3進站／出站未分配產品，被legacy產品篩選排除，導致完整連線誤報目標不存在。早期以為fixture斷線的修正守衛`NO_INVALID_LINKS_TO_FIX`在寫入前停止；沒有刪線。產品修正只把V3 terminal納入圖形存在／群組檢核，保留缺目標、BOM、路線及核准版守衛；舊版篩選不變，新VM4項PASS。另發現發送按鈕在API成功前就顯示成功，現等待ProcessSync.flush確認、同步中禁用按鈕；失敗保留選擇／待送資料並顯示錯誤，新VM3項PASS（早期測試函式擷取及跨realm比較錯誤均校正後再通過，不改產品以遷就測試）。

第二個原因屬fixture設定：單一B-PHAO路線卻複製了其他工段PROCESS目錄，正式API以400拒絕。只在此新丟棄fixture用既有CAS修正兩個目錄值，修前JSON保留，revision3→4／其餘值不變；沒有放寬API檢核。修後由原Send按鈕真正儲存B線101CTP007，實體revision5／BOM approved／pending null／核准理由及審核者已讀回。正常重開、選B線後仍顯示核准V1、BOM32/32及作業說明，可見卡片像素另存`player-fresh-persisted.png`，早期卡片在視野外的圖保留。[最終合成收據](../../Temp/entry-review-final-20261014.json)、[fixture範圍修正](../../Temp/entry-fixture-catalog-repair-20261014.json)。診斷中只建立無內容修改／未Save的合成製程草稿，保留於新fixture；首次單一B線的播放器預設仍為A，須正常選B才驗收，未稱此預設相容性通過。舊頁已知合成未同步派送輸入保留，未代存或清除。

本輪新來源需與最終封存／建置逐檔對齊，判定及完整hash以[最終建置](../../Temp/final-merged-build-20261014.json)、[最終程式包](../../Temp/final-merged-package-20261014.json)及[交付指標](../../Temp/current-merged-delivery-20261014.json)為準。59b獨立510build及e9b的1353來源候選build各保留原版本，不能延伸到後改projection/startup/dispatch/ack。最後候選沿用59b的獨立依賴安裝，不再npm ci或重跑已PASS；包只含來源與manifest，不含私有hosting/session/DB/R2/環境或金鑰。

既有4檔lint新舊均38個相同診斷，無新增；全庫lint仍未通過。新增version-workflow與兩個dispatch測試檔語法及lint均PASS。[新來源檢查](../../Temp/final-dispatch-source-check-20261014.json)。本日無新schema/migration；相對HEAD仍有先前既有0002，8份schema/migration檔在59b／候選／fixture一致。舊備份9/9、BOM完整閉環及最後放棄PASS不重跑。全站所有按鈕、所有role格、實體IME/手機、跨機真人、unknownReceipt專項及LCP/INP不宣稱完成。Main3000資料／登入／分頁、舊密封副本、其他任務、Git、C2C與部署均未操作；資料模型無新增持久欄位。

## 2026-10-14 新封存來源的獨立離線建置

59b603d1…16da 新ZIP已從封存內容重新安全提取並核1351來源／manifest身份，於私有 `program-final-clean-20261014-yIDIzq` 獨立 `npm ci --offline --ignore-scripts`（複製既有cache，非共用node_modules junction）及 `node scripts/local-build.mjs`，兩項exit0；產生510檔／18,632,790 bytes，1351來源零變動。完整命令、版本、日誌與各dist SHA見 [新建置收據](../../Temp/final-program-build-stable-20261014.json)。未執行安裝生命週期腳本；此PASS只涵蓋程式建置，完整業務資料還原後網站、八類剩餘範圍仍未完成。未重跑舊0f939包的509檔build或既有BOM／最後放棄PASS，未動日常3000、Git與部署。

第一輪沙箱臨時目錄MQBETm回build exit1／0輸出，但程序結束後該root與stdout/stderr不可見，原因未判定，不能稱compiler問題；舊 [失敗收據](../../Temp/final-program-build-20261014.json) 保留。改為經批准的固定私有Temp新root後建置成功，沒有繞過拒絕或改權限。這是封存後的驗收文件更新，不改新ZIP。

## 2026-10-13 直接授權後的 3035 權限補驗與總覽文字修正

程式交付指標（封存後文件）：共享来源已於16:39（Asia/Bangkok）固定為1351檔／inventory `dcc87eedeaa32cfa3e954625611e4269595f8bd84e994c8542602b6fcbc1b407`；16:41新私有ZIP `59b603d1b2ebaff5d33a65e1153f8e2637771df80078faf808a2416ed4c716da`、1352entries，owner與Dot另8checks完整性PASS。3035 tested候選741的八個關鍵檔與新包相同，另有Edge DOM載入版本入口，兩種證據不冒充HTTP全文雜湊。最新單一指標見 `Temp/current-program-delivery-20261013.json`；包含FQC搜尋／配色／草稿照片移除／取消捨棄查閱與復原的共享來源及owner報告，不是本任務重跑完整FQC UI。3050私有來源／實體DEMO／D1/R2／帳號設定／hosting或env與keys均未納入；318程式資產與223核准Canonical子集保留，外部分享仍需媒體審閱。原0f939 ZIP、Main密封副本與509檔cleanbuild證據保持原版，新包沒有重跑build／舊功能suite／restore，也不代表新機含業務重建或部署接受。初跑inventory的Git ENOBUFS只修新Temp工具有界64MiB緩衝；原排除／scanner／branch與HEAD守衛不變。這一段是封存後doc-only更新，不在ZIP內，不因此再重封裝。

使用者已在本任務直接授權 frank、qa-process-manager、qa-process-staff 正常登入隔離 localhost:3035，先前「等待直接批准」已解除。manager 的本人／primary 唯讀限制、staff 可編輯範圍、個人與角色搜尋取消及中文390×844矩陣橫捲沿用 Temp/3035-manager-ui-20261013.json，不重跑。續接實際驗證 primary 越文可編輯角色搜尋不標 dirty／取消無提示、普通 STAFF 正常登入與中越文本人資料卡、無他人或角色管理入口、中文390×844本人卡44px按鈕且頁寬375，以及越文 BOM 3010304 下階202PP001／204PP001、來源101CTP007、相對層級1及三項深層數值空白。詳見 Temp/3035-permission-ui-continuation-20261013.json 與 Temp/permission-ui/，不是實體手機接受。

最後放棄於16:30（Asia/Bangkok）完成「使用者原生確認＋代理事後驗證」分項PASS。Edge經正常UI登入合成frank，STAFF角色原說明空白；只輸入`QA unsaved cancel verification`，dirty=1。標準Edge confirm句柄失效，官方原生工具也因不能可靠辨識網址而停止；使用者在上方原生提示按「確定」後，代理才實際核對角色dialog已關閉、正常重開仍為原名稱／空白說明且dirty=null。前後實體讀取shared revision33、workflow26、pending null、六合成帳號不變；未按表單Xác nhận／儲存、未改權限或憑證。收據[3035-edge-discard-final-20261013.json](../../Temp/3035-edge-discard-final-20261013.json)、前後狀態及原值像素在`Temp/permission-ui/3035-edge-discard-reopened-original.png`。這不是代理自動處理原生確認或完整Escape驗收；較早Chrome／Edge句柄失效、URL政策停止與誤按實體Esc紀錄保留。舊Chrome分頁後來不在inventory，未把分頁消失算PASS。原生控制已歸還，續接排程`3040-3035`已PAUSED。

續接時3035拒絕連線，完整OS核對原PID3584與listener已不存在；先唯讀核1200來源及rev33/wf26，再保留舊logs/runtime/receipt後用原Start-Acceptance恢復到PID33176，仍同一私有root/config/state、loopback3035。總覽「尚未Gửi sản phẩm」補完整翻譯，LIVE改即時、問候簡化為生產管理中心；僅app/i18n/index文字與cache版本，程式與隔離舊檔先保全，新candidate741d661da59e1d18769eae4ca265a87a016b905ef39e7363b7728959a9e44d1b。中越文实际reload核對通過，語法／差異檢查通過；Temp/3035-dashboard-final-preservation-20261013.json再核rev33/wf26、pending null及非目標鍵不變。不重跑BOM閉環、備份還原或既有測試；本輪無Main3000資料／登入、schema、Git或部署動作。

06:02來源ZIP0f939216…4b14及乾淨build仍是生成時版本，未包含本次07:41總覽文字修正；保持原證據，不回填舊包或冒稱新build。現有29項字典lint歷史失敗亦未宣稱清除。全站按鈕、中越文、真跨機多人、LCP/INP、實體手機及原生IME仍未全部驗收。

# 2026-10-10 權限、BOM 與製程候選驗證

狀態：工作分支 `codex/ipqc-ab-local`／HEAD `8b182626085bb2aa1f3a216903c5b373ee82bc44`，本機未提交，沒有 push／merge／部署。正式需求由[PERMISSIONS_ADMIN](../specs/current/PERMISSIONS_ADMIN.md)負責。真實 14 帳號、密碼雜湊移轉及安全設定尚未套用；不可從本文件啟動發布。

## 2026-10-13 較早階段：真實 Excel 流程完成、權限介面補驗

以下保留當時的拒絕、失敗與採證；登入授權及後續已完成項由文首續接段及下方剩餘界線表取代，不能沿用當時待批准狀態。

續接目前狀態：Main保全由Dot另做9/9獨立唯讀PASS，收據`<TEMP>/dot-full-recovery-20261013/main-private-independent.json`；sealed snapshot／restored全部2,380檔相同，當時Main原storage＋4settings共1,745檔仍精確相同，scratch-only核所有5個D1表與owner一致。兩個私有副本保持凍結，不重做Main備份。

權限補驗分開紀錄：原IAB tab2可讀且真正開啟合成staff dialog；只搜尋BOM後取消，工具回報越文JavaScript confirm，`getJsDialog`卻為undefined，接著AX在focus設定逾時。這是實際未通過，沒有代按或重試該已知失敗方法；舊頁載入closure版本及原dirty來源仍未核，不能當成最新served JS的回歸。磁碟原root／3035的access6同SHA `64d028d4…a3e48`已排除user matrix search，但漏掉role dialog的`data-ua-role-search`；新增role案例先FAIL（`Temp/role-search-before-fix-20261013.json`），最小selector修正後production-handler定向PASS，姓名／角色／權限修改及Escape離開保護仍保留。這不是完整browser取消PASS，亦未重跑BOM或Main資料測試。

新Chrome僅開獨立3035頁，沒有登入成功或注入cookie／localStorage身分。正常合成登入被自動審查拒絕，理由為本對話缺該具體登入的直接批准；已在此任務詢問一次frank／qa-process-manager／qa-process-staff登入授權。另一任務其後回報使用者已批准，但本任務近期直接／native批准紀錄尚未可用；未以轉述重試、重問或改工具繞過。同期修正可見登入頁混語：完整中越文標題／提示、移除英文章節標籤及兩處「公段」誤字；新頁真正reload後ZH／VI DOM與桌面像素限定PASS，空白密碼欄，沒有帳號資料變動。初期語言像素屬10dc；最後誤字及app login7另期候選`dde9da43ebb75ddfa3626bdb8ead5155108eaa178435c2a22dd8b3688f50181f`，1,200檔，收據`Temp/3035-login-language-candidate-20261013.json`／隔離`real-evidence/LOGIN-LANGUAGE-CANDIDATE-20261013.json`。旧3bd、10dc清單與被替代檔都保留；最終候選ZH／VI重新載入畫面、DOM三個新資產版本與原隔離rev33/wf26／pending null／非目標鍵不變已另核，不回填舊收據。Chrome tab821983179及原IAB tab2保留handoff；不再嘗試原提示的失敗控制方法。

本輪非登入工作完成：新程式ZIP位於`<TEMP>/program-review-20261013-wqrgQf/ProcessOS_Program_Review_20261013.zip`，SHA `0f9392164a2c1bbcd003afc7bb265d5efec640d73f84c36a552788b42d1a4b14`，24,362,277 bytes、1,338來源＋manifest，共1,339entries；含角色搜尋及登入文字修正、先前stop／longpath／私有設定排除修正與05:59階段文件。owner CRC／解壓SHA PASS，Dot另7/7獨立PASS，收據`Temp/source-package-20261013.json`及`dot-full-recovery-20261013/program-zip-independent-final.json`。旧8da與其他包、清單及收據保留，未回填新內容。該包06:02生成時凍結，之後本工程入口只補完成階段與限制，不因階段文件自引用持續重打包。

乾淨程式來源建置PASS：新私有cwd `<TEMP>/program-clean-build-20261013-ggcvel`，從上述已驗ZIP解壓來源另複製1,338檔，執行`node scripts/local-build.mjs`，Node24.19.0／exit0、509個dist檔／18,581,163 bytes；所有來源未變。重用現成node_modules（vinext1.0.0-beta.5／Vite8.0.16／React19.2.8），沒有npm ci／新機安裝。僅從封存snapshot補`.openai/hosting.json` binding metadata，SHA `9da14fb8…ef9f`；原snapshot／Main不寫，未複製business DB或session，未產生資料檔、開服務或登入。既有network preload／guard保留，recorded requests0；build只設定本機工具環境，未生成local wrangler config屬正常compile-only結果。owner收據`Temp/clean-program-build-20261013.json`、private cwd的`build-result.json`／`build-stdout.txt`；Dot另11/11核source、509outputs、dependency realpath/version、metadata與exit log，`dot-full-recovery-20261013/clean-build-independent.json`。這不代表含真實資料的啟動、全新安裝、UI或部署驗收。

來源最小差異另核PASS：`Temp/role-search-source-review-20261013.json`證明user僅一個搜尋selector、app僅一個eyebrow及兩個欄位字樣、index僅三個asset版本、i18n僅四個完整詞組，其他有效翻譯未變。翻譯dictionary原有26個duplicate properties保留；新舊完整lint均29項同樣既有問題（26 duplicate及3其他），combined lint仍FAIL，不宣稱整站lint通過或趁機重寫。未改schema／API／業務資料，browser登入後完整權限、越文BOM下階及八類剩餘未跑項維持未完成。

最新日常3000保全／還原已完成：使用者在本執行任務直接授權完整帳號權限、登入安全設定、草稿、歷史及圖片的同機私有副本，取代下方早期待批准狀態。沿用原保全script及production `restoreLocalBackup`，未換工具或弱化guard。來源固定目前`<WORKSPACE>/中控系統`；私有根目錄 `<TEMP>/main-private-preservation-20261013-SWBFtv`的`snapshot`為完整備份，`restored`為新隔離還原目錄，均保持凍結。共2,380檔／8,172,592,757 bytes，其中完整`.wrangler/state`為1,741檔，另有私有session／features／wrangler／canonical-base（存在時）、public、Canonical、schema與既有設定補充；manifest SHA `0aade26671d83ca584178e4a890b0342d7d29294015f3d14992d93709ac964eb`。

本次PASS：每檔size／SHA、複製期間來源穩定、production乾淨還原後全檔SHA及所有D1表的逐列摘要相同（含SHM亦無差異）。還原仍為RECORDS/rev495；100筆`state_backups`、6筆`process_revoked_sessions`及回報表完整保留。所有R2實體metadata／blob、public圖片與原有歷史均在完整檔案比對內；未以Canonical取代私有資料庫。D1邏輯讀回只開啟額外scratch副本，不在Main或sealed snapshot開SQLite。收據`Temp/main-private-preservation-20261013.json`與私有根目錄`result.json`保留結果，不含帳號值／Token。

還原後再核對原來源PASS：2,380檔雜湊、完整storage檔案集合及marker精確未變，`Temp/main-private-preservation-final-20261013.json`／私有根目錄`original-final-verification.json`提供當時最後證據。該保全／還原階段原資料、登入、分頁、Main／3035／3040程序均無寫入或停止；無網路／上傳／Git／發布、真實帳號migration、登入測試或UI操作。此副本含私人資料，不納入程式ZIP／Git；env／dev.vars及ZIP key仍分開保管。本次是完整物理資料保全與還原驗收，不是全UI／實體手機／跨機器同步或部署驗收。後續已授權前端來源修正與封存時版本分開，沒有改原業務storage／登入；所有程式ZIP保持各自生成版本，不含私有副本，也不回填後續階段文件。

本段取代下方 10/12 的當時資料與未測現況，較早 PASS 不重跑。3035 原隔離 D1/R2 在開機後唯讀確認仍為 rev27/wf22；先以既有 `createLocalBackup` 保全完整儲存，再用 `writeLocalState` 的原編碼與 CAS 精準恢復誤建、無業務修改的 AB 草稿鍵，rev27→28，正式主資料、已核准 BOM 與其餘資料精確保留。新備份 `2026-10-13T01-24-22-430Z-0e8cc997`，預覽／復原收據為隔離 root 的 `real-evidence/AB-RECOVERY-preview-20261013.json`／`AB-RECOVERY-apply-20261013.json`；不做整庫回復。

實際正常 chooser 匯入真實 Excel 的修改副本：大批 354 主件／6105 列，5 項變更套用儲存 rev18；少批 11 主件／228 列，11 組比對套用後保留全庫 354 主件／6128 列，rev20，儲存重開通過。大批原檔 raw SHA `7506b0085405baf8e35e69d50ffecec00d065e54783588311dcd54f1d59ff46c`、少批原檔 `06916f8d805a3da10a3988d903b30bd007301e23c992bf8ff99458ede51778a8` 未變；測試只改副本。原6105位置 ID 保留，少批未列入的343主件逐列與大批保存後內容相同，另由 Dot 獨立核對。重新匯入同一少批檔案為0差異；修正零語意差異／全部保留仍排入本機佇列的假未儲存狀態，實際介面與 `test-bom-import-noop.cjs` 通過。

新真實報表鏈：案 `1efd0d68-a258-44d6-8659-dbc3073d2ffa` 發回，單一新增測試零件修正後再次保存／送審，案 `483875d9-c755-4fca-bb95-45e83b68f25f` 核准；核准後另建新草稿／保存／送審，案 `ea0e3d41-b2c8-4b74-85de-332c3f666af8` 在統一主資料送審頁撤回。最終 rev33/wf26/pending null，saved `9f1f2db9-64f0-4b47-b163-ac9d55b7f672` 與 working SHA `500193ac9c7cf07ab6251ffa77e93874c33619c7e8f7b3f180c537fa06638e14` 相同；正式內容保持 `ae0cac22adb3e55a2458bc02ec131683a1e46b1da0ac71f144bea0175acb3b70`。待審清單1→0，歷史保留操作者、時間及撤回理由；BOM 核准正式投影 `bomOverrides` 精確等於 active BOM，其他8鍵保留。初次讀回工具誤將投影列為非目標鍵的 FAIL 保留，未把錯誤藏掉或放鬆產品守衛。

證據位於 `<TEMP>/process-qa-20261012-01/real-evidence/` 的 `LARGE-SAVED.json`、`SMALL-SAVED.json`、`REAL-RETURN.json`、`REAL-RESUBMIT.json`、`REAL-APPROVED.json`、`REAL-WITHDRAW-FINAL.json`。独立 QA 收據 `<TEMP>/dot-process-qa-20261012/real-excel-withdraw-review-20261013.json` 與實際 D1/R2、1280×720 empty/history 像素及 UTF-8 DOM 一致。沒有為已完成動作補造 network collector 或重播請求。下階3010304顯示202PP001、204PP001、來源101CTP007及相對層級1，深層三個數值空白保留；ZH像素与ZH/VI DOM通過，VI同張像素尚待正常捲動補採。

候選保全分期，不能混稱同一執行版本：BOM鏈 `d9ac262e…97faf8f`，權限遮擋／無行為 lint 清理 `8d9b3568…23903e`，搜尋假 dirty 修正 `3bd67787…63c3cfd`。`RESUMED-RUNTIME-20261013.json`、`PERMISSION-RUNTIME-20261013.json`、`PERMISSION-SEARCH-RUNTIME-20261013.json` 分別核對 listener PID3584、實際 root/config/state與1199／1200凍結檔，delta3／4／3檔精確匹配，各舊 manifest／被替代檔與 SQLite 均留於对应 `qr12-*` 備份。最終 public 五資產 GET200 與源 SHA 相符，HTML只接受 `local-features.mjs` 的一個精確 web-feedback-loader 注入，見 `PERMISSION-SEARCH-SERVED-20261013.json`；不把今日 GET 冒充較早 served 採證。

權限 UI 新CSS修正回報浮鈕遮住 footer 確認，以及越文全站規則將窄版按鈕覆為38px；390×844模擬實測 dialog無全頁水平溢出，關閉／取消／確認均44px且右端 hit test無遮擋，矩陣保持內部水平捲動。CSS雙parser與178控制保全 PASS（另名保留舊報告）。只搜尋權限不再標記 dirty；實際 production dialog handler 定向確認搜尋取消不提示、真正姓名／角色／權限修改保留取消與 Escape 離開保護，`test-user-access-dialog-dirty.cjs` PASS。目標 lint／diff check PASS。

仍未完成：舊頁搜尋取消後，受支持 click／getJsDialog／AX控制逾時；工具未讀出可處理dialog，不能判定native提示存在。使用者已授權代按，但專用任務官方UI runtime初始化`0x80070003`失敗，未取得像素或點擊；使用者在外，此支線擱置且不催操作。最後JS的實際搜尋取消、ZH/VI角色矩陣完整互動及合成frank/ADMIN browser session補驗待續，不宣稱全部權限UI通過。實體iPhone、原生IME、跨機器真人同步与正式LCP/INP仍未驗。3036實際製程全審核鏈及C01/C02啟動／非busy待審锁定沿用獨立 scoped PASS，不重跑；protected啟動跳過legacy seed，空A-CUT安全恢復選擇，無業務seed寫入。

Main3000本輪沒有登入、保存、復原、送審、資料測試或改憑證。較早Main rev495的BOM working/saved業務內容已與V6相同，因此未還原或刪除V7歷史；後續使用者IQC V17未儲存頁保留。C2C支線其後依使用者指示取消，原同名連接器未刪除／重建／新授權／配對，本機對話指標仍保留；不為補修繼續操作。沒有 SQL schema／migration、正式資料、Git發布或資料包操作。

現有驗證缺口按原請求收斂，不把同一套PASS重播：

10/13後續畫面查核：日常Edge 3000 IQC分頁實際顯示ERR_CONNECTION_REFUSED，沒有可見BOM下載完成訊息；只讀畫面，未重整或代存。完整唯讀OS查詢確認3000無listener，隔離3035仍是原PID3584/root/config；此前沙箱程序查詢的不完整結果已更正。自有IAB新tab3可讀VI權限頁，staff「Sửa」點擊後未出dialog，DOM dialogs空，因此最終搜尋取消／權限矩陣互動仍待驗。舊tab2未處理，沒有取得確認提示畫面，不宣稱已看到或已按確定。

既有私有備份僅唯讀完整性盤點：`2026-10-13T01-24-22-430Z-0e8cc997`的53檔／1,625,676,317 bytes與manifest全數相符，包含D1 6檔、R2 metadata SQLite 2檔、blob 35檔及私有features/session/wrangler設定；manifest檔SHA `1b32df9540eb9711eaa8b253791afd5d1c1a413e08741d8a6179a3d4ca20c528`。收據 `Temp/preserved-3035-backup-audit-20261013.json`明確為rev27時期備份完整性，不等於最新rev33全包或還原驗收。沒有讀出憑證内容、製作新包或跑restore；Canonical僅核准共享業務子集，不能替代含帳號／草稿／歷史／媒體的私有備份。AGENTS與本輪只讀前備份SHA相同。

| 範圍 | 已有證據 | 剩餘界線 |
| --- | --- | --- |
| 真實BOM匯入與保存 | 大批→少批、保留缺列、0差異、重開與實體保全PASS | 原檔不改；不套用日常3000 |
| BOM統一送審 | 發回／再送／核准／撤回、pending清單與理由歷史PASS | 原執行d9候選證據與新UI候選分開 |
| 製程審核與BOM引用 | 3036實際角色審核鏈、非busy待審鎖、產品狀態唯讀PASS | 真正entry Send／playback未執行 |
| 帳號與有效授權 | 直接合成登入授權已收到；正常manager／frank／staff登入及分項本人／他人限制通過，原epoch／隱私／CAS定向PASS沿用；Edge人工原生確認後最後放棄／重開原值／revision未變PASS | 未改真實帳號；代理自動原生確認仍NA，完整所有角色／格子browser互動未宣稱完成 |
| 中越文字與BOM下階 | 登入頁、本人卡、總覽中越文分項PASS；兩下階來源／相對層級及ZH／VI DOM與像素已補完 | 其他標註頁與全站文字／按鈕完整掃描尚未完成，不翻譯業務儲存值 |
| 窄版與捲動 | 390×844權限／本人卡分項無全頁水平溢出、44px；ADMIN中文角色矩陣鍵盤與實際橫捲／搜尋保留位置PASS | 未涵蓋全部角色、全站表格／樹、原生手勢與實體iPhone；共用Chrome viewport須等其他QA釋出控制 |
| 按鈕與本機未儲存 | 零差異假未儲存修復；搜尋取消不提示、真正變更確認與取消離開保留輸入PASS；最後放棄由使用者按原生確定，代理核dialog關閉／原值保留／33→33 PASS | 代理自動原生提示與Escape完整互動仍未通過；舊IAB／Chrome／Edge工具問題保留歷史，不認定新來源bug |
| 同步與效能 | 原server兩actor CAS拒絕衝突、paired模型輪詢測量與C01/C02 scoped PASS | 跨機器真人同步、實體IME／手機及LCP/INP未驗 |

不依賴browser的補驗已完成：`Temp/3035-live-access-read-20261013.json`實際核對原3035/PID3584/candidate3bd，匿名401、三合成帳號正常登入200及權限GET200。primary可管角色；一般ADMIN不能修改自己／同級的角色、啟停、刪除，能編staff；普通人只見本人且roles空，回應不含憑證。D1原row精確33→33，R2物件索引相同，瀏覽器Cookie未動。首次檢查工具把`actions.password`布林旗標錯當憑證而中止，另收據保留，修正工具只允許該明確action旗標；沒有放寬真正credential欄位驗證。這不取代瀏覽器session補驗，也沒有重跑已PASS的有效權限變更6項。

程式候選清單：`Temp/dirty-source-inventory-20261013.json`與review收據讀目前HEAD／branch及tracked、modified、untracked的真實bytes，各檔雙讀核穩定並作既有known-format秘密掃描。排除私有儲存／設定／archive／本機診斷與原始業務輸入；program、docs、核准Canonical子集與需review的runtime資產各自標記。初版a6b3與後續清單均保留；當時8da程式ZIP已完成，最新角色／登入文字修正需新清單及包，不能回填8da。不用git archive HEAD漏掉未提交工作；沒有正式資料移轉。掃描無已知格式命中不等於所有文字／圖片都可公開。

最小備份修正：`local-backup.mjs`原本排除`.env*`卻把4個root／nested `.dev.vars*`納入archive；新production-archive fixture在5c94源確實FAIL，收據`process-private-config-test-1lDnUR/result.json`保留。加入一個排除predicate後8b84源定向PASS，`process-private-config-test-Avqx26/result.json`核AES-GCM、程式、圖片、D1與R2 metadata/blob仍在且原來源未變，無網路／browser／live寫入；目標lint及diff check通過。首次沙箱EPERM只發生在合成設定的原子rename，正常本機fixture驗證後才確認產品缺口。舊modified源與文件已在`backup-source-before-devvars-20261013`保全。

完整延續覆蓋不可合併稱為一份已可發布的包：

| 部分 | 覆蓋／保留方式 | 尚未提供時的界線 |
| --- | --- | --- |
| 程式及相依檔 | dirty source逐檔SHA／package-lock／runtime assets；當時8da ZIP及解壓完整性PASS，最新修正另期封裝 | 尚未新機安裝；既有依賴build不稱npm ci；media與文件私密性另review |
| 全共享與dedicated資料 | Main私有完整D1／R2、blob、record/chunk與unknown keys已物理保全／隔離還原，owner及Dot独立PASS | 不以Canonical或raw主SQLite單檔代替；未上傳或套回Main |
| working／saved／pending／active與歷史 | 原控制鍵、state_backups與immutable歷史物件一併保留 | 最新資料／引用需同一一致性快照，不能整庫回蓋較新業務 |
| 帳號與權限 | 私有state保留原ID／角色／權限／credential表示與epoch | 不進公開source／Canonical；不重設真實帳號或代填新密碼 |
| 圖片與回報關聯 | R2原blob／metadata、public補充媒體與issue/attachment/batch/handoff ID | 缺bytes／hash或關聯不符拒絕，不用placeholder宣稱成功 |
| Session與安全設定 | 私有physical session/features；ZIP key、env/devvars與遠端設定分開 | ZIP缺key不能解密；必要設定缺少不能宣稱完整延續 |
| 還原保護 | hash／feature/schema gates、保留新logout、failed-state／安全備份 | 不能關閉已啟用revocation，也不讓舊session復活 |
| Canonical | 僅approved共享業務及核准web資產子集 | 排除帳號、草稿、身分／audit與部分dedicated workflow，不叫全機DB |

獨立Dot `dot-full-recovery-20261013/result.json`為11項合成完整還原PASS：physical D1/R2/session/features及image supplements、損壞圖先拒絕、unknown/control/history/feedback關聯保留、新logout不復活、AES-GCM／安全備份／key/env排除。它是舊backup模組5c94與fake SQLite/bucket adapter；不是Main資料全包、actual Miniflare/cloud或新8b84整套重跑。本輪只讀收據與來源hash、未重播同套件；具體最新hash與scope留在各收據。

較早修正前Main全量保全BLOCKED：既有`assertDevStopped`在完整本機權限下拒絕；marker PID25644實際為`msedgewebview2.exe`，不是local-dev/local-server，建立時間10/13而marker始於10/12。這是PID重用造成既有PID-only閘門拒絕；不以沒有3000 listener繞過，也不刪marker／停瀏覽器。`Temp/main-stopped-gate-20261013.json`保存原marker SHA與拒絕原因；該階段未執行Main複製／還原。Dot當時唯讀清單為rev495、RECORDS、27鍵、100筆state_backups、6筆revoked、feedback表1列及約8.13GB儲存，僅量／路徑／hash，不含帳號值。舊14帳號移轉preview／合成mutation PASS仍屬原基線；本次保全沒有在Main執行plan/migrate/rollback，也不稱最新14帳號已重新核可。

上段為修正前阻點，已補production `local-stop-gate.mjs`、future marker root/entry。完整Win32資料與runtime驗證、workerd父鏈、bounded isolation声明唯一匹配／state inside root及source/config SHA均保留；20合成cases涵蓋foreign entry指向Main、缺／改配置、重用PID、新PID服務、相對entry與孤兒worker。先前entry-only純分類未用於Main保全，独立review後已改data-target proof。真正03:44 OS gate `Temp/main-stop-identity-20261013.json` PASS：3040/PID26544/privateRoot與3035/PID3584正確證明，Main marker仍原SHA；無程序操作。新cleanTemp target可查本module來源工作區的既有声明，但仍逐一runtime驗證，非任意trust列表。

早期執行`Temp/preserve-main-storage-20261013.mjs`在CreateProcess前被自動審查拒絕，當時未開始Main copy／backup／restore。拒絕原因是Main私有帳號、session、安全設定、歷史及媒體複製／還原超過原「不動日常3000資料與登入」的直接授權；未換工具或間接執行繞過。使用者其後在本任務直接確認私有內容範圍，按同一script完成；最新結果見本段開頭。無migration或帳號修改。

程式包使用最終dirty inventory materialize專用Temp source-stage、保留所有program資產，archive後解壓逐檔驗證；不因review標記刪317／318資產，不public upload。收據`Temp/source-package-20261013.json`記實際最新SHA／檔數／路徑，以其PASS狀態為準；私有runtime／秘密配置已排除，`.openai/hosting.json`是現有Vite實際import的外部設定，必須另外提供正確綁定，不能虛構空設定來宣稱可直接跑。缺完整private資料／設定／key時，程式包完整性PASS不等於全系統可還原或可發布。

第一次程式stage逐SHA保全後，native tar.exe建立ZIP以exit3221225477退出且無stderr，失敗保留在私有program-review Temp。改用已安裝bundled Python標準zipfile，仍要求manifest所有程式／資產、CRC與解壓逐SHA及完整file-set驗證；這是source-only archive的工具更換，沒有換方式執行被拒絕的Main內容複製。

已允許的3035舊checkpoint另補實際還原：source固定`2026-10-13T01-24-22-430Z-0e8cc997`，先以production verifyPassword核current＋27個legacy R2快照、六個帳號均為合成，未輸出密碼／hash。初次工具要求plain.password而誤停，改成原驗證函式支援既有scrypt，不放寬known fixture身份／憑證。實際restore第一次在268字元stage SQLite ERR14，檔案存在且namespaced形式能讀rev27；未啟用target、source不動。備份原source後僅改recovery四個constructor namespaced path，338字元合成與已受影響的session/feature門控PASS。正常review後相同fixture還原新target `restored-synthetic-3035-20261013-ocHA8F`：53檔／1,625,676,317 bytes／manifest `c96e1d5c…b4364`全byte相同，rev27及25歷史；獨立Dot再核all-table／current／all歷史／R2邏輯精確相同，不重跑restore。來源與基線target都保持凍結。完整收據`Temp/3035-authorized-clean-restore-20261013.json`及Dot `3035-clean-restore-independent.json`；不是latest3035rev33/Mainrev495。

合成移轉另用`migration-synthetic-3035-bUSDk9`工作副本。wrapper最初漏db/schema與public/access-policy程式依賴造成generic CLI PLAN STOPPED，已補唯讀code junction，不連結任何state到Main、不改migration／權限guard。production CLI plan/migrate/重跑27→28→28，六帳號／三非DEMO的ID、既有scrypt及known synthetic登入相容保留，8業務鍵原樣；另只讀核25歷史與35舊immutable blob全SHA相同。`Temp/3035-synthetic-migration-20261013.json`、`3035-synthetic-migration-preservation-20261013.json`保留scope/coreSHA；沒有實際14帳號移轉，沒有重跑其他已PASS流程。

早期Main呼叫重試一次仍遭拒：delegation轉述不被自動審查認定為本任務直接授權。`Temp/main-private-copy-auto-review-rejection-20261013.json`及second-rejection收據保留，該兩次均在CreateProcess前停止，無替代工具／其他agent繞過。直接範圍確認已由使用者在本執行對話答覆，pending狀態解除；完整保全／還原及原來源不變的最新PASS見本段開頭，migration仍未執行。

先前source ZIP `353f27bb…94246`與獨立6項CRC/entry/hash/privacy PASS屬長path修正前版本，原包／原收據保留。修正後final dirty inventory與新ZIP由同一`Temp/source-package-20261013.json`指向，需逐檔/解壓重新核，不能舊包冒稱含新fix。需要正確hosting與私有安全設定方能完整執行，未做deployment/npm安裝／全UI驗收。

最新瀏覽器能力限制收據：`UI-CAPABILITY-BLOCK-20261013.json` 保留早期錯誤，`OFFICIAL-COMPUTER-RESULT-20261013.json` 校正為官方sky可初始化／列視窗，但目標為skill禁止的ChatGPT主視窗、沒有獨立隔離提示；`BROWSER-RECOVERY-BEFORE-20261013.json` 關閉嘗試前真正唯讀核對33／已保存／非目標鍵保全。正常close同樣逾時、原代理tab仍在，未強制close、未以OS或未支援CDP處理。不是新的帳號／資料測試失敗，也不是等待新的代按批准。

## 2026-10-12 續接結果（較早階段，現況以上方10/13為準）

本 Codex 任務為唯一 UI 操作人；Dot 僅獨立唯讀核對。C2C 沿既有指定 chat 恢復成功：workspace_info 的工作區／分支／HEAD 與本機 workspaceId 綁定相符，read_file 讀到 AGENTS.md 第49行「Do not repeat passing checks without a new reason. Report unrun/unavailable checks explicitly.」，test_status 只讀舊紀錄，沒有執行測試。該舊紀錄的 blocked 狀態不是本次連線失敗。其他 task checkpoint 未續跑。

BOM 新匯入按穩定位置 ID 合併新增／更新，缺根／子件／後代留存；SHA-256 語意基底摘要取代完整基底，維持2,000,000 bytes與原子CAS。實際 production client→POST 的合成測試，原大基底請求2,337,457 bytes仍413且DB/R2未寫入，新摘要請求738 bytes成功；stale摘要409、錯模式422、同操作重播冪等、同ID換內容409、同欄位並發僅一方成功，真撤權／身份fence仍有效。已知413不列未知，成功重試清除本操作失敗；本機隊列不能冒充已儲存。普通舊小請求保持比對格式相容而保留缺列；不放寬大小限制或自動重送日常舊頁。

實際 UI 在 `<TEMP>/process-qa-20261012-01`／3035、六個全合成帳號與獨立實體 D1/R2：兩列 Digiwin 報表更新後，354根／6105列保留；套用、Save、重開、Submit、Return、修改 Save、Resubmit、Approve、新修改 Save/Submit、Withdraw 通過。發回／撤回均離開 pending 清單，原因／自審確認保留在 history。最後revision16，pending null、正式版本仍為核准案件，撤回草稿保留。逐欄檢查6105個ID／parentId／path及非目標欄位全部不變，其他9鍵含製程草稿和合成帳號不變。`bom-ui-saved-reopen.json`、`bom-ui-approved.json`、`bom-ui-withdrawn-final.json` 為該root的持久收據；原fixture漏加schemaVersion的準備錯誤只在3035修正，未弱化產品驗證。

主要管理員更新 ADMIN 範本不再被登出，名稱／描述變更不遞增有效權限未變的帳號 epoch；實際撤權與密碼改動仍立即拒絕舊登入。本人資料卡中越文及自訂角色名稱已測；普通人看不到別人／角色模板。3032 合成 manager 改 staff 名稱與一格權限、重开／伺服器重啟持久化通過，最後僅恢復該 fixture；原14帳號／憑證及25業務鍵保留，新增稽核鍵另記錄，不聲稱從未寫私有 fixture。

製程 badge 使用已核對 actor/view 的 fresh flow，未載入顯示占位，忽略舊 approvalVersions 的10筆。快徑最初僅API支援；最後已補上 BOM／製程 production client 的 paired state-revision 条件輪詢，只配對曾接收的完整模型，metadata 不得提前推进，明確 refresh 仍完整讀取。其他模組預設不變，每次伺服器仍 fresh identity／permission。相同3032／revision473／資料／backend／合成session、每模組完整讀取加三次真client輪詢：製程472.16ms→53.59ms中位數，BOM452.40ms→57.24ms；完整初讀未宣稱加速。`actual-client-poll-before-after-20261012.json` 保存全部URL、初讀及樣本，無cache清空、無業務寫入。完整HTTP量測另保留 `api-perf-after-full-2026-10-12T05-07-41-160Z.json`；shared-state仍約13.2MB，沒有把HTTP改善當成LCP／INP／整頁驗收。

PASS：新增 `test-role-effective-session.cjs` 6項、`test-bom-incremental.mjs` 8項、`test-bom-wire-limit.cjs` production wire/handler與并發／完整流程、`test-bom-presentation.cjs` 5項、`test-process-pending-badge.cjs` 4項、扩充 `test-workflow-permission-read.cjs` 9項。受影響 BOM domain/workflow、共用POST的製程審核相容與tsc通過。原BOM test使用過時legacy權限fixture造成403預期失敗，已改成現行catalog明示override，拒絕斷言仍保留並通過。新測試VM重复const／非同步throws／lint小項均修正後通過，不宣稱每次首次執行都PASS。目標變更檔lint通過；較大舊SPA lint仍有既有問題，未整體重構。已通過的48項帳號／其他業務套件沿用原證據，未重跑。

Not available／未驗：本輪IAB viewport override實際仍1280×720，不能把帶mobile檔名的圖認定390×844通過；實體iPhone、原生IME、跨機器實際多人與瀏覽器LCP/INP未完成。最後相對層級及合併預覽的中越文僅窄驗呈現，不重跑審核；最新候選雜湊／PID以兩隔離root的 manifest、runtime-verification／final-candidate-receipt 為準。

日常3000最新本輪唯讀保護revision492見 `<TEMP>/bom-working-protected-20261012-1791778138923`，保護BOM及製程持久內容、無憑證，不是完整獨立媒體備份或未同步前端備份。真Chrome畫面COMMAND_TOO_LARGE／上已儲存下尚未儲存已確認；匯出等待中斷後尚無新的可驗證檔案，原頁及登入保留，不代存／刷新／重試。沒有本輪3000登入或業務mutation。下方10/10誤登入事件仍是歷史事實，不以本段抹除。

## 程式與資料邊界

`access-policy.mjs` 是服務端及 UI 共用 151 格 catalog；`user-access.ts` 解析現有模板與個別 override。`/api/user-access` 專門處理帳號、角色、啟停、密碼與邏輯刪除；先新鮮身分、目標限制及依賴驗證，再保護備份與 revision CAS。GET 普通帳號只投影自身；shared-state／media／409 不公開密碼、hash 或其他帳號權限。舊 `/api/users` 返回 410，整份帳號資料的 shared-state 寫入拒絕。角色刪除保護所有未刪除的使用者，包括停用與 DEMO。

`user-access.js/css` 提供中越文、角色與個人矩陣、全選／回復繼承、搜尋、橫捲及自己改密碼。角色搜尋與個人搜尋分開。GET／POST 及 content 以 actor、identity 物件和世代隔離；舊回應不能覆寫新帳號、清掉新 loading 或登出新 DEMO。同 ID 再登入也開新世代。共享同步保全按帳號保存 dirty／in-flight，較早世代列入 previous；不自動重送，不混入另一人输入。瀏覽器 quota 或實際恢復檔是否成功仍須以當頁證據確認，純測試不保證使用者頁面已備份。

BOM 查詢保留輸入元素與選取，composition 中不重建，完成組字才刷新結果；完整後代索引不再只列一層。製程 BOM 顯示加強名稱／用量，保留原 occurrence ID、品名、數值與互鎖。製程送審在自己的版本分頁以固定案件檢視／審核，確認／發回在案件內，撤回移出待審而歷史保留；自審、待補確認及理由仍有效。

網頁回報實際 view/create/edit/exchange 控制服務端讀取、上傳／送出、編輯和交接／下載；普通人不能取得管理操作。`routine.create/delete` 控制真正新增與草稿刪除入口，原 revoke/revise 專用權限及案件條件另保留。

## 14 帳號比較基準

私有證據：`<TEMP>/permissions-admin-20261010-01/latest-14-account-plan/`。`per-account-per-cell-delta.json` 保存每帳號完整 before/after，不含秘密。`independent-old-backend-audit.json` 執行保全的舊 resolver、can、通用 workflow 與 revision 467 的專用 editor/routine adapter，獨立核對新移轉 before；不是新 resolver 自比。原始 editor adapter SHA256 `247ee232b5e4534641c9ee6acf3ece2e493dd5cb041d8e1d332fddbb0d6d3b51`，與保全 candidate manifest 相符。它已允許 editor view 編輯／Save／Submit，與 Git HEAD 較嚴的規則不同；不得用 HEAD 取代起始 checkout。

| 舊入口 | 基準 |
| --- | --- |
| 通用資料草稿 | view=data或review；edit/save/submit=data；withdraw=data或review+withdraw；approve/return=review+对应權限 |
| 製程專用 adapter | view=editor或review；edit/save/submit=editor；withdraw=editor或review+withdraw；delete另需 approval.submit |
| 一般資料刪除 | edit 加 master.delete |
| 例行檢查 | settings=data+master.import；revoke=review+approval.revoke；revise=data+approval.revise；草稿discard需edit，已核准計畫刪除另需revoke及無相依 |
| BOM交換 | 原 import/export 分別記錄，合併格取兩者交集並保留编辑／工作流門檻 |

14 帳號各 151 格，缺鍵／額外鍵／獨立舊後端 mismatch 均為 0。ADMIN 類為 151 true、RD 為 133、STAFF 為 93，before/after 相同。零 business delta 不能代表政策沒有變化：Frank 唯一 primary、ADMIN 自己／同級限制、角色／ADMIN 建立、自己的密碼、DEMO 計數與固定映射、取消 line AUTH、保守交換格及回報實際 exchange 必須另驗。151 格 + 27 列選取控制 = 178 checkbox。

## 固定的隔離候選

3032 私有副本 `<TEMP>/bom-latest-acceptance-20261010-02`，候選 SHA256 `8852c696be5d3837569d7ec56fc65116baf53f4688de0859a6b4708e34b07f89`。09:29:22 UTC source/clone 861 個程式來源雜湊相同、14 個修改入口語法 PASS。實際 PID 33492，runtime 自證真實 root/config/state；guard 用實際 listener PID/command 再核對本機 DB/R2 配置及非空私有 SQLite。`final-candidate-receipt.json` 保存詳細雜湊與測試來源。只有 Dot 操作 3032 UI；本任務不與其競爭操作。

啟動 PID 20076 因 --import 使用 Windows 路徑而失敗，修正私有啟動器為 file URL 後才啟動 33492；不把「發出啟動」當連通 PASS。冻结前在 `v470-before-final-permissions-2026-10-10T09-24-39-590Z` 保全五個 SQLite metadata，舊 R2 blobs 保留。加入 `dot-qa-manager`／`dot-qa-staff` 合成登入使副本470→471；原14帳號身分／密碼及其他25鍵逐值相同，BOM仍V6。合成 fixture 不可匯回日常。

## 已執行與未完成

| 結果 | 範圍 |
| --- | --- |
| PASS | TypeScript noEmit；production functional：user-access 48、process-review-current、shared-draft-client、shared-state rebase guard、shared-state identity recovery |
| PASS | production mapping/CAS＋合成 SQLite/R2：原密碼保留、DEMO passwordless、冪等、身份／primary不符停止、備份、stale/race拒絕、只回滾帳號鍵、保留新business、Frank復原工具入口／雙輸入、舊session拒絕與新密碼登入、無憑證audit |
| PASS | workerd scrypt hash＋原／錯密碼驗證，外連0；TTY輸入不回顯、listener/rawmode還原、無TTY／無修訂版拒絕 |
| PASS | web-feedback 45 合成cases，含四格權限拒絕、CAS、原圖存取與資料保全；routine新增／刪除實際route勾選拒絕 |
| PASS | 隔離guard純mock：無default、拒3000/remote/錯PID/錯路徑/改config/舊candidate；替代fetch URL拒絕、redirect:error；3032真正runtime/storage驗證 |
| FAIL／待修 | 09:29 lint：CommonJS CLI require規則、request prefer-const、兩處空spread fallback。候選已交UI，先不在Dot操作中更換來源；下次自然checkpoint修正並重固定。不能記全lint PASS。 |
| 歷史 FAIL 保留 | 舊 process-authoring-page 腳本在 LEGACY_VERSIONS_REQUIRED 中止；舊workflow測試在待補確認／自審期望不符中止。新current測試通過不會抹去旧失敗。 |
| 部分 UI PASS | Dot 在固定候選8852實測：合成 manager 正常登入、錯密碼拒絕；個人搜尋BOM取消後角色頁完整27列，角色頁178勾選控制，搜尋／清除恢復全部列。BOM逐字搜尋3030901及越文ĐẦU TRÒN保留焦點／游標，清除保留選取，實際顯示第2／3階子件。製程待審工具列僅查看案件／撤回。這些為Dot回報的實際UI結果，非writer自行操作。 |
| NOT RUN | 原生中文IME（現有控制工具無法驗）、BOM多階勾選Apply/Save/重開、DEMO三入口及普通身分完整登入接受、製程審核UI、最新版手機模擬；完整3032接受尚未完成。實體iPhone、現場跨機多人及production發布未驗。 |
| PASS（合成實體副本） | 全新5帳號獨立D1/R2：真實CLI plan／migration／private APPLIED backup／credential verify／冪等／stale拒絕／只回滾帳號保留新business／非TTY拒絕；另實際PTY雙輸入不回顯復原成功，舊密碼拒絕、新密碼驗證，其他users/business保留、epoch與安全audit通過。真實14帳號移轉／復原未執行。 |

Node fetch 的隔離守衛不宣稱覆蓋其他HTTP庫或浏览器转址。舊自動化腳本先檢查，網路測試必須明示隔離收據；禁止使用帶3000預設值或未经讀取的測試。這是定向護欄，沒有擴成全專案安全重構。

## 日常資料與事件

日常 BOM 真實UI核准於07:01:34.907 UTC：revision470、V6 approved、case `e551c4a2-6c4e-4f5d-a7f1-47249a620d8c`；content SHA256 `885ae1e90c0fa816b99195c25a978841563f19452048577b295059a4d33efdae`，原24業務鍵保留。09:12:54最新只讀事件收據仍470／同V6、24/24及帳號鍵雜湊不變；不是聲稱使用者後續操作的目前狀態。沒有新的日常登入、身份切換或寫入測試。

此前誤執行舊 page test（exec-6a8e4d4b，5483ms）確實POST3000 DEMO login，簽發Set-Cookie，隨後GET shared-state及LEGACY錯誤中止，未啟動browser或業務寫入；精確wallclock不可得。token停在Node請求上下文，不是用戶browsercookie。簽發是實際副作用，不能以業務雜湊未變說「沒有影響」；不回放／登出／撤銷它。原使用者logout後恢復下載需要同原分頁、原帳號；尚無當頁成功備份證據。

## 離線工具操作界線

`node scripts/account-access-tool.cjs plan --root <精確checkout>` 只產生 metadata/151格報告，不輸出 values、密碼、hash或rollback私有資料；仍需先停止該服務並確認本機配置。`migrate`／`recover-frank`／`rollback` 必須另帶 `--expected-revision`，只供明確批准的本機維護。recover互動輸入兩次且不回顯，不能用密碼命令列或環境參數；rollback需要同root的APPLIED私有收據。先在 `.wrangler/local-only/account-backups` 保存此次帳號键，CAS后才记录APPLIED。回滾不還原 business 或session ledger。真實密碼／權限套用仍待當次批准，本輪不執行上述三個 mutation。

Dot 本輪安全檢查點保留3032 IAB tab6、Chrome821982689及保存對話；沒有權限／角色／密碼／業務寫入，也未做3000 QA。來源仍hold，待UI批次停妥後修正登入「依授權線別修改製程」及帳號A/B/C線別文案，同步處理lint，再固定候選重驗。

暫停檢查點 2026-10-10T09:57:11.609Z：見HANDOFF優先段與私有paused-checkpoint。Dot三DEMO／normal staff本人密碼／390×844及角色搜尋已部分PASS；一般帳號本人資料卡缺少入口、舊線別文案與lint尚未套用修正。獨立CLI實體合成收據位於 <TEMP>/account-tool-physical-e2e-2026-10-10T09-45-53-700Z/e2e-receipt.json。最後3032唯讀revision471，僅platformUsers兩fixture與470不同，其餘25鍵相同；source仍8852固定。未自動續做。
