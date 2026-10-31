# 製程平台、畫布與 IPQC 讀寫優化 — Round 5／2026-10-30

本輪接續原有工作，完成製程開始草稿、套用、畫布同步、保存、送審／再送審與審核相關優化，接通製程編輯台三選項離頁。其他模組的全站三選項與全按鈕驗收仍不能據此宣告完成。未 push、建立 PR、merge、部署或修改既有測試站。

## 環境與版本

| 項目 | 實際值 |
| --- | --- |
| 工作目錄／分支 | `/workspace/process-os-performance`／`codex/performance-draft-20261030` |
| 基準與最新本機 commit | `ca6647977a8680038444ce2c1ba4e80f2343cd0a`；本輪沒有新增 commit，版本包含累積未提交差異 |
| 本輪修改前來源備份 | `/workspace/process-platform-round5-before/source.tar.gz`；SHA256 `3ce249c268ea038e06afd5ae2d56c10d7d1bbc68c018128e4161a7b42310b5ab` |
| 修改前完整 compiled server | `5edd4de1e1b00987f6aa4ee35ee4ada1cb8b19926e8a32befa69af4339b07f5d` |
| 最終候選 compiled server | `c0a5d14599fa5a9f6a2309dac43148201d248f7439a528300da5954d59b02e49` |
| 最終 client index | `9a372683345ec7b6d47cb89822bf7dd6b845930345dc7a8f5247f5c91ad47301` |
| 執行工具 | Node 24.19.0、npm 11.9.0、Chromium 154.0.8037.57、既有鎖定依賴 |
| 資料／網路 | 此雲端工作機內隔離 Miniflare／D1／R2 與合成帳號、合成照片；loopback 無節流，對外請求阻擋 |
| 未使用環境 | 原工作站 `127.0.0.1:3000`、既有 `process-os-test`、正式業務資料，均未量測或修改 |
| 預覽／設定／遷移 | 無新外部預覽；無新增設定、依賴或資料遷移。既有建置仍需 `PROCESS_PROGRAM_COMMIT` |

工作基礎已保全，沒有重設、清理或從 main 重建。上一輪交接包保留；本次包含之前未提交成果與本輪增量，交 dot 語意整合。產品來源 323 檔建置前後 hash 核對一致；完整未提交清單與檔案 hash 見交接 `manifest.json`、`status.txt`、`build-source-manifest.json`。

## 根因、修正及共用影響

| 範圍／主要檔案 | 根因與本輪實作 | 保留的規則 |
| --- | --- | --- |
| `process-authoring-v3.js` | Begin 原本等 advisory inspection 才可操作；改為 ACK 與必要權限完成後開放，待補檢查有獨立狀態。加入製程離頁 adapter 與未確認撤銷恢復入口。 | Submit 必要檢查、最後成功 Save cutoff、未知結果與待審鎖定不省略。 |
| `lib/process-authoring-workflow.ts` | 同請求反覆解析 master、建立 BOM reader 及 canonical 字串；改用當次 context 重用與既有深比較。 | 權限、guard、CAS、BOM／來源完整性、歷史不變。 |
| `process-ipqc` 前後端、route | 重複尋找相同 error、master 重解析；加入請求內索引、optional prepared master。AB 收合的標準詳細 DOM 延到展開。 | 每次仍讀 fresh 核准來源，AB 唯一占用、C 唯讀查詢／舊關聯保留；無跨人／跨版本快取。 |
| `process-editor.js`、`editor-line-selection.js` | Apply 再複製已私有化 workspace；移除一次複製並保留條件回滾。加入最新表單 Apply、owner fence、編輯鎖與選線 guard。 | 內容 Apply 不夾帶本機座標／連線；晚到結果不覆新頁；Save 失敗保留輸入。 |
| `owned-draft-ledger.mjs`、`owned-draft-revert.mjs`、`canvas-local.js` | 之前沒有可接入 UI 的完整本人命令／收據鏈；新帳本串起表單與畫布 client，離頁時先確認既有寫入。 | 只逆轉可證明本人修改；外部交錯／ABA／不明刪除拒絕；原 Save、正式版本與歷史不刪。 |
| `delivery-navigation.js`、`navigation-lifecycle.mjs`、bootstrap／index | 新增單一待決定導航、三選項、保持 lease 到 commit、歷史復位與 busy 完成恢復。修正 native close 時序及 Stay 選取／捲動；按鈕16px、至少44px高。 | 其他模組保留原 guard；瀏覽器 close／reload 只能用原生提示，沒有關頁自動保存保證。 |

