# 全草稿頁已核准歷史版本查看：共同讀取與十三組頁面前端

基準：本機全站草稿候選 `ce824f28d8f033500d81d7aa57104dfda1595eb3`，已包含 main `d4ac309fe05c89288af226b52c18161865ccdcb8`（#98）。另已語意合併並行候選的 `bfb561a`（測試／文件／來源證據，無產品 runtime 修改）。本文件記錄共同後端及十三組已接前端，**不是全頁前端完成、已上 GitHub 或已部署的聲明**。

## 已確認規則

同一頁同一版本篩選欄列「當前草稿」與本模組已通過審核的版本。歷史直接在同頁唯讀；不得修改、存取、送審、撤回、還原或套用舊版。選當前草稿切回，保護本機內容、原操作、權限及收據。未存輸入、共用未核准草稿、儲存紀錄、退回／撤回／待審案件均不當作已核准歷史；正式指標本身不是審核證據。歷史不開彈窗，不分拆既有持久 scope，不移除資料或原有相容 API。

## 實際盤點與交付狀態

所有列的 GitHub 狀態均為 **未上傳本批／未合併**；測試站均為 **未部署**；原生瀏覽器、實機、真實帳號及完整生命週期驗收均 **NOT_RUN**。API PASS 僅指合成資料的真實 handler／SQLite／Map-R2 測試。

| 實際頁面 | 現有 scope／來源 | 本機 API | 本機前端與剩餘工作 |
| --- | --- | --- | --- |
| 製程編輯台／畫布 | `process:platform` | 新 approved-only PASS | 已接單一 `canvas-approved-version`／原頁核准快照與回原 journal；V3 與嚴格舊核准聯集，實際作者端／Canvas journal／common／簽章 API PASS；獨立 80745895 保留未整合 |
| 線別與工段管理 | `master:AB`、`master:C` | 各 scope 新 approved-only PASS | 已接單一同頁 selector／核准快照／回原 RAM；AB/C 兩邊暫存保留，沿用原 scope，合成 DOM／實際 handler PASS |
| AB 產線與類別 | `master:AB` | 新 approved-only PASS | 已接單一同頁 selector／獨立核准快照，移除本頁舊案件／還原入口，30 項新主資料情境及 80 項既有回歸 PASS |
| C 產線與類別 | `master:C` | 新 approved-only PASS | 已接同頁 selector，保留 C 自己的版本、權限、pending 與原 RAM；與 AB/C／線別共同驗證 PASS |
| 流程資料／模板／機器 | `master:PROCESS` | 新 approved-only PASS | 已接原頁單一 selector／核准快照／回原 RAM；模板與機器同頁分組、歷史照片取固定引用，20 項實際頁面新情境與 27 組既有名稱／恢復 PASS |
| FQC | `fqc` | 新 approved-only PASS | 已接單一同頁 selector／獨立核准快照及回 RAM，移除本頁舊案件／還原入口；矩陣與比較基準保留，本機定向測試 PASS，原生與實站未驗 |
| IQC | `iqc` | 新 approved-only PASS | 已接單一同頁 selector／原 detailPanel 唯讀與返回原草稿，移除舊案件／還原入口；32 項新情境及既有回歸 PASS，原生與實站未驗 |
| IPQC A/B | `ipqc-ab:module` 與舊群組相容讀取 | module／群組新 approved-only PASS | 已接同頁單一 selector 與核准新整份／舊 A/B 群組的唯讀聯集；固定 case content、原群組與照片／RAM／UNKNOWN／pending 保留；26 項新實際堆疊情境與跨頁回歸 PASS |
| IPQC C | `ipqc-c` | 既有專用 approved-only 路由 | 基準已有同頁 selector／唯讀投影及回當前；本批重新執行其實際 common／transport／handler 測試，非原生瀏覽器驗收 |
| BOM | `bom` | 既有路由沿新共同查詢規則，PASS | 基準已有同頁唯讀與原 writer 保全；本批移除僅有 formal pointer 的未審核基準，不重寫 BOM 本機編輯／Save |
| 檢具與測試設備 | `routine-equipment` | 新 approved-only PASS | 已接單一同頁 selector／獨立核准快照並切回原 RAM；移除本頁案件／還原入口，保留跨品質交易與原重新核對機制；22 項新實際 handler 情境及 68 項 Save 回歸 PASS，原生／實站未驗 |
| 模具 | `tooling` | 新 approved-only PASS | 已接單一同頁 selector／獨立核准快照及回 RAM；器具、目錄與移轉以唯讀分組、搜尋與分頁展示，不另拆草稿；本機定向測試 PASS，原生與實站未驗 |
| 例行 FQC | `routine-fqc:<documentId>` | 自有每文件 approved-only 讀取，PASS | 已接每份文件原頁單一 selector／核准 case 快照／回原多文件 RAM；專用 API，不冒用 numeric-version API；34 項新查看情境及 191 項既有收據／handler／手動產生回歸 PASS |

問題回報是私人 IndexedDB 草稿，無「已核准共用業務版本」；例行報告資料庫與其他未實作例行頁籤是 placeholder；帳號／權限即時表單不是共用業務草稿。不改這些資料模型。

## 第一批共同 API

