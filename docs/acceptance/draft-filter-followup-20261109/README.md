# 草稿同頁篩選與衝突語義追加核對

基於已交付本機整合 `4a10e935ef8bd4cb3d4beecaa38ebf8c6f1508c2` 的獨立後續分支。原交付目錄與 bundle 不覆寫。本批不是上站、遠端 CI 或正式帳號驗收；最終 commit/tree 與測試日誌由新的外部交付 manifest 綁定。

## 逐頁結果

| 頁面 | 本批結果 | 保留的界線／相依 |
| --- | --- | --- |
| AB、C 產線與類別 | 既有整組 Save 與原 guards 保留；同頁選擇不另拆 scope | 獨立頁面所有權切換另案，未遷移 combined 草稿／歷史 |
| 線別與工段 | AB/C 同頁選擇保留兩邊 RAM；離開本頁才一起清未送輸入；UNKNOWN 原識別保留 | Save 仍只保存目前所選 AB 或 C 舊 scope；不是完整線別頁單一持久草稿 |
| 流程資料／模板／機器 | 真正離頁／projection reset 清除設備與名稱 closure，重入／換語言不復活；無 ID 舊照片在非空且完整未改原前綴時保留雙方獨立新增；帶 ID／混合 ID 不進入此推論 | 主照更換、刪除、重排、空基準首照或同 src 不同資料仍保守視為整個 mediaItems 衝突；不能宣稱逐照片完整合併 |
| FQC | 同頁篩選保留表單／File／基準；穩定 ID 且原順序未移動的不同照片修改／追加可合併；晚到 scalar／照片保留真正 accepted basis；Mine 可依現有 exact tombstones 在同一 Save 復原必要父子，保留雙方其他欄位 | 本機先改內容再刪除且 peer 也刪除時，Mine 仍結構拒絕、Theirs 可存、Cancel 零寫入；不能算所有結構完全支援 |
| IQC | 表單重開顯示本機 overlay；多個表單 Apply 只套各自 delta，保留其他本機修改；照片 File／blob 預覽留 RAM，明確 Save 且選擇完成後才 PUT；穩定 ID 不同照片可合併，晚到照片 delta 保留 accepted basis／peer 新增，再原子保存 workflow | 數值提示／送審／版本查看政策不變；照片端點無 durable operation receipt，未知上傳僅目前 document RAM hash 阻重傳，不能宣稱 reload 後收據復原；隔離的舊編輯器可能保留 File 到 document 結束 |
| IPQC A/B | 照片與規則用穩定 ID 合併，保留雙方非衝突欄位／新增；實際 line/group/stage/route 與 picker 篩選保留本機內容 | 同 ID 真正衝突仍一次選整組；UNKNOWN 不重送 |
| IPQC C | 實際產品搜尋、工段、錯誤與 picker 保留修改，無 runtime 變更 | 原 generation／照片／收據與 Save 保護保留 |
| BOM | 根件、代碼、occurrence、顯示與搜尋及匯入比較保留 journal／basis；未完成表單阻擋切換而不丟輸入 | 無 BOM runtime 變更，不改跨模組引用政策 |
| 檢具與測試設備 | 同頁 hierarchy 篩選保留編輯／新增 drawer、File 及原父層；新增子層依開窗時父層，避免篩選後存錯位置 | 既有跨品質移轉交易／來源快照不改 |
| 模具 | 重畫與目錄切換保留多個表單原始輸入與 picker；照片及 IQC references 保留非衝突修改 | 原 owner/object/epoch/delivery/generation/version fencing 保留 |
| 例行 FQC | 實際篩選、核准版返回及文件選擇保留每文件 RAM；照片／evidence references 合併獨立新增／刪除 | Save 只保存選定文件；samples 仍是一個不可拆原子值 |
| 製程畫布 | 確認工段／類別／線別切換誤觸真正離頁清除；另有獨立修正候選 `80745895c952ea7415cedfac9de27235116a4100`，最終 handler 10/10 PASS | **尚未混入本分支**；需 parent 與另一畫布對話協調三個 runtime 檔與 app.js handler 契約，不能把候選當已整合 |
| 問題回報 | 帳號私人 IndexedDB 草稿，未變更 | 不併入共用業務 mine/theirs |

## 共同保護與驗證

只有明確 Save 比較及寫入；IQC 照片端點為既有分離的 immutable PUT，workflow 快照仍一次 CAS，並非照片與快照同一儲存交易；一次全組 mine/theirs/cancel，選後換版先重比。保留原 owner、權限、pending、世代、expectedRevision、CAS、原收據及 UNKNOWN 不自動重送。正常讀取／同頁篩選不代表已存。非空的晚到本機修改必須以真正 accepted sent snapshot 保留原比較基準，不能拿較晚的 readback 當作已同意覆寫；照片依穩定 ID 退休 sent prefix。真模組離頁只丟未送 RAM，不回滾已共享內容。

