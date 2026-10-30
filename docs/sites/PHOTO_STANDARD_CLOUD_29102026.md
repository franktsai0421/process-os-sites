# 全站照片 CLOUD 29102026

基準 `2cac307f29b8017a2bb6dc5229d47720f2deab33`；分支 `codex/photo-standard-cloud-29102026`。
使用者於本任務確認沿用目前無損優先規則，沒有另訂縮圖尺寸或有損品質數值。

## 統一規則
新上傳／更換照片保留尺寸、透明度、方向資訊；支援範圍內 PNG 僅無損重編碼，必須至少節省 1024 bytes 才採用。JPEG/WebP/GIF 保留編碼與原檔資訊；不二次有損轉檔。PNG 8 MiB／32 MiB 解壓界線等既有防護不變。實際檔案限制仍由各模組執行，並非同一全站大小上限。

main 未提供「一般規格」選擇器；舊 1600px/WebP0.82 只剩過時文字。移除過時及不必要的壓縮說明，操作結果只顯示加入照片。保留必要驗證、錯誤、相片計數與放大查看提示。既有照片、照片識別、引用、歷史、ACL、PDF/Excel/影片處理均不批次改寫。

## 入口盤點
|入口|處理路徑|原限制／結果|
|---|---|---|
|流程資料模板、流程設備新增及更換|app.prepareMediaUpload → prepareBrowserPhoto|既有工作流命令限制；原已統一|
|製程編輯共用／產品作業照片|prepareMediaUploads → prepareBrowserPhoto|原已統一，影片保留原路徑|
|舊製程 inspector／產品媒體入口|同上|原已統一，清理提示|
|FQC 標準照片|fqc-master.fileData → prepareBrowserPhoto|本次補上共用無損處理；既有工作流限制不變|
|IQC 零件／檢查方式照片|/api/iqc/photo → readPhotoUpload|5,000,000 bytes|
|IPQC-AB 標準照片|/api/ipqc-ab/photo → readPhotoUpload|5,000,000 bytes|
|IPQC-C 描述／標準照片|/api/ipqc-c/photo → readPhotoUpload|5,000,000 bytes|
|品質檢具及測試設備照片|/api/routine-equipment/photo → readPhotoUpload|5,000,000 bytes|
|例行 FQC 執行報告／處置申請照片|/api/routine-fqc/photo → readPhotoUpload|25,000,000 bytes|
|模具設備照片|/api/tooling/photo → readPhotoUpload|25,000,000 bytes；按鈕改為「新增照片」|
|小幫手回報上傳／貼上圖片|web-feedback → readPhotoUpload|5,000,000 bytes、6 張；不修改正在進行的小幫手 UI|

## 驗證命令與邊界
- `node tests/photo-upload.test.mjs`：原有 19 組格式／透明／逐像素／資料界線檢查。
- `node --experimental-vm-modules tests/photo-editor.test.mjs`：原有 5 組實際 app 入口。
- `node --experimental-vm-modules tests/photo-standard-entries.test.mjs`：新增 2 組實際 FQC helper／損壞 PNG 拒絕。
- `node tests/photo-standard-browser.test.mjs`：真 Chromium，桌面／390px，透明 PNG、EXIF 直拍、橫向 JPEG、WebP；前後解碼像素／尺寸一致，重試結果相同。
- PASS：上述 19＋5＋2 組與 Chromium 8 組；編譯原生 `photo-upload-native.test.mjs` 9 組（六照片 API、回讀、ACL、重送、損壞／大小界線及回報照片）。
- PASS：`npx tsc --noEmit`、`npm run lint -- --format unix`、帶 `PROCESS_PROGRAM_COMMIT` 的 `npm run build`。
- 裝置方向為合成 EXIF 瀏覽器驗證，不冒充實體手機拍攝。未取得真實公司照片，不宣稱真實文字可讀性人工驗收。保留像素為本輪可讀性保全證據。
- 完整原生表單補驗見下節；失敗重試覆蓋 IQC 零件與小幫手，以及流程 PR 的流程照片案例，不宣稱每種網路故障已在所有模組窮舉。

## 與流程修復 PR 的關係
兩 PR 可各自檢查；統合預覽需套用兩者。重疊 `app.js`、`process-equipment.js`、`index.html`；照片 PR 僅相片文案及資產參數，流程 PR 改行為。請 dot 依區塊合併，禁止整檔覆蓋。
本 PR 不修改使用者權限、小幫手管理 UI、正式／既有測試站或其資料。無持久資料模型／schema 變更。

## 2026-10-29 補做實際表單與小字驗收

新增 `photo-entry-cloud-fixture.mjs`、`photo-technical-fixtures.mjs`、`photo-entry-browser.test.mjs`。每次以正常登入進入編譯後原生應用，使用獨立 D1/R2、隨機 session secret 與合成 Frank admin；所有外部瀏覽器請求阻擋。未接觸既有 Site 或業務資料。

四種測試圖：2000×1200 透明 PNG（中越文設備銘牌、10／12／16px 小字）、帶 EXIF orientation=6 的 JPEG（正向顯示 800×1200）、1600×1000 橫向 JPEG、1400×900 透明 WebP。PNG 比對解碼後每個像素，其餘比對原檔 bytes；原始規格與方向資訊保留。這些是程式產生的校驗圖，不能冒稱實體手機或實際現場銘牌已驗收。

