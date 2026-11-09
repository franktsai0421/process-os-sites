# 製程編輯台完整目標與整合狀態

## e5 整頁接線合樹後的發布阻擋

本輪產品5729e17真實合入#102固定e5c3c78，保留25305c1／88／2e及42cd來源權威修正。例行FQC整頁核心、實際route、基本UI與照片接線已存在，不能再稱「只有未註冊核心」；但尚未完成可發布驗收。依最新順序，#102／#101先一起核對更新，再接其他整合；不先單獨合併#101。本輪未更新公開PR文字或上傳程式。

1. **P2：legacyArchive晚到撤權。** `app/api/routine-fqc/route.ts` 的 `legacyArchive=1` 早return缺最終session／revision／權限fence。真signed私有fixture在最後permission await撤銷session後，inline及records仍200並回傳核准內容；下一次同cookie GET為401。版本查看owner需修正；本製程owner依分工沒有獨立改寫核准歷史API。
2. **P2：照片PUT回覆未知後重送。** `public/process/routine-fqc-page.js:60` 直接PUT、pendingSave在POST準備後才建立，缺照片UNKNOWN／hash結果保護。私有實際UI＋photo handler模擬PUT已寫入但回覆遺失，第二次Save使同一File PUT從1變2並繼續workflow POST。交草稿拆分owner修正；需保存原照片sent／hash outcome，未知只查原結果，不能重PUT。
3. **整頁歷史契約未接。** `/api/routine-fqc/page?approvedOnly=1&uiHistory=1`目前422 `ROUTINE_PAGE_SELECTOR_INVALID`；`?permissions=1`無revision，新UI只有文件選擇器。版本owner需接list/detail、新endpoint註冊與display／writer fences；用page.workflow.cases及savedId證明真整頁核准，舊document保留原scope與版本來源，不能假造成整頁核准。

本機證據：整頁kernel13／route14／UI9 PASS，正式來源12及master review PASS；來源／cache／前身／導覽／收據／無輪詢1988 PASS；正常lint／非增量TS／guarded build PASS。擴大功能首輪303 PASS／74 FAIL，失效腳本數量及兩個舊fixture修正後，僅重跑原失敗組：legacy contracts73 PASS、script bundle4 PASS（有3項重疊，勿相加）。舊beforeunload完整負向證據改讀真正固定d4；目前程式明測沒有beforeunload、新page owner與舊busy／UNKNOWN guard保留；departure fixture載入真實history guards，未stub掉權限。兩個產品P2另留可重現反例，不因上述PASS宣稱已修。

精確來源26 targets、80 current、1244 inverses、240真Git objects、79原requests，4,616,425 bytes，原25target順序／值、173＋138物件及5MiB guard保留。最終包裝head及source-only／乾淨consumer結果見外部manifest；不是GitHub CI或原生／實站。


本輪產品固定 `a2c5f551d0b897f19bceb4205fcf934daf759467`，tree `cb17482250ecabed17a5626c3c9f4d61370b568a`。真實合入 #102 固定 `dfdfe76`、草稿衝突固定 `88a4a2c`、版本查看 owner 固定 `2e4d20f`，保留 main `9fbba823`（含 #99／#100）、#101 計數、畫布目前 scope Save、全部既有核准歷史及 UNKNOWN 收據。沒有拷入其他工作樹 dirty 程式，也沒有獨立重寫版本查看 owner 的 API／selector。

完整程式尚未上傳 GitHub、合併或部署。#101 遠端仍是 Draft `8f1f243`，#102 遠端 Draft `ee7d4fd`；前者舊 CI 不能代替本輪完整 HEAD。page-v1 marker 未啟用，不能把本機 writer 合樹說成正式資料已拆分。[精確相依](process-editor-remaining-dependencies-20261109.md)。

