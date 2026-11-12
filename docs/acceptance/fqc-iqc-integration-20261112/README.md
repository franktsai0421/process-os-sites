# FQC／例行 FQC／IQC 整合追蹤

Base main `9fbba823090f03da8385c8d92f5e59293d19d2f1`。本次以獨立目錄、新分支及單一 Draft PR 交付；禁止合併、部署、真資料操作。

初次整合固定來源：main `9fbba823`；#102 `55d4672c`；#103 `2d2d79cb`；#104 `429d3bfa`。來源與逐檔候選 hash 見 `cloud-source-selection.json`。歷史 PASS 不當作本候選 PASS。


## Cloud 第二批候選（2026-11-12）

單一 Draft PR #105，分支 `codex/fqc-iqc-cloud-integration-20261112`；第一批 `b049d269` 已驗遠端 SHA/tree。其後增量仍以同一 PR 交付。來源檢查確認 #104 在本模組路徑沒有 main 未含的額外 commit，沒有搬移其 PROCESS 改動。

已加入：FQC/IQC 同頁核准歷史與晚回應隔離；例行整頁單一草稿及舊文件歷史；FQC/IQC Save 在 immutable encoding 後重驗 session；IQC 照片 PUT 期間 peer 變更於同次 Save 重比較，重用確認 URI；設備替換各自保存 FQC／IQC 目標整份已套用草稿，不送審或搬其他頁未送表單。

資料切換尚未執行。`scripts/prepare-routine-fqc-page.cjs` 只接受 stdin、輸出候選 JSON，不存取 DB／網路，保留舊 document ID／歷史／收據；遇待審資料拒絕。需在獨立驗收資料副本核對輸出與原始 SHA，再依另外授權的資料切換程序採用；舊 layout 不會被 GET 自動改寫。

本輪已有實測：例行 kernel／handler（inline、records）與 UI 流程；歷史撤權／晚回應及 FQC 往返；IQC 本機照片 19 項；encoding 途中撤 session 2 項；編譯後 IQC HTTP 1 項。最新集中結果及 CI 另附更新，舊實測數字不沿用。型別、lint、受保護 build 已通過一次，其後候選會再執行。

Cloud Chromium 下載實際回應 `403 Domain forbidden`，未改用替代主機繞過；後確認環境已有 `/usr/bin/chromium` 154，可用於本輪原生瀏覽器回歸，CI 另獨立驗證。所有測試使用合成身份／資料及私有暫存 SQLite/R2。真人新增／編輯、實體手機、當前正式 500／延遲根因及真實 IQC 缺漏數字仍未驗收，不能宣稱 17 項全部完成。