一般步驟：正常登入 → 開始修改 → 開啟表單 → 上傳 → 縮圖解碼 → 套用 → 儲存草稿 → 從隔離資料庫重新讀取 saved → 關閉／重新整理 → 再開啟核對照片。例行報告以既有草稿保存；小幫手以獨立回報送出後讀取附件及案件核對。階層照片逐層保存並重開表單核對。桌面 1365px，窄螢幕 390px。

### 小字可讀性與局部修正

發現共用燈箱原先只縮圖適合視窗：2000px 圖片在約 1100px 視窗內，10–12px 原圖文字只剩約 5.5–6.6 CSS px。像素未被壓壞，但閱讀不便。本次加「放大／適合視窗」操作，放大時以原始像素大小顯示並可捲動，切換照片恢復適合視窗。原圖、附件 ID、歷史與存取權限不變；影片沒有放大按鈕，原播放控制與處理路徑保留。

修改 `public/process/app.js` 的 `bindLightbox`、新增限定 `.media-lightbox` 的 `photo-viewer.css`、更新 `index.html` 資產標記。這是全站照片檢視器的局部修正，須與另一流程 PR 的 app.js 變更依區塊整合。其他模組自己的照片檢視器維持原行為。

測試圖縮放前後截圖在 `.sites-runtime/photo-nameplate-fit.png`、`photo-nameplate-zoom.png`。檢查原像素寬度、左緣不裁切、窄螢幕水平捲動、切圖重設、中文／越文按鈕分開顯示，並實際檢視截圖；沒有為可讀性更改使用者已確認的無損照片規則。

### 不適用與未測邊界

- 例行 FQC 計畫／免做申請：既有 UI 沒有照片欄位，照片入口驗收不適用；報告與處置照片已列入。
- 舊 inspector／產品媒體：現行 V3 編輯入口由 `app.js` 導向 `ProcessEditorV2.workspace/bind`，實際表單是共用作業／產品專用作業。舊分支維持原共用照片 helper，不將未啟用的舊 UI 假稱已逐頁點擊。
- IPQC-AB 既有 methodPhotos 保留顯示；現在唯一上傳欄位是 standard，兩者沒有被本次合併或刪除。
- 真實手機相機、HEIC 轉檔、現場失焦／反光：未提供原始素材，未測。照片 policy 沒有新增 HEIC 支援；不把瀏覽器尺寸模擬當成實機驗收。
- 四個任務全部整合後的瀏覽器驗收仍不是本次流程＋照片隔離候選的通過範圍；固定分支衝突及最小補丁另見流程 PR 的整合核對資料。

### 補驗結果：15 組通過

完整結果與編譯來源檔案 SHA-256：[JSON 紀錄](PHOTO_STANDARD_CLOUD_29102026_RESULTS.json)。全組通過後，僅修正共用燈箱對齊，再重跑受影響的流程模板／流程設備兩組。其餘入口使用各自檢視器，沿用同一輪證據。

下表操作者均為隔離 `Synthetic Photo QA / frank admin`，預期畫面是正確方向的完整照片，預期資料變化為保存上述新照片、保留其他記錄；實際保存、重新讀取與圖檔核對均符合預期。耗時為單次完整驗收操作（含雜湊比對、讀庫、截圖），不是單一按鈕速度，也不與既有站台比較。

|入口／操作|預期資料與畫面／實際結果|驗收耗時 ms|狀態|
|---|---|---:|---|
|FQC 標準|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2883|通過|
|IQC 零件|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2077|通過|
|IQC 檢查方式|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2429|通過|
|IPQC-AB|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2348|通過|
|IPQC-C|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2570|通過|
|檢具設備更換|上傳、保存回讀、重開／查看均正確；像素或原檔一致|4501|通過|
|檢具設備新增|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2266|通過|
|模具設備|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2356|通過|
|檢具類別／子類別／群組|上傳、保存回讀、重開／查看均正確；像素或原檔一致|3633|通過|
|例行執行報告|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2768|通過|
|例行處置申請|上傳、保存回讀、重開／查看均正確；像素或原檔一致|4565|通過|
|小幫手選檔／貼上／重試|上傳、保存回讀、重開／查看均正確；像素或原檔一致|3012|通過|
|流程資料模板／放大|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2570|通過|
|流程設備總表照片|上傳、保存回讀、重開／查看均正確；像素或原檔一致|2618|通過|
|製程共用／產品專用作業|上傳、保存回讀、重開／查看均正確；像素或原檔一致|3078|通過|

執行：先在所測來源 `PROCESS_PROGRAM_COMMIT=<40字元commit> npm run build`，再 `node tests/photo-entry-browser.test.mjs`；預設跑 12 組品質／回報入口。完整流程＋照片預覽另以 `PHOTO_ENTRIES=fqc,iqc-part,iqc-item,ipqc-ab,ipqc-c,equipment,equipment-new,tooling,equipment-hierarchy,routine-report,routine-disposal,feedback,process-template,process-equipment,process-authoring` 執行 15 組，三個 process 案例對應兩候選整合後 UI。

本輪額外檢查：photo-editor 5 組、lint、TypeScript、編譯與 diff check 通過。既有 policy／原生 API／權限保護驗證見前節，本次只增加檢視器及補驗，未修改那些後端路徑。

獨立照片分支 `88ccd815ff341d80e23b573eea6c8016a93a430c` 再次獨立建置成功；預設 12 組品質／小幫手照片表單全部通過、零 pageerror，證明這部分不必先混入流程 PR 才能驗證。流程＋照片預覽產品來源為 `642d4defc8057c5d96e902070e39a6181a1afc17`。