第一輪整合受影響回歸 465/465 PASS；此為修正後續 ID 邊界與 PROCESS popup／品質追加整合前的批次，不冒充最終全部程式驗證。既有離頁 binding fixture 另以現行 production AST declarations 修復，原 154 個案例／斷言逐 byte 保留並新增 12 個缺依賴與非空取消負控；獨立 direct 166/166、既有 local-safety 完整離頁 gate 463/463 PASS，原 89／100 FAIL 日誌保留。所有證據使用實際 production closure／controller／transport／簽章 handler 配合合成 DOM、隔離 SQLite／Map-R2；原生 Chromium 驗證受 OS socket／ptrace 限制而失敗，未換路繞過，合成證據不能代替桌機／iPhone／真實 IME／實站驗收。

照片以每個穩定 ID 的整筆 metadata 作原子單位；同一照片的多個欄位不拆。重排、legacy 缺 ID／混合 ID、重複 ID 維持保守整清單比較或重新核對。FQC 設備關聯組、頻率規則組，以及 IQC 有序 supplierIds 清單仍為原子決策單位；IQC rules 僅三方 ID／順序完全相同時逐條比較，不做規則內欄位及結構合併。這些界線不標成全欄位完整合併。

## 最終共同來源驗證

Runtime 固定於 `eb8adc1b1f9ba5ff9bd63a1d9d59fff24f58062f`；後續僅來源帳本、測試緩衝與本文。來源證明使用真 Git commit/tree/blob，44 個 current runtime files、293 個具名精確 inverse、13 個新增來源不存在證明；原七個 target 均保留，再增加原4a交付與原ce824 runtime。歷史79筆 ref/path witness、舊 helper pins／hash／span／負向控制未放寬。

| 正常 CI／相關檢查 | 最終結果 |
| --- | --- |
| Global decisions and pre-dispatch authority | 839/839 PASS |
| Same-page input retention | 115/115 PASS |
| Draft entry and timer removal | 127/127 PASS |
| Exact source and predecessor proofs | 611/611 PASS |
| 既有 local-safety 離頁完整 gate | 463/463 PASS |
| 標準 lint／TypeScript | PASS |
| 原安全掃描器 | 修改208檔零finding；全庫兩個合成負控制 finding 逐byte與main一致，未改掃描規則 |
| 標準受保護 build／compiled HTTP／bundle consumer | 最終HEAD與結果另由外部交付manifest及日誌綁定，不用較早runtime測試冒充 |

這些測試組有重疊，不相加為總覆蓋。首次來源組因讀取固定2MB舊帳本碰到Node預設輸出緩衝上限，610/611；僅將該真固定Git路徑的輸出緩衝設為有界8MiB後全611通過，完整舊斷言仍保留。首次失敗log與修復後log都保留。

## 其他對話／遠端相依

本次唯讀確認 GitHub main 仍為 `d4ac309fe05c89288af226b52c18161865ccdcb8`。

- [PR #99：新工段流程類型](https://github.com/franktsai0421/process-os-sites/pull/99)，查詢 head `83dcd5ce1565ace1526ea20771cf3e834ba3dc18`：重疊 `lib/master-stage-link.ts`、CI 及主資料文件。未在本批合併，須保留兩邊來源證明。
- [PR #100：取消背景定時檢查](https://github.com/franktsai0421/process-os-sites/pull/100)，查詢 head `7d0f1267fb173aeeaa2010bc108d2c9db49df981`：重疊 `process-authoring-v3.js`、`shared-draft-client.js`、`process-ipqc.js`、index、來源 helper／測試與 CI。未在本批合併，不能以本批 scoped polling 移除宣稱全站背景檢查已完成。
- [PR #88：IQC 數值提示](https://github.com/franktsai0421/process-os-sites/pull/88)，查詢 head `f0e9ae37731411801fda72c2e8843d30e467d091`：本機既有提示段保留；不以本批覆寫該候選。
- 草稿分拆與版本查看各自對話的最終候選尚未在本批取得，不推定已完成；不擅自改 scope adoption、版本選擇或真實資料。

舊 243-path `create_tree`／品質 tree 結果仍 UNKNOWN；GET 404 不能證明未執行。先前設備 tree 建立曾被自動審查拒絕，當時只有進度查詢授權且公開目的地未確認。本批未重送、未拆分或換路上傳；現在的任務授權不能取代原 UNKNOWN 結果查證。沒有新 remote write、PR、merge、部署、schema、live record 或 connector 操作。
