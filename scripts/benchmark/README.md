# 流程資料測速／預覽驗證補件

由 2026-10-29 本機五個編排／統計／smoke 腳本整理而來。只有工具與工具回歸，不重新提交已合併的流程或照片功能，也不包含圖片、trace、測試資料庫或附件。

|工具|範圍|
|---|---|
|run-entry-comparison.py|同一個已建置隔離 checkout，交替使用指定 Git 版本的入口 HTML；完成或一般例外後恢復原編譯 index|
|summarize-entry.py|計算首次進頁的分段中位數、最大值及全部數值樣本|
|run-final-performance.py|在兩個指定隔離 checkout 交替跑既有完整流程瀏覽器測試|
|summarize-final-performance.py|分開呈現成功操作速度、失敗耗時及 HTTP 時間|
|preview-smoke.mjs|檢查本機隔離預覽登入、組成標示、照片解碼／放大、設備與退回／撤回歷史|

`benchmark_support.py` 提供共用的輸入驗證、輸出白名單、鎖及子程序清理。Python 3.10+，Node 與 Playwright 依 repository 的版本；測速委派的既有測試本體仍需其既有 Chromium／原生隔離 D1/R2 環境。本補件不重寫這些依賴，也不自動建置、登入外部網站或部署。

## 輸出與安全界線

- 不內嵌帳密、站台網址、特定 commit 或工作機絕對路徑。預覽登入設定只從 stdin 讀取，不放 CLI 參數或輸出。
- 輸出目錄必須不存在；統計 JSON 使用 exclusive-create，既有檔案／符號連結一律拒絕覆寫。不改寫 docs、歷史結果或原圖；僅使用明確指定的測量 checkout 與新輸出位置。
- 統計輸出只採允許的數字、操作名稱、API 路徑與雜湊；不複製原始 URL/query、request body、錯誤字串、畫面文字、照片或 trace。`PROFILE_TRACE` 不會傳給子測試。
- 既有完整流程測試會在指定 checkout 的 `.sites-runtime/` 產生新的本機截圖／原始診斷；runner 不將它們放進統計 JSON，也不 git add 或發布。它們仍須當作待審查的本機產物。
- 原版測試以 `MEASUREMENT_PHASE=baseline` 才會繼續執行失敗步驟。若已有 `process-master-baseline*` 檔案，runner 拒絕執行；使用新的測量 checkout。每輪新產物移入新輸出目錄的 `private-baseline-N/`，不碰舊資料。候選版使用唯一 phase。
- 同一 checkout 用 exclusive lock 避免兩個工具同時量測。entry 工具暫時改動 **編譯輸出** `dist/client/process/index.html`，不改來源；不要同時建置、啟動供他人使用的預覽或跑其他 browser/lint。失敗／SIGTERM／Ctrl-C 會清理自建子程序並恢復 index；偵測到外部改動時停止覆寫，保留 `index-original.html` 供人工核對恢復。SIGKILL／斷電無法保證執行 finally，不能假稱可自動恢復。
- `--build-commit` 等參數是呼叫者確認的建置來源。工具確認該 Git commit 存在，記錄伺服器及測試腳本 SHA-256；它不能僅憑參數證明磁碟 build 必然對應該 SHA。請使用已確認的建置紀錄。
- 所有輸出只留在本機，不自動上傳。兩張銘牌圖及舊 entry-trace.json 保持待安全附件交付，本補件不納入。

## 重算已交付數據（不啟動瀏覽器）

先建立本機忽略的 `.sites-runtime` 目錄。下列輸出檔若存在，請選新的名稱，不刪除或覆蓋歷史檔。

```sh
python scripts/benchmark/summarize-entry.py --archive docs/sites/PROCESS_ENTRY_PROFILE_29102026_RESULTS.json --output .sites-runtime/entry-summary-new.json
python scripts/benchmark/summarize-final-performance.py --archive docs/sites/PROCESS_FLOW_FINAL_PERFORMANCE_29102026_RESULTS.json --output .sites-runtime/workflow-summary-new.json
```

