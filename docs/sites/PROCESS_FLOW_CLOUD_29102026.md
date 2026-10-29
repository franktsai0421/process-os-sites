# 流程資料頁面 CLOUD 29102026：驗收與整合紀錄

## 按鈕確認補驗（2026-10-29）

補驗發現並修復：只有流程查看／審核權限的帳號，在版本平台仍會讀取未授權的 AB、C、BOM 與例行資料，403 被當成整頁載入失敗，導致流程案件按鈕無法使用。只改載入範圍及背景輪詢資格，不放寬 API 或管理介面設定。dot 需留意新增共用重疊檔 `master-data.js`、`master-review.js`、`bom-workspace.js` 與 index cache tag。

新增 `process-master-review-buttons-browser.test.mjs`，10 項均通過：

1. 取消送審：無 POST，saved 與 revision 不變。
2. 取消撤回：同一 pending 案件及鎖定不變。
3. 無審核權的送審者：核准／退回按鈕停用。
4. 比較內容展開／收合、重新整理：保留正確案件。
5. 獨立 reviewer 取消退回：無 POST，固定內容不變。
6. 獨立 reviewer 退回→editor 再編輯、保存及再送審。
7. 獨立 reviewer 取消核准：無 POST。
8. 獨立 reviewer 核准：editor 重新進頁後名稱、照片正確，退回／核准歷史保留。
9. 歷史／待審分頁切換：完成案件不留在待審清單。
10. Frank 自審按取消：保留原 pending、revision 與內容。

本輪測試無 pageerror、無非預期 403。最新流程分支的 39 項主流程亦再跑通；合併照片預覽 `dd72a9c` 的新增 10 項亦通過。新增功能不影響照片標準，原照片專屬測試證據沿用。`test-unified-master-review.mjs` 更新明確查看權限 fixture，原 AB／C／PROCESS／BOM 清單及中文／越文／歷史檢查保留，另增加限流程與拒絕查看時不顯示其他快取案件的檢查；導航 37、型別、lint、建置通過。

速度表更新為最新程式三輪；連續名稱 20→2 的專項仍沿用未受本次載入修正影響的原證據。沒有把與 lint 同時跑的功能驗收耗時用作效能比較。

## 版本、隔離與交付狀態

- 起始及收尾重新核對的 GitHub main：`2cac307f29b8017a2bb6dc5229d47720f2deab33`。
- 流程分支：`codex/process-flow-cloud-29102026`；最新程式來源 `74ab03fdb5b633d56c8281719e540fa754355a10`（審核按鈕補驗修正）。保留先前 `212a730` 與 `10d918b` 的測量證據。
- 照片分支：`codex/photo-standard-cloud-29102026`，來源 `19855a067e89692a63376794160b67f5b1062499`，同基準獨立分支，須分開 Draft PR。
- 獨立合併驗收副本：`codex/preview-process-flow-cloud-29102026`，`dd72a9c6c0cc607333dc0f1e151f570b45e84375`；組成流程 `74ab03f` ＋照片 `19855a0`。頁面及分頁標題明示「流程資料驗收副本 CLOUD 29102026」。native D1/R2、附件及 6 帳號全為合成、停止後清除；未連既有業務資料。
- 既有測試站部署 SHA **未取得**，不能以 main 代替。網路政策阻擋既有站與 GitHub API；無可用新 Sites 建立工具。**公開預覽 URL 與兩張 Draft PR 尚未建立**。沒有 merge、auto-merge、既有站發布或業務資料改寫。
- [機器可讀原始證據](PROCESS_FLOW_CLOUD_29102026_RESULTS.json) 保留 SHA、逐樣本、API 回應、請求清單及測量條件；不含真實帳密或資料。

## 修改與最小共用影響