最後再修正審核頁：背景內容檢查只更新固定狀態節點，不再因提示變動替換「查看／審核」按鈕；保留全部 GET、權限、fixed snapshot 與 ready 邊界。新增8案及既有相關回歸通過，最新 compiled 版本完成5組完整流程對照。100／500項、三選項20案與profile仍如實標為 `bf47a1aa…`，最後僅審核提示改動後，沒有重跑未改的編輯台路徑。不可說那些數字來自最新compiled版本。

程式工作量證據：authoring 的 master parse 3→1、BOM factory 3→1、查找12→2；IPQC 合成384項／32錯誤的 find384→32、predicate6336→528；AB 49項初始DOM1644→566。這些是特定 fixture 的計算／DOM數，不能當作正式站毫秒改善。照片標準與方法使用160×80、120×60兩張合成PNG，也不能代表實際大型照片速度。

## 瀏覽器驗收與檢查

三選項修補版 `bf47a1aa…` 的原生驗收 **20／20 PASS**：

| 情境 | 結果與完成邊界 |
| --- | --- |
| 最新未套用表單→儲存並離開 | PASS；1次Apply＋1次Save，後端成功才到原選定頁，回來讀到最新內容。 |
| 未套用表單→放棄並離開 | PASS；零寫入，最後Save與歷史不變，回來不再出現放棄內容。 |
| 已Apply本人內容→放棄 | PASS；1次正常guarded inverse，保留Save／歷史。 |
| 進頁前他人共享內容／後來他人交錯 | PASS；前者保留，後者拒絕不安全撤銷，不將目前值相同當作無外部修改證據。 |
| 中文桌機／越文390：留下 | PASS；focus、文字[0,4]選取方向、表單與視窗捲動保留，舊導航取消。實際看圖通過，非實體手機。 |
| 畫布保存後切線／放棄後切系統 | PASS；同步與Save順序正確，已放棄本機journal不回寫。 |
| 快速Back／Back／Forward | PASS；單一決策，不累積彈窗／舊目標。 |
| Save 403／409／離線 | PASS；留頁保留輸入，不視為保存成功；403／409為明確故障注入，不能替代實際撤權的後端驗收。 |
| inverse已到後端、回覆遺失，重新整理後查收據 | PASS；原生reload後僅GET，真200收據清對應unknown，仍要求核對；404維持未確認，不重送。 |
| 保存中導航 | PASS；ACK後恢復決策，只送1次Save。 |
| 純唯讀相簿／目標403 | PASS；正常離頁不多開決策；目標失敗保留來源相簿。 |
| 取消原生重新整理提示 | PASS；未套用表單與已Apply未Save內容各驗一案。接受原生離開不保證還原記憶體表單。 |

原始結果及截圖：`.sites-runtime/process-platform-round5/departure-accepted/`。完整製程鏈核對 Begin→AB選項／Apply→畫布移動／Sync→Save／讀回→C查詢→固定快照Submit→本人Withdraw→再編輯Save→Resubmit→另一帳號Return→同Save再送→另一帳號Approve→原頁生效／歷史。每輪有14次唯一後端命令，固定案件內容與舊版本snapshot均核對；兩個帳號皆合成管理帳號，非所有最小權限角色組合驗收。

| 檢查 | 結果 |
| --- | --- |
| 全專案 lint、TypeScript noEmit、build及建置auth檢查 | PASS；最終JS補修後重建與lint通過，TypeScript來源自最後noEmit後未再更動。 |
| editor departure／選線 | 16／5 PASS；含原生close延後模型、新方塊先Apply後Save失敗再試不重複insert。 |
| ledger／真transport reload／canvas departure | 28／4／5 PASS；planner既有26案與canvas未知結果回歸通過。 |
| navigation departure／實際路由 | coordinator7、實際離頁23及既有導航回歸PASS；focus restore有owner／新互動取消。 |
| authoring | 新adapter19、Begin5、readiness27、context17；Save30、Submit60、Begin恢復22等既有回歸通過，詳 [authoring報告](ROUND5_AUTHORING.md)。 |
| IPQC | domain／handler51、DOM8、C查詢23 PASS；prepared模型與錯誤順序／來源／權限測試保留，詳 [IPQC報告](ROUND5_IPQC.md)。 |
| 獨立程式審查 | 已修發現及最終版本覆核見 [獨立審查](ROUND5_INDEPENDENT_REVIEW.md)、[編輯器審查](ROUND5_REVIEW.md)。 |
| 差異格式 | `git -c core.whitespace=cr-at-eol diff --check` PASS；保留既有CRLF，未整檔正規化。 |

