# 收尾盤點：規則、實作與量測矛盾

> 歷史輪次紀錄（本輪現況已更新）：本文件保留前一輪的量測、發現與當時限制。製程三選項接線、未知逆操作恢復、原生瀏覽器與最新審查請以 [Round 5 獨立整合審查](ROUND5_INDEPENDENT_REVIEW.md) 及 [本輪總報告](PROCESS_PLATFORM_ROUND5.md) 為準；不要沿用此處舊的「尚未接線」狀態。


2026-10-30，獨立盤點 `review_round3`。工作目錄 `/workspace/process-os-performance`，基準／HEAD `ca6647977a8680038444ce2c1ba4e80f2343cd0a`，分支 `codex/performance-draft-20261030`；包含未提交修改。本文件只讀查核產品與既有證據，沒有執行基準測試、操作正式資料或宣告原始任務完成。

範圍以使用者貼出的早期速度表、封存的 `/workspace/dot-handoff-20261030/speed-report.md`（以下稱「舊表」）、同目錄 `speed-supplement-20261030.md`（「補測表」）、[第三輪報告](PERFORMANCE_500MS_ROUND3.md)、[驗證紀錄](ROUND3_CHECKS.md) 及現行程式為準。舊表與補測表屬交接資料，不是目前產品版本的速度保證。最後收尾的新版本、完整 Worker 五對量測與相同程式對照已另記於 [最後一輪報告](FINAL_OPTIMIZATION.md)；下列第三輪盤點保留其歷史範圍，不以第三輪數字冒充最後版本結果。

分類：**規則差異**需要先確定有效規則；**實作缺口**是已確認需求尚未做到；**量測不一致／過時**是不同時間、環境、樣本或完成點被混用；**驗收缺口**表示尚無足夠實際操作證據。以下不把這些全部稱作業務規則矛盾。

## 舊速度表應如何更新

| 舊說法／證據 | 截至第三輪可確認的狀態 | 分類與正確解讀 |
| --- | --- | --- |
| 左側主頁 150、播放台 100、發送 122 ms；舊表第 24–26 行 | 補測表第 39–68 行已有五輪首次／再次點選；例如主頁首次 145／203、再次 130／133 ms | 舊單次數據保留作歷史；不能代表最新版本，也不能與 document navigation／reload 相減。第三輪跑導航功能回歸，未提供全側欄配對 after。 |
| 主頁登入「未獨立量測」；舊表第 88 行 | 第三輪第 35 行已有登入→主頁五次，中位／最慢 714／997 ms | 「一直未測」已過時。舊表 1009／1453 ms 的目的地是流程資料，不是主頁；兩者不能算改善率。 |
| 使用者貼文的主頁直接開頁 1060、reload 691 ms | 第三輪第 36–37 行為直接開頁 421／586、reload 454／627 ms，各五次 | 早期單次與新五次不是同一批對照；封存舊表未記此組完整條件，不能補猜。主頁 reload 第三輪配對反而為 424→454 ms。 |
| 網頁問題回報未測；舊表第 35 行 | 補測表第 61 行有側欄五輪，第三輪第 70–71 行有直接進頁／reload；補測表第 94–104 行有問題明細、備註、狀態、ZIP、小幫手等操作 | 「未曾測」已過時；送出回報仍只量到成功訊息，不能升級成完整持久化驗收。60 筆問題的 1252／1553 ms 不能和另一 fixture 的入口 396／417 ms 計算改善率。 |
| 編輯台產品／工段／畫布未測；舊表第 88 行 | 補測表第 83–86 行已有小型合成案例：產品 89／115、C 空畫布 74／90、A 畫布 65／67、搜尋 26／38 ms | 已有有限量測，但不是大量真實畫布、全部產品／工段或最新版本配對 after。第三輪編輯台直接進頁 585→663 ms 中位回退仍須保留。 |
| 使用者權限按鈕未測 | 補測表第 108–127 行有五輪搜尋、篩選、角色／個人權限保存、停啟用、刪除、密碼操作及讀回 | 測於獨立 Node＋記憶體 SQLite/R2，不是編譯 Worker；不可與 Worker 入口表相減。重設密碼 1067.7／1084.2、自改密碼含新舊登入驗證 1780.2／1848.7 ms 是複合操作，第三輪未重測。 |
| 設備編輯 126／786 ms；references GET 749 ms（舊表第 49、76 行） | 第三輪第 146 行五次：欄位可編輯 152／189、引用 DOM 完成 177／194、完整 GET 75／83 ms | 新版有測，不能把舊最慢 786 或單次 749 與新中位比較成改善率。新的引用 handler 小資料最慢亦由 7.7 增為 12 ms。 |
| 三選項 UI 未接入 | 第三輪第 168 行、README 第 49、55 行仍明列未接入 | 此項仍有效，不能列為已被新測試取代；純 planner／handler／入口 PASS 均無法補算。 |

