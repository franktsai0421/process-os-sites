# Round 5 限定 profiling：瀏覽器工作、等待與 C 清單 DOM

這是兩個診斷 smoke，各版本一次，資料為隔離合成 IPQC-AB/C 各 500 項、A 畫布 15 方塊、C 畫布 1 方塊。兩版 scenario 均 PASS；候選仍為 `bf47a1aabc31a1ceb6ec541adb824e619e8d6cf25f01b9c687f90cecfe4d2589`，沒有更動產品。Trace 開啟採樣與堆疊會影響速度，且只暖 GET /login dispatch；**不得把本頁數字併入正式五對量測或當成改善幅度**。

證據為 `.sites-runtime/process-platform-round5/profile-500/profile-summary.json`。摘要只保留 event／function／去除 query 的 source URL／時間／資源統計；完整 `baseline.trace.json`、`candidate.trace.json` 約 50 MB／版，只留本地 ignored，**不放 dot 交接包**。它們不是經逐欄位脫敏的上傳材料。

## 可確認的工作成本

下表限實際出現 `/process/` 程式來源的 renderer main thread，已把 Chrome 內部 renderer 分開。數字是整段 smoke 的 inclusive wall span；不同分類可能互相包含，不能相加成 CPU 或單次操作時間。

| 分類 | Before 整段合計／單次最大 ms | Candidate 整段合計／單次最大 ms |
| --- | ---: | ---: |
| ParseHTML | 790.9／150.5 | 548.9／85.8 |
| EvaluateScript | 451.4／191.3 | 1080.5／724.4 |
| FunctionCall | 946.6／84.0 | 772.5／74.2 |
| Layout | 1262.4／285.3 | 1376.8／232.2 |
| RecalcStyle／UpdateLayoutTree | 654.4／79.3 | 667.9／88.7 |

候選最大 RunTask 的 wall duration 為 **725.6 ms**，Chrome 提供的 thread duration 為 **308.4 ms**。它包含 shell bundle 的 EvaluateScript（724.4 ms），其中一筆 177.0 ms Layout 的堆疊指向 `public/process/app.js:2370` 的 `canvas.clientWidth` 讀取。這支持「初始 editor bind／幾何讀取有同步 layout 成本」，但不足以把整個 725.6 ms 歸因成 JavaScript 計算，更不能據此解釋先前某次 1380 ms 的單項 E2E。

另有 405.3 ms RunTask（thread duration 403.2 ms），含 Layout 232.2 ms 與 UpdateLayoutTree 88.7 ms；該段沒有足夠的應用函式來源，保留為未知呼叫來源，不猜成特定 IPQC 操作。主程式 `render`、editor `bind`、authoring `panel` 與 `loadChoices`／`mountCQuery` 均出現在 trace 或 V8 採樣。V8 chunks 由 `v8:ProfEvntProc` 送出，依起始 Profile 的 process/profile ID 對回 renderer main，而非錯把 chunk thread 當執行緒。部分 sample delta 缺失／無效已計數；統計採樣不能當精確、獨占的函式 CPU。

Playwright `waitForFunction` 在整段分別有 30 次呼叫，最大 elapsed 為 Before 1337.2 ms、Candidate 1620.6 ms。這包含網站 readiness、輪詢、protocol 及排程等待；不能全部稱為工具 overhead。既有 scenario 的單項起訖保留在其私有 closure，本 wrapper 沒有可靠對齊每一操作的 trace 窗口，因此僅交付整段彙總，不使用「E2E − API = 前端 CPU」的算法。

## 一次候選 C 清單只讀快照

獨立 C probe 只登入、選 C、開唯讀方塊 IPQC 分頁，沒有 Begin／Apply／Save。實測結果：

| 項目 | 觀測 |
| --- | ---: |
| C 標準文章 | 500 |
| C panel 元素 | 13,504 |
| 文件總元素 | 13,744 |
| 第一篇內部元素 | 26 |
| 每篇初次高度（此合成資料） | 570.53 px |
| panel 高度 | 291,339.63 px |
| 捲動容器可視高度 | 578 px |
| 與 viewport／overflow 祖先交集可見文章 | 1 |
| img DOM／此快照時已 decode | 1000／0 |
| 第一篇 content-visibility／contain | visible／none |

快照是 render 後即讀取，**沒有等圖片解碼**，不是所有圖片完成時間；可視數採矩形與 overflow clipping 相交，不是 paint／遮擋、可及性或瀏覽器搜尋驗證。此合成資料的相同高度不可推成正式資料的固定高度。

原 probe runner 的最後斷言把唯一 `/api/platform-login` POST 誤列為業務寫入而 FAIL；原檔保存在 `candidate-c-dom-snapshot.initial-assertion-failure.json`。依完整捕獲的 POST 清單離線重新分類後，確定業務寫入為零，DOM／唯讀斷言全部符合；`candidate-c-dom-snapshot.json` 明記 **CAPTURED_AND_OFFLINE_VERIFIED**，沒有把原 runner 宣稱成 exit0，也沒有為此重跑瀏覽器或增加速度樣本。

## 建議與未驗部分

下一個小範圍實驗可只針對 C `.process-ipqc-choice` 比較 `content-visibility:auto` 與合理的 intrinsic size：目前 500 篇全部有 DOM，但只有一篇可見，可能減少畫面外的 style／layout／paint。它不會減少 API、HTML 字串產生或 DOM 節點數，預期收益不能先給百分比。需核對變動文字／圖片高度、捲動定位、瀏覽器搜尋、鍵盤／可及性、列印與支援差異；本輪沒有套用或驗證這個 CSS。

另可在 editor bind 中把幾何讀取與 DOM 寫入分批、只處理實際使用的畫布，並用精確 User Timing 標記再定位。這是下一輪待驗假說；本輪保留既有繪圖／權限／草稿規則與 bf47 版本。

`tests/process-platform-round5-profile.mjs` 可重現兩版一次診斷；`PROFILE_REANALYZE_ONLY=1` 只重新解析既有 trace，不開瀏覽器。`tests/process-platform-round5-c-dom-probe.mjs` 是候選 C 只讀快照。資料量、帳號均為合成；沒有測正式站、實機、OS scheduler 或 Worker/server CPU，不能用這份全場景 profile 宣稱已解釋所有回退或所有操作低於 500 ms。