失敗紀錄保留：原生close、Stay選取、按鈕可讀性是本輪抓出並修正的產品問題；語系`zh-Hant`、舊版應標superseded、手機抽屜offscreen、遺失POST回覆後仍能立即查到收據，屬測試假設錯誤。兩支既有效能計數斷言隨實際工作量更新，沒有放寬DTO／權限／I/O斷言。歷史route比較另有34組完全等價＋3組既有無關tooling損壞503→200差異，保留`UNRELATED_FAULT_POLICY_ACCEPTANCE_HOLD`，非本輪新增且非已獲業務確認。

## 規則矛盾與仍需改進

詳 [規則與剩餘工作](ROUND5_RULES_AND_REMAINING.md)。主要界線：

- Apply／同步畫布寫共享working；Save建立整平台快照；Submit只送最後成功Save。保存後再Apply的內容不會自動進原案件。
- 放棄只撤銷本分頁可證明的本人修改，因此可能保留進頁前或他人的未Save共享內容；不能承諾整份畫面退到最後Save。
- 帳本缺失、原始刪除、外部交錯／ABA仍保守拒絕；重新整理後僅保留未確認inverse識別，沒有完整帳本。持續404或marker損壞不自行解鎖或重送。
- 同一方塊視窗各編輯分頁保留同一份輸入，不逐分頁彈出離頁決策；線別／類別才按離頁範圍協調。這個邊界與原始「所有頁內分頁皆提示」的字面要求有差異，理由與建議見規則表。
- 三選項目前限製程編輯台；其他主資料／品質／BOM／例行模組仍需各自接入和逐模組完整驗收，原始全站任務不能標全部完成。
- 部分既有後端錯誤如`DRAFT_REVISION_CHANGED_RECONFIRM`仍可能顯示原碼，應補共用中越文對照；不更動raw code／status／receipt分類。
- 真實站／正式資料、大型實際照片、實體iPhone／Safari、長時數heap／listener壓測、真實撤權／登入失效及所有最小權限角色組合，本輪未測。故障注入與單元測試不能替代這些項目。
- 無關tooling故障是否阻擋製程內容檢查，存在前述歷史政策差異；本輪沒有改此route，仍待負責人確認。


## 前後速度結果

[完整速度表](ROUND5_SPEED.md) 包含 67 個操作＋資料量組合、每版每項5次，中位／最慢、改善幅度、圖片與API往返分表。前中位≤500共50項，後共55項；後五次均≤500共40項。40項中位變快；其餘相等或回退，不宣稱全面加速。不同資料量不互相比快慢，各表精確記錄前後build。

本輪「前」是開始本輪時已含前幾輪修補的完整程式，並非最初使用者貼出的流程資料表。製程編輯台與「資料後台→流程資料」也不能混為同一模組。

### 修改前最慢與根因界線


少量完整流程的前5名（只在相同資料條件內排序）：

| 操作 | 前中位／最慢 | 後中位／最慢 |
| --- | ---: | ---: |
| 登入送出→製程畫布可操作 | 1082.6／3211.8 | 1165.0／1599.4 |
| 開啟送審案件明細 | 883.5／1065.5 | 431.7／881.9 |
| 審核者開啟退回案件明細 | 871.0／1010.4 | 875.4／4203.4 |
| 版本平台入口＋切製程分區（兩次點擊） | 706.5／896.5 | 712.2／779.1 |
| 重新整理→讀回已存草稿 | 663.6／836.9 | 752.5／815.1 |

100項／10方塊的前5名（只在相同資料條件內排序）：

| 操作 | 前中位／最慢 | 後中位／最慢 |
| --- | ---: | ---: |
| 登入送出→製程畫布可操作 | 1642.3／1797.1 | 1617.0／1726.1 |
| 重新整理→讀回已存草稿 | 1068.5／2822.5 | 1435.3／2487.5 |
| 套用方塊IPQC修改 | 481.4／505.8 | 447.5／1051.0 |
| 儲存草稿 | 430.2／463.4 | 376.0／823.0 |
| 套用方塊名稱修改 | 412.0／477.5 | 480.6／490.9 |

500項／15方塊的前5名（只在相同資料條件內排序）：

