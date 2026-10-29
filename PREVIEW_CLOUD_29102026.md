# 流程資料驗收副本 CLOUD 29102026

此 checkout 僅作本次隔離預覽，組成流程 74ab03f 與照片 19855a0；衝突只在此預覽副本按功能整合，不改兩個 PR 或 main。需 dot 後續核對。

使用 `PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) npm run build` 後，執行 `PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) node scripts/start-process-flow-preview.mjs`。伺服器使用原生 Miniflare 隔離 D1/R2，停止即清除；不連向既有站台，沒有持久真實業務資料。

帳號 frank、other-admin、editor、reviewer、reader、denied，密碼均為公開合成測試值 `Cloud-fixture-only-29102026`，不可用於真實資料或正式站。名稱、設備、照片與退回／撤回案件皆為合成驗收資料。用途只供此 fixture。

公開預覽 URL 尚未建立：本任務未連接新 Sites 建立工具。此 checkout 保留原始專案發佈檔作來源追溯，但 **不可用它發布既有 Site**；需新預覽平台的獨立資源與綁定後才能公開。
