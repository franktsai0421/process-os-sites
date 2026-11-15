# 製程 IPQC 頻率 AQL 重複標籤

基底：最新遠端 main `c6ac41a6a996ac88e1b68370b371aed400773e34`（已合併 #120）；獨立 worktree／`fix/process-ipqc-frequency-display-20261115`。本次範圍僅為 C 詳細標準頻率顯示；未操作遠端業務資料。

## 根因與修正

`public/process/process-ipqc.js` [公開基底的 `frequency()`](https://github.com/franktsai0421/process-os-sites/blob/c6ac41a6a996ac88e1b68370b371aed400773e34/public/process/process-ipqc.js#L33) 同時以 `batchKind=aql` 產生 `AQL`，再對 `aqlValue` 產生 `AQL 0.25`，所以串成「按批次 · AQL · AQL 0.25」。已以精確 merged main 原始碼獨立重現中越文的相同錯誤。

只在選定方式為 aql 且有 aqlValue 時，把方式與值合成一次 `AQL <值>`，並停止附加第二個 AQL 欄位。結果為「按批次 · AQL 0.25」／「Theo lô · AQL 0.25」。AB 的既有 kind/value 格式不改，固定件數、批次數量、AB/C 全部時間別名、自訂、未設定、多規則與 legacy 文字仍保持原內容；不對作者文字做全域 AQL 去重。缺少 AQL 值只顯示方式，不補造數值。

同一格式器用於現行來源詳細區、既有 AB 來源比較及唯讀 C 查詢，沒有新增或修改資料 store、來源規則、schema、API、權限、Save／Submit、採用版本或占用邏輯。更新 process-ipqc.js cache tag，既有 cache 契約同步精確更新。

## 驗證與範圍

- 新 `process-ipqc-frequency.test.mjs` 使用完整實際 module 的 test-only closure port：中越文精確字串、原 main 失敗重現、frozen input 不變。涵蓋 AQL、缺值、字串零、AB/C 固定件數與批次數量、十個時間別名、自訂、作者文字、多規則與 legacy fallback。
- 實際 editor／authoring／Canvas／IPQC module 的 A/B/C 詳細區，以及 C 唯讀查詢，驗證 AQL 只出現一次、值存在、沒有額外 GET 或 POST、品質與製程內容不變。fixture 為合成 DOM／本機 port，不能稱為實站或原生手機驗收。
- 原頻率以外的行為由現有 assignment/source-adopt、source history、C query 與原完整 DOM oracle 定向回歸；六個 pinned baseline source bytes、既有負例與歷史 manifests 保留，另加精確新 successor inverse，未知／漂移不放行。
- 本輪新測試納入既有 Linux 與 Windows IPQC jobs，沒有移除原檢查、提高權限或增加部署。
- 完成後以 PR 精確 head 的 CI 狀態交付；本機 PASS 不代表已部署驗收。沒有合併或部署，真人、實體手機、真 IME 與測試站複驗均未執行。

## 修改範圍

本輪只有頻率字串、必要 cache tag、定向合成測試、CI 命令與文件。沒有設備功能或效能修改；資料模型、API、角色與來源寫入邏輯不變。

## 本機實際結果

程式與測試 commit `fb5655a193644fd5e4a537fadd5cac122d12dc70`；後續只補本節驗證紀錄。所有 fixtures 為合成資料，沒有連線到測試站。

| 實際執行 | 結果 |
| --- | --- |
| `node --test tests/process-ipqc-frequency.test.mjs tests/process-ipqc-frequency-source.test.cjs` | 72 PASS（63 顯示／詳細區、9 精確來源契約） |
| 上述測試加 latest、source-adopt、source-history-route、assignment-state、link-rules | 271 PASS，0 fail／skip；包含來源競態、權限、持久化及不重複分配回歸 |
| assignment-source、link-source、lines-flow joint/source、save-recovery-source、navigation、draft-receipt、account-password、platform-adopt、accounts-process、canvas-contract、background proof/check、operation-speed integration/source/joint、frequency-source | 587 PASS，0 fail／skip；歷史 manifests、固定來源 bytes 與漂移負例保留 |
| `IPQC_CHOICES_BASELINE_DIR=.sites-runtime/performance-baseline node scripts/test-process-ipqc-choice-dom.cjs` | 14 PASS；包含 zh/vi 完整詳細區與六個 notice 負例 |
| `node scripts/test-process-ipqc-c-query.cjs` | 24 組 PASS |
| `npm run lint` | PASS；先修正新測試 tuple 的 JSDoc 型別推斷，再完成通過 |
| `npx tsc --noEmit --incremental false` | PASS |
| `PROCESS_PROGRAM_COMMIT=<上述完整 commit> npm run build` | PASS：`PASS_BUILD_EXIT0_AND_POSTBUILD_KNOWN_AUTH_CLIENT_CHECK` |
| `git diff <base> --check` | PASS |

本機沒有原生瀏覽器或實體裝置驗收，原生檢查由 PR 既有 CI 執行。表格測試有重疊，不相加為獨立總數。CI 結果依 PR 精確遠端 head 提供，沒有手動重跑／跳過檢查。
