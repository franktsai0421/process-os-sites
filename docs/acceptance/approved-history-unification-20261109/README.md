# 全草稿頁已核准歷史版本查看：第一批共同讀取能力

基準：本機全站草稿候選 `ce824f28d8f033500d81d7aa57104dfda1595eb3`，已包含 main `d4ac309fe05c89288af226b52c18161865ccdcb8`（#98）。本文件是盤點及首批後端成果，**不是全頁前端完成、已上 GitHub 或已部署的聲明**。

## 已確認規則

同一頁同一版本篩選欄列「當前草稿」與本模組已通過審核的版本。歷史直接在同頁唯讀；不得修改、存取、送審、撤回、還原或套用舊版。選當前草稿切回，保護本機內容、原操作、權限及收據。未存輸入、共用未核准草稿、儲存紀錄、退回／撤回／待審案件均不當作已核准歷史；正式指標本身不是審核證據。歷史不開彈窗，不分拆既有持久 scope，不移除資料或原有相容 API。

## 實際盤點與交付狀態

所有列的 GitHub 狀態均為 **未上傳本批／未合併**；測試站均為 **未部署**；原生瀏覽器、實機、真實帳號及完整生命週期驗收均 **NOT_RUN**。API PASS 僅指合成資料的真實 handler／SQLite／Map-R2 測試。

| 實際頁面 | 現有 scope／來源 | 本機 API | 本機前端與剩餘工作 |
| --- | --- | --- | --- |
| 製程編輯台／畫布 | `process:platform` | 新 approved-only PASS | `process-authoring-v3.js` 仍以舊歷史彈窗查看；需同頁顯示與工作區選擇保護 |
| 線別與工段管理 | `master:AB`、`master:C` | 各 scope 新 approved-only PASS | `master-admin-ui.js` 仍有案件／還原入口；與 AB/C 共用既有持久 scope，不在本批分拆 |
| AB 產線與類別 | `master:AB` | 新 approved-only PASS | 原 VersionDraftUI 一般歷史仍需轉接 |
| C 產線與類別 | `master:C` | 新 approved-only PASS | 同上，保留 C 自己的版本與權限 |
| 流程資料／模板／機器 | `master:PROCESS` | 新 approved-only PASS | 模板與機器是同頁視角；需同頁唯讀展示，不以現行機器資料替代歷史 |
| FQC | `fqc` | 新 approved-only PASS | `fqc-master.js` 仍開案件／歷史彈窗；需保留矩陣 RAM 與原比較基準 |
| IQC | `iqc` | 新 approved-only PASS | `iqc-master.js` 仍有可還原彈窗；需轉接、保留本機表單／照片 |
| IPQC A/B | `ipqc-ab:module` 與舊群組相容讀取 | module／群組新 approved-only PASS | `ipqc-ab.js` 尚未轉接；舊群組與新整份版本的唯讀聯集 helper 已有，但未註冊到本批 API／UI，不可宣稱舊版聯集完整 |
| IPQC C | `ipqc-c` | 既有專用 approved-only 路由 | 基準已有同頁 selector／唯讀投影及回當前；本批重新執行其實際 common／transport／handler 測試，非原生瀏覽器驗收 |
| BOM | `bom` | 既有路由沿新共同查詢規則，PASS | 基準已有同頁唯讀與原 writer 保全；本批移除僅有 formal pointer 的未審核基準，不重寫 BOM 本機編輯／Save |
| 檢具與測試設備 | `routine-equipment` | 新 approved-only PASS | `routine-equipment.js` 仍有案件／還原彈窗；需保全表單與跨品質交易界線 |
| 模具 | `tooling` | 新 approved-only PASS | `tooling.js` 一般歷史仍開彈窗；目錄／移轉分頁不另拆草稿 |
| 例行 FQC | `routine-fqc:<documentId>` | 自有文件／案件路由，未在本批修改 | 另有歷史頁籤與已核准文件查看；需逐文件接同一 selector，不能套用 numeric-version API 冒充完成 |

問題回報是私人 IndexedDB 草稿，無「已核准共用業務版本」；例行報告資料庫與其他未實作例行頁籤是 placeholder；帳號／權限即時表單不是共用業務草稿。不改這些資料模型。

## 本批實作

