# Round 5：製程方塊 IPQC 讀取

本輪接續 `/workspace/process-os-performance`、`codex/performance-draft-20261030` 的既有未提交工作，基準 HEAD 為 `ca6647977a8680038444ce2c1ba4e80f2343cd0a`。沒有從 main 重建、上傳、建立 PR 或發布。完整 before 編譯及來源由主代理保存於 `/workspace/process-platform-round5-before`；本子項修改前四檔另存 `/workspace/photo-write-evidence/round5`。

## 修改與影響

| 檔案 | 修改原因及範圍 |
| --- | --- |
| `lib/process-ipqc.ts` | 同次選項查詢會為同一錯誤代碼反覆 `errors.find`。改為每次呼叫內的延遲查找表；AB 按 errorId，C 再按 productCode。保留第一次 find 的首個匹配與異常順序，不建立跨請求快取。 |
| `lib/process-ipqc.ts` | `ipqcChoices`、`validateIPQCAssignments`、`ipqcIssues` 新增可選的 `preparedMaster`，供伺服器傳入同份 state 已解析的 master。既有不傳參數者保留原讀取；品質來源仍依各次呼叫解析。authoring context 的接線由另一子項負責。 |
| `app/api/process-ipqc/route.ts` | choices GET 使用既有 records decoder 的 master model，避免先序列化完整 master 照片再解析一次。選取鍵、實際 body 讀取、完整性驗證、權限與回應內容不變；legacy inline 仍走原路。 |
| `public/process/process-ipqc.js` | AB 仍立即取得、計算並驗證完整 fresh response；收折的項目標準、規則與照片只延後建立 DOM，展開時插入。選項、占用、計數、舊關聯警示和勾選控制立即可用。內容只屬於當次 panel/request，重讀來源即替換，身份或 context 改變不插入舊內容。C 查詢渲染與舊分配保留方式不改。 |
| `docs/specs/current/IPQC_POLICY.md` | 過時的「與正式版相同可送審」一句改指向現行 SHARED_DRAFT；不修改業務實作。 |

沒有設定、依賴、SQL schema、資料遷移或正式資料寫入。沒有刪除引用／占用檢查、改用未核准版本或略過來源完整性門檻。

## 可重現證據

新增測試為 `scripts/test-process-ipqc-choice-read.cjs`、`scripts/test-process-ipqc-choice-dom.cjs`。執行前指定 `IPQC_CHOICES_BASELINE_DIR` 為含上述 before 檔案及原相對路徑的目錄；不含密碼或憑證。測試使用隨機隔離簽章密鑰、記憶中 SQLite/R2 與合成品質資料。

| 驗證 | 結果 | 證據／界線 |
| --- | --- | --- |
| 修改前 domain／actual handler 對照 | PASS，45 組 | `.sites-runtime/perf-500ms-round5/ipqc-choice-before-counts.json`；兩個來源當時相同，timing rows 為空。 |
| 修改後 domain／actual handler 等價及保護 | PASS，51 組 | `ipqc-choice-after-counts.json`；包含 AB/C、缺來源、停用／刪除、first-match／malformed row、占用衝突、原有失效關聯保留、身份／權限拒絕、SHA 故障及 inline fallback。 |
| AB 同步 DOM／事件 | PASS，8 組 | `ipqc-choice-dom.json`；中／越文、展開後完整 DOM 等價、勾選、readonly、重讀新版、身份／舊 panel 晚到及無效隱藏欄位。這不是原生 CSS／手機驗收。 |
| C 查詢既有回歸 | PASS，23 組 | 主代理執行 `scripts/test-process-ipqc-c-query.cjs`，`/tmp/round5-ipqc-c-query.log`。C11 原先只硬比舊 onclose 字串而失敗；更新為執行 production callback，驗證 unmount/remove 各一次、晚到 close 不清新 modal，整套通過。先前失敗屬測試過時，不是產品功能通過的替代證據。 |
| Scoped lint | PASS | 本子項三個程式檔與兩個新測試。 |
| 差異空白檢查 | PASS（`core.whitespace=cr-at-eol`） | 原檔使用 CRLF；保留原行尾，普通 diff-check 會把新增行的 CR 報為 trailing whitespace。 |
| 實際瀏覽器完整操作／手機畫面／網路故障 | 由主代理另列 | 本子項的合成 DOM 不代替 compiled browser 驗收。 |

資料量固定為 AB／C 各 4 個產品、32 個錯誤、384 個項目。API fixture 另有 512KiB 合成 master data URI，屬人工負載，不推定正式資料速度。API 對照逐項確認 response body、headers、全部 SQL/R2 呼叫順序相同；GET 不得寫入 SQL/R2。

