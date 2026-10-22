# 2026-10-13 FQC 文件色彩、草稿照片與捨棄驗收

## Task / 範圍

只續接原 3040 FQC 的四項回饋：文件色彩一致、送審前照片可移除、10 筆尚待完成 DEMO、取消已捨棄文件查閱／復原入口。使用者已澄清照片不是修改已核准正式報告。保留現有資料與並行工作；未修改 3000、未新增埠、未部署、未提交或推送 Git。

## Changed / 完成內容

| 文件 | 色彩 | 適用畫面 |
| --- | --- | --- |
| PLN 計畫 | 深綠 | 編號、分類按鈕、分組、清單及關聯連結 |
| RPT 初測 | 藍 | 同上 |
| RTS 複測 | 紫 | 同上；沿既有 RTS，不改編號為 RTD |
| COR 更正 | 琥珀 | 同上 |
| WVR 免做 | 橄欖綠 | 同上 |
| DSP 處置 | 玫紅 | 同上 |

保留文字識別；結果與審核徽章仍表達各自狀態。上傳成功標記未儲存，同張照片不重複加入。可編輯草稿每張照片均有明確的「移除照片」按鈕，移除後即時消失；保存與重開後不再出現在該份草稿。最後一張必要照片移除後可以保存，但不能送審。核准報告不提供直接照片修改。

搜尋取消「顯示已取消／已捨棄文件」，舊篩選狀態也不能重新顯示；前端復原入口移除，後端 restore-document 拒絕 RESTORE_DISABLED。捨棄確認明示不可復原；待審撤回、相依、權限與 CAS 閘門保留。內部取消紀錄、編號占用與稽核留存，不是清空資料庫或備份。

## 本機資料與保全

- 正式來源經既有來源保存／送審／明確管理員自審／核准／Generate 增量加入 10 項，來源版本 32。
- 名稱：[3040 待完成 DEMO 20261013 01] 至 10；均無 planId、completion，留給使用者操作。查「未完成項目」顯示 10。
- 專用照片驗收另建 FQC-COR-20261013-0048（[FQC 專用驗收 20261013] 照片移除驗證 — 未送審），來源為既有 QA 初測 FQC-RPT-20261013-0046；保留空照片的已保存草稿，pendingId 為 null。未占用 10 筆 DEMO。
- DEMO 建立前後比對原來源／工作／文件／案件保全；照片驗收前後比對既有 102 份文件 flow 與編號、21 案件、37 工作未變。關聯文件投影因新增 COR 正常增加，不能將這項衍生變化誤認為正式內容被覆寫。
- [最終唯讀資料核對](evidence/colors-20261013/final-data-verification.json)。本輪程式原檔和本機前置資料留在工作區外的 fqc-colors-20261013 與本機專用 recovery 目錄；未將含業務內容的完整前置資料複製進本驗收附件。

## Tests / 結果

| 檢查 | 結果與界線 |
| --- | --- |
| 六組既有 FQC 定向檢查 | PASS：核心流程、單樣品／固定原樣品、搜尋、真 UI binding、捨棄不可復原／重新建立、權限／CAS／receipt／pending lock；[完整輸出](evidence/colors-20261013/tests.json) |
| JavaScript syntax、diff whitespace、搜尋模組 lint | PASS（搜尋模組 lint：0 warnings / 0 errors） |
| Chrome 原 3040 照片流程 | PASS：原 1 張＋新上傳 1 張，移除新圖再移除原草稿引用，0 張保存、重新載入仍 0 張；缺必要照片送審被阻擋，未建立待審案件 |
| 桌面中文／越文分類 | PASS：兩種語言分類與數量、配色；鍵盤 Tab 可達下一卡，focus outline 可見 |
| 390×844 版面 | 有限制：DOM 未超出視窗，但實際截圖左側全域選單遮住主要內容，不能列為完整手機驗收 PASS；此輪未改全域選單 |
| 全库 tsc --noEmit | FAIL：Temp/process3050-runtime/app/api/product-status/route.ts 缺 @/lib/product-status；並行 3050 來源問題，本輪未修 |
| scoped lint | FAIL：lib/routine-fqc.ts 既有 4 項（no-explicit-any 兩處、require-array-sort-compare、no-base-to-string），不是本輪新增段落；未扩大修正 |
| 原生手機、全系統完整回歸 | 未執行 |
| 新正式標準→計畫→初測→複測→結案整條原生流程 | 本輪未重跑；本輪六組隔離測試包含對應核心流程，不將其冒稱新的完整瀏覽器流程驗收 |

## 證據

- [桌面中文分類配色](evidence/colors-20261013/colors-cards-desktop.png)
- [越文與鍵盤焦點](evidence/colors-20261013/colors-cards-vi.png)
- [移除後缺照片阻擋送審](evidence/colors-20261013/photo-removed-submit-blocked.png)
- [390px 版面限制原始截圖](evidence/colors-20261013/colors-mobile-390-zh.png)

## Documentation / 資料模型與風險

規格來源：[ROUTINE_FQC](../specs/current/ROUTINE_FQC.md)；實作：[AI_CONTEXT](../../AI_CONTEXT/models/ROUTINE_FQC.md)。沒有 schema、migration 或新持久欄位。文件取消行為由可復原改為不可復原；已開啟的舊頁若仍有復原按鈕會被後端拒絕，需重新整理。

照片「移除」確保目前 buffer 與之後保存的草稿不引用該照片；未清除 immutable 歷史保存、其他文件共用的 SHA256 R2 物件或备份。這些不應被宣稱為已物理刪除。歷史正式報告與其照片未修改。手機全域選單遮擋、並行型別檢查與既有 lint 問題仍待處理。