- `approved-history-query.ts` 精確綁定實際 pathname、adapter key、scope 與 AB module／group routing；只接受 list 或單一 detail，拒絕重複、混合、legacy、receipt、restore、catalog、references 等參數，且在讀取資料前拒絕。
- 共同 workflow GET 擴展原 BOM 的 approved-only 能力到 FQC、IQC、檢具、模具、製程、主資料及 IPQC AB。保持一般 GET／POST、CAS、pending、角色、原收據與舊相容介面。
- metadata 只讀核准證據、不載入歷史 body；detail 使用固定核准案件 content。完整序列化後重新查核登入、view／history、global revision 與 session，防止撤權期間先釋出內容前綴。
- formal-baseline 仍是共用 helper 的正式指標描述，但新 approved-only 列表與 detail 均排除；有實際 legacy approval 或完整 approved case 證據才列歷史。IPQC C 既有規則一致，未清除或重寫基準資料。
- master 及 process-authoring 的 wrapper 先將 approved-only 交給共同 parser，防止混入其他 selector 而繞到舊讀取分支。
- 第一批共同 API 沒有修改各頁 writer；下列接續 IQC 前端只語意修改必要 client／display admission，不覆寫其他 Save／衝突成果。其餘前端仍是未完成工作。

## 接續首批前端：IQC

- IQC 原版本選擇器由同一位置的 `iqc-approved-version` 接手，僅列當前草稿及具核准證據的版本，按需分頁載入。移除本頁 `openSharedDraftHistory`／案件還原入口；共用相容 API 保留供未轉接頁面使用。
- 歷史用獨立顯示快照及自身搜尋／零件／錯誤選擇，重用 IQC `detailPanel(..., true)`。保留原 `control`、selected version、localBase／localSnapshot、generation、原收據、儲存狀態與頁內篩選；不是把歷史資料塞進 writer 後再鎖按鈕。
- 選歷史前同步進入 display epoch；直接 post／本機套用／upload／load 入口及舊工作回呼拒絕跨世代。切回只讀新 permissions，再重繪現有 RAM。延遲 workflow／版本／預覽回覆無權更新新頁或恢復舊 grant。
- 未完成編輯表單、照片視窗、上傳、收據查詢或 Save 比較／寫入仍在進行時，版本切換保守阻擋；不關閉表單或丟棄輸入。歷史下保留 UNKNOWN 標記，不查收據、不重送、不撤回 pending。真實 Submit 建立的隔離 pending 案件也保持原鎖及返回後的 Withdraw 控制。撤銷 view 時退休未 dispatch 的 Save 選擇並隔離原表單，保留 RAM／基準；重新授權不復活舊操作。
- 檢具資訊只取核准快照且 ID 必須相符；照片使用歷史引用，不借用現行 registry。失效引用／圖片載入錯誤有提示。歷史搜尋不重建輸入節點，composition 期間等待，保留同頁草稿篩選；照片視窗關閉後恢復 selector 可用性。
- `shared-draft-client` 只為明確 IQC bounded scope 增加 approved GET／access watcher；approved-only 不帶 editing projection，沿用原 URLSearchParams。一般 IQC GET／POST 仍用原 projection。VersionDraftUI 只額外允許明確 IQC adapter，其他模組不自動當作已完成。
- IQC JS／CSS、共用 client／VersionDraftUI 四個資產更新同一 cache tag `20261109-iqc-approved-history1`，保留其餘資產順序與 tags。歷史零件列最小 44px，沿用既有 850px 響應式版面；沒有冒稱實體手機或原生 IME 驗收。

前端驗證：32 項 IQC actual module/common/primary transport/handler 新測試 PASS；53 項 IQC Save／離頁回歸及 76 項 BOM/C 共用回歸 PASS；另 89 項既有表單、照片、比較 Save、已驗證讀回及兩支 deferred projection UI／race scripts PASS。最初額外 URL 全域依賴造成的既有 VM fixture 失敗已修正為沿用 URLSearchParams，相關原日誌保留；投影 UI fixture 補上真實 isConnected／退休節點語意，未放寬產品 guard。前端來源證據已由真實產品 commit `2245941` 重新生成，保留全部原 named predecessors／負向控制。當前資產的 cache 斷言只更新四個已修改 tags；BOM／equipment tags 與所有歷史 pin 不變。最初唯一舊 shared-client live cache 預期造成的 source-test 失敗已保留，修正斷言後完整 **498 PASS、0 FAIL、0 SKIP**。固定 IQC 產品 `2245941` 的新查看與所有受影響回歸合計 **250 PASS、0 FAIL、0 SKIP**；完整 typed lint、TypeScript 與 source boundary PASS，最終 guarded build／候選識別另列本機交付 receipt。

## 接續前端批次：FQC 與模具

