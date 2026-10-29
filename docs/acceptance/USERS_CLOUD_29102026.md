最新追加：[第二輪完整頁面載入優化與驗證](USERS_CLOUD_LOADING_29102026.md)。以下第一輪數據保留，不當成最新版本重測。

# 使用者與權限 CLOUD 29102026

本次範圍：帳號、角色及個別權限。獨立分支 `cloud/users-permissions-29102026`，起始最新 GitHub main `2cac307f29b8017a2bb6dc5229d47720f2deab33`。不修改小幫手、問題回報或業務送審流程。所有帳號及寫入驗證均為隔離合成資料。

預覽識別：**使用者與權限｜CLOUD 29102026｜隔離驗收**。本機 Chromium 模組頁使用獨立記憶體 SQLite/R2；compiled Worker 使用非持久 D1/R2。兩者都不是既有測試站。尚無可供使用者開啟的對外預覽網址：目前未連接 Sites 建立／發佈工具。

既有測試站部署版本未知：目前網路政策拒絕連線；不得假設等於 GitHub main。已保存 `api.github.com` 與既有測試站主機的網路草稿，待環境設定套用。未取得真實站台資料或真實效能。

## 逐步驗收

每項記錄實際操作者、操作、預期畫面／資料、實際結果、耗時及狀態。PASS 僅指指定隔離層，不能外推真站或實體手機。原生中文／越文輸入法另列未測。

| 步驟 | 操作者／操作 | 預期畫面 | 預期資料變化 | 結果／耗時／狀態 |
|---|---|---|---|---|
| S1 | admin 搜姓名、帳號、角色 | 正確清單及數量 | 無寫入 | 隔離 Chromium PASS，詳見下方逐項計時及結果 JSON |
| S2 | admin 組合角色、狀態及搜尋，再清除 | 條件可疊加、結果可還原 | 無寫入 | 隔離 Chromium PASS，詳見下方逐項計時及結果 JSON |
| S3 | admin 中越文組字 | 不重複字、不失焦、不跳捲軸 | 無寫入 | DOM composition 事件 PASS；實體 IME 未測 |
| V1 | admin 查看／快速切換帳號 | 正確姓名、ID、角色、狀態、設定及有效權限 | 無寫入 | 隔離 Chromium PASS，詳見下方逐項計時及結果 JSON |
| V2 | 一般帳號開我的帳號 | 151 格自身有效權限唯讀；不公開其他人 | 無寫入 | compiled API／隔離 Chromium PASS |
| P1 | Frank／admin／一般帳號輸入錯誤或缺少舊密碼 | 明確錯誤、保留輸入 | 不改密碼、revision、備份 | compiled API PASS |
| P2 | 三種身分輸入正確舊密碼、新密碼及確認 | 成功後需重新登入 | hash 更新、舊密碼及舊會話失效 | compiled API PASS |
| P3 | 管理者重設非 admin 密碼 | 不要求目標舊密碼 | 新密碼可登入、舊密碼及會話失效 | compiled API PASS |
| P4 | 普通 admin 重設其他 admin／Frank | 拒絕 | 零寫入 | compiled API PASS |
| M1 | admin 停用非 admin | 清單停用狀態 | 舊會話及新登入均拒絕 | compiled API／隔離 Chromium PASS；詳見結果 JSON |
| M2 | admin 重新啟用非 admin | 啟用狀態 | 舊會話仍拒絕、新登入才可用 | compiled API／隔離 Chromium PASS；詳見結果 JSON |
| M3 | admin 刪除確認／取消／失敗 | 明確目標；取消不刪；失敗不報成功 | 邏輯刪除、不刪業務歷史、不重用 ID | compiled API／隔離 Chromium PASS；詳見結果 JSON |
| M4 | 任意管理者停用／刪除／降級 Frank | 拒絕 | 保留唯一主要管理員 | compiled API PASS |
| R1 | Frank 建立／修改／刪除角色 | 角色矩陣更新；有人使用不可刪 | 僅角色定義及必要 authEpoch 改變 | compiled API／隔離 Chromium PASS；詳見結果 JSON |
| R2 | 普通 admin／一般帳號直接呼叫角色 API | 拒絕 | 零寫入 | compiled API PASS |
| R3 | 普通 admin 修改自身／同級或授予 admin | 拒絕 | 零寫入 | compiled API PASS |
| R4 | 管理者勾選、取消、列全選、恢復繼承 | 角色預設／個別來源及有效勾選清楚 | 僅授權範圍可改；查看相依不靜默補勾 | compiled API／隔離 Chromium PASS；詳見結果 JSON |
| R5 | 重新載入／登入目標帳號 | 保存結果仍正確 | 舊 session 失效；API 依新權限判斷 | compiled API／隔離 Chromium PASS；詳見結果 JSON |
| E1 | 保存連點、按 Escape 或切頁 | 保存中不可重送／關閉 | 最多一次 POST；CAS／備份保留 | 隔離 Chromium PASS，詳見下方逐項計時及結果 JSON |
| E2 | 衝突／確定失敗後重新讀取 | 保留輸入；唯讀核對 | 不自動重送或覆蓋新修改 | 隔離 Chromium PASS，詳見下方逐項計時及結果 JSON |
| E3 | 網路斷線／逾時／5xx | 未確認狀態，不顯示成功 | 不自動重送；只可讀回核對 | 隔離 Chromium PASS，詳見下方逐項計時及結果 JSON |
| E4 | 舊 GET／POST 晚到或換帳號 | 不覆蓋較新權限、不同身分或登出新帳號 | 零跨帳號採用 | controller fence／隔離 Chromium PASS |
| U1 | 桌面與 390px，中／越文長字串 | 不越界、不遮字；矩陣可橫捲 | 無寫入 | 1440px／390px 中越文 Chromium PASS；實體手機未測 |
| N1 | 開始草稿／照片／送審／退回／核准 | 不適用 | 本模組為直接帳號命令＋CAS＋歷史備份，無上述業務流程 | 不適用，不新增流程 |