|需求|目標|已查來源／現況|本次狀態|
|---|---|---|---|
|F1|效能／500／處理中|main 已含 bounded read/write 與 lifecycle8；#103 有安全測試修正|集中功能回歸通過；CI 多人計時另驗，正式 500 根因仍缺現場證據|
|F2|一次全域衝突選擇／取消／晚輸入|905f7c4、d9ab90e（#102）|已增量整合；集中衝突／取消／晚回應回歸通過|
|F3|同 ID 刪除及矩陣關聯|a3a9d6f、#102 retained-deleted tests|同 ID／最小關聯合成回歸通過；真人驗收待辦|
|F4|寫途中撤權／帶參數 API|#65 已在 main；#103 302e7515|選取 #103 讀取安全與最終 session fence；撤權回歸通過|
|F5|設備替換同鍵保存|main #87 cb31e9e、6a7f665、ce83a52|既有原子 Save 保留，新增 IQC 目標；編譯瀏覽器另驗|
|F6|靜默離頁／無恢復無輪詢／UNKNOWN|main #77/#100；#102 compared Begin cancellation|保留已送收據；跨頁／舊 callback／送審 pins 回歸通過|
|F7|同頁核准歷史／權限分離|39dc18a、978bbc4、#103|已增量整合；集中衝突／取消／晚回應回歸通過|
|R8|例行 FQC 整頁單草稿|e5c3c78、#102；#103 同頁安全後續|整頁實作與生命週期回歸通過；離線切換工具就緒，未改正式資料|
|R9|晚 Save／照片去重／歷史撤權|8b68291、#102 photo outcomes、#103|已整合；集中晚回應／照片／歷史撤權回歸通過|
|I1|缺漏分類與統計|main #70|既有實作；不將舊數字當現況，不填業務資料|
|I2|固定抽樣 0 提示／送審擋|main #90（非 #88）|保留 main #90；提示與 Save／Submit 分界合成回歸通過|
|I3|三方比對／順序衝突／取消|905f7c4 文件指明來源 13ef792；17daaf7、338e1e4、71c98ae|使用可追溯後繼 905f7c4；全域選擇與取消回歸通過，未冒稱取得 13ef792 物件|
|I4|必要同 ID 與上層／新增權限|905f7c4、lib/iqc-local-save.ts|已整合同 ID 最小復活及新增權限；沒有歷史還原入口|
|I5|照片預覽／首次存取／UNKNOWN|e046c18；main 原始 UNKNOWN 保護|RAM File／結果查詢／照片競態回歸通過；11/4 未知新增不重送|
|I6|已有獨立頁草稿／離頁鎖|main #77；905f7c4 compared Begin|保留獨立頁草稿；取消／離頁／晚回覆回歸通過|
|I7|設備目標草稿／歷史／角色|2245941；#103；main 設備流程|IQC 目標原子 Save 與同頁唯讀歷史已整合；編譯瀏覽器另驗|
|I8|速度／撤回修改再送審核准|main lifecycle；完整候選|合成完整生命週期通過；當前實站量測待辦，歷史約 12.5 秒非目前數字|

## 驗證與界線

集中候選 1116/1116 PASS；相鄰模組 284/284、離頁與送審 pins 189/189 PASS（集合有重疊，不加總覆蓋率）。取消／換頁／撤權／並行與生命週期均有合成回歸；型別／lint 通過。受保護 build 已通過，最後修正後再以新 HEAD 重建。CI／原生瀏覽器最後結果以 PR 當前 HEAD 為準。模擬不代表真人驗收；實站效能、實體手機、IME及真人兩人皆待驗。5秒以上優化、10秒以上強化以實測為準。

保留 FQC V31 已核准、V32 部分保存重載及矩陣成功但當時未送審；IQC #70/#90 歷史 V41，待審造成未驗收的項目不當成新缺陷。站點 v41/v42 非目前 Git 來源證據。

無新 schema、資料移轉、業務資料或帳號操作。所有 UNKNOWN 原操作保留並先查結果；Git immutable objects 與 branch ref 分別驗證。

## Codex Cloud 接收與首批預檢（2026-11-12）

私人對話交付 8 批 52 檔相對 main 的原始 patch（含未提交修改），逐檔 bytes/SHA-256 全部相符；組合 patch 561210 bytes，SHA-256 `3f2894b2f718a1119b266a24107ba44ae21dc0cc610917cc90cdcf2ab8d3b61a`。未取得 ZIP/bundle，不冒稱驗過其完整性。傳輸內容保留在 repo 外，未帶其他模組成果。

本 Cloud 新分支從相同 main 建立並先通過 apply --check。來源 #102 固定 `55d4672cb8004d0b01715714cbc91fbce6b22d2b`；#103 最新 `2d2d79cb23c4456e28adc4cdfc60624ec4f5e24b`，#104 最新 `429d3bfad9a5b4e1f937b9546201619ca5f65131`，均只讀，取代上方交接時觀察。52 檔未包含後續整頁/歷史/權限整合，17 項仍需逐項續修。

原成果首輪 439 項：434 PASS、5 FAIL，失敗皆為缺 82c Git 物件。有限 witness 從固定 #102 保留的真實物件重建，每個 type/raw Git SHA-1 及路徑均驗證；保留所有舊 handler/呼叫端/依賴 hash 反例，不寫入假的 Git 歷史。定向複驗 53/53 PASS（與首輪有重疊，不加總覆蓋率）。依賴從 lockfile fresh npm ci 安裝，沒有 symlink。

