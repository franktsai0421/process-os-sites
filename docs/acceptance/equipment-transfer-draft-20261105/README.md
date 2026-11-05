# FQC 檢具移轉並存取：已確認範圍候選

此輪接續 [Draft PR #84](https://github.com/franktsai0421/process-os-sites/pull/84) 的固定 `45545ef3bc2b9fa9cec56eb659abc9eed6d7049b`。使用者只確認 FQC：原位置同一按鈕移轉並存取整份 FQC working，其他已套用未存修改一起保存，不必先切到 FQC 查看。IQC、IPQC C、IPQC A/B 仍是原來的 guarded Apply＋目標手動 Save；不能延伸此決定。

## FQC 現行候選

- 既有 `save/moduleAction:save-local-v1` 同時帶選定 equipmentId／tool patches、原值 guards、空 matrixCells，一個最終 CAS 保存整份 FQC working／saved。沒有先 Apply 再 Save 的部分寫入。已開始草稿一次 workflow Save；首次開始仍有獨立 identified Begin，不能宣稱整個操作只有一個 HTTP。
- 原位置確認文字明確包含其他共享已套用修改；保存不包括其他頁面未送的本機表單。檢具主檔不保存、不送審、不停用，品質也不送審。原照片、來源、其餘欄位、saved／正式／歷史保留。
- FQC caller 沿既有 durable Begin＋FQC bounded transport；沒有修改共用核心、FQC 消費端或伺服器交易。開始前核對 target active／open／generation，Begin 後核對原 basis／receipt generation；不能把舊選取改綁新世代。原無識別 target Begin marker 仍保留且阻擋。
- 瀏覽器新增 `routine-equipment-fqc-transfer-v1:<actor>` 來源 journal，version 1，保存原 intent、target basis、begin/save phase、原操作 ID／完整 Save command（只含原選取 patches／guards，無未送表單或照片 bytes）。持久化讀回成功才發送。這是原操作證據，不是另存未送輸入或新恢復介面。
- Save 使用既有私有收據／fresh readback 證據；lost ACK、404、503 或終端讀回失敗保留 journal 與 transport marker。原按鈕變成唯讀查原收據，不重送、也不保存後來輸入。若 transport 已結案但來源失去情境，來源 journal 仍以原收據＋新授權讀回核對；跨世代只確認原保存，不套用新草稿。
- 原有 local departure planner 同時涵蓋檢具及 target FQC transport；離頁只放棄本人未送輸入，不清已送 intent。FQC 成功後只更新引用／preview，不觸發會重建來源頁的全域 refresh；來源本機檢具修改仍保留。目標頁按各自原輪詢與 guards 處理本機輸入。
- 明確欄位衝突只在既有 transport 的私有、原 command 拒絕證據成立時清除本次失敗；其他人的 unknown／失敗操作不清理。權限、pending、檢具必須生效且啟用、引用與 CAS 保護保持。

## 此輪驗證與界線

命令與最終固定 HEAD 結果以交付／PR 為準：`node --test tests/equipment-fqc-transfer-save.test.mjs` 使用實際 UI/client 與真 TS handler、正常合成登入、記憶體 SQLite/R2；涵蓋已有／新草稿、一次 CAS、其他共享修改／非空照片、欄位衝突、撤權／停用／pending 競態、Begin／Save 不明、404／503、重建頁面、歷史世代及 journal 寫入失敗。compiled Worker/SPA 檢查四模組各自保存範圍、四頁未送表單，以及 unknown FQC 的離頁／返回／reload 零重送。

無 SQL/schema/migration、實站／測試站、真實資料／帳號／權限設定、merge 或部署。#82 compiled UI 全量整合、獨立審查與最終 CI 須另外列出，不用上游 PASS 代替。

### FQC 本輪本機結果

Node 24.19／Linux／Chromium，產品 `routine-equipment.js` SHA-256 `5b2a4dedb1c6f78e302bfdce2b471addabf0012d15129267925a990526bc2aec`。最終 commit、lint／型別／build 與 exact-head CI 由本次交付及 PR 綁定；下列是已執行的專項結果，沒有 skipped。

| 結果 | 命令與覆蓋 |
| --- | --- |
| PASS 17 | `node --test tests/equipment-fqc-transfer-save.test.mjs`：真 UI/client／handler；不同合成 session 的共享修改與欄位競態、一次 Save CAS、Begin／Save 不明、已存／正式／照片保全、來源私有輸入，以及 legacy 採用有／無既有權限兩條路徑。 |
| PASS 83 | `node scripts/test-routine-equipment-transfer-intent.cjs`：四品質選取／actor／scope／generation／原值與 unknown barriers，AB 部分成功不重送。 |
| PASS 16 組 | `node scripts/test-routine-equipment-four-module-transfer.cjs`：實際四品質 handlers；FQC 一次 Save、其餘原 Apply＋手動 Save，照片、權限、待審與 unknown。 |
| PASS 4 | `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test --test-concurrency=1 tests/equipment-transfer-compiled.test.mjs`：compiled Worker/SPA，1280 中文／390 越文、四頁未送表單、unknown Save 離頁／返回／reload、刻意阻擋 preview 時唯讀查原收據，及目標真 30 秒輪詢後保留本機表單、後續衝突 Save 回 409。 |
| PASS 265 | `node --test tests/equipment-atomic-save.test.mjs tests/equipment-transport-scope.test.mjs tests/navigation-departure.test.mjs tests/navigation-adapters.test.mjs tests/shared-draft-submit-contract.test.mjs tests/multiuser-module-departure-bindings.test.mjs tests/fqc-single-save.test.mjs`。 |
| PASS 20 | `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium EQUIPMENT_BUILT_ASSETS=dist/client/process node --test --test-concurrency=1 tests/fqc-single-save-browser.test.mjs tests/equipment-atomic-browser.test.mjs tests/equipment-atomic-compiled.test.mjs`：原 FQC／檢具 Save、照片、矩陣、未知與離頁回歸。 |

瀏覽器發現並修復：原收據查詢被新 preview 尚未完成的 gate 靜默擋住。現在唯讀查詢先於 preview gate，仍保留全部 actor／epoch／delivery／來源世代檢查，新的移轉仍必須有 preview／選取／確認。測試用未釋放的 preview request 明確鎖住此案例，沒有增加 timeout。另修正測試需等待實際 Save HTTP 回應後才讀 stored snapshot；舊 legacy 採用 fixture 補明確合成 admin／legacy approval 權限，並增加原 staff 無權限時零寫入斷言，沒有改產品權限。初次額外瀏覽器回歸因漏設系統 Chromium 路徑未啟動；補正執行環境後上述 20 項全部通過。


### 此輪完整 CI 的 fixture 後續

`8c43ac23fd2a41690efd59ce9c5055df6cb2afd5` 的 [CI 42001049224](https://github.com/franktsai0421/process-os-sites/actions/runs/42001049224) 已通過正常 lint、TypeScript、source-only、build、FQC／IQC、共用離頁／保存、檢具與本次移轉 native／compiled、來源／照片／快照／權限回歸；FAIL 於「Integrated entry and read-only delivery contracts」的 `test-routine-equipment-edit-open-race.mjs`：擷取實際 mount 的 fixture 未載入新增 `hasFqcTransfer` closure，拋 `ReferenceError`。後續相依步驟未執行，整套不得列 PASS。

接續定向檢查也找到 session-recovery fixture 的相同 mount 相依遺漏。修復僅補這兩份測試：從實際 AST 載入 `fqcTransferKey`／`hasFqcTransfer`，提供沒有 journal 的標準 sessionStorage 讀取；不改產品、不取消原斷言／分組／timeout，也不把函式 stub 為永遠 false。只有實際來源存在新 helper 時才載入，保留固定舊來源比較。候選與固定 `45545ef` 原來源的 edit-open 42 項均 PASS；候選 session recovery 9 組、isolated workflow 8 組、snapshot 163 項、full-read 6 組均 PASS。產品 SHA-256 與上一節相同；修復提交的最終 HEAD lint／TypeScript／build／source-only 與新完整 CI 另核對，不沿用舊 CI 的整體結果。

下列內容是 `45545ef` 安全修正交接的歷史狀態；其中 FQC「尚待決／不自動保存」已由本節取代，其他模組仍維持原界線。

---

# 跨品質檢具替換：安全邊界候選，原子保存待決

分支 `fix/equipment-transfer-draft-20261105`，精確基準 #81 / `4b5cdfbc0838556ecc39125e92edb1611f010dcd`。Draft PR base 為 `feature/equipment-atomic-save-20261105`；depends on #81、#82 (`7355d8fba6abf7a396314cf4a55551b19b17b972`)、#77 (`0af6d57e912e5615250959c9e76210fecd55d96b`)。產品 PR 未納入 #82 的差異。未改例行 FQC、流程／機器主資料、品質消費端或通用核心。

## 實際行為與本輪修正

目前各模組確認的內容是「把選定檢具替換套用到共享 working」，再到目標頁明確 Save。FQC、IQC、IPQC C 各一個草稿，AB 為多個 scope。各 scope Apply 是原子操作，跨 scope 可能部分成功；不是全域交易。主檢具 Save 不會保存品質 control。

本輪只修呼叫方：

- 原無操作識別的目標 Begin 標記即使 GET 的草稿相符也不清除，原 bytes、actor、endpoint、scope、generation 與 intent 保留；不以 404 或目前 creator 冒認原操作。marker 必須成功持久化並讀回相同 bytes 才能發送 Begin。正常明確 ACK 才可清除此輪 marker；不明及錯誤仍阻擋 Apply。identified target Begin 完整接入仍未完成。
- 顯示確認與實際執行之間，選定目標的 workflow generation／active ID 改變時必須重新核對。原欄位、選取 ID、open ID、來源 actor／delivery 與伺服器 guards／CAS 都保留。
- 重開頁面重試部分失敗時，已完整符合目標的項目不再 Begin／Apply；FQC tool、IQC／AB inspectionMode 尚未符合仍要帶原 guards 修正。unknown transport 及舊 marker 的阻擋先於「已相同」，不能用現況跳過原未知結果。原 transport 的 confirmed-rejection barrier 不被清掉，也不清理別人的失敗操作；必要時重新載入頁面再明確確認。
- 仍保留重大替換／覆蓋確認、原照片／來源／其餘欄位、pending、各目標權限、saved／正式／歷史。沒有自動保存、送審或新介面。

## 最小待決選項

| 選項 | 保存與部分失敗 | 目標頁已有本機輸入 |
| --- | --- | --- |
| A：維持現況 | 選取＋確認只 Apply 至各共享 working，成功後由目標 Save；部分成功分列。 | 原輸入繼續保留；之後依原 guards 合併／衝突。仍非全部先本機一次保存。 |
| B：每個目標明確「替換並存取草稿」（建議） | 確認必須明列整個該目標 snapshot 與既有共享修改；各目標獨立成功／失敗。AB 保存是整個 module snapshot，不能把 scope Apply 稱為各 scope Save。需要 #82。 | 不會保存其他分頁的未送輸入，也不清除；下一次 Save 仍受原 guards，遇同欄衝突明示。 |
| C：四模組全部成功或都不動 | 需要新的跨模組交易／收據協調，非目前 API 能力。 | 仍需另定本機衝突／scope 範圍，不能以檢具 Save 代替。 |

尚無 B／C 的使用者決定，因此本輪保持 A。不能把原「移轉至草稿」的確認視為保存其他共享修改的授權。若要求嚴格「只保存選定欄位、不保存目標其他 working」，現有 Save 固定整個模組 snapshot，不能只換 action 名稱達成。

## 相依與後續最小範圍

未來若選 B：呼叫方 `public/process/routine-equipment.js` 要按三種 payload 分別接 FQC／IQC `save-local-v1`、C `localChanges`、AB module `save-local-v1`＋scopes。identified target Begin 需 `public/process/shared-draft-client.js` 支援 AB 正確 module/scope endpoint，`lib/versioned-shared-workflow.ts` 目前 #81 whitelist 不允許 AB begin-v1；不能整檔搬 #82 client 覆蓋 #81 的 equipment opt-in。品質目標本機表單與輪詢規則必須先驗證，若需改消費端另報最小檔案；本輪不改它們。

無 DB／R2 schema、migration、真實資料、帳號／權限、connector 或部署變更。只用 private fixture 合成資料。

## 驗證紀錄

本輪固定最終 HEAD、命令、PASS／FAIL／NOT_RUN 與完整 CI 以交付回覆／PR 為準。專項增量：83-case transfer-intent、四模組 actual handler／manual Save 16 組、compiled Worker＋SPA 四目標未送表單保全。舊 unknown fixture 改為獨立私有儲存，不刪 marker 讓其他生命週期測試繼續；原照片／saved／正式／歷史斷言保留。歷史 handler hash／offset 規則未改。

NOT_RUN：實站／測試站、真實業務資料與照片、實體手機／跨電腦／原生 IME、全域交易與新的保存語意。#82 新協定之整合驗收及獨立審查必須另明列，不能沿用上游成功代替本候選。

### 本機已執行（待最終 HEAD CI）

- PASS：83-case actual frontend/transport intent；四品質 actual handlers 16 組；compiled Worker＋完整 SPA 1280 中文／390 越文各一輪，四目標各開未送表單，替換後輸入保留且零 Save／Submit。每個模組從新來源頁明確選取確認；來源成功後的全域 refresh 可能重建該頁，未聲稱連續四按鈕同視窗保留。
- PASS：檢具 API／storage／transport 24 項、既有 native＋compiled browser 10 項；edit-open-race 42、session-recovery 9、snapshot-changes 163、full-read 6；共用 navigation／submission 70 項；歷史舊 handler 及負面 hash mutation。
- PASS：C 操作權限 7 組（非空照片、guarded replacement、saved／正式／媒體保全）；IQC action permissions 與 AB independent permissions 的實際 handler 回歸另列日誌。
- PASS：獨立一次性 worktree `81db2955360e15232ea2e4a66464b5f3439ab090` 加固定 #82 的 `lib/ipqc-ab-local-save.ts`、`lib/ipqc-ab-module-workflow.ts` 與 `tests/ipqc-ab-local-save.test.mjs`。通用 handler 只在該測試 worktree 語意合入 #82 的 requiresCreate、AB module Save/edit 與 identified module Begin whitelist，同時保留 #81 檢具增量。AB 原子／矩陣／多 scope rollback 11 項，以及檢具 API/transport 18 項與四模組 transfer 16 組通過。此合成來源不是任何公開 PR HEAD，不提交到產品 PR；未測 #82 完整 compiled UI。
- FAIL（前置 fixture，未進產品斷言）：額外舊 `test-quality-permissions-v3.cjs` 在正常登入回 503；該 fixture 缺 `DB.batch`／login-limit schema。產品 `app`／`lib` 相對 #81 無差異，未繞過登入或改不相干測試。上述成熟的四模組定向權限測試另有結果，不能把本項列 PASS。
- NOT_RUN：獨立審查、尚未取得結果的最終 exact-head CI、#82 compiled UI 全量整合、實站／實機。這些仍是交付限制。

早期新 browser fixture 曾因未選來源樹、來源 refresh 後視窗重建、錯取 decoder 的 `.values`、about:blank 的 language init storage 存取失敗；修正 fixture 的實際操作及初始化，保留全部零寫入、輸入／照片欄位、saved／正式／歷史斷言；未改產品、延長 timeout 或忽略 pageerror。
