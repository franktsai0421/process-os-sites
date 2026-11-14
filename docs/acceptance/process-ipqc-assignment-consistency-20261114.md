# 製程 IPQC 關聯顯示一致性

基準 main `8bfc03679b0e53889c604e110ad843a2fc7b3ae5`（已合併 #117）。獨立 clone、新分支 `fix/process-ipqc-assignment-consistency-20261114`；先唯讀盤點現有關聯工作區與 IPQC operation-speed 分支，未改它們。所有資料均為生成 SQLite :memory:／Map R2、隨機合成登入與 DOM fixture。沒有測試站／正式資料、schema、權限、原 UNKNOWN、合併或部署操作。公開報告不複製現場公司項目或帳號內容。

## 根因及證據界線

1. `choiceMarkup`／`statusOf` 原先只比較 source／scope／itemId，顯示綠色已選取；同一 controller 的 stale 判定與伺服器 `ipqcIssues` 另比較 sourceVersionId 及 C productCodes。同一 ID 和適用產品仍可能保留舊來源版本；整份來源新增其他項目後重新核准，也會產生這種組合。這不是重複建立的證據。A、B、C 共用相同 controller，因此都受影響。
2. stale 清單原先只在載入時建立。checkbox onchange 更新 tuple、badge、overview，沒有更新警示；明確取消再重選現行版本後，原警示仍殘留。A/B 明確比較／採用也有同類更新落差。
3. 隔離 regression 先對未修改 main 重現上述歧義，再驗證修正。真 signed-route 測試透過 create-error／create-item → Save → Submit → 另一角色 Approve 產生新核准版本，確認舊連結保存／重讀不自動升版，明確改選才寫入新 tuple。

現場回報只證明 item ID 相同及現行產品相符，沒有提供完整原／現行 sourceVersionId、原 productCodes、同一瞬間 choices 和重選事件序列。本輪沒有讀寫現場。因此不能把現場那一筆唯一歸因為來源換版，亦不能宣稱已在 v49 驗收；本修正涵蓋已證實的兩種程式失配。

## 修復與風險矩陣

| 變更／風險 | 修復／保護 | 驗證 |
| --- | --- | --- |
| 已選取與舊來源混用 | 狀態分成 selected／retained／occupied／available；原 ID 仍勾選，舊版不當成現行有效分配 | A/B/C × 中越文正常、版本舊、C 同版產品異動 |
| 模糊／殘留警示 | 原因分為版本更新、C 產品不同、現行無符合項目；版本顯示原／現行 ID；明確勾選及 AB 採用即時重算 | 取消／重選、不改資料 remount、採用成功、舊 handler 拒絕 |
| 歷史／真失效遺失 | 不自動升版或移除；失效仍列警示且仍占用；保留後端 advisory 與 validator | 刪除／停用／換產品工段／跨工作區、未變歷史相容 |
| AB/C 規則回退 | AB 不依方塊產品；C 依產品工段；進出站無 IPQC | AB 空／不同／多產品、C 跨產品工段、真 editor graph |
| 重複分配／保存風險 | 後端未改，顯示占用方塊；原 owner 須明確取消並 Save | signed routes peer race、saved release、inline／records 原子保存／reload |
| 並行速度工作 | 未改 ipqc-ab.js、ipqc-c.js、API 或 lib/process-ipqc.ts，保留 lazy details／零背景讀取 | 原歷史 DOM parity，僅精確斷言新增 metric／warning 差異；不宣稱真站速度改善 |
| 來源證據與快取 | 新 exact inverse 接回真 main，原所有 manifests 不變，未知 bytes 仍拒絕；僅 IPQC JS/CSS cache 更新 | LF/CRLF、非 raw／錯路徑／內容漂移負例，原 ancestry gates |

## 驗證紀錄

本機 PASS：鎖定 npm ci；新狀態測試、既有來源採用、signed-route 全生命週期／歷史／權限與 CAS、Canvas 保存、歷史 DOM parity、lint、非增量 TypeScript。完整結果及遠端 head CI 於 PR 收尾核對；不使用前身綠燈代替本候選。

本機 guarded build PASS：exit0 及編譯後 public-auth client check 通過。首次建置以基準 SHA stamp 執行，屬目前 worktree 編譯檢查，非發布產物；固定候選另建置並記錄。

