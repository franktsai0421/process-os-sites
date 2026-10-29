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
|例行 FQC 計畫／報告照片|/api/routine-fqc/photo → readPhotoUpload|25,000,000 bytes|
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
- 各模組的完整上傳表單、進度及任意網路重試不由共用 codec 測試替代；流程資料照片另由流程 PR 的完整應用瀏覽器測試覆蓋。

## 與流程修復 PR 的關係
兩 PR 可各自檢查；統合預覽需套用兩者。重疊 `app.js`、`process-equipment.js`、`index.html`；照片 PR 僅相片文案及資產參數，流程 PR 改行為。請 dot 依區塊合併，禁止整檔覆蓋。
本 PR 不修改使用者權限、小幫手管理 UI、正式／既有測試站或其資料。無持久資料模型／schema 變更。