## 已確認速度目標

使用者確認：搜尋／篩選／分頁中位數 ≤150ms；開啟及勾選 ≤100ms；一般保存含讀回 ≤250ms；密碼 ≤1500ms。每項至少五次並報最慢值。計時到資料確定、UI 可繼續操作；保存包含額外 GET 核對。不減少密碼雜湊強度、CAS 或歷史保護。

基準條件：Node 24.19、Chromium、記憶體 SQLite／R2、4 個正式合成帳號（另有 DEMO）、loopback 無節流。模組頁並非完整站台導覽。第一次進頁含 fixture 自動合成登入，與真實使用者輸入登入不同。基準與候選使用相同測量腳本／條件；API 測量與瀏覽器操作時間分列，不視為真站效能。

## 已知規則衝突

IPQC-C 的 `app/api/ipqc-c/workflow/route.ts` 與 `scripts/test-ipqc-c-operation-permissions.cjs` 明確保留資料查看即可撤回、部分審核跨頁查看；因此該模組的未勾選格不完全等於禁止。已向使用者說明，建議保留勾選方式、另開業務權限修復 PR；本次不改送審流程，不宣稱全站矩陣完全一致。

普通 admin 既有規則不允許更改角色指派；可依授權範圍修改非 admin 個別權限。維持此規則，不擴大授權。刪除採邏輯刪除，歷史保留，因此有歷史引用不必強制實體刪除或連帶刪除。

## 最終測量結果

以下每項各 5 次，單位 ms，`典型／最慢` 為中位數／最大值。基準及候選循序測量，未同時跑 build 或其他瀏覽器套件。各使用全新記憶體 DB；啟動前只清除同一 synthetic preflight 的 login-limit 計數，執行期間不關閉或重設登入限流。第一次進頁用新瀏覽器 context（冷 HTTP cache），再次進頁使用同一 context（暖 cache）；伺服器程式已暖機。保存測量包含獨立 GET，自己改密碼包含舊密碼失敗、新密碼成功及登入後讀回。