本機 Native Chromium BLOCKED：kernel 在啟動時拒絕 socket()/ptrace；未啟動頁面、未降低 browser 安全設定或修改執行環境。擴充的隔離原生測試已加入既有 exact-head workflow：1440px 中文 A／390px 越南文 C、真 API 來源核准換版、舊連結、明確重選清警示、保存／reload、UNKNOWN 原收據、占用及窄畫面 overflow。原本 Windows 與模組 gates 保留，遠端結果另核實。

NOT_RUN：v49 現場項目重讀／操作、正式環境、實體手機／真人跨電腦／IME、真資料效能、部署。新的 retained 第四計數在桌面四欄、900px 以下兩欄；實際瀏覽器布局須以 CI 原生截圖驗證，synthetic DOM 不代表布局通過。

## 本機收尾證據

- 271 項 signed-route／Canvas／來源採用完整組合 PASS；補上其他舊關聯控制後，受影響的完整狀態＋來源採用組合 119 項 PASS（包含新增一項多關聯回歸）。其餘 API／Canvas 邏輯未改，重用同工作樹適用證據。
- 原 source／ancestry／navigation／receipt／background gates 524 項 PASS，原 manifests 未修改；新增 inverse 涵蓋本輪每個已存在檔案的精確前身。
- assignment-reuse、read-reuse、C-query 24 組與原 DOM parity PASS。僅調整明確新增的 retained metric／warning 預期，全部其餘展開標準、照片、占用與 lazy DOM 一致；未跑真資料速度量測。
- lint／非增量 TypeScript／source boundaries PASS。全 repo regex scan 的兩項命中都是 main 已有的安全負例字串；本輪 changed-files scan 零 findings，無新增業務資料或憑證。
- 精確候選 build／CI 以 PR head 的結果為準；本機 Chromium 啟動限制不冒充 native PASS。

## 第一輪原生載具前置修正

公開 head6769a319 的 exact-head CI 全部來源／domain／lint／TypeScript／建置通過；原生流程已通過 A 的新版本 retained／重選／Save／reload，進入 C 建立下一版來源時收到 PRODUCT_STAGE_INVALID。原載具 `generatedMasterPages()` 刻意在舊 active.C 快取放 PHANTOM，用於驗證 choices 不相信舊快取；新增的品質 create-error 仍依該相容產品檢查，兩種測試目的衝突。

只修正 fixture：新增 `staleCompatibility` 選項，預設仍 true，原 PHANTOM 拒絕與 approved-page 正反例完整保留；原生來源建立流程明確用 false，讓合成 approved-page 與相容產品一致。新增 records-v1 signed-route 前置回歸，逐一建立／保存／送審／核准 AB/C 下一版並核對原 ID、新版本及相同產品。未改產品程式、API 驗證、來源核准、原 schema／資料或 CI deadline。首輪失敗不是現場驗收；最後原生結果以新 PR head 為準。

## Windows Integrated entry 載具相容修正

原 head d486b4ff 的 Windows run43615398702／job132509246621 在第31步 `ipqc-index-semantics.cjs:20` 停下：舊載具以 regex 要求唯一 `const stale=...filter(...)`；現行 controller 已用 referenceReasons＋完整 renderAssignmentWarnings，擷取數量為0，實際候選語意比較與 checkbox guard 尚未執行。Dot 以原命令重現同一 0!==1；不是產品 UI 或資料保存失敗。

只更新測試載具：歷史 fixture 照原來源執行，現行候選直接執行完整警示函式及其真實 helper。測試只觀測原生 map callback 哪些實際產生非空警示，保留原 map 回傳、物件身分與順序；不投影候選回舊版、不另寫 stale predicate。舊 lookup 次數、JSON tuple collision、first-match 及實際 checkbox 的 duplicate／owner／edit／missing／local-only 零請求斷言完整保留。明確驗 AB 產品不影響、C 產品影響、版本／缺來源、LF／CRLF，並以重複 helper／斷接 renderer／錯版／移除C條件／漏缺來源／last-wins 等有效負例證明檢查會拒絕漂移。

同一原命令提早加入既有 exact-head workflow 的 Linux 與 Windows checks（Windows 另執行原 LF/CRLF controls 及實際完整 controller 狀態測試），原 Windows 第31步及後續 gates 不刪除、不跳過、不延時；所有產品程式、ACL、資料、schema、原 manifests 與並行速度工作區均未修改。最新 head／CI 以原草稿 PR #118 為準。
