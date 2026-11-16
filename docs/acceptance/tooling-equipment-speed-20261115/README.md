# 檢具／模具速度：獨立候選與量測

Base verified twice against remote main: `e040a7e838133c0c9870850a49955cf045dbc02b`.
Branch: `perf/tooling-equipment-speed-20261115`, isolated Dot worktree.
Draft only. No merge, deployment, live Site read/write, data/account/ACL change,
D1/R2 mutation, schema or migration. Existing quality work and PR #120 are separate.

## 根因與修改界線

真正 API handler 前測：Tooling Save 28 個 R2 GET、12 次 `can()`、一個 CAS，
回應約 845 KB；檢具 Save 29 個 GET，保存後刷新另讀 20 個 GET。
`readState` 逐 aggregate 等待網路，再順序驗 hash／JSON／完整模型；這使獨立
aggregate GET 的往返延遲累加。可觀察的其他成本包含反覆 session／權限判斷、
大型 workflow response 的 JSON 與傳輸；這些成本沒有因本次排程變更消失。

`inventoryReadAhead` 僅於精確兩組 route/key/scope 開啟已存在的
`state-records.aggregateReadAhead`：最多五個 aggregate GET，在原順序依次消費
text/hash/JSON。未減少任何依賴、未並行解析大型 body，未改寫入成功條件。
Tooling IQC 唯讀來源及檢具畫面實際 `/api/routine-equipment` GET 也使用同一 bounded 排程。所有原 CAS／版本衝突、欄位
基準、權限、照片及關聯驗證、immutable Save／審核快照和原收據保留。
刪除／新增 patches、restore、import、未知 moduleAction、混合 Begin envelope
均不採用此新增 write opt-in。新增／刪除與相關 history guard 沒有修改。

目前原品質工作正在做 request-local 權限 phase，並改回饋、反查與 AB OOM。
本候選沒有抄入那些未合併內容。FQC/IQC transfer 的保存後反查、檢具前端刷新
邏輯及 AB 容量問題未修；其速度仍須原工作與後續實站共同查證。

## Fixture、環境與方法

Node v24.22.1，Linux Dot cloud，真正 TypeScript handlers 經既有 loader 執行；
隔離 `:memory:` SQLite + Map R2，records-v1。無真帳號、業務資料或網路服務。
366 個模具、119 個檢具，各 20 個保留版本、8 個無關 retained aggregates、
一個已核准 IQC 關聯，無圖片 bytes。筆數來自既有開發文件的來源量級，
20 個歷史版本為合成壓力條件，未核對現場實際規模。

baseline 是固定 main 的 source-only `git archive`，比較器在每輪前逐檔驗證
受影響 handlers 與 shared/runtime 原始 bytes，只有 benchmark script 複製進去。
每個 arm 都重新建 fixture；3 對交錯 before→after／after→before／before→after，
不丟棄 warmup。Begin、建置及 fixture 準備不計；每個 write、完整 response body
消費及後續 GET 分開量測。`readState`、權限、encode 與 response decode 另記。
最終檢具 read／refresh 使用畫面真正 `/api/routine-equipment?caseMetadata=1`；
workflow GET 另列，不拿其時間代替畫面刷新。
同一 explicit workflow 命令每次必須取得原 receipt；驗證 saved／working、pending、
撤回、再送與另一合成審核者核准的 active pointer，完整讀回後才算完成。

[10ms 完整交錯原始結果](paired-10ms.json) 全數保留（探索階段的檢具 refresh 使用 workflow GET，不能代替實際畫面 GET），包含負向與持平結果。
其 `readState` 中位數均下降，但部分總耗時變慢，不能稱為所有流程改善。
因此補固定 50ms I/O 的同一三對實驗，分辨可重現的 scheduling 成本與 CPU 波動。
所有注入延遲都是實驗條件，不是從實站量到的網路參數。

## 最終固定版本的分階段數據

固定 runtime：`250b7f28dfe18dc49def35c15d098f07c6fecd97`；三個 after arm 的全部 runtime SHA-256 完全相同，並逐檔核對最終來源。完整原始數據：[paired-50ms.json](paired-50ms.json)。

