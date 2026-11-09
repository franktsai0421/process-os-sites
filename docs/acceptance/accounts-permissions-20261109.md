# 帳號與權限：需求盤點及未完成驗收

2026-11-09 UTC。這份交接是新的獨立盤點，不是帳密修復完成或可發布證明。

## 固定來源與已確認狀態

- GitHub main／本次產品來源：`d4ac309fe05c89288af226b52c18161865ccdcb8`（#98）。
- #92 已於 2026-11-06 合併，merge `638615807dafc32782dc327d56b348b6e4c82902`；只有角色版面成果，不能代替帳密或全功能驗收。
- 新帳密候選 `efa7b75fd8be09317729c8c607c2837e3f5d8b61`，與 IPQC A/B 的本機整合 `40bb24a5e3185b04b10a27024c900f9cbf02ffc5`。這兩份既有候選未由本工作重套或上傳。
- 既有後續雲端收據已分別確認兩個候選的完整來源歷史通過；原淺層 checkout 的失敗仍保留，不能混為同次執行。整合版另有 296 項 Node、16 個 compiled 帳號情境、7 個 compiled A/B＋帳號情境與 lint/type/build 的既有收據；不是瀏覽器或真帳號驗收。
- 測試站 `https://process-os-test.franktsai0421.chatgpt.site/login` 能顯示登入入口。本次未登入、不取得密碼、不改真帳號。
- Sites 保存版本 v42 的 source 是 `1fae5ae3a6f4bed27f829dd475ee2c8fa4ad370b`，查詢時沒有 deployment ID；v41 有成功 publish 收據，source `2e59923b1f27d39baa960d724381e7515beebd51`。僅可確認 v41 曾部署成功，不以保存 v42 推定已部署，也不以登入畫面推定正在服務哪個 source。
- 本次只讀 GitHub open PR 集合沒有帳密／權限 PR。沒有查出舊未確認 upload 的完整 manifest；未建立新權限修復 PR，不宣稱舊上傳成功或失敗。

## 使用者問題逐項追蹤

