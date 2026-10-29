# 使用者權限 CLOUD 29102026 — 明確權限修正與隔離驗收

## 目前交付狀態

使用者已接受「先選角色，再調例外；主畫面簡單，詳細展開」。程式已修正且完成下列隔離驗證，**尚未部署；未達完整外部驗收／整合放行**。外部預覽與 Draft PR 均未建立，不能把分支、比較連結或 localhost 當成預覽／PR。

- 任務基準與收尾重新 fetch 的 main：`2cac307f29b8017a2bb6dc5229d47720f2deab33`。
- 品質／帳號 API 完整編譯驗證版本：`4b8c0d2ba5e6642f67eb13725a4c5212f4f5c9e6`。最終 UI 版：`33a1fd04a2abc9aeb2e2dd0477872f0ef2174223`，另修正展開詳細欄位的全寬排列並重新 build，重跑17組模組UI、完整登入／保存／重整與展開畫面、五次操作及載入量測。後端未變，不重跑已通過的全部品質工作流。最後交接提交僅測試／文件，不冒充重新 build 的版本。
- 隔離預覽名稱保留為「使用者權限修正・CLOUD 29102026」，與既有站分開。既有 process-os-test 的部署版本仍未知，未作任何真實資料寫入。
- 所有寫入：新建隔離記憶體 SQLite/R2 或 Miniflare 非持久 D1/R2，測試帳號及照片；無遠端綁定、真實憑證或資料遷移。
- 網路政策未開放 GitHub API；先前 GraphQL PR 建立被 403 拒絕。本輪工具清單也沒有 GitHub PR 或 Sites 建立／隔離 DB/R2 預覽工具。未改網路政策繞過限制。已備妥分支及 [Draft PR 清單](users-cloud-29102026-pr-manifest.json)／body files，仍待可用管道建立 Draft PR 與專用外部預覽。

## 改了什麼與理由

| 範圍 | 修改後行為 | 主要檔案 |
|---|---|---|
| 使用者／角色介面 | 使用者設定、角色範本分頁；一份有效矩陣，四個常用欄位＋其餘展開；收合列已允許項目，標明繼承／個別；保存前列差異 | user-access.js／css |
| 帳號保護 | Frank 可信 stored identity；一般 admin 不可修改自己／同級授權或升 admin；密碼、停用、刪除另在更多操作；所有自己改密碼驗舊密碼 | user-access API、lib/user-access.ts |
| 共用權限基礎 | 原 151 格保留；增加 11 個 restore。除 Frank 外需明確授權；依賴提示＋後端拒絕新缺口，不靜默補勾 | access-policy.mjs、bootstrap.js、user-access API |
| 還原 | 預覽與寫入皆查 restore；比較 adapter 套用後新增／刪除效果，查 create／delete；保留更嚴條件、CAS、pending、歷史、引用 | draft-restore-access.ts、versioned-shared-workflow.ts、shared-draft-client.js |
| IQC／FQC／IPQC-AB／檢具 | V3 保存／送審／撤回按自身權限顯示；已有草稿保存不再隱含要求 begin/edit；IQC 無 create 不顯示新增 | 各模組前端；IQC／檢具 legacy API |
| IPQC-C | 查看不再授予撤回；本模組 view 必要；approve／return 不另外綁 approval.view；restore 明確，legacy 複合寫入查實際能力 | ipqc-c.js、兩個 IPQC-C API |
| 線別 | lines.view 是入口；明示內容及操作依 AB/C，優先選有權 scope；沒有 AB/C 查看就顯示缺少條件；舊 lines 操作值保留唯讀 | master-data.js、permission-controls.js、user-access.js |
| FQC 目錄依賴 | 明列 AB 查看與檢具查看，缺少時顯示具體原因，設定 API 不自動補授權 | access-policy.mjs、fqc-master.js、user-access.js |
| 發送介面 | view-only 不可更改發送板；按鈕與直接 shared-state POST 均要求 edit | shared-state API、version-workflow.js、permission-controls.js |

`public/process/index.html` 為初載腳本註冊及資源版號；共用變動以上表為限。沒有改共用保存核心、業務審核流程、schema、草稿資料格式或批次覆寫角色。BOM 沒有獨立 create/delete 格，還原依其 edit/restore 與現有互鎖；IPQC-AB 整份 module restore 原本不支援，本次不新增，逐 scope 才有還原。

## 逐步驗收

