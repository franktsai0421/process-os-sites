# R1 明確來源檢查 / Explicit-source R1 inspection

`node scripts/r1-inspect-local.mjs --pair ./owned/PAIR-RESULT.json`

檢查工具不再預設某台工作站的檔案位置；必須明確指定已獲授權的 pair JSON。缺少、重複或未知參數會先拒絕。相對路徑仍以目前工作目錄解析；沒有搜尋環境或自動選取來源。

The CLI now requires one explicit local pair-file path. It does not discover a source, import data, open database/network bindings, or authorize access to a different package. The original selected package byte-count/SHA256 pins, full ZIP integrity, layout checks, metadata-only output, failure cleanup and exclusive optional report creation remain unchanged. A matching pair description cannot make an incorrect package pass its independent integrity checks.

現有 `R1_PREFLIGHT_STRUCTURE_ONLY` 與 `R1_PREFLIGHT_REPORT` 意義不變；本次不啟用任何實際來源讀取。來源保護及原 reviewed-blob 紀錄完全不改，新可攜程式碼須無例外通過一般檢查。

Validation uses owned temporary synthetic inputs only: argument failures, metadata pin mismatch before input access, and an actual tiny ZIP rejected by the original size check. No full selected real package was opened or claimed accepted. Prior decoder and integrity behavior is source-bound unchanged, not replaced with a synthetic successful receipt.
