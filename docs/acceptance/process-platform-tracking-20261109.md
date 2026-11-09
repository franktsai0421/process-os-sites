# 製程平台需求追蹤（2026-11-09）

本批基準：GitHub main `b06394ce0065849733399423afd2d906761d69c1`。本分支只修正新增工段遺漏已核准共用流程類型，未合入同時進行的畫布／全站草稿改動。草稿 PR 不是主線或測試站更新。狀態須由實際 commit／CI／部署另行核對。

## 需求、相依與驗收矩陣

| 項目 | 已核對的來源／本批範圍 | 未完成或驗收界線 |
| --- | --- | --- |
| 1. 篩選後假未存、切頁卡住 | 畫布候選 b1598b6 已含忽略新增空工段 scaffolding 的修正；未在 main | 必須和全站草稿候選語義整合，實站跑空白／不同類別／群組切頁。約 40 秒現象未重現，不能宣稱已修好 |
| 2. 未存切頁直接放棄、不恢復未存 | b1598b6 的未送畫布／表單採 RAM-only；保留原 UNKNOWN 收據 | 新整合版仍須跨頁、線別、工段、關頁／重開驗證 |
| 3. Save 時整組衝突選我的／對方 | b1598b6 有 fresh read、整組選擇、保留非衝突修改與 workflow revision 防過期；另一批正整合共用草稿 | 不沿用原候選 PASS 宣稱新共用 client 通過；須補兩人／刪除／連線／撞號／選擇期間再改 |
| 4. 移除多餘入口和固定輪詢 | b1598b6 已移除畫布相關入口與本模組固定輪詢；e460d76 含共用 history 輪詢移除 | 全站統一候選另有共用 client／多模組改動，未整合、未上站 |
| 5. 畫布依類別主要工段 | main 的 categoryStageCodes 優先用已核准 category.defaultStages；未設定時用產品路線集合 | 須以實站 C 線 GIA CONG 等真實類別及空類別核對，不能把純函式視為已驗收 |
| 6. 核准工段、類型與機器連動 | **本批修正**：新增工段固定案件含已核准 PROCESS 中 catalogKey 類型；新 ID、保留類型／名稱／媒體，清空工段專用機器。來源無自訂時，新工段加入自訂；同鍵設定衝突拒絕 | 不回填舊核准工段、不推造無 catalogKey 的舊模板身分。此批不重構流程資料全域儲存；核准前不可進生效資料，實站操作仍待驗 |
| 7. 真正不同模組各有草稿及權限 | main 有 master-document-boundary 的準備描述，但原 AB/C 仍含線別／工段共用草稿 | 涉及既有資料所有權和權限的切換須獨立設計及使用者決定；此批未啟用 split-v1 或遷移 |
| 8. 送審、撤回、核准與原頁已核准歷史 | 現有主線／不同候選需逐模組核對；本批保留工段案件的固定來源、核准／撤回競態及生效流程 | 未宣稱全模組舊版只讀、撤回權限或歷史入口都已完成 |
| 9. 步驟數與速度 | 本批無畫布呈現／效能修改 | 存取後步驟數、進頁／切頁／Save／Submit 量測待完成；沿用 >5 秒優化、>10 秒優先的使用者門檻 |
| 10. 完整瀏覽器與測試站驗收 | 本批使用合成資料的真正 handler／SQLite 測試 | 瀏覽器／iPhone／實機 IME／兩個真實使用者與實站完整生命週期 **NOT_RUN**；先前 browser HOLD 未重試 |
| 11. 一次 Save 當前畫布、送審整份已存製程 | b1598b6 含原子 Save 與其他畫布保留 | 新共用 client 整合後再驗；不能改為只送審當前畫布 |
| 12. 結構衝突與防重送 | b1598b6 含刪除相依群組與原 POST／receipt／協定 pin | UNKNOWN、404、晚到回應、quota 等保護不得隨未存恢復一起刪除；本批不重送任何舊操作 |

## 共用檔與候選協調

b1598b6：獨立畫布候選，來源 dc34874。e460d76：BOM＋畫布＋history 候選，來源也是 dc34874；包含真實雙親合併及 source proof 層，不可把它當成單一畫布補丁，或整檔覆蓋新的 main。兩者均不等同 GitHub main b06394c。

工作區另有進行中的 canvas/tooling 與 unified-draft 改動，含 app.js、master-data.js、process-authoring-v3.js、canvas-local.js、shared-draft-client.js、master-shared-client.js 等。本批不寫入那些工作樹。後續整合須保留各自的原收據、權限、revision/CAS、pending 和快取來源證明。

本批產品差異僅 `lib/master-stage-link.ts`；CI、測試與本文是配套。可先審本小批，再將確定 commit 納入全站整合；不得以其中一批完成推論全清單完成。

## 本批驗證

- 新增工段共用類型：9 項 PASS。含來源不變、共用鍵去重／不一致拒絕、不帶機器、ID 分隔碰撞、無共用鍵舊資料保留、來源變更拒絕核准。
- 真正 master workflow handler：inline 與 records-v1 各 8 組 PASS，覆蓋 fixed Save／Submit／Approve、PROCESS busy、withdraw／approve 競態、來源版本 pin；fixture 含已核准自訂類型。
- 既有 AB 權限與製程主資料引用：58 項 PASS；沒有以管理員成功取代拒絕角色測試。
- lint、非增量 TypeScript、來源 boundary：PASS；完整歷史來源掃描已取得公開 main 歷史並檢查 594 個 commits，PASS。提交後須再核對最終 HEAD。
- 已存在匹配 lockfile 的依賴以隔離副本重用；不是全新安裝驗收。首次依賴 symlink 被 source boundary 正常拒絕，已改用實體副本，未改防護。
- 正常 guarded build、最終候選 CI／review 結果以 PR 為準；測試站、正式站與瀏覽器沒有因本機測試而變成 PASS。

## 資料與發布邊界

沒有 SQL/schema migration、帳號權限調整或真實資料寫入；既有核准工段／模板 ID／歷史不修改。新增模板只有隨原工段案件經核准才生效。真正不同模組草稿／權限拆分與既有資料遷移仍需獨立決定；本批未部署、未合併 main，亦未操作原中控系統連接器。