單位 ms；每格為 **before → after** 的三輪中位數，固定每次 DB/R2 I/O 注入 50ms。每個 write 都是一個 CAS；所有 GET 數與 wire bytes 範圍前後相同。這是條件式合成實驗，非實站承諾。

| 步驟 | 模具寫入／讀取 | 模具後續刷新 | 檢具寫入／讀取 | 檢具實際畫面刷新 |
| --- | ---: | ---: | ---: | ---: |
| 初次讀取 | 1982 → 1808 | — | 790 → 642 | — |
| 存草稿 | 2337 → 1708 | 2012 → 1779 | 2565 → 1899 | 925 → 767 |
| 送審（確認後 request） | 2438 → 1762 | 2046 → 1825 | 2625 → 1943 | 921 → 768 |
| 撤回 | 2389 → 1746 | 2074 → 1779 | 2644 → 1875 | 925 → 770 |
| 再送審 | 2435 → 1808 | 2070 → 1795 | 2599 → 1877 | 971 → 791 |
| 確認核准（合成 reviewer） | 2197 → 1556 | 1995 → 1759 | 2321 → 1633 | 765 → 613 |

Tooling IQC 關聯載入：469 → 319 ms；這個 fixture 只有一個 IQC 產品，用於必要關聯正確性，未驗收大型 IQC catalog／transfer 反查。檢具共用 client 的 workflow GET 另量 2234 → 1949 ms，未與實際畫面 GET 混算。

| 模組／階段 | readState 前→後 ms | R2 GET（相同） | CAS（相同） |
| --- | ---: | ---: | ---: |
| tooling / read | 609 → 359 | 12 | 0 |
| tooling / save-write | 1430 → 777 | 28 | 1 |
| tooling / save-refresh | 661 → 410 | 13 | 0 |
| tooling / submit-write | 1478 → 830 | 29 | 1 |
| tooling / relation-load | 354 → 203 | 7 | 0 |
| routine-equipment / read | 607 → 458 | 12 | 0 |
| routine-equipment / save-write | 1472 → 789 | 29 | 1 |
| routine-equipment / save-refresh | 763 → 609 | 15 | 0 |
| routine-equipment / submit-write | 1600 → 999 | 32 | 1 |

前後沒有縮減 response 或提早完成；耗時降低來自 aggregate 等候重疊。仍存在反覆權限／session 判斷與大型 response CPU／傳輸成本。10ms 條件保留持平及負向結果，不能以 50ms 這組推定所有網路或實站流程都改善。

## 重現

```bash
git archive e040a7e838133c0c9870850a49955cf045dbc02b | tar -x -C /path/to/empty-baseline
cp scripts/benchmark-tooling-equipment-speed.cjs /path/to/empty-baseline/scripts/
SPEED_PAIRS=3 SPEED_IO_MS=50 python scripts/compare-tooling-equipment-speed.py /path/to/empty-baseline /tmp/paired.json
```

安裝本 checkout 鎖定依賴後執行。baseline 只含公開 source，`NODE_PATH` 由比較器
指向候選依賴。每輪保留精確 runtime SHA-256、Node 版本、GET/PUT/SQL/CAS 數、
peak GET、每步時間與 wire bytes。整份 response 必須消費；未提早顯示成功。
此工具沒有觸及實站或開啟本機伺服器。

## 分工及整合風險

- 原品質工作共用 `lib/versioned-shared-workflow.ts`：本增量僅第一行 import、
  GET 的 aggregateReadAhead 條件與 POST 的同一條件；其權限 `phaseFor` 接點應
  逐行保留。不是以本候選檔案覆蓋原工作整檔。
- 與 #120 共用 `scripts/ipqc-speed-assignment-source-contract.cjs`、
  `tests/ipqc-operation-speed-integration-source.test.cjs` 與 QUALITY／CHANGELOG／
  HANDOFF 文件。兩個精確 inverse 都必須保留；單方 manifest 不能冒充共同版本。
- 新 `inventory-speed-source-contract` 可 byte-exact 還原固定 main，保留原歷史
  manifests、EOL 與所有 drift／wrong-path 負例。共同合併樹需重新核對 source
  proof 與受影響 CI；單支 PASS 不代表共同候選 PASS。