也可使用 `--input-dir` 讀 runner 產生的 `1-before.json`／`1-after.json` 或 `1-baseline.json`／`1-final.json`，兩邊輪次必須完整配對。輸出不附帶先前 PASS、lint、照片驗收等無法從數據證明的敘述。FAIL 不計入「完成速度」；沒有成功樣本時 median/max 是 null。

## 執行新測量

下列大寫字是參數佔位，須替換為確認過的 checkout、Git ref、實際 build SHA 和全新輸出目錄。目錄的父層必須已存在。

```sh
python scripts/benchmark/run-entry-comparison.py --root CHECKOUT --baseline-ref BEFORE_REF --candidate-ref AFTER_REF --build-commit BUILT_SHA --output-dir NEW_OUTPUT_DIR --rounds 5
python scripts/benchmark/run-final-performance.py --baseline-root BASE_CHECKOUT --baseline-commit BASE_BUILD_SHA --candidate-root CANDIDATE_CHECKOUT --candidate-commit CANDIDATE_BUILD_SHA --output-dir NEW_OUTPUT_DIR --rounds 3
```

Entry 是 **index-only A/B**，不能稱完整版本 A/B；其他 JS/CSS 和伺服器保持不變。Workflow 是兩個明確 checkout 的完整流程比較。舊基準若沒有既有測試檔，可用 `--baseline-script` 指向該 checkout 內經核對的測試適配副本；工具不自動拷貝或修改舊版 source。`--node` 可指定 Node 執行檔，`--timeout` 是單輪秒數。

失敗只輸出固定診斷代碼，不把子程序錯誤與敏感原文列到終端。候選任一步失敗即停止；基準可保留 FAIL，摘要必須另列。此為合成資料測量，不代表既有站台速度。

## 預覽 smoke

stdin JSON 欄位：`origin`、`isolationConfirmed:true`、`account`、`password`、`expectedTitle`、`expectedComposition`、`equipmentCount`、`photoWidth`。不要把實際 JSON 存入受追蹤目錄；可由本機 fixture 啟動器以 pipe 傳入。

```sh
node scripts/benchmark/preview-smoke.mjs --help
node scripts/benchmark/preview-smoke.mjs < PRIVATE_LOCAL_CONFIG
```

必要時以 `--browser-path BROWSER_EXECUTABLE` 指定已安裝瀏覽器，預設使用 Playwright 管理的 Chromium。只接受有明確 port 的 HTTP loopback origin；拒絕外部站、URL 帳密、路徑、query。先確認隔離標示才送登入；不產生 screenshot／trace。這個工具針對帶有兩種審核歷史及照片的專用 preview fixture，普通空白合成資料庫不會通過。

工具檢查：`python -m unittest discover -s scripts/benchmark -p 'test_*.py'` 及 `node --test tests/benchmark-preview-smoke.test.mjs`。這些只驗證補件工具，不能代替當前 main 的完整產品驗收。

## 本次補件核對

補件基準：`ca6647977a8680038444ce2c1ba4e80f2343cd0a`（建立分支時的 GitHub main）。原流程／照片功能已合併，本補件不包含那些功能的重送。

- Python 工具回歸 13 項通過：數據重算、敏感欄位排除、版本／配對拒絕、既有檔案保護、成功／失敗／逾時／SIGTERM 的 index 恢復、競爭鎖、外部修改保留及基準失敗分列。
- Node 設定／敏感輸出回歸 2 項通過；變更的 JavaScript lint 與語法檢查通過。
- 兩個 summary CLI 以既有已提交 RESULTS 重算成功：首次進頁中位仍為 708／658ms、最慢 759／927ms；基準搜尋失敗不列入成功速度。這不是新一輪效能量測。
- 新 smoke 在既有隔離合成預覽實際通過，含登入、版本、照片解碼／放大、40 設備、退回／撤回歷史；沒有產生 screenshot 或 trace。
- 完整測速編排的錯誤／中斷與資料保留，以工具級假執行器回歸驗證；本輪沒有重跑整套產品測速、產品 build 或 live-site 驗收。
- 兩張銘牌截圖與舊 trace 的 SHA-256 與盤點時一致，原地保留；沒有複製到補件目錄。

無資料模型、產品程式、權限或部署變更。待 dot 審查此補件分支後決定整合。