|檔案|問題與最小修正|影響界線|
|---|---|---|
|`public/process/app.js`|開始修改與有效權限一致；工作流操作局部重畫；新增 UUID、類型；流程照片查看／換圖／移除／明確重試；引用刪除；名稱未送值合併|只改 PROCESS 分支，不重寫共用草稿 kernel|
|`public/process/process-equipment.js`|搜尋綁實際設備面板；標準 composition 事件；設備新增權限；套用防連點、取消保留、上傳忙碌與重試、按需查引用|設備屬 `master:PROCESS` 的工段模板 nested equipment，供製程共用，非新設備資料庫|
|`public/process/process-editor.js`|核准流程依類型提供新增及編輯下拉；選用後保留 templateId；業務名稱不作 UI 翻譯|必要的消費端修正，沒有建立另一套畫布或重寫製程編輯|
|`public/process/process-equipment.css`|局部預覽按鈕、96px 無照片區與欄位排列|本模組 selector，不改全域樣式|
|`lib/process-master-references.ts`、`app/api/master/references/route.ts`|統一辨識目前有效／working／saved／pending／published 引用；前端按需查具體位置|需 templates.view；詳細內容另需 editor.view；資料無法解析即失敗，不能當無引用|
|`lib/master-workflow.ts`|Apply／還原結構、Submit／Approve 在既有 CAS 讀取內重新檢查移除與引用；editorType 白名單|僅 PROCESS 增加必要完整性檢查，不改審核資格、共用 CAS、receipt 或權限管理 UI|
|`public/process/master-data.js`、`master-review.js`、`bom-workspace.js`|版本平台只讀取有效查看權限允許的 AB／C／PROCESS／BOM；背景例行與 BOM 輪詢也遵循查看權限|補修流程專屬 reviewer 被無權模組 403 阻擋；不改管理介面、後端角色或寫入授權|
|`public/process/index.html`|受影響 asset cache tag|共用入口只改本次資產版本，dot 需與照片 PR 按區塊整合|
|`tests/process-master-*`、`scripts/test-process-master-name-guards.cjs`|隔離 native、瀏覽器、競態、名稱併寫與引用回歸|合成 D1/R2；無 schema migration|
|`AI_CONTEXT`、`HANDOFF.md`、本紀錄|行為、資料欄位及證據交接|追加本次紀錄，保留歷史|

照片 PR 與流程 PR 沒有程式依賴、都可由相同 main 檢查；整合時有重疊檔案：`app.js`、`process-equipment.js`、`index.html`、`CHANGELOG.md`、`HANDOFF.md`。照片變更主要為照片說明文字，不能以整檔覆蓋流程修復；dot 應按功能合併。其他照片專屬檔包括 FQC、tooling、i18n、version-workflow，詳見照片分支 `docs/sites/PHOTO_STANDARD_CLOUD_29102026.md`。未混入 dot、權限管理頁或小幫手任務的工作。

## 草稿、引用與速度修正的語意

`master:PROCESS` 是共享草稿。名稱同步／設備「套用設備內容」只改 working；「儲存草稿」固定 saved；送審只送最後成功 saved；核准後才更新製程可選資料。送審者撤回與審核者退回是不同動作，兩者均保留歷史。退回／撤回後可重送原 saved；核准後未改變不能偽造新送審。一般待補欄位沒有新增送審阻擋。

名稱輸入保留第一個已送命令，只合併**尚未送出**的中間值，不新增固定 debounce 等待。每次成功 ACK 才前進 guard 基線，Save 等待最終值；失敗／結果不明立即停止，不自動覆蓋或重試。actor、generation、原值 guard、pending 鎖與 receipt 均保留。實際 Chromium 不會呼叫被當成普通屬性的 `oncompositionend`；名稱與搜尋已改用 `addEventListener`，移交節點時拆除舊 listener，組字完成才同步／篩選。

引用檢查保護當前消費者，包含 authoring active／working／saved／pending、相容 legacy 草稿／有效版本及 published。舊版無 approved 時，依既有最高 superseded fallback 保護。閉合不可變歷史保留其快照，不清除歷史來允許刪除。刪除無引用項目仍只改 working，Submit／Approve 再以 active 對候選重新核對，防止刪除後才新增引用。具體位置最多傳 100 筆且保留總數；有 editor.view 才提供內容／可導向位置。

## 逐步驗收

全部「通過」僅指隔離合成資料。逐步清單中的單次耗時保留原 `212a730` 驗收記錄；最新 `74ab03f` 三輪速度另見下表。額外情境包含多步者不能當單一 API 速度。未測項目另列，不以程式碼推定通過。

