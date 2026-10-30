# 第三輪驗證與 dot 重現

本文件的 PASS 僅適用標示的隔離場景。程式版本／資料與計時邊界見 [完整報告](PERFORMANCE_500MS_ROUND3.md)。最新本機 commit 仍為基準 ca6647977a8680038444ce2c1ba4e80f2343cd0a，所有修改未提交。

| 檢查 | 狀態 | 證據與限制 |
|---|---|---|
| 51 項入口，每版五次 | PASS | round3-entry-results.json，510 筆、零 pageerror；速度達標另表 |
| 15 個原生照片入口 | PASS | round3-photo-results.json；像素／檔案、尺寸、保存讀回；非五對效能 |
| compiled delivery browser | PASS | round3-evidence/delivery-browser.json；13 資料頁＋11 主入口、連點、pop/click、撤權、IQC 員工保存讀回、ACK 遺失 receipt GET-only；403 為預期拒寫 |
| 短期資源檢查 | PASS（有限） | 四輪往返 global listeners 103→103、intervals 5→5；不是長時間記憶體驗收 |
| Excel 初版原生下載測試 | PASS | spreadsheet-initial.json；延遲／連點／失敗重試／等待中切頁，非 BOM 停用入口不適用 |
| Excel 加入原生選檔補驗 | PASS | round3-spreadsheet-browser.json；10項案例、選檔失敗重試／無提前Apply寫入／原取消匯入 |
| 中文桌面／越文390px前後樣式 | PASS | styles-browser.json，16案例；計算樣式／位置一致；另檢視桌面編輯台與手機權限頁截圖，非實體手機 |
| 既有 process-entry-layout browser | PASS | 4案例：雙語桌面／手機延遲gate、套用保存讀回切頁、失敗重試、匿名與無權身分 |
| loader、bootstrap、bundler、navigation adapters | PASS | round3-unit.log，5 個測試檔；loader 6 組、bootstrap 9 組 |
| 審核 render 等價性 | PASS | 4 組；原生 Array.find 計時與工作量計數分離 |
| unified master review 既有回歸 | PASS | 26 composition＋14 scheduler；不等同全 UI 審核 |
| 最終引用 GET／設備編輯原生五次 | PASS | round3-reference-browser.json；可編輯152／189ms、引用完成177／194ms、GET75／83ms |
| references GET model | PASS | round3-references-prepared.json；13 等價／安全／故障案例；兩資料量各五對 |
| PROCESS prepared model | PASS | 完整儲存、active/saves/cases/收據等價、replay無重寫、引用刪除409且無持久變更 |
| PROCESS/AB/C handler完整生命週期 | PASS | Begin/Apply/Save/Read/Submit/Withdraw/Return/Resubmit/Approve、快照、連點競態、越權、撤權、150備份保留 |
| 舊 test-master-workflow-v3.cjs | FAIL（既有fixture） | 登入先得503，fixture缺DB.batch；未到master handler；未放寬斷言 |
| 最終完整建置＋auth boundary audit | PASS | round3-build-late.log；包含最後引用 GET 改動，exit0且postbuild auth audit通過 |
| 最終 lint／TypeScript | PASS | 新測試兩個 unused 變數已修正後重跑 lint 通過；TypeScript exit0；不是未修問題 |
| 獨立程式碼審查 | 完成限定範圍 | REVIEW_ROUND3.md；審查者未執行測試；晚期引用GET另審 |
| 正式站、正式資料、三選項UI、每模組全流程UI、慢網路／斷線全矩陣、長時間壓力 | 未測／未完成 | 不以handler與入口測試代替 |

重現命令（在正常 standalone checkout 安裝現有 lockfile 依賴；不可停用現有協作保護）：

```bash
npm run lint -- --format unix
npx tsc --noEmit
PROCESS_PROGRAM_COMMIT=ca6647977a8680038444ce2c1ba4e80f2343cd0a npm run build
node --test tests/integrated-bootstrap-client.test.mjs tests/navigation-adapters.test.mjs tests/process-scripts-build.test.mjs tests/process-styles-build.test.mjs tests/spreadsheet-loader.test.mjs
node tests/master-review-render-performance.test.mjs
node scripts/test-unified-master-review.cjs
MASTER_BASELINE=/path/to/round3-evidence/master-workflow-before.ts node scripts/test-master-prepared-model.cjs
REFERENCES_BASELINE=/path/to/round3-evidence/master-references-before.ts node scripts/test-master-references-prepared.cjs
PROCESS_PROGRAM_COMMIT=ca6647977a8680038444ce2c1ba4e80f2343cd0a node tests/spreadsheet-lazy-browser.test.mjs
PERF_BASELINE_ASSETS=/path/to/baseline-process PERF_OUTPUT=.sites-runtime/perf500-round3/paired-entry.json PROCESS_PROGRAM_COMMIT=ca6647977a8680038444ce2c1ba4e80f2343cd0a node tests/entry-500ms-performance.mjs
PERF_BASELINE_ASSETS=/path/to/baseline-process STYLES_OUTPUT=.sites-runtime/perf500-round3/styles PROCESS_PROGRAM_COMMIT=ca6647977a8680038444ce2c1ba4e80f2343cd0a node tests/shell-styles-browser.test.mjs
PHOTO_ENTRIES=fqc,iqc-part,iqc-item,ipqc-ab,ipqc-c,equipment,equipment-hierarchy,equipment-new,tooling,routine-report,routine-disposal,feedback,process-template,process-equipment,process-authoring PHOTO_TIMING_OUTPUT=.sites-runtime/perf500-round3/photo.json PROCESS_PROGRAM_COMMIT=ca6647977a8680038444ce2c1ba4e80f2343cd0a node tests/task-photo-timing-20261030.mjs
PROCESS_PROGRAM_COMMIT=ca6647977a8680038444ce2c1ba4e80f2343cd0a node tests/process-entry-layout-browser.test.mjs
PROCESS_PROGRAM_COMMIT=ca6647977a8680038444ce2c1ba4e80f2343cd0a node tests/process-reference-timing-browser.test.mjs
```

`baseline-process` 來自交接的 baseline-process.tar.gz。先建立輸出目錄。不要平行執行測速、build 或其他重型工作。Playwright 使用系統 `/usr/bin/chromium`，此隔離工作機以 `--no-sandbox` 啟動；不是關閉產品網站的權限檢查。

delivery browser 原測試預設 channel 不在本機；用下列一般 `.mjs` launcher（交接已附）呼叫，避免更動原斷言：

```js
import {chromium} from 'playwright';
const launch=chromium.launch.bind(chromium);
chromium.launch=options=>launch({...options,channel:undefined,executablePath:'/usr/bin/chromium',args:[...(options.args||[]),'--no-sandbox']});
await import('../tests/sites-delivery-browser.test.mjs');
```

launcher 放在專案 `.sites-runtime/`，以 `PROCESS_PROGRAM_COMMIT=<整合後實際SHA> node .sites-runtime/delivery-browser-runner.mjs` 執行。整合後版本需改用實際 SHA，連同新 manifest 記錄；不能沿用本文件 SHA 冒充整合後程式版本。

最終 `git diff --check` 通過。新增 references 原生測試另通過 node --check 與 oxlint；原功能斷言未刪除。交接包驗證結果記錄於外部 manifest／packaging-result.json，完整來源差異包含既有工作。