## 已執行驗證與先前失敗

| 檢查 | 結果／證據界線 |
| --- | --- |
| 獨立鎖定依賴安裝 | PASS；`npm ci --ignore-scripts`，不依賴另一工作樹的 dependency symlink |
| lint／非增量 TypeScript | PASS；以實際 GET 增量後的 `6ad38167` runtime |
| guarded production build | PASS；`6ad38167` runtime，原 build/preload/auth-output guards 保留；未部署 |
| 原保存／分組衝突／UNKNOWN／照片 | 371/371 PASS；較早 runtime，實際 GET 的後續增量需下列定向驗證 |
| 原 Tooling／其他 transport source 回歸 | 65/65 PASS；無刪除邏輯變更 |
| 真正 Tooling handler lifecycle | PASS；原 `test-tooling-workflow-request.mjs`，Save/Submit/Withdraw/Return/Resubmit/Approve |
| 檢具實際 UI＋handler | 8 群組 PASS；synthetic DOM，非 Chromium；實際 GET 後續增量另驗 |
| 原完整來源集中 | 843 PASS、8 FAIL；失敗為新增 helper／source-test 增量尚未接 inverse，並非產品已通過 |
| 來源修正後定向重測 | 303/303 PASS；`250b7f28`，含全部前述失敗項；與 843 有重疊，不相加 |
| 最終定向驗證 | 82/82 PASS；含實際檢具畫面 GET 與 serial 完整投影相等、失敗重讀／撤權、原子 Save、所有 decoder fault-order 與精確來源負例 |
| 最終檢具 UI＋handler lifecycle | 8 群組 PASS；實際 GET 增量後重跑，仍為 synthetic DOM，非原生瀏覽器 |
| 遠端 CI | 以新 Draft PR 精確 head 的工作執行結果為準；不使用前身綠燈代替 |

初次 broad source 命令缺 `--experimental-vm-modules`、未建立 `.sites-runtime`
fixture 目錄，且 working tree 尚未 commit，使需要 committed HEAD 的檢查失敗；
修正執行前提後重跑。舊 offset 負例曾因新文件前綴移位而沒有測到原 span，
已先精確 inverse 回原 main 再執行原完整變造，沒有刪除或縮小負例。
原始失敗輸出保留於 Dot `/tmp/inventory-*.log`，不把它們計為 PASS。

## 驗收界線

程式測試不是 Diem 帳號實站驗收。未測真實站網路／Worker/D1/R2 延遲、圖片
選取與解碼、原生 modal「確認送審」等待、實體手機、真人 IME 或跨電腦。
本次 backend `submit-write` 包含確認後的真正送審 request；
`confirm-review-write` 是另一合成 reviewer 核准，不能當成前端確認 modal 耗時。
「完成修改」保留原前端 RAM 套用，既有 UI 測試驗證零 PUT/POST，未宣稱其提速。
不使用原測試記錄、既有 UNKNOWN 或原中控連接器來補驗。

最終產品範圍只有四檔：`lib/inventory-read-ahead.mjs`、`lib/versioned-shared-workflow.ts`、`app/api/tooling/iqc/route.ts`、`app/api/routine-equipment/route.ts`。無資料模型／schema／帳號或媒體格式異動。原生瀏覽器與實站速度仍須另驗。

## 整合已合併 #120 的共同候選

固定兩個真實公開來源：速度 `8f94d0f38e11fb1eb24df86044ae0103252d1dfe`；
已合併 #120 的 main `c6ac41a6a996ac88e1b68370b371aed400773e34`。
四個衝突為 CHANGELOG、HANDOFF、`ipqc-speed-assignment-source-contract.cjs`
與其 integration-source test。文件逐段保留兩份新增資訊；共用 provider 保留
wrong-target fence 並串接兩套 exact inverse。新增 `inventory-main-source-contract`
只處理已 pin 全檔 hash 的共同來源，能各自還原兩個真實父版本；unknown／partial／
wrong path／wrong target／byte drift 均不採用。兩份既有 manifests 完全不改。