完整候選測試/效能/CI/測試站/真人驗收仍未完成；本段只是接收與首批隔離證據。

## 收尾修正

已確認舊世代 Save 的私有換代證據後，FQC 會退休舊 attempt、保留目前表單並只查原收據；沒有證據仍拒絕跨代恢復。共用 `lib/shared-draft.ts` 與 main 完全相同，例行整頁 UI 對本人的退回／核准皆沿用 main 自審確認。歷史欄位衝突測試固定讀 main 真實 Git 來源，另加目前全域選擇的原生測試，保留舊反例。

舊例行 document layout 保留 main 的 Apply → read → Save → read 相容協議並加入唯讀顯示隔離；210 項舊資料、收據、晚回應及離頁回歸通過。新 page layout 走獨立整頁 atomic Save，沒有以逐文件 Save 代替整頁。CI-only 多人測試改用實際核准歷史選單，合成初始版本具有明確合成核准事件；正式指標本身仍不算核准歷史。

## 最終測試收尾與來源重驗

收尾觀察 main 仍為 `9fbba823`、#102 為 `55d4672c`；#103 新增至 `fb62c259`、#104 至 `15a5acb4`，新增差異沒有 quality runtime。僅選取 #104 的 test-only shell bundle oracle，先核驗來源 blob `55bb1d977be8f91eee09fac4e2d5b137e1cddc9a`／`3b0d7b51fce310f459d9f29f0bd507c765198048`，再改為 main 固定 50 支加本任務兩支 routine 腳本的獨立清單。保留錯序、遺漏、私有檔洩漏、錯誤 URL／位元組／完成收據及 LF／CRLF 反例；未搬入 PROCESS 功能。

`8780455` 的 164 項打包／送審／相鄰契約、12 項編譯根入口，以及 lint、型別、受保護 build、全 Git 歷史／worktree 預檢通過。例行 Submit fixture 載入實際唯讀顯示 guard，新增核准歷史阻擋寫入反例。後續僅測試補強：原成對 FQC Apply／lifecycle8 測試更新為精確多一次最終 session 查核，同時驗證編碼 PUT → 既有 phase 檢查 → 額外 session 檢查 → CAS 的順序；在第二次編碼後查核注入撤銷，Apply 與五項生命週期皆須 401、DB 不變、無收據發布。58 組 Apply 與 180 組 lifecycle8 成對回歸通過，原 DTO、歷史來源、非授權讀取、寫入拒絕及 immutable 內容斷言保留。

較早候選 CI 已通過原生 49 項、完整生命週期 5 輪／160 樣本及多人矩陣 5 輪／60 樣本／25 功能檢查；0 非預期請求。Save 中位數約 130–147 ms，僅為合成 CI。最新提交的 CI、遠端 SHA 與完整 Windows 結果更新於同一 Draft PR #105；較早結果不冒稱最新 HEAD 已全數通過。未操作正式資料，真人及實站事項仍依上表待驗。

後半段提前回歸另查獲實際 IQC 缺漏：設備頁 identified Begin 被 client 的 FQC-only 條件誤拒。修正僅容許既有 bounded IQC endpoint／scope 與 durable client，加入錯誤 scope／endpoint／非 durable 的零請求反例。IQC 原子移轉已保存時不再顯示未儲存或刷新其他頁；UNKNOWN 顯示原收據待查，既有標記保留。105 項輸入／Begin／恢復、83 項移轉意圖與四模組真實 handler 全流程回歸通過。FQC／IQC 舊輪詢反例固定使用已核 SHA 的 main Git 物件；目前兩模組嚴格斷言不存在閒置輪詢，另由當前原生流程驗證。新增編譯 IQC 失去 identified Begin ACK、離頁／重載後只查原收據而不自動 Save 的原生反例，結果列入最新 CI。

