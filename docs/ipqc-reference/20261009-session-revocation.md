# 3020 登入撤銷與安全收尾（2026-10-09）

狀態：部分 EXECUTED；真正重啟後舊token重播尚未通過，不得報全部完成。人類已同意先修隔離副本的逐session撤銷；本對話另明確同意保留未同步修改、不代為Save、切換3020並重新登入。日常3000沒有schema/config/業務寫入或服務操作；後續整合由另指定Codex對話接手，本任務停止新增修改。

## 根因與實作

原登出只讓瀏覽器cookie過期，伺服器只驗簽與8小時期限，原cookie仍能驗證。`session-revocation.ts`以SHA-256 digest在獨立 `process_revoked_sessions(token_digest,expires_at,revoked_at)` 表持久撤銷；不保存原cookie或密碼。正常登入、demo入口、roles／same-origin／權限仍沿原路徑。登出等候寫入並核對成功後才清cookie；讀寫失敗拒絕或503，前端既有流程保留帳號與輸入，不假報成功。

`PROCESS_SESSION_REVOCATION_ENABLED=1`只在已明確migration的目標啟用；未啟用服務維持原行為，公開讀取／登入不建schema。SQL為明確可重入migration，不替日常自動執行。3020 fixture改用各自私人持久ledger／簽章文件，與业务JSON分開；fixture切帳號每次產生新會話，避免重用已撤銷token。`close`同時關閉业务及auth SQLite。

## 驗證與實際限制

| 情境 | 結果 | 證據／範圍 |
|---|---|---|
| 原日常資料的fresh COPY：舊schema、缺schema fail-closed、重入migration、原登入保留、normal/demo roles、expiry、雙次舊token拒絕、其他同帳號登入有效、storage讀寫失敗、跨origin | PASS 15項 | session-revocation-daily-01/session-revocation.json；僅副本SQLite，3張原表雜湊及revision450不變，R2寫入0、listener0。兩次APIrequest不是實際瀏覽器雙分頁。 |
| 同持久簽章的新fixture instance、撤銷ledger讀回、備份副本加回較新撤銷後再啟用 | PASS 3項 | session-storage-02/result.json；不是實際server程序restart。第一次跨VM prototype相等判斷FAIL保留私人log，改用完整狀態雜湊核對。 |
| 新3020正常DemoADMIN登入 | PASS UI | 既有localhost驗收分頁通過正常入口；沒有business Apply／Save。 |
| 真正HTTP normal登入兩次→登出其中一個→原token兩次403，另一token200 | PASS | session-live-ready.json／session-live-result.json第一項，token只在測試程序記憶體。 |
| 真正server重啟後，用同一原token及另一登入再驗 | FAIL：協調逾時，未完成 | session-live-result.json保留07:07:27 FAIL。PowerShellready探測每次2秒，未送出restart coordination訊號；測試程序逾時退出，不能由新PID或instance測試推成PASS。根因尚未充分核實，不直接宣稱IPv6問題。 |
| 重啟後HTTP可用／最新資料保留 | PASS，只代表readiness／資料 | PID8500；closing-readonly-check.json：127.0.0.1 HTTP200/31ms/348，localhost HTTP200/15ms/45；兩scope各13鍵、四個checkpoint與切換前byte-equal。 |
| 實際瀏覽器双分頁logout、正常帳號完整送審自審鏈、403/pending全套與實體手機 | NOT_RUN 本輪 | 部分既有API/private-copy回歸另列，不冒充本輪UI驗收。 |
| 新auth/helper/adapter定向lint | PASS | session-adapter-lint.json 7檔；platform-login原有3個any lint FAIL仍保留，不宣稱全庫lint通過。 |

## 最新服務、保全與交接

最新監聽為既有127.0.0.1:3020、PID8500。启动來源仍是私有證據根目錄父層 `editor-feedback-20261008/runtime/primary-latest.json`（348）及 `synthetic-latest.json`（45），同資料夾的 feedback JSON／archive；原媒體 `whole-module-20261007/isolated-photos`，參數 `--web-feedback --session-revocation --max-old-space-size=6144`。禁止用old before覆蓋最新业务。

私有證據根目錄為 `<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/integration-20261009/`。session-switch-before-01保全135檔，SHA manifest逐檔吻合。runtime另有 primary／synthetic `*-session-secret.json` 及 `*-session-revocations.sqlite`，只留私人本機runtime，不讀出值、進Git、ZIP或帶到日常。恢复ledger須合併較新撤銷，不能復活登出會話；备份副本演練已驗證，真實恢复未執行。

首次啟用fixture持久簽章與舊每啟動隨機簽章不同，原fixture頁需重新登入一次；**不是**逐session撤銷驗收的證據。後續启动重用同檔；本轮浏览器先前已登入的合成session在PID8500仍可讀取，仍不等於已撤銷token重播验证完成。

原id6 A-CUT-02表單仍開啟並保持可見欄位12213／3213／原標準；原id8七筆本機移動未寫共享。未替使用者儲存，未重新整理原分頁。所有寫入演練均在合成副本或private COPY。收尾以原SQLite read-only connection做線上auth備份到session-switch-after-auth-01，兩ledger integrity ok，secret byte-equal，原DB寫入0；primary0、synthetic1筆撤銷。不輸出digest或secret值。

2026-10-09 14:19（Asia/Bangkok）已停止新增程式／資料／UI寫入，沒有仍運行的驗收probe或子代理。正常3020 PID8500保持；日常3000零操作。其他任务是否已停止由交接者另核對，不能只依本任務停止推論。完整開啟／restart-replay等未完成驗收交下一唯一寫入者，不再於此啟動新驗收或日常整合。