完整 main 產品增量三檔與原速度產品四檔都 byte-exact 保留；沒有改兩邊功能或校驗。
原檢具功能工作、權限工作與後續 AQL 工作未納入。原 50ms／10ms 量測保留為舊
候選證據；共同候選重新以 c6ac41a6 source archive 作 baseline，使用同一 fixture、
三對交錯 50ms I/O、完整 response 消費，另保存新原始結果，不冒充實站成效。

重現新 baseline：

```bash
SPEED_BASELINE_COMMIT=c6ac41a6a996ac88e1b68370b371aed400773e34 SPEED_PAIRS=3 SPEED_IO_MS=50 python scripts/compare-tooling-equipment-speed.py /path/to/main-c6ac41a6 /tmp/joint-paired.json
```

新 CI／回歸及量測結果將綁定共同候選另外記錄；原單支 PASS 不自動代表共同候選。

共同候選本機回歸：完整 source／歷史防護 922/922 PASS；inventory 保存／衝突／權限、#120 明確採用新版／製程保存集中 310/310 PASS；TypeScript、guarded build PASS。新測試 tuple 型別推斷曾觸發 lint，改為具名物件枚舉後，全部原 49 個雙父版本 proof 重測 PASS；原斷言和 scope 清單未減少。全專案 lint 亦重驗。原輸出保留在 Dot `/tmp/inventory-joint-*.log`。

### 共同候選速度重驗結果

基準為已合併 #120 的 main `c6ac41a6a996ac88e1b68370b371aed400773e34`；after 為本機 `eb91adcc6b72723e9295f4cbc12e53ab3524539e`，三輪 runtime hashes 全同並核對最後來源。完整原始數據：[joint-paired-50ms.json](joint-paired-50ms.json)；精簡及 hashes：[joint-summary-50ms.json](joint-summary-50ms.json)。原 10ms／50ms 舊組保留，不以舊數據代替共同候選。

同一 fixture／環境／50ms 每 I/O、三對交錯、無刪樣本；單位 ms。GET／CAS／wire bytes 範圍前後完全相同。

| 步驟 | 模具寫入／讀取 前→後 | 模具刷新 前→後 | 檢具寫入／讀取 前→後 | 檢具實際畫面刷新 前→後 |
| --- | ---: | ---: | ---: | ---: |
| 初次讀取 | 2145 → 1842 | — | 797 → 646 | — |
| 存草稿 | 2471 → 1715 | 2144 → 1797 | 2723 → 1979 | 925 → 769 |
| 送審 request | 2505 → 1830 | 2119 → 1844 | 2718 → 2201 | 969 → 866 |
| 撤回 | 2397 → 1752 | 2101 → 1815 | 2692 → 2234 | 924 → 790 |
| 再送審 | 2535 → 1799 | 2112 → 1824 | 2759 → 2139 | 922 → 771 |
| 合成 reviewer 核准 | 2306 → 1560 | 2027 → 1766 | 2402 → 1694 | 770 → 676 |

檢具 workflow GET：2305 → 2253 ms（本組總時間僅小幅改善，沒有隱藏）；Tooling IQC 唯讀來源：577 → 329 ms，仍只有一個合成 IQC 產品，未驗收大型 catalog。

這些是注入延遲的隔離結果；未量到原生確認視窗、真實站速度、照片解碼或 Diem 實站效果。共同候選沒有降低驗證或提早成功；schema／資料／帳號／權限無異動。

## 第二輪實際客戶端與完整性檢查

基準是已發布 #121 `cd17b8774ee80a9a9cfe68c1b30c90eecc625f64`，候選同時整合已合併 #122 的 main `346c5eefcca7621c481802502cbae61f2821e91d`。三個合併衝突為 CHANGELOG、HANDOFF、process-platform-adopt-source-contract，逐段保留雙方；新增精確雙父 inverse 與漂移拒絕測試，原 manifests／斷言保留。AQL 兩個產品檔 byte-exact 同 main；既有四個速度產品檔 byte-exact 同 cd17。

前輪基準 workflow URL 未加 compact，而 shared client 會加入 `compact=1`。前輪數字保留為非 compact 相容路徑的歷史證據，不能直接代表目前客戶端總等待。這輪使用實際 compact workflow、原設備 page GET，並新增 Tooling checks 等待。

