# 實作對照與核對來源
本對話透過Codex with ChatGPT實際讀取：工作區中控系統，ID a49fab0d07ab，分支codex/ipqc-ab-local，HEAD短碼84278d8，有未提交修改。此為讀取當時證據，不保證執行時相同；Codex開始前重新確認實體目錄<WORKSPACE>/中控系統。

|已核對檔案|用途/建議|
|---|---|
|AGENTS.md|遵循當前checkout、保留未提交與歷史；依風險定向驗證|
|public/process/dual-system.js|例行檢查目前為placeholder；新增四入口路由，保留現有ToolingUI修改|
|public/process/fqc-master.js|項目持有productCodes與errorId；只讀頁1125–1188顯示類別/代碼/規則/包含產品，保留原主資料，增加歷史回查|
|public/process/version-draft-ui.js及.css|重用共同文稿視覺，不重設|
|public/process/master-data.js|整合既有審核及例行報告資料庫入口|
|public/process/index.html、i18n.js|載入新模組與雙語文字，避免碰壞並行修改|
|scripts/local-dev.mjs|啟動會執行initializeLocal及寫dev-server標記；不可只改埠就當隔離，需先核對啟動相依|
|docs/specs/current/WHOLE_MODULE_DRAFT.md|既有主資料整份Save政策；本任務明確允許3040，例行計畫/報告按每份為scope|
|AI_CONTEXT/modules/QUALITY.md|含歷史描述，不能覆蓋最新已確認需求|

建議新增（先檢查有無同用途檔案）：public/process/routine-inspections.js/.css、routine-fqc.js/.css；app/api/routine-fqc/...；lib/routine-fqc...；定向排程/工作流/權限/持久化/UI測試。
伺服器和持久化的具體檔案切分由Codex核對後決定；此包不含可直接覆蓋專案的業務程式。不要重新匯入FQC Excel、改其他模組驗證器、關CAS或把測試身分覆寫成Admin。
所需來源已在本機：AGENTS.md、現行SHARED_DRAFT/WHOLE_MODULE_DRAFT、QUALITY、DATA_MODEL、既有FQC及媒體API。採最小增量，文稿元件視覺重用不等於更動其全域政策。
