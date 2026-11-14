# 線別／工段與流程資料：獨立整合候選

目前續修：2026-11-14 取消已安裝 LINES／PROCESS 的前端固定 45 秒 abort；早期有界 45 秒 checkpoint 屬歷史，以下最新規則與 PR 最終 head 結果優先。

目前續整合：2026-11-14 將已含 #113／#114 的 main `4aa0f24c66861fb735d6ad581b81b190771122f8` 合入原 #115 分支；以下早期 checkpoint 保留為歷史證據，最終共同候選 SHA／CI 以 PR 最新表格為準。

狀態：Draft；沒有合併、部署、資料切換、正式／既有測試站讀寫、帳號政策修改或新備份。使用 Dot 雲端獨立 worktree `lines-flow-integration-20261113`；沒有使用 Frank 公司電腦。開始時基底為遠端 main `f0f425d90ea883bab479801dd54f5deaed6cce69`（#110）。工作期間 #111 已合併，分支安全快轉至新 main `ba315149e7478c288d2f3af45c8668aa60070919`，逐段保留送審錯誤分類、原回執、資產 pin、兩個來源 inverse 與 CI。另一個 AB/C 產線與類別工作未搬入。

## 來源盤點

| 來源 | 實際查證與處理 |
| --- | --- |
| `codex/process-flow-cloud-29102026` `c0a9b7e` | 已為 main 祖先；流程設備、名稱、照片、引用與手動存取保留，不重播。 |
| `feature/process-local-save-20261105` `40cb76a` | 已為 main 祖先；原子保存、原操作回執及晚到輸入保留。 |
| `feature/independent-approved-history-20261107` `6960481` | 已為 main 祖先；核准來源驗證與唯讀歷史保留。 |
| #104 `15a5acb`、帳號／製程共同候選 `369f5d4` | 已為 main 祖先；LINES page-v1 owner/API/權限/原頁歷史及 marker guards 已存在。 |
| 無背景檢查 `158bb6b` | 已為 main 祖先；本輪未恢復 timer、focus/visibility 同步。唯一 app 時鐘不做網路讀寫。 |
| 舊線別 `926b7d4`、handoff `49190ee` | 非 main 祖先，分別有 5／23 個未納入祖先的提交；有用的一般欄位／引用／重試成果已被後續 main 整合。不可整枝覆蓋現在 page-v1、權限及 source gates。 |
| #102 `55d4672cb8004d0b01715714cbc91fbce6b22d2b` | 已關閉未合併；實際 head 比 PR body 所稱 `ee7d4fd` 更新。body 所稱本機 `2a1d415`、`ae8c208`、`e14f268` 都是此遠端 head 可讀祖先，已以 Git 物件查證。沒有重送舊 UNKNOWN 上傳。 |
| #102 逐檔 | [35 路徑 blob inventory](pr102-file-inventory.json)：22 相同、12 不同、1 僅舊分支。只擷取 PROCESS 照片組比較與晚到照片意圖處理；主圖 scalar aliases 與 mediaItems 同組決策。保留 main 新增欄位 absence guards、save-only 授權與 history lease，不帶入 AB/C、例行 FQC、帳號政策或整枝 CI。原 helper 與擷取結果由 `lines-flow-pr102-source.test.cjs` 核對。 |
| #101 `8f1f243` | 已關閉未合併；遠端只有畫布計數元件，完整候選 `a2c5f55`／`25305c1` 不在該 count-only head 的 tree，但已核實兩者均可從 #102 `55d4672` 的祖先取得；不能把 body 的所有宣稱當作已驗收。計數成果已由 main 後續整合；這不是本次兩個主資料頁的切工段放棄規則。 |

## 需求、入口、資料切換、驗收對照

