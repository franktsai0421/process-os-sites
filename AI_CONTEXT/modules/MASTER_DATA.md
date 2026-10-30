## 2026-10-30 整合補充

AB/C bridge 歷史使用明確 history/edit/restore 權限，還原新增/刪除能力仍由後端依差異判定。送審確認後重新核對身分/epoch/delivery/generation/savedId；working-only 新修改保留固定 Save 契約。刪除引用涵蓋存活 publishedProcess 快照。見[整合記錄](../../docs/acceptance/PR51_MAIN_INTEGRATION_20261030.md)。

## 2026-10-30 AB／C 後續操作釐清與載入改善

AB/C 送審視窗用 optional masterSnapshot 顯示本次 saved 時間／人員與未包含的 working 差異，每頁 10 筆，開啟焦點停在標題，避免跳過提醒；只提交原 savedId，既有送審版本過期拒絕保持。current selector 不追加歷史版本，統一歷史區去除舊快切按鈕、保留操作紀錄和唯讀／還原入口。masterChanges 分別計產品／類別／線別／工段，工段順序也算變更；還原無差異有停用原因。

master preserveView 對新 DOM 不寫入零捲動，避免啟動強制排版；非零捲動和焦點仍還原。master 頁停用瀏覽器自動 scroll anchoring，避免外層頁籤裝飾在還原後再推移畫面。BOM 同 delivery／identity／revision 的成功摘要可供同頁重畫重用；輪詢、換頁、換身分、錯誤、未知結果與真正審核仍讀取。VersionDraftUI 歷史分頁讀取時鎖定控制，成功後才提交游標；失敗保留頁碼與內容，允許明確重試。XLSX 載入順序嘗試沒有穩定提速，已恢復原順序。無 API、設定、schema 或資料遷移。驗收見[後續修正](../../docs/acceptance/AB_C_DOT_HANDOFF_20261030.md)。

## 2026-10-30 AB／C 操作說明與按鈕效能追加

路線標示依既有 inherited 模式分成跟隨與獨立；獨立但同路線者仍列入獨立清單。每次 productRows 只對可見群組計算一次 groupRoute，Map 不跨 render 保留；重複產品檢查及穩定 ID 查找消除重複掃描。橋接器僅 Apply／必要的表單 Save 複製完整快照，原操作順序、ownership、guard、unknown 與 pending 保留。

VersionDraftUI 以 optional masterScope 啟用 AB/C 範圍提醒與文案；DOM 使用 data-vd-master-scope，避免觸發既有 data-master-scope 導航。shared history／restore 同樣 opt-in，其他模組不更動呈現。規格見[群組路線](../../docs/specs/current/GROUP_ROUTES.md)，測量與驗收見[追加優化](../../docs/acceptance/AB_C_DOT_HANDOFF_20261030.md)。共用歷史清單／案件載入期間禁用非關閉控制，避免較晚的清單回覆覆蓋已切換的封存頁；關閉／Escape 保留，沒有新增寫入通道。無 API／持久模型／遷移變更。

## 2026-10-30 AB／C、引用與草稿切頁

目的頁投影可能沒有另一個 catalog；產品／線別／工段表單只作可用資料的本地重複提示，跨範圍唯一性仍由後端 CAS 強制檢查。`master-product-references.ts` 只掃描結構化產品／群組關係；刪除前 GET 提供依權限遮蔽的清單，正式 Apply、Restore、Submit、Approve 再查同一 revision 的完整歷史。無法載入歷史不放行。類別不能連鎖刪除產品／預設路線，具畫布引用的類別改名也拒絕，沒有自動搬遷舊 workspace。

共用離頁 adapter 使用 working 對 saved（未保存則 active）判斷；橋接器拒絕過期身分／世代 ACK，結果查詢期間保持 busy 到新 saved 讀回。查詢按鈕在 AB／C 主操作區。IME 組字結束才更新產品結果。已核准群組預設隨 runtime catalog 傳到畫布；不把 editable draft 當生效依賴。驗收、效能及 dot 重疊檔案見[交接](../../docs/acceptance/AB_C_DOT_HANDOFF_20261030.md)。

2026-10-29 lines permission candidate: line-admin remains an entry to AB/C shared drafts. Choose an authorized AB/C scope before workflow read; with neither view, show an actionable permission notice without rejected fetch loops. Legacy action checks use selected AB/C cells; stored lines action values remain visible/read-only in settings and are not migrated into AB/C grants. No workflow partition or data change.

## 2026-10-29 首次進頁局部優化