S1/S2、V1、U2 等整組案例數值保留前一版 4b8c0d2 的紀錄；最終展開版面另重跑17組全數通過及 compiled桌面／390px展開確認，逐筆新數值見 JSON browserUsersLayoutFinal。耗時為對應瀏覽器案例整組或標明的重複測量，包含資料確認及可繼續操作；不是每個子斷言的單獨計時。完整操作者、動作、實際結果、逐次 ms 與 API 紀錄見 [原始證據](users-cloud-29102026-clear-rights-results.json)。舊完整流程清單保留於[第一輪驗收](USERS_CLOUD_29102026.md)，下列更新本輪結果。

| 操作者／操作 | 預期畫面及資料變化 | 實際結果／耗時 | 狀態 |
|---|---|---|---|
| Frank 搜尋姓名／帳號／角色，組合及清除篩選 | 結果與總數相符，無寫入 | S1/S2 781.3ms 整組；重複搜尋中位 33.4ms | 通過 |
| Frank 中越文組字 | 組字不中斷、焦點保留、結束後套用一次 | 模擬 composition 166.2ms；實體中文／越文輸入法未測 | 限模擬通過 |
| Frank 開啟與切換使用者 | 正確帳號、來源、有效格，無前人資料 | V1 952.0ms 整組，含勾選、列全選、讀回 | 通過 |
| Frank 四欄／展開／恢復繼承 | 變更摘要正確，缺依賴阻止保存、保留輸入 | U2 775.5ms；沒有暗中補 edit | 通過 |
| Frank／admin／一般帳號改自己密碼 | 舊密碼必要、確認一致、新可登入舊失效、舊會話失效 | compiled API 逐項通過；瀏覽器含新舊登入中位 1468.4ms | 通過 |
| admin 重設普通帳號密碼 | 不需目標舊密碼；不可重設 Frank／其他 admin | compiled API 通過；瀏覽器保存讀回中位 499.6ms | 通過 |
| admin 停用／重啟普通帳號 | 停用不可登入／操作；重啟須重新登入 | compiled API 通過；中位 221.3／200.1ms | 通過 |
| Frank 刪除確認／取消／失敗 | 取消不刪、失敗不報成功；邏輯刪除保留歷史，ID 不重用 | M3 930.6ms 整組；成功刪除讀回中位 234.2ms | 通過 |
| Frank 角色 CRUD／指派 | 被使用角色不可刪、未使用可刪；重新讀取保留設定 | R1 3083.3ms 整組；compiled 跨登入驗證通過 | 通過 |
| admin 自身／同級／Frank 管理 | 唯讀；原始 API、繼承重設、角色指派不能升權 | native 16 組情境；UI R2/R3 230.6ms | 通過 |
| 一般使用者查看自己 | 有效權限唯讀，不回他人／角色範本 | V2 335.2ms；compiled API 通過 | 通過 |
| Frank 連點、逾時、切換身分、舊回應、CAS、讀回失敗 | 一次寫入；輸入保留；未知結果只能讀回，不重送 | 17 組 UI 含上述故障；程式 fence／dirty 回歸通過 | 通過（定向） |
| Frank／有限使用者：5 個品質頁保存→送審→撤回 | 分別單獨授權可完成；固定 savedId、pending 與讀回正確 | IQC、FQC、檢具、AB、C 實際編譯 Chromium；21 個案例 | 通過（定向） |
| view-only：5 個品質頁寫入 | 無按鈕能力；直接有效 command 403、版本不變 | 同上 5 個拒絕案例 | 通過 |
| 還原無權／有權 | 未授 restore 拒絕；具權可讀回；刪除需 delete | 10 個 shared adapter handler；C 在 215 次 API 回歸另測 | 通過（定向） |
| legacy IQC／檢具快照 | 缺 edit/save/submit/create/delete 拒絕且資料不變；合法修改保存可讀回 | 16 個 actual-handler 案例 | 通過 |
| 線別／發送查看者 | 線別缺 scope 說明、C-only 不讀 AB；發送按鈕禁止且 API 403 | 實際 compiled Chromium 3 組，DB 未被拒絕寫入改動 | 通過 |
| 桌面／390px 越文 | 無頁面溢出、長字可操作、焦點保留 | Chromium 截圖及 assertion；實體手機未測 | 限模擬通過 |
| 使用者模組草稿／照片／送審／發回／核准 | 此模組為即時帳號設定，無這些業務流程 | 未為通用清單新增流程 | 不適用 |
| 既有站真實資料與可外部開啟副本 | 受控登入、獨立資料庫與可分享 URL | 無 Sites 管道／受控真資料，不以合成結果推論 | 未測／阻擋完整交付 |