- 在原頁同一位置使用 `fqc-approved-version`／`tooling-approved-version`，取代原有含未核准版本的 selector。FQC 移除舊 `fqc-cases` 彈窗／還原入口；歷史版本不開視窗、不提供套用或還原。模具原有「審核平台案件比較」及器具移轉案件明細仍是個別業務案件功能，不作版本選單或歷史取回入口。
- `VersionDraftUI.createApprovedHistory` 是明確頁面 adapter 的顯示 lease，不自動改造未接線頁面。當前版本 RAM、原 control、localBase／syncBase、矩陣批次、原 generation、UNKNOWN journal 與 pending 均不被核准快照取代；切回只重新讀 permissions，再由頁面重繪保留的資料。
- 核准快照採獨立欄位／集合唯讀展示：FQC 不良與檢查項目；模具器具、類別、保管單位、供應商、製造商、移轉。各組獨立搜尋與每頁十筆；展開只讀所選快照。照片只取歷史引用；不查現行設備或借用目前草稿。搜尋 composition 不重建輸入節點；CSS 提供 44px 觸控尺寸、16px 搜尋及小螢幕欄位堆疊，未作原生版面驗收。
- 頁面 writer 入口、舊 DOM callbacks 與一般讀回加 display epoch 保護。開啟表單、寫入／比較或上傳相關表單仍活動時阻擋切換；撤權清空歷史並退休未 dispatch 的比較／表單，不以重新授權復活舊回覆。模具 checks 在切換邊界中止，原回執不變。
- `shared-draft-client` 的 approved GET／access watcher 限列出的既有 workflow 路由；metadata 仍由各 adapter 的 scope 決定，方法存在不授予權限。VersionDraftUI 要求明確 `mountApprovedHistory` callback；未接線頁面仍列未完成。
- 新增 40 項實際模組＋common UI＋primary client＋簽章 HTTP handlers／SQLite／R2 測試，覆蓋雙語、分頁、固定 case content、舊操作、直接 writer、表單、撤權、延遲 body、錯誤證據、UNKNOWN 原 journal 不查詢／不重送及實際 Submit pending 鎖。其餘受影響原回歸另執行。合成 DOM 不代表原生瀏覽器、實機 iPhone 或真實 IME。
- 保留初始失敗日誌：合成 approved case 最初缺 creator/base 關聯，fixture 補全原後端嚴格核准條件；合成 DOM 的屬性／新 root 焦點問題修正。並行測試的一項 IQC 比較視窗等待以固定 150 次 microtask 不足，隔離可通過，改為等待實際掛載事件，沒有放寬產品 guard 或撤除負向控制。完整本批 runtime／來源 proof／lint／build 結果由後續本機 evidence receipt 固定。
- 共用 client／VersionDraftUI JS、VersionDraftUI CSS、FQC JS、Tooling JS 五個修改資產使用 `20261109-quality-approved-history2`；IQC 自身 JS／CSS 留原 tag，其他資產順序與 tags 不變。無 schema、ACL、資料格式或真實業務資料變更。

## 接續前端：檢具與測試設備

檢具頁新增 `equipment-approved-version`，移除原未核准 selector 與 `routine-case-history` 彈窗／還原入口。獨立核准快照列設備、類別、子類別、規格群組及問題記錄；歷史照片只用該版 photoId／固定資產來源，不讀 pendingPhotos 或現行 registry，不以新圖替代缺圖。回當前僅讀 permissions、重繪原 control／working／syncBase／inputOwner，不改原 generation、transaction 或 UNKNOWN journal。

writer、upload、一般 read 及頁面 callbacks 有 display epoch 保護；開啟編輯／新增／節點／照片／移轉視窗、寫入／比較／核對、pending photo 或上傳中阻擋切換。保留原 delivery-only recheck 與 FQC 跨模組移轉機制。新增 22 項實際共用 UI／簽章 HTTP handler／SQLite／Map-R2 情境 PASS（含實際 Submit pending、UNKNOWN 零查詢／零重送、舊讀回、雙語及照片來源）；原 equipment Save 68 項 PASS。這不是原生／實站驗收。檢具 JS cache tag 同 `20261109-quality-approved-history2`。

收到另批草稿／篩選候選 `d1ff4a61` 後已定位真實本機來源 `draft-filter-followup-20261109`，已語意合併其 FQC／IQC 晚到輸入、照片及篩選保護，保留同頁歷史 display lease；受影響 371 項執行情境已分批驗證（351 項共同批次，修正測試結尾 hook 後 20 項模具），無跳過。typed lint／TypeScript／source boundary PASS；完整來源證明 660/660 PASS，48 個 current files／329 個精確 projections／原九個 named targets 與 79 個 historical requests 均保留；source 固定 `e339db59fba457a5bfaf4ca4868bad7120b5c2b4`，build 另由本機 receipt 記錄，沒有重複上傳。

## 本次整合驗證收據

- 受影響 runtime：371 個不同情境已分批驗證；共同批次 351 PASS，最後 20 項模具因 fixture hook 限定模組結尾後單獨 20 PASS。保留失敗整批 log 與所有修復日誌，不把先前 351/371 冒充單一整批成功。
- API＋BOM＋IPQC-C：正常 approved-history route／common／primary transport 的 154/154 PASS；核准證據 helper 12 組 PASS。資料均為隔離 SQLite／Map-R2／合成 DOM／簽章 fixture，不是真實帳號或實站資料。
- 完整原 CI 來源與前任證明：660/660 PASS，0 FAIL、0 SKIP。48 個實際 current files，329 個 exact projections，22 個真正新檔不存在證明；保留原九個 named predecessors、79 個 bounded historical ref/path、所有舊 hash／span 與負向控制。最初唯一檢具 live cache tag 舊預期失敗已保留，僅更新目前 tag 斷言後完整重跑通過，歷史 tag 與 source pin 不變。
- 完整 typed lint、非增量 TypeScript、source boundary 及 diff whitespace PASS；最終 build／交付 HEAD／runtime 相等證據另由本機 receipt 綁定。依賴為相同 lockfile 的本機實體副本，不是假稱乾淨網路安裝。
- 原生 Chromium／實體 iPhone／真實 IME、獨立審查、GitHub CI、遠端 PR／merge／測試站／實站完整生命週期均 NOT_RUN。其他版本頁面仍依上方矩陣接續，不因新候選合併而全數完成。

## 草稿／篩選候選語意相依整合

本機 `d1ff4a61b2a8c81a206ec358ab2614393c171e94` 由原真實 repository 取得，並與核准歷史候選做 merge。FQC、檢具的非重疊輸入保留變動自動合併；IQC reset／discard 同時保留歷史退休與 localPhotos 清理；模具保留完整新 catalog／picker／late-save 實作後重新接入 display epoch 與舊 callbacks 保護。來源帳本採原九個 named predecessor 與完整 historical requests，再依真正合併產品 commit 生成，不偽造舊 Git 物件或放寬 pin。

