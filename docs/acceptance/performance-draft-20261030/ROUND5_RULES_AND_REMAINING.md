# Round 5：規則處理、剩餘工作與 dot 整合

本文件接續 `/workspace/process-os-performance` 的 `codex/performance-draft-20261030`，基準 HEAD 為 `ca6647977a8680038444ce2c1ba4e80f2343cd0a`，包含既有未提交修改。本次只讀現行程式／文件並整理交接，沒有另跑測試、修改產品、寫入正式資料或發布。

本輪主報告為 [PROCESS_PLATFORM_ROUND5.md](PROCESS_PLATFORM_ROUND5.md)；最終編譯版本、瀏覽器結果、速度表與交接包連結由主代理彙整。本文件不自行補判 PASS、不推估速度。上輪 [FINAL_CONTRADICTIONS.md](FINAL_CONTRADICTIONS.md) 保留歷史，但其中「三選項尚未接線」「非 set 全未支援」不能直接當成本輪現況；本輪已接入製程 adapter 與有限逆操作，尚不能推定全站完成。

## 規則、矛盾與本輪處理

| 問題 | 現行規則與處理 | 仍須保留的界線 |
| --- | --- | --- |
| 「套用」是否只是本機預覽 | 製程表單未套用的內容在本機；Apply 成功後寫入該模組的共享 working。手動 Save 才建立固定快照。同步畫布亦不等於 Save。 | 不把已 Apply 說成已手動儲存，也不把未 Save 的內容一律當作只在本機。 |
| Save 是否只儲存目前線別／分頁 | Save 保存該模組整份已套用的 working；製程 scope 是 `process:platform`。搜尋、選取產品或線別不縮小保存範圍。 | 儲存可能包含其他人已同步的修改。其他模組各有 scope，不合併成全站一次 Save。 |
| Submit 是否送出眼前全部最新輸入 | Submit 固定使用最後成功手動 Save 的 savedId／snapshot；送審不默默重存。要送最新輸入，須先 Apply／同步畫布、Save，再明確 Submit。 | 保存後再改的 working 不自動加入案件；審核讀固定案件內容，核准後下游使用 effective version。 |
| 「放棄後回最後 Save」可能撤掉他人修改 | 使用者已確認僅撤銷本次可證明屬於自己的未儲存修改。本輪 ledger 記錄本人 command 與已確認 receipt，planner 用前值、generation、savedId、連續 revision 及最後 revision 檢查逆操作，仍走正常 Apply。 | 不做整份 restore、不刪 saved／pending／effective／history。離開後可能仍看到他人或進頁前的共享未 Save 內容，這不是放棄失敗。 |
| 其他人改回相同值，能否視為本人修改仍可放棄 | 目前欄位值相同不足以排除 ABA。帳本不完整、他人後續／交錯寫入或 revision 鏈有缺口時拒絕撤銷，保留輸入並說明。 | 即使其他人只改無關欄位，目前也保守拒絕自動逆轉。這是可證明範圍的限制，不能宣稱已有完整伺服器逐欄位歷史。 |
| reload 後是否可繼續自動放棄 | 完整本人操作帳本留在記憶體；sessionStorage 只持久保存未確認 inverse 的識別 marker。`recoverDiscard` 只查原 operation receipt，再讀權威 state，不重送 inverse；查不到收據也不等於未寫入。 | reload 後缺 before／expected 全內容，收據確認仍須核對目前內容。這個恢復步驟是唯讀，不表示已還原完整帳本，也不表示整頁永久唯讀；是否可另行 Save 仍依當前權限與已知狀態。marker 無法寫入／損壞時停止危險動作，不猜測成功。 |
| 保存並離頁是否直接呼叫既有 Save | 製程 adapter 先凍結輸入，等待既有寫入，套用最新表單、處理未同步畫布，確認 Save receipt／權威 working 後再準備目標頁。Save 或目標載入失敗仍保留來源。 | 原手動 Save 規則不因此改為自動收走所有未套用表單。外層 Save 失敗後，已成功 Apply 仍是共享內容，不應用整份回滾撤銷。 |
| 只具 Save 權限能否連帶 Apply | edit、Save、Submit、Withdraw、審核及 restore 維持各自授權。Save-only 可保存已有共同 working，不代表可 Apply 未授權的新輸入。逆操作若要移除本人新建資料，仍需相應刪除能力。 | 不自動補權，不把所有 Save 改成必須有 edit；前端按鈕不取代後端權限、pending、CAS 或引用檢查。 |
| 無差異能否再送審 | 依最新 SHARED_DRAFT：撤回／發回後符合相同 Save、最後案件及有效基準條件可再送；核准後必須有實質差異。IPQC_POLICY 的舊「相同也可送」已改指向最新規則。 | 本輪只消除舊文件矛盾，不放寬後端。本人 Withdraw 與審核者 Return 各用原權限／原因／紀錄；自審仍須原有明確確認。 |
| IPQC-AB 分配與 C 查詢是否同一功能 | AB 選項取目前已核准且有效的品質版本，依線別、類別、工段、產品條件篩選，維持同範圍唯一占用。C 編輯頁維持查詢開關、唯讀標準及舊分配保留。 | 不為測試新增 C 分配入口；失效舊關聯不自動刪除，新關聯仍驗證。AB 前端延後建立收折明細 DOM，後端／當次完整資料檢查不省略；明細與圖片完成須另量。 |
| 500 ms 是否高於一致性與安全規則 | 500 ms 是使用者的優化目標；依資料確實完成、畫面可繼續操作計時，另列圖片完成。冷 Worker、冷瀏覽器、首次頁面、再次進頁、reload 各有不同成本。 | 不靠過早 success／ready、舊版本、隱藏 loading、省略來源或持久化核對達標。局部 handler、HTTP 與瀏覽器時間分開；合成資料不代表正式資料速度。 |