index 的 URL 顯示意圖僅控制 process-master boot 期間隱藏 shell 不參與排版；移除 boot 旗標後恢復。權限仍由 bootstrap/API 決定，其他頁面無此規則。速度與功能證據見 [入口報告](../../docs/sites/PROCESS_ENTRY_PROFILE_29102026.md)。

## 2026-10-29 流程資料離開提醒

只在流程資料頁 beforeunload 檢查設備未套用、名稱組字／未確認、照片待處理及 working 相對 saved／active 差異，提示不寫入。乾淨／已 Save／待審不誤提示；原傳輸層保護保留。18 項 Chromium 結果見 [補驗](../../docs/sites/PROCESS_FLOW_DEPARTURE_PERFORMANCE_29102026.md)。

2026-10-29 審核按鈕補驗：流程專屬 reviewer 曾被未授權 AB／C／BOM 讀取 403 阻擋；master-data／master-review 改按有效 view 權限讀取，BOM 背景輪詢同限。獨立 reviewer 完整退回／核准、五種取消及歷史分頁共 10 項瀏覽器補驗通過，見流程 CLOUD 驗收。

2026-10-29 續修：名稱只合併尚未送出值，第一個 in-flight 命令與 ACK 原值保護保留；Save 等待最後值，失敗不自動重試。名稱及設備搜尋改用真實 composition 事件 listener。隔離 20 事件測試 Apply 20→2；完整瀏覽器 39 記錄與 native 14 組通過。詳見本次驗收，不能當既有站已驗證。

## 2026-10-29 流程資料修復候選

設備搜尋 ownership 改綁設備面板，不再綁會被 VersionDraftUI 替換的首節點。開始／保存／送審僅重畫本模組。設備套用仍只改 working，新增取消確認與照片重試；流程圖片支援查看、更換及移除。新增流程使用 UUID 及選用 editorType，核准後製程新增／編輯選單按類型顯示，舊 templateId 保留。

新增授權引用 GET；刪除 Apply 與 Submit／Approve 在同一 CAS 讀取內重新檢查目前 authoring、舊版有效／草稿／待審及 published 引用。閉合歷史快照保持原文，不自動解除引用。列表資料不足時不再把設備引用顯成零；設備開啟時按需查詢。具體檔案、驗收與剩餘限制見 [唯一紀錄](../../docs/sites/PROCESS_FLOW_CLOUD_29102026.md)。

## 2026-10-16 既有欄位原值防護與名稱輸入鏈

master AB／C／PROCESS、process authoring 及 equipment 的既有 set 欄位必須附對應 path 原值 guard，沿原 kernel 判斷 stale；不同欄位仍可合併。原 immutable codes、引用、角色、pending、CAS 與審核規則保留。master／authoring 對已有成功 receipt 的精確命令保留 replay 相容；仍核對 actor 與 fingerprint，沒有新無 guard 命令通道。authoring 原 whole-operation 相依 guard 仍有效，不能把同方塊不同欄位強行當成可合併。

PROCESS 即時名稱輸入在 bind 時固定原值、actor 物件及 generation，依序寫入且只在成功 ACK 後推進自己的基線；失敗／unknown 阻擋後續自動寫入。Save 等待連續輸入及同身分尚未解決的 detached binding；Submit 等待輸入但只送最後成功 saved snapshot，不自動 Save。語言／設備 repaint 重建頁面時，僅同 owner 物件、generation、template key 且可編輯的未解決 binding 移交可見字串與原 baseline／pending／failure／lastQueued／IME 狀態，並使舊 node 事件失效。clean ACK、換身分／世代或唯讀頁不挪用。這不把未 ACK 值寫進 working、不建立新基線或重試；中越文提示只格式化顯示，raw error、queue、receipt 契約維持。H9 修後原生及記憶體／獨審範圍見[整合進度](../../docs/local-integration/20261014-github-upload.md)。