| 需求 | 程式與使用中的入口 | 舊資料／啟用狀態 | 驗收與限制 |
| --- | --- | --- | --- |
| 各頁草稿與權限獨立 | LINES `/api/master/pages?scope=LINES`；PROCESS `/api/master/workflow?scope=PROCESS`，各自 Begin/Save/Submit/Withdraw/Return/Approve、CAS、回執。 | LINES 需既有受信任 `pageDraftLayout:page-v1` 及三頁原始核准 baseline；未採用線別入口改為已核准唯讀，不能借 AB/C 草稿。 | inline/records 真 route 生命週期、不同 signed 身分及 lines-only 權限。未宣稱真站已啟用。 |
| 新工段不產生 PROCESS 正式版 | LINES 不再建立或核准 linked PROCESS；流程頁「建立缺漏工段流程」僅留 PROCESS 本機增量，明確存取及獨立核准才生效。 | 舊含 linkedProcess 的待審案件保留，核准明確拒絕；可撤回／退回，再分頁送審。未修改既有案件。 | `test-lines-flow-boundaries.cjs`、`test-process-page-lifecycle.cjs`：兩頁草稿互不干擾、舊案件安全處理、新工段來源及 create 權限。 |
| 同頁切換保留／跨模組放棄 | LINES AB/C 是同一份 RAM；保留同頁輸入。PROCESS 現有模板／設備頁維持同頁 buffer；跨頁使用原 autoAbandon，保留保存與 UNKNOWN 回執。 | 不寫 marker，不清舊草稿／備份；不恢復本機表單。 | 真 controller 合成 DOM＋native CI；原 17 項 PROCESS overlay/late-input/receipt 回歸。實體 IME 未驗。 |
| 保存才 fresh compare、整組三選 | PROCESS Save 與 LINES Save；對方變更後重比，無衝突修改保留、取消零 POST；最後 revision 漂移拒絕，需下一次明確 Save。 | 保留原 actor/generation/operationId、冪等及 readback；404/斷線不盲重送。 | 不同 signed 帳號三選、再次改版、晚到照片、lost ACK、原 receipt GET-only、新輸入不被清除。 |
| 歷史僅已核准唯讀 | 保留兩頁原頁 approved selector；PROCESS 舊 history helper 拒絕開還原彈窗，新 restore command 拒絕；原成功收據保留查詢。 | 未改舊歷史、immutable 保存或回執；沒有從歷史覆寫 current。 | 63 個既有核准來源／原頁 DOM／權限／晚到回應案例；另有新舊入口防護測試。 |
| 無定時同步／取消恢復入口 | 主資料無 draft poll；PROCESS localProcess 名稱列只提供記入本機與放棄，不提供核對最新／本機恢復。必要 GET 只由進頁、重載、Save、送審、歷史或回執操作觸發。 | 舊恢復資料不讀、不匯入、不刪除。 | 原 timer inventory／無輪詢回歸；未以停用完整性檢查改善速度。 |
| 每個按鈕有真實效果 | 下表列實際按鈕與測試；新增重載與忙碌文案。取消不報保存成功。 | 沿用現行授權，不改公開範圍、帳號政策或無關匯出入功能。 | 權限不足／非法階段由前後端拒絕並保留資料，沒有假成功。原生結果見 CI，真人未驗。 |
| 讀寫時間與取消安全 | 已安裝 canonical LINES／PROCESS transport 與 PROCESS 引用查詢不設前端固定 elapsed-time abort；保留明確處理中、single flight、停止等候與原回執。延遲不能跨 actor/epoch/delivery/view。 | 不以等待冒充效能改善；使用者可停止客戶端等候／離頁，已送操作仍 UNKNOWN，只查原回執。其他模組及未安裝 legacy client 的原預算保留。 | 模擬慢回應、斷線／deadline、double-click、取消與舊回應；真資料相同條件效能未量測，不宣稱比例提速。 |
| 正式引用與刷新 | LINES/Catalog 分別核對原始已核准來源；PROCESS 新來源 helper 驗 active/pointer/unique approved body；製程 API 使用已核准組合，拒絕草稿或 forged compatibility mirror。頁面核准後重新載入對應 owner 並刷新 runtime routing。 | 沒有把 pending/working/saved 當正式來源。SQL schema、ID 與持久格式不變。 | 生命週期涵蓋真 authoring Save、隱藏工段保留與引用；未跑真站跨機畫布。 |

## 實際按鈕驗收清單

