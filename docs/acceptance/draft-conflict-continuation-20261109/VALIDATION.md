# 續作整合驗證

本批 production 最終 bytes 固定於真實 Git commit `f68e8246965d02e84c63311e539a9008adb11ab3`；後續只有 source witness、測試及文件。最終 HEAD／tree、標準 build／compiled HTTP／bundle consumer 的精確回執，由外部 `draft-conflict-continuation-delivery-20261109/manifest.json` 綁定。來源證明對 final HEAD 的 production bytes 必須相同，沒有以 dummy SHA、舊 build 或較早測試冒充。

| 本機正常 CI／相依檢查 | 結果 |
| --- | --- |
| 全組選擇、權限、CAS、晚到輸入、照片、原收據 | 1074/1074 PASS |
| 精確 current／12 個具名 predecessor／負控制 | 707/707 PASS |
| 同頁篩選與輸入保留 | 115/115 PASS |
| #99／#100 明確權限、無背景查詢、FQC readiness | 219/219 PASS |
| 入口與定時同步移除 | 127/127 PASS |
| 原完整離頁 gate | 468/468 PASS（原 463 加 5 個 Tooling 非空狀態案例） |
| PROCESS／AB-C bridges 與例行 FQC original receipt | 165/165 PASS |
| 標準 lint、非增量 TypeScript | PASS；最終測試修正另經 targeted lint／syntax |
| 受保護 build、private-auth postbuild、compiled HTTP | 由最終 HEAD 的交付 manifest／原始日誌核實；HTTP 是 Miniflare，不是原生瀏覽器 |
| 完整 bundle／逐 blob source archive／獨立 clone | 由交付 manifest／consumer 日誌核實；不宣稱乾淨 npm 安裝或完整資料初始化 |

組別互有重疊，不相加為總覆蓋。主要測試由實際 production UI closure／controller／transport／簽章 handler、合成 DOM／File／隔離 SQLite／Map-R2 組成；compiled HTTP 額外使用最終 build 的 worker 及隔離 Miniflare D1/R2。公開 history 的 `workflow.saves` 隱藏契約保持不變，compiled FQC 舊 Save 核對透過 production decoder 唯讀讀取合成儲存，不開新公開歷史權限。

## 來源、審查及失敗紀錄

保留前 11 個真實 named target，新增真實 `7ef04ed` predecessor；45 個 current runtime 檔、377 個 exact inverse、15 個不存在的新增來源證明，原 79 個 bounded historical ref/path witness 不變。使用實際 Git commit/tree/blob；不建立假 `.git` objects，不降低 hash/span／cache 順序／漂移負控制。原 choice1、choice2、main100 cache 階段與新 `20261109-conflict-continuation1` 各自精確核對。帳本與 witness 各小於 5 MiB。

交叉審查先重現再修正：PROCESS 主照選擇丟獨立尾序（4 負控）、IQC 無關重排撤銷刪除與主供應商帶走尾序、Tooling 新 File 物件相同 hash 重送 UNKNOWN，以及 FQC tombstone error 缺 guard path。原 before／after logs、exact candidate hashes 和審查範圍保留在外部交付。部分獨審原 stdout 僅由工具回傳、未存獨立檔；其報告明示此限制，沒有重建假 log。作者與 reviewer 證據分開歸屬。

早期共同 gate 的 IPQC A/B 程序未正常完成；原日誌保留，不當通過證據。未改斷言／timeout／skip；後續獨立 TAP 179/179 及完整中間 1053/1053、最終 1074/1074 通過。離頁首次 7 個 Tooling ReferenceError 來自 AST fixture 未抽取新 `clearPhotoFiles`；改抽真正 production 函式與 Map／WeakMap initializers，原 166 個 binding 案例與斷言逐 byte 保留，另加 5 個 File／outcome／UNKNOWN／缺 closure 負控。完整原 gate 20 個檔案仍執行。

## 保留的限制

- #102 的全頁持久分界、LINE／catalog owners、例行 FQC 整頁原子 workflow，以及另一畫布／已核准查看候選尚未整合。三項使用者決定已確認，不再列為需求待決；尚缺的是接線與驗證。
- FQC 最終刪除列的本機 product matrix 沿既有省略規則，Mine 前明示提示。其餘 retained payload 仍受 delete/edit/view、exact current tombstone、whole-row guard、parent、revision/generation、single CAS 和 full-command receipt 保護。
- 模具／IQC asset 端點沒有 durable upload receipt；原圖片 hash／結果追查能力只在目前 document RAM。不能宣稱跨 reload File 復原；workflow UNKNOWN 的原 durable receipt／不重送獨立保留。
- 無法可靠辨識的照片／清單 identity、混合或重複 ID、src pairing、alias 不一致及未支援結構維持明確整組比較或 recheck，不猜造身分。
- 原生 Chromium 先前受 socket／ptrace 限制，本輪沒有換路重試。桌機／iPhone／真實 IME／實站驗收 NOT_RUN，compiled HTTP 不替代它們。
- 沒有任何真實資料、SQL migration、帳密／權限設定、connector、Site audience、遠端 branch／PR／merge 或部署修改。GitHub 上傳授權存在，但舊 create_tree UNKNOWN 與缺 exact payload 的阻擋仍未釐清，未重送或拆包繞路。

[逐頁狀態及與 #102／版本查看／畫布的組合契約](README.md)。
