# 模具設備 Local 匯入與定向驗收

更新：2026-10-07，Asia/Bangkok。Task：依 20261006 交接包 README、docs/01–04、import_rules，在目前 checkout 實作「資料後台 → 品質系統 → 模具設備」，匯入未核准共用草稿。需求見 [TOOLING](../specs/current/TOOLING.md)，實作見 [資料模型](../../AI_CONTEXT/models/TOOLING.md)。本報告區分真實 3030 與合成 fixture；沒有代核准這 366 筆。

## 環境與界線

- Checkout `<WORKSPACE>/中控系統`；branch `codex/ipqc-ab-local`；HEAD `84278d837898f4e836ec003f7adb67ff38f785c8`，未提交工作保留。
- 實際入口：[3030 模具設備](http://127.0.0.1:3030/process/?system=quality&view=data&dataTab=quality-mold-equipment)。以使用者指定的 3030 覆蓋包內舊 3000 操作建議。
- D1/R2 位於 `.wrangler/local-only/import-3030-20261006/runtime/.wrangler/state/`，與日常 3000 分離；程式使用目前 checkout。10/07 重新啟動既有 runtime，沒有重新初始化、seed 或重匯。
- 10/07 實際讀回：shared_state revision **414**；唯一 tooling V1 為 draft；activeVersionId、pendingId 均 null，cases 為 0；saved ID `6ea61b0b-4819-4eec-8bba-eefa071176fc`。working 與 saved 完整等於 dry-run payload。
- 原 3000 資料仍 revision **409**，values SHA-256 `f1c6dcde512ecd54990231cc0fbf4f9d7efb8ec9cdc33c672487ce44cdbd8f57` 未變；3030 相對備份只有 `toolingMasterControl` 改變。未 commit/push/merge/deploy，未操作遠端或合回 3000。
- 目前共用核心另有並行 IPQC 審核政策修改，原樣保留。本次模具 adapter 依本對話要求，額外維持一般帳號不可自審、無實質變更不可送審；不回改其他 scope 的政策。

## Changed 與資料模型影響

新增 tooling workflow／checks／IQC／photo API、欄位與引用防護、單調不重用代碼、新移轉紀錄、同頁目錄及六頁器具編輯。使用目前 VersionDraftUI、shared-draft-client、現有品質色系與版本確認平台，沒有使用包內舊預覽 UI。

新增 `toolingMasterControl` 邏輯資料鍵、`tooling/photos/{SHA256}` 媒體前綴；沿用 shared_state CAS、records-v1、R2，不新增資料表、schema 或 migration。prepared model 新資料鍵在編碼前登記，修復新模組 begin 成功但重讀遺失；全庫還原的待審防護納入 tooling。

## 實際匯入摘要（3030，PASS）

| 項目 | 實際值 |
| --- | --- |
| 器具總數／類別 | 366；DC01 59、DC02 188、DC04 119 |
| 啟用／停用 | 354／12；12 筆使用 JSON 指定越文原因 |
| 位置 | 內部 308 均為 TỔ KẾ HOẠCH SẢN XUẤT；外部 58 |
| 日期 | AD 轉 ISO 307；日期遺失 59 |
| 頻率 | 6 個月 59；12 個月 307 |
| 單位 | Bộ 59、PCS 307；正整數原数量保留 |
| (+) | 指定 11 筆越文、中文名稱各加一次 |
| MFR | 原 13 家保留；新增 014–018，映射 307；缺生產商 7 |
| 資產碼 | 6 空白、AKH24009／AKH19005 兩組重複保留 |
| 舊歷史 | 舊檢查 0、造舊移轉核准事件 0；未新增 DC01-0060 |
| 待補 | working／saved 各 516 項，屬提醒，並非 516 筆器具 |

MFR014–018 分別為 DAI LOAN/TWD0002（200）、KHONG XAC/VNK0005（73）、YIFA/TWY0001（27）、ĐOÀN HỮU TÍN/VNT0037（5）、CẨN HÒA/VNH0012（2）。舊 MFR 與 SUP 空 ERP 未補造。

唯一 Excel SHA-256：`2233ceda38df530749749a2370be7c4513b155b42afd5de3627ecb8158f9b981`。原檔唯讀且 manifest 逐檔核對。重複 dry-run payload SHA-256 均為 `0a66f9fe4f98d8269712e866bec2f821af67d270f95d9bb92fce73d5f337f034`；匯入器重跑回覆 `ALREADY_IMPORTED_IDENTICAL_NO_WRITE`。

## 照片與 IQC

**已確認照片 PASS；五張身分確認未完成。** 從 308 個 drawing anchors 交叉核對工作表、relationship、索引、器具代碼及名稱。236 筆器具有圖、243 個照片引用、239 個唯一原圖。239 個實際媒體 GET 全部 200 且 bytes SHA-256 等於來源原圖；未轉成大 base64 存入快照。其餘 130 筆無已確認照片。

image43、image84 雖有錯位 anchor，但相同 hash 各有明確第二個 anchor，已分別歸屬 DC02-0099、DC02-0088。下列原圖保留於 staging/media，尚未猜配：

| 原圖 | 原始位置／具體衝突 | 待確認 |
| --- | --- | --- |
| image67.png | Z82；圖上 SEN 16MM，與附近 DC02-0014／DC02-0017 的識別不一致 | 正確器具碼 |
| image72.png | Z68；刻有 14 的錐形件，位於非照片欄 | 是否為 DC02-0003 或其他器具 |
| image82.png | Z67；兩個白色真空環 | 正確器具碼 |
| image83.png | Z67；單個白色環 | 正確器具碼 |
| image188.jpg | AB7／P003 索引指 DC01-0002，但圖是 Silcote 808 防鏽油 | 應作保養說明圖或器具照片；目前不掛入器具相簿 |

IQC 使用真實已核准版本 `458a8070-c35f-47cb-b444-5868857dc1f1`：188 個未刪除可選產品；37 筆器具唯一匹配、18 筆找不到、310 筆原欄空白、1 筆複合碼待確認。匹配以 stable ID 保存，不用名称猜測。8 筆原圖實際 HTTP 200 且瀏覽器完成解碼：3010109、3010202、3010203、3010301、3010305、3010306、3010401、3010502。

待確認複合碼：DC01-0031 → `3030203+3030204`，未擅自拆成兩筆。未匹配清單：

| 器具碼 | Excel IQC 碼 |
| --- | --- |
| DC01-0003 | 3020121 |
| DC01-0004 | 3020102 |
| DC01-0011 | 3012402 |
| DC01-0023 | 3060313 |
| DC01-0026 | 3010304 |
| DC01-0027 | 3010308 |
| DC01-0034 | 406HS007 |
| DC01-0037 | 406VP001 |
| DC01-0043 | 406HS013 |
| DC01-0045 | 406HS015 |
| DC01-0046 | 406HS014 |
| DC01-0047 | 3080171 |
| DC01-0048 | 3080173 |
| DC01-0050、DC01-0051 | 407DX013 |
| DC01-0052 | 107BA001 |
| DC01-0053 | 107BA002 |
| DC01-0054 | 107BA003 |

## Tests：依包內 03 區分結果

| 驗收項目 | 結果與環境 |
| --- | --- |
| 全部匯入規則、原碼／數量／單位／ID | PASS，真實 3030 完整 saved/working 與唯讀來源 payload 核對 |
| 重複 dry-run／匯入重跑不重建 | PASS，相同 payload hash；已匯入相同資料無寫入 |
| 指定備份可讀與完整性 | PASS，SQLite integrity、備份讀回與原 pointer 一致；整庫覆蓋還原 NOT RUN，避免覆寫現有草稿 |
| 照片原檔與媒體持久化 | PASS，239 原圖 hash、重新開服務後讀回；所有照片身分完成度 FAIL，保留上述 5 張衝突 |
| 縮圖、放大、多圖／無圖 | PASS，實際 3030 UI 抽驗；未宣稱逐張人工識別 |
| IQC 真實產品、8 原圖、搜尋／類別與供應商複選 | PASS，3030 UI 與 API；同維度聯集、跨維度交集，跨頁保留選取 |
| IQC 批次去重／移除 | PASS，3030 複選跨頁保留；3031 UI 重加既有選取維持一筆、移除確認儲存後重開為空、重新加入保存；非法 ID fixture 拒絕 |
| IQC 讀取失敗／重試不清空 | PASS，3031 注入 HTTP 503 後原 part-1 仍在；顯示保留引用與重試；恢復服務後重試仍選取一筆 |
| VersionDraftUI／品質樣式／報錯待補歷史 | PASS，直接 mount 現有元件，3030 實際畫面；原型 UI 未採用 |
| Danh mục 位置、四區同頁、廠商 ERP／獨立＋欄位 | PASS，3030 展開／編輯／新增欄位後取消；正式寫入測試為 fixture |
| 器具新增按鈕、六頁、頻率、啟用與封存 | PASS，3030 控制項檢視；核准後封存隱藏整段 UI 操作 NOT RUN |
| 1366／1440、768 平板、390 iPhone 模擬、中越語系 | PASS，瀏覽器畫面／DOM、表格區域捲動、對話框取消回焦點；實體 iPhone／原生輸入法 NOT RUN |
| 手動 Save／重進與隔日重啟仍在 | PASS，3030 同值儲存、重開頁、重新登入及 10/07 重啟讀回；saved 內容未改 |
| 非法數量／失敗不覆寫 | PASS，3031 UI 數量 0 回 TOOLING_QUANTITY_INVALID、輸入仍為 0；修正為 2 後確認／Save 成功；3030 取消後原數量仍為 1；斷網未知 Save 回應情境 NOT RUN |
| 兩帳號、欄位 guards、CAS 重試、收據重放 | PASS，合成帳號＋SQLite :memory:／R2 Map 的真實 handler；非 3030 員工實機聯測 |
| 業務缺漏 Save→Submit→Approve／Withdraw | PASS，3031 真實 UI 18 項待補仍能 Save／Submit、Fixture reviewer 核准 Fixture a 案件；固定歷史保留待補。3030 的 366 筆維持未核准 |
| 待審鎖定、一般帳號禁止自審、無變更禁止送審 | PASS，同上 fixture；模具 scope 額外保留本對話指定邊界 |
| 兩撤回入口權限一致 | PASS，3031 品質審核區 Rút hồ sơ 與草稿頁 Rút bản nháp 都實際成功、理由入固定案件；review-only withdrawal 後端測試通過 |
| 品質版本確認平台独立模具區 | PASS，3030 無待審；3031 從平台品質分頁展開固定案件、前後內容視窗、待補摘要及另一帳號核准完整操作成功 |
| 移轉 A/B、核准前位置、核准後唯讀、更正關聯 | PASS，fixture A/B 獨立、改 A 保留 B、核准後位置與歷史保護；3031 UI 舊兩筆 disabled，新更正帶 correctionOf=transfer-a，確認／Save 後保留 A/B 及新第三筆 |
| 歷史與有引用不能硬刪、代碼不重用 | PASS，fixture；UI 有權限控制與二次確認；真實 366 筆未刪除 |
| 全庫還原待審 interlock | PASS，tooling pending 時 `/api/backups` restore 回 409 |
| 匿名資料不洩漏草稿、其他 module／3000 未改 | PASS，真實 API 投影與資料 manifest/hash |
| TypeScript／定向 lint | PASS，`tsc --noEmit --incremental false`、新 tooling API/model/UI/import/test 定向 oxlint |
| 既有共用持久化／品質回歸 | 10/06 PASS：state-records、shared-draft、FQC/IQC HTTP V3；之後並行核心政策有變，該批只作當時證據，10/07 模具 15 項測試仍 PASS |
| 正式發布、合回 3000、全庫回歸 | NOT RUN，未在本次執行 |

## 備份與證據

下列相對路徑均以 `<WORKSPACE>/中控系統` 為根；含原始業務資料的檔案留在 ignored 本機目錄，不納入提交。

- 實際讀回收據：`.wrangler/local-only/tooling-20261006/local-verification.json`、`import-receipt.json`。
- 15 項 handler fixture：`.wrangler/local-only/tooling-20261006/fixture-results.json`。
- 3031 UI 僅使用 SQLite :memory:／R2 Map 合成器具與帳號，其他頁面背景從 3030 唯讀投影取得；結果在 `.wrangler/local-only/tooling-20261006/ui-fixture-results.json`。入口程式 `scripts/test-tooling.cjs --serve` 與 `scripts/tooling-ui-server.cjs`；停止即釋放記憶體資料，不對真實模具庫產生核准事件。
- 3031 已在收據保存後停止。它的簡化 IQC fixture 只供 tooling 引用 API，其他 IQC 管理頁曾回 `IQC_EXISTING_DATA_INVALID`，不把该環境當成其他品質模組驗收。3030 真實 IQC／照片 API 核對獨立通過。瀏覽器截圖已視覺檢視；本機截圖保存受工具限制未完成，不提供不存在的圖片檔。
- 匯入前 SQLite：`.wrangler/local-only/tooling-20261006/before-import/shared-state.sqlite`，同目錄 `manifest.json` 保存來源 revision/hash／R2 位置。
- 完整 D1/R2 基準：`.wrangler/local-only/import-3030-20261006/baseline/`，不要覆蓋或重建。
- 完整映射與疑義：`.wrangler/local-only/tooling-20261006/staging/{dry-run,iqc-mapping,photo-anchors,media}.json`、`media/` 原圖。`staging-repeat/` 是唯讀再生成比對結果。
- 原有 241 個修改／未追蹤檔案保全：`<USERPROFILE>/.codex\visualizations\2026\10\06\01a11057-de14-79b0-b43a-afa645a67c8c\tooling-prework-20261006/`，含工作檔、diff 及 hashes。
- 可重現命令：`node scripts/test-tooling.cjs`（只有 memory fixture）；`node scripts/verify-tooling-local.mjs`（3030 唯讀）；dry-run 參數見 script。不要為驗收重新執行套用或 seed。

## 尚未完成與風險

5 張照片識別、18 筆未匹配 IQC 與 1 個複合 IQC 碼仍需要具體業務確認；它們不阻擋儲存／審核。原來源空白不補造。上表 NOT RUN 不計入 PASS，尤其實體手機、未知 Save 回應恢復、整庫覆蓋還原與封存核准後完整 UI 操作。

資料隔離不等於程式隔離：3000 與 3030 使用同 checkout 程式。此模組的一般自審／無变更限制依本對話保留，與並行共用政策存在 scope 差異；將來若統一政策，應有明確需求再改。未核准草稿、照片及 IQC 疑義尚不足以宣稱正式業務驗收全數完成。