第三輪第 3 行的正確結論是 **39／51 項入口中位數 ≤500 ms，15／51 項連最慢一次也 ≤500 ms，仍有 12 項中位超標、5 項回退**。這不是全部按鈕、所有草稿流程或全站已達 500 ms。第三輪第 13 行已說明靜態資產傳輸與上一輪不同；只可比較各批自己的 before／after。相同 HEAD 亦不足以辨識多輪未提交程式，必須保留 build hash、來源 manifest、fixture 與完成點。

## 草稿規則與實作缺口

目前有四個不同邊界：表單尚未套用的本機輸入；已 Apply／同步至伺服器的共享 working；成功手動 Save 的固定快照；送審固定案件及核准 effective。**已同步不等於已手動 Save；未手動 Save 也不等於內容只存在瀏覽器。** 依據 [SHARED_DRAFT.md](../../specs/current/SHARED_DRAFT.md) 第 9–15 行及 [shared-draft.ts](../../../lib/shared-draft.ts) 第 202、218、227 行。

| 項目 | 現行證據與判斷 | 應採處理 |
| --- | --- | --- |
| 整份回到 Save 與保留他人工作 | 原始「放棄後回最後保存」若實作為整份 restore，會取消他人的共享修改；使用者已確認僅撤銷本人可證明的修改。SHARED_DRAFT 第 23 行已記錄 | **規則差異已澄清，無須重問。** 放棄後仍可能看到他人的新工作，不能以畫面必須完全等於舊 Save 作驗收。不可刪草稿／歷史。 |
| 「儲存並離頁」包含最新輸入，但既有 Save 不包含未套用表單 | [master-shared-client.js](../../../public/process/master-shared-client.js) 第 62–67 行、[fqc-master.js](../../../public/process/fqc-master.js) 第 39–46 行、[ipqc-c.js](../../../public/process/ipqc-c.js) 第 133–135 行、[routine-equipment.js](../../../public/process/routine-equipment.js) 第 150–151 行都明示只存已同步內容 | **離頁功能實作缺口。** 不能只呼叫既有 Save 就導航；需模組 adapter 擷取／驗證最新表單與照片、完成 Apply、確認 Save 收據後再導航。等待期間鎖定輸入或核對輸入代次，避免漏掉後續輸入。既有手動 Save 規則不因此改成自動收走未套用表單。 |
| Submit 與畫面最新輸入可能不同 | shared-draft.ts 第 228–235 行明確驗證 savedId 並複製 saved.content；[version-draft-ui.js](../../../public/process/version-draft-ui.js) 第 10 行提示「只送出最後成功儲存的內容」。SHARED_DRAFT 第 14 行禁止送審時自動重存 | **符合既有規則，不是漏存 bug。** 應清楚顯示送出哪份 Save；需要送最新輸入時，先完成 Apply→Save，再明確 Submit。不能為測速或便利靜默合併 Save／Submit。 |
| 只具 Save 權限，卻要求離頁順便 Apply | SHARED_DRAFT 第 1–3、15 行及 [WHOLE_MODULE_DRAFT.md](../../specs/current/WHOLE_MODULE_DRAFT.md) 第 7 行允許 Save／Submit 分別授權；Apply 仍要 edit | **權限邊界，不可繞過。** 可以保存已存在的共同 working，不代表可以套用未授權的新輸入。離頁流程需保留輸入並說明缺少哪個動作權限，不得把全部 Save 改成必須有 edit，也不能自動補權。 |
| 三選項尚未提供 | [delivery-navigation.js](../../../public/process/delivery-navigation.js) 第 13–18、122 行只有 canLeave 布林判斷及阻擋 toast；[navigation-forms.js](../../../public/process/navigation-forms.js) 第 1–2 行明示不負責儲存／放棄；planner 在產品中沒有呼叫端 | **P0 實作缺口。** 保存／放棄／留下、單一待導航目標、內部分頁、系統切換、popstate 都需真正接合與逐模組驗收。取消舊導航修復只能證明舊目標不復活。 |
| 已 Apply、未 Save 可能直接切頁 | [master-data.js](../../../public/process/master-data.js) 第 1140 行只看 shared.busy；FQC 第 2280 行、IQC 第 872 行主要看 busy／modal；中央 draftsPending 第 8–10 行只看 queued／unknown／failed 等，不比較 working 與 saved | **判定不一致。** 伺服器 working 未必遺失，但不符合使用者以「尚未成功 Save」為提示邊界的需求。必須區分本機輸入、同步中、已同步未 Save、未知四種狀態。 |
| 無未保存內容仍被擋 | delivery-navigation 第 17 行對任何 `dialog[open]`、IQC lightbox、FQC viewer 一律拒絕；模組亦可能以 modal 存在阻擋 | **既有實作缺口，不是效能新回歸。** 唯讀圖片／案件檢視也可能被告知未存／處理中／未知。需要模組辨別唯讀與髒表單；不能直接移除共用 guard 放行全部對話框。尚未由本盤點實際操作瀏覽器重現。 |
| planner 不能證明全部本人操作 | [owned-draft-revert.mjs](../../../public/process/owned-draft-revert.mjs) 原先只核對本人 receipt 與目前值；本人改成 A、他人 A→B→A 時原檢查仍可通過。本次收尾已加入 `unchanged === false`、連續本人 receipt revision、最後 revision 等於目前 flow revision 的檢查；[測試程式](../../../tests/owned-draft-revert.test.mjs) 增至 26 案 | **已修正這個程式邊界，三選項仍未接線。** 已獨立讀碼，測試執行由修補代理回報，本盤點未重跑。遇任何無法證明的外部／交錯寫入，即使不同欄位，也保守拒絕；仍依賴呼叫端完整可信帳本，不能驗證收據真偽或偵測省略前綴，不等於完整逐欄位歷史。新增／刪除／排序亦未支援。 |
| UNKNOWN 原始字碼與可恢復說明 | [shared-draft-client.js](../../../public/process/shared-draft-client.js) 第 4–29 行只轉譯部分錯誤；`UNKNOWN_OPERATION_CHECK_REQUIRED`／`PREVIOUS_OPERATION_UNKNOWN` 等仍可能走原字碼 fallback，部分模組另有自己的說明／查詢鈕 | **故障 UX 待逐模組核對。** 不可把 UNKNOWN 當已保存，也不能自動重送不確定寫入；保留操作 ID、先查收據／狀態，再按結果提供明確恢復方式。沒有全面瀏覽器故障證據時，不宣稱所有字碼都已轉譯。 |