新增整合負責範圍：IQC 本機 File／blob 可在套用後切歷史再回草稿，完全不 PUT，原 File 只於明確 Save 上傳一次。原草稿候選各頁篩選測試的 PASS 不是其他歷史版本頁面已接線的證據。其畫布候選 `80745895`、遠端 PR #99／#100、IQC 數值提示 PR #88 均仍獨立，不在本次 merge 中冒稱完成。

保留整合失敗日誌：最初三個模具身分錯誤提示被 display guard 提前靜默攔截，改為由原 editor owner／epoch guard 回報；歷史 guard 仍阻擋跨顯示世代。高並行下舊 200ms Begin 等待未完成，fixture 改等實際 production run promise；新候選有內部 IIFE，歷史 fixture 的 hook 改成僅匹配模組結尾，沒有更動產品邏輯或舊斷言。351 及 20 項修復後證據分開記錄，不用失敗的整批 log 假稱全部 PASS。

共用與四頁 JS／VersionDraftUI CSS 使用 `20261109-approved-history-integrated3`；IQC 自身 CSS 保留 `20261109-iqc-approved-history1`，其他承接 d1ff 的已變動資產保留 `20261109-unified-save-choice2`。資產順序、唯一性、所有初始 predecessor cache 與來源負向斷言保留。

## BOM 候選來源核對

已讀取 `4960d74` 的交付與獨立審查紀錄。它不是本批基準 `ce824f2` 的祖先，不盲目 cherry-pick。`bom-domain.mjs` 與 `lib/bom-workflow.ts` 相同；`bom-workspace.js` 的後續差異是全組衝突選擇文字及未 dispatch 的 Save 比較重讀 loop，現有 approved view 保留。共用 workflow 亦已有後續並行變動，本批只新增 GET opt-in。BOM common／實際 transport／實際 handler 的 35 項重新驗證 PASS。

## 驗證

- 新增 78 項真實 HTTP handler PASS，覆蓋 11 route/scope 組合、inline 與 records-v1、核准篩選、固定 content、無資料寫入、未登入拒絕、metadata 不讀歷史 body、混合參數、撤銷與版本競態。
- BOM common／實際 transport／handler 35 項與 IPQC C 41 項，合計 76 PASS。僅更新 BOM 舊測試中 formal-baseline 的預期列表，保留其餘斷言。
- 既有 AB 身分／權限重讀、重播、master clone 與各模組 Begin 收據回歸 68 PASS；純核准證據 helper 12 組 PASS。
- 本批 typed lint、非增量 TypeScript、diff whitespace 與 source-boundary PASS。依賴使用相同 lockfile 的既有本機實體副本；不是乾淨網路安裝證據。最初 dependency symlink 被來源檢查拒絕後已換為實體副本，未改來源檢查。
- 精確來源、真實 Git witness、所有舊 BOM／batch3 predecessor 及負向控制合計 **497 PASS、0 FAIL、0 SKIP**。來源 manifest 固定真實產品來源 `18e03fe`，保留全部七個原 named targets 與 bounded historical requests；新增 parser 是真正新檔，未捏造 predecessor。初始來源測試 18 FAIL 及原 missing-object 失敗日誌保留：之後納入並行 `bfb561a` 的來源 proof，再由真正的本機 Git 來源取得 `ed35ad1` 缺少物件，重新生成精確來源證明；沒有改弱舊 hash、跳過測試或寫造歷史物件。
- 完整 typed lint 在明確 void 頂層 node:test 註冊後 PASS；原 6 個 no-floating-promises 失敗日誌保留。正常 guarded build 於 `0b9e1c6` PASS；以完整 `app/`、`lib/`、`public/process/` Git bytes 核對與整合後 `18e03fe` 相同，產品 runtime 證據有效。最後候選的 build stamp 與結果另由本機交付 receipt 記錄，不能把 build PASS 視為部署或 compiled-client 全面機密審核。
- 原生瀏覽器、實體 iPhone、IME、完整逐頁生命週期、獨立審查、GitHub CI 與實站驗收 **NOT_RUN**。沒有宣稱前端全面驗收。

## GitHub 與發布阻擋

既有 243-path create_tree 結果 UNKNOWN，原 payload 範圍不完整。已知 tree `ee1352c5508376713bae156e205701e512c3212c` 與另批 `beddd52759e5cd322e6d64b658b6e8c0a2f84025` 的舊唯讀 404 不能證明未執行。不以新分支、拆分、Blob API、CLI 或新對話重送。另有檢具 create_tree 自動審查拒絕的歷史：當時僅進度查詢授權、公開原始碼／文件目的地未確認；本批沒有重試。

本次唯讀核對 GitHub main `d4ac309`、公開 repo 與 PR #99（製程工段自訂類型，仍獨立草稿），不將它混入本批。沒有 push、create_tree、PR、merge、正式資料／schema／帳號操作、連接器開啟／重建／重連或部署。

## 接續順序

共同 API 與 IQC／FQC／模具前端已完成本機定向驗證；維持單一寫入者，接續主資料／製程等剩餘頁面的顯示 lease／回當前與所有直接 writer callback 的 display epoch 防護。逐頁加上同頁 selector，移除舊彈窗／還原入口；舊 AB 群組與 legacy PROCESS 歷史需在原身分／scope 下唯讀聯集，不遷移、不拼造核准。例行 FQC 保留自有文件 ID 與完整 workflow 語意，另做投影。最後逐頁確認 RAM、open form、照片、pending、UNKNOWN、撤權、延遲回應及同頁篩選；遠端 CI／審查通過且無既有 UNKNOWN 阻擋後再依原授權處理 GitHub。正式資料／權限／重大架構與部署仍交 Frank 決定。

## AB/C 主資料、線別工段與版本選單收尾

