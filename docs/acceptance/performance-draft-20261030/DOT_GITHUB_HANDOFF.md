# 全站入口、草稿與製程平台：公開來源交接

本次依使用者 2026-10-30 新授權，將最新累積成果提交至 `handoff/sitewide-performance-drafts-20261030`，交 dot 核對後整合最新 main 與其他 PR。此次只交接來源；不自行合併 main、#51、#52，不建立／合併 PR，不部署。

## 基準、檔案與公開範圍

- 儲存庫：`franktsai0421/process-os-sites`。
- 實際開發基準：`ca6647977a8680038444ce2c1ba4e80f2343cd0a`。
- 原工作分支：`codex/performance-draft-20261030`；工作目錄 `/workspace/process-os-performance`。原分支與完整本機交接包保留。
- 開始公開交接時：38 個 tracked 修改、97 個 untracked 檔案，合計 135 個累積成果，均與上一輪交接 manifest 一致；沒有既存 staged 修改。
- 公開內容：104 個必要程式／測試／文字文件，加本交接文件，共 105 檔。排除 31 份原始測速 JSON／JSONL，原檔仍在工作區。完整檔案清單見文末。
- 不提交資料庫、真實業務／帳號資料、密碼、憑證、壓縮包、截圖、trace、建置結果或其他產生檔。測試使用程式產生的隔離合成 fixture，沒有真實帳號匯出。
- 此次僅更新公開交接文件與證據連結標示，產品、測試及依賴內容保持上一輪驗證成果；沒有新增依賴、設定或資料遷移。
- 開始交接時 Git 遠端讀取成功，同名分支不存在。GitHub REST／GraphQL API 回覆 Forbidden；使用 Git push 與重新讀取遠端 SHA 驗證交付，不能將 API 受限當成 Git 已上傳。

## 已完成與可重用證據

| 範圍 | 已完成 | 證據與界線 |
| --- | --- | --- |
| 共用入口／bootstrap／導航 | 過期導航取消、依頁面載入、共用資源建置、Excel 按需載入及局部審核更新 | 累積各輪來源與測試保留；先前全入口表在 [第三輪](PERFORMANCE_500MS_ROUND3.md)／[第四輪](FINAL_OPTIMIZATION.md)，不可混成第五輪最終數字。 |
| 草稿與寫入成本 | 主資料基準比較、製程當次 context／BOM reader 重用、減少多餘 clone | 來源未變，沿用原相關回歸；不省略 CAS、權限、引用、快照或後端 ACK。 |
| 製程完整流程 | 開始、AB 選取／Apply、畫布同步、Save／讀回、C 查詢、Submit、本人 Withdraw、Return、Resubmit、Approve、原頁與歷史核對 | `c0a5…` 小資料五對共十輪 PASS；每輪 42 個邊界、18 個核對、14 個唯一寫入、零 page error。兩個合成管理帳號，不代表所有最小權限角色。 |
| 製程三選項離頁 | 最新輸入先 Apply／Sync 再 Save；本人可證明修改的放棄；Stay 保留輸入、focus、selection、scroll；未知結果先查收據 | `bf47…` 原生 20 案 PASS；含 rapid history、403／409、offline、inverse 回覆遺失、busy Save。最後審核提示微調後未重新跑這 20 案。 |
| IPQC-AB／C | 請求內資料查找重用、AB 收合詳細內容按需建立；C 維持唯讀語意 | 100／500 項測速為 `bf47…`，C 大清單首次讀取仍回退，未宣稱全部加速。 |
| 編輯器、導航、保存安全 | owner fence、持續 lease、舊回應／ABA／外部交錯拒絕、逆轉命令結果唯讀恢復 | ledger／transport／canvas／editor／navigation／authoring 相關回歸，詳 [主報告](PROCESS_PLATFORM_ROUND5.md)、[獨立審查](ROUND5_INDEPENDENT_REVIEW.md)。 |

## 版本不可混用