規則依據：[SHARED_DRAFT](../../specs/current/SHARED_DRAFT.md)、[WHOLE_MODULE_DRAFT](../../specs/current/WHOLE_MODULE_DRAFT.md)、[PROCESS_WORKFLOW](../../specs/current/PROCESS_WORKFLOW.md)、[PROCESS_EDITOR](../../specs/current/PROCESS_EDITOR.md)、[IPQC_POLICY](../../specs/current/IPQC_POLICY.md)。實作邊界見 [owned ledger](../../../public/process/owned-draft-ledger.mjs)、[inverse planner](../../../public/process/owned-draft-revert.mjs)、[製程 adapter](../../../public/process/process-authoring-v3.js) 與 [導航接線](../../../public/process/delivery-navigation.js)。

## 本輪沒有宣稱完成的範圍

頁內切換需區分範圍：製程線別／類別切換已走離頁協調；同一方塊視窗的基本資料、產品、BOM、共用作業、IPQC等分頁仍共用同一份未套用表單，切換會保留輸入，不另彈離頁決策。這不等於逐個彈窗分頁都已加三選項。若要求每次表單分頁切換都強制保存／放棄，會改變現行「一次Apply處理整份表單」的操作邊界；建議維持同表單保留輸入，在離開編輯範圍時決策。

目前共用導航只在製程編輯台選取 `ProcessAuthoringV3.navigation.departure`。AB／C／流程主資料與線別工段、BOM、FQC、IQC、IPQC-AB、IPQC-C、模具設備、檢具與測試設備、例行檢查等其他既有文稿，沒有因共用 coordinator 或製程案例通過就完成三選項 adapter／逐模組審核驗收。其原有 guard 保留；完整狀態須依該模組的實際測試列為通過／失敗／未測。

製程內也不能把「有實作」直接寫成全流程瀏覽器 PASS：方塊各分頁、畫布、本機取消、已 Apply 未 Save、Save-only、多人衝突、恢復 marker、權限變更、快速替換目標、Back／Forward 及原生 dialog 時序，需對照最終 build 的個別結果。框架頁只驗入口／切換，不補業務功能。使用者權限、問題回報與建置中例行報告資料庫不因草稿表而新增不存在的 Submit／Approve。