舊規則文件也需避免誤讀：本輪修正前，WHOLE_MODULE_DRAFT 第 21 行曾有「缺資料與無實質修改為非阻擋待補」及較廣的 ADMIN／一般員工敘述；SHARED_DRAFT 第 13、15 行已明確以 10/25 無實質變更規則及 10/29 個別操作權限取代。這屬**已修正文案的新舊敘述衝突**，不是重新放寬後端的理由。舊原文已另存本輪開始備份；本輪主代理已將該舊段改為最新規則指引，沒有變更後端規則或另作授權。

## 計時完成點仍需分清

| 證據／完成點 | 可以證明 | 不能推定／待補 |
| --- | --- | --- |
| [entry-500ms-performance.mjs](../../../tests/entry-500ms-performance.mjs) 第 18–25 行：destination／generation ready、非空、無 alert、兩個 frame；編輯台卡片／權限搜尋欄另查 | 被量測目的地符合現有 readiness 契約 | 不是每模組每筆資料、搜尋／篩選／審核明細或每個控制項都已可操作。對關鍵頁需補指定資料版本／列數／可操作控制項，不能只讀通用 ready。 |
| 同檔第 30–37 行：每版每輪新 context，之後依順序進 25 個目的地 | 同一輪的受控 document-entry／reload 比較 | 不是每一頁各自重新建立瀏覽器的冷啟；首次站內點選、再次點選、document navigation、reload 必須分欄。 |
| 舊表第 59、65 行：審核退回按鈕出現；圖片預覽載入 | 該控制項／預覽已出現 | 不等於固定案件全文與全部圖片完成，也不等於附件遠端持久化。主要內容與圖片需分開計時。 |
| [task-photo-timing-20261030.mjs](../../../tests/task-photo-timing-20261030.mjs) 第 96–103 行：Save click 後 fixture 全庫讀回，50 ms 輪詢 | 合成資料持久內容符合指定條件 | 包含測試端解碼／讀取／輪詢，不是網站 Save UI、純 HTTP 或 SQL 時間。第三輪的 HTTP 表亦不能反向冒充 click→畫面可再操作時間；各照片場景多為 n=1。 |
| [task-feedback-timing-20261030.mjs](../../../tests/task-feedback-timing-20261030.mjs) 第 17、28 行：欄位清空／成功訊息 | 當時 UI 已更新 | 未另讀回新案件／備註的量測不能標為完整持久化端到端驗收；ZIP 連結可用不等於完整下載可讀。 |
| 真 route＋記憶體 SQLite/R2、Node VM render | 實際程式路徑的局部比較與等價驗證 | 不含 HTTP／瀏覽器 DOM／真實 D1、R2 延遲；不能稱純 SQL。UTF-16 code units 不是傳輸 bytes。 |
| 零 pageerror、四輪 listeners 103→103／intervals 5→5 | 指定批次無未捕捉前端例外、短期兩類計數未增 | 不是長時間 heap／subscription／request／timer 全面無洩漏證明，也不代表所有預期錯誤都友善顯示。 |