| 操作 | 前中位／最慢 | 後中位／最慢 |
| --- | ---: | ---: |
| 登入送出→製程畫布可操作 | 1462.0／2531.5 | 1326.3／2436.3 |
| 重新整理→讀回已存草稿 | 1415.8／4073.8 | 1057.8／1767.7 |
| 儲存草稿 | 907.8／1705.0 | 478.1／756.6 |
| 套用方塊IPQC修改 | 850.9／1047.6 | 607.9／1613.7 |
| IPQC-C重新讀取標準 | 778.3／1145.5 | 646.7／1327.6 |

### 仍未達500ms的中位數

| 條件 | 操作 | 後中位／最慢 |
| --- | --- | ---: |
| paired-review-readback-final | 登入送出→製程畫布可操作 | 1165.0／1599.4 |
| paired-review-readback-final | 重新整理→讀回已存草稿 | 752.5／815.1 |
| paired-review-readback-final | 版本平台入口＋切製程分區（兩次點擊） | 712.2／779.1 |
| paired-review-readback-final | 審核者開啟退回案件明細 | 875.4／4203.4 |
| paired-review-readback-final | 重新整理→讀回核准內容 | 752.5／888.4 |
| paired-100 | 登入送出→製程畫布可操作 | 1617.0／1726.1 |
| paired-100 | 重新整理→讀回已存草稿 | 1435.3／2487.5 |
| paired-500-accepted | 登入送出→製程畫布可操作 | 1326.3／2436.3 |
| paired-500-accepted | 套用方塊IPQC修改 | 607.9／1613.7 |
| paired-500-accepted | 重新整理→讀回已存草稿 | 1057.8／1767.7 |
| paired-500-accepted | IPQC-C首次讀取標準 | 768.2／1598.1 |
| paired-500-accepted | IPQC-C重新讀取標準 | 646.7／1327.6 |

中位達標而最慢超標者也在完整速度表明列，不四捨五入成全部達標。最新小資料第4輪候選的退回案件明細最慢4203.4ms：同段fresh state API1760.6ms、案件API658.0ms，另有背景advisory1856.1ms及後續更新請求。這些可能重疊，不能直接相加，也不能只歸因為畫面重繪。最後固定提示節點修補沒有解決這個尾端等待，需另分解伺服器／儲存／傳輸與排程。5次樣本不足以保證實際站的尾端延遲；沒有剔除慢樣本。

### 已定位的成本及下一步

1. **C大量清單優先處理畫面建立。** 500項首次API中位57.9→45.0ms，完整顯示682.4→768.2ms；API變快不等於畫面變快。唯讀DOM probe記錄panel 13,504元素、1,000個圖片元素，當時overflow裁切可見僅1篇。建議後續做保留鍵盤、搜尋能力與捲動定位的分段／虛擬清單及圖片尺寸策略；需驗長文字與不同照片尺寸，不能只隱藏loading或以估計高度造成跳動。
2. **登入與重新整理仍有共同成本。** 單次profile確定 `app.js` 讀取`canvas.clientWidth`關聯約177ms同步layout；整段有多次DOM parse/layout，不能把每類inclusive時間加成總CPU。應優先減少首屏前同步layout與不需立即顯示的DOM建立，保留必需bootstrap／權限／資料確認。
3. **審核明細不能把4個GET全當重複。** 一個是背景advisory、一個fresh權限/世代狀態、一個history清單、一個固定案件。最後已修提示造成的toolbar重建；若再優化，可評估指定case直接進明細時延後history清單。約40–52ms串行GET只是可省成本估計，未改實作，也不能解釋全部E2E差額。不得刪除fresh權限與固定案件讀取。
4. **寫入改善仍需看尾端。** 500項Save中位907.8→478.1ms，API357.8→200.5ms，與當次context減少重複工作一致；最慢仍756.6ms。IPQC方塊Apply中位850.9→607.9ms，最慢1613.7ms。接下來應分解較大patch／相依檢查及儲存耗時，不省略ACK／CAS／引用驗證，也不把提示先出現當成功。

詳 [profile及DOM證據](ROUND5_PROFILE.md)。profile各版只有1次且有額外instrumentation，只作成本定位，不混入五組速度。最大主執行緒task約725.6ms wall、308.4ms thread，顯示排程等待與CPU不同；E2E減API的差額亦包含自動化click等待、腳本、繪圖等，不能直接標為前端CPU或資料庫時間。純SQL時間本輪未獨立量測。

