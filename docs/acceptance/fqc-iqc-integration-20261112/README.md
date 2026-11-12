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