| 項目 | 本機／來源 | GitHub | 測試站 | 實際驗收 |
| --- | --- | --- | --- | --- |
| 1. phung 等帳號不能登入 | 有既有候選及隔離 crypto/login 證據；無真帳號診斷，不判定是角色不足 | 帳密候選未見 PR | 未確認採用候選 | BLOCKED：真帳號登入尚未驗收 |
| 2. Frank 重設密碼確認無反應 | 候選加入 fresh prewrite、防舊回覆、原生驗證／雙語錯誤及 credential-state 診斷 | 同上 | 未確認修復 | NOT_RUN：實際確認、新密碼登入及舊 session 失效 |
| 3. 新增／編輯／保存／改權限 | main 合成 API 政策 51 項與投影 140 次本輪 PASS；不是每個 UI 按鈕 PASS | main 已有既有流程 | 未驗 UI 全輪 | NOT_RUN：每種按鈕／角色／結果與重讀 |
| 4. 更多：密碼／停用／刪除 | 合成 API 有角色界線、停啟用 epoch、密碼及邏輯刪除測試；native Confirm 未驗 | 無本輪產品變更 | 未驗 | NOT_RUN：中越文各按鈕、取消、讀回與錯誤 |
| 5. 刪除後名稱重用 | main 為邏輯刪除；保留原 ID、歷史與帳號名稱，create 會 ACCOUNT_EXISTS。沒有 restore-user 命令 | 規則已在 main | 未確認使用者理解或實測 | 不可宣稱可重用；變更規則需先核對歷史關聯，未刪資料 |
| 6. 太短／亂碼／混語提示與衝突 | 候選處理二次翻譯、語言來源、known prewrite 與 UNKNOWN；main 版本衝突仍可真實拒絕，不能自動重送 | 候選未見 PR | 未驗 | NOT_RUN：提示閱讀時間、全對話文字、斷線／已寫未讀回 |
| 7. 角色範本版面／詳細設定 | #92 已合併；保留其新版，不覆蓋 user-access 檔案 | MERGED #92 | v41 早於該修正，不以 v42 saved 當部署 | NOT_RUN：目前站台桌面／手機與實體裝置 |
| 8. 越文混中文／按鍵異常 | 同帳密 i18n 候選；沒有逐頁全面驗收 | 無新 PR | 未驗 | NOT_RUN：雙向語言切換、native IME／實機 |
| 9. 逐頁權限與按鈕／後端 | 648 resolver 比對、24 目的頁、108 workflow metadata、11 舊 session 撤權；整支既有 audit FAIL（38 Save 表示差異） | main 仍有需求差距 | 未驗 | FAIL／NOT_RUN：詳見下段；metadata 不等於業務操作生命週期 |
| 10. 獨立模組草稿／各線可見／修改可存 | 同頁 A/B/C 可見 PASS；lines 仍共用 AB/C，lines.view 進入口後 AB API 403 可重現；Save 由 edit 派生 | 拆分未完成；#94/#95 是未啟用邊界／helper | 未確認啟用 | BLOCKED：先完成資料 adapter、交易與 scope 拆分 |
| 11. 舊審核不升高階／高階含送審撤回 | 新需求診斷 FAIL：legacy review 仍可映成 approval.approve；明確 high grant 不派生模組 submit/withdraw | 無本輪政策變更 | 未改帳號 | FAIL：需權限來源／角色／覆寫遷移 preview，未套用 |
| 12. 已核准不能撤回；發回與撤回同功能 | 核准後撤回在純 kernel 為 409 CASE_NOT_PENDING，PASS；return 與 withdraw 的權限及 self-review 條件不同，FAIL | main 原保護保留 | 未驗端到端 | FAIL／NOT_RUN：須同步各入口 gate／路由／狀態與理由 |
| 13. 問題回報人人可見，其餘依權限 | FAIL：feedback.view 可被關；非 admin 明確 edit/exchange grant 被 adminOps ceiling 拒絕。沒有更改媒體／原圖 ACL | 與既有 feedback 工作協調後實作 | 未改資料 | FAIL：需分開核對頁面／案件／原圖／ZIP 的授權 |

## 本輪新增的可重跑診斷

```sh
node scripts/audit-account-permission-requirements.mjs
```

在上述 main 來源執行：10 個需求斷言中 3 PASS、7 FAIL，exit 1。這是公開列出未實作要求的診斷，不納入 CI 當成通過測試。使用實際 policy、effectiveAccess 與純 V3 transition kernel，加上合成身分／待審案件；不讀真帳號、不使用真密碼、不寫業務資料、不開網路。它不替代 actual-handler、完整 compiled/browser 或真帳號驗收。

七個失敗分別是 legacy reviewer 升為高階、舊 reviewer 的模組送審／撤回遷移未做、高階未涵蓋模組送審／撤回、feedback 普遍查看、feedback edit/export 授權、return/withdraw 權限不同、同一作者的 return/withdraw 自審確認不同。不同的 terminal audit 標籤是否需合併未另作假設；診斷只比較權限、確認與回到相同草稿內容／saved ID 的結果。

既有 `scripts/audit-users-page-permissions.mjs` 本輪原樣執行：161 次隔離帳號設定寫入、283 次合成 API 請求；648 resolver、24 目的頁、108 metadata 與 11 撤權 session。38 個差異全為配置 save=false、API save=true，來源是 edit 包含 Save 的既有需求。原腳本最後的 38 !== 0 assertion 仍 FAIL；沒有改斷言或關掉 guard。這不是 38 個新增越權漏洞，也不能說 UI 已準確表達衍生權限。線別入口與 AB API 不一致也保留。

本輪 main 的完整 source/history/worktree gate PASS：595 commits、5240 unique blobs、1999 source files（含本輪兩個新檔）；沒有開真實資料或回傳憑證。這項成功只適用這個 main／本次盤點檔案，不替代既有候選的遠端 CI。

## 下一批修改的明確邊界

