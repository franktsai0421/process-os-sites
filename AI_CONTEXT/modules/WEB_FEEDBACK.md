## 2026-10-10 真實權限格

2026-10-13只讀核來源：首次入口`session.start=capturePage()`，core首個await前取`openedPage`，權限等待期間切頁不偷換新草稿起始頁；既有草稿start仍保留。10/09私有proposed patch的「未套用」屬歷史，10/10[workspace定向驗證](../../docs/local-integration/20261010-ui-language-review.md)已記authorization測試PASS。本次不重播，完整browser／INP／實體手機範圍另列。

feedback.view/create/edit/exchange分別核對讀取、上傳/送出、管理編輯、ZIP交接/下載；edit/exchange仍ADMIN-only。不存在feedback.delete命令，不列虛假刪除格。UI回報入口驗證create後才讀私人草稿，管理按鈕受對應格控制；原來源圖片envelope、维护、fresh identity及CAS保留。45合成case含取消勾選的實際API拒絕PASS；最新UI及生產未全面驗收。[權限規格](../../docs/specs/current/PERMISSIONS_ADMIN.md)。

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
