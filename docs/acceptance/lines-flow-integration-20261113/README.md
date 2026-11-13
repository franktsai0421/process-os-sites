# 線別／工段與流程資料：獨立整合候選

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
| 讀寫時間與取消安全 | master mutation 對齊現行其他主流程 45s 有界 transport；PROCESS 引用讀取 45s。明確處理中、single flight；讀取與保存延遲不能跨 actor/epoch/delivery/view。 | 沒有無限 timeout；未知結果保留原操作，不把 timeout 當確定失敗。 | 模擬慢回應、斷線／deadline、double-click、取消與舊回應；真資料相同條件效能未量測，不宣稱比例提速。 |
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

共同候選風險：#113／#114／#115 同改 `abc-master-source-contract.cjs` 的 `restore`／`projectKnown`、index 和導航／cache 斷言；#114／#115 同改 `shared-draft-client.js`。本 PR 未搬入兩個未合併候選。各自全綠不能證明三者相容，共同候選須保留三套 source proof 和負例、核對組合順序與完整真實前身，再跑實際合樹回歸；不能覆蓋任一組或降低 hash 門檻。

最終 runtime `20ca6c2` 的 FQC/IQC 廣域回歸 1,137 項中 1,136 通過，唯一失敗是舊測試仍要求 PROCESS 15 秒；本輪 master transport 已依需求採用有界 45 秒。精確期望修正為 45 秒，另測 generic PROCESS 與獨立 LINES 預設路徑；15 秒 generic FQC／similar path、45 秒 FQC／IQC、deadline 前零讀回、截止後只查一個原收據、單次 POST 和 UNKNOWN 斷言全部保留。此後修正僅測試與證據，不改 runtime。