| 操作 | 基準 典型／最慢 | 候選 典型／最慢 | 已確認目標／判定 |
|---|---:|---:|---|
| 首次進模組頁 | 195.3／296.9 | 192.2／306.9 | 尚未另訂門檻 |
| 再次進模組頁 | 100.8／148 | 100.5／137.6 | 尚未另訂門檻 |
| 搜尋 | 33.1／33.6 | 33.2／49.7 | ≤150：PASS |
| 篩選組合及清除 | 66.1／67.5 | 66.8／84.8 | ≤150：PASS |
| 開啟使用者 | 99／116.8 | 99.7／101.5 | ≤100：PASS |
| 勾選個別權限 | 100／132.6 | 80.5／83.7 | ≤100：PASS |
| 個別權限保存＋讀回 | 150.1／150.4 | 150.6／200 | ≤250：PASS |
| 停用＋讀回 | 218／236.5 | 186.8／218.1 | ≤250：PASS |
| 啟用＋讀回 | 217.2／233.4 | 200.3／250.6 | ≤250：PASS |
| 管理者重設密碼＋讀回 | 482.7／500.1 | 467.7／982.2 | ≤1500：PASS |
| 角色分頁 | 83.4／83.6 | 82.8／83.9 | ≤150：PASS |
| 開啟角色編輯 | 100／101.4 | 100.2／100.7 | ≤100：未達標 |
| 角色保存＋讀回 | 153／166.7 | 151.5／170.6 | ≤250：PASS |
| 使用者分頁 | 83.6／100.3 | 66.5／83.5 | ≤150：PASS |
| 刪除確認＋讀回 | 227.1／237.7 | 204.8／259.5 | ≤250：PASS |
| 自己改密碼＋新舊登入驗證＋讀回 | 1434.4／1453.2 | 1448.3／1482.6 | ≤1500：PASS |

角色編輯 100.2ms 未達 100ms 門檻，保留原始結果，不四捨五入成 PASS。單次最慢值不等於已確認的中位數門檻，但完整列出；小樣本差異不可解讀成穩定 SLA。首次進模組頁不等於完整站台登入。

API 單獨量測（Node actual handlers＋SQLite，10 次、一次暖機）：4 帳號中位數 4.70→4.15ms；200 帳號 185.51→116.26ms（約 37% 降低），最慢 264.43→144.28ms。兩邊皆 1 次 SQL、0 R2，改善屬伺服器計算重用，不是 DB 改造。未改密碼雜湊、CAS、歷史備份或全域讀寫機制。不得套用此結果推算真實 8GB 資料或網際網路速度。

完整編譯應用另用正常登入表單→bootstrap→使用者頁，驗證保存→獨立 reload、390px 外框；一次登入到可操作約 1069ms（n=1，僅功能驗收，不當成效能比較）。實際 Worker/D1/R2 的帳號 API 正反流程另有 186 次 HTTP 收據；與 Node 模組頁及真站測速分開。

## 驗證、限制與重跑

- PASS：lint、TypeScript、受保護 build；48 項現有 user-access API；6 項 role/session；3 項 own projection；5 項 response fence；dirty-dialog、navigation 及 routine cells 定向回歸。
- PASS：16 組 Chromium 模組情境（含實際資料讀回、連點、舊回應、衝突、角色／帳號 CRUD、讀回局部重試、斷線及虛擬時鐘觸發的 POST deadline）；頁面錯誤 0。
- PASS：16 組 compiled Worker 帳號情境；正常 full-page 登入／保存後重新整理／窄螢幕。兩種 DB 都是隔離合成資料。
- 既有 FAIL：`node scripts/test-user-management.mjs` 在前置 `test-demo-auth.mjs` 因 source-only repo 不含 `db/seed.json` 而停止；其後段沒有宣稱跑過。沒有補入真實 seed、關閉斷言或改 dependency/lockfile。
- 未測：真實站台速度與版本、實體 iPhone／原生中越輸入法、全站每一權限的所有業務操作、外部對外預覽。上述仍阻擋「完整驗收／可整合發布」聲明。
- 無 schema／migration／帳號資料移轉；無真實資料寫入。保存逾時保持未知結果並禁止重送；已 ACK 但讀回失敗僅 GET 重試。失敗輸入不寫入持久瀏覽器儲存（尤其密碼）。

從本 checkout 以 Node 24、鎖定 npm dependencies 重跑：