不應將「無權限 403」「資料毀損 503」「尚未查明寫入」縮短成成功來達 500 ms。原有權限、收據、快照、CAS、引用／歷史及必要內容檢查均是正確性成本；應只合併已證明相同 ownership／revision 的重複工作。密碼 KDF 強度不能為數字降低。新慢網路或大量資料結果若超標，應留在表內。

## 各草稿範圍的證據與剩餘驗收

以下「未完成」特指本任務要求的每模組完整最新 UI 流程，不否認其他歷史任務可能另有證據。十模組 handler 列表見 handler-cycles.jsonl（本機證據 `docs/acceptance/performance-draft-20261030/handler-cycles.jsonl`，依公開交接規則不提交）；目前瀏覽器範圍見 ROUND3_CHECKS 第 8、9、14、18、21、26 行。

| 範圍 | 本交接已有證據 | 三選項／完整 UI 審核判定 |
| --- | --- | --- |
| AB 主資料 | handler、入口、審核組合回歸 | 三選項未接；每項 UI 全流程未完成 |
| C 主資料 | handler、入口、審核組合回歸 | 同上 |
| 線別與工段 | 實際入口；沿 AB／C scope | 不是額外獨立草稿；兩 scope 的實際線別／工段 UI 流程未完成 |
| PROCESS 流程資料 | 早期五輪按鈕／生命週期、第三輪照片／引用／handler | 舊 UI 證據不能涵蓋最終版全部故障矩陣；三選項未接 |
| 製程編輯平台 | handler、畫布小型案例、編輯套用保存讀回切頁 | 全部產品／工段、大畫布、三選項及完整審核 UI 未完成 |
| FQC | handler、照片保存讀回、入口 | 三選項與完整 UI 審核未完成 |
| IQC | handler、料件／項目照片、員工保存、lost ACK 查收據 | 這些局部 PASS 不代表全模組三選項及審核全流程完成 |
| IPQC-AB | handler、整份案件後端檢查、照片 | 三選項與各群組實際 UI 全流程未完成 |
| IPQC-C | handler、照片、入口 | 三選項與完整 UI 全流程未完成 |
| 模具設備 | handler、照片、入口 | 三選項與完整 UI 全流程未完成 |
| 檢具與測試設備 | handler、設備／分類／子分類／群組照片 | 各編輯型態的三選項及完整 UI 全流程未完成 |
| BOM | 入口、實際 Excel 下載、選檔失敗重試／比對／取消 | 不能由 Excel PASS 推定 BOM 修改→Save→Withdraw／Return→Approve 已逐項完成；三選項未接 |
| 例行檢查 RoutineFQC | 入口、report／disposal 照片案例 | 不在上述十模組 handler 清單；獨立文稿全流程與三選項仍須獨立驗收 |

