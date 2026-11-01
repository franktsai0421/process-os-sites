# 登入專項候選：樣式負擔與三段量測

範圍是獨立登入 Draft PR。基準為 GitHub main
`268a8e49ec751bb6849033e20a27d30194aad67c`（tree
`2285d85d1a74e5b10ca575b5fe4505863d33f51f`），保留完整歷史。
沒有合併、部署、連接舊中控系統、員工登入或持久資料／帳號變更。
最終 head、檢查與最新量測收據以此 PR 的版本化結果為準。

## 原因與修改界線

`/login` 的頁面與 import proxy 不讀 D1/R2，也不執行密碼雜湊。
已有實站匿名 HTTP 五次完整回應中位 2835.33 ms、最大 7388.59 ms；
headers 中位 2833.95 ms、headers 後 body 中位 1.38 ms。這是上游交接
的 HTTP 證據，不是本任務瀏覽器量測，冷暖未知。下面的 CSS 縮減**沒有
解釋或解決這段 TTFB**，也不能將其歸因資料庫。

現行 Tailwind 自動掃描整個 repo，將未被任何 React route 引用的
`components/ui` 樣板 utilities 也放入登入頁。`app/globals.css` 改為
`source('./')`，只掃描 routed React source；theme、base、動畫、shadcn
import 及 `login.css` 保留。未延遲 stylesheet 或調換載入順序。
未來 React route 引入外部 component 時，須在此 stylesheet 明確註冊
該 component 的 `@source`。獨立 `public/process` SPA 維持自己的樣式。

原版實際 build 的全域 CSS 為 198,279 bytes，候選為 10,190 bytes；
登入專用 CSS 同為 1,882 bytes。這是未壓縮產物大小，與下表的瀏覽器
response-body bytes 分開。只排除 docs/tests 的試算約省 1.6 KB，並非
主要來源；本修正針對未使用的 UI 樣板。

POST 已批次更新兩個登入限流計數，且只讀四個 auth keys。沒有修改
登入 API、scrypt `N32768/r8/p3`、same-origin、有界輸入、限流、密碼、
cookie、session、authEpoch、撤權、角色、bootstrap identity fences。

## 第一組完整本機五次前後證據

Linux、Node 24.19.0、Chromium 154.0.8037.57、compiled Miniflare，
非持久 synthetic D1/R2。每個版本一個新 Worker，五次新 context，
1365×900、無 throttling，routing 關閉 HTTP cache／外連；第一輪保留，
不是五次冷啟動。先整組 baseline，再整組 candidate；沒有同步建置或
其他測試。系統／OS cache 與批次順序仍可能影響時間。

每輪使用正式 `passwordHash` 產生的隨機 synthetic 密碼及隨機 signer，
真正表單 POST 建立 cookie，沒有預簽 session。三段用同一 Node driver
clock，POST 200 headers 是第二、三段共同邊界，互不重疊：

1. goto `/login` 前，至兩次系統切換實際改變狀態、恢復製程入口。
2. driver 點登入前，至登入 POST 200 headers。
3. 同一 headers 時點，至新頁正確身份／dashboard／ready generation、
   無 boot/retry/alert、非空內容、兩個 frame，且帳號選單確實可點開。

| 階段 | 原版五次 ms | 候選五次 ms | 原版 median / max | 候選 median / max |
|---|---|---|---|---|
| 登入頁可操作 | 481.45, 351.33, 377.88, 352.43, 336.46 | 646.21, 388.37, 325.21, 323.74, 346.79 | 352.43 / 481.45 | 346.79 / 646.21 |
| 送出到登入成功 | 330.25, 355.77, 302.97, 297.64, 299.53 | 320.68, 315.65, 305.57, 307.36, 311.38 | 302.97 / 355.77 | 311.38 / 320.68 |
| 導向首頁可操作 | 485.90, 435.19, 404.75, 427.18, 411.17 | 458.15, 399.51, 410.47, 494.64, 405.27 | 427.18 / 485.90 | 410.47 / 494.64 |