瀏覽器重新整理、關閉分頁、離開本站使用原生 beforeunload 能力，不能保證呈現站內同一個三選項視窗或在頁面關閉時完成非同步儲存。完整本人帳本與未套用表單的跨 reload 持久保存也未在本輪新增保證。

## 剩餘工作與優先順序

| 優先 | 建議下一步 | 預期效益與影響範圍 | 完成前必須確認 |
| --- | --- | --- | --- |
| P0 | 先收斂最終製程 build 的離頁與未知寫入驗收；任何失敗保留原始證據，再修正具體原因 | 避免輸入遺失、重複 Save／inverse、錯頁及 owner 晚到。影響製程 adapter、canvas、ledger 和共用導航 | Save／Apply／目標 GET 各自失敗、未知 inverse＋reload＋404、marker 儲存不可用、Stay、Back／Forward、連點、送審鎖定、撤權與不同帳號。結果由主報告補連結，不以單元取代原生。 |
| P0 | 按模組接入其本機表單／照片與可信本人操作來源，再逐模組驗收三選項 | 完成原始全站需求。共用導航只統一決策，不代替各模組套用、儲存、草稿範圍或恢復機制 | AB／C／PROCESS／線別工段、BOM 與各品質文稿獨立核對；以隔離資料走修改→Save→Submit→Withdraw／Return→再送→Approve。 |
| P1 | 對本輪仍超標或尾端回退的操作，按最新同條件表定位；先分離前端、請求、伺服器 CPU、儲存與圖片 | 避免針對舊單次數字改錯位置；保留新減量工作的實際收益與代價 | 每版原則至少五次，資料／帳號／權限／快取／網路／build 對齊；保留最慢樣本與相同程式對照。IPQC handler 本輪並非兩線全面加速，詳 [IPQC 報告](ROUND5_IPQC.md)。 |
| P1 | 補大資料清單／畫布及明細展開、搜尋、篩選與圖片獨立完成點 | 判斷延後 DOM、局部更新與按需讀取是否在實際操作有收益 | 不用少量 fixture 推論所有產品。明細全文、照片 decode、引用和勾選可操作須有明確完成條件；桌面與手機模擬分列，實體手機另列未測。 |
| P1 | 如需更廣泛的「只撤銷本人」，另設計可驗證的欄位／操作歷史與刪除還原策略 | 可減少目前碰到無關外部寫入就保守拒絕的情況 | 不放寬現有 receipt 鏈檢查。原 remove、還原、無法證明的結構 membership 仍不逆轉；本人 insert／order 只有通過目前 guard／權限條件才支援。若要持久完整帳本，需另評估敏感內容、容量、世代、保留期限與伺服器可驗證性。 |
| P1 | 補齊既有共用錯誤顯示 mapping 的中／越文說明 | 主代理讀取實際 409 原生截圖與程式，確認 `sharedDraftErrorMessage` 只映射部分 code，`DRAFT_REVISION_CHANGED_RECONFIRM` 仍可能原碼顯示。新 unknown／本人撤銷已有雙語說明，但不能宣稱所有後端錯誤皆白話 | 擴充既有 display mapping，保留 raw code、HTTP status、receipt 與已知／未知結果分類；不改權限或寫入結果。逐類核對可理解原因、保留輸入與恢復動作，最終證據由主報告連結。 |
| P2 | 長時間切換、慢網路、掉線與重登入；監測 listener／timer／request／heap 與中越文恢復提示 | 找出短功能批次無法證明的累積問題與故障操作障礙 | 短期無 pageerror 或少量計數穩定不等於無記憶體洩漏；不可用重送未知寫入作一般重試。 |

本表效益均為待驗證方向，不提供未量測毫秒。沒有新增設定、依賴、schema 或資料遷移需求；若後續另做持久化完整帳本或伺服器歷史，不能沿用「無遷移」結論。

## 與既有任務重疊及 dot 整合順序

以下依目前 dirty 清單與儲存庫交接文件列出共用風險；沒有讀取其他不可見工作機的未提交內容，也不宣稱已替 dot 完成跨分支整合。

