# 角色範本布局與說明候選

2026-11-06，原候選固定於 `ca8af98a36ef5a4a58f6494183a19265047f6820`，現已正常整合 main `339df7564091e2c46a74bb36298bbd2408a68a84`（#89/#90）；兩份首頁文件衝突逐段保留，沒有回退 IPQC-C 或 IQC 修改。改善角色範本／個別權限共用矩陣的對齊、可用寬度與說明；不改角色、人員資料、permission keys、依賴、API、授權策略或 schema。未合併或部署。

## 修改與風險

| 修改 | 目的／風險 | 驗證 |
| --- | --- | --- |
| user-access.css 的矩陣欄模型、容器響應、換行、details 展開區 | 解決固定 min-width、舊 sticky 欄樣式殘留、max-height 搭配 overflow:visible 造成的超出；保留綠灰色系與原 UI | 中越文，1440／1024／768／390／320px，長角色／模組名；欄位位置、內容寬度與面板邊界 |
| matrix markup 的說明與空入口 | 額外操作明確命名；沒有額外操作時顯示靜態說明，保留適用的全選／恢復 | 每個 cell 的 checked／disabled 與基準一致；空／有詳細選項、取消／重開、Tab／Enter／Space、焦點與滾動 |
| index cache tags | 讓未打包來源也取得新版 CSS／JS | ordered shell styles/scripts 既有測試、正式 build |
| 新增 browser regression 與 CI step | 真 renderer／事件與 actual handler，合成 SQLite/R2 | 原始序列化 role-update／individual-reset payload 與基準逐 byte 相等；合成角色 Save／讀回／重開 |

`::details-content` 可用時將 summary 留在同列最後一欄、panel 放到下一整列；舊引擎保留完整寬度的 disclosure fallback。只實測本環境 Chromium；未聲稱 Safari／實體手機已驗收。

## 實施與證據

- `tests/role-template-layout-browser.mjs`：15 組 PASS，涵蓋上述尺寸／語言、162 cells、相同 JSON payload、角色保護、唯讀身分、無水平 overflow、合成保存與前後截圖。使用 exact baseline renderer／styles，沒有重寫 renderer stub；只快取已登入的合成 fixture shell 來避免把尺寸檢查變成登入壓測。
- `scripts/test-users-cloud-browser.mjs`：17 項 PASS，含搜尋／composition 模擬、全選／恢復、Save 讀回、衝突、取消、角色／使用者 CRUD、disabled、未知 POST 與 deadline 不重送。所有帳號／密碼／角色都是記憶體合成資料。
- lint 與完整 TypeScript：第一次在產品修改後 PASS；新增測試與文件後的最終結果以本次交付 ledger 為準。
- [只讀權限映射](PERMISSION_MAPPING.md)：27 列、162 keys；648 resolver 比對、24 destination 矩陣、108 workflow metadata 與 11 撤權 session。舊 audit 的 38 個 Save 派生能力差異讓它的零差異斷言 FAIL，原始結果保留，不改檢查規則或政策冒充 PASS。
- 完整 build、compiled full-page acceptance、完整歷史／工作樹 `node scripts/sites-ci-preflight.mjs` 要綁定候選 commit；最終交付列明實際結果與未跑項。本任務所有 PNG、JSON 日誌、bundle／patch 僅在本 executor 的本地證據目錄，不入 Git、不傳 Space。

使用者的私有原畫面參考（識別、來源與大小僅留私有 evidence）：官方 materialization 已取得 transfer，但當前 executor 的官方 helper 回報 `download failed`；未取得本機像素，**參考圖未查看**。沒有使用其他 executor 的路徑、猜 URL 或改通道下載。前後截圖來自本工作區真正 renderer 的隔離合成頁。

## 整合邊界

本分支 ownership：`user-access.js` matrix 回傳的說明與 row markup；`user-access.css` 矩陣呈現；`index.html` 兩個版本 tag；測試、文件與其 CI step。未納入畫布 Save/delete、草稿資料邊界、登入候選。純 UI 可先審查；未來整合同檔須保留各自 hunk，跑相同 payload／權限 UI 回歸與 compiled full-page。正式模組權限拆分排在 adapter／資料交易邊界之後，具體來源相依見映射文件。

僅建立本任務的獨立 Draft PR，保留一般 review／CI 關卡，不 mark ready、不合併、不部署。repo 的普通只讀查核已成功，不能把其他任務的拒絕或先前 Space 網路失敗當成本任務的 GitHub 拒絕；若本任務真正遇到拒絕，停止該步且不換通道。真實 IME、實體裝置、正式站、完整所有業務按鈕生命週期皆 NOT_RUN。

## 編譯版手機預覽與鍵盤驗收補充

