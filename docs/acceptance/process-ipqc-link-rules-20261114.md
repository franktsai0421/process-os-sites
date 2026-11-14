# 製程方塊 ↔ IPQC A/B、C 規則候選

基準：遠端 main `4aa0f24c66861fb735d6ad581b81b190771122f8`（#114），2026-11-14 重新查證。獨立 Dot checkout／分支 `fix/process-ipqc-link-rules-20261114`。不操作公司電腦、既有測試站／正式資料、真帳號、遷移、刪除、合併或部署。

## 修改矩陣

| 範圍 | 新行為與保留界線 | 驗證 |
| --- | --- | --- |
| A/B choices | 線別＋類別＋工段；無／不同／多產品相同清單。來源產品資料僅供參考，無產品路線門檻 | 真 API／domain；生成空產品子項 |
| A/B validation/issues | 新分配、缺項、來源比較不依 productCodes；新 tuple 固定來源版本；既有 tuple 不改寫 | 新規則、既有來源採用 85 項 |
| C operation UI | query-only 改共用 checkbox；按產品→錯誤→項目分組，以穩定 tuple 區分同名 | 專用原生 CI（本機 BLOCKED，見下） |
| C choices/structure | 僅有效線別／類別內所選產品＋畫布工段，無額外產品路線門檻；無產品提示先選 | 單／多／換產品與 route-less domain |
| 占用與轉移 | A/B 同線別／類別／工段；C 跨類別工作區同項目／工段。已存 owner 保持鎖定，先取消存取再轉移 | 雙 signed actor CAS 競爭、跨工作區 signed-route 拒絕／並行取消存取、兩步保存 |
| 來源變更 | 停用／刪除／不適用／換版／C 換產品保留舊 tuple 並提示，明確移除／重選；A/B 明確採用保留 | stale、新非法拒絕、來源途中換版回歸 |
| 持久化／安全 | 完成編輯留 RAM；單次 atomic Save 保存引用；原權限、pending、CAS、receipt、UNKNOWN、no-replay／no-background 保留 | inline＋records-v1，原子 Save 完整 stack |
| 相容 | 舊 C query flag 保留、不轉全選；未改寫正式／歷史。IPQC 核准不核准 PROCESS | 新來源 lifecycle、activeVersionId 仍 null、歷史來源回歸 |

## 來源與相交工作

#115 仍為 Draft，固定 `729bcf9103af3795f12579ffabc0ae3c0765377c`；#116 仍為 Draft，固定 `e86399f7dd550d0cc98b177cbe37b4541c6d95ee`。未搬入兩者全部成果，也未修改其 refs。#115 在 process-authoring-workflow 的增量是明確核准 master page 投影，本次只修改 C 新產品身分檢查，兩者語意可並存；#116 為 lifecycle/controller／shared transport，產品邏輯未相交。index 與交接文件未來合樹仍要保留兩邊資產及文件。沒有宣稱三分支合樹已通過。

新增 `process-ipqc-link-source-contract` 逐檔完整重建真 main，涵蓋 runtime／文件，LF／CRLF、wrong path、刪頭／加尾／變造均拒絕；在既有 password→quality→account 歷史 inverse 之前只接受精確 successor bytes。舊 hash、歷史原件與負例沒有放寬。新增 source proof 只供測試，不進 runtime。

## 已執行與待驗

- PASS：`process-ipqc-link-rules.test.cjs` 11 組。每次產生獨立記憶體 SQLite／Map R2 與隨機合成登入，真正 create-error／create-item→Save→Submit→另一角色 approve，然後真 choices／atomic canvas Save／重讀。A/B 用整份 module Save／review；C 從空 draft scaffold 建新項目，沒有改 QA 名稱冒充新增。
- PASS：`process-ipqc-source-adopt`／history route／new rules／canvas atomic Save stack／pending form 合計 233 項。包含原收據、遺失 ACK、防重送、離頁／換帳號／晚回應／取消、pending／權限與真正持久狀態；不是把所有情境都聲稱為新 UI 點擊測試。
- PASS：24 組目前 C 勾選及舊 query 相容／撤權／晚回應守衛；舊 query-only 編輯器期待已依新需求更新。
- PASS：既有 assignment decode reuse、IPQC index lookup／checkbox guards；明確記錄 A/B product metadata 不再決定資格的需求差異，其餘 equivalence 保留。
- PASS：lint、完整非增量 TypeScript（本輪候選）。最終 SHA 與 CI 結果另以 PR／workflow 為準。
- BLOCKED（Dot 本機）：Chromium 啟動遇 `socket() failed: Operation not permitted`、`ptrace: Operation not permitted`，沒有原生截圖／PASS，沒有本機重試或繞過限制。
- PENDING：新增專用 CI 固定 `pull_request.head.sha` checkout／build，跑原生 production editor＋controller＋實際 signed routes 的生成資料載具；1440px 中文與390px 越南文、完成／Save／reload、自身／他人占用、取消後存取與轉移、不同 actor／晚回應，產生 verification JSON／截圖。這是隔離模組載具，未宣稱完整 adopted SPA／真人站點驗收。原有廣域 CI 保留。

不處理現場 v46 製程 V31 原撤回 UNKNOWN，不重送原操作；A/B V24／C V33 核准狀態不當作本新功能成功證據。舊 QA A/B L9 空分類與 C L10 停用項／進站也不列端到端成功。

NOT_RUN：真人測試站完整新來源到方塊流程、實體手機、跨電腦真人、多裝置同時編輯、真正 OS IME、真資料效能、Cloudflare／Site 部署。資料模型沿用既有 tuple 與 CAS，無新 SQL/schema/migration 或資料包。

## 第一輪 CI 定向收尾

c08c173a 的第一輪 CI：新建來源／CAS／保存／來源血緣及靜態、build 先通過；廣域工作流被兩個舊 cache tag 常數與 IPQC direct inverse 未接新來源投影擋下。精確 source projection 已接入，全部既有 hash／負例保留；242 項相關歷史／cache 回歸通過。原生載具等候收合群組內 checkbox「可見」而超時，已改先核對控件存在、點開真群組，再用原30秒可見性斷言；沒有延長等待或刪除資料／POST斷言。新候選仍須等待遠端精確 SHA 完整 CI／原生確認。

Windows Performance stage 的舊雙版本 oracle 另把 A/B productCodes 不相交必須排除當作等價要求，且整棵 DOM 固定舊「流程已選／其他流程」與套用即轉移文案。已逐項斷言舊／新精確字串與筆數，只允許新需求的 A/B 單筆資格差異；其餘完整 DTO、順序、I/O、來源拒絕、節點數與效能工作量斷言保留。原 hash-verified ca664797 基準不變；context 17 案例、DOM 中越文與49項／8檢查、choices/read 51 案例皆通過。source-only history/worktree preflight PASS，沒有讀真資料。

與 #115／#116 的 source-helper／index／cache 測試檔亦有重疊；後續共同合樹須串接三份精確來源投影與原收據／期限，不得全選覆寫；本 PR 不宣稱共同合樹已驗。

後續重新查證：#115 head 已由 729bcf9 更新為 `5ef92e5ef6ce829eab4f997d947854e55b9c3003`，仍 Draft／未合併；其 process-authoring-workflow 增量仍為兩處核准 master 投影接線，與本次 C 身分／saved owner 變更位置不同。#116 head 仍 `e86399f7dd550d0cc98b177cbe37b4541c6d95ee`。本 PR 沒有改動兩者分支；共同合樹仍 NOT_RUN。