| 頁面／入口 | 按鈕／控制 | 證據 |
| --- | --- | --- |
| LINES | 開啟草稿、存取、重新載入、送審、撤回、再送、核准、退回、取消本機修改、查詢原操作 | `test-master-page-ui.cjs`、`test-master-page-runtime.cjs`、角色測試及 native `lines-flow-browser.mjs`；相同操作含雙擊、取消零寫入、UNKNOWN 零重送。 |
| LINES 頁內 | AB/C 切換、修改欄位、新增線別／工段、刪除空線別／工段、向前／向後移 | 同頁合成 DOM＋真 route；native 桌面 zh／390px vi runner。不可刪含工段線別或有引用工段，由原 guards 再次拒絕。 |
| LINES 歷史 | 展開、核准版本選擇、返回目前草稿、更多／重試、歷史照片查看 | 既有 approved-history route/UI 套件；沒有還原按鈕。 |
| PROCESS | 建立新版本草稿、儲存草稿、送出主管審核、解除送審、查看送審案件、審核平台撤回／退回／核准、重新載入 | 原流程 route/bridge、生命週期、角色與既有 compiled runner；新增 PROCESS 狀態與重載。 |
| PROCESS 頁內 | 新增／刪除流程、名稱記入／放棄、方塊類型、缺漏工段流程建立、設備表單新增／修改／刪除／完成／取消、照片加入／更換／移除／查看 | 原 name/equipment/media/reference 回歸；本輪照片組比較、晚到尾圖、明確新工段建立、create 與引用負面控制。真人檔案選擇、IME 未驗。 |
| PROCESS 歷史與恢復 | 原頁核准選單、返回草稿、查詢未知操作；舊 helper／restore 一律拒絕 | 既有同頁唯讀歷史＋新 retained-handler/API 防護。未重新開啟查看最新共享／本機恢復。 |
| 兩頁既有 Excel | 既有權限限定匯入／匯出／取消／失敗重試 | 原 transfer/tools/excel 測試保留；未新增本次無關匯入匯出。 |

## 資料切換決策缺口

程式完成與真資料啟用分開。本次沒有存取正式或既有測試站資料，無法宣稱目前資料已有 page-v1 marker 或完整可用 baseline。正式採用前仍須在授權的資料來源確認：舊 AB/C working/saved/pending、LINES/PROCESS 核准 pointer 與 immutable history/media、原回執與權限歸屬；既有跨頁 linked case 如何由其操作者撤回／退回；三頁獨立核准 baseline 的來源 pins／CAS 切換順序。已存在的 `previewMasterPageSplit` 是純預覽，不能設定 marker 或寫入。

保留舊備份，沒有重新做備份或把備份當本輪程式阻擋；沒有遷移、覆寫、刪除、設定切換或部署。未採用資料的線別頁安全唯讀代表尚未啟用獨立編輯，不能稱已完成真站切換驗收。

## 測試證據與狀態

本地環境：Node 24、隔離 SQLite `:memory:` 與 Map R2，合成簽章帳號；不是正式 Cloudflare 或真人資料。

- PASS：inline/records 兩頁完整生命週期、獨立權限、CAS、核准來源、pending、舊連動案件、PROCESS 建立權限、歷史還原拒絕。
- PASS：實際 PROCESS bridge／三選 DOM、照片組、主圖 aliases、選擇後 peer 再變、晚到輸入、斷線／有限 deadline、原回執、零重送。
- PASS：原核准歷史 route/UI 63 案例；後續 runtime source 變動依最終回歸結果更新，不把歷史成功冒稱新 HEAD CI。
- PASS：lint、完整 TypeScript（最終候選結果仍以 CI/驗證紀錄為準）。
- BLOCKED（本地）：原生 Chromium 因 `socket() failed: Operation not permitted` 在啟動時失敗，未執行 UI；不改 flags／不重試繞過。相同 runner 已加入 GitHub CI。
- 環境限制：`npm ci` 安裝依賴後，postinstall 因 worktree `.git` 是檔案而拒絕 standalone guard 安裝；未改 guard 或 hooks。獨立乾淨 checkout／CI 的正常安裝結果另行核對。
- NOT_RUN：真人站點、正式／既有測試站資料採用、跨機真人、實體手機、真 IME、真資料效能與 Cloudflare 部署。viewport 不冒充實體手機。

