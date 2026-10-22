# Canvas 證據工具離線回歸

2026-10-15 接手：以下工具與測試已從驗證副本 exact-byte 整合回目前工作分支；舊封存保留。兩個同步 facade 的精確 lint 載入例外及目前完整 checkout FAIL 415，見[唯一 lint 政策紀錄](LINT_CONTRACT_POLICY.md)。下方 418→415 等數字屬原階段範圍，不能代替最新全量結果。

本入口檢查 `check-canvas-content.cjs`、`canvas-task-diff.cjs`、`canvas-final-manifest.cjs`。沿用已驗證的 synthetic 案例；不啟動應用服務、不呼叫真實 HTTP／Git／資料庫，也不讀取業務資料。

在專案執行：

```sh
node scripts/test-canvas-evidence-tools.mjs
```

只需 Node 內建模組，無須 `npm install`。程式依自身 module URL 尋找來源及 fixture，也可由其他工作目錄以入口的完整路徑執行。專案要求 Node >=22.13；本次實際驗證環境為 Windows、Node 22.13.0 與 Node 24.19.0；其他 OS 仍須各自驗證。

結果以 JSON 輸出摘要及 `receipt.json` 路徑。預設在 OS Temp 建立新的 `process-canvas-evidence-*` 子目錄；若 sandbox 每次命令使用不同 Temp，請加 `--artifacts-dir <已存在的絕對目錄>` 以保留證據。入口只建立新的子目錄，不覆寫既有報告。合成檔案及 child audit 保留供檢視，程式不遞迴刪除任何目錄。

可用 --tool canvas-final-manifest 選測，亦支援 canvas-task-diff／check-canvas-content，搭配原 --artifacts-dir。省略 --tool 維持原全套 67 項；選測摘要會列 selectedTools 及實際數量，不當全套通過。未知、重複或缺值參數退出 2。

退出碼：

- `0`：全部選定的隔離案例通過。
- `1`：回歸、fixture、環境或初始化失敗；沒有以 SKIP 代替通過。
- `2`：不支援的命令列參數。`--help` 顯示用法後退出 `0`，不代表執行測試。

固定案例包含 21 項 VM 回歸、8 項正常輸出位元組／console／require 契約、30 項 IO 故障與回復、8 項 native Node CLI。VM 中的 fetch、fs 與 Git 均為合成替身。每個 native 子程序先載入同一入口的預載器，以 Git stub 和自有合成檔案執行；這些案例驗證實際 Node／檔案系統行為，不是再次驗證真 Git。負向 native 案例除了失敗退出及舊檔保留，還必須由 `child-audit.json` 證明特定寫入／rename 故障或 lock 拒絕確實發生，避免把預載器或 loader 錯誤誤判為通過。

[入口](../../scripts/test-canvas-evidence-tools.mjs)及[固定期待值](../../scripts/fixtures/canvas-evidence-tools.json)共同隨來源交付。fixture 的八組期待值來自修正前已通過的正常案例，Git shape 來自先前離線觀察；測試不會依當前工具自動生成期待值。若刻意變更輸出契約，應另外審查 fixture 差異，不要用重錄掩蓋失敗。

兩支同步工具保留 CJS facade，各以兩次 require 載入 [task diff core](../../scripts/canvas-task-diff.mjs)／[final manifest core](../../scripts/canvas-final-manifest.mjs) 及逐次取得 helper。core 僅 import builtin；配置、讀寫及 spawnSync 取得留在同步 run。空 exports、cache 命中不重跑、清 cache 後 helper／spawnSync 重取、同步錯誤後重試及返回前報告完成，由 Node 22.13／24.19 原生對照驗證。載入圖改變，不宣稱 Module._load hook 次數等價。

本組只補 final-manifest：兩 Node 各 30 項（8 VM／3 fixed／15 IO／4 native），其餘未變案例沿用前版證據。固定 golden 不變，VM 僅新增該 core 明列 import／export adapter，native 包含兩 core 且故障仍需 audit witness。另以實際 21 個匹配 scripts 驗 24 項 ordered union／row SHA／兩 core 各一次；parent 在首次返回後新增 inert fixture，同一 child 刪 cache 重載反映 22 scripts／25 項。old／new 對相同 fixture bytes 的順序與輸出相同，Git 為 stub。初版誤換自我納入的 facade fixture bytes 導致 SHA 差異，失敗保留；改 fixture 外部執行後通過。全 lint 418→415，本檔 5→2，其他診斷 multiset 不變，仍 FAIL。

async content 具有同步配置 throw 與非同步 catch 兩種時點，本批不遷移。未因選測重跑兩支未變工具，不追加 lint 批次或重包 ZIP。

範圍限制：沒有產品 GUI／多人流程／實體手機／跨電腦／資料還原驗收；不證明斷電原子性、Windows ACL／ownership／inode 相同，也不是執行不受信任程式碼的安全沙箱。fixture 中的連結與存取拒絕案例是 VM 模擬，不需要實際建立 symlink 或取得額外權限。
