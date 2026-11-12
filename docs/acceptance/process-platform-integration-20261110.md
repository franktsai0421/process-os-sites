# 製程平台整合候選與完整需求矩陣

基底 main `9fbba823090f03da8385c8d92f5e59293d19d2f1`；分支 `codex/process-platform-integration-20261110`；[Draft PR #104](https://github.com/franktsai0421/process-os-sites/pull/104)。本輪已從計數擴充至畫布存取、離頁、衝突、歷史查看及主資料頁草稿相依。**程式候選不等於整體實站驗收完成，維持 Draft，不合併、不部署。**

## 來源與沿用界線

- 已合併：#77 原子 Save、#96 歷史 helper、#99 工段類型、#100 無固定輪詢。保留 main 成果；新需求只取必要增量。
- 舊測試站：使用者已說以前完成者不重做；缺少將所有20項綁到同一部署 SHA 的收據，因此不補造測試站 PASS。
- 已沿用：#101 `e2591c6` 計數；`ec5b2eb` 畫布群組衝突／RAM表單、`8074589` 同頁類別切換、`14caf33` 當前畫布 Save、`59027b1` 無提示離頁、`1a147d9` Canvas 歷史、`d4a5ef9` 回草稿 fresh 權限；#102 固定 `55d4672cb8004d0b01715714cbc91fbce6b22d2b` 的主資料頁 writer／權限與核准來源依賴。逐項抽取，沒有整包套用舊分支。
- 其他來源的精確 blob 與保全清單見 [branch inventory](process-platform-branch-inventory-20261110.json)。benchmark10檔、#99四檔與 main 相同，直接保留；preview 專用入口與 seed 不帶入。
- #101/#102 保持關閉且未合併，來源分支保留。#103 帳密工作不帶入；本輪 `user-access` 僅為模組送審與最終核准的必要政策投影，不改密碼／登入API。

## 完整20項核對

需求來源：[固定完整清單](https://github.com/franktsai0421/process-os-sites/blob/55d4672cb8004d0b01715714cbc91fbce6b22d2b/docs/acceptance/process-editor-complete-20261109.md)、[PROCESS_EDITOR](../specs/current/PROCESS_EDITOR.md) 與最新使用者指示。

| # | 需求 | 本輪狀態與驗證界線 |
| --- | --- | --- |
| 1 | 橫向工段、搜尋、縮放、全螢幕 | 沿用 main；原生桌面／手機待驗 |
| 2 | 新增、拖曳、平移、連線、高亮 | 沿用 main；新增衝突／刪除依賴回歸；手勢命中待驗 |
| 3 | 類型適用分頁及隱藏舊資料 | 保留 main/#99，不因隱藏刪資料；完整UI待驗 |
| 4 | 雙語卡片、文字、本方塊照片 | 保留原實作；合成表單與照片 guard 回歸，IME／實際照片待驗 |
| 5 | 連線、刪除影響、自動整理 | 納入刪除節點與新邊整組相依；合成競態通過，原生排列待驗 |
| 6 | 編輯視窗、跨分頁輸入、Apply/Save | 未送表單與 journal 為 RAM；明確 Save；晚到表單／離頁回歸通過 |
| 7 | BOM唯一性／跨工段 | 保留 main handler 與最終 Save驗證；不另改BOM資料模型；真實兩人流程待驗 |
| 8 | IPQC占用及機器來源 | 保留 main/已核准來源；新頁主檔只能引用正式工段；實站待驗 |
| 9 | 主內容先顯示、失敗不當空流程 | 保留 main；不把空scaffold當dirty；冷啟動與讀失敗實站待驗 |
| 10 | 空工段不誤判dirty | 新增實際controller回歸：系統補空不是修改；真增刪仍dirty；40秒原因未量測 |
| 11 | 切頁／線／工段直接放棄未存 | 已整合 silent checked departure；不提示、不自存；保留已送UNKNOWN及原結果查詢 |
| 12 | 一鍵Save當前畫布、保留其他已存 | 已整合 scope filter，節點／內容／連線同存；同頁類別保留其他journal；整份已存製程送審 |
| 13 | fresh比較、整組我的／對方 | 已整合群組選擇、無衝突保留、刪除／連線／同ID／選擇中peer改版；revision/CAS保留 |
| 14 | 取消輪詢、恢復、undo/redo | 保留#100；移除畫布多餘入口與未送恢復；必要權限fresh與已送結果查詢保留 |
| 15 | 類別defaultStages | 沿用 main；新合成端到端驗核准類別優先、明確空設定、legacy fallback、C/GIA CONG五工段及產品例外路由不覆蓋類別；實站待驗 |
| 16 | 核准工段類型與機器連動 | 保留#99；新增主資料頁來源核對，草稿工段不可冒充正式；新LINES→核准工段→類別→畫布Save全流程合成PASS；真人實站待驗 |
| 17 | 各頁草稿與權限分離 | 納入 AB.catalog／C.catalog／LINES API、UI、Save、import/export與CAS；只接受已存在可信page-v1；未啟用或遷移真資料 |
| 18 | 送審／撤回／核准分開 | 納入draft-review-policy：模組submit/withdraw與最終approval分離；return修正可退回本人案件、自己的最終核准仍受限制；可信政策標記未開 |
| 19 | 原頁核准版本只讀、回草稿 | Canvas及新AB/C/LINES已接selector、唯讀快照、actor/revision/late-display fence、回草稿fresh權限；PROCESS主資料後續重繪修復受原UNKNOWN32阻擋，其他頁不宣稱完成 |
| 20 | Save後計數與效能 | #101可見CanvasJournal投影計數；實際selector測試通過；真實進頁／切頁／Save/Submit效能未量測，>5秒優化、>10秒優先 |

## 相依與安全邊界

新主資料頁保留已核准catalog／topology各自來源、版本ID與不可變Save；LINES覆蓋AB/C兩個partition，catalog不擁有lines。舊pending不自動丟棄，未完成處理則拒絕切換。一般shared-state寫入不能初始化或覆寫managed layout；既有legacy operation receipt仍由原owner查詢。public state只投影已核准內容並先驗來源，隱藏新舊私有草稿。新頁寫入在R2後／CAS前再次檢查session，其他頁既有kernel行為保留。

`page-v1` 和draft review可信標記皆未設定；沒有schema、DB/R2、真人ACL、備份還原或部署操作。即使程式齊備，現有正式資料仍需獨立唯讀盤點、pending/UNKNOWN分類、保全及經授權切換，不能用query/env/一般POST啟用。例行FQC整頁與其歷史／照片UNKNOWN屬更廣跨模組相依，本輪不複製舊候選已知缺陷，也不宣稱13頁全生命周期完成。

## UNKNOWN操作仍未重送

原32-path `github.create_tree` base `d52e44319e6453a45bf9db8b0ff66d3f0c0ebec9`，expected `5005cba09d970cec70334d6bd540db1b599858d2`，約4789秒後中斷；讀回422／404不能證明沒執行，仍為UNKNOWN。未重試、拆分、換工具重送；舊243-path及設備拒絕也未重試。

路徑相交須區分：index只組合本次獨立模組／計數tag；version-draft-ui只有generic mount callback，Canvas及新主資料歷史使用獨立 `ProcessCanvasHistory`，沒有帶入原UNKNOWN32的PROCESS owner/prepareRender/app.js重繪修復。scripts-build僅驗本次main50→55實際bundle及單次載入，沒有重送原62檔fixture修復。role fixtures／舊proof修復未套用。新proof以遠端已確認#104前身tree `8eff928e54b9da8d483e8084fabc7ef1bdcea82c` 做精確逆向，main原pins及負向測試保留。

## 驗證與剩餘項目

本機當前畫布核心510案例PASS；核准歷史／頁權限／保存快照／腳本組合88案例PASS；主資料邊界、name Save、真正route SQLite/MapR2、UI、工具、public authority及review回歸逐腳本PASS。main原legacy橋接逐byte保留，199個既有橋接／保存／權限回歸全通過。測試組有重疊，不相加成覆蓋率。最終來源159及原收據/cache39案例合組198項PASS，lint及非增量TypeScript PASS。最終guarded build在真實本機7753e6ff47394a33c19dfd2ff849f70310e2c7f9回exit0，postbuild auth boundary PASS；後續只有文件收據修改，產品輸入相同。GitHub CI依遠端新HEAD另核對。另20個跨模組合成回歸及12個權限政策案例PASS。

依賴為相同lockfile的實體副本，沒有聲稱全新安裝。synthetic DOM不是原生瀏覽器；SQLite/R2為合成記憶體。擴大回歸誤選含原生Chromium的IPQC scope測試，9案例被既有socket/ptrace限制阻擋；該原生組停止，未換路重試。其餘20個合成案例另組全數通過，不能用它們抵銷原生未完成。

剩餘：PROCESS主資料UNKNOWN32修復、跨模組整頁相依、可信資料切換、原生桌面／實體iPhone／IME／兩人測試站、C/GIA CONG真實生命周期及效能。完整發布狀態仍NOT_READY。#104保持Draft，無合併部署。

本輪自動審查曾拒絕恢復舊pollMaster排程內容（操作未執行，原因為可能恢復固定輪詢）。採取安全替代：直接移除排程及所有啟動／重置呼叫，實際測試改為明確要求排程不存在；既有無輪詢inventory及固定前身負向來源pins保留，沒有重送被拒排程。

GitHub初次整合head 0d9ea8a16de70c20d7b1ae5a403f1b9a9cda7a6f 的專項CI（42831612397）及IPQC C通過，但Feedback／AB C／PROCESS因舊cache-tag fixture及Feedback入口多讀master control失敗。已對齊本次精確tag、讓非master入口不讀control，另修新頁切換URL；原失敗Feedback整組293及PROCESS整組338本機全通過，後者含AB C原失敗組。沒有刪除或跳過失敗斷言。最終遠端HEAD的CI仍需獨立讀回，不引用初次head的通過替代。

第二次head 96df92fd684122aab4633538eddd00c186974a58 的專項（42832781363）、Feedback（42832781206）及IPQC C（42832781031）通過；AB C／PROCESS進一步執行舊版Begin協定檢查時，原固定hash尚未組合新候選來源而失敗。只新增本候選→已確認#104前身的精確組合，保留原Begin所有hash／rules／歷史scope及負向斷言；舊protocol測試先驗現候選，再對原前身測原反例，沒有取用或重送UNKNOWN32既有proof修復。六個真正舊handler都以422拒絕新Begin且D1/R2零變動，另67項組合／原pins反例PASS。這批當時僅改測試；後續首次進頁修正與新build以最新紀錄為準。最終HEAD CI需另核對。

第三次head 22984fc8b3befd0bfddee1b15279cd4491a97a81 的專項、Feedback、IPQC C通過，但PROCESS後續真瀏覽器冷啟動／離頁組有6項在首次進editor就緒前逾時（run42833825421），不是環境socket拒絕。已在實際controller＋client＋signed handler的合成環境重現：先paint後read會過早掛歷史權限watcher，首次access回覆使尚未取得flow的history owner失效，導致AUTHORING_LOAD_REQUIRED。兩個中越文／inline-records新反例在修正前全FAIL，修正後全PASS；歷史元件改為當前flow與view/history權限就緒後才掛載，原撤權／唯讀fence不放寬。重跑畫布510、歷史政策bundle85、來源與cache198全部PASS；lint、非增量TypeScript及真實8c6a88a guarded build/postbuild auth PASS。native原逾時及斷言未修改；最終新HEAD需以原CI再驗。

第四次head b91a50be2569afadb6b8b6e1aa24cee34c34ea93 的AB C run42836578436／job129900277393已越過首次ready，但同六個native案例在返回後modal name欄／連線操作失敗。實際ProcessEditor.bind會先掛handler fence，panel發現舊history root已斷開後再增加epoch；重新guard卻包住舊fence，內層過期epoch令新回呼也永久拒絕。兩個真controller中越文反例修前均FAIL（fresh callback 0≠1），修後通過。改以私有WeakMap記錄原callback，只替換同一DOM節點／事件的fence；舊被擷取回呼仍拒絕，搬到其他節點也不能重新授權。歷史26、整組歷史政策bundle88、畫布510、來源cache198均PASS；lint／非增量TS／真實7753e6f guarded build及auth boundary PASS。原native測試檔、modal／linking斷言、未存保護及等待時間都未改，需新HEAD原CI再驗。


## 續作：分類生命週期、權限與 Local safety（88f8之後）

88f8 的整合、AB C、PROCESS、Feedback、IPQC C 五個 workflow 成功，原 AB C compiled abandonment/modal/linking 17 項通過；但 Local safety run 42838989816 最終失敗，不能宣稱全綠。兩處失敗均完整保留檢查範圍後修復：

- `test-process-ipqc-choice-dom.cjs` 的歷史基線原文保持不變，候選提示明確要求中越文「先留目前頁面，再存取草稿」。其餘完整展開 DOM、49個選項／占用／舊關聯／唯讀／失效回呼及不額外fetch保持等價；8組PASS，初始節點1644→566。沒有只刪除提示斷言。
- `test-process-flow-record-mutation.cjs` 原本僅擷取prepare表達式，遺漏實際guards與stagedSave。改用已確認55d4672來源的AST擷取完整正規化及revision來源；檢查Apply/staged/fallback/null/zero，defined/missing/own-undefined guard、原物件descriptor未變、patch引用、moduleAction及17/0/31版號。114組實際handler/CAS/receipt/來源錯誤路徑全部PASS。此檔與IPQC提示測試皆不在原UNKNOWN32範圍。

新增兩個實際handler測試，加入整合CI，沒有重做main已正確的產品程式：

- `scripts/test-process-page-lifecycle.cjs`：16項、inline/records兩種儲存；AB類別及C/GIA CONG五工段。驗草稿LINES不可當正式來源、核准新工段繼承正式custom類型且ID獨立／不複製機器設備、原來源未變；核准catalog才改類別defaultStages。直接執行當前app.js的categoryStageCodes，含明確空設定與legacy fallback，產品例外路由不覆蓋類別；再由真正process-authoring handler原子Save保留隱藏工段與其他頁。
- `scripts/test-process-page-roles.cjs`：14項、inline/records兩種儲存；僅LINES角色可到自身API、不獲AB/C頁，edit導出Save不改stored save grant；模組approve只導出submit/withdraw/修正，不能最終核准。缺少Frank audit provenance與CAS中途撤回high grant均拒絕，合法獨立審查才核准，已結束案件仍409且不改root。trusted marker與帳號僅存在記憶體測試，不啟用真人ACL。

#103在固定head `81791d18fe3f36c1e3ab2ace783d58cf5888a307` 的相依已唯讀盤點。相交產品檔案為 `lib/user-access.ts`、`public/process/access-policy.mjs`、`public/process/master-data.js`、`public/process/shared-draft-client.js`、`public/process/index.html`，另有文件與來源proof fixtures。未覆寫或修改#103。外部離線SourceTextModule語意組合驗證17項PASS：保留#103 edit→Save／Feedback不衍生data view，同時保留#104 LINES owner mapping與trusted draft-review-policy／最終approval fail closed；這只是政策組合驗證，不是雙分支整體合併驗收。master-data需保留#103切換前LINES只讀入口與#104 page-v1 writer dispatch；shared-client需同時保留#103 Save readback等價與#104 issued command/receipt fences；index與來源pins須依最終組合重核。

原UNKNOWN32的本機base及expected tree現可唯讀列出完整32路徑，仍不證明遠端執行結果。PROCESS主資料重繪涉及app.js、version-draft-ui及其fixture，仍未重送或改道重建；本次只修兩個不在該範圍的既有測試、加入新合成端到端驗證。

| 剩餘缺口 | 精確依賴／安全下一步 |
| --- | --- |
| PROCESS主資料原頁核准歷史重繪 | 原UNKNOWN32執行結果未明；先由原服務確認操作結果／既有tree，不重送原內容 |
| BOM/IPQC等所有頁原頁歷史與例行FQC整頁 | 尚未接全頁owner/history契約；FQC舊候選有撤權／照片UNKNOWN已知缺陷，需獨立owner設計與回歸，不能直接搬入 |
| #103與#104共同產品檔案 | 依上述五檔逐hunk語意組合，保留帳密/Feedback成果與本PR receipt/page guards，然後驗最終共同HEAD；本PR未擅自合入尚在工作中的#103 |
| 可信layout／review policy切換 | 真實pending、UNKNOWN、baseline與audit先唯讀分類保全，經授權切換；目前禁止真DB/R2/ACL操作 |
| 真人兩人、實體iPhone/IME、實際C/GIA CONG及效能 | 本次記憶體／DOM測試不能取代；需隔離測試站資料及裝置驗證，未宣稱先前實站成果等同新版驗收 |

這批不改產品輸入，沿用7753e6f已通過guarded build；新增測試及lint／非增量TypeScript另驗。發布狀態仍NOT_READY，PR仍Draft。


### Local safety後續檢查續修

預先執行原Flow失敗點後的合成測試，發現五個舊fixture契約，產品程式未改：

1. FQC lifecycle8 的self-review測試現分開驗：最終核准本人案件仍409 `SELF_REVIEW_CONFIRM_REQUIRED`且D1/R2零寫入；發回是修正，無自我核准確認也可回草稿，案件returned／pending清空／正式版本不變／audit.selfReview=false。179組實際paired handler、CAS、immutable body故障與原收據回歸PASS。
2. contentIssues read-scope先由本PR已驗精確Canvas來源inverse去除新增approvedOnly入口，再執行原固定baseline/hash/selector/POST字串及所有變造反例；實際測試仍載入當前route。37 paired reads（34 exact、3原有fault policy delta）及74 GET全零寫入PASS，沒有將正式路由放寬為任意包含字串。
3. scoped read pause不重新加入被移除master scheduler。若有舊scheduler仍測舊callback；本候選則執行完整master-data與原master bridge initializer、7次shared-state更新事件，assert scheduler identifier不存在、零背景GET／timer／interval／storage write。其他模組拒絕讀取停止、明確GET-only重試及權限owner案例保留；整組50項及內含Node 28項PASS。
4. canvas silent discard不再要求未送RAM內容有local recovery envelope。沒有UNKNOWN時，即使localStorage quota也不需寫入或警告；有UNKNOWN時，必要isolated payload清理若quota失敗仍阻擋，原anchor/sent bytes不丟失，成功只清掉未送內容。BFCache不復活未存、GET-only原結果恢復、篡改anchor拒絕與callback失敗rollback全部PASS。

5. Canvas Fit仍要求undo/redo可還原layout；現驗已移除的兩個action均不能修改layout/journal，保留負座標、zoom、指標世界座標、連線ID、origin與late paint全部9組幾何回歸。

上述五檔均不在原UNKNOWN32路徑，沒有用拆分／換工具重送該操作。原8項IPQC／114項Flow修正後的新head a433687，五個模組workflow再度成功；Local safety尚在執行，這五項後續fixture在下一候選CI另驗，不能把a433687視為已驗完後續修改。


同一無輪詢契約另有 `entry-performance/poll-wiring.test.mjs` 仍硬性擷取master pollMaster。已改為明確要求master scheduler與全部呼叫不存在，原六個保留legacy producer的16個允許／拒絕／取消晚到callback反例仍全跑，IQC額外owner binding案例保留；完整master initializer／7次事件零讀取另由scoped-read-pause覆蓋。其餘begin budget、shared read races、FQC CPU/render等價、editor readiness五組VM測試通過。沒有恢復任何產品timer，也沒有用合成VM宣稱原生或真實效能驗收。


## 71feb2f CI終態與共用client後續修正

71feb2f 的整合專項、AB C、PROCESS、Feedback、IPQC C五個workflow成功；Local safety run42848965218／job129944090518在step31失敗，後續32–57跳過，不能宣稱全綠。step1–30已通過，包括原先IPQC提示失敗的效能／離頁組及原native abandonment/modal/linking。終態日誌證實本輪Flow114、FQC179、read-scope37配對／74 GET、scoped-read-pause50、silent-discard及Fit9均已通過；新失敗在稍後 `test-shared-draft-client-v3.cjs` 還期待「本次未送審」，實際共用錯誤適用Save與Submit，提示為「本次操作未完成」。

這次不是修改產品或放寬revision規則。三份client模式測試（普通、default、guardAccessResults opt-in）都嚴格核對中越文完整提示；新增DRAFT_REVISION_CHANGED_RECONFIRM 409於既有原錯誤／status／requestId／details／Save fence測試，保留immutable error descriptors、未知原code不轉換、quota不送出、500／失聯必須先查原receipt、排隊Save不得越過失敗、換帳號不能採用晚回覆等所有反例。各10組PASS。

另跑實際shared client＋authoring＋Canvas＋durable store／owned ledger的139項合成堆疊回歸，含inline/records競態：peer於比較後POST前修改仍必須reconfirm、取消與失效owner不送POST／不改root、撤權保留本機內容、UNKNOWN只查原operation、不覆寫peer內容。這些是真正既有handler/controller，HTTP／儲存／DOM僅合成，沒有真人帳號或DB/R2操作。

預跑step31新失敗點之後61個腳本：首輪57 PASS；兩個client副本及panel三個舊契約已修正並各自重跑PASS；另1個 `test-ipqc-ab-ack-deny.cjs` 間接fixture啟動Chromium，觸發既有socket/ptrace限制而未完成，沒有重跑或換executor。篩選只看直接來源漏掉間接原生依賴，這是測試選擇失誤；不把環境阻擋列為產品PASS。沒有修改該原生測試。原有GitHub CI流程維持不變。

panel修正保留原固定完整baseline hash與source inverse、全部markup/status/buttons/flow/local/receipt/session/request/error/view等價及序列化比較；僅將兩個已審閱的中越文「最新共享預覽→Save時衝突」提示單獨逐字驗證後對齊。新增實際兩種語言dirty／peer案例，強制兩種提示都被執行；17組PASS，未刪除整個markup比較或忽略狀態差異。

#103已前進至固定 `22567b269a8d3040fc76ee9ee8619dac338337c6`（仍open Draft）。唯讀重核後產品交集仍為前述五檔，另增加與本PR的FQC lifecycle測試交集，需保留兩邊完整斷言。離線政策組合17項只針對較早81791d1，不能充作22567b2或未來共同HEAD驗收；沒有覆寫或吸收尚在工作中的#103。

本批仍僅測試與文件，產品輸入不變、可信marker未啟用，完整目標仍NOT_READY。新HEAD的Local safety與其跳過後續需重新核對終態。