1. 帳密候選繼續由既有來源工作的單一寫入者處理，先核對完整 manifest、原 upload 結果與現在的 head。未知不得重送，被拒絕不得拆分、換路或新對話重送。本輪沒有啟動、重連或重建原中控連接器。
2. 資料草稿拆分完成後，再用新 module/scope 邊界同步 policy、目的頁、workflowAccess、照片及後端 create/delete/restore effects；線別不是另限制 A/B/C 可見範圍。
3. 權限遷移先產生逐角色／逐覆寫的 before/after preview：舊模組審核者對應 submit/withdraw，不因舊 fallback 獲得新高階 approve；既有明確授權須有可核對來源。由使用者決定實際帳號變更，不批次重設真人權限。
4. return/withdraw 合併必須同步來源頁、版本平台、路由及 kernel；保留原 case、saved 內容、CAS、pending lock、理由、歷史及未知寫入收據。核准後撤回繼續拒絕。UI 的無真實功能選項要移除可勾能力，舊值保留而非刪掉歷史。
5. feedback 普遍頁面查看與授權 edit/export 分開驗；頁面可見不代表原圖／其他來源資料一併開放。與 feedback 寫入者核對同檔 ownership，不能以全權帳號驗完當全部角色通過。
6. 每批修復後補對應 API＋UI，包含兩身分交錯、取消、版本衝突、斷線／讀回失敗與 UNKNOWN 不重送，中越文桌面／手機尺寸；實體裝置和 IME 單列。必要驗收尚未通過，不合併、不部署。

## 本輪交付及限制

本輪只有新的診斷腳本與本交接文件，沒有產品、schema、migration、帳號、權限設定、備份、媒體或部署變更。既有帳密／A/B、製程和全站背景檢查候選均未覆寫。沒有 GitHub mutation。

原主要整合上傳結果仍 **UNCERTAIN**（沒有完整清單／結果）；相關來源轉送拒絕仍是 **BLOCKED** 的既有操作，沒有在本輪重試。現有 browser/preview HOLD、native Windows CI 與真帳號驗收尚未解除。已核對站台登入入口不代表已完成帳密驗收。


## 第一批本機修復：儲存能力說明

後續工作沿本盤點 commit `c9537fd` 獨立進行，沒有重套或傳送既有帳密候選。角色 preview、角色／個人矩陣與自己的唯讀權限，對實際後端已由 Edit 派生 Save 的十個模組顯示「修改權已包含／Đã gồm trong quyền Sửa」。取消查看或修改時同步更新說明；單獨 Save、editor、routine 與 lines 不宣稱有未實作的派生能力。原始 checkbox／個別 deny／可編輯狀態及保存 payload 的資料來源不變，沒有改任何帳號或後端權限。

產品變更只有 user-access.js 的顯示 helper、說明與同步節點，以及該 JS 的 index cache tag。沒有修改 CSS、登入、帳號 mutation、policy、workflow adapter 或資料庫。Local safety 原帳號命令追加一個 regression 檔，保留原步驟／trigger／token permissions 與失敗傳播。

新回歸最初 4 FAIL／1 PASS，產品修正後最終 6/6 PASS：中越文、role／individual、view/edit/save 組合、所有 162 個原 checkbox 的值與 disabled 邊界、修改後原節點同步、唯讀／deny 保全；第六組直接讀 11 個實際 workflow handlers 的 permissions GET，十個模組與 editor 的能力及標籤一致，DB／R2 零寫入。另既有 navigation、receipt、identity fence、dirty dialog／初讀 75/75 PASS，scoped normal lint／diff check PASS。

既有 38 項 audit 的比較是 raw Save cell 與派生 API capability，原斷言仍會 FAIL；本批修的是畫面明確呈現派生能力，沒有偽造 raw cells 相等。前述 7 個政策／kernel 需求差距仍須分批處理，未因這批顯示修正變成 PASS。Native browser、Windows CI、真帳號與部署未執行；既有 browser HOLD 未繞過。未上傳 GitHub。