| 任務／共同範圍 | 需語意合併的檔案／介面 | 避免的覆蓋 |
| --- | --- | --- |
| AB／C、線別與工段、流程資料 | `lib/master-workflow.ts`、`public/process/master-data.js`、`master-admin-ui.js`、`master-shared-client.js`、`master-review.js`、`app/api/master/references/route.ts` | 既有來源、scope、照片、引用、line-admin、審核與歷史規則；不得用較早整檔覆蓋。 |
| 製程編輯／流程資料／照片 | `lib/process-authoring-workflow.ts`、`public/process/process-authoring-v3.js`、`process-editor.js`、`canvas-local.js`、`editor-line-selection.js` | 已有 Begin 權限恢復、固定 Save／Submit、畫布 journal、圖片欄位及 stale owner 防護。 |
| IPQC-AB／C 來源與分配 | `lib/process-ipqc.ts`、`app/api/process-ipqc/route.ts`、`public/process/process-ipqc.js`；authoring context 的 `preparedMaster` 呼叫 | optional API 與 caller 要同批整合；保留 C 唯讀與舊關聯、AB 唯一占用、來源完整性與當次版本。 |
| 使用者權限、回報小幫手與其他入口 | `public/process/index.html`、`bootstrap.js`、`app.js`、`delivery-navigation.js`、`navigation-lifecycle.mjs` | 原有效權限／讀取所有權、helper 入口與版本標記、共用導航；不新增第二套帳號或權限快取。 |
| 本輪本人撤銷與既有共用草稿 client | 新增 `owned-draft-ledger.mjs`、既有候選 `owned-draft-revert.mjs`，加上 authoring／canvas 呼叫端與 receipt recovery 介面 | 不只帶 UI 按鈕，漏掉帳本、marker、inverse 完整確認或必要 script 資源；既有 shared-draft client 功能保持。 |
| 前幾輪資產與按需 Excel | `vite.config.ts`、`lib/process-scripts-build.mjs`、`lib/process-styles-build.mjs`、`index.html`、`spreadsheet-loader.js`、BOM／FQC Excel 呼叫端 | 不把編譯產物當來源，不遺漏新資產；保留已整合的 loader／呼叫等待契約。 |

建議 dot 依序處理：

1. 核對主代理最後交接 manifest 的 base、工作樹來源 hash、完整 patch／新增檔清單與備份。先保全 dot 自己未提交工作；若已套舊交接包，按差異整合，不能把本次累積 patch 盲目再套一次。
2. 保留目前基礎已整合的 AB／C、線別工段、使用者權限、小幫手、流程及照片成果，先解決共用檔的真正語意衝突；其他工作機的新內容由 dot 額外核對。
3. 整合後端的最小計算重用：master／references 前幾輪改動，以及本輪 `process-ipqc` optional prepared model API、route 和 authoring context caller。維持原資料格式、讀取鍵、完整性與寫入 CAS。
4. 將 ledger／planner、canvas、editor hooks、authoring adapter、導航 coordinator／routing 當作同一組前端相依整合，再核對 index、動態 import 版本與 build helpers。以完整版本重建，不能只發布局部 script 或混用不同輪 dist。
5. 合入針對性測試及規則／交接文件；在正常 standalone checkout 依原安裝流程執行適用 lint、型別檢查、build、回歸和同版本隔離瀏覽器驗收。本工作樹曾遇 linked checkout 的 postinstall 防護，不能關掉防護或宣稱該次 npm ci 已完整通過。
6. 對照最終報告補齊各項通過／失敗／未測／不適用及速度表，再由使用者查看結果，交 dot 依授權上傳 GitHub、建立 PR 與整合。發布既有站台另依使用者授權及原程序，不把測試通過視為發布授權。

獨立審查來源：[ROUND5_REVIEW.md](ROUND5_REVIEW.md)、[ROUND5_INDEPENDENT_REVIEW.md](ROUND5_INDEPENDENT_REVIEW.md)。審查中已修或待驗的發現應以最終主報告逐項收斂，不能只引用較早文件一句「已修復」代替最終 build 證據。