最終 commit、遠端 head、CI 結果與補測細節會在本文件及 PR 更新。來源 inverse 只供來源驗證，不執行復原後的歷史產品程式；不降低舊來源 hash／negative-control 門檻。

### 上傳前收尾

最後程式 runtime 固定 `b7dd4ba`；兩頁無衝突 Save 的比對 GET 由 2 次降為 1 次，只有發生衝突選擇才再次 fresh read，最終 revision/CAS／權限仍保留。實際 controller 的 GET／POST 次數與新建流程按鈕 14/14，最後完整來源／負面控制 243/243 與 guarded build/auth postbuild 通過；後續僅驗收文件。[機器可讀驗證紀錄](verification.json)列出原失敗、修復及重用界線。來源／逆向與 negative controls 242/242；歷史／回執／三選／照片／導航定向 122/122；最後 cache／來源／回執 pins 71/71；PROCESS 真按鈕與雙帳號／slow／unknown 11/11。套件重疊，不相加為覆蓋率。25 組 route／相依命令原 23 PASS、2 fixture FAIL，缺漏 port 修復後兩者各自通過（名稱／引用 27 組、投影 8 項），沒有刪原斷言。

最終 lint、非增量 TypeScript、source boundaries、guarded build 及 auth postbuild 通過；本地 Chromium 僅啟動即受 socket EPERM 限制，保留 BLOCKED，GitHub CI 才提供原生驗收。原 compiled PROCESS runner 保留 Cancel 的零寫入／輸入保留斷言，再實測用對方保存一次；未用直接 API 呼叫替代按鈕。最終遠端 head 與 CI 仍待本 PR 結果確認。

### 中止後整合最新 #112

Git HTTPS push 因雲端沒有登入憑證而未執行。其後單筆大型 GitHub create_tree 被中止；讀回預期 tree `4690514624d345bae43cc295efa4e7f0f63fe198` 與新分支皆 404，沒有重送該 tree。中止期間 main 已合併 #112 至 `a85caf5a8f14770b02481f52f96e0ec1364458d3`；本候選用正常 merge 逐段保留其 AB/C helper、原始 approved proof、語言／篩選與進度 UI、運作回執和 source gates，不帶未合併 #113/#114。

合樹 runtime `3ad1f55` 的 guarded build/auth postbuild、完整 lint／TypeScript 通過；#112 專屬＋兩頁／來源／導航集中測試先 132/133，唯一失敗是新 CHANGELOG 尚未納入精確 inverse（非產品功能）。修正為完整逐 byte 的真 main 前身，不改其 hash／負面控制。上傳改為先比對各 blob SHA，再以 SHA 清單建立新 tree，避免再次使用大型 inline-content tree；新 tree 必須與本地完整候選 tree 一致才建立 commit/ref/PR。沒有憑證建立、main push、合併、部署或資料切換。

### #115 CI 續修