設定→頁面→API 對照已更新於[權限對照](USERS_CLOUD_PERMISSION_MAP.md)：162 keys × 兩狀態 × 前後端＝648 比對；24 目的頁共 600 admission 判斷；108 個 workflow metadata 組合無落差；11 個撤權舊會話拒絕。這些不是 162 個業務操作的完整端到端驗收。IPQC-C 7 組／215 個 actual handler 請求含核准、發回、媒體／歷史及拒絕；其餘模組完整審核／所有照片／引用組合仍未全測。

## 速度與目標

100ms＝0.1 秒。沿用使用者已確認的隔離中位數門檻：搜尋／篩選／分頁 ≤150ms、開啟／勾選 ≤100ms、一般保存含讀回 ≤250ms、密碼 ≤1.5秒。沒有把完整頁面目標訂為 100ms。

相同 Node24、Chromium、1440×1000、loopback 無節流。操作表為 4 個合成正式帳號、同 Node SQLite/R2 fixture，各 5 次，含自動化按鈕／輸入及兩個動畫畫格；前版 `871f3637d823221e34415734585eeb46dd124bea`，新版 `33a1fd04a2abc9aeb2e2dd0477872f0ef2174223`。資料量／網路設定相同，但不是隨機交錯測量，保留執行波動；角色權限格增加 151→162 是產品變動。API responseEnd 與瀏覽器時間分開存在 JSON，不能互換。

| 操作 | 修改前中位／最慢 ms | 修改後中位／最慢 ms | 已確認門檻 |
|---|---:|---:|---|
| 搜尋 | 35.8／49.6 | 33.4／49.1 | 達成 ≤150ms |
| 組合篩選＋清除 | 73.2／83.5 | 66.1／66.8 | 達成 ≤150ms |
| 開啟使用者 | 101.2／116.1 | 116.6／133.3 | **未達** ≤100ms |
| 個別權限勾選 | 82.3／83.8 | 83.5／85.7 | 達成 ≤100ms |
| 個別權限保存＋讀回 | 149.6／166.6 | 166.3／199.8 | 達成 ≤250ms |
| 切角色頁 | 83.6／130.3 | 83.1／99.5 | 達成 ≤150ms |
| 切使用者頁 | 83.2／83.7 | 83.2／83.5 | 達成 ≤150ms |
| 開啟角色 | 93.8／149.9 | 100.0／100.4 | 達成 ≤100ms |
| 角色保存＋讀回 | 183.2／239.8 | 167.5／200.4 | 達成 ≤250ms |
| 停用＋讀回 | 199.4／336.2 | 221.3／242.1 | 達成 ≤250ms |
| 重新啟用＋讀回 | 233.2／313.1 | 200.1／249.8 | 達成 ≤250ms |
| 刪除＋讀回 | 287.8／354.2 | 234.2／286.4 | 達成 ≤250ms |
| 重設他人密碼＋讀回 | 500.0／586.8 | 499.6／516.4 | 達成 ≤1500ms |
| 自己改密碼＋新舊登入確認 | 1459.2／1489.5 | 1468.4／1485.2 | 達成 ≤1500ms |

開啟使用者中位116.6ms未達100ms；開啟角色中位100.0ms達標（最慢100.4ms，不是最慢SLA）。自己改密碼中位1468.4ms、最慢1485.2ms。不同輪有畫格及執行波動，保留前一輪100.1ms開啟值於JSON，不以較好舊數字取代最終結果。列表翻頁功能已測，翻頁尚未獨立做五次計時；新增帳號／角色、失敗重試也只有功能驗證。

完整應用載入另以 Miniflare D1/R2 測量，登入預先完成；每組五個新 context 冷 HTTP cache，再同 context 暖 cache 重整；計到資料、導航 ready 及兩個畫格完成，OS／伺服器並非保證冷啟動。最初載入優化前 `7af150a`（實際 bundle `3be743e`），前一版優化 `91942a6`，本輪完整 build `33a1fd0`。各輪資料量、網路與工具設定相同，未同時 build 或跑其他重測；原始 bundle／檔案 hash 皆留存。

| 帳號數／頁面載入 | 最初中位／最慢 ms | 前版優化中位／最慢 ms | 本輪中位／最慢 ms |
|---|---:|---:|---:|
| 4人／首次 | 721.0／763.5 | 668.1／790.1 | 704.8／831.5 |
| 4人／重整 | 362.0／480.4 | 344.6／394.9 | 361.6／411.2 |
| 200人／首次 | 848.9／874.3 | 691.0／731.8 | 795.5／849.1 |
| 200人／重整 | 529.7／580.6 | 392.8／412.8 | 444.3／559.3 |