|編號|操作者身分|操作|預期畫面|預期資料變化|實際結果|耗時 ms|狀態|
|---|---|---|---|---|---|---|---|
|00|合成 Frank|進頁／切頁／再進頁|資料完成且開始修改可用|只讀|三輪核對 15 組顯示名稱、40 設備及可用按鈕|見速度表|通過|
|01|合成 Frank、admin、editor|開始修改／恢復草稿|名稱、增加及設備操作可用|建立／恢復共享 working|瀏覽器可編輯；API 讀回同一草稿|128|通過|
|02|合成 Frank|新增流程並選 inspection|名稱／方塊類型可編輯|working 新增，核准前 active 不變|雙擊只建一組；選錯類型不顯示|512|通過|
|03|合成 Frank|名稱連續輸入及中越文組字後保存|組字不提前寫入，保存等待最終值|ACK 後推進基線，saved 為完整名稱|真實 CompositionEvent；API 新讀回確認|273|通過|
|04|合成 Frank|照片新增、放大、更換及移除|縮圖與放大可看，完成可再操作|只變更所選 mediaItems|兩張合成透明 PNG 解碼；更換與刪除正確|502|通過|
|05|合成 Frank|取消刪除流程|原項目仍在|不變|取消後項目保留|154|通過|
|06|合成 Frank／reader|刪除有引用流程|列具體方塊 A-01；reader 不洩漏內容|拒絕移除，不自動解除引用|UI 阻擋＋API 409；reader 只見總數|127|通過|
|07|合成 Frank|刪除無引用流程|移除成功|只改 working，舊 active／歷史保留|UI 及 native 讀回驗證|147|通過|
|08|合成 Frank|設備總表、搜尋及編輯|40 筆變 2 筆，正確開啟設備|只讀|原搜尋失效已修復；引用按需載入|24|通過|
|09|合成 Frank|新增設備、各欄位／兩圖、雙擊套用、保存及重開|完整表單、圖片及越文保留|working→saved；不重複建立|新讀回、重整、換圖、移除圖及刪除通過|2807|通過|
|10|合成 Frank|設備有／無引用刪除|有引用拒絕、無引用可刪|引用不被自動清除|native 有引用 409；browser 無引用移除|見 API 證據／09|通過|
|11|合成 Frank／editor|套用→儲存草稿→重新整理|顯示正確保存內容|Apply 只改 working；Save 固定 saved|native 確認未 Save 的內容不進 saved；browser 重整保留|116|通過|
|12a|合成 Frank|設備未套用關閉，取消放棄|保留未套用欄位|不改 working|取消離開後輸入仍在|338|通過|
|12b|一般使用者|所有其他離開方式（關分頁／裝置退出）|沿原離開提醒|不悄悄遺失|本輪未逐一測全部離開方式；既有 guard 未重寫|—|未測|
|13|合成 Frank|上傳中斷後明確重試／連點／命令 replay|錯誤保留輸入；重試可完成|同 operationId 不再增加修訂|browser 中斷恢復；native 重放、stale guard 及程式層 ACK loss 通過|714|通過|
|14|合成 Frank／editor|送審|PROCESS 正確案件並鎖定|pending 取最後 saved|browser 平台案件；native pending Apply 拒絕|184|通過|
|15|送審者|撤回→原 saved 再送審|解鎖後可再送|保留案件歷史|browser 與 API 均可重送|178 / 186|通過|
|16|合成 Frank 明確自審／獨立 reviewer API|版本確認平台退回|待審案件可退回並解鎖|保留固定版本／理由|平台退回成功；API 獨立 reviewer 退回成功|166|通過|
|17|合成 Frank|退回後改名、保存及再送|重新送出修改版本|saved／pending 為新名稱|extended 路徑完成「隔離退回修訂」|再送 220|通過|
|18|合成 Frank 明確自審／獨立 reviewer API|核准→原頁重新讀取|名稱與兩張照片正確|active 更新，案例歷史保留|原頁重新進入檢查名稱／圖片；API active snapshot 相符|167|通過|
|19|合成 Frank|核准新流程→新增方塊→換類型→套用|inspection 可選、manual 不列|新 templateId 正確；既有引用保留|實際 authoring working 新讀回確認|2280|通過|
|20|合成 Frank／other-admin／editor／reader／denied|UI 及直接 API 權限|編輯者可用；reader／denied 拒絕|拒絕不寫入|6 角色正常登入；reader 逐動作 403，editor 核准 403|4144|通過|
|21a|合成 Frank|自審未確認／明確確認|沿既有自審資格與確認|未確認拒絕|API SELF_REVIEW_CONFIRM_REQUIRED；browser 明確確認可核准|見 API／18|通過|
|21b|合成 Frank|自審確認對話框按取消|不核准、不寫入|不變|補驗：同一 pending 案件、revision 與內容保留|未單獨測速|通過|
|22|合成使用者|1365px／390px、中／越文|不水平溢出、可操作|不變更其他模組樣式|自動溢出檢查、截圖檢視及組字 focus／scroll 通過|不作速度比較|通過|
|23|合成並行操作者|查引用後新增引用再刪／送審後新增引用再核准|重新檢查後阻擋|active 與引用保留|native 兩種競態均 409|見 API 證據|通過|
|24|合成 Frank|快速切頁及延後舊回應|仍顯示目前頁資料|不誤寫|攔住舊 bootstrap 回應後釋放，流程頁及搜尋仍可用|242|通過|
|25|既有站台實際帳號|既有資料及真實權限矩陣驗收|與設定一致|只用隔離測試資料|網路政策不允許取得既有站台，未假定與 fixture 相同|—|未測|