| 階段 | 原版 / 候選請求數（每輪） | 原版 / 候選 response-body bytes（每輪） | 正確狀態 |
|---|---|---|---|
| 登入頁 | 8 / 8 | 153,260 / 126,860 | 兩邊 5/5 |
| 登入 POST | 1 / 1 | 未知 / 未知 | 兩邊 5/5 HTTP 200，正常 cookie |
| 首頁 | 17 / 17 | 829,482 / 829,482 | 兩邊 5/5 身分、destination、操作通過 |

時間沒有一致改善：第一段 max 變慢，第二段 median 變慢，第三段 max
也變慢。確認的收益是減少 CSS／response body 負擔，**不是三段延遲
已修好**。後兩段未改動，只是對照；不得將波動當作優化成果。

第一組 build entry SHA-256：

- baseline `80ccc290e032264547d3e35ad53049ab795375815b274adc2bdfafb0d6b14d0c`
- candidate `6475aafba8218625f32871ed949572e620915c4a7056e947ecc07ee7a0d76add`

這是固定原版與候選產品 bytes 的初次量測，當時候選尚未 commit。
最終 commit 另跑必要檢查與量測，結果記在 PR，不能將此 build stamp
誤稱為最終 commit 的 build。

## 量測工具與回歸

`tests/login-performance-browser.test.mjs` 記錄每個 request 的開始階段，
只歸屬一次；bytes 是最終可觀察的 response body，不是 stage 結束前
傳輸量，也不包含全部 headers。頁面成功後立刻導航可能丟棄舊 POST
body，Playwright body/sizes 沒有內建 timeout；初版量測曾在此等待，
已修正為有界 metadata 收集，缺值用 null，不能當零或假造 bytes。
登入正確性由新文件的權威 bootstrap 證明。

工具另在瀏覽器五輪之後，以五個獨立 compiled HTTP POST 消耗完整
response，回報 decoded bytes；此補件不代填瀏覽器缺值、不混入三段
時間。外連／未預期寫入拒絕，synthetic 業務內容必須維持原值。

登入桌面五輪與 390×844 viewport 的 computed style／bounds 已比對
相同，觸控焦點、切換與無橫向溢位通過；不是實體手機驗收。
`tests/login-style-scope-browser.test.mjs` 比較三個其他 React setup
入口的桌面／手機全可見元素，並逐 byte 核對整個 compiled process
SPA（含 CSS、腳本、HTML 載入順序）。配對與 candidate-only CI smoke
結果分開。授權後的 upload/maintenance 表單分支沒有操作或驗收。
初次配對的 12 次唯讀渲染、6 組全部可見元素比較與整個 process SPA
bytes／相對路徑核對均 PASS；未建立任何業務或憑證紀錄。

CI 接上 hashed-password 五輪登入與其他入口唯讀 smoke。必要命令：

```sh
npm run lint -- --format unix
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/sites-ci-preflight.mjs
PROCESS_PROGRAM_COMMIT=<actual-head> npm run build
PROCESS_PROGRAM_COMMIT=<actual-head> node tests/login-performance-browser.test.mjs
PROCESS_PROGRAM_COMMIT=<actual-head> PROCESS_LOGIN_STYLE_MODE=smoke node tests/login-style-scope-browser.test.mjs
node --experimental-vm-modules tests/sites-security.test.mjs
node --test tests/login-intent.test.mjs tests/login-destination.test.mjs
node scripts/test-login-entry-marker.cjs
node scripts/test-login-initial-state.mjs
```

資料模型、schema、dependency/lockfile、資料包均無變更。未量測實際部署
三段、實際員工帳號、實體手機、真正 IME；沒有部署此候選。CI 綠燈
只證明所執行的 source-only synthetic 檢查，不能放行實站速度驗收。