根因：`/api/tooling/checks` 原本內呼完整 workflow GET，計算所有寫入按鈕權限、序列化整份 workflow 後解析，只取 working/saved；checks 的 URL 不符合 workflow 的 read-ahead/並行權限 opt-in。診斷顯示每次 32 SQL、25 can。改為同一授權前置與選定 snapshot，使用原完整 prepared model、parseTooling、toolingChecksInput、原 IQC handler、歷史來源及問題函式；末端保留全域 revision 409，另核對 session 撤銷。沒有略讀任何 R2 body、放寬驗證、隱藏等待、改成功條件或改刪除。新檢查為 11 SQL、3 can；R2 GET 數、CAS（0）、回應 byte 數不變。

Node v24.22.1／Dot Linux，真 TypeScript handlers 與 session revocation SQL，記憶體 SQLite／Map R2。366 模具、119 檢具，各 20 歷史版本、8 無關 aggregate、1 個 IQC part；photos 0、速度 fixture 無轉移。每個 DB/R2 I/O 注入固定 50ms，三組交替 before/after，無丟棄暖身。已控制 Begin，設定與 Begin 排除；read 是 Begin 後讀取，非完整登入／開編輯計時。Save 包含 guarded local edit＋原子 Save，未另假設獨立 Apply 請求。讀取、每個寫入、刷新、checks、IQC 分開量測，整個回應均消費完。

測量期間候選 HEAD 尚為 cd17，after 為未提交合併樹；每輪 runtime hash 全同，測量後逐檔核對候選實際 bytes，最終 commit 綁定同來源。精確 hashes／摘要：[round2-summary-50ms.json](round2-summary-50ms.json)，原始三對：[round2-paired-50ms.json](round2-paired-50ms.json)。以下為中位數 ms，相對已發布 #121 的新增效果，不重複計入第一輪收益。

| 模組／分段 | 前 | 後 | 改善 % |
| --- | ---: | ---: | ---: |
| 模具 read | 1845 | 1744 | 5.5 |
| 模具 open-checks-ready | 2414 | 1025 | 57.5 |
| 模具 save-write | 1783 | 1724 | 3.3 |
| 模具 save-refresh | 1786 | 1826 | -2.3 |
| 模具 save-checks-ready | 2487 | 1064 | 57.2 |
| 模具 submit-write | 1872 | 1834 | 2.0 |
| 模具 submit-refresh | 1806 | 1822 | -0.9 |
| 模具 submit-checks-ready | 2455 | 1048 | 57.3 |
| 模具 withdraw-write | 1727 | 1762 | -2.0 |
| 模具 withdraw-refresh | 1803 | 1791 | 0.7 |
| 模具 resubmit-write | 1808 | 1784 | 1.3 |
| 模具 resubmit-refresh | 1926 | 1845 | 4.2 |
| 模具 confirm-review-write | 1538 | 1534 | 0.2 |
| 模具 confirm-review-refresh | 1753 | 1757 | -0.2 |
| 模具 relation-load | 315 | 307 | 2.7 |
| 檢具 read | 646 | 641 | 0.7 |
| 檢具 save-write | 1958 | 1894 | 3.3 |
| 檢具 save-refresh | 772 | 770 | 0.2 |
| 檢具 submit-write | 1906 | 1966 | -3.2 |
| 檢具 submit-refresh | 767 | 772 | -0.6 |
| 檢具 withdraw-write | 1931 | 1887 | 2.3 |
| 檢具 withdraw-refresh | 769 | 783 | -1.8 |
| 檢具 resubmit-write | 1980 | 1930 | 2.5 |
| 檢具 resubmit-refresh | 773 | 771 | 0.2 |
| 檢具 confirm-review-write | 1704 | 1633 | 4.2 |
| 檢具 confirm-review-refresh | 618 | 614 | 0.6 |
| 檢具 workflow-read | 2031 | 2069 | -1.9 |