最新編譯 IQC 反例已通過：Begin 已提交但 ACK 丟失時，離頁及重載保留兩份原標記；恢復只發 GET，未自動 Save，工作稿仍引用原設備且 saved=null。缺漏清單舊瀏覽器 fixture 補上精確 delivery token（以參考相等判斷當前頁），兩種語言／三種尺寸均通過定位、取消、保留未送輸入及即時語言切換；未放寬產品 owner 檢查。舊照片組合 17 項、FQC 目錄與 IQC deferred projection／歷史輪詢反例亦通過。

來源預檢曾因既有合成儲存鍵的 fixture blob 更新而拒絕；推送命令當時仍繼續，已明確記錄此失敗而未宣稱通過。經逐 byte 比對，`349553800bb7b67c7f0a3684efe224da7e9b547a` 僅比原已核 fixture `f4c1d47bb90371b329c2f53f0b55a3023c09de3e` 增加 `this.isConnected=true;`，分類內容仍是同一個合成 actor／endpoint 儲存鍵。沿用既有精確複審機制追加 `e550da35585d8669b8f589b4f906c19a37e88b9b`／該 path／blob／WORKSTATION_PATH tuple；原掃描 pattern、來源 anchor、真實 Git 祖先／tree、敏感項目及變更後拒絕規則全部保留。新增單一差異證明、缺祖先／錯 tree／錯 path／改 bytes 反例；沒有新增目錄或通用格式豁免。完整歷史及 worktree 預檢隨後通過。

Windows `43176912352` 在 `5f8e39d` 的快照／授權階段停於舊 Routine unload fixture：它仍強制抽取已依目前需求移除的 beforeunload 提示，讓 48 個案例在執行 Save 前即失敗。修正為驗證目前沒有該提示、page layout 分派至自身離頁 owner，並保留舊 handler 作歷史反例。原 Save 的完整 SHA pin 經精確三種 display/read 插入還原後仍須匹配；原 pending／角色／版本／UNKNOWN／晚回覆反例保留，新增歷史選擇／顯示 epoch 反例及歷史唯讀零讀寫拒絕。與 spinner 共 81 項本機通過，納入本 PR 專用 CI。此修改只涉及測試與證據，未改產品、權限或寫入協議。

## 全部 17 項及補充要求逐項補核

下列程式均已在本分支；測試證據使用隔離合成資料，不代表真人測試站驗收。來源 commit／main 已含項目沿用上表與 `cloud-source-selection.json`，不重搬或重寫。最新 HEAD／run／結果集中更新於同一 PR #105；失敗候選不冒稱成功。