200 人首次約比最初快 6.3%、暖重整約快 16.1%；本輪比前版純載入優化稍慢，4 人暖重整與最初相近。只表示這組隔離資料的結果，不能說每項改善或推估真站速度。前期瓶頸證據是權限計算重複、初始化讀取串行與 200 列 DOM；已保留請求內投影重用、授權後讀取重疊與 50 人分頁。API 仍讀全部已授權帳號，沒有伺服器分頁或過期授權快取。

5 個品質頁保存／送審／撤回的時間僅為每步一次功能觀察（147–615ms，詳見 JSON），不是效能比較或達標證據，不能套用使用者設定模組的 250ms 目標。

## 分支與 Draft PR 交接

以下是相依分支（stack），不是已建立 PR。每層 Draft PR 應以上一層為 base；最下層 users 以 main 為 base。不同業務模組改動分開，另有共用依賴／驗收層；測試是最上層組合版本，尚未逐一 build 各中間分支。由 dot 核對後安排整合，沒有 merge／auto-merge／發布授權。

| 分支（cloud/…-29102026） | SHA | 差異範圍 |
|---|---|---|
| `cloud/users-permissions-29102026` | `ea8d19e55f44162c8468f541ecd82f9acee327b3` | 使用者設定、角色範本與還原授權基礎 |
| `cloud/iqc-draft-rights-29102026` | `343b2cb9ec513c4e3ad0a94fe81b2c6991b5b999` | IQC 按鈕與 legacy 快照權限 |
| `cloud/fqc-draft-rights-29102026` | `f81948ecd82d250bb1285e7aa3ed7041c540a660` | FQC 保存／送審分開授權 |
| `cloud/ipqc-ab-draft-rights-29102026` | `385add4bf8bec279c2626b32db01aad1d4666485` | IPQC-AB 整份保存／送審 |
| `cloud/equipment-draft-rights-29102026` | `9314dfd6a2f1ea58215382515509a19e83a5d755` | 檢具保存／送審／撤回與 legacy API |
| `cloud/ipqc-c-explicit-rights-29102026` | `d3c00b526cded5c9d86a7ed23144a591f86e294d` | IPQC-C 查看／撤回／審核／還原明確授權 |
| `cloud/lines-scope-rights-29102026` | `2dddf1028fc67b9cac5e2b1bb8e6717e7584e552` | 線別入口與 AB／C 範圍說明 |
| `cloud/dispatch-write-rights-29102026` | `d1b4b0a063adbc70201d35cb978fb5536abcacab` | 發送介面查看不能寫入 |
| `cloud/fqc-dependencies-29102026` | `0e66075a69f848423facc10a8db0caee64f2284c` | FQC 既有目錄查看依賴明列 |
| `cloud/permissions-review-polish-29102026` | `4b8c0d2ba5e6642f67eb13725a4c5212f4f5c9e6` | 共用還原拒絕訊息中越文化 |
| `cloud/permissions-verified-29102026` | `384037d21329921ba8f6eb2367a6c39936110e5e` | 驗收、文件及 IQC 三行空白清理（無行為修改） |
| `cloud/users-permissions-layout-29102026` | 程式 `33a1fd04a2abc9aeb2e2dd0477872f0ef2174223`；文件見分支 HEAD | 展開欄位全寬排列、實際編譯頁面／最新五次測速補驗；base為permissions-verified |

## 檢查、共用重疊與剩餘風險

- PASS：完整 `npm run lint`、`npx tsc --noEmit --pretty false`、安全 `npm run build`（退出 0，post-build auth check 通過）。後加測試另跑 targeted oxlint；diff 使用 `core.whitespace=cr-at-eol` 保留既有混合換行，新增三個尾空白已移除。
- PASS：帳號 handler 51 檢查、17 組模組瀏覽器、16 組 compiled 帳號權限、5 模組 compiled Chromium、線別／發送、IPQC-C 215 請求、10 個 shared restore adapters、legacy 16 案例、response fence 與 dialog dirty。前述數字是不同範圍，不能相加宣稱全站覆蓋率。
- `scripts/test-user-management.mjs` 聚合檢查需要本 checkout 不存在的 `db/seed.json`，原有先決條件不足；未列通過。新測試曾因 fixture 缺 build SHA／BOM draft version、AB command 缺有效 stateRevision 而失敗，已修正測試輸入重跑通過，未放寬正式 API。瀏覽器實證的 FQC 目錄依賴則修正產品提示與設定驗證。
- 文件連結檢查：新增相對連結皆存在；既有 CHANGELOG 指向缺少的 `20261015-button-coverage.json`，已在基準存在，非本次新增，未越界補造歷史證據。
- 人工差異審查：保留後端 stored identity、authEpoch、CAS／pending、歷史、初載身分／舊回應 fences；無真資料或 migration。未使用另一任務的程式碼覆蓋本分支。

