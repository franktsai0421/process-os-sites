# 網頁問題回報小幫手 V1 — 實作與驗收交付

任務 web-feedback-v1-3020；STATE: EXECUTED（本機功能完成，完整效能／生產驗收未完成）。2026-10-08 實作，2026-10-09 完成恢復與補驗。依 Direct Implementation ZIP 的 02、03、08、09；最新授權不等待 ChatGPT，不送訊息或更改其他 C2C session。

## 工作區與保全

工作目錄 <WORKSPACE>/中控系統，branch codex/ipqc-ab-local，HEAD 8b182626085bb2aa1f3a216903c5b373ee82bc44，未切換。實際 AGENTS 已讀；保留全部 dirty／untracked／並行 FQC、模具及畫布工作。起始／結束 dirty 完整清單及本任務差異保存在外部證據，沒有以 HEAD 版本替代工作樹。

證據根目錄 E = `<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/web-feedback-v1-20261008`。`before/` 是修改前受影響檔案保全，`git-before.txt`／`git-after.txt` 是狀態，`task-manifest.json` 是本任務檔案雜湊，`task-diff/*.patch` 對照保全而非整個 dirty checkout。此目錄中的業務快照是私有保全，不放進回報 ZIP 或送 ChatGPT。

3020 來源為本 checkout 的 scripts/ipqc-isolated-server.cjs；既有 runtime 是 `E/../editor-feedback-20261008/runtime`，原媒體為 `E/../whole-module-20261007/isolated-photos`。127.0.0.1:3020 是原隔離資料，localhost:3020 是同服務、不同 DB 的既有合成 editor fixture。測試寫入只在記憶體 fixture 或 localhost 回報資料；沒有寫原業務、送審／核准。

10/09 原服務已不在運行，核對最新 checkpoint 後恢復；最後為載入 API 安全修正，僅核對並重載同 3020，PID 9328。最新原業務 revision332、合成41保持，13 個業務鍵逐一 SHA 比對全部相同；包括主資料、AB/C IPQC、authoring、approval、BOM、使用者、dispatch、quality/IQC。媒體引用與原封存來源保留。`live-preservation.json`／`tests-final/live-preservation.log` 是重啟後實際唯讀結果，合成2案件／1交接及舊 ZIP 雜湊不變。不能用 before／旧258／262整庫覆蓋之後新資料。

沒有操作 3000／3030／其他服務，也未建立新 PORT。共用 checkout 的 bootstrap 只新增可選 process-ui-ready 事件；正式 index 不載入 helper，未啟用環境 API 回404。這不是已驗證 3000 整合；原測試帳號橫幅／啟動器不能帶入日常。

## 修改檔案與資料結構

新增功能：lib/web-feedback.ts、lib/web-feedback-zip.ts、app/api/web-feedback/route.ts、public/process/web-feedback-loader.js／web-feedback.js／web-feedback.css。新增隔離與驗證：scripts/web-feedback-schema.sql、start-web-feedback-3020.ps1、test-web-feedback.cjs、test-web-feedback-location.cjs、verify-web-feedback-zip.py、web-feedback-live-check.cjs。

增量修改只有 public/process/bootstrap.js（ready 事件）、scripts/ipqc-assignment-fixture.cjs（opt-in 建專用表）、scripts/ipqc-isolated-server.cjs（opt-in 注入、專用 checkpoint）。未重寫 process-editor／canvas-local／editor-graph／BOM/IPQC，不將小幫手接入原 working、Save 或送審。

