# 模具 16 項批註與品質確認介面驗收

2026-10-07，Asia/Bangkok。Task：依使用者 16 項瀏覽器批註修改現有模具頁面與品質確認介面，啟動 3030 供查看。需求以 [TOOLING](../specs/current/TOOLING.md) 為準，資料實作見 [TOOLING model](../../AI_CONTEXT/models/TOOLING.md)。[初次匯入報告](20261006-acceptance.md)為先前時點，不能用其 V1 未核准假設覆寫目前資料。

## 實際環境與資料

- 當前 checkout `<WORKSPACE>/中控系統`，分支 `codex/ipqc-ab-local`，HEAD `84278d837898f4e836ec003f7adb67ff38f785c8`. 保留原有與並行未提交工作；未 commit/push/merge/deploy。
- 交付入口：`http://127.0.0.1:3030/process/?system=quality&view=data&dataTab=quality-mold-equipment`。隔離 runtime `.wrangler/local-only/import-3030-20261006/runtime`，沿用獨立 D1/R2。新靜態腳本曾因執行程序未登記而 404；核對舊 PID 24604 後，僅重啟同一 runtime，現在 PID 30472。未執行初始化、匯入、migration 或整庫替換。
- 04:05 UTC 唯讀 API 核對：revision 前後均 420，366 筆器具；239 個獨立照片、243 個照片引用；188 筆可引用 IQC 產品、39 個器具 IQC 引用，失效引用 0。現有 V2 已核准、V3 草稿、無待審；2 筆既有移轉及 V2 核准案件保留。本輪未送審／核准／撤回或套用 3030 業務資料。
- 3031 僅為 `SQLite :memory: + R2 Map` 合成驗收，普通編輯者與獨立確認者測全模組送審／核准。真實 3030 的 IQC 選取測試在彈窗暫存後取消，沒有套用。
- 3030 程式目录共用目前 checkout，資料儲存隔離；本輪未將 3030 資料移往 3000、未動遠端。原 Excel 未修改，未重配來源疑義或匯入舊歷史。

## 批註對照

| 批註 | 實作與實測 | 結果 |
| --- | --- | --- |
| 1、3 | 器具與目錄的查看、修改、刪除獨立；操作容器有間距，查看表單唯讀、沒有套用或移除控制 | PASS |
| 2 | 目錄／欄位／按鈕依選定語言呈現；越文與中文名稱仍各自保存。待補欄位使用對應語言標籤 | PASS |
| 4、5 | 「檢查頻率」下拉週／月／季／半年／每年。週頻率持久化及非法單位組合 API 測試；舊 6／12 月資料維持相容 | PASS |
| 6、7 | 四個編輯分頁；照片及入庫日期附近的位置併入基本頁，沒有獨立照片／位置頁籤；真實器具照片載入 | PASS |
| 8、9、10 | IQC 搜尋及類別／供應商複選版面、每頁 8 筆照片、已選卡片縮圖及原圖入口；不顯示 Excel 映射原文，資料仍保存 | PASS |
| 11、12 | 篩選卡片、清除篩選、清单操作間距；草稿／報錯／待補／操作紀錄與 Save／Submit 繼續使用 VersionDraftUI | PASS |
| 13 | 六模組確認總覽、原入口跳轉、待審自動展開、已處理模組與歷史可收折；3030 六模組均讀取成功。合成待審數 1→核准後 0；IQC 非同步綁定以原 panel／actor 防止舊回應造成按鈕失效，歷史選取實際顯示數量及送審／確認者 | PASS |
| 14 | 已有草稿不重複顯示開始修改；Save 整個模組，Submit 確認後先 Save 全部已套用修改再送固定最新快照。篩選僅顯示第一筆時，案件仍包含第二筆變更及更正移轉 | PASS |
| 15、16 | 新增前選新增／更正，更正引用已核准紀錄；草稿套用後再改成功，核准前鎖定，核准後唯讀歷史、固定案件差異可看；不再顯示「移轉 1／2」標題 | PASS |

## 檢查與證據