- `approved-history-query.ts` 精確綁定實際 pathname、adapter key、scope 與 AB module／group routing；只接受 list 或單一 detail，拒絕重複、混合、legacy、receipt、restore、catalog、references 等參數，且在讀取資料前拒絕。
- 共同 workflow GET 擴展原 BOM 的 approved-only 能力到 FQC、IQC、檢具、模具、製程、主資料及 IPQC AB。保持一般 GET／POST、CAS、pending、角色、原收據與舊相容介面。
- metadata 只讀核准證據、不載入歷史 body；detail 使用固定核准案件 content。完整序列化後重新查核登入、view／history、global revision 與 session，防止撤權期間先釋出內容前綴。
- formal-baseline 仍是共用 helper 的正式指標描述，但新 approved-only 列表與 detail 均排除；有實際 legacy approval 或完整 approved case 證據才列歷史。IPQC C 既有規則一致，未清除或重寫基準資料。
- master 及 process-authoring 的 wrapper 先將 approved-only 交給共同 parser，防止混入其他 selector 而繞到舊讀取分支。
- 沒有修改 shared-draft-client、VersionDraftUI 或各頁 writer，避免本批與正在進行的 Save／衝突統一工作互相覆寫。前端剩餘不是測試失敗的替代說法，而是尚未實作的工作。

## BOM 候選來源核對

已讀取 `4960d74` 的交付與獨立審查紀錄。它不是本批基準 `ce824f2` 的祖先，不盲目 cherry-pick。`bom-domain.mjs` 與 `lib/bom-workflow.ts` 相同；`bom-workspace.js` 的後續差異是全組衝突選擇文字及未 dispatch 的 Save 比較重讀 loop，現有 approved view 保留。共用 workflow 亦已有後續並行變動，本批只新增 GET opt-in。BOM common／實際 transport／實際 handler 的 35 項重新驗證 PASS。

## 驗證

- 新增 78 項真實 HTTP handler PASS，覆蓋 11 route/scope 組合、inline 與 records-v1、核准篩選、固定 content、無資料寫入、未登入拒絕、metadata 不讀歷史 body、混合參數、撤銷與版本競態。
- BOM common／實際 transport／handler 35 項與 IPQC C 41 項，合計 76 PASS。僅更新 BOM 舊測試中 formal-baseline 的預期列表，保留其餘斷言。
- 既有 AB 身分／權限重讀、重播、master clone 與各模組 Begin 收據回歸 68 PASS；純核准證據 helper 12 組 PASS。
- 本批 typed lint、非增量 TypeScript、diff whitespace 與 source-boundary PASS。依賴使用相同 lockfile 的既有本機實體副本；不是乾淨網路安裝證據。最初 dependency symlink 被來源檢查拒絕後已換為實體副本，未改來源檢查。
- 固定 commit 後的歷史來源 proof／guarded build 與完整 GitHub CI 狀態在後續紀錄補列，不能先宣稱 PASS。原有 immutable source pins 不因功能變更而自動有效，亦不得放寬或跳過。

## GitHub 與發布阻擋

既有 243-path create_tree 結果 UNKNOWN，原 payload 範圍不完整。已知 tree `ee1352c5508376713bae156e205701e512c3212c` 與另批 `beddd52759e5cd322e6d64b658b6e8c0a2f84025` 的舊唯讀 404 不能證明未執行。不以新分支、拆分、Blob API、CLI 或新對話重送。另有檢具 create_tree 自動審查拒絕的歷史：當時僅進度查詢授權、公開原始碼／文件目的地未確認；本批沒有重試。

本次唯讀核對 GitHub main `d4ac309`、公開 repo 與 PR #99（製程工段自訂類型，仍獨立草稿），不將它混入本批。沒有 push、create_tree、PR、merge、正式資料／schema／帳號操作、連接器開啟／重建／重連或部署。

## 接續順序

先維持單一寫入者固定 Save 整合候選；本批後端可獨立檢視並語意整合，再處理各模組顯示 lease／回當前與所有直接 writer callback 的 display epoch 防護。逐頁加上同頁 selector，移除舊彈窗／還原入口；舊 AB 群組與 legacy PROCESS 歷史需在原身分／scope 下唯讀聯集，不遷移、不拼造核准。例行 FQC 保留自有文件 ID 與完整 workflow 語意，另做投影。最後逐頁確認 RAM、open form、照片、pending、UNKNOWN、撤權、延遲回應及同頁篩選；遠端 CI／審查通過且無既有 UNKNOWN 阻擋後再依原授權處理 GitHub。正式資料／權限／重大架構與部署仍交 Frank 決定。
