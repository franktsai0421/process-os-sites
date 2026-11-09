# 全站草稿存取衝突整合候選

原始基準：GitHub main `b06394ce0065849733399423afd2d906761d69c1`。已語意合併最新 main `d4ac309fe05c89288af226b52c18161865ccdcb8`（#98）；主 runtime／index 保持通過驗證的 def45f9 精確 bytes。本文件描述獨立本機候選；不代表已上 GitHub、合併、部署或正式帳號驗收。各模組最終 evidence 仍須綁定整合 commit。

## 已確認的共同契約

- 表單完成只改本頁 RAM。明確按「存取」才讀取目前共用草稿，以原始基準／本機最終意圖／遠端內容比較。
- 真正衝突只開一個全組選擇：用我的、用對方的、取消。雙方無衝突修改及同值收斂都保留；選擇後自動接續同次原子 Save。
- 選擇期間遠端版本變動，在送出前重新讀取／比較，必要時重新選全組。已送出後的 CAS 拒絕不自動重送；結果不明保留原操作、收據與寫入限制，只查原結果。
- 保留伺服器權限、世代、pending 鎖、引用與資料格式檢查。已核准版本唯讀，不能撤回；送審仍使用最後成功手動 Save 的固定快照。
- 真正切換模組頁面時無提示放棄尚未送出的本機輸入；同頁線別、群組、搜尋、類別等篩選不清除本機修改，也不另拆草稿。
- 問題回報是帳號私人 IndexedDB 草稿，不是多人共用業務草稿，不新增 mine/theirs 或把它併入業務 Save。

## 實際頁面／草稿盤點

| 頁面 | 目前 scope | 整合方向／界線 |
| --- | --- | --- |
| 製程編輯台、畫布 | `process:platform` | 整個編輯台一次保存；workspace／類別／工段仍是頁內視角 |
| AB 產線與類別 | `master:AB` | 產品、類別與路線三方合併；仍包含既有 AB 線別資料 |
| C 產線與類別 | `master:C` | 同上，與 AB 分開 |
| 線別與工段管理 | 仍共用 `master:AB`／`master:C` | 雙選可用於目前 scope；**獨立持久草稿尚未啟用** |
| 流程資料／模板／機器 | `master:PROCESS` | 同一流程資料頁；機器 modal 不另拆草稿 |
| FQC | `fqc` | 錯誤碼、項目與矩陣同模組 |
| IQC | `iqc` | 零件、項目、供應商／類別同模組 |
| IPQC A/B | `ipqc-ab:module` | 全模組；line/group 不拆，保留舊 group 相容讀取 |
| IPQC C | `ipqc-c` | 項目、錯誤、照片與設備同模組 |
| BOM | `bom` | 根件、位置、全樹／下階／匯入視角不拆 |
| 模具 | `tooling` | 內部分頁／目錄／表單不拆 |
| 檢具與測試設備 | `routine-equipment` | 本模組保存；跨品質設備移轉保留既有交易界線 |
| 例行 FQC | `routine-fqc:<documentId>` | 每張檢查文件獨立；主資料 FQC 與例行 FQC 不混合 |
| 問題回報 | 私人 `process-web-feedback-v1/drafts` | 無多人共用衝突，不遷移、不清理 |

例行報告資料庫及未實作的其他例行審核頁籤是 placeholder；帳號／權限等即時管理表單也不因有表單而被算作共用業務草稿。

## 主資料頁面獨立草稿的切換方案（未執行）

目前資料模型以 AB/C 合併產品、類別與線別工段，且 active、saved、pending、歷史、原收據及 PROCESS stage link 都依舊 scope 關聯。`master-document-boundary.ts` 的 `split-v1` 僅是前置保護；`master-line-draft.ts` 也沒有 storage／HTTP／codec／CAS adoption。不能只換 client scope 或打開 feature flag。

依「每個真正頁面一份、同頁篩選不拆」的最新要求，目標所有權應為：AB catalog、C catalog，以及單一線別工段頁面（內含 AB/C 的授權視角）；PROCESS 仍維持同頁一份。現有準備描述 `AB.lines`／`C.lines` 並不等於已確認的最終頁面邊界。

切換前需要單獨可審核的架構／資料計畫：

1. 固定來源版本向量與完整可還原備份，隔離副本證明內容、穩定 ID、照片、歷史及原收據均不遺失。
2. 明確舊 combined 草稿及 pending 案件如何結清／保留，禁止自動撤回、刪除或以新草稿冒充舊 receipt。
3. 線別頁面包含 AB/C，但讀取及操作仍需各自有效權限；不可因共用新 scope 洩漏沒有權限的內容，也不可把舊 lines entry 權限當成 AB/C grant。
4. 所有 writer、審核、歷史、還原、引用、PROCESS stage link 與 runtime catalog 必須一起支援相容投影及原子 CAS；舊 client 需明確拒絕寫入新所有權。
5. 在隔離資料上完成兩身分全生命週期、備份還原及失敗／unknown 演練，取得本次重大所有權切換的使用者決定後才啟用。此次候選保持 closed admission，不遷移真實資料。

因此本批不能標為「所有頁面已獨立草稿」或可直接發布。

## 驗證與外部阻擋

各模組 actual handler + synthetic DOM／SQLite／Map-R2 測試不等同原生瀏覽器、Windows、實體 iPhone、真實 IME 或正式站驗收。完整整合 build、來源逆轉證明與正常 CI 接線由整合批次固定後核對。

舊品質 243-path create_tree 結果仍 UNKNOWN；本次唯讀查詢既知 tree `ee1352c5508376713bae156e205701e512c3212c`（另品質批次 `beddd52759e5cd322e6d64b658b6e8c0a2f84025` 也另查） 回 404，不能當作未執行證據。原 payload 範圍不完整，因此不以假定互不重疊或分拆方式重送。先前檢具 create_tree 也曾被自動審查拒絕，理由是當時只有進度查詢授權、公開原始碼／文件目的地未確認。本次沒有重試該操作，也沒有繞道上傳。GitHub 上傳、合併與部署未完成，需沿原操作查證及適用授權處理。