| 證據 | 完整 compiled server SHA256 | 適用範圍 |
| --- | --- | --- |
| 第五輪修改前 | `5edd4de1e1b00987f6aa4ee35ee4ada1cb8b19926e8a32befa69af4339b07f5d` | 第五輪共同 before；已包含更早輪成果，非最初 main 或最初貼上的流程資料表。 |
| 製程安全／大量資料候選 | `bf47a1aabc31a1ceb6ec541adb824e619e8d6cf25f01b9c687f90cecfe4d2589` | 三選項 20 案、100／500 項測速、profile。 |
| 最後審核提示微調候選 | `c0a5d14599fa5a9f6a2309dac43148201d248f7439a528300da5954d59b02e49` | 小資料完整五對／十輪；與交接產品來源對應。 |

產品來源 323 檔與最後 build manifest 逐檔一致。這些是當時未提交來源的 compiled hash，並非本次新 Git commit 的 SHA；公開提交沒有重新宣稱 100／500 項或原生 20 案在新 commit 重測。新 commit 的身分由 Git 歷史／遠端 HEAD 確認。

全部速度來自同工作機內隔離 Miniflare／D1／R2、合成資料、Chromium、loopback 無節流。非本機原站、既有 `process-os-test` 或正式業務資料。主內容、圖片、API 與程式工作量分列；純 SQL 時間未測。

## 未完成、退步與規則矛盾

- **原始全站任務未全部完成。** 其他主資料、品質、BOM、例行模組三選項 adapter 與逐模組完整生命週期仍待接入／驗證；不能用製程結果代替。
- **並非全站／所有按鈕均在 500 ms。** 第五輪 67 個操作與資料量組合，55 個修改後中位數不超過 500 ms，僅 40 個五次全部不超過 500 ms；完整表見 [ROUND5_SPEED](ROUND5_SPEED.md)。
- 500 項：C 首次讀取中位 682.4→768.2 ms（退步），最慢 1598.1 ms；C 重新讀取 646.7／1327.6 ms、IPQC Apply 607.9／1613.7 ms、儲存 478.1／756.6 ms、重新整理讀回 1057.8／1767.7 ms（後中位／最慢）。
- 100 項：重新整理讀回中位 1068.5→1435.3 ms（退步）；多個五次最慢樣本仍超標。
- 最後小資料：登入中位 1082.6→1165.0 ms、保存後重新整理 663.6→752.5 ms（均退步）；退回案件明細後中位 875.4 ms，最慢 **4203.4 ms**，未剔除。
- 優先改善 C 長清單畫面建立、啟動同步 layout、審核 fresh state／case 的慢請求及大 patch 寫入；不能移除必要權限／引用檢查或提前顯示成功。詳 [profile](ROUND5_PROFILE.md)。
- Apply／Sync 改共享 working，Save 建立整平台快照，Submit 使用最後 Save。放棄只逆轉本分頁可證明的本人修改，不能整份回復 Save 而撤掉他人內容。
- 同一方塊視窗的編輯分頁共用輸入，不逐頁提示；線別／類別與離開模組才由 guard 協調。這與原始「所有頁內分頁」字面要求的差異已明列，未擅自改成每頁 Apply。
- 部分錯誤仍可能顯示原代碼，需補共用中越文說明；保留原 error code／status／receipt 判斷。
- 舊 content-issues 比較有 34 組等價、3 組無關 tooling 損壞政策差異，維持 `UNRELATED_FAULT_POLICY_ACCEPTANCE_HOLD`，不是本輪新改也未獲政策確認。
- 真實站、大型實際照片、真實 IME、實體 iPhone／Safari、長時數記憶體／監聽器、所有最小權限角色、真實撤權與登入失效未完整驗收。合成管理帳號／故障注入不替代這些驗收。

## 最後驗證與原始檔保存

