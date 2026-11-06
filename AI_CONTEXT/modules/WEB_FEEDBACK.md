## 2026-11-06 — 存取清單回應與備註歸屬（候選）

存取清單讀取固定當次分頁、游標及讀取序號；過時回應不能覆蓋較新的清單。讀取期間將舊事件備註欄設為唯讀，輸入處理再核對目前事件；既有未保存備註與待核對的更新仍依原流程保留。前端快取引用同步更新，原收據及未知操作防護不變。合成回應亂序測試與固定版本驗證另列。

## 2026-11-06 — 隔離後續候選（未推送／未部署）

成功且新鮮核驗的 bootstrap 在 feature flag 與事件 schema 就緒時，僅為當次 delivery 提供可收集模組名單。reporter 先同步暫存核准的五項 scalar metadata，再做動態載入與 IndexedDB 保存；重連上報仍須重新查 capabilities 與原帳號權限。未核驗的完全離線情況仍可能漏中央副本，原 receipt／unknown 防重送完全不變。兩張事件表以 legacy 0004／fresh 0009 追加候選與模型、journal 納入；請求只檢查 schema 就緒，不執行 DDL。原本的 `scripts/access-events-schema.sql` 不再是新 fixture 的套用路徑，舊資料庫需審核後另行明確升級；本候選未執行 migration 或啟用實站。

## 2026-11-05 — 冷啟動離線與匯出一致性複驗（候選）

首次核驗 capabilities 失敗的新 metadata 不落地；僅在 memory，重載可能漏中央副本，原 receipt／unknown guard 不改。新增 volatile-pending 狀態與中越文常駐範圍說明，received 只代表本次可核驗佇列。明確 401／403 不再持久保存本次新回報。未支援未核驗前的持久收集或全站離線殼層；沒有新增離線授權 lease 或跨帳號儲存。

原結果首次轉為 receipt-confirmed 時遞增事件版本並保留首次 verified_at；重複相同證據不重增。兩來源 ZIP 預覽以版本及已授權 data／所選 images 的 SHA 固定內容，生成重算核對，舊版本或同版本投影改變都拒絕；原批次 ACK 不明重試仍回原 immutable archive。Hash 不含原 operationId 或 raw receipt，不增加公開欄位來源。候選不需新 schema；實際合成 API／compiled browser 結果另報。

## 2026-11-05 — 最小事件集中後續候選（本機，尚未啟用）

`/api/access-events` 以現行登入、feedback.view/edit/exchange 及原模組 view 分工，非 Frank-only。一般投影只有員工顯示名稱、模組、操作、時間、結果證據及管理狀態；私人備註／歷史沿 ADMIN 投影，不輸出原 operationId 或收據。獨立 CAS、版本與管理更新去重收據不修改業務狀態。

reporter 只從原 shared client 的未知／核驗節點取純量欄位；獨立 IndexedDB 佇列有帳號與 delivery fence、容量上限及明確失敗，不掃原 recovery stores。只上報未知事件，並非記錄所有正常操作。原收據 GET 在既有身分／動作授權後提供 opt-in 的 operationAction，用來核驗中央狀態；成功收據仍不替代原頁的終端讀回，原 guard 不變。

支持 allowlist 內模組整體 workflow；動態 legacy scope／無識別舊標記不自動匯入。保存政策已核准為未處理／已解決及備註保留、可恢復且不自動刪除；實際啟用仍維持預設關閉。schema 候選：`scripts/access-events-schema.sql`，只在合成 fixture 明確套用；不屬標準發布 migration。新匯出依已確認的分頁 ZIP 範圍實作，詳見下段。詳見 [現行需求](../../docs/specs/current/WEB_FEEDBACK.md)。


`problem-export.mjs` 提供共用但每次只綁單一來源的原生 dialog：唯讀預覽、完整脫敏文字／授權圖片檢查、200 筆選取上限及每包 20 筆序列生成；未知回覆以同一包 operationId 重試，逐包連結由使用者下載。helper 新 action=export-preview/export-approved，access 使用 export-preview/export/exports/download。各 API 做現行 feedback.view/exchange 與新鮮授權檢查；圖片另驗原模組 view，下載校驗 SHA。原版 export API 僅保留相容，原交接不重寫。`problem-export.ts` 規劃容量、固定安全 ZIP 路徑、文字脫敏及 manifest；不生成 CSV，使用者文字不進 HTML。圖片及人工自由文字仍需預覽人工核對。原 business receipt／unknown 防護不受這些操作影響。