AB 產線與類別、C 產線與類別、線別與工段在原頁使用單一 `master-approved-version`。嚴格已核准分頁及固定 case content 採獨立快照，產品／類別／線別／巢狀工段均不借用當前草稿；未有類別群組欄位的舊快照明示缺欄。回草稿保留兩個 scope 的本機內容、原基準、generation、pending 及 UNKNOWN，不呼叫 discardLocal。舊歷史視窗／還原入口移除，原審核平台可轉入同頁核准 detail，仍由伺服器驗證。沒有新增持久 scope、角色或 schema。

shared bridge 的明確 display lease 保護直接 writer、prepared command、一般讀回與回執入口；切換前阻擋表單、存取、匯入及比較；舊身份物件／epoch／delivery／顯示世代／退休 DOM callback 不可回寫。已接受 transport permissions 只用實際 boolean 投影，不憑方法存在授權。新增 30 項主資料實際 component／bridge／common／signed handler 測試，另 80 項原合併／衝突／線別篩選回歸。

發現並修正 `2ddd2151` 檢查點的模具 busy 結束後 selector 未重啟問題；舊 bundle 是已被取代的局部檢查點，不作最新交付。明確 refreshControls、原生 close 清理及讀取期間 checks 退休保護不增加輪詢。FQC 已驗證目錄與 session 的穩定身份持有者分離於單次讀回 display epoch，保留矩陣 session、一般欄位及目錄可用性；真實入口 bind 的矩陣歷史返回後明確 Save 恰送原選擇一次，真正離頁才放棄 local，UNKNOWN 原 journal 不查詢／不重送。

最新受影響本機回歸 **421/421 PASS、0 SKIP**，日誌 `master-and-quality-history-runtime-verified.log`；FQC 目錄純來源 42 項 PASS，typed lint／TypeScript／source boundary PASS。新 source proof／build 應綁後續實際產品 commit；不可引用舊 `2ddd2151` 的 build 證明新 runtime。尚餘 PROCESS 模板／機器、製程編輯台／畫布、IPQC A/B 舊新聯集、例行 FQC 文件前端；GitHub 全列未上傳、本批未部署、原生／實機／實站未驗。

## PROCESS 流程資料／模板／機器

原頁使用 `process-approved-version`；移除原未核准版本選單、歷史紀錄／還原入口，以及選版本時的 discardLocal／名稱與機器 abandon。版本資料只進獨立純唯讀 renderer，模板、各工段的巢狀機器與照片均來自選定快照，不查現行機器資料。返回草稿只更新 permissions 並重繪原 writer；儲存後選單可再次使用。審核平台的已核准版本可轉入同頁 detail，未核准案件由伺服器拒絕。

明確 PROCESS display lease 保護既有 bridge；原生事件、property callbacks、名稱 Apply 及機器 RAF 有同頁世代／原節點保護。未套用名稱、開啟視窗、照片／Save／共享操作進行中阻擋切換而保留內容。一般同頁重繪可重新取回同一歷史選擇；UNKNOWN 不讀原收據、不重送，pending 返回後仍鎖定。真實入口函式以 AST 讀取，搭配實際機器元件／共同 UI／bridge／signed handlers／SQLite／Map-R2：**20/20 新情境 PASS**；既有名稱／恢復／引用 **27 組 PASS**。typed lint／TypeScript PASS。

跨頁擴充批次 `process-master-cross-module-runtime.log` 為 **323 PASS / 325，2 FAIL，0 SKIP**。兩項 `process-equipment-snapshot.test.mjs` 的舊「beforeSave 必須拒絕尚未 Sync」斷言，在真實前任 `3f6e736e` 的設備來源也相同失敗（`process-equipment-snapshot-checkpoint-baseline.log`）；測試實際讀取的設備函式範圍與前任完全相等，畫布／authoring／local store 原始碼未改。這是既有畫布 Save 契約與舊測試相依的未解狀態，沒有刪斷言或假稱全綠；尚未合併獨立畫布候選 `80745895`，其 REVIEW 要求 parent 先協調另一畫布 owner。這兩項未作 GitHub 合併通過證明。

新增 CI 保留 PROCESS 新測試及原名稱保護腳本。四個實際修改 asset（app／process-equipment／master-data／VersionDraftUI）更新 cache `20261109-process-approved-history5`；其餘 tag／歷史 source pin 不變。尚餘 IPQC A/B 舊新聯集、製程編輯台／畫布及例行 FQC；全列本批未上 GitHub、未部署、原生／實站未驗。

## IPQC A/B 新整份與舊群組核准聯集

`ipqcab-approved-version` 在原頁顯示當前草稿、已核准整份版本及舊群組版本；各舊版標明 A/B 群組，依固定快照分組列錯誤、工段、檢查項目、照片及相符原設備，不讀當前目錄或回寫 writer。已核准來源引用也轉入相同 selector，不另開歷史視窗。舊 `.ipqcab-history`／案件還原入口移除；原審核平台業務案件保留。

共同 workflow adapter 只新增明確 read-only provider；僅 IPQC AB module 註冊既有 `abApprovedMetadata`／`legacyAbVersion` 的 strict 模式。聯集排除正式指標、未核准、shared superseded、整份投影 aliases 和重複 module IDs，舊版 ID 是可逆顯示身分，不入庫，不改持久 scope。原核准 case ID／來源 scope／來源 version ID 保持原值，前端核對完整對應，未偽造核准 evidence。module 複合 ID／cursor 有 1024 字元界線，其餘路由仍為 512。