完整 extended Chromium：39 個記錄全部通過、無 pageerror。兩分支合併副本再次 39 個記錄通過；並非只驗截圖或成功提示。合成 Frank 的瀏覽器自審沿既有明確確認機制；另以獨立 reviewer 的正常登入直接 API 驗證退回／核准。本輪補驗另以獨立 reviewer 完成瀏覽器退回／核准與送審者再編輯保存，10 項通過；尚未窮舉每個角色每顆按鈕的全部組合。

## 前後速度與條件

原版 `2cac307f29b8017a2bb6dc5229d47720f2deab33`；修後 `74ab03fdb5b633d56c8281719e540fa754355a10`。同機 Chromium、同 native D1/R2、2 工段／30 流程／40 設備／1 引用、loopback 無節流；每版 3 輪，各輪新 browser/context。Playwright route 會停用 HTTP cache；「再次進頁」是同 context 重新整理，每輪 3 次共 9 次，非 warm HTTP-cache 成績。OS cache 未清除。正常測速沒有同時跑 build/lint。首次進頁包含登入，完成點核對完整 15 組去重顯示名稱、40 設備列、可用開始按鈕及兩個畫面 frame；套用／保存依工作流 ACK、重新讀回與可操作狀態核對。

下表為 **中位 / 最慢，毫秒**，不是統計顯著性承諾。原版搜尋 3 秒逾時為失敗，不是完成速度。

|操作|前／後樣本數|修改前 ms|修改後 ms|結果|
|---|---|---|---|---|
|首次進頁（含登入）|3 / 3|726 / 858|669 / 910|通過|
|分頁切換（來回）|3 / 3|305 / 372|312 / 428|通過|
|再次進頁|9 / 9|430 / 596|450 / 535|通過|
|開始修改|3 / 3|131 / 157|125 / 129|通過|
|設備總表|3 / 3|50 / 65|50 / 58|通過|
|設備搜尋|3 / 3|3019 / 3031|23 / 28|基準搜尋失效，修後通過|
|開啟設備編輯／引用|3 / 3|117 / 124|107 / 112|通過|
|套用設備|3 / 3|117 / 123|126 / 167|通過|
|儲存草稿|3 / 3|137 / 139|100 / 101|通過|
|保存後重新整理／讀回|3 / 3|459 / 656|409 / 436|通過|
|單次名稱輸入同步|3 / 3|99 / 148|127 / 128|通過|
|兩張 PNG 上傳／解碼|3 / 3|199 / 321|182 / 187|通過|
|照片後保存草稿|3 / 3|115 / 118|106 / 112|通過|
|送審|3 / 3|216 / 269|197 / 204|通過|
|送審者撤回|3 / 3|221 / 241|190 / 193|通過|
|撤回後再送審|3 / 3|185 / 195|180 / 184|通過|
|開啟版本確認平台|3 / 3|229 / 234|234 / 240|通過|
|審核者退回|3 / 3|180 / 188|150 / 164|通過|
|退回後再送審|3 / 3|186 / 189|191 / 193|通過|
|核准|3 / 3|172 / 184|147 / 151|通過|
|核准後原頁重新讀回|3 / 3|504 / 1058|495 / 521|通過|

最新測量與先前提出的本機參考門檻（首次 1.2s／再次 0.6s／開始、套用、保存 0.3s／搜尋 0.1s）逐項對照見表；原始各輪與最慢值一併保留。使用者要求持續減少等待，未把參考門檻當成對既有站台的速度保證。一般操作有數十毫秒波動，部分讀取較前版慢，不能宣稱所有動作加速；沒有以略過權限、引用、歷史來換取成績。

### 名稱寫入瓶頸：獨立可重跑模擬