`web_feedback_store(id=1, revision, payload)` 保存案件、附件索引、送出收據、交接快照，CAS 單次全成功／拒絕。單列最多1.5MB；達上限拒絕且本機草稿保留。這低於 [D1 官方單列／字串2MB限制](https://developers.cloudflare.com/d1/platform/limits/)，但 V1不是大量生產容量方案。此 SQL 只在本機 fixture 初始化，沒有正式 schema/migration。

STATE_ARCHIVE 的 `web-feedback/v1/ATT-*` 原圖与 `H-*.zip` 不重用其他模組 key。圖片原始 bytes／名稱／SHA／owner／來源權限 envelope 保存，生成後才 CAS 記交接。IndexedDB process-web-feedback-v1 / drafts 依 origin、核驗帳號保存 Blob 和固定 pending operation。詳細權限／資料流唯一來源見 [模組](../../AI_CONTEXT/modules/WEB_FEEDBACK.md)。

規格及路由同步更新：docs/specs/current/WEB_FEEDBACK.md、README.md；AI_CONTEXT/modules/WEB_FEEDBACK.md、AI_CONTEXT.md、DATA_MODEL.md、CHANGELOG.md；HANDOFF.md。本報告只記日期固定的實測，不替代現行規格。

## 員工端與管理端完成內容

右下46px入口、260×340非模態面板；多標記文字／圖片／原始位置獨立，Ctrl+V與本機上傳、真縮圖／放大／移除、收合与重開恢復。定位捕獲攔截底層操作、Esc 清理，穩定 data-node 卡片与記錄一致性，模態控制重用降為頁面定位。原彈窗 top-layer 內回報與相簿可以操作。公開清單自小幫手開啟為獨立浮窗，不替換原資料後台內容。

管理入口實際位於 users 後，左清單／右詳情、ID／原始文字／人員／日期／狀態／模組／頁面篩選，管理備註與完成／重開，交接歷史與下載。普通員工的基本公開案件与按原權限顯示圖片；不能取得私備註／管理更新／ZIP。帳號切換清掉私人 DOM，非同步回應由 identity epoch 隔離。

## 根因與修正

1. 大型130MB舊狀態每次身份讀取都解碼：現在每請求輕量查revision，只在改變時重讀權限鍵；登入Cookie仍逐次核驗，撤權／maintenance的39項 API驗證保留。
2. 瀏覽器 native dialog 會使 body sibling inert：helper／相簿移至原 active dialog，不另開 modal、不鎖原頁捲动，關閉還原到body。
3. 現行卡片用 data-node，而重複端點按鈕不能單獨定位：選卡片穩定ID，resolve檢查路由／唯一性／記錄；原彈窗通用ID不錯認下一個產品。
4. 前端舊 currentUser 可能滯後帳號切換：使用 ProcessSync身份並由 capabilities核验後讀帳號草稿；管理慢回應過期拒收，來源文字全部跳脫，不將歷史回報人當 HTML。
5. 語言由現有翻譯直接改 lang：只觀察該單一屬性，已開面板也更新中越文，不觀察整頁 DOM。

## 03_ACCEPTANCE 逐項結果

PASS 只涵蓋表中層級；NOT_RUN 不當作已通過，實際手機不是 viewport 模擬。

| 驗收項目 | 結果 | 實際證據／界線 |
| --- | --- | --- |
| 登入入口隱藏、登入後入口 | PASS UI/API | 停用帳號原登入頁，launcher none；admin/employee及editor/data/approval實際開啟；其他登入頁未逐一 UI 測 |
| 44–48px入口、260px/340px面板 | PASS UI | 桌機 DOM 46×46；390×844面板260×340 |
| 無遮罩、原頁／原彈窗捲動、內部捲動 | PASS UI | body overflow未由helper修改；原dialog可取消、面板overflow內捲；實體觸控NOT_RUN |
| 多標記新增／刪除／切換互不覆蓋 | PASS UI | 實際2筆不同描述与附件；最後增／刪第三標記不建案 |
| 定位不觸發功能、Esc、失效不錯指 | PASS UI/VM | 導覽／畫布內容選取不開業務彈窗；6項重用ID／刪除／路由／記錄測試 |
| 未選位置保留起始頁 | PASS UI | 第二案件切頁後仍保存approval起始頁，草稿重開不偷換 |
| Ctrl+V、上傳、縮圖、放大、個別移除 | PASS UI/API | 聚焦textarea貼PNG、chooser原圖、原dialog相簿自然寬1px、移除 |
| 切換／收合／重整／重登與附件恢復 | PASS UI | 實際重整、關分頁重開、換admin/employee、3020重啟後草稿仍在 |
| 整個瀏覽器程序關閉／重啟 | NOT_RUN | 僅測關分頁及重新建立，未終止使用者瀏覽器程序 |
| 有效標記独立案件／同批次／空白排除／冪等 | PASS UI/API | 合成2案件，同批；無回應重試／變更payload／第二筆不合法整批拒絕 |
| 後台入口於users後 | PASS UI | previousElementSibling data-tab=users；admin-final.png |
| 人員／日期／狀態／模組／頁面查詢 | PASS UI | 原文字搜尋、ID、人員、日期起訖、狀態、模組、頁面與清空共15項UI檢查全部PASS；ui-filter-results.json |
| 我的處理私人備註／完成／重新開啟 | PASS API/UI | 實際admin備註＋完成，重開後歷史仍當時done／最新open，再標完成；ui-status-results.json及admin-history-immutable.png |
| 歷史快照与新舊關聯 | PASS API/UI | API再次匯出／狀態變更不改舊快照；真UI重啟後H-*歷史保留 |
| 員工公共清單／圖權／私備註及ZIP拒絕 | PASS API/UI | API403及公開projection；employee-cases.png；admin-only圖片保守授權 |
| ZIP全部JSON/MD/原圖 | PASS實際ZIP | Python zipfile CRC／manifest／原描述；瀏覽器下載10entry/2案/2圖 |
| 固定ID、原名、SHA、無自動憑證採集 | PASS API/ZIP | allowlist排除password/token；標準解壓SHA一致；人工提供圖片內容不由系統自動判敏感 |
| 再匯出不建案／失敗不記成功 | PASS API | 再匯出新交接同案件；R2 put失敗503、交接數不增；同receipt回原H |
| 安全環境／定位失效 | PASS API/VM | build安全值；6項定位重驗，不採頁面內容為指令 |
| 收合零案件輪詢／掃描、原頁先載 | PASS source/UI | lazy完整版／CSS；process-ui-ready後才注入；無全頁DOM觀察、無回報輪詢timer |
| LCP增幅建議≤5% | PASS本次短期對照；非全站認證 | 三組交替，baseline中位136ms、enabled120ms；ready3338ms/3296ms，樣本有1856ms基準離群值 |
| 正式INP≤200ms | NOT_RUN | 事件代理interactionMax104ms；沒有DevTools trace工具／正式INP算法，不冒充INP |
| 首次展開≤300ms | FAIL慢路徑；暖測PASS | 暖身份首展開67ms；冷身份API約543–672ms，20次開關碰背景queue時309–600ms，不移除queue或checkpoint保護 |
| 長時間記憶體不持續增長 | NOT_RUN長時；PASS短期 | 20次開關只有1panel/1launcher；heap約30.5→29.5MB且有GC下降，不能代替長時間壓力 |
| 小幫手故障不破壞原儲存／送審 | PASS定向；NOT_RUN完整模組 | 7項原startup回歸、登入保護、業務13鍵完整；API off/failure；未做3020完整送審撤回UI |
| 畫布成果／其他模組保留、未動3000 | PASS資料保全；NOT_RUN跨port | 原332/合成41全部13鍵及ZIP重啟雜湊；不操作FQC/IQC/IPQC/BOM業務；正式3000整合未執行 |

## 測試指令與原始輸出

- `node scripts/test-web-feedback.cjs E/tests-final`：39項PASS；api-results.json、api-raw.log、runner-output.log。真API handler＋記憶體SQLite/R2，涵蓋同源、登入、撤權、維護、來源、容量、image signature、CAS競態、原子性與immutable ZIP。不是 live全流程UI。
- `node scripts/test-web-feedback-location.cjs E/tests-final`：6項PASS；location-results.json／location.log，VM DOM fixtures。
- `node scripts/test-process-editor-startup.cjs`：7項PASS；startup.log（模型耗時5ms，非網站載入速度）。
- `node scripts/test-demo-auth.cjs`：PASS；demo-auth.log，簽章／身分／撤權／既有role／受保護API。
- 定向 `oxlint`：PASS，tests-final/lint.log（含TS lint規則，不等同全專案tsc）。完整build／全專案tsc／完整FQC/IQC/IPQC/BOM功能套件 NOT_RUN；沒有因此放寬保護。
- Bundled Python `scripts/verify-web-feedback-zip.py E/tests-final/acceptance.zip`：PASS；9 entries、2案件、1圖。瀏覽器原下載 ZIP 的 `E/browser-export.verification.json`：10 entries、2案件、2圖，CRC／路徑／原圖bytes／manifest全部PASS。
- `node --max-old-space-size=4096 scripts/web-feedback-live-check.cjs E`：PASS，最新live-preservation.json与raw log；唯讀3020，13鍵／兩份revision／2案件／1交接／下载ZIPSHA相同。

實際桌面證據：admin-final.png、admin-history-restored.png、helper-original-dialog.png、employee-cases.png；登入：login-no-helper.png；390×844：helper-mobile-zh.png／helper-mobile-vi.png。均是瀏覽器實際截圖，不是設計參考圖。前端可讀量測：performance-paired.json、short-reopen-cycles.json。早期測試的selector等待超時、Python alias不能執行、Downloads旁寫驗證結果被擋，都已改用正確semantic locator／bundled Python／允許的外部證據路徑，未丟失檔案或改業務。

## ZIP 實際結果

瀏覽器生成 H-9a11f9fd-bb3a-457e-a19b-eba1fe37719f，ZIP 10716 bytes，SHA-256 `4fe383356ea741297126886b05149dd4a2445891a815ad17b0cdd43036150ab2`。瀏覽器 download事件取得實體文件，複製至E/browser-export.zip後標準解壓PASS；重啟再讀下載相同雜湊。未上傳ChatGPT或其他服務。

## 效能限制、未完成事項與回復

最主要慢路徑仍是原隔離service串行queue遇大型shared-state讀取；權限快取已去掉每次重解碼，但不能靠取消安全排隊／durable checkpoint換速度。正式INP、持續長時memory、實體iPhone、整個瀏覽器退出與跨port回歸未驗收。首次冷權限讀取超300ms建議目標仍待改善。

V1單列容量、原圖scope envelope保守授權、多分頁同帳號本機draft last-writer及orphan blob保留政策是後續事項。管理export結果不明時保持原operationId；修改勾選會明确開始另一批，不會用新payload覆寫舊batch。不宣稱這已是大量生產部署方案。

回復程式：先確認沒有並行新改動，再按task-diff語義移除本任務三處接線，停用feature flag／loader；不要整檔覆蓋共用bootstrap／fixture/server，也不要git reset。回報資料、原圖及ZIP保留，不down-migrate。服務恢復：`scripts/start-web-feedback-3020.ps1`（已有未知服務拒絕；已啟用則拒重開；只有必要核驗重啟才用 -VerifyRestart），使用 runtime 最新 primary/synthetic-latest、專用 feedback checkpoint及原archive/media，不使用證據before整庫回滾。

日後併3000：另核對批准SHA、schema初始化／資料容量策略、DB/R2 binding、日常權限、正式HTML feature flag接線及回歸；不搬3020測試登入／橫幅／host分流。此次 commit／push／merge／deploy／正式DB寫入全部未執行。可將本報告與已核驗回報ZIP供独立複審；本次未等待或修復外部connector。