## 2026-11-05 第一階段雙來源候選（歷史；以上為後續現況）

原管理入口新增小幫手／存取待確認分頁。小幫手沿既有案件 API，預設 open、完成歷史可重開，清單每頁最多 100 筆。source metadata 只代表已提交案件的本次授權讀取。存取頁按原登入／feedback.view／ADMIN 規則讀取 `action=access-queue` 的未接通狀態；獨立 `web-feedback-access.mjs` 不讀取瀏覽器未知標記、不接收未審定的事件資料、不寫入收據。來源錯誤或不支援投影一律明示未知，不宣告同步完成。

新匯出 UI 僅呈現待選欄位／格式；保留舊交接 API 和不可變歷史。未新增集中事件保存、操作處理歷史或權限。最新需求與未決項見 [正式規格](../../docs/specs/current/WEB_FEEDBACK.md)。定向驗證：`tests/web-feedback-access.test.mjs`、`tests/web-feedback-queues-browser.test.mjs` 與既有 feedback API／cloud 測試；實際執行結果另報。

## 2026-10-29 隔離回報／小幫手修復（未發布）

本次使用者授權取代下方歷史 Local-only 工作範圍；仍不允許 merge 或覆蓋既有站台。驗證與整合事項見 [本次交付](../../docs/web-feedback/20261029-isolated-helper.md)。

- 本輪 1–4 項：明確回報網址在模組 entry 載入時，只預載公開 loader/core/CSS；不執行核心、不取 API／身分／草稿，登入後的 list 授權與 owner/delivery fence 保持。版本 `20261029-feedback7`。一般頁面不新增這些預載。
- 標記先顯示準備中，兩個 animation frame 後才顯示可選取；完成點選後聚焦說明欄。位置／附件數／尚未送出或結果未確認分開提示；定位標籤使用中越文人類可讀文字，不顯示 tag 名稱。跨來源 iframe 首幀保護改為同步暫停其渲染表面（不移除／重載 browsing context），以等尺寸外框佔位保存位置；結束時還原 display。僅選取期間監看新增 iframe／display 改變，退出清理 observer／listener／焦點計時器。舊命中區若偷轉焦點，下一 task 只從仍被暫停的 iframe 收回焦點，確保 Esc；不搶 helper 輸入框。原立即點擊診斷已通過，前後證據見交付最新段落。
- 同分頁、origin＋核驗帳號的 sessionStorage 只保存篩選、勾選 ID、目前 ID 與清單捲動；不保存案件內容或私人備註。每次先取得新鮮授權清單，再恢復且排除無效／不可交接 ID。日期／選項檢查，文字輸出 escape；偏好儲存失敗不阻擋業務保存。桌面工具列與篩選在模組內 sticky，窄螢幕保持正常文件流。

