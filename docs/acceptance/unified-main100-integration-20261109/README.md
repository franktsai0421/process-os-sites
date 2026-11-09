# 統一草稿候選與最新 main #99／#100 整合

唯讀 GitHub API 與唯讀 fetch 均確認 main 為 `9fbba823090f03da8385c8d92f5e59293d19d2f1`，tree `6eee3963fec61a540c144a920fbb3f65949d5e10`。#100 確已合併，且包含 #99 `021f0f388b16ebcdff0f64ff44039d2ea07f4165`。本批在新的隔離分支以真正 merge 納入 main；原 `d1ff4a61b2a8c81a206ec358ab2614393c171e94` 與更早4a來源／交付不覆寫。最終 HEAD/tree/來源及日誌由本批外部manifest綁定。

## 保留的程式行為

相對 d1 的 runtime 變更僅四檔：`lib/master-stage-link.ts`、`shared-draft-client.js`、`effective-version-notice.js`、`index.html`。

- #99 新工段沿已核准 PROCESS catalog 建立流程類型；不回到舊固定預設，不改真正業務資料。
- #100 的 foreground API 保持無 callback/timer/listener 的 inert 相容介面。歷史／還原不恢復4秒權限查詢，改保留每個明確操作前的 fresh permission、request/view sequence、pagehide及 stale response／原HTTP status 保護。正式版提示不註冊 focus／visibility 讀取。
- 保留 d1 的 FQC/IQC 整組比較 hooks、one-use Begin／Save、C comparison version/approved history、BOM及Canvas ownership／ACK／CAS／UNKNOWN 原收據防重送。明確歷史權限讀取可使舊比較失效，不因相容而跳過。
- 四處 shared client 衝突逐段合併；獨立 AST 複審確認原核心 Begin、比較、BeforeRequest/BeforeFetch、post、resolveUnknown、bounded/BOM/Canvas 防護函式原文保留。沒有整檔覆蓋任一候選。
- 新資產 stamp 固定為 `20261109-unified-main1001`。來源證明保留原9個具名target，再加真main100及原d1；choice1、choice2、main100原tag與新current分開精確核對，不放寬hash/span或負向控制。

## 測試相容性

舊測試若仍呼叫已移除 listener／poll producer，不以恢復背景行為處理。當前測試直接執行完整模組初始化及事件，要求零自動請求；history/restore用真明確permission helper與實際UI callback驗證。FQC僅明確的歷史retired-driver案例讀取真固定main100 blob，當前readiness仍跑實際current；兩者不可混稱。

靜態browser timer inventory原44項分類保留；唯一新增為IQC照片PUT的45秒單次abort deadline，finally清除，不是定期比對。第三方內部與任意動態程式不在此靜態guard的全面保證內。

首輪共用傳輸／新工段323項中322通過，唯一失敗為已移除focus listener的舊fixture；改驗完全不註冊該listener後，相關22項通過。既有讀取race20項、合併後global/history165項通過。最終共同回歸、來源證明、lint、types、受保護build與compiled HTTP結果由本批manifest綁定；首輪失敗log保留，不冒充從未失敗。

## 整合回歸修正

首輪共同core為838/839，一個真實回歸來自新讀取預檢回呼：若回呼在request捕獲access之前invalidate C比較狀態後仍返回true，舊實作會以新版本發出Begin比較資格。最小修正先於所有caller callback捕獲request-entry C版本，發證時同時核對該版本及原回應後callback版本；不改#100的assertReadCurrent、HTTP status或明確權限政策。原1–5負控完整保留，再覆蓋目前全部7個回呼位置；正常cold Begin、普通grant讀取與既有拒絕／未知收據規則不放寬。首次失敗log保留；修正後共同core已847/847通過，含原負控與新增完整回呼掃描。

## 最終本機驗證

Runtime 固定於 `0d912ebcd54de6c52968ef9f035e0696c5d35aa2`；後續只更新來源witness與驗證文件。11個真target、45個current runtime來源、353個精確inverse、15個新增來源不存在證明及原79個歷史ref/path保留。原source helper及#100 background contracts的hash/span與負向斷言未放寬。

| 正常CI／相關檢查 | 結果 |
| --- | --- |
| 整組衝突／dispatch authority | 847/847 PASS |
| 同頁輸入保留 | 115/115 PASS |
| 明確權限／無背景查詢／FQC readiness／#99 catalog | 219/219 PASS |
| 入口／明確更新 | 127/127 PASS |
| 精確來源／具名inverse／歷史負控 | 682/682 PASS |
| 既有完整離頁gate | 463/463 PASS |
| 標準lint／TypeScript | PASS |
| poll-wiring／scoped-readpause | PASS；9個完整模組初始化、44明確permission案例、3刪防護負控、4 scheduler負控；scoped46組與equipment28項 |
| source-EOL／read races／panel differential | 78／20／15項 PASS；合成來源/controller ports，不是native版面 |
| 原安全掃描 | main100相對215檔零finding；全庫兩個合成負控制逐byte與main相同，未改scanner |
| 受保護build／compiled HTTP／bundle consumer | 以本批外部manifest綁定最終HEAD及結果，不以較早版本代替 |

測試組有重疊，不能相加為總覆蓋。本批保留最初focus fixture與C Begin整合回歸失敗log及修正後日誌；正常CI沒有skip、continue-on-error或移除必要gate。

## 持續保留的未完成／外部界線

本批只是來源整合，不能據此宣稱測試站更新、原生或實站驗收完成。線別頁仍按目前AB/C舊scope Save；獨立持久草稿切換未啟用。照片重排／不可靠ID、同張照片整筆與不支援結構等保守界線沿[逐頁報告](../draft-filter-followup-20261109/README.md)。IQC照片PUT無durable操作收據，防重送hash僅目前document，沒有跨reload File復原保證。

Canvas view-retention `80745895c952ea7415cedfac9de27235116a4100` 仍是獨立候選，未混入。本次沒有更改app.js／process-editor／editor-line-selection；另一路畫布切頁定義需parent協調。

既往 `create_tree` 結果 UNKNOWN 與拒絕操作均未重送，沒有拆分／換路上傳。本批沒有GitHub remote write、新PR、merge、部署、真資料、SQL migration、權限、connector或Site audience操作。Frank手動合併#100不等於本批已上傳或取得原UNKNOWN未執行證明。