產品表單保留既有 routeMode 屬性；只有新增、明確 mode／default 選擇，或實際 line／category／stages 變更才寫入模式。原 group default 原子 guard、invalid-null 拒絕、角色、pending 及 CAS 不變。15 組記憶體案例與獨審，以及另一產品 105B100081 的正常 name-only Apply／名稱恢復／true reload 和 raw 路線不變佐證，不能當原 105B100051 QA working exception 已精確還原。該例未 Save／Submit／Approve，整份主資料 AB 維持 HOLD；不等同獨立 IPQC-AB 品質庫的四案流程。C 工段及 authoring operation 名稱的同 frank stale 拒絕／保全／正常恢復證據另依差異沿用；authoring whole-operation guard 不放寬。沒有持久 schema 或資料模型變更。 主資料簡短操作歷史僅在renderer相容既有label／note／actor字串（含空字串優先），否則讀V3 action／comment／actorName／actorId並escaping，四個已知動作依當頁中越文顯示；不改raw history／投影／API。此後續修正經現有component與隔離signedhandler測試／獨審，H12已限域真GUI接受核准／送審的中越文、actor及原理由保全；其他動作別名依既有實作測試，不擴稱逐一原生接受。 BOMExcel.refreshProjection 重用既有 active metadata 投影邏輯；正常登入在 shared refresh 成功後、進入平台前更新本機投影，保留 replaceAll 空清單、未儲存 working、identity／queue／cache 契約，不寫持久資料。H13 正常 frank 登入後354主件／6105列與真重載一致；不擴稱所有登入角色已接受。 製程 authoring 查看／審核入口固定點擊時 owner stamp、pending ID 與 generation，等候既有 loading 後以同 client 讀取無 since token 的最新 control／permissions；同身分／頁面／世代／案件仍相符且權限為嚴格 boolean 才開啟。失敗、unknown、同步失敗或案件改變維持 HOLD，不自動切另一案或重送；adopt(result,false) 不重置未套用本機內容。原 history 入口、reviewDecision、後端角色、pending 與 CAS 不變，修後原生結果另依[整合進度](../../docs/local-integration/20261014-github-upload.md)。

## 2026-10-15 模板照片與主資料操作

流程模板照片準備前捕獲actor／draft／working與input連接狀態，await後重核再依現行shared.diff套用；回覆不重畫失效actor／節點。此段為當時狀態；2026-10-29 候選已增加流程照片 preview／更換入口，見本文最新紀錄。設備與模板媒體均沿master:PROCESS原nested field guard／Save／R2記錄，不新增照片資料表。AB/C分類、群組及路線變更維持原scope和CAS；使用者矩陣VM不替代14原帳號GUI接受。[唯一按鈕與資料證據](../../docs/local-integration/20261015-button-coverage.json)。

## 2026-10-14 shared-state未知結果與改回舊值

queue只有在未posting、未paused、未blocked且desired等於confirmed baseline時，才可清除該dirty鍵。網路結果不明或衝突後的舊baseline不足以證明伺服器仍相同；改回舊值必須保留desired/recovery，經明確儲存與原CAS確認，禁止無dirty而誤報成功。正常未送取消維持不POST。唯讀PROCESS鏡像不清pending或推進confirmed revision；V3 operationId未知收據仍屬獨立client，不能和shared-state ACK混稱。[直接情境及限制](../../docs/local-integration/20261010-permissions-admin.md)。無持久模型變更。

## 2026-10-14 BOM審核清單摘要與語言／手機觸控

`reviewMetadata=1`沿既有workflow GET身分／權限驗證，只傳清單metadata；不讀取完整快照getter，不修改持久內容。BOM審核摘要與編輯模型分開，摘要不推進full-model token，帳號／權限／full revision過期回應隔離；動作前才重讀full control，差異按需載入。未變更輪詢不重繪清單與差異。流程說明用完整中越詞組；表單業務值保持原文。手機頂列至少44px。生效候選、定向驗收及未驗界線見[同一進度](../../docs/local-integration/20261010-permissions-admin.md)。無schema或業務資料修改。


核准PROCESS的applyActive採ProcessSync.projectProcessMaster唯讀鏡像，不排一般shared-state更新、不推進baseline／revision；若processMasterData或masterDataControl有queued／in-flight輸入則不覆蓋。已有master/V3 control時app不執行legacy啟動補種，空白legacy路徑保留。真正dirty、待審鎖與未確認回執不清除。純讀fresh-tab／refresh及VM分項證據見同一進度；API摘要只增選用傳輸模式，持久資料模型不變。

## 2026-10-13 無變更匯入與權限視窗

`bom-workspace.finishImport` 比較套用前後語意摘要，零差異與全數保留不排入本機import佇列；既有其他待送修改不受影響。`user-access` dialog同時排除個人`data-ua-matrix-search`及角色`data-ua-role-search`的搜尋input，真正表單／權限input仍觸發離開保護；新版asset access7。舊已載入頁closure不能僅由磁碟／HTTP最新SHA推定，直接授權後 primary 越文角色搜尋取消及 ADMIN 個人／角色搜尋取消已分項通過，真正變更取消離開能保留輸入；最後放棄已由使用者原生確認、代理事後核對關閉／原值與修訂不變；代理自動原生提示仍NA，見同一進度。權限CSS僅在回報浮鈕位於dialog時保留footer空間，中文及越文窄版主要動作至少44px，角色格／繼承／重設規則不變。登入頁完整詞組中越翻譯及中文欄位誤字已修，未翻譯業務input值。真實報表副本完整審核链与補驗範圍以[同一驗收紀錄](../../docs/local-integration/20261010-permissions-admin.md)為準；未變業務schema或API契約。