display epoch 與既有 mutation lifetime 分開，保留原 localScopes／bases／File／localSent／UNKNOWN intent。讀回、直接 writer／upload／原收據查詢入口及舊 DOM 事件有顯示持有者保護；開啟表單、比較或執行中阻擋切換，休止的原 UNKNOWN 可查看版本且不查詢或重送。回草稿只讀 permissions 並重繪原 RAM；真正 Submit 形成 pending 後往返仍鎖定。初始 module permissions 完成後才啟用 selector，身份／epoch／delivery 防止晚到回覆授權。

新實際完整 AB component／common／default client／簽章 HTTP handlers／records-v1 SQLite／Map-R2 **26/26 PASS**。包含雙語、新舊 47 筆核准分頁、來源身分負向、固定 case content、原 File 往返後明確 Save 只 PUT 一次、UNKNOWN 零查詢／零重送、實際 pending、實際撤權、一般晚到讀回、舊事件。R2 插樁證明聯集 metadata 不載入歷史 body、舊 case detail 僅讀一個正文；正文 hydration 期間 revision／撤權改變均在回傳內容前拒絕。

受影響全部 AB Save／衝突與共同查看頁面 **543/543 PASS、0 SKIP**，正常 route **78/78 PASS**，核准證據 helper **13 組 PASS**，typed lint／TypeScript PASS。原抽取式 caller fixture 改為載入實際新增 guard，新增歷史 display 零讀取／零 prepare 的負向控制；未放寬產品防線。保存最初 fixture 缺儲存方法、缺整份核准投影、缺真實日期與抽取式 guard 的失敗證據；修正 fixture，未刪測試。此前 PROCESS 提交 `4032ec4` 的來源 **672/672 PASS**、guarded build PASS；本批 source／build 須重新綁實際後續提交。

本批 GitHub／測試站未更新、原生／實機／實站未驗。尚餘例行 FQC 每份文件及製程編輯台／畫布；獨立畫布 80745895 的 parent 協調未取得證據，未整合。舊 243-path UNKNOWN 與 equipment create_tree 拒絕仍不重送，不因本批局部完成解除。

## 例行 FQC 每份文件

新增精確 `approvedOnly=1&documentId=...` 的專用 list／detail／permissions GET，仍沿用每文件 `routine-fqc:<documentId>`，沒有新增 numeric control、scope 或 writer。僅實際 approved case 的完整原 creator／savedId／reviewer／時間證據可列；不取其他文件、不取 saved 或 pending／returned／withdrawn、不以正式指標代核准證據。metadata 不讀舊正文，detail 只序列化所選 immutable case；序列化完成後重新查 view／history、session、enabled 及全域 revision。混合、重複、超長、restore／receipt／preview selectors 在 DB／R2 前拒絕。

原頁 `routine-fqc-approved-version` 與專用只讀 client 只存核准顯示及實際 GET permissions，不參與原 business read／receiptObserve／POST。選歷史不動 buffers／bases／bufferGenerations／s.retry／原 metadata；切回只讀 permissions，重繪原內容。保留多文件暫存、照片固定 SHA 引用及原審核平台；歷史展示只有純資料，不提供 Save／Submit／還原／套用。版本 view 的 epoch、舊欄位／按鈕、一般 read／Save／POST 入口保護晚到回覆，實際視窗／上傳／寫入／產生進行中不切換。文件切換只退休顯示，不丟另一份暫存；真正離頁仍沿原規則。

**225/225 PASS、0 SKIP**：34 項新實際完整 Routine closure／common／簽章 handlers／kernel／SQLite／Map-R2 情境，以及 191 項原 durable receipt／actual route／manual generation。新情境涵蓋雙語 inline／records、新舊核准證據、跨文件拒絕、多 buffer 返回後恰一次 Save、原 UNKNOWN 零查詢／零重送且可於返回後明確查原收據、真實 Submit pending、真實撤權、舊一般讀回不可清 UNKNOWN、晚到 body、舊 DOM callback、精確 envelope 與 R2 最後權限／revision 防護。plan 為實際 API 建立及核准；為測試既有 reopened 持久狀態，僅在私有 fixture 初始化該狀態，**沒有宣稱 revoke-plan 成功**（其現行權限曾回 403，原紀錄保留，未改權限）。報告／免做／處置另外驗證既有持久 kind 的純唯讀 renderer，不冒稱完整建立／複測／處置生命周期。records fixture 的 sentinel 使用合法 JSON，原 codec 沒有放寬。

typed lint／TypeScript PASS；Routine JS／VersionDraftUI 更新 `20261109-routine-approved-history7`，其餘資產與歷史 tags 保留。此前 IPQC AB 真實產品提交 `6fc2b96` 的完整來源 685/685 PASS、guarded build PASS；本批後續 source／build 與新 main 整合仍須綁實際提交。GitHub／測試站未更新，原生／實機／實站未驗；畫布頁仍是唯一未接前端的頁面。

收到 parent 的 #100 合併通知後，已用 GitHub 直接核實 main／PR #100 均為 `9fbba823090f03da8385c8d92f5e59293d19d2f1`（含 #99），並唯讀 fetch 真實 Git 物件。後續本機語意整合須保留其 inert foreground facade、無定時 server read、既有明確 read owner 錯誤語意、source inverses 與正常 CI；目前尚未把該 main 合併進本候選，不將前一版測試當成已整合證明。舊未知／拒絕上傳限制維持。

## #100 最新 main 本機語意整合

已唯讀核實並 fetch `9fbba823090f03da8385c8d92f5e59293d19d2f1`（#100，含 #99），將真實 main merge 到本地候選。保留 inert foreground facade、無週期 server read、明確讀取前後 owner 檢查與 HTTP 錯誤優先順序，以及新增工段繼承已核准 PROCESS 目錄；未吸收、覆寫或上傳獨立畫布候選 80745895。