| 檢查 | 狀態 |
| --- | --- |
| 原 135 檔完整性、必要新增 import、323 產品來源對應 | PASS，最後公開交接只改說明文件，沿用既有產品證據。 |
| lint、TypeScript、最終 build、相關回歸 | REUSED PASS，原紀錄及來源 hash 未失效；未無差別重跑瀏覽器測速。 |
| 公開提交檔案與敏感內容掃描 | PASS，104 個原必要來源／文件已依既有 source policy 掃描，另核對本交接文件及最終 staged tree。 |
| 乾淨 standalone checkout 初始化 | PASS，本次從原基準獨立 clone、套用完整公開來源，正常 `npm ci --no-audit --no-fund` 安裝 580 套件；沒有跳過 postinstall，main push 防護正常安裝。 |
| 乾淨副本檢查 | PASS：lint、TypeScript noEmit、build 及 post-build auth check；build helper／owned ledger／navigation departure 四檔共 40 tests PASS。沒有重跑五組測速，也不混入原速度表。 |
| 完整來源歷史掃描 | PASS：257 commits、2778 unique blobs、1553 working source files；24 個已核對的既有歷史分類仍依原政策，無新增豁免。 |
| 原始失敗批次 | 保留 FAIL：Miniflare bridge assertion／fetch failed 與測試假設錯誤；完整重跑批次另存，沒有拼接成功樣本。 |
| 正式環境／部署驗收 | NOT_RUN，本次不部署。 |

本次乾淨副本 build 使用真實基準 SHA 加完整未提交候選來源；不是新 commit 的測速重跑。前述產品來源 hash 保持一致，最終 Git commit 僅固定這些來源與公開說明。四個既有文件斷鏈原本已在基準（CHANGELOG／PROCESS 的舊 button coverage、RUNTIME 的備份／員工文件相對路徑），本次未新增，不將其標為本輪已修復。

公開檔案只有文字結論與可重現測試。31 份原始 JSON／JSONL 留在 `docs/acceptance/performance-draft-20261030/`；第五輪原始結果、截圖與 logs 留在 `.sites-runtime/process-platform-round5/`。原完整交接包 `/workspace/dot-handoff-process-platform-round5-20261030.tar.gz` 與修改前備份保留在工作區，不加入 Git。Markdown 中這些路徑是本機證據位置，不是可由 GitHub 下載的附件；需要時由 dot 透過授權工作區取得。

## dot 整合次序