## 2026-10-12 BOM 增量匯入與有效授權

`bom-domain.mjs` 按 occurrence ID 合併同主件，保留缺列／後代及原兄弟順序，新位置接至穩定父位置；比對預覽標明合併後結果。新 `import-digiwin` 帶 `baseDigest`、`importMode:incremental-v1`，服務端重新 SHA-256 核對，維持 2 MB／CAS／回執／權限／待審鎖。舊小請求比對格式相容且保留缺列；過大舊請求仍 413。BOM 本機隊列／已拒絕請求不再誤標已儲存；同操作成功重試清除本操作失敗記錄。下階表格投影相對層級，編輯／匯出及深層數值仍用原 ERP 層級。

角色更新比較前後有效格才增加各帳號 authEpoch；主要管理員獨立完整授權，範本名稱／說明變更不登出。本人資料卡含正式角色名稱；普通人不取得角色範本。最新 UI 唯一操作人為本 Codex 任務，3035 使用六個合成帳號及獨立 D1/R2，3032 原帳號和複製案件保留。驗證與限制見[同一收據](../../docs/local-integration/20261010-permissions-admin.md)。下方 2026-10-10 的 Dot 操作分工屬歷史。

## 2026-10-10 使用者與權限候選

共用access-policy 151格與target-specific管理規則，user-access API專用CAS＋保護備份；角色、個人override、啟停、逻輯刪除與自己的密碼均server核對。普通人GET只讀自身，public shared-state／media／409不回傳別人帳號設定或秘密，舊整陣列寫入封鎖。UI角色搜尋與個人搜尋獨立；actor/object/generation隔離GET／POST／render的舊回應。真實14帳號移轉未套用，詳見[規格](../../docs/specs/current/PERMISSIONS_ADMIN.md)、[候選收據](../../docs/local-integration/20261010-permissions-admin.md)。BOM多階後代索引及保留composition輸入元素已候選修正，原生IME與完整最新UI由Dot驗證。

## 2026-10-10 介面與主資料送審

master-review 統一 AB/C/PROCESS/BOM 固定案件清單，BOMWorkspace 提供案件／權限／審核介面；資料頁查看案件以 scope + ID 定位同頁。待審與歷史分開，撤回立即離開待審，保留原因與稽核；差異按需讀取。詳見[統一審核驗證](../../docs/local-integration/20261010-unified-master-review.md)。活動 BOM 頁條件輪詢，保留未儲存輸入與捲動，請求／帳號隔離過期回應。未儲存或衝突時不送出舊快照。master-review 差異表僅展開時計算；共用 VersionDraftUI 歷史只在展開時讀取。[驗證與限制](../../docs/local-integration/20261010-ui-language-review.md)。

## 2026-10-10 BOM 原檔與共用版本

BOM資料頁改由`bom-workspace.js/css`及共用`bom-domain.mjs`處理，舊bom-search介面由此覆蓋；`bom-excel.js`仍載入已核准replaceAll資料作相容消費。`/api/bom/workflow`接`bom-workflow.ts`至既有V3核心，只有核准投影有效bomOverrides；shared-state與canonical sync不得繞過。十欄、原始L1消費、位置ID、草稿保存/待審鎖/歷史與引用提示見[規格](../../docs/specs/current/BOM_REBUILD.md)。最初交付未核准；最新日常已經人類明確授權核准V6，詳見候選收據；[驗收](../../docs/local-integration/20261010-bom-rebuild.md)記錄實際限制。

## 群組最大路線（2026-10-08）

master-admin-ui 共用 maximumRoute / groupRoute / setGroupRoute；AB/C 支援群組預設及產品例外，例外直接顯示路徑。修改同線別類別保留路徑；群組 Apply 同時保護產品集合及工段順序。未變更輪詢略過完整投影，舊帳號/請求回應不覆寫，重繪保留捲動。見 [提交範圍與驗證](../../docs/ipqc-reference/20261008-local-commit.md)。

# 主資料實作現況

## 2026-10-07 群組路線

追加最大路線：同線別／類別產品工段去重聯集，按產品先後關係排序，衝突依主檔順序並提示；既有預設分開保留。採用最大路線只改群組及模式，不改產品 stages；單品預設按鈕只先改表單。例外實際路徑直接顯示；2026-10-08 移除產品／例外「查看路線」按鈕與死處理器，產品換類別保留現有 route。群組 Apply guard 包括 lines 排序與 products。見[最新驗收](../../docs/ipqc-reference/20261007-group-routes-max.md)。

