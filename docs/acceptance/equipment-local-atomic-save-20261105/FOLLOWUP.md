# 檢具候選後續：舊 fixture 與設備替換邊界

2026-11-05，隔離 Linux / Node 24.19 / Chromium。產品來源固定為
`4ebc338403e7206fba43111bdedc55842d1eabb6`，基準為 #77 的
`0af6d57e912e5615250959c9e76210fecd55d96b`。
本後續只修合成測試與文件，不修改產品、安全設定、資料模型或 migration。

## 公開草稿與證據版本

[Draft PR #81](https://github.com/franktsai0421/process-os-sites/pull/81)
已建立，base `integration/draft-save-20261104`，depends on #77，head 為上述
`4ebc338`。先前建立操作已知未執行；取得此份精確差異的明確同意後，核對
本機／遠端 head 與 base 未變，只重試建立一次，成功。沒有合併、Ready 或部署。

此後續的測試修復在本機，尚未上傳。PR #81 的原始驗證仍須與這批本機修復區分。
原始 exact-head CI [run 41966264565](https://github.com/franktsai0421/process-os-sites/actions/runs/41966264565)
已通過檢具 API／native／compiled browser、lint、TypeScript、build 及 source-only
步驟，但共用離頁／送審步驟失敗。下述本機修復不等於該 CI 已通過。

後續狀態：兩個測試／文件提交已上傳至 `277964a80a1f4b461914ccbc8eb764d383a84449`。
其 [exact-head CI 41968165708](https://github.com/franktsai0421/process-os-sites/actions/runs/41968165708)
通過原兩個共用失敗步驟、檢具 API／native／compiled、source-only、TypeScript、
build 及完整 source／snapshot／權限回歸，最後 FAIL 於舊伺服器來源契約：
`test-workflow-begin-old-server.cjs` 仍只接受 #77 共用 handler 雜湊。
後續相依步驟因此 SKIPPED，不能列為通過。

已補精確的檢具增量逆轉：先核對目前完整來源 SHA-256 與三處 offset／bytes，
反轉到原 #77 的 `8734ac32…`，再使用完全未變的 Begin-v1 逆轉規則，仍必須
得到原歷史 `8a35f8bd…`。沒有更新或移除原歷史 hash／offset；未知來源仍拒絕。
原始 #77 與檢具候選都驗證得到同一歷史 handler；另增三個 negative mutation
分別鎖住修改可 Save、exact Begin scope 及最後 session 檢查。實際五個模組的
舊 handler（含檢具）均對 begin-v1 回覆 422 COMMAND_REQUIRED、零 D1／R2 改變。
此修復只有測試契約與文件，不變更產品；後續 CI 結果以最新 PR head 的 run 為準。

## 舊 workflow／validation 的 503 原因與修復

實際登入會透過 [login-limit.ts](../../../lib/login-limit.ts) 的 `DB.batch`
執行兩筆 SQLite counter upsert；每五分鐘 IP 30 次、帳號 15 次。原 workflow
fixture 缺少 `batch`，validation fixture 另外缺 `all` 及既有
`process_login_limits` 資料表。這是測試儲存介面落後，並非已證實的外部登入服務故障。
原始兩支腳本在固定 #77 archive 同樣產生 `503 / LOGIN_LIMIT_UNAVAILABLE`。

- 新增 `scripts/equipment-test-storage.cjs`：只對記憶體 SQLite 套用既有
  `drizzle/*.sql`，用真 SQLite 實作 D1 first/all/run 與交易 batch。任何批次失敗
  均 rollback；沒有偽造 limiter 成功或繞過登入。
- `tests/equipment-test-storage.test.cjs` 用實際登入 handler 與 limiter 驗證正常登入、
  缺 batch／schema 的 503 且無 session、IP／帳號額度、錯誤密碼超額的 429 及批次 rollback。
  相同六項在候選及原始 #77 產品來源均通過。
- 修正兩支舊腳本的 fixture 契約：載入真 VersionDraftUI、提供登入世代／delivery
  介面、Submit 原 revision、原欄位 guard、明確 Save 與合成 restore 權限、目前的
  history／confirmation 元件。未存內容必須拒絕送審舊 snapshot，不能代存。
- 現行 foreground poll 為 30 秒，舊測試卻在 12 秒內要求觀察結果。改用真 Chromium
  的 Playwright clock 推進既有 30 秒 timer，再保留原 12 秒結果斷言；沒有改產品
  輪詢時間、延長 timeout、暖機或跳過斷言。此 timer 控制不屬於效能量測。

| 結果 | 產品來源與範圍 |
| --- | --- |
| PASS | 修復後 workflow：候選 7 組；原始 #77 7 組；候選 records-v1 儲存 7 組。真登入／handler、多人合併、明確保存、待審、引用、歷史 restore、1366／390 越文 modal 與取消保全。 |
| PASS | 修復後 validation：候選與原始 #77；structured error/missing、saved/working 區分、焦點／篩選導引、touch targets、1366／390、1.5 倍縮放、中越文、retry 去重及成功 Submit。 |
| PASS | SQLite／登入 fixture 契約：候選 6 項、原始 #77 6 項；登入限制仍 fail closed。 |

重現：`CHROME_PATH=/usr/bin/chromium node scripts/test-equipment-workflow-v3.cjs`，
validation 使用對應檔名；records 加 `V3_STORAGE=records`。原始 archive 測試在
`0af6d57` 的 source-only archive 工作目錄執行同一份修復腳本，`NODE_PATH`
指向已鎖定安裝的依賴；測的是原始 handler 與原始 public assets，不混入候選產品檔。
登入契約使用 `EQUIPMENT_LOGIN_TEST_SOURCE` 指定同一 archive。

## CI 暴露的兩份共用測試 fixture

原始 head 的兩個失敗步驟已在本機重現：共用離頁套件 415/444 PASS、29 FAIL；
共用保存／送審套件 199/207 PASS、8 FAIL。失敗都在檢具 fixture：

- `tests/multiuser-module-departure-bindings.test.mjs` 的 AST 擷取仍把 wrapper 內
  `createDeparture(config)` 的區域變數當整個設定，產生 `config is not defined`。
  改為載入實際 `equipmentDeparture({...})` 與實際本機 dirty closure／初始化狀態。
  檢具已同步的共享變更可直接離頁；本機輸入由 auto-abandon 放棄，不隱含 Save。
  其測試改為驗證這項現行契約，保留原身份／世代／delivery／unknown／權限／鎖定／
  無寫入與共享內容保全；另驗證 legacy Begin marker 原 bytes 離頁後仍在。
- `tests/quality-submission-fences.test.mjs` 補檢具新增的三個本機狀態初值，保留
  原 savedId／revision／generation、取消、撤權及 confirmation 競態斷言。

兩份檔案合計 185 項 PASS，無 skipped。其他模組的產品與既有斷言不變。
完整受影響的共用離頁步驟本機 445/445 PASS、共用保存／送審步驟 207/207 PASS，
前置 master AB auth／replay 54/54 PASS。最終全 lint 與 diff check 通過。
全部產品目錄（public／app／lib／drizzle／config）、workflow 與依賴檔相對公開
head 均無差異，原 verification.json 的產品 SHA-256 全部吻合；未重跑未變產品的
build／TypeScript／效能測量，沿用公開 exact-head 的已通過證據。

## 跨品質替換：目前完成與尚未完成

目前 UI 各自對 FQC／IQC／IPQC C／IPQC A/B 顯示移轉按鈕，確認的是
「將選取項目套用至工作草稿」，成功後明確提示到該模組存取。主檢具 Save 不會
保存這些品質草稿。既有四模組 handler／intent 回歸已驗證原選取、原設備、
target 啟用／生效、pending、scope 權限、覆蓋確認與照片／其他欄位保全。

| 目標 | #77 已有能力 | 尚缺內容與操作差異 |
| --- | --- | --- |
| FQC | `save/moduleAction:save-local-v1`，guarded patches，`input.matrixCells:[]`（需要時帶 expectedAB）。 | 可對接單一模組原子替換＋Save；Save 固定整個 FQC snapshot，也會含既有共享 working 的其他修改，不能把原「移轉至草稿」確認當成此授權。 |
| IQC | `save/moduleAction:save-local-v1`，guarded patches，單次 CAS。 | 同樣是整個 IQC snapshot；需明確「替換並存取草稿」語意及結果回顯。 |
| IPQC C | `save` 搭配 `localChanges`，每筆保留 patches／guards；禁止混用外層 moduleAction／patches。 | 可獨立對接，但 payload 與前兩者不同；保存整個 C snapshot，不能只替換 action 名稱。 |
| IPQC A/B | 每個群組 scope 的 guarded Apply；模組 Save 重新收集所有 scopes。 | `lib/ipqc-ab-module-workflow.ts` 明確拒絕 Apply／moduleAction，#77 沒有群組 patches＋全模組 Save 的單次交易。多 scope 可能部分成功；不能套用遭拒的 A/B 候選或聲稱已具備此接口。 |

`beginTransferDraft` 仍用目標專屬的舊無 operation UUID marker：不明時禁止盲目
重送／自動接續，使用者可明確唯讀核對既有草稿，再重開清單確認移轉。它尚未
升級成 identified Begin 的原收據恢復；主檢具本身的 durable Begin 不涵蓋這條路徑。
完整統一必須另驗證各 exact endpoint 的 Begin／Save marker、原 guards／generation、
原 receipt 查詢與失去 ACK；404 不能當未執行。

下一輪真正需要決定的是操作邊界，而非是否放寬防線：

1. 若保留目前「先移轉到共享 working，再到目標存取」，操作不變，但此路徑尚未
   達成全部先留本機與一次 Save。
2. 若採每個目標明確「替換並存取草稿」，需在確認中顯示保存整個該模組及其
   既有共享修改；各目標獨立成功／失敗，列明部分成功。前三者可接現有接口；A/B
   需先補模組原子能力，不需為此宣稱四模組有全域交易。
3. 若要求一次勾選四模組「全部成功或全部不動」，需要新的跨模組交易／收據協調，
   #77 沒有此能力；屬獨立設計與整合，不能在檢具 client 假裝完成。

建議下一輪採第 2 項的逐模組明確保存邊界，先呈現完整保存範圍及結果；這是
建議，尚未實作或假定使用者已選定。若目標頁有其他分頁尚未送出的本機內容，
伺服器無法替它保存；須保留其原 guards，讓同欄衝突明確呈現，不得覆寫或清除。
若改成到目標頁先預覽再保存，還需要獨立的跨頁本機 handoff，現有離頁會放棄
未送內容，不能把導頁當持久化。重要覆蓋確認、pending 鎖與明確 Submit 都保留。

本輪沒有修改任何品質模組產品檔，也沒有引入其他候選。實站、真實資料／照片、
真機／跨實體電腦、部署、長期容量及實站效能仍 NOT_RUN。
