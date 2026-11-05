# 檢具與測試設備：本機編輯與原子存取候選

2026-11-05，Linux / Node 24.19 / Chromium，公開 source-only 倉庫的隔離候選。分支 `feature/equipment-atomic-save-20261105`；精確基準 `integration/draft-save-20261104` / `0af6d57e912e5615250959c9e76210fecd55d96b`，**depends on #77**。main 核對為 `85fa4a36442b3b72323eb4a6eeb105b867c4856a`。未納入 #78、BOM、AB/C 或遭拒的 IPQC A/B 候選；未改 tooling.js、流程／機器主資料或品質模組產品檔。

後續已建立 [Draft PR #81](https://github.com/franktsai0421/process-os-sites/pull/81)，公開 head `4ebc338403e7206fba43111bdedc55842d1eabb6`。以下保留該批驗證紀錄；[後續調查](FOLLOWUP.md) 記錄舊 fixture 的本機修復、原始 exact-head CI 的共用測試失敗與跨品質替換的精確缺口。本機後續 PASS 不等於原始 PR 的 CI 已通過。

## 行為與資料界線

- 類別、子類別、規格群組、檢具、校正／狀態及照片參照先留於本次頁面。表單完成、刪除及來源疑點處理不 POST；搜尋保留本機內容。表單關閉只取消該表單，不清掉先前已完成的本機修改／照片。
- 一次 `save/moduleAction:save-local-v1` 在記憶體完成原 guards 下的 Apply、piece mark／類別碼配置及 immutable Save，最後只有一次 shared-state CAS。任一步失敗不留下部分 working、saved 或配置保留。重播原操作沿原 fingerprint／receipt，不再次配置。
- 普通已開始草稿的一次 Save 為 **1 workflow POST**；明確 Begin 仍是獨立 POST。首次採用 legacy 草稿可需要 identified Begin 加 Save，不宣稱總共一個 HTTP。照片 bytes 在 Save 中先暫存 PUT；共享參照只在 CAS 成功後生效。舊圖片與 immutable objects 不刪除。
- 不同欄位可保留合併；同欄原 guard、插入父層關係或實體已變更時拒絕。刪除及原有 restore 重新核對完整依賴歷史，保留已生效／來源／被品質或替換紀錄引用的設備。分類下階、待審、正式／歷史、來源與 preset 身分保護保留。
- 修改權可存取，新增、刪除、送審、撤回、審核與歷史還原仍依原權限。照片 PUT 現在後端要求 `equipment.view` 及 `equipment.edit`；view-only 不可上傳。後端 immutable storage 完成後再查 session，CAS 仍處理帳號／權限狀態改變。
- 正常 Save 只有其原 POST 的 UUID requestId、原 receipt、generation、flow revision、savedId 與完整 working/saved 內容吻合，才用該 CAS 結果確認。失去 ACK 只能查原收據並做授權讀回，404 不代表未執行；跨世代無法安全確認時保持 barrier，不重送。
- Begin 沿 #77 identified Begin 協定。原收據與原世代先保留，換代不能重新 Begin 或將原修改改綁新世代。已送 Save 的完整 command（operation、generation、guards、照片 ID 等）保留於既有 session marker；離頁只放棄未送的本機內容。舊無識別 Begin 標記保留原 bytes，不以目前草稿冒認成功或清成 clean。
- 來源頁可自動放棄本機輸入離頁，不跳提醒；unknown 操作可離頁、返回／reload，再查原收據。重要設備替換／覆蓋確認保留。正在傳輸、身份失效或其他 scope 未解的 barrier 沒有解除。
- Submit 在確認前和非同步確認後檢查本機修改／開啟表單；不會代存或送出過期 saved。Save 中新開表單的後續輸入仍保留，下一批比較基準只承接本批已確認內容，不承接 peer 欄位。

沒有 SQL schema、migration、日常資料轉換或清理。仍使用既有 DB／STATE_ARCHIVE、workflow working/saved/cases/history/receipts 與照片 ID；沒有改 restore 規則或帳號權限設定。

## 共用增量

`7e614b7` 及 `4a70cac` 為獨立共用提交：只為 routine-equipment 啟用 Begin、exact-route `equipmentLocalSave`、精確正常 POST 確認、marker 寫入核對、舊 runtime projection 交接及最後 session 檢查。其他 scope 預設不變，無 timeout 增加。`index.html` 只更新檢具／共用 client 兩個快取標記；對應兩份快取契約測試更新同一預期值。`local-safety.yml` 增加指定 integration base 觸發及檢具測試，沒有改原斷言、保護或部署設定。

## 驗證矩陣

| 結果 | 證據與範圍 |
| --- | --- |
| PASS | `tests/equipment-atomic-save.test.mjs` 與 `equipment-transport-scope.test.mjs`：18 項，正常合成登入、實際 TS handler、私有 SQLite/R2；原子狀態、配置／重播、權限／撤權、CAS miss、不同／同欄、照片讀回與移除、Submit 競態、unknown 404、世代與舊標記。 |
| PASS | `tests/equipment-atomic-browser.test.mjs`：1280 中文／390 越文、真 Chromium、build 產物的產品 JS＋實際 handler。類別／群組、照片 bytes／實際 image naturalWidth、校正、搜尋、表單取消、未存 reload、unknown reload、原子新增／快速重按；另補 Save 中新開表單的後續輸入及照片取消競態；類別／子類／群組／檢具連同三張合成照片一起新增，確認一次 Save、正式編碼與三張圖片實際顯示。不是實體手機。 |
| PASS | `tests/equipment-atomic-compiled.test.mjs`：完整編譯 Worker＋SPA＋Miniflare D1/R2，390 越文／1280 中文。一次 Save、實際 router 無提示離頁與返回；unknown Save 離頁／返回／reload 保留原 marker、原收據查詢零重送。 |
| PASS | `test-routine-equipment-isolated-workflow.cjs` 8 組：Begin 不明／正常、來源分類照片、刪除防線、實際來源與審核平台 Save→Submit→Return→新 Save→Resubmit→獨立 Approve。舊測試改為明確 Save，沒有刪除原持久化／歷史斷言。 |
| PASS | `test-routine-equipment-four-module-transfer.cjs` 16 組及 `test-quality-equipment-replacement.cjs`：四品質模組實際 handler、selected IDs、原設備、目標有效／啟用、manual Save、lost ACK、待審、scope 權限與其他欄位／歷史保全。 |
| PASS | 前端 transfer-intent 64、edit-open-race 42、session-recovery 9、snapshot-changes 163、full-read 6、delete-fence 18；Begin runner fail-closed 2。 |
| PASS | 共用 Begin／unknown／terminal／receipt／pagehide／cache／navigation 176 項；沒有以檢具 opt-in 放寬其他模組預設。 |
| PASS | 全 lint、TypeScript、實際產品提交 `be42c889411f64107bc9df158ab9038cdefd683a` 的安全 build、source-only history/worktree 掃描、diff review；後續只新增測試斷言與文件，產品來源雜湊記在 verification.json；最終固定來源結果見交付訊息／PR。 |
| FAIL（基準同樣失敗） | 額外執行 `test-equipment-workflow-v3.cjs` 與 `test-equipment-validation-v3.cjs`，兩者在登入前置遇 `LOGIN_LIMIT_UNAVAILABLE` / 503；原始 #77 source archive 同樣重現，尚未進入產品斷言。這些舊 fixture 未提供目前限流需要的完整 DB.batch／schema；未改限流、忽略錯誤或放寬斷言。它們不能算本次 PASS。 |
| PENDING | 公開 Draft PR 建立與最終 exact-head CI；尚未以先前 #77/#78 的 CI 代替本候選。 |
| NOT_RUN | 測試站／正式站、真實照片／業務資料、跨實體電腦、實體 iPhone／Windows／原生 IME、長期容量與實站效能、部署／真實備份及還原。 |

本機證據在 `/tmp/equipment-*.log`；合成截圖 `/tmp/equipment-1280-zh.png`、`/tmp/equipment-390-vi.png` 未加入公開 source。build 的原始 stdout/stderr 不回傳或上傳，沿既有安全摘要。

## 效能

[完整數字](measurement.json) 由 `benchmark-equipment-atomic-save.cjs` 產生。原始 #77 archive 的相關後端檔案先與精確 Git blobs 核對，baseline／candidate 在獨立子行程執行、同樣 records-v1 私有 SQLite/R2：1 類別／子類／群組、2 檢具、改 1 欄，5 輪交錯，沒有暖機、照片或外加網路延遲，排除 seed 時間。普通 workflow POST **2→1**。測得牆鐘中位 **39.711→20.740 ms**，handler 中位 **37.724→19.223 ms**。這是小型合成資料與此主機的量測，不是實站速度承諾。

最初「正常 Save 後再 GET 完整草稿」版本曾在相同合成條件比舊協定慢，因此沒有宣稱其加速；最終僅 exact original POST 使用完整 CAS 確認，失去回應仍保留 receipt＋fresh readback，未調 timeout 或減少保護來掩飾失敗。

重現：建立 #77 的 source-only archive，設定 `EQUIPMENT_BASELINE_ROOT`，執行 `node scripts/benchmark-equipment-atomic-save.cjs`。結果明列 beforeRef／afterHead；後續只改 client 或文件不把後端量測冒稱新站點樣本。

## 設備替換的獨立邊界

**完成**：檢具主檔原子 Save 不改 FQC、IQC、IPQC C、IPQC A/B control；四模組現有 transfer Apply、各 scope guards、待審鎖、target availability、原選取、覆蓋確認、Begin 不明禁止盲目接續、manual Save、部分失敗與品質照片／其他欄位保全通過回歸。未核准的新檢具不能成為移轉目標，已有效／有歷史／有引用的設備保護保留。

**未完成／需整合決策**：既有 transfer 仍對目標草稿做各自 guarded Apply，再由目標 Save；沒有把主檢具 Save 變成保存全部品質草稿。若要把這條流程也統一成「本機至明確一次保存」，需先決定：替換確認是否授權保存選取目標的 fixed snapshot；多個模組／AB scopes 是逐 scope 獨立確認還是需要新的跨 scope 原子交易；部分成功與目標頁已有本機輸入如何呈現／保留。#77 只有各模組原子接口，沒有全域跨模組交易。本輪不重寫通用核心、不引入被拒 A/B 候選，也不取消覆蓋確認。此子項保持建置中，不能以主檢具完成宣稱替換已全部統一。

## 交付界線

只可建立依賴 #77 的 Draft PR，base `integration/draft-save-20261104`。沒有 Ready、merge、main push、force push、測試站／正式發布、真實資料／帳號／角色或 connector 變更。若 push／PR 遭拒，以交付訊息記錄 exact action／target／reason，停止該動作，不換工具重試其他被拒候選。