1. 以此分支與基準 SHA 做 diff，先核對最新 main、#51、#52 及其他任務；本次沒有替 dot 合併。
2. 成組整合 ledger／revert、canvas／editor／authoring、navigation 與 bootstrap／index；prepared master optional API 與 caller 同批。共用入口與 AB／C、線別工段、權限、小幫手、流程資料重疊須語意合併，勿以整檔覆蓋。
3. 重用未受影響證據，重跑真正衝突或相依被改動的測試。必要命令與前後 build 隔離方式見 [主報告重現步驟](PROCESS_PLATFORM_ROUND5.md#dot-交接與重現)。
4. 補未完成模組與超標項目；驗收後再依使用者授權建立 PR／發布。此分支可交接，不等於可直接部署。

## 改動檔案清單

以下為相對原基準的公開交接檔案；未包含留在本機的產生資料。

### 產品／建置來源（28）

- `app/api/master/references/route.ts`
- `app/api/process-ipqc/route.ts`
- `lib/master-workflow.ts`
- `lib/process-authoring-workflow.ts`
- `lib/process-ipqc.ts`
- `lib/process-scripts-build.mjs`
- `lib/process-styles-build.mjs`
- `public/process/app.js`
- `public/process/bom-excel.js`
- `public/process/bom-workspace.js`
- `public/process/bootstrap.js`
- `public/process/canvas-local.js`
- `public/process/delivery-navigation.js`
- `public/process/editor-line-selection.js`
- `public/process/fqc-excel.js`
- `public/process/index.html`
- `public/process/master-admin-ui.js`
- `public/process/master-data.js`
- `public/process/master-review.js`
- `public/process/master-shared-client.js`
- `public/process/navigation-lifecycle.mjs`
- `public/process/owned-draft-ledger.mjs`
- `public/process/owned-draft-revert.mjs`
- `public/process/process-authoring-v3.js`
- `public/process/process-editor.js`
- `public/process/process-ipqc.js`
- `public/process/spreadsheet-loader.js`
- `vite.config.ts`

### 測試與重現腳本（50）

- `scripts/task-handler-timing-20261030.cjs`
- `scripts/test-authoring-contentissues-cache.cjs`
- `scripts/test-authoring-context-reuse.cjs`
- `scripts/test-authoring-ipqc-read-reuse.cjs`
- `scripts/test-master-baseline-equality.cjs`
- `scripts/test-master-prepared-model.cjs`
- `scripts/test-master-references-prepared.cjs`
- `scripts/test-process-ipqc-c-query.cjs`
- `scripts/test-process-ipqc-choice-dom.cjs`
- `scripts/test-process-ipqc-choice-read.cjs`
- `scripts/test-process-review-current.mjs`
- `tests/authoring-begin-readiness.test.mjs`
- `tests/authoring-departure.test.mjs`
- `tests/authoring-readiness-render.test.mjs`
- `tests/authoring-review-status.test.mjs`
- `tests/canvas-departure.test.mjs`
- `tests/delivery-departure.test.mjs`
- `tests/editor-selection-departure.test.mjs`
- `tests/entry-500ms-performance.mjs`
- `tests/final-entry-performance.mjs`
- `tests/final-photo-performance-paired.mjs`
- `tests/final-process-performance-browser.test.mjs`
- `tests/final-process-performance-paired.mjs`
- `tests/integrated-bootstrap-client.test.mjs`
- `tests/master-review-render-performance.test.mjs`
- `tests/master-shared-clone.test.mjs`
- `tests/navigation-adapters.test.mjs`
- `tests/navigation-departure.test.mjs`
- `tests/navigation-lifecycle.test.mjs`
- `tests/owned-draft-ledger.test.mjs`
- `tests/owned-draft-recovery-transport.test.mjs`
- `tests/owned-draft-revert.test.mjs`
- `tests/process-editor-departure.test.mjs`
- `tests/process-platform-round5-c-dom-probe.mjs`
- `tests/process-platform-round5-departure-browser.mjs`
- `tests/process-platform-round5-fixture.mjs`
- `tests/process-platform-round5-paired.mjs`
- `tests/process-platform-round5-profile.mjs`
- `tests/process-platform-round5-readback-equivalence.mjs`
- `tests/process-platform-round5-scenario.mjs`
- `tests/process-reference-timing-browser.test.mjs`
- `tests/process-scripts-build.test.mjs`
- `tests/process-styles-build.test.mjs`
- `tests/root-entry-native-fixture.mjs`
- `tests/shell-styles-browser.test.mjs`
- `tests/site-timing-audit-20261030.mjs`
- `tests/spreadsheet-lazy-browser.test.mjs`
- `tests/spreadsheet-loader.test.mjs`
- `tests/task-feedback-timing-20261030.mjs`
- `tests/task-photo-timing-20261030.mjs`

### 規則與交接文件（27）

- `AI_CONTEXT/CHANGELOG.md`
- `AI_CONTEXT/modules/PROCESS.md`
- `AI_CONTEXT/modules/RUNTIME.md`
- `HANDOFF.md`
- `docs/acceptance/performance-draft-20261030/DOT_GITHUB_HANDOFF.md`
- `docs/acceptance/performance-draft-20261030/FINAL_CHECKS.md`
- `docs/acceptance/performance-draft-20261030/FINAL_CODE_REVIEW.md`
- `docs/acceptance/performance-draft-20261030/FINAL_CONTRADICTIONS.md`
- `docs/acceptance/performance-draft-20261030/FINAL_OPTIMIZATION.md`
- `docs/acceptance/performance-draft-20261030/PERFORMANCE_500MS.md`
- `docs/acceptance/performance-draft-20261030/PERFORMANCE_500MS_ROUND3.md`
- `docs/acceptance/performance-draft-20261030/PROCESS_PLATFORM_ROUND5.md`
- `docs/acceptance/performance-draft-20261030/README.md`
- `docs/acceptance/performance-draft-20261030/REVIEW_ROUND3.md`
- `docs/acceptance/performance-draft-20261030/ROUND3_CHECKS.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_AUTHORING.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_INDEPENDENT_REVIEW.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_IPQC.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_PROFILE.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_READBACK_FIXTURE.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_REVIEW.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_RULES_AND_REMAINING.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_SPEED.md`
- `docs/acceptance/performance-draft-20261030/ROUND5_SPEED_STAGE_A.md`
- `docs/specs/current/IPQC_POLICY.md`
- `docs/specs/current/SHARED_DRAFT.md`
- `docs/specs/current/WHOLE_MODULE_DRAFT.md`