- 本輪畫面／呈現優化：保存與狀態成功回覆只更新備註歷史、狀態、操作文字與清單統計，保留原明細圖片／輸入／按鈕節點；不增加 API 快取或提前顯示成功。交接先呈現批次、日期、數量與 ZIP，展開批次才建案件摘要，展開案件才建全文／私人備註；同批重開不重建，每次回到交接分頁仍取新鮮授權資料。延後處理器保留 owner／epoch／request／連線檢查，沒有漏讀或改寫原文。
- 清單直接管理私人備註與狀態，移除「我的處理」及 helper 內問題清單入口。私人備註仍只由 ADMIN API 投影取得。
- 操作恢復：交接在建立 pending operation 前驗證 1–20 案；保存中備註唯讀、保存按鈕暫停，回覆後恢復。案件版本衝突提供「讀取最新狀態，保留備註」，重新核驗清單後要求使用者再確認保存；即使狀態篩選排除原案件，備註仍綁原 ID，不能套到另一案。未知寫入結果仍使用原收據重試，不放寬 CAS 或提前顯示成功。
- 首次進入問題頁時，模組 JS/CSS 與新鮮 list 授權請求並行，依同一 owner／delivery 接收且不重複讀取；一般 helper 初始化不預讀問題。失敗可重新核驗重試，舊身分回應不顯示。冷啟動重測及限制見交付文件追加段落。
- 再優化：已登入且明確進入問題頁時，在 loader 下載期間預載 JS/CSS 並準備單次 list；loader 只消費一次，重試／換身分不重用。ZIP 原圖在同一請求內按 ID 去重、最多 4 個並行讀取，全部雜湊驗證通過才寫 ZIP／CAS 交接；30 MB 仍計每個 ZIP 項目。CRC 改查表但保持 UTF-8 STORE 格式。無跨請求資料快取、schema 或權限策略變更。
- 模組內 `delete` 僅接受正常 session 經 `identity()` 核驗的 `primary`（既有 Frank 規則）。其他 admin、顯示名稱 Frank、前端角色旗標皆無效。CAS 軟刪除保留案件、備註、附件及 immutable 交接 ZIP，不釋放既有容量上限。
- `update` 可帶固定 operationId；每案最多 32 筆私有更新收據，回覆中斷重試不重複備註，過舊版本仍拒絕。成功回傳單筆狀態／備註，前端不重新讀全清單；新增回報會使清單失效並重新核驗讀取。
- 右下角 helper 依 visualViewport 與實際平台工具列避讓，沒有工具列時不虛構遮擋區。延後載入入口會核對已登入／功能開關並補初始化。這不是既有 hosted Chrome 缺席原因的實站證明。
- 標記使用模組透明攔截層及 window capture，阻止底層 pointer/mouse/touch/drag/form；wheel／touch 只捲動命中的隔離捲動區或頁面。任意位置保存頁面／座標備援，有穩定元件則保存標識與標籤；失效時顯示已保存回報而不改標其他元件。跨來源 iframe 僅能辨識外框。
- Chromium 不支援以 oncompositionstart/oncompositionend 屬性綁定；模組以事件監聽橋接既有處理器。composition 期間不重畫搜尋／輸入；這不代替真實作業系統 IME 驗收。

## 2026-10-10 真實權限格

2026-10-13只讀核來源：首次入口`session.start=capturePage()`，core首個await前取`openedPage`，權限等待期間切頁不偷換新草稿起始頁；既有草稿start仍保留。10/09私有proposed patch的「未套用」屬歷史，10/10[workspace定向驗證](../../docs/local-integration/20261010-ui-language-review.md)已記authorization測試PASS。本次不重播，完整browser／INP／實體手機範圍另列。

feedback.view/create/edit/exchange分別核對讀取、上傳/送出、管理編輯、ZIP交接/下載；edit/exchange仍ADMIN-only。當時尚無 feedback delete 命令；2026-10-29 模組專屬 primary 刪除以本頁最新段落為準。UI回報入口驗證create後才讀私人草稿，管理按鈕受對應格控制；原來源圖片envelope、维护、fresh identity及CAS保留。45合成case含取消勾選的實際API拒絕PASS；最新UI及生產未全面驗收。[權限規格](../../docs/specs/current/PERMISSIONS_ADMIN.md)。

## 2026-10-10 管理入口競態

管理頁先顯示載入狀態，JS／CSS 載入可重試；舊帳號、舊路由及已被替換的 shell 回應不能覆蓋當前頁面。語言更新只重畫仍開啟的管理頁，入口標籤與選取狀態同步。[本機驗證](../../docs/local-integration/20261010-ui-language-review.md)。

# WEB_FEEDBACK — Local 明確啟用

Current checkout／未部署。規格見 [WEB_FEEDBACK](../../docs/specs/current/WEB_FEEDBACK.md)，原實作見 [20261009 交付](../../docs/web-feedback/20261009-implementation.md)，原3020驗收見 [獨立驗收](../../docs/web-feedback/20261009-independent-acceptance.md)；日常3000整合及後續效能驗證以 [本機整合](../../docs/local-integration/20261009-3020-to-3000.md) 為準。

