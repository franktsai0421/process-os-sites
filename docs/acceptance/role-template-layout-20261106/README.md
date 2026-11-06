# 角色範本布局與說明候選

2026-11-06，獨立於 main `2882f35de8e68370304a2d2235c039e226a2e4e5`。改善角色範本／個別權限共用矩陣的對齊、可用寬度與說明；不改角色、人員資料、permission keys、依賴、API、授權策略或 schema。未合併或部署。

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
- 完整 build、compiled full-page acceptance、完整歷史／工作樹 `node scripts/sites-ci-preflight.mjs` 要綁定候選 commit；最終交付列明實際結果與未跑項。所有 PNG、JSON 日誌、bundle／patch 只在專案外證據目錄，不入 Git。

使用者的私有原畫面參考（識別、來源與大小僅留私有 evidence）：官方 materialization 已取得 transfer，但當前 executor 的官方 helper 回報 `download failed`；未取得本機像素，**參考圖未查看**。沒有使用其他 executor 的路徑、猜 URL 或改通道下載。前後截圖來自本工作區真正 renderer 的隔離合成頁。

## 整合邊界

本分支 ownership：`user-access.js` matrix 回傳的說明與 row markup；`user-access.css` 矩陣呈現；`index.html` 兩個版本 tag；測試、文件與其 CI step。未納入畫布 Save/delete、草稿資料邊界、登入候選。純 UI 可先審查；未來整合同檔須保留各自 hunk，跑相同 payload／權限 UI 回歸與 compiled full-page。正式模組權限拆分排在 adapter／資料交易邊界之後，具體來源相依見映射文件。

沿用 parent 指定的 GitHub GraphQL Forbidden 發布 HOLD；不代原任務重試、不換 API／CLI 通道建立 PR。不合併、不部署、不重開連接器。保留 local commit、可復原 bundle、patch、PR 草稿與交付 evidence；PR 建立待同 scope 限制解除。真實 IME、實體裝置、正式站、完整所有業務按鈕生命週期皆 NOT_RUN。