公開獨立 Draft PR [#115](https://github.com/franktsai0421/process-os-sites/pull/115)，第一個公開 commit `2ffd227` 的 tree 與本機候選完整相等。依實際 CI 逐項修正，沒有停用工作流程、刪除失敗斷言或調低來源 hash：

- 歷史報表來源負面控制原本要求舊「AB/C view 決定線別入口」字串。現在先以精確 inverse 得到真 main 前身，原始控制全部保留；另對目前獨立 LINES 的身分、delivery、權限、核准來源與唯讀入口逐項變異並拒絕。
- 真 compiled PROCESS 原生測出已移除的 review 按鈕被 status 直接存取，造成頁面載入失敗。加入空元素檢查；localProcess 不開本機恢復 session；真 binder DOM 回歸確認只保留 apply/discard，輸入不送 POST。
- lines-only 原測試 12 項完全不改；唯讀路徑改用一致結構呈現採用提示與來源錯誤，避免缺少額外 DOM port 或只顯示錯誤代碼。
- 舊 compiled AB/C／PROCESS runner 的跨頁目標原本等待舊線別編輯選單；改驗目前未採用資料的 LINES 唯讀與零寫入。AB/C 核准拓樸比對已保存的完整 canonical snapshot，保留所有穩定 ID；獨立 LINES 增刪及完整審核生命週期仍由專用原生 runner 執行。
- 專用原生 harness 初版漏寫 UTF-8，按鈕顯示亂碼；補上 HTML／JS charset 及 characterSet 斷言，保留中文字與越南文原始按鈕選取。未改真站編碼。
- 六個本輪資產標記更新為 `20261113-lines-flow3`，其餘 main tags 保留。

`04e2c46` 對應本地 99/99；`c026e45` 前的來源／權限／導航修正 100/100。中途套件結果只作診斷；最終遠端 head、原生結果及 CI 以 PR 最後更新為準，不把前一輪 PASS 當新 HEAD 全部驗收。

第三輪 `c026e45` 的 compiled PROCESS 原生 runner 已完整 PASS（同一 job 後續 AB/C 比對 fixture IDs 失敗，不能稱該工作流程已全綠）。LINES 原生已完成增刪、保存、重載、送審／撤回／退回／再送／核准，最後發現新輸入沒有即時啟用「取消本機修改」；已修正 discard／submit 可用狀態並加入實際 controller 零寫入回歸。完整原生重新驗收仍以最後 head CI 為準。

補查實際核准後 `loadScope('LINES')` → `applyActive()` 發現部分 owner 只含 lines，舊函式直接讀 `ab.products` 會失敗。現在以已授權的 approved runtime 補齊缺少欄位，再套用已核准 owner；不讀 draft、不補 seed、不生 PROCESS。production `applyActive` 測試涵蓋 LINES-only／catalog-only，保留原 approved catalog、更新 canvas routing、零 POST；另執行真正 main `a85caf5` 的舊函式確認反例會崩潰。此檢查已加入本 PR CI；全 SPA 及真站仍不冒稱完成。

目前資產版本進一步更新為 `20261113-lines-flow4`，對應上述 approved refresh 修正。另以實際 LINES 按鈕 → signed API → 真 `createMasterSharedBridge.load('LINES')` → production `applyActive` 整合測試，確認已核准畫布 routing 更新，產品從已授權 runtime 保留，不生 PROCESS、不多送操作；四項 controller 驗收通過。

2026-11-13 歷史 checkpoint 的共同候選風險（由下方 2026-11-14 共同合樹續修取代）：#113／#114／#115 同改 `abc-master-source-contract.cjs` 的 `restore`／`projectKnown`、index 和導航／cache 斷言；#114／#115 同改 `shared-draft-client.js`。本 PR 未搬入兩個未合併候選。各自全綠不能證明三者相容，共同候選須保留三套 source proof 和負例、核對組合順序與完整真實前身，再跑實際合樹回歸；不能覆蓋任一組或降低 hash 門檻。

最終 runtime `20ca6c2` 的 FQC/IQC 廣域回歸 1,137 項中 1,136 通過，唯一失敗是舊測試仍要求 PROCESS 15 秒；本輪 master transport 已依需求採用有界 45 秒。精確期望修正為 45 秒，另測 generic PROCESS 與獨立 LINES 預設路徑；15 秒 generic FQC／similar path、45 秒 FQC／IQC、deadline 前零讀回、截止後只查一個原收據、單次 POST 和 UNKNOWN 斷言全部保留。此後修正僅測試與證據，不改 runtime。

Windows Local safety `43493755953` 的最後整合入口段落測出 PROCESS readonly 檢查早於原 restore 權限門檻，造成無權限操作由 403 變成 409。現移到 adapter apply（既有權限核對之後），不修改共用權限框架或帳號政策。原 403 與資料不變斷言保留；具 restore 權限與 primary 新還原都須 409／APPROVED_HISTORY_READ_ONLY／零寫入；合成可信 legacy committed receipt 透過真 API 可 200 冪等讀回，工作資料完全不變。其餘九個 adapter 還原成功／刪除／復活／重排測試全部保留。十個 adapter 真 route 檢查 PASS，並提前放入本 PR 專用 CI。

驗收邊界再次明列：LINES 原生為目前 controller＋真 route 的隔離模組載具；PROCESS 原生為編譯後完整 SPA。測試站部署及適當資料切換另經授權決策後，仍須實測 LINES 完整新架構入口、獨立草稿保存／重載、送審／撤回／再送／核准，以及 PROCESS 已核准引用／畫布刷新。隔離載具 PASS 不替代完整入口或實站驗收；沒有宣稱本次已部署或實站已驗收。

修正後本地完整重跑失敗的 145-command 段落：138 組 PASS；6 組已知需原生／socket、1 組需 Windows PowerShell，列本地 NOT_RUN／BLOCKED，不作成功計算。其中 PowerShell 混合命令組其餘 227 個案例 PASS。未改動任何 GitHub CI 原測試或退出碼檢查；147/147 定向來源／歷史／衝突／導航／回執回歸、lint 與完整非增量 TypeScript PASS，完整 Windows 結果仍待新 head CI。

## 2026-11-14 — 與已合併 #113／#114 的共同候選

原公開 #115 `4ec19c4` 與目前 main `4aa0f24` 均保留於正常 merge ancestry，不重開 PR、不改 main。原本地已測 checkpoint 另保留可回復 ref，乾淨工作目錄對齊相同完整 tree 的公開 head 後整合。

| 衝突／風險 | 解法與保留成果 | 共同候選驗證 |
| --- | --- | --- |
| shared client 的 LINES／PROCESS 45s 與 IPQC 180s | 保留 exact scope admission、IPQC one-shot progress 與 silent departure；保留 master readonly 回饋、原操作識別／回執／CAS／UNKNOWN。進度計時不讀取、不重送。 | 真 transport deadline／慢回應／丟回覆／取消／導航／重載與原收據回歸；原生 CI 待最終 head。 |
| app clock 與 PROCESS controls | 同時保留 shell clock 空元素保護、PROCESS local apply/discard／缺漏流程建立／唯讀歷史和核准 refresh。 | clock、PROCESS binder／完整 compiled SPA 與 LINES controller＋真路由載具。 |
| index/cache 與 account loader | 六個本輪資產一致新 tag `20261114-lines-flow-joint1`；保留 password helper、user-access 與 IPQC 原 main tags／載入順序。 | account entry、navigation、receipt cache、auth/browser。 |
| 三套來源契約 | 原 LINES、password、IPQC manifest 完全不改；新增精確雙前身 inverse，先還原真 #115 或真 main，再執行原 hash／span／EOL 與負例。未知 bytes 不修補。 | 雙親 tree／ancestry、逐檔原 blob、LF／CRLF、刪除／重複／改 byte／wrong path/type/target 負例；保留三套原驗證。 |
| 主資料生命週期與引用 | 不借用 AB/C 草稿，不核准 linked PROCESS；保留同頁 RAM／跨模組放棄、整組三選、原頁 approved-only history、approved refs／canvas refresh。 | 兩頁修改→保存→重載→送審→撤回→再送→核准、雙帳號與跨模組回歸及原生 CI。 |

上述矩陣描述本次實作及待執行驗證，不以原三個 PR 各自綠燈推論共同相容。最終候選的結果將記錄於同一 #115，失敗須修復重跑，不刪測試或放寬 pins。

委派時記錄測試站為 v45；另行主線發布不在本輪範圍，不用本輪隔離結果推定真站版本或驗收。Diem V31 撤回與先前兩筆 IPQC QA 結果仍 UNKNOWN，本次不查改、重送或清除其操作。沒有正式／既有測試站資料、marker／schema／ACL／帳密、備份或遷移操作，也沒有合併／部署。LINES 隔離模組載具與 PROCESS compiled SPA 的證據界線不變；完整 adopted LINES 入口、資料採用與真人站點／實體手機／真 IME 仍未驗。

本地共同候選第一輪：source／cache／navigation／receipt 403/403、其餘功能 139/139、password 37/37、七個兩頁 lifecycle／roles／restore／read-projection 命令 PASS；lint、完整非增量 TypeScript、guarded build＋auth postbuild PASS。Password 初次執行缺既有 VM modules 旗標，36 個 fixture 無法載入；依原 account workflow 旗標定向重跑通過，沒有改測試。145-command 本地批次初次在自動核准審查因未核對暫存計畫而被拒、未執行；核對原 tracked workflow 的完整清單、固定 blob、各測試的 commit bytes 及副作用後，加入 no-shell allowlist 與有界執行，僅重試一次獲准。最終本地及 CI 結果見同一 PR 的最終表格。

本地 145-command 共同回歸完成：138 組 PASS、6 組原生／socket NOT_RUN、1 組 Windows PowerShell BLOCKED；該混合命令其餘 227 個案例 PASS。原 Windows CI 全部命令、退出碼測試與原生腳本保留，不把本地不可用項計為成功。最終 runtime 與 build 前候選相同；後續只固定文件及精確 source manifest。上傳後的共同 head CI 結果以 #115 最新表格為準，不沿用 `4ec19c4` 舊綠燈。

## 2026-11-14 — 取消 master 按鈕的固定過早中斷

實際檢查確認：原 #115 canonical LINES page client、PROCESS local client 的 request timer 會在 45 秒 abort，PROCESS 刪除前引用 GET 也用 `AbortSignal.timeout(45000)`。這些是前端自設界線，會中斷慢 headers 或 body，不是純提示。現改為只在這兩頁已安裝、scope／owner 已驗證的 canonical transport 取消固定 elapsed-time abort；AB/C catalog 原 explicit I/O、IPQC/FQC/IQC/authoring 及未安裝 generic／legacy URL 的既有策略不變。

每次請求立即顯示處理中，10／45／120 秒僅為單次 UI 提示，不讀取、不重送、不宣稱成功或比例提速。「停止等候」透過原請求 AbortController 和等待 fence 停止 headers／body 等候，不宣稱撤銷伺服器工作。讀取停止可重讀；已送 Begin／Save／Submit／review 保留原 operation／generation／marker，沒有自動續送。晚到結果不得改 UI、權限或 marker；404 不證明沒寫入，只由有效原回執核對。PROCESS 引用改走同一 transport，保留 server 權限及頁面 owner/view fence。

LINES 離頁會停止本頁等待；已送原證據仍保留。重進時只在 successor 已持有完全相同 marker、舊 owner 已失效、沒有其他 queued／未知／失敗時，轉移重複的帳號 projection 計算，不刪舊證據或 storage。新 client 仍承擔原 UNKNOWN；變造 marker、錯誤世代收據、404 均不得解除。只有原有效回執能恢復操作。PROCESS 沿用既有 bounded 原收據與 owner 保護。

測試涵蓋虛擬 10 分鐘讀取、120 秒 Save headers／body 成功與停止、Begin 送出前／後、去重、404、晚到 ACK、離頁／重進、變造 marker／錯誤世代回執及帳號 barrier。既有 LINES 原生載具與 PROCESS compiled SPA 皆追加實際停止等候按鈕案例；本地 Chromium 啟動受 socket EPERM 阻擋，沒有改 flags 或重試繞過，原生結果待新 head CI。三份原 feature manifest 不改，雙前身 inverse 只更新新候選 hash／spans，仍逐 byte 還原真 parents。

本次沒有證據可把 45 秒稱為平台強制界線，也沒有修改或聲稱可取消瀏覽器、網路、代理或代管平台自身的終止條件；實站限制未量測。真正連線／平台中斷仍是 unavailable／UNKNOWN，不能推定回滾或盲重送。

**交付限制：**未切可信 page-v1 的 LINES 仍為已核准資料唯讀，不能宣稱已啟用獨立 writer；採用 baseline、marker 與舊資料決策仍待另行授權。舊帶 linkedProcess 的案件保留並拒絕直接核准，須由有權操作者撤回／退回後分別保存、送審兩頁；本次不替真人案件執行、不自動遷移。原備份、真資料、UNKNOWN、schema／ACL／帳密與正式／既有測試站均未操作；不合併、不部署。

跨模組本地回歸曾在 timer inventory 失敗：新 callback 仍只有 Map／UI 通知，但 body 改為 `progressValue(elapsedMs)`，因此指紋改變。僅更新該筆 `67545b2b…` → `338acf2d…` 的精確 hash 與用途；逐筆確認其他所有 timer hash 不變，保留整張 deep-equal、匯入圖與原 source 反例。虛擬 10 分鐘斷言同時確認不重排 timer、不增加任何 I/O。修正後相關來源／無背景檢查 248/248 PASS；不是新增通用豁免或放寬原三份 feature manifest。

新 head `0f89da3` CI 的原模擬 DOM UI runner 缺少標準 `before()`，進度列 sibling 插入因此失敗，原生步驟未執行。只在該 runner 的 bounded DOM port 補齊真實 sibling 插入，另斷言實際停止按鈕位於 readonly page root 外；不改 production runtime、舊斷言或原生測試。修正後仍須新 head CI，不把此測試載具修正宣稱為原生通過。

同 head 的 compiled PROCESS 已進入新增停止案例，頁面先前切換為越南文，而新 locator 誤只查中文導致 timeout；畫面已有 `Dừng chờ`，沒有 pageError。改用兩個精確語言名稱的 anchored locator，仍實際點擊按鈕並保留零重送、404 marker 與原回執斷言，不改 timeout 或 production 行為。

`91864ea` LINES 原生 1280px 中文／390px 越南文均 PASS，含實際停止→404→原回執。Account 另呼叫獨立 tools UI fixture，仍缺標準 `before()`；同樣僅補該載具的 DOM port 並新增外部停止按鈕位置斷言，原有匯入／匯出／權限／同頁本機輸入測試全部保留。

`5ef92e5` 的 FQC/IQC 最後 same-document delivery 原生檢查發現多留一個 pagehide listener。進度元件原先只聽 delivery-invalidated／pagehide，部分頁內導覽只通知 destination-ready；現也在 ready 核對原 root、tab、owner，離頁即停止等候並清除 watcher／DOM／所有自有 listener，同頁 ready 不停止。新增五次來回的 listener 身分精確相等與零 I/O 回歸；原 compiled delivery 的 exact ownership 斷言完全保留，沒有增加 listener 容許額度。cache family 更新為 `20261114-master-wait3`，仍待新 head CI。

補強已提交導覽但 ready 失敗的清理：既有 `MasterDataWorkflow.resetProjection()` 在新頁讀取前直接退休全部本模組進度元件，停止等候並刪除自有 listener；不必等成功 ready。取消於 commit 前不走 reset，原頁等待保留；同頁重繪只清舊元件、不停止同 client 等候。新增實際 resetProjection 函式執行與重複 retirement 冪等斷言，UNKNOWN／原 marker 保留。最終 cache family 為 `20261114-master-wait4`。

## 2026-11-14 — #115 續整合已合併 #116

Frank 合併 #116 後，main 前進至 `c178ae227bcddf528a493dbf8b586cf310564c5b`，前一個 `3361ec0b` 的單獨 CI 不作新共同候選驗收。shared transport 同時保留 installed LINES／PROCESS 無固定 elapsed abort、明確停止與原 marker，以及製程 authoring Submit／Withdraw／Approve／Return 180 秒、escaped operation ID、receipt action 核對與原收據 UI。保留 #116 actor／page／revision／case single-flight、Submit 獨立授權與原 server CAS。

語意解決 shared client、index/cache、帳號／設備／navigation／receipt cache、IPQC source helper 與文件衝突；authoring tag 保留 #116，master 六資產採 `20261114-lines-flow-review1`。四份原 manifest（LINES、password、IPQC、process-review）完全不改；joint inverse 加入真正 `main116` 前身，仍保留原 `lines`／`main` pins、逐 byte／EOL／未知來源負例。兩套 proof 串接，不以互相覆蓋或更新原 hash 消除衝突。

新共同候選須重新執行 lint、非增量 TypeScript、guarded build、四套來源負例、兩頁／製程送審確認與原回執，以及 compiled native 與完整 CI。其結果以本次最新 head 為準，舊綠燈均為歷史。資料切換／真站／實體手機／真 IME 仍未驗；Diem V31 與兩筆 IPQC QA UNKNOWN 未碰，不合併／部署。
