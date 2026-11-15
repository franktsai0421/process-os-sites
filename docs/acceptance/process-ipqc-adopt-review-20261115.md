# 製程 IPQC 採用新版與切換後送審檢查

基底：重新 fetch 後的遠端 main `e040a7e838133c0c9870850a49955cf045dbc02b`。獨立 worktree／`fix/process-ipqc-adopt-latest-20261115`；Node 24.22.1、鎖定依賴安裝（不執行 lifecycle scripts）。只準備 GitHub Draft PR，不合併或部署。

## 根因與行為

1. `process-ipqc.js` 的舊關聯提示原本只有移除；另加的比較／採用鏈僅支援 AB，須先比較才顯示採用。C 無此入口。勾選保留的是穩定 item ID，詳細區讀的是當前核准來源，因此「看見新版內容」不能證明 assignment 的版本已更新，移除重選也不能代表直接採用成功。
2. 目前每個仍有可用核准候選的舊關聯明確顯示「本方塊已選取」與「採用核准新版」，附原／現行版本。AB 原有精確歷史比較保留；直接採用透過已授權的 current choices 與新鮮 PROCESS authority，不要求額外品質歷史查看權。無法讀取舊歷史時不製造歷史 diff。
3. 採用前固定身分物件／epoch／delivery、view、表單 revision、shared generation/revision/saved ID、原 assignment 及產品。點擊後重新讀核准候選，必須與畫面所示投影一致，再讀 PROCESS 權限、pending、draft、共享目標及同範圍占用；任何改變保留輸入。C 檢查跨 workspace 同工段占用，包含尚未 Save 的釋放；後端 Save 的 source/CAS/unique-owner 防護不變。
4. 只更新本機 tuple 的版本及適用產品，保留未知 metadata。以原 lazy detail refresh 更新檢查標準、產品、照片、檢具與頻率，保持展開／收起，更新勾選與警示。完成編輯後仍需手動存取草稿；不寫品質來源、不自動保存、不建立另一份 store。
5. `process-authoring-v3.js` 原有 filter 切換先 render，再以原 history display epoch 驗證。舊 history watcher 在類別已切換後 refreshControls，看見舊 context 失效便呼叫 onBoundary，連新畫面一起失效，造成 `CANVAS_REVIEW_CHANGED`。inspection 也以類別／線別固定，切換後失效且沒有新排程；沒有背景 polling 時送審持續 disabled、顯示尚未檢查。已用精確 main 的實際 controller 重現，非以 console 名稱推論根因。
6. 成功切換前明確 retire 舊 history watcher，再以新 display epoch 驗證；actor、delivery、generation、唯讀與 navigation 防護仍在。成功的 filter／line／stage 切換後安排新的全平台內容檢查並刷新控制項。檢查未完成、版本不符或失敗仍禁止送審；明確 Retry 恢復，不略過 saved snapshot 或權限驗證。

AB 仍按線別／產品類別／工段，不依方塊產品篩選；C 仍按方塊產品／工段。進出站沒有 IPQC 頁面。無 schema、migration、帳號權限、實站業務資料或歷史資料變更。

## 與並行工作交接

另一品質工作現有 `1d27fd317a5e64a989e5bdfbc9af5c839cb11eba` 的核心是 equipment/FQC、AB response、版本 history feedback。本工作未搬入其未提交內容或提交。已知共同檔案為 `public/process/index.html`、`scripts/ipqc-speed-assignment-source-contract.cjs`；文件另共用 `AI_CONTEXT/CHANGELOG.md`、`HANDOFF.md`；若後續整合應逐行保留各自快取 tag 及精確新來源投影，不整檔覆寫。原使用者分工後將製程送審項正式轉交本工作，本 PR 同時包含上述兩項製程修復。

## 驗證與界線

| 範圍 | 實際證據／狀態 |
| --- | --- |
| 已選／保留／占用與 AB/C 規則 | 原 assignment-state 33 案先行 PASS；完整定向回歸另見最終結果 |
| A/B/C 直接採用（48/48 PASS） | `process-ipqc-latest.test.mjs`：雙語、詳細區展開／收起、單筆選取、檢具與標準、完成後原子 Save、重新讀取重開；權限、來源、peer、跨 workspace、epoch/delivery 及重複點擊拒絕 |
| 精確來源與歷史比較 | 原 source-adopt 96 案保留（fixture 抽出共用）；新 exact successor inverse 固定真 main，保留原歷史 manifests 與全部漂移／EOL 反例 |
| 切換後送審 | 新 inspection-view 5/5 PASS，包括精確 main 失敗重現、修復後 filter、line/stage 新檢查與版本不符 Retry；既有 approved-history 26/26 PASS |
| 舊 Save／內容驗證 UI | `test-authoring-save-validation-ui.cjs` 30/30 PASS，含 malformed snapshots、UNKNOWN、不重送、重複 Save、新舊 response race |
| Renderer 語意 | `entry-performance/ipqc-index-semantics.cjs` PASS，保留 first-match／重複 ID／完整 warning renderer／權限 handler 反例；新 action 另由完整 module 測試驗證 |
| 型別 | `tsc --noEmit --incremental false` PASS，無 diagnostics |
| lint／build／集中回歸 | PASS：lint、非增量完整型別、sites-source-check；功能集中 419/419、來源／歷史集中 542/542、EOL 96/96。最終 runtime 候選 `578f92411618394e18afe6cfaa4cb4fad2784d93` 的 build exit 0、postbuild auth check PASS；後續只補此紀錄與其精確文件 inverse，未改 runtime |
| 本機原生 Chromium | BLOCKED：啟動時 socket() EPERM、SIGABRT；無任何瀏覽器案例執行，不提高權限重試。擴充現有 CI browser runner 驗證 C 直接採用、展開、Save、full reload；保留原 AB v2→v3 歷史採用與所有原案例 |
| 實站／真人／實體手機／真 IME | NOT_RUN。未操作既有測試站資料，未部署；viewport 模擬不代表實體手機驗收 |