- `/api/web-feedback` → `lib/web-feedback.ts`：WEB_FEEDBACK_ENABLED=1 才啟用，正常 session／同源／maintenance gate。帳號快取只保存權限鍵，每請求查 revision；變化重讀，Cookie 簽章與撤銷仍逐次驗。大型inline資料由SQLite只投影四個auth字串，json_type拒絕native array/object/boolean冒充序列化字串；records/chunks/R2仍經原完整性decoder。冷讀、角色／啟停／維護異動、同revision登出、损毀資料四格式回歸通過。
- 獨立 `web_feedback_store` 單列 revision/payload 保存 issues、attachments、batches、handoffs；CAS 保證多案同批全成功或全拒絕。每案 version 阻止過期管理更新；單列 1.5MB 上限，達上限拒絕並保留草稿。
- 原圖與 immutable ZIP 使用 STATE_ARCHIVE `web-feedback/v1/`。原圖記 owner 及原 access envelope，公眾列表篩除私備註及技術資料；原圖授權另查。ZIP 跨案原圖雜湊驗證後寫入、再 CAS 保存交接收據，不把下載視為已成功。
- `web-feedback-loader.js` 是隔離server與明確啟用的Local Vite注入的輕量host adapter，使用defer；正式index不引用。bootstrap完成才發process-ui-ready；每次點擊才並行取得完整版JS/CSS與新鮮capabilities，均完成且帳號吻合後才讀私人草稿；不預抓帳號或草稿。沒有案件輪詢／全頁MutationObserver；僅觀察根lang屬性。成功完整繪製才計入open診斷；每次清除舊診斷，ready／double-rAF繪製都帶同一openedAt，不能把空白shell或前次paint當完整就緒。
- `web-feedback.js/css`：IndexedDB 草稿（含 Blob），環境／帳號隔離、固定 pending submit 收據，非模態面板、定位捕獲／Esc 清理。原 native dialog 內將 helper 放到同一 top-layer，依 tablist／footer 幾何避讓；ResizeObserver 與 childList observer 只觀察活動 dialog，忽略 helper 自身變動，收合 disconnect；相簿關閉回焦點。入口先顯示只含本次新文字的空白介面，等待 JS/CSS 與新鮮 capabilities；驗證帳號與入口身分一致後才讀私人 IndexedDB，合併新文字並保留圖片／pending 收據，等待期間未保存文字會明示。中文組字完成再重畫，關閉不重新彈出；20標記上限拒絕覆写。分段 diagnostics 不含私有內容；原負載失敗保留為歷史；2026-10-09續修已完成完整開啟同負載重驗，數值與限制見本機整合報告。
- 定位支援 ID、allowlist data 屬性含現行畫布 data-node。端點重複按鈕定位穩定卡片。resolve 檢查路由、唯一性、tag、record/stage，缺失拒絕。重用的 dialog control ID 沒有 record 來源時降級頁面，不假稱精確定位。
- 後台 tab 位於 users 後；public list／admin note+status／immutable handoff 三分頁。identity epoch 阻擋上一帳號慢回應，切換清除私人 DOM。ZIP 匯出固定 operation 範圍，選取變動不得偷換未確認批次。
- `scripts/start-web-feedback-3020.ps1` 只核對並啟动既有 3020 runtime；重啟前保全最新 checkpoint。server 的 feedback checkpoint 與原業務 checkpoint 分離，成功寫入回應前落磁碟，保持原 serial queue。localhost 是合成資料，127.0.0.1 原隔離資料。

已知界線：原權限 envelope 採保守涵蓋檢查；沒有圖片原頁之更細 record ACL 來源，可能需要較窄權限使用者請管理者查閱。單列容量為 V1 本機開發上限，不可當大量生產容量；未實作清除 orphan upload／ZIP 的保留政策。IndexedDB 同帳號多分頁尚無協作合併鎖。日常3000已依2026-10-09人類授權完成migration／feature flag與DB/R2／頁面核對，使用正常Local server，沒有測試橫幅；遠端未部署。
