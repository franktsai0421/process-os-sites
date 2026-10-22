# 完整交接包 V2｜2026-10-07

本包完整取代第一版ZIP，不必同時提供兩包。新增使用者提供的桌機原參考圖及新版精緻視覺圖，業務規格不變。

## 優先順序
1. 業務、送審、結案與搜尋：02_ROUTINE_FQC_SPEC.md。
2. 既有文稿／操作／報錯／待補／操作紀錄：本機現有共同元件，完全保留樣式、位置與順序。
3. 新功能桌機視覺：UI/visual/FQC_DESKTOP_VISUAL_V2.png；使用者原參考圖作補充。
4. UI/01至06的SVG及舊簡化HTML僅用於核對欄位和閱讀順序，不能再作最終視覺風格。

## 使用方法
選本機Codex Astra / High，附整包或解壓資料夾，貼01_CODEX_PROMPT.txt。開UI/index.html先看新版視覺及注意事項，再看六頁欄位和手機閱讀參考。
此包不改本機專案。正式實作3040隔離驗收，通過後保全資料銜接3000；不commit/push/Git merge/部署。

## 完整內容
- 01_CODEX_PROMPT.txt：本機執行指令。
- 02_ROUTINE_FQC_SPEC.md：全部最新已確認規格。
- 03_UI_SPEC.md：版面與視覺層次、需修正的生成圖細節。
- 04_STATE_AND_PERMISSIONS.md：狀態／動作／權限。
- 05_ACCEPTANCE.csv：38項驗收，仍全部NOT_RUN。
- 06_IMPLEMENTATION_MAP.md：來源核對與改檔建議。
- 07_ASSETS_AND_PROVENANCE.md：圖片來源及限制。
- UI/visual：原參考圖與新版PNG。
- UI/index.html：本地可開的圖文導覽，無後端。
- UI/01至06_desktop.svg：六頁欄位結構示意。
- tests/assets：兩張僅供3040的上傳測試PNG。
- MANIFEST_SHA256.json：所有附件SHA-256。

本包是規格與參考，不是完成的應用程式；不含憑證、資料庫或正式檢查照片。