未變更的寫入／主要讀取只有測量波動，不能把小差值宣稱為新增收益。這輪可重現的主要收益在模具 checks，就緒時間不等於寫入耗時；UI 本來在主要 readiness 後非同步載入 advisory，不能相加成畫面被阻塞的總延遲。檢具開啟編輯的引用／FQC-IQC transfer 及主要 API 反覆權限成本仍由獨立 #123 的 request-local phase 與功能修復處理，本輪不抄入或重做。

### 資料與故障回歸

[嚴格成對 handler 結果](round2-checks-contract.json)：366／1000 模具，各 2196／6000 轉移，14 步／端／規模。working/active/問題及完整 checks metadata hashes、I/O 逐項一致；涵蓋未保存、修改、saved 相同／不同、無登入、無關 aggregate 損毀、目標損毀、IQC 損毀與 revision 漂移；所有 checks 零寫入。原 paired 比較斷言完全未改。新增實際 handler 權限／跨請求撤權、前置撤銷、模型／IQC 載入中撤銷、global revision、legacy inline 測試。

### 整合及未驗範圍

#123 當時 head `a6f13841ca910e9a026baabf1ede9bfb4dbc2d27`，仍獨立；共同檔案包含 CHANGELOG、HANDOFF、lib/versioned-shared-workflow.ts、scripts/process-ipqc-frequency-source-contract.cjs、scripts/process-platform-adopt-source-contract.cjs。須保留 #121 原 bounded opt-in 與 #123 phase，不可用整檔覆蓋；來源 proof hooks 需精確整合並重驗。新 checks route 未與 #123 重疊；共同權限函式仍須在後續整合時重驗。

未跑真實 Site／Diem 帳號／原生確認視窗／實體裝置／照片解碼網路／部署後速度／Worker OOM 實站驗收。照片 640×360 的現場敘述不是本輪精確基準；未操作該記錄。FQC/IQC 反查、檢具編輯、AB OOM、刪除功能修復均未納入；schema、資料、帳號、ACL、D1/R2 及部署未改。程式測試不能代表 Diem 實站驗收。

重現：git archive cd17 到獨立 baseline，複製相同 scripts/benchmark-inventory-round2.cjs，再執行：

```sh
SPEED_BASELINE_COMMIT=cd17b8774ee80a9a9cfe68c1b30c90eecc625f64 SPEED_BENCHMARK_SCRIPT=benchmark-inventory-round2.cjs SPEED_PAIRS=3 SPEED_IO_MS=50 python scripts/compare-tooling-equipment-speed.py /path/to/cd17 /tmp/round2.json
NODE_PATH="$PWD/node_modules" node scripts/test-tooling-checks-paired.mjs /path/to/cd17
```

測試與 CI 最終結果隨本輪 commit／PR 更新，未完成的 CI 不稱 PASS。

### 第二輪本機完成結果

[驗證摘要](round2-validation.json)：本機合併 commit `3ebef058b3804e9a3079fa9cdc984ca88315f6b7` 完整 source 970/970 PASS，功能集合 918 項中 900 PASS、18 啟動失敗。900 包括新增 8 項權限／撤銷／inline、Save／Apply、送審／撤回／再送／核准、快速點擊、失敗原回執查詢、刷新及資料保留；原 paired 比較 PASS。lint／TypeScript／guarded build／來源邊界及 29 個變更檔安全掃描 PASS。

18 項不列通過：7 項原生 Chromium 與 11 項 compiled UI。首次 runner 預設瀏覽器與 compiled 的 PROCESS_PROGRAM_COMMIT 設定未就緒；使用既有 `/usr/bin/chromium` 並補上精確 commit 後，原生及單項 compiled 診斷都明確遇到 `socket() failed: Operation not permitted`、SIGABRT。compiled 失敗 fixture 仍持有 runtime，記錄錯誤後中止；未改 flags、護欄或測試斷言以繞過。這是本機瀏覽器驗收阻擋，不是全功能 PASS；GitHub CI 的可執行測試也不能推成實站驗收。詳細原始 logs 留於 Dot `/tmp/inventory-round2-*.log`。文件與 evidence 更新後另跑受影響來源 proof，產品 runtime hashes 未變；精確 GitHub commit／CI 以 PR 當前 head 為準。