FQC 的一般目錄讀取仍接受 main 的同 actor ID／同 identity epoch 重新整理；歷史 display lease 和原表單依然保留其更嚴格的所有權檢查。IQC 新增的唯一計時器是主動選取核准版本的 45 秒中止 deadline，非輪詢，已列入精確 timer inventory。相應現行資產升到 `20261109-approved-history-main100-8`，不改歷史 cache pins。

保留 main 和本候選各自不同的驗證：目前九個完整模組初始化／focus／visibility 不產生輪詢；七個已退役 producer 的舊回呼從真實 d4ac309 Git 來源以有限 witness 取出，僅在測試手動 driver 執行，並由現行程式無 producer 斷言保護。這些 cached callback 測試不代表產品仍安裝 timer。原 9 個來源 target 保留，新增 `main_100`，原 background exact inverse 和負向控制不放寬。

製程編輯台仍未完成原頁唯讀前端與舊核准聯集。獨立 80745895 交付文件明文要求 parent 先協調另一畫布工作；此處已提出協調需求，未把該候選當作已整合，也未以本批完成十二組頁面宣稱全站完成。GitHub 本批仍未上傳、未部署；原先 create_tree 結果不明及 equipment 上傳自動審查拒絕仍未解除、未重送。資料／schema／ACL 無變更。

### 固定整合結果

產品 merge `bfa26509bf7b29a2855f84da290d971dd4dca3a7` 已包含真實 main #100；交付前再以 GitHub 唯讀核實 main 仍為 `9fbba823090f03da8385c8d92f5e59293d19d2f1`。

- **418/418 PASS**：十個實際頁面／API 查看套件，加 #99 stage catalog 與 #100 FQC readiness。其餘已完成頁面原有更大批次結果見上述逐頁紀錄。
- **775/775 PASS**：完整 named predecessor／bounded witness／來源負向控制，以及 #100 原五檔 exact inverse。原九個 target、舊 hash／歷史 pin 不變，新增 main_100。
- **239/239 PASS**：#100 手動畫布同步、原收據恢復、restore admission、read deadline、全站 timer inventory、inert scheduler 與 fixture ports；最初 cache 失敗已在最終固定 source 下重跑通過。
- **79/79 PASS**：來源相依的原導覽／收據／五檔 inverse；原歷史 cache 預期全部保留，目前 cache 以有限明確 map 驗證。IQC 原 closure fixture 補入實際 display guard 宣告，新增 history-before-read／late display epoch 負向。
- **九個 current initializers** 零 request／零 timer；**14 個明確 permission GET、1 dirty-flush、4 negative probes**，以及原 equipment 28 項回歸 PASS。current scoped read pause 與 frozen cached callback companion 各自完成，後者 **50 groups PASS**。
- #100 原 panel differential **15 cases PASS**，完整 baseline hash 仍為 a8a0b53…；以 unified→main_100→原 background inverse 組合，未改 baseline pin。EOL fixture **78 checks PASS**；IQC cached closure **24 checks PASS**；AB/C/PROCESS/BOM review composition **37 cases PASS**。cached suite 僅從真實 d4 取歷史 producer，不把其 timer 裝入產品。
- typed lint、TypeScript、Sites source boundary、diff check 與受保護 build **PASS**。Build 只證明編譯與既有已知 public auth 檢查，不宣稱通用敏感資料掃描或發布許可。

日誌存放本機兄弟目錄 `approved-history-unified-evidence-20261109`；最終 bundle／main-relative patch／receipt 另固定候選提交與 SHA256。沒有 GitHub Actions CI／PR review、測試站或原生瀏覽器驗收結果。既有兩項未修改 Canvas equipment snapshot 斷言曾在前任同樣失敗，仍保留其紀錄；本批沒有把那些未解限制改成 PASS。資料模型／schema／ACL 無改動；沒有真實資料寫入。

## 最後一批：製程編輯台／畫布與 7ef04ed7 相依

本批已接畫布原頁 `canvas-approved-version`，目前草稿與真正已核准的 V3／舊 `approvalVersions` 共用同一 selector。移除編輯台舊未核准版本 selector、草稿歷史彈窗／還原入口、孤立產品問題的舊封存彈窗；案件審核平台保留原業務案件查看，不把它當作草稿版本清單。歷史以獨立不可編輯的工作區／工段／流程欄位展示，可展開核對連線 IDs、設備 IDs、作業說明、BOM 選擇與該版圖片；不將歷史塞入目前畫布 renderer、journal 或活資料引用。此為同頁唯讀快照，沒有歷史圖形拖曳／編輯。

`processApprovedGET` 僅處理原 approvedOnly 查詢，保留原非 opt-in GET／POST／scope／角色／CAS。舊版本須有核准事件、有效日期與審核者文字；排除 shared／未核准、重複來源 IDs 與投影 ID 衝突，不以正式指標冒充核准。metadata 不取 V3 歷史 body，detail 固定取核准 case.content；舊 stages 本來就 inline 在一個保留 aggregate，清楚承認需讀這個 aggregate，沒有宣稱它已拆為按版 body。選定內容 buffer 後再核對角色／session／global revision；新 metadata／detail 不寫資料或持久 aliases。

歷史 display epoch 與原 Canvas edit epoch／journal／generation／owned ledger 分開。writer、直接 Canvas Sync／Save／Discard／recovery、舊原生屬性事件及原普通讀回有保護；畫布 renderer 重新綁事件後也補上同一 fence。原表單／gesture／操作執行中阻擋切換，休止的舊 Sync UNKNOWN 與目前全站 Save UNKNOWN 可查看歷史且不查收據、不重送。切回只讀 permissions，回原 RAM／journal；原 pending 仍鎖定。普通成功 adopt 會退休工作稿 selector，不把合法最新工作稿誤當歷史唯讀。