```bash
npm run lint -- --format unix
node node_modules/typescript/bin/tsc --noEmit --incremental false
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) npm run build
mkdir -p .sites-runtime /tmp/users-cloud-evidence
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) USER_PERMISSIONS_REPORT=/tmp/users-cloud-evidence/native.json node tests/user-permissions-native.test.mjs
USER_PERMISSIONS_EVIDENCE=/tmp/users-cloud-evidence node scripts/test-users-cloud-browser.mjs
PROCESS_PROGRAM_COMMIT=$(git rev-parse HEAD) USER_PERMISSIONS_EVIDENCE=/tmp/users-cloud-evidence node scripts/test-users-cloud-full-page.mjs
```

瀏覽器預設使用 `/usr/bin/chromium`，可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已安裝執行檔。模組測試只開自己擁有的 loopback port（預設 3056，可設 `USER_ACCESS_FIXTURE_PORT`），結束只終止自己啟動的 child。獨立預覽可執行 `USER_ACCESS_FIXTURE_PORT=3055 node scripts/test-user-access.mjs --serve`；這是本機 synthetic fixture，不是對外預覽，不可接正式 DB。計時用 `scripts/test-users-cloud-timing.mjs`，指定該 owned fixture 的 `USERS_QA_URL` 與絕對 evidence 目錄；不要指向日常 3000。

## 檔案與整合交接

核心：`app/api/user-access/route.ts`、`public/process/user-access.js`、`public/process/user-access.css`。共用影響：`lib/user-access.ts` 僅 optional request-local role reuse，原兩參數呼叫保持語意；`index.html` 僅本模組 JS/CSS query version。規格／RUNTIME／CHANGELOG／HANDOFF 為本次維護；其他新增檔案皆隔離驗證或報告。

已只讀核對遠端分支（不是 PR 狀態）：

- `codex/web-feedback-helper-20261029` @ `808a61c8b84bc5e993007c1d0d94e4d861f3e06d`：重疊 `AI_CONTEXT/CHANGELOG.md`、`HANDOFF.md`、`public/process/index.html`。
- `fix/ipqc-ab-read-ownership-20261029` @ `6b56bf68c0c892aa11cdfb7d266995d5dd7f921c`：重疊 `AI_CONTEXT/CHANGELOG.md`、`public/process/index.html`。

未 cherry-pick／合併這些分支。dot 整合時保留各自文件條目與各模組 asset version；不要以整份 index.html 覆蓋另一任務。其他未發布 worktree／未提交修改及 open PR 完整列表不可由 Git refs 推定。

交付仍受阻：`api.github.com` 未在執行中的允許清單，無法確認／建立 Draft PR；未連接 Sites／對外預覽工具，無法建立要求的獨立站台及可開啟網址。已儲存網路草稿，需在環境設定套用。不要用既有站台或假 localhost 公開連結替代。只允許獨立 Draft PR／預覽；沒有 merge、auto-merge 或既有站台發布。


最後交付狀態：工作分支已上傳 GitHub，Draft PR 建立的實際 `gh pr create --draft` 回覆 `Post https://api.github.com/graphql: Forbidden`，未建立 PR。PR 文字已準備；必須先套用已存的網路設定，不能將新 PR 連結或分支連結冒充已建立 Draft PR。

性能比較版本為 baseline SHA 與候選 `4c44ec210ff728f6221184f208a390ff3a6c6c50`；最後 code review 另修正清除搜尋後再貼上相同文字的事件狀態，並補瀏覽器回歸。此額外 Clear 按鈕分支未包含在前述用 input/select 清除的比較操作；沒有把其他版本的時數重新宣稱成新量測。最終 source SHA-256 與計時 source SHA-256 分別保存在結果 JSON。

最後程式版本 `3be743ed2abfa3b475df95eac1b33d1136be497d` 再驗證：compiled API 16 組／186 次請求通過，完整應用正常登入、保存後重新整理及 390px 窄畫面通過，頁面錯誤 0；一次登入至可操作 1146ms（n=1，僅功能驗證）。收據列於 JSON 的 `finalCodeValidation`，不取代上述五次比較。後續本次文件提交只補收據，沒有變更執行程式。