取得兩個其他任務 remote branch 的當前差異，已確認重疊：

- `origin/codex/web-feedback-helper-20261029` @ `f32523b66687036697aed297e72df82f390155d1`：`AI_CONTEXT/CHANGELOG.md`、`HANDOFF.md`、`public/process/index.html`。

- `origin/fix/ipqc-ab-read-ownership-20261029` @ `6b56bf68c0c892aa11cdfb7d266995d5dd7f921c`：`AI_CONTEXT/CHANGELOG.md`、`AI_CONTEXT/modules/QUALITY.md`、`public/process/index.html`、`public/process/ipqc-ab.js`、`public/process/shared-draft-client.js`。

IPQC-AB 另一分支正在修讀取所有權、accessBlocked 與 acknowledgement；dot 必須語義整合其取消／隔離保護與本輪獨立 save/submit、已有草稿不 begin 的修正，不能整檔取代。shared-draft-client 必須同時保留其讀取所有權與本輪 restore 檢查／訊息。index 要保留各自註冊／版號。未取得遠端 PR 清單與編號，分支重疊不代表已完成 PR 審查。

剩餘／阻擋整合項目：

1. 外部專用預覽及 Draft PR 尚未建立，必須補齊再交由使用者瀏覽與 dot 整合；目前不是完整交付。
2. 嚴格 100ms 開啟使用者設定目標未達（116.6ms）；實體輸入法、實體手機、真站速度與真帳號授權盤點未測。
3. 全 catalog 解析／入口一致不代表所有業務操作已全測；其餘完整送審、照片、引用及外部整合後回歸待測，特別是其他任務語義整合後。
4. 新 restore 為刻意縮限：Frank 以外角色／個人須重新明確授權。發布前由 Frank 核對需要者，不自動保留原 edit 隱含還原能力。legacy snapshot 寫入是編輯＋保存複合操作，不可拿 save-only 繞過。
5. FQC 既有目錄權限依賴意味管理者目前須明確給 AB／檢具查看。若只想開放 FQC 所需目錄而不讓使用者看完整 AB／檢具頁，另做限定目錄 API／權限設計；本次沒有自動擴大可見資料。
6. 還原差異檢查對無穩定 ID 的集合／物件採保守判定，可能要求額外 create/delete。已測 10 個 shared adapters 的授權門檻與合法還原，較複雜歷史內容仍須用隔離代表資料驗證，不可為了放行移除保護。

重現：依 onboarding 已準備的 npm 安裝／建置環境，在相同 checkout 以實際 production SHA 設 `PROCESS_PROGRAM_COMMIT`；建置後跑 `tests/user-permissions-native.test.mjs`、`scripts/test-clear-draft-browser.mjs`、`scripts/test-lines-dispatch-browser.mjs`、`scripts/test-users-cloud-load.mjs`，後三個需絕對 `USER_PERMISSIONS_EVIDENCE`。模組瀏覽器 `scripts/test-users-cloud-browser.mjs` 自建隔離 fixture；不要把測試端點指向既有站台。完整雲環境安裝草稿已於先前 onboarding 準備，未修改既有部署設定。

## 實際畫面（隔離合成資料，不是外部預覽）

最後視覺檢查發現 details/display:contents 的展開內容被壓在一欄；已改成 native details 區塊，展開占全矩陣寬度，保留收合摘要。新增桌面／窄螢幕寬度與無溢出斷言，17組UI及最終 compiled完整頁面4組檢查通過。

- [完整應用桌面展開](screenshots/users-permissions-CLOUD29102026-zh-desktop.png)
- [完整應用窄螢幕展開](screenshots/users-permissions-CLOUD29102026-zh-mobile.png)
- [保存前差異顯示](screenshots/users-permissions-CLOUD29102026-zh-changes.png)：模組隔離 fixture，尚未保存的示範勾選，沒有改真帳號。

遠端分支已推送並核對，main仍為任務基準。最終 review/evidence 分支為 `cloud/users-permissions-layout-29102026`。Draft PR、對外預覽依然未建立，不能把這些截圖當作可操作預覽。