「例行報告資料庫」與上表例行檢查不同：[dual-system.js](../../../public/process/dual-system.js) 第 57–65 行仍將前者顯示為建置中框架，[access-policy.mjs](../../../public/process/access-policy.mjs) 第 23 行標 `building:true`；照片測試第 470–475 行的 routine-report／disposal 實際進 `quality-inspections&rfDocument=…`。不能把那些照片 PASS 算成資料庫頁業務功能完成。框架頁只有入口適用；使用者權限／問題回報也不能為套用草稿表而新增不存在的 Submit／Approve 功能。

## 優先建議與預期效益

| 優先 | 建議 | 預期效益／影響與風險 | 尚未量測／驗收 |
| --- | --- | --- | --- |
| P0 | 完成可信操作來源與三選項 adapter，再接共用導航；先處理純 set，再依模組處理新增／刪除／排序 | 解決目前不能保存／放棄後離開及未 Save 直接離開的語意不一致；涉及所有草稿、照片與多人協作，風險最高，不能只套一個共用 confirm | 每模組三種選擇、等待中編輯、撤權、衝突、ABA、失敗／未知、popstate、快速目標替換與延遲寫入 |
| P0 | 保持 Submit 固定 savedId；「保存並離頁」獨立完成最新輸入→Apply→Save→導航 | 避免送審畫面與快照誤解、漏存表單、權限暗中擴張；不更改既有 Save／Submit 規則 | 每種表單、照片、Save-only 使用者、Save 中新增輸入與本人／他人同欄修改 |
| P1 | 統一報告以版本＋資料量＋操作＋完成點＋n 為索引，舊表加歷史標示；修補成功訊息／按鈕出現即結束的量測 | 不改網站即能避免錯誤優化順序；要保留原始失敗與尾端值，不能補造改善率 | 所有內部搜尋／篩選／明細／歷史、各寫入到 DOM 可再操作、圖片單獨完成時間 |
| P1 | 依最後一輪結果，優先診斷登入、版本台品質分區、照片預覽、重整及寫入尾端；分開固定暖 Worker、冷 Worker 與冷瀏覽器 | 可定位 CPU／傳輸／UI 等待占比；相同程式對照已證明波動明顯，收益仍須驗證。不能移除必要內容檢查或過早 ready | 最後收尾五對已完成且保留回退；後續需補 click dispatch→請求→ACK→DOM 分段及穩定 Worker 條件 |
| P2 | 對同步／未 Save／未知／唯讀對話框提供不同原因與恢復動作 | 減少誤判與卡頁，避免無效重試；錯誤資訊不能洩漏無權資料，不能把 403 當暫時成功 | 各模組實際拒絕／逾時畫面、雙語、鍵盤焦點與取消保留位置 |
| P2 | 最後才處理未達標的密碼複合操作、真實網路與長時間尾端 | 分清 KDF、登入驗證、HTTP、測試端耗時；保持現有安全強度。不能承諾所有密碼流程 <500 ms | 同條件分段五次、慢網路／斷線、長時間 heap 與請求／計時器、實體手機／正式資料規模 |

上述收益除已引用的歷史量測外均是待驗證方向，未填造毫秒數。既有雲端測試站、原工作站、正式資料與本隔離環境仍須分開報告；本文件不是 push／PR／發布授權，也不是全部原始需求完成證明。