|需求|現有程式證據|測試證據|缺漏與處理結果／尚待事項|
|---|---|---|---|
|F1 效能、500、處理中|`lib/fqc-workflow.ts`、`lib/versioned-shared-workflow.ts`、`public/process/fqc-master.js`|`scripts/test-fqc-record-mutation.cjs`、`scripts/test-fqc-lifecycle8-record-mutation.cjs`、`tests/fqc-draft-lifecycle-browser.mjs`|保留 main bounded 存取，已補最終 session 與晚收據隔離；最新產品 CI 5 輪／160 樣本通過。正式 500 根因、實站延遲仍缺現場證據，不冒稱已解決。|
|F2 一次全域選擇、取消、晚輸入|`public/process/fqc-master.js` compared Save owner／選擇流程|`tests/fqc-save-choice.test.mjs`、`tests/quality-comparison-callback-owner.test.mjs`|保留無衝突欄位；Mine／Theirs／Cancel、取消零寫入、晚輸入保留已有反例，未重寫。|
|F3 同 ID 刪除、關聯、矩陣|`lib/fqc-local-save.ts`、`lib/fqc-workflow.ts`|`tests/fqc-retained-deleted-save.test.mjs`、`tests/fqc-matrix-conflict-discard.test.mjs`、`tests/fqc-retained-deleted-ui.test.mjs`|僅必要同 ID／上層復活；矩陣並行與取消保留原關聯；不以歷史快照覆寫當前工作。|
|F4 寫途中撤權、API 參數|`lib/versioned-shared-workflow.ts` 最終 session fence；main `lib/shared-draft.ts` 保持原碼|`tests/quality-final-session-fence.test.mjs`、成對 Apply／lifecycle8 mutation scripts|已補 immutable encoding 後撤權拒絕；401／CAS 前停止／無收據及原 guard 均保留。|
|F5 設備目標原子保存|`public/process/routine-equipment.js`、各自 `/api/fqc/workflow`／`/api/iqc/workflow`|`tests/equipment-transfer-compiled.test.mjs`、`scripts/test-routine-equipment-four-module-transfer.cjs`|FQC／IQC 只 Save 選定目標整份已套用工作稿；其他頁未送表單、source equipment、active／cases 不變，不自動 Submit。|
|F6 靜默離頁、無輪詢、UNKNOWN|`public/process/shared-draft-client.js`、`public/process/fqc-master.js`|`tests/fqc-save-choice-navigation.test.mjs`、`tests/fqc-unknown-recovery-browser.test.mjs`、`scripts/entry-performance/poll-wiring.test.mjs`|未送 RAM 可離頁；已送 UNKNOWN 原收據保留且只查原結果，不重送；舊輪詢只作固定歷史反例。|
|F7 原頁已核准歷史、權限分離|`lib/master-approved-pages.ts`、`lib/master-page-boundary.ts`、`public/process/version-draft-ui.js`／`fqc-master.js`|`tests/tooling-fqc-approved-history.test.mjs`、`tests/quality-master-explicit-refresh.test.mjs`|僅有核准證據的唯讀版本，禁編輯／上傳／恢復覆寫；回當前頁保留未送輸入，撤權／晚 detail 隔離。|
|R8 例行同頁單一草稿|`lib/routine-fqc-page.ts`、`lib/routine-fqc-page-save.ts`、`public/process/routine-fqc-page.js`、page route|`scripts/test-routine-whole-page.cjs`／`-route.cjs`／`-ui.cjs`、`tests/routine-page-cutover-preparation.test.cjs`|page-v1 整頁一次 Save／送審；舊 document layout 相容保留。離線 stdin/stdout 準備已實作，正式資料切換未執行，不能列為完成。|
|R9 例行晚 Save、照片、歷史撤權|`public/process/routine-fqc.js`／`routine-fqc-page.js`／`routine-page-approved-history.js`、`lib/routine-page-approved-history.ts`|`tests/routine-fqc-approved-history.test.mjs`、`tests/routine-page-approved-history-ui.test.mjs`、`tests/routine-fqc-unload-contract.test.mjs`|原頁唯讀歷史與 File／UNKNOWN 保留已有測試；本次補修舊 unload fixture，保留完整 Save pin 並新增歷史／epoch 反例，未回退靜默離頁需求。|
|I1 缺漏分類、統計|main `lib/iqc.ts`、`public/process/iqc-master.js`|`scripts/test-iqc-content-issues.cjs` 兩語／三 viewport|main #70 已含，不重搬；保留定位、取消、輸入與語言切換。真實 IQC 缺漏數字未取得，不代填業務資料。|
|I2 固定抽樣 0、提示與送審界線|main `lib/iqc.ts` validation／blocking 與 `public/process/iqc-master.js`|`scripts/test-iqc-content-issues.cjs`、`tests/quality-submit-confirmation-pins.test.cjs`|main #90 已含；保留結構／數值拒絕、缺漏呈現及未存輸入不得 Submit，不降低權限或 validation。|
|I3 三方比對、順序衝突、取消|`public/process/iqc-master.js` compareLocalSave／Save owner|`tests/iqc-save-choice.test.mjs`、`tests/iqc-stable-lists.test.mjs`、`tests/iqc-save-choice-compiled-http.test.mjs`|整組一次選擇，stable IDs 保留無衝突資料，歧義順序採明確整欄選擇；取消零寫入。|
|I4 必要同 ID、上層、新增權限|`lib/iqc-local-save.ts`、`lib/iqc-workflow.ts`|`tests/iqc-revive-save.test.mjs`、`tests/iqc-revival-wire.test.mjs`|最小必要復活，guard／create 權限／pending／版本均保留；未提供歷史還原草稿入口。|
|I5 照片預覽、首次存取、UNKNOWN|`public/process/iqc-master.js` staged File／照片上傳與原收據|`tests/iqc-local-photo-save.test.mjs`、`tests/iqc-unknown-browser.test.mjs`|File 留 RAM，Save 才 PUT；PUT 後 peer 變更於同次 Save 重比較、重用 URI。UNKNOWN 只查原收據，歷史 11/4 未知新增不重送。|
|I6 獨立頁草稿、離頁鎖|`lib/iqc-workflow.ts` key/scope、`public/process/iqc-master.js`|`tests/iqc-save-choice-navigation.test.mjs`、`tests/quality-module-command-isolation.test.mjs`|本次新增實際雙路由同時草稿／待審測試；雙向各自 Save／Submit／撤回，錯用對方 case ID 必須拒絕且資料／收據不變。|
|I7 設備目標、原頁歷史、角色|`public/process/routine-equipment.js` bounded identified IQC Begin、`lib/iqc-workflow.ts`、IQC 原頁 selector|`tests/equipment-transfer-compiled.test.mjs`、`tests/iqc-approved-history.test.mjs`、`tests/shared-draft-begin-v1.test.mjs`|修復 FQC-only Begin 拒絕 IQC；仍拒絕錯 endpoint／scope／非 durable。歷史唯讀零命令，不能混送或覆寫歷史。|
|I8 速度、撤回修改再送審核准|`lib/iqc-workflow.ts`、`lib/shared-draft.ts`、`public/process/iqc-master.js`|`tests/quality-module-command-isolation.test.mjs`、`scripts/equipment-transfer-fixture.cjs`、集中 quality 回歸|保留各自 saved/case/generation；雙路由撤回後修改／再 Save／再送審／由另一合成 reviewer 核准及互不影響已補實測。合成計時不作真人延遲或改善幅度；真人修改／再送審／核准與實站計時待驗。|