已唯讀取入真實 `7ef04ed741249816aac2f1336cf15f888ff92fa0`；精確採用其中產品修正 `bbc5f9d106b4027b2d33b70b2a8f3d5eb0a580f1`（request 入口先 pin C comparison version，防止同步 callback 使舊請求取得新 Begin proof）及其新實際回歸。沒有整份覆寫共用 client 或宣稱完整候選合併／發布；其餘共同 main／原 d1ff 改動早已保留，source proof 增列 draft_main100 比對 target。80745895 並未整合，仍待 parent 協調其另外的 stage／category／line 保留改動；本批版本查看無需先套入它。

全頁查看與 C 比較 **572/572 PASS**；畫布新實際堆疊另固定最終日誌，包含雙語 inline／records、聯集分頁、不可修改／舊 callback、原 UNKNOWN、真正 pending、body／aggregate 撤權與 revision fence、原生表單、回原 journal 後一次真正 Save、操作執行中與拒絕返回。製程既有 Begin／離頁／就緒／審核狀態／真實 atomic Save **149/149 PASS**；原 unknown recovery **4 groups PASS**，原 evidence helpers **13 groups PASS**。新 fixture 最初補齊 bindDataInner／crypto／Canvas accept 及合法工段；未放寬產品門檻。原歷史可編輯 restore 的 R12 改驗無入口與原 SUBMIT_STATE_UNCONFIRMED command fence，未取消 transport 負向。

舊 panel 效能差分比較的是舊歷史 UI，不能再宣稱與目前新 UI 相同；完整原 15 cases／hash／78 EOL 負向保留為明示 frozen 4a10e935→d4 基準，現行行為另由新 stack 測試及完整 source proof 驗證。原 Canvas-post suite 一項『empty atomic Save』要求 POST/GET，實際為合法比較 GET/POST/GET；同一斷言已在真實前任 fe162bc 重現，不刪測試、不放寬計數。該套件另外 204 PASS、3 SKIP／1 FAIL 的初始合併紀錄保留，未聲稱全域無失敗。原完整 submit-feedback script 曾未到最終 JSON，R12／S6 各自有完整終點證據；未將不完整 run 計成全套 PASS。

本批四個修改資產（shared client、authoring、Canvas local、editor）用 `20261109-canvas-approved-history9`，其他 tags 與全部歷史 pins 保留。schema／資料模型／ACL／真實業務資料無變動。GitHub 本批未上傳、測試站未部署、原生／實機／實站未驗；舊未知／拒絕上傳限制持續。前面 fe162bc／main100 交付包已變成十二組頁面的歷史檢查點，最終交付以後續 canvas receipt／bundle 為準。

### 收尾補驗與已修正夾具

畫布最終 **18/18 PASS**，另含「保有 view/history、撤掉 edit/save」後切回仍保留 journal 但禁止編輯／存取；回草稿以真正 accepted permission 更新本地 UI，直接 gate 亦尊重目前 transport 拒絕，不以舊模型權限開放。手動 Canvas 原測試 **38/38 PASS**；抽取 closure 的夾具帶入實際 historyReadOnly 宣告與原 transport port，未放寬權限負向。

完整 submit-feedback 已修正並 **60 groups PASS**：原 S5 permission 情境曾向另一個新 client 丟不完整回覆，不能代表目前 writer 撤權；現在對原 captured transport 的真正回覆只撤 submit，並加入 beforeExit 完成標記，所有案例完整到 JSON 終點。R12 保留原 SUBMIT_STATE_UNCONFIRMED transport fence，UI 改驗不存在歷史／restore 入口。先前未完成日誌保留，不再是待解阻擋。

產品 1a147d9 的來源 **826/826 PASS**、build PASS；新權限 guard 的最終 product/source/build 與 bundle hash 依後續 receipt 固定。原 main 回歸 **239/239 PASS**、navigation/source 相依 **79/79 PASS**，current scoped read **44 groups PASS**／cached companion **50 groups PASS**，九個完整 initializers、14 permission、1 dirty flush 與 4 negatives PASS。新 frozen benchmark 的輸出明示真實來源 commits 與 currentUIBenchmark=false；原 15 cases 與 78 EOL checks 保留。

### 最終本機產品與驗證

最終產品提交 `d4a5ef923c3b7fb5dee4eb55836e9e86f801d2ad`，基於已核實且已合併的 main `9fbba823090f03da8385c8d92f5e59293d19d2f1`。保留 11 個真實來源 target（原九個＋main_100＋僅比對的 draft_main100），**826/826 完整 source／witness／inverse 負向 PASS**。本產品的新畫布＋原作者端／真實 atomic Save／manual Sync 合計 **205/205 PASS**，完整 submit-feedback **60 groups PASS**；build、typed lint、TypeScript PASS，無 skip。此前全頁／C **572 PASS**、current main 回歸 **239 PASS**、navigation/source **79 PASS** 與明確限制保持有效，沒有為此反覆擴測已通過且未改動的其他模組。

所有十三列均為本機已接前端並有隔離測試證據；GitHub 本批仍 **NOT_UPLOADED**、測試站 **NOT_DEPLOYED**、GitHub CI／審查及原生／實機／實站驗收均 **NOT_RUN**。保留並行 80745895 未整合，以及上述前任重現的 legacy Canvas-post 次數斷言失敗；不以這些本機 PASS 聲稱全站 CI 或實際驗收通過。上傳受原未知 create_tree／自動審查拒絕限制，沒有重送、拆分繞過或重連原 connector。