| 檢查 | 結果與界線 |
| --- | --- |
| `node scripts/test-tooling.cjs` | PASS：16 項真實 handler 的記憶體測試，含角色、CAS／同欄衝突、獨立欄位、待審鎖、兩撤回入口、自審、無變更、移轉不可改寫、缺漏不阻擋、IQC stable ID、頻率、備份還原 interlock |
| `tsc --noEmit --incremental false` | PASS；模具資料模型與 adapter 修改後執行 |
| JS syntax／targeted oxlint | PASS：tooling、overview、IQC、VersionDraftUI、tooling model／workflow／test。`master-data.js` 全檔 lint FAIL：13 個既有問題；與修改前備份逐項相同，未為此重寫原模組 |
| 普通帳號跨分頁→Save／Submit→不同帳號核准→固定歷史 | PASS：3031 記憶體 UI；第一筆改週頻率／更正草稿再次修改、第二筆名稱修改，案件保留全模組。核准者與時間顯示，固定前後內容唯讀可開啟 |
| 3030 IQC | PASS：3 個現有引用縮圖實際載入；暫選兩筆後顯示 5 卡片，再取消。讀取首 8 筆原照片皆 HTTP 200／非空；現有 39 引用無失效 ID |
| 3030 IQC 確認歷史 | PASS：V7 可打開，顯示 188 零件／541 錯誤／540 檢查、送審者、確認者及時間；固定內容按鈕實際開啟唯讀共享歷史。舊版僅有固定內容，介面明示無舊版前後比較，不補造舊案件 |
| 3030 照片／移轉 | PASS：基本頁器具原圖載入，歷史 2 筆可收折；239 個獨立圖片為本輪 API 引用數，未重新遍歷所有 hash。完整原圖 hash 核對見初次匯入報告 |
| 桌面／手機模擬 | PASS：981×884、390×844（可用內容寬 375）；中／越文、唯讀／編輯、鍵盤左右切換分頁、取消、滾動及表單／總覽無橫向溢出。手機總覽卡片約 154.5 px 寬，表單 scrollWidth=clientWidth=320 |
| 品質模組讀取失敗呈現 | PASS：3031 合成 IQC 故意缺完整標準模型，顯示載入失敗／—，不當作零；其餘已載入模組仍可確認。實際 3030 IQC 讀取正常 |
| 其餘品質模組核准／撤回寫入、3030 真實資料寫入、3000 資料銜接、實體 iPhone | NOT RUN；本次不替使用者處理既有案件，不把模擬當實機驗收 |

本機 evidence：`.wrangler/local-only/tooling-20261006/fixture-results.json`、`ui-20261007-snapshot.json`（篩選後全模組送審案件）、`ui-local-verification-20261007.json`（3030 唯讀與 8 張 IQC 照片）；3030 啟動日誌在隔離目錄 `ui-server-20261007.*.log`。修改前影本保留於 `<USERPROFILE>/.codex\visualizations\2026\10\06\01a11057-de14-79b0-b43a-afa645a67c8c\tooling-ui-before-20261007`。

![3030 基本頁實圖與位置](evidence/20261007-basic.jpg)

![3030 品質確認總覽](evidence/20261007-review.jpg)

## 資料模型、文件與剩餘問題

新增 optional `inspectionFrequency` JSON enum，保留原 `frequencyMonths` 與舊快照；更正沿用既有 `correctionOf`，沒有 SQL migration、新資料鍵或歷史重寫。規格、TOOLING／QUALITY model、DATA_MODEL、CHANGELOG、HANDOFF 已同步。

原包照片／IQC 身分疑義未在本次重新識別，仍以初次匯入報告為依據，不能猜配。品質確認總覽包裹原 review 容器；本輪測模具跨帳號操作與所有模組讀取，其他模組實際核准操作未擴大寫入驗收。靜態程式共用 checkout，後續其他 Local 啟動也會載入本版介面。3030 現有第一筆核准移轉的內部保管單位未選，僅顯示待補；本輪保留其歷史，不直接改正，可由使用者新增更正紀錄。