對照 `415b37b`（尚未合併待送值）與 `212a730`；一次連續 20 個 input 事件後立即 Save，每個 Apply 回應人工多延遲 150ms，3 輪。前：20 次 Apply ＋ 1 Save，中位 3880ms、最慢 3888ms；後：2 次 Apply ＋ 1 Save，中位 472ms、最慢 475ms。**Apply 次數減少 90%，本情境等待減少約 88%。** 每輪另以 API 重新讀出 saved 的完整最終名稱。這是人工延遲／突發輸入情境，不代表真人輸入速度或現有站台網路。

其他操作沿原按需 bootstrap，不重構載入 kernel。開始／保存等改為局部 repaint；設備開啟多一個必要引用 GET，常規路徑 API 回應總筆數前 50／後 51，不能宣稱總請求下降。版本平台原有 routine-fqc 的 fixture 404 仍存在，非 PROCESS pageerror 或新增故障；本輪僅補上跨模組查看資格與 BOM 背景輪詢判斷。

### 程式層與 API（不混作瀏覽器時間）

- 程式層：名稱原值／身分／generation／IME／ACK loss／saved 語意等 16 組通過；引用掃描 10 組；既有導航相關 37 組通過。僅用作正確性證據，沒有推定真實站速度。
- Native API：14 組驗收通過，75 次請求含預期 403／409；成功回應中位 45ms、最慢 123ms（單次驗收 run）。是編譯後 app + isolated native D1/R2，未作前後 API 多輪比較，亦未分解資料庫單次 SQL 成本。
- 瀏覽器：上表三輪；extended／combined 的多步測試另留 raw，不與基準比較。並行或負載不同的 acceptance 耗時不拿來聲稱速度改善。

## 檢查、程式碼審查與限制

- `npx tsc --noEmit`、`npm run lint -- --format unix`、`PROCESS_PROGRAM_COMMIT=<source SHA> npm run build` 通過；兩分支合併預覽 build 亦通過。
- 原 `test-master-workflow-v3.cjs` 的舊測試 harness 在本次及乾淨 main 均有 auth 503，列為既有 fixture 問題；不當作業務流程通過。補用真正正常登入的 compiled native 測試。
- 原名稱 guard 測試的 DOM repaint fixture 及「未改 saved 仍可再次送審」假設不符目前 kernel，已更新到實際面板／有效 saved 改變；全 16 組通過，沒有刪除衝突或身分保護案例。
- 已逐段自審本次 diff：授權前置及再次核對、CAS 引用重查、guard 基線只隨 ACK 前進、相同 receipt replay、跨節點 listener 拆除、資料名稱不翻譯及 scoped CSS。dot 的獨立程式碼審查／整合仍待完成。
- 既有站版本／資料量／網路速度、真實 Frank/admin 矩陣、真手機拍照與設備文字照片、所有照片入口逐頁 UI、公開預覽均未驗；不可作發布依據。沒有 schema migration 或既有照片重壓。

## 照片獨立候選摘要

使用者已確認沿用目前「無損優先」：保留尺寸／透明度，PNG 僅無損優化，JPEG／WebP／GIF 原檔保留。主分支沒有有效的規格選擇器，移除殘留 1600px／0.82 舊說明；FQC inline 照片補用共同準備函式。盤點 12 類入口，非照片附件規則不動。

照片分支驗證：photo-upload 19、photo-editor 5、FQC helper 2、Chromium 8、native photo API 9 組通過；包含 EXIF 方向樣本、透明／橫直圖、多圖、權限、檔案限制、重試及放大。EXIF 合成 fixture 不等於真手機現拍，保留原像素也不等於真實設備文字已視覺驗收。完整入口與可重跑命令在照片分支專屬報告。

## 重跑與後續交付

先依既有 onboarding 設定安裝，`npm ci`；設定目前 SHA build，執行 `PROCESS_PROGRAM_COMMIT=<SHA> EXTENDED_ACCEPTANCE=1 MEASUREMENT_PHASE=acceptance node tests/process-master-cloud-browser.test.mjs`；native 執行 `tests/process-master-cloud-native.test.mjs`，突發輸入執行 `tests/process-master-name-burst-browser.test.mjs`。預覽副本的 `scripts/start-process-flow-preview.mjs` 會建立隔離合成資料；帳號／啟動說明見該副本 `PREVIEW_CLOUD_29102026.md`。

公開預覽需可建立新站的工具／平台；GitHub API 必須在環境政策允許後才能提交兩張 Draft PR。準備好的 PR body 僅為草稿檔，不是已建立 PR。完成上述外部交付、使用者實際驗收與 dot 核對後，才可進入後續整合；本任務仍不自行 merge 或發布既有站台。
