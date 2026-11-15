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