前輪的 compiled 手機 preview 截圖在 resize 後立即擷取，側欄遮住頁面，且原 harness 只檢查 dialog overflow；前輪截圖保留，不能算矩陣 preview 已完成視覺驗收。新增 `tests/role-template-compiled-browser.mjs` 使用實際 compiled product／正常登入／既有語言切換按鈕與正常鍵盤事件，確保側欄收起且 resize 轉場結束，將矩陣捲入視野並以 elementFromPoint 確認未被遮擋，再截取合成畫面。沒有改 CSS 或 stub 掩蓋問題。

新檢查覆蓋中越文 1440／1024／390px 的 preview 與 dialog、空／有效額外入口、長角色名稱、欄位對齊與 overflow、Tab／Shift+Tab 正反遍歷每個可見 enabled 控制、拒絕聚焦背景產品控制（容許 Chromium 原生工具列邊界停點）、summary 的 Enter／Tab／Space、拒絕離開時保留輸入、接受關閉後重開恢復儲存值，並核對 shared-state 內容／revision 未變。新腳本納入既有 compiled synthetic CI step；結果及 exact head 以本任務最終交付為準。

原 38 項 audit FAIL 不變：固定 base/head 的 79 個實際輸入來源相同，原 assertions 在兩版皆得到 38 !== 0；沒有藉改政策或測試消除差異。原參考圖仍未查看像素。舊手機 preview 的證據缺口與新的補驗結果分開記錄。

本地獨立唯讀審閱確認 role 產品來源未變更 policy／payload。原診斷的手機遮擋與新增測試對原生焦點／選單狀態的錯誤假設紀錄保留；成功補驗只算新的可見矩陣證據，不把舊失敗改成 PASS。

## #90 基準更新與 cache CI 修正

`c0d5147` 的 AB C run `42231956716`（306 PASS／1 FAIL）與 PROCESS run `42231956840`（334 PASS／1 FAIL）都在 `tests/navigation-adapters.test.mjs` 的精確 cache 契約失敗：程式已 pin `user-access.js`／`user-access.css` 的 `20261106-role-layout1`，但 expected 仍是舊版。本輪把兩個 expected 同步為真版本，保留唯一性、deepEqual、載入順序與全部 negative assertions；沒有把產品 pin 改回舊值。更新後同完整測試組在本地為 307／335 PASS，下游原 build/browser skip 不冒充失敗或通過。

正常 merge 最新 main 只有 `HANDOFF.md`／`AI_CONTEXT/CHANGELOG.md` 首頁新增條目衝突，角色與 IQC 兩條都保留；產品 index 自動合樹保留 IQC `20261106-number-hint1`、IPQC-C `20261106-c-receipt-performance1` 及兩個角色 `20261106-role-layout1` pins，main 的提示測試／CI 接線保留。

Feedback run `42231956773` 第一個 two-tabs scenario 已 PASS；另一 scenario 在原測試 `count()` 的 IndexedDB `page.evaluate` 發生 `Resulting promise was garbage collected`。與 cache assertion 是不同故障；需同環境 base／候選對照證明範圍，不據此修改權限或共享核心。舊原始失敗紀錄保留。


## Feedback 初始化探針修正與對照

原 two-tabs 的第二情境把 `flush()` 的同步返回誤當初始化完成；原計數探針可能先建立沒有 stores 的 v2 IndexedDB，transaction 同步拋錯後留下未完成 Promise。控制真實 compiled 模組的載入先後，在 main `339df756` 與角色 `1c6bd5f` 均重現此探針問題；產品先初始化時兩版均可正常 count=0。原始本地測試是 main PASS、角色候選在 offline 等待逾時，並未逐字重現 CI 的 GC 錯誤，不能聲稱受控案例證明唯一 CI 根因。

只修 `tests/access-event-two-tabs-browser.test.mjs`：讀取探針中止 upgrade、處理同步／transaction 錯誤並等交易完成；新增初始化前 reject 與 DB 不存在負例，再釋放原 compiled bytes 並等真產品 `received` 狀態。原 count=0／1、server count=1、businessPosts=0、businessState 不變與第一情境冷啟動離線斷言完整保留。沒有改產品、增加 sleep／timeout 或寫入替代 stores。同一修正後測試在 main339 與角色候選均兩情境 PASS；獨立只讀審閱確認未放寬斷言。

更新 main 後的本地證據：AB C 307／307、PROCESS 335／335、IQC 提示中越文兩尺寸 4、角色 isolated 15、帳號 isolated 17、真 compiled 角色中越文三尺寸 6 均 PASS；lint／TypeScript／build PASS。最終 exact-head build、compiled 回歸、完整歷史／工作樹 preflight 及遠端 CI 狀態由交付 ledger 分別記錄；遠端未完成不得當作 PASS。舊 38 audit FAIL 與原參考圖／實體裝置／真實 IME 未驗限制維持。