[規格](../../docs/specs/current/GROUP_ROUTES.md)、[驗收](../../docs/ipqc-reference/20261007-group-routes.md)。master-admin-ui 提供群組預設及產品例外，清單40筆分頁僅限制顯示；master-shared-client整份原子Apply、產品集合guard、state revision輪詢及帳號／請求失效保護。master-data僅投影active，保留defaultStages；輪詢可見scope且未變更不重繪，必要更新保留捲動與焦點。移除預設不刪產品路線，實際路線刪除保留權限與確認；工段主檔引用含群組預設。

狀態：Current source notes；整理自本 checkout 既有現況文件。2026-10-05只定向核對來源，不重跑功能測試；歷史數量／版本與PASS僅屬原日期證據。確認需求見[現行規格](../../docs/specs/current/README.md)。

## User Roles

- **Primary ADMIN**: exact enabled formal `frank`; full cells and role/ADMIN creation. Other ADMINs use configured cells and protected self/peer/primary targets; own-password exception remains. No user-ID `admin` role coercion.
- **RD 主管 (`rd`)**: configurable access centered on review/approval, version comparison, status visibility, editor viewing, and selected master-data operations.
- **製程人員 (`staff`)**: configured module/action access; own profile/password only. Legacy line fields remain stored, but lines no longer authorize or deny platform actions.
- **產線設備 (`device`)**: enters a selected line/stage directly and sees only the player.
- **公開查看者 (`viewer`)**: read-only access while the configured public window is open; no protected writes or ADMIN management.
- Only primary Frank manages role templates. Roles retain legacy `views`, `lines`, `permissions` and add real per-cell `access`; individuals add touched `accessOverrides`. Invalid view/action dependencies are rejected, never silently granted.



## Main implementation areas

Important implementation areas:

- `public/process/app.js`: SPA state, routing, editor canvas, dashboard, player, dispatch, status, login, and base master-data UI.
- `public/process/master-data.js` and `master-admin-ui.js`: approved master catalog, draft/review lifecycle, line/category/product/stage synchronization.
- `public/process/version-workflow.js`: process versions, validation, approval actions, production rendering, and dispatch readiness.
- `public/process/permission-controls.js` and `system-upgrade.js`: role templates, complete user administration, page/line/action scope, responsive editor controls, modal editing, pointer movement, and connection mode.
- `public/process/shared-state.js`: in-memory shared-state mirror, explicit browser-to-D1/R2 writes, revision conflict handling, and local recovery state. Generic shared-state cross-tab polling/retry is disabled; the dedicated IPQC-C and IQC V3 clients has scoped revision polling and explicit operation recovery.
- `public/process/bom-search-engine.js`, `bom-search.js`, and `bom-excel.js`: BOM lookup, tree selection, and Excel exchange.
- Dashboard BOM totals are recalculated from the effective BOM after persisted overrides or Excel import: nonempty roots and all rows (including L0). Purchased leaf components can occur in many parent BOMs while correctly having no descendants of their own.
- `public/process/master-page-excel.js` and `line-stage-excel.js`: complete-page, versioned Excel exchange for product/category and line/stage master pages, with legacy partial-import compatibility.
- `public/process/data-safety-ui.js`, `app/api/backups/route.ts`, and `lib/local-backup.mjs`: cloud snapshots and host ZIP backup/restore.

### Master-data lifecycle



1. ADMIN or an authorized role creates an AB or C master-data draft from the currently approved catalog.
2. The shared draft may edit products, categories, lines, ordered routes, and stages. Non-BOM Excel import/export entrances are removed from ordinary user pages; legacy codec support is not a daily-user feature. The line/stage page shares the selected AB/C draft rather than creating another scope.
3. Submission validates identifiers, names, and routes. Deletions are recorded as warnings and require deletion permission.
4. A permitted reviewer approves the exact snapshot. Only approval replaces `masterDataControl.active`.
5. Approved master data updates the product catalog, routing, editor workspaces, stage templates, BOM slots, status, dispatch, and player inputs.



AB/C/PROCESS V3 scopes are separate; line/stage management shares AB/C. Linked route changes may publish a derived PROCESS version in the same CAS, but must not clear independent PROCESS draft/pending work. See models/V3 and current data-model routing.

BOM 離頁依實際欄位差異、待送修改、未套用匯入與未確認保存判定；空修改模式不視為未存。有匯入差異須先套用／放棄才可保存，詳見[20261010檢查點](../../docs/local-integration/20261010-bom-navigation.md)。
