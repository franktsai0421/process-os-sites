# 最後一輪驗證與重現

適用版本：HEAD `ca6647977a8680038444ce2c1ba4e80f2343cd0a` 加本輪完整工作差異；after Worker `5edd4de1e1b00987f6aa4ee35ee4ada1cb8b19926e8a32befa69af4339b07f5d`。所有測試使用隔離合成資料；沒有真站、正式帳號或正式附件寫入。

| 檢查 | 結果 | 證據／限制 |
|---|---|---|
| 完整 build＋既有 auth boundary audit | PASS | final-build.log，exit0；沒有發布 |
| TypeScript | PASS | final-tsc.log，exit0 |
| 全專案 lint | PASS | final-lint-last-confirmed.log，exit0；第一次發現新測試13個floating test registration，補void後重跑；未改斷言 |
| 共用bootstrap／資產token／clone／revert | PASS | final-root-unit.log；4測試檔 |
| authoring readiness | PASS | 27案；既有poll5、begin/recovery22亦通過；首次read後互動延遲paint跨retry仍不假ready |
| master clone 前後等價 | PASS | 6組含8actions×3scope、Begin/flush表單競態、unknown/busy／409/503；另既有client3、guards29 |
| master正式基準等價／資料毀損 | PASS | final-master-equality.json；38案例，legacy／prepared、順序、型別、衝突及SHA失敗拒絕 |
| AB/C/PROCESS真handler生命週期 | PASS | final-master-cycles.json；保存／固定送審／撤回／退回／再送審／核准、CAS、撤權、收據、150備份保留 |
| 本人撤銷規劃器安全 | PASS | 26案；舊程式同組10案失敗，原失敗保留；規劃器未接UI |
| 完整Worker 25頁入口五對 | PASS功能 | 510筆、零pageerror；速度未全達500ms，回退與環境波動保留 |
| PROCESS完整原生UI五對 | PASS功能 | 26種操作、280筆；reload每版15，其餘每版5；明細及audit實際展開、圖片另計 |
| 同程式五對對照 | PASS驗證；有明顯波動 | 50筆，兩邊server/HTML相同hash；不可將所有before/after差異歸因程式 |
| 編輯台選產品／C工段／A畫布／搜尋，四審核分區，系統切換 | PASS | navigation.json，55筆、每操作5次、零pageerror；是當前版補驗，沒有paired before |
| 受影響大圖保存／讀回 | PASS功能 | photos.json，PROCESS範本／設備／編輯台3案例；尺寸及像素／原檔一致。此批起始與lint重疊，不當速度基準 |
| 大圖HTTP五對補測 | PASS功能，性能有回退 | final-photo-results.json；20照片入口案例；相同資料、前後各5次、獨立於其他工作；HTTP表另列 |
| compiled delivery browser | PASS | delivery-browser.json：13資料頁＋11主入口、連點、pop/click、撤權、IQC保存讀回、lost ACK先查單筆receipt、不盲重送；403為預期拒寫 |
| 短期資源計數 | PASS有限範圍 | 4輪往返listeners103→103、intervals5→5；未量peak heap，不是長壓無洩漏證明 |
| 雙語桌面／390px版面 | PASS | styles/styles-browser.json，16案例的計算樣式／位置一致；非實體手機 |
| 獨立程式碼審查 | 完成限定範圍 | FINAL_CODE_REVIEW.md；未發現剩餘具體新增回歸，審查者未跑基準 |
| 舊test-master-workflow-v3.cjs | 既有FAIL未修 | 登入fixture缺DB.batch先回503，未到master handler；不以此拒絕補記為PASS |
| 三選項UI、全部模組完整UI審核／故障、慢網路、長壓、正式站／資料 | 未完成／未測 | 不能由本輪入口、PROCESS與handler通過補算 |

重現須使用正常 standalone checkout 的既有 lockfile 依賴，保持協作防護。此工作機的 linked checkout postinstall 保護未停用；不宣稱已完整重新 npm ci。

1. 從基準套用交接中 `before-final/changes.patch`，以實際 commit 標記 build，將整個 dist 保存為獨立目錄。原工作機 before 完整編譯位於 `/workspace/perf-final-round-backup/dist`。
2. 在同一份前版工作基礎套用 `final-iteration.patch`，或另從基準套用最終 `changes.patch`。不能把最終累積patch盲目套在已套過前版的工作樹。
3. 執行 lint、型別、build，再依序量測；不要並行跑性能測試、build、lint或其他重型工作。公開交接不含server編譯物、DB／R2或憑證。

```bash
npm run lint -- --format unix
npx tsc --noEmit
PROCESS_PROGRAM_COMMIT=<實際SHA> npm run build
node --test tests/integrated-bootstrap-client.test.mjs tests/navigation-adapters.test.mjs tests/master-shared-clone.test.mjs tests/owned-draft-revert.test.mjs tests/authoring-readiness-render.test.mjs
MASTER_EQUALITY_BASELINE=/path/to/master-workflow-before-equality.ts MASTER_EQUALITY_BENCHMARK=1 node scripts/test-master-baseline-equality.cjs
PERF_BASELINE_BUILD=/path/to/before/dist PROCESS_PROGRAM_COMMIT=<實際SHA> node tests/final-entry-performance.mjs
PERF_BASELINE_BUILD=/path/to/before/dist PROCESS_PROGRAM_COMMIT=<實際SHA> node tests/final-process-performance-paired.mjs
PERF_BASELINE_BUILD=/path/to/before/dist PERF_CANDIDATE_BUILD=/path/to/before/dist PERF_DESTINATIONS=dashboard,editor PERF_OUTPUT=.sites-runtime/perf-final/identical-build-control.json PROCESS_PROGRAM_COMMIT=<實際SHA> node tests/final-entry-performance.mjs
PERF_BASELINE_BUILD=/path/to/before/dist PROCESS_PROGRAM_COMMIT=<實際SHA> node tests/final-photo-performance-paired.mjs
TIMING_SECTION=navigation TIMING_OUTPUT=.sites-runtime/perf-final/navigation.json PROCESS_PROGRAM_COMMIT=<實際SHA> node tests/site-timing-audit-20261030.mjs
PHOTO_ENTRIES=process-template,process-equipment,process-authoring PHOTO_TIMING_OUTPUT=.sites-runtime/perf-final/photos.json PROCESS_PROGRAM_COMMIT=<實際SHA> node tests/task-photo-timing-20261030.mjs
PERF_BASELINE_ASSETS=/path/to/before/dist/client/process STYLES_OUTPUT=.sites-runtime/perf-final/styles PROCESS_PROGRAM_COMMIT=<實際SHA> node tests/shell-styles-browser.test.mjs
PROCESS_PROGRAM_COMMIT=<實際SHA> node .sites-runtime/delivery-browser-runner.mjs
git diff --check
```

實際命令請將 `<實際SHA>` 換成40位SHA；新環境先建立 `.sites-runtime/perf-final`。delivery launcher 已放交接證據（只指定系統Chromium、no-sandbox與原測試入口，不改產品權限）。其餘既有詳細重現見 [第三輪檢查](ROUND3_CHECKS.md)。測試數字只在相同版本、資料、完成點及網路／cache條件下比較。