補充隔離測試以實際兩個 route、正常合成登入、private SQLite／Map R2 執行。FQC→IQC 與 IQC→FQC 兩種順序均驗證其他所有值逐 byte 不變；同時待審案件、saved ID 分離，錯模組撤回 409 `CASE_NOT_PENDING` 且完整 state／immutable objects 不變；另保留 pending Save 拒絕，逐模組撤回後修改／再儲存／再送審／由獨立 reviewer 核准亦互不影響。與 unload／spinner 共 83 項通過。設備的桌面／手機編譯測試與三頁歷史測試沿用已完成成果，未重新製作功能。

目前分開三層：**已上傳程式**以 PR 當前遠端 SHA 為準；**合成測試**只標示實際通過的候選／run，本次 Windows 失敗已定位修正，修正候選仍須新的 CI；**尚未真人測試站驗收**包括實體手機／IME、真人兩人操作、正式 500 根因、實站延遲、實際 IQC 缺漏數字與正式 layout 資料切換。沒有合併、部署、正式資料／帳號操作。

後續 `ad1d3a6`／Windows run `43184445003` 已通過原 unload 失敗點及整合入口，另於目的頁資源斷言停在 97≠94：舊測試把 dashboard 基準直接與仍掛載 IQC 歷史 owner 的頁面比較。僅修測試：新增逐事件 profile，嚴格驗證 IQC 當前頁僅多各一個 delivery-invalidated／sync-status／pagehide listener，回 dashboard 必須與原基準完全一致，再掛載不得累積；原 interval／timeout／object URL／無 document reload、撤權與零非授權 mutation 斷言保留。實際編譯瀏覽器全流程已通過 94→97→94→97，沒有發現產品監聽洩漏；此測試已加入專用 CI，未增加產品權限或放寬資源上限。

該停止點後的四模組編譯 Begin 原收據恢復亦以腳本支援的 isolated-desktop 模式通過 8 項（未偽造 CI）；FQC browser contract／實際 route／多人矩陣／review readiness 共 108 項通過。兩項漏列的編譯入口與恢復檢查及品質契約已加入專用 CI。型別與產品編譯內容仍沿用同一 runtime，最後以新提交重建／驗證來源及遠端 SHA。