500項第一批在第5輪baseline完成Apply後，Node端Miniflare D1/R2讀回橋接出現response id assertion；該run持久核對未完成，保持FAIL。完整失敗批保留`paired-500/`，另以新fixture完整重跑5組的`paired-500-accepted/`作表，沒有拼接4組加1組。profile的C probe曾將唯一登入POST錯列business write；保留原FAIL，對已捕獲請求離線確認沒有Apply／Save，標CAPTURED_AND_OFFLINE_VERIFIED而非宣稱runner重跑PASS。

最後小資料首次批次 `paired-review-final/` 亦在保存後的獨立讀回遇到 Miniflare host fetch failed；畫面及API已完成，但未完成的持久核對仍保持FAIL。之後只修測試fixture：限定解碼完整 `processAuthoringControl`，不再無謂解所有模組；沒有省略任何authoring歷史、body SHA或原斷言。17階段新舊JSON完整等價與原生完整鏈證據見[fixture紀錄](ROUND5_READBACK_FIXTURE.md)。最後表使用 `paired-review-readback-final/` 的整批五組，兩版均使用同一新reader。獨立核對在主計時外；不把它減少的時間當成網站加速，也未宣稱已修好Miniflare本身。

## dot 交接與重現

完整交接目錄：`/workspace/dot-handoff-process-platform-round5-20261030/`，壓縮包：`/workspace/dot-handoff-process-platform-round5-20261030.tar.gz`。包含累積`changes.patch`、本輪`round5-iteration.patch`、所有新增／修改檔、修改前完整source備份、來源manifest、測試log、速度JSON與瀏覽器截圖。未包含node_modules、dist、D1/R2資料庫、正式憑證或raw Chrome trace。累積patch從上述HEAD套用；已套前一包的dot不可再盲套累積patch，應核對本輪前置來源hash後用增量或語意合併。

整合順序與重疊檔見[規則與dot整合](ROUND5_RULES_AND_REMAINING.md)。ledger／planner、canvas／editor／authoring、導航及資產載入必須成組合入；prepared master optional API與caller也要同批。其他工作機未提交內容不在本環境，須由dot最後核對AB／C、線別工段、使用者權限、小幫手與流程資料的真正衝突。不要以舊整檔覆蓋最新修改。

重現使用Linux、Node>=22.13、現有lock與Chromium。一般完整checkout依原設定安裝；此linked工作樹先前postinstall防護問題不能寫成乾淨npm ci已通過。測試只啟動非持久Miniflare，fixture只reset自己建立的合成D1/R2。新clone若要跑歷史對照腳本，還需保留其指定Git歷史commit。`before-round5-source.tar.gz`不含Git metadata與依賴。

```sh
npm run lint
npx tsc --noEmit
PROCESS_PROGRAM_COMMIT=<目前真實Git-SHA> npm run build
node tests/authoring-departure.test.mjs
node tests/authoring-review-status.test.mjs
node tests/owned-draft-ledger.test.mjs
node tests/owned-draft-recovery-transport.test.mjs
node tests/process-editor-departure.test.mjs
node tests/delivery-departure.test.mjs
node scripts/test-process-ipqc-c-query.cjs
PROCESS_PROGRAM_COMMIT=<目前真實Git-SHA> PERF_FOLDER=.sites-runtime/round5-recheck node tests/process-platform-round5-departure-browser.mjs
```

前後測速須先在各自隔離來源建出完整before／candidate `dist`，不能混用client／server。再用以下共同runner；每次不同folder，保留warmup但不納入五次：

```sh
PROCESS_PROGRAM_COMMIT=<候選真實Git-SHA> PERF_BASELINE_BUILD=<完整before-dist> PERF_VARIANTS=baseline,candidate PERF_ROUNDS=5 ROUND5_WARMUP=1 ROUND5_IPQC_ITEMS=1 ROUND5_CANVAS_NODES=5 PERF_FOLDER=.sites-runtime/paired-recheck-small node tests/process-platform-round5-paired.mjs
```

100／500項改`ROUND5_IPQC_ITEMS=100/500`、`ROUND5_CANVAS_NODES=10/15`並加`ROUND5_SMOKE=1`，用各自新folder；這兩批只跑編輯台讀寫，不冒稱大量資料也走完整審核鏈。圖片固定160×80／120×60，若要測真實大照片需另建可比fixture。測試時間、圖片、API及獨立持久核對的完成點見runner與各JSON的boundaries。

由使用者查看結果，再交dot統一上傳GitHub、建立PR與整合；此交接與測試通過不代表已發布。