| 可驗證工作量 | 修改前 | 修改後 |
| --- | ---: | ---: |
| 每線 384 項目的 errors.find | 384 次 | 32 次 |
| 每線 error predicate visits | 6,336 次 | 528 次 |
| 呼叫者已解析 master 後，choices／assignment validation／issues 各自再解析 master | 1 次 | 0 次 |
| AB 初始 DOM，49 個項目（含重複 ID 相異內容測試） | 1,644 節點 | 566 節點 |

最後一列約減少 65.6% 初始節點；展開全部項目後 DOM 與 before 相同。完整 fresh response 仍先讀取，沒有以未完成資料或舊版本偽裝可用。照片解析／載入時間應另量，不把未展開照片的延後載入當作圖片已完成。

## Handler 時間與待測

主代理安排獨占窗口後，已用相同資料各跑五次 before／candidate 交替順序，exit 0，51 組正確性案例仍 PASS。證據為 `.sites-runtime/perf-500ms-round5/ipqc-choice-handler-paired.json`，完整執行輸出在 `/tmp/round5-ipqc-handler-paired.log`。兩版使用保存的 before／目前 candidate domain 與 route source、共用本輪同一組其他依賴；source SHA-256 完整列在 JSON。

| 選項讀取 handler | 次數 | 修改前中位／最慢 | 修改後中位／最慢 | 解讀 |
| --- | ---: | ---: | ---: | --- |
| IPQC-AB（A 線） | 每版 5 次 | 36.9／59.3 ms | 40.0／47.8 ms | 中位慢約 8.4%，最慢改善約 19.4%；不能宣稱整體加速。 |
| IPQC-C | 每版 5 次 | 49.9／65.8 ms | 41.8／119.9 ms | 中位改善約 16.2%，最慢變差約 82.2%；尾端波動保留，未刪除慢樣本。 |

計時從建立實際 Request、執行 GET handler 到回應 JSON 解碼完成，儲存是隔離記憶中 SQLite/R2，並非真實 HTTP／Workers／瀏覽器端到端時間。資料量為前述每線 384 項目及 512KiB 合成 master URI；全組均低於 500 ms，但不能推定正式或大資料環境也會達標。這組時間沒有證明兩線全面加速，效益證據以可重現的運算／序列化減量及另列瀏覽器結果共同判讀。

計時時已關閉 find／predicate 計數包裝，所有 timed rows 的兩個計數皆為 0；工作量計數另由前述獨立案例提供。兩線 handler 都保留同 7 次 R2 GET、沒有寫入；完整 master parse 由 2 次降為 1 次，完整 master stringify 由 1 次降為 0 次，每次避免序列化 1,049,419 個 code units。沒有減少權限、完整性、資料讀取或回應內容。

重現命令：

```sh
IPQC_CHOICES_BASELINE_DIR=/workspace/photo-write-evidence/round5 \
IPQC_CHOICES_EXPECT_REDUCTION=1 IPQC_CHOICES_BENCHMARK=1 \
IPQC_CHOICES_OUTPUT=.sites-runtime/perf-500ms-round5/ipqc-choice-handler-paired.json \
node scripts/test-process-ipqc-choice-read.cjs
```

量測完成後已停止測試並釋出 CPU 窗口。原生瀏覽器的選項可操作、展開明細與圖片完成需分開列；本表不能與 localhost compiled browser、隔離預覽或既有雲端站時間直接相減。

## 規則與限制

- AB 來源維持目前已核准、啟用、同線別／類別／工段／所選產品的項目；同項目唯一占用、固定來源版本與 stale reference 檢查保留。
- C 維持查詢開關、唯讀標準及既有分配保留。本輪不新增 C 分配入口。
- `IPQC_POLICY.md` 的舊無差異送審敘述與較新 SHARED_DRAFT 相衝突，已改為引用最新規則：撤回／發回可重送同份固定 Save；核准後須有實質修改。
- 舊 IPQC 文件及舊測試曾把 `user.lines` 當授權限制；現行 `PERMISSIONS_ADMIN.md` 明定線別不再作 AUTH，原欄位留存。基準實測與 candidate 都遵循目前 effective access；沒有把舊 `lines=['A']` 的 C 查詢回應 200 改成 403，也不把它報為新增授權缺陷。
- 讀取不建立跨身份、權限、版本的快取。延後 DOM 只使用當次成功回應；後端仍在寫入時檢查最終引用與占用，既有送審／核准／待補規則不變。
- 未使用真實正式業務資料，未對既有測試站執行寫入或發布。原生瀏覽器完整結果、最終建置、整合型別檢查與發布仍由主代理／dot 分別交付。