| 完整目標 | 本機證據／行為 | 尚待驗收或整合 |
| --- | --- | --- |
| 篩選後切頁，不把系統補的空工段當未存 | 已納入假 dirty 比較修正，同頁群組／類別仍屬同一份製程草稿 | 實站空白／不同群組與類別離頁；40 秒原因未查明 |
| 切頁、線別、工段放棄未存，不確認、不恢復 | RAM-only 與 silent departure，保留已送 UNKNOWN 防重送紀錄 | 原生瀏覽器、實體手機與 IME |
| 一鍵存取當前畫布 | 節點、內容、連線同存；其他畫布已存內容與本機修改保留；送審送整份已存製程 | 真實帳號完整流程 |
| Save 才比對，整組我的／對方，保留無衝突修改 | fresh GET→一次 POST→GET，revision/CAS、刪除、連線、同編號新增與選擇中 peer 改版保護 | 兩人及失敗流程實站 |
| UNKNOWN 不重送 | 保留原 operationId、anchor、sent 與 registry；只查原收據，不當未存恢復刪除 | 實站斷線／晚到回覆 |
| 移除同步、最新共享、undo/redo、未存恢復及固定輪詢 | 畫布舊入口已移除；#100 無輪詢、所有歷史 fresh 權限及固定前身負向檢查保留 | 頂部／全螢幕／舊快取巡查 |
| 類別主要工段、自訂流程與機器連動 | 類別已核准 defaultStages 優先，明確空設定及 legacy fallback；新增工段繼承自訂流程型別、機器依線別／工段 | C/GIA CONG 與新增→核准→類別→畫布 |
| 真正不同頁面各自草稿與權限 | #102 AB.catalog／C.catalog／LINES writer、來源驗證、CAS 與基本 UI 已合樹，marker 未開；same-page filter 不另拆模組 | 完整主資料 UI、例行 FQC 整頁接線與安全資料切換 |
| 送審、撤回與審核權限分開 | 整份已存製程送審，固定核准快照、pending／角色／CAS 保留，核准不可撤回 | 全角色實站生命週期 |
| 原頁只讀核准歷史 | 舊 13 組頁面與新 AB/C/LINES 原頁 selector 都已合樹；保留來源身分與 late display／actor／revision fence；回草稿 fresh 權限 | 例行 FQC 新整頁 owner 歷史、原生與實站 |
| 存取後步驟／流程數立即更新 | #101 計數使用 visible canvas projection | 實站數字 |
| 等待時間及完整驗收 | 本機合成、signed route、SQLite／Map R2 分別留證 | 桌面、iPhone、IME、兩人、測試站；>5 秒優化、>10 秒優先；40 秒未查明 |

草稿衝突88增量已納入 PROCESS 照片／排序、IQC 晚到輸入與供應商順序、FQC 刪除、例行 FQC late ACK、Tooling 只在 Save 上傳照片及 UNKNOWN 保護。Tooling 保留原 history display epoch 與舊 handler 防護，shared client 保留比較前／回呼後 owner 檢查，沒有覆回較舊共用檔案。

本輪另修正 `42cdba6`：public state 在移除私有 workflowScopes 前，先完成正式 AB/C 類別及工段來源驗證；否則可能把另一筆已核准工段當成目前正式來源。12 個 inline／records 案例 PASS，獨立 reviewer 用舊程式反證 8 個拒絕案例失敗；新程式全部通過，GET 零寫入。

版本查看 owner 的 2e4d20f 已修正原新三頁 approvedOnly 422；合樹後新三頁與畫布歷史63 PASS。舊 `PAGE_HISTORY_OWNER_HANDOFF.md`／422 probe 是交接前重現紀錄，不能再當本輪故障。例行整頁與主資料完整 UI 仍由草稿拆分 owner 處理。

最終來源／快取／前身鏈／導覽／收據／無輪詢完整套件2030 PASS、0 FAIL、0 SKIP；來源composer 16 PASS。獨立產品語意複核182 PASS，無新 must-fix；原始輸出為reviewer工具stdout，沒有另造測試log。

本輪檢查分批保留：88受影響功能317 PASS；既有歷史／C回呼272 PASS；新page／畫布歷史63 PASS；page public authority、review、runtime、UI全部 PASS；lint、非增量TS與正常 guarded build PASS。套件有重疊，不能相加為全站覆蓋率。25 固定來源、76 current、1180 inverse、226 bounded 真 Git objects、79 原歷史 requests；原固定 pins、173 物件及5MiB guard保留。來源證據與合成測試不能代替實站驗收，最終收據見外部 delivery manifest。

使用者已確認舊草稿可不保留、A 可送整份 AB、例行 FQC 整頁一份草稿；不是待答問題。真資料／schema／ACL／connector／發布均未操作。舊243-path create_tree UNKNOWN 缺原payload與未執行證據，設備tree既有拒絕保留；不以 #101、新PR、拆分或其他executor重送。V42未知操作未重送。完整目標仍 NOT_READY。