所有測試資料為隔離合成資料；本機 API／DOM／SQLite/R2 port 測試不代表 hosted Site 驗收。完整遠端 commit、Draft PR 與該精確 head 的 CI 狀態由最終交付列明。

## 固定候選集中結果

- 功能 419：`node --test` 執行 latest／source-adopt／assignment-state／link-rules／source-history-route／atomic-save-stack／pending-form-admission／inspection-view／approved-history／submit-outcome／review-recovery。
- 來源 542：既有 assignment／link／lines-joint／lines／save-recovery／navigation／receipt-recovery／password／accounts-process／platform-canvas／background source tests，加本輪 exact successor tests。最初未登錄新文件／fixture 來源以及舊 cache tag 的失敗已修正；未改原歷史 manifests 或移除斷言。
- `test-authoring-save-validation-ui.cjs` 30、`entry-performance/source-eol.test.cjs` 96、`test-process-ipqc-c-query.cjs` 24 群組 PASS。
- `test-authoring-ipqc-assignment-reuse.cjs`、`test-authoring-ipqc-read-reuse.cjs`、`entry-performance/ipqc-index-semantics.cjs` PASS；讀取重用載具包含 17 對、34 GET、9 規則負例，全部零寫入。
- 這些 local PASS 不取代 PR 精確 head 的 CI／原生 runner 結果。未全面重跑無關 FQC、模具、檢具、備份還原或其他模組瀏覽器；它們沒有本輪產品修改。未進行正式資料或員工資料包遷移。


### 首輪 CI 的來源鏈適配

`ba6cba2ed11c7780052ad5767465937dd1acb139` 的 Process IPQC link rules（Linux 原生及 Windows）與 Process review recovery（桌面／手機尺寸）均已成功。IPQC operation speed 的來源測試發現兩處尚未適配：新 inverse 在 wrong target 之前執行，破壞「未知 target 原樣返回」反例；另舊完整 runtime 斷言未先經過已固定的新 successor inverse。只調整 helper 的 target 先驗證順序、把已核對完整 inverse 接入原 byte-equality 斷言；歷史 manifests、全部反例、獨立父系範圍枚舉與產品程式不變。新 head 的實際 CI 另列於 PR／交付，不把前身 PASS 當成新 head PASS。


### Local safety 第 19 步 DOM oracle 適配

回報精確 head `12ea56b4744429bb988a93dbf486b652c2d59d80` 的 run `43688410584`／job `132733677399`，第 19 步 `Performance and departure integration contracts` 失敗，其餘 job 尚繼續。未使用 rerun、skip 或修改該 workflow；原 Windows job log 在調查時尚未釋出，不能以本機推論代替 Windows stack。

從原 workflow 擷取九個 Node 命令與六項 baseline 路徑環境變數，以固定 `ca6647977a8680038444ce2c1ba4e80f2343cd0a` 的六份原始 Git blobs materialize 並驗 hash。原 Dot Linux／Node 24.22.1 按原順序重現：前七個子命令通過，第八個 `node scripts/test-process-ipqc-choice-dom.cjs` 在 `alignReviewedRetainedWarning` 全樹 deep-equality 失敗。實際 DOM 比舊 oracle 多出已核准需求新增的「本方塊已選取；目前保留原版本關聯」段落；沒有缺標準、照片、檢具或權限防護的觀察證據。

只在既有獨立預期樹加入這個精確的中／越文段落，保留 49 項目的完整展開 DOM、勾選／占用／保留、照片／規則、錯誤及唯讀比對。另加兩語各三個負例：缺少、重複或改動此段落必須使完整 warning-tree equality 拒絕，不能把新內容普遍移除／忽略。固定 baseline、測量門檻、全部既有斷言及產品程式不變。

修正後從同一 workflow 重新擷取並依序完成全部九個 Node 命令，exit code 皆為 0；其中 departure／performance 群組 451/451，DOM 14 項檢查（含六個新增負例）PASS，後續 choice-read PASS。本機為 Linux，不冒稱 Windows／原生或實站驗收。Windows 精確新 head 的結果另以 CI 查證。與另一檢具／模具工作的共用產品檔案完全不動；本增量只包含這份測試載具、它的精確來源 inverse 及本紀錄。既有 12ea head 的 lint／型別／build 與原生結果可作未變產品的證據，不能取代新 head 的完整 CI 結果。
