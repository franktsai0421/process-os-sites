# 帳號與權限：需求盤點及未完成驗收

2026-11-09 UTC。首次盤點後已追加六批本機候選；不是帳密修復完成或可發布證明。最新：feedback 兩項原始政策差距已修，10 項需求診斷為 6 PASS／4 FAIL；四項相依阻擋見文末。真帳號、GitHub 與測試站狀態仍分開追蹤。

## 固定來源與已確認狀態

- 首次盤點的 GitHub main／本次基底產品來源：`d4ac309fe05c89288af226b52c18161865ccdcb8`（#98）。
- #92 已於 2026-11-06 合併，merge `638615807dafc32782dc327d56b348b6e4c82902`；只有角色版面成果，不能代替帳密或全功能驗收。
- 新帳密候選 `efa7b75fd8be09317729c8c607c2837e3f5d8b61`，與 IPQC A/B 的本機整合 `40bb24a5e3185b04b10a27024c900f9cbf02ffc5`。這兩份既有候選未由本工作重套或上傳。
- 既有後續雲端收據已分別確認兩個候選的完整來源歷史通過；原淺層 checkout 的失敗仍保留，不能混為同次執行。整合版另有 296 項 Node、16 個 compiled 帳號情境、7 個 compiled A/B＋帳號情境與 lint/type/build 的既有收據；不是瀏覽器或真帳號驗收。
- 測試站 `https://process-os-test.franktsai0421.chatgpt.site/login` 能顯示登入入口。本次未登入、不取得密碼、不改真帳號。
- Sites 保存版本 v42 的 source 是 `1fae5ae3a6f4bed27f829dd475ee2c8fa4ad370b`，查詢時沒有 deployment ID；v41 有成功 publish 收據，source `2e59923b1f27d39baa960d724381e7515beebd51`。僅可確認 v41 曾部署成功，不以保存 v42 推定已部署，也不以登入畫面推定正在服務哪個 source。
- 本次只讀 GitHub open PR 集合沒有帳密／權限 PR。沒有查出舊未確認 upload 的完整 manifest；未建立新權限修復 PR，不宣稱舊上傳成功或失敗。

## 首次盤點：使用者問題逐項追蹤（後續候選見下方各批）

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


## 第二批本機修復：發回與撤回的自審確認

只處理已確認的一個差異：原作者發回自己的待審案件，不再被當成「核准自己的內容」。`lib/shared-draft.ts` 只對 approve 計算 selfReview；共用 VersionDraftUI 即使接到舊 caller 的 selfReview=true，也只在 approve 顯示並回傳自審確認。reject／return／withdraw 仍須理由；補齊 return 的中越文標題。本人核准仍要求 selfReviewConfirmed，已核准仍不能發回／撤回，原權限、generation、expectedRevision、pending、CAS 與收據重播前的撤權檢查均保留。舊收據重播不改舊 selfReview 歷史欄位。

這批沒有合併 return／withdraw 的權限鍵：目前 return-only／withdraw-only 的差異仍是下一個獨立遷移／權限議題，不宣稱完整「同一功能」已實作，也不將舊角色自動升級或實際重設任何帳號。

- 新增 9 組回歸：純 kernel、實際共用 route＋合成 adapter 的持久化／拒絕 CAS、歷史收據不變，以及實際 confirmReview 函式的中越文 DOM ports。首次 RED 包含 SELF_REVIEW_CONFIRM_REQUIRED；fixture 起初缺 pending version 投影而先被 BEGIN_REQUIRED 拒絕，補齊 fixture 後再確認真正 RED。沒有放寬產品守衛。
- 來源頁／kernel、no-change／Submit、navigation 選組 75/75 PASS；品質確認／fences／receipt 選組 112/112 PASS（計數有重疊）；既有 V3 kernel runner 15 組 PASS。兩批新測試合跑 15/15 PASS。
- 製程 submit-feedback 只將有終端摘要的 S4／S8 算 2 組 PASS。原完整命令在 S6 前後停止產生進度，exit 0 但沒有最後 PASS_BOUNDED_SUBMIT_FEEDBACK 摘要，列 INCOMPLETE，不當整支通過；未因此改動其他製程工作。
- 正常完整 lint 與 TypeScript noEmit PASS。原檔 review helper 保留既有 CRLF；普通 diff --check 回報新行的 CR，另以明確 cr-at-eol 且保留其餘空白規則檢查 PASS，整檔沒有行尾空白。完整 lint 初次發現新增 node:test 註冊的 floating-promises，按既有模式明確 void；第一批對應修正提交為 `38f4b93`，取用第一批須同時包含 `dab20d2` 與 `38f4b93`。沒有停用規則或刪減斷言。
- 最新需求診斷為 4 PASS／6 FAIL、exit 1：RETURN_AND_WITHDRAW_USE_SAME_SELF_CONFIRMATION 已 PASS；其餘六項原樣保留。不是全部修復完成。

正常 build 在最終產品提交 `8b1e471` 以 SOURCE_SYMLINK_REFUSED 退出 1，尚未編譯，列本機環境 BLOCKED；沒有繞過或重試。已只移除本工作建立的 node_modules 連結，兄弟工作相依不動；清理後正常 source-boundary check PASS。標準 postinstall 限獨立 checkout，本 worktree 不符合，所以沒有跳過安裝腳本或換 checkout 繞過守衛。Native browser／Windows CI／實體裝置／真帳號、GitHub upload／merge 和 Site 發布均未執行。兩批仍是本機候選，先前未知 upload／傳送拒絕的邊界維持。


## 第三批本機修復：持續結果提示與刪除代碼說明

針對第 5／6 項：帳號頁在收到有效儲存回覆並成功讀回核對後，新增持續的「上次操作已儲存並讀回確認」狀態列，不依賴短暫 toast。明確讀回恢復成功也可顯示，但未確認寫入、已收到 ACK 卻未讀回、對象已變、換身分及重新登入分支不宣稱成功。下一次有效確認嘗試先清除上次結果；只讀核對未寫入不能變成成功。狀態只存在本頁記憶體，綁原 identity stamp，在導覽 reset／delivery invalidation 清除；語言切換重畫用目前語言，不持久保存訊息或輸入。

刪除確認與 ACCOUNT_EXISTS 的中越文，明確區分「帳號代碼」：刪除保留業務資料、歷史和原帳號代碼，同一代碼不能重建。這是現行後端行為的說明，不是新增刪除／還原／重用規則，也不限制顯示姓名重複。沒有刪除或重設任何真帳號。

新增 13 個實際 submit/content 函式加 synthetic DOM/response ports 回歸，首次 11 個案例時為 4 FAIL／7 PASS；完成後涵蓋持續顯示、中越文、六種拒絕／未確認情況、GET-only 恢復與核對、下一操作清除，以及舊身分／非帳號頁不帶結果。與既有 navigation／receipt／identity-fence／dialog／initial-read 合跑最終 88/88 PASS、0 skipped。所有模式只有原一筆寫入 port，沒有新網路或真人資料操作。

本批不需重建相依或建置；繼續在同一工作區用內建 Node 執行，沒有回復 symlink、重試 SOURCE_SYMLINK_REFUSED、改路徑、跳過安裝腳本或修改建置 guard。JS 語法／普通 diff／source-boundary 檢查 PASS。新的完整 lint、TypeScript、normal build、native browser、Windows CI、實體裝置／IME 與實站驗收 NOT_RUN；不能把前兩批的 lint／typecheck 當成本批已執行。先前 6 個政策需求仍未改動，沒有新權限鍵、schema、資料遷移或帳號設定變更。未上傳 GitHub。

與既有帳密候選整合時，只合這些結果呈現 hunk、ACCOUNT_EXISTS 文案和刪除說明，保留候選的 fresh prewrite、原生驗證、語言來源與 unknown fences；不可用本檔整份覆蓋候選，也不可把新提示插到尚未完成讀回的路徑。


## 第四批本機修復：錯誤回報頁依授權操作

需求診斷中的兩項原始 FAIL 已在本機候選修正：有效啟用帳號的 feedback.view 必含，不提供無效的取消勾選；feedback.edit／exchange 不再受 ADMIN 天花板限制，前後端均依授權。普通讀者維持基本投影，編輯者取得版本、處理備註和歷史供 CAS 更新。撤權與同時更新不能提交；原操作編號重播保留。新角色的查看預設同步，所有啟用帳號可查看的提示有中越文。

非 ADMIN 安全匯出只使用 reviewed approved-helper-v1 投影及自己的交接歷史／下載，不能拿其他人的封存 ZIP；舊 raw export 仍限 ADMIN。圖片仍核原始存取 envelope，無原圖權時不能透過匯出取得圖片，明確空 imageIds 可匯出文字。Frank primary 軟刪、其他帳號管理限制及其他模組查看限制保持。access-queue 是另一條未接通分支，不因本批宣稱啟用。沒有 schema、資料或真人授權異動。

新增內建 Node TS transform／VM source fixture：只讀本 checkout 的 app/api、lib、public/process 來源，拒絕 symlink／外部目錄／依賴 lookup／outbound fetch，無建置輸出。這是來源層合成單元驅動，不能當 compiled Worker 或正常 build。正常建置與安裝保護完全不動，也未重建 node_modules。

- 新測試起初 6 FAIL；完成後 9 個 feedback 案例與 2 個 loader 邊界案例共 11/11 PASS。實際 route/SQLite memory/R2 memory 涵蓋讀者、停用、普通編輯／安全匯出、原圖拒絕、其他帳號／模組拒絕、CAS 撤權及下載過程撤權。實際 renderBoard/renderDetail 到第一個事件綁定前的模板經中越文 VM ports 驗證，非 native layout／完整互動驗收。
- 既有 feedback cloud/access/layout、import-pending、navigation 合跑 93/93 PASS、0 skipped。editor readiness 5 cases／18 anchors PASS，source boundary、JS syntax、diff check PASS。CI 保留既有 lint/type/build/browser 步驟，另加這批 Node 來源測試，權限仍 contents:read。
- 10 項需求診斷原斷言未刪減，現在 6 PASS／4 FAIL：舊審核不得升級、舊審核對應送審撤回、高階包含模組送審撤回，以及 return/withdraw 授權一致化仍未完成。腳本改用同工作區的內建來源 fixture，執行需 --experimental-vm-modules。
- 本批完整 lint／TypeScript／normal build／native browser／Windows CI／實體裝置／真帳號／實站 NOT_RUN；依賴缺失與先前 SOURCE_SYMLINK_REFUSED 保留，不重試、不換路或跳過 postinstall。未上傳 GitHub／merge／部署。先前來源傳送拒絕與主要整合 upload UNCERTAIN 不變。

套用前須審核實際授權前後差異；這批是可審查來源候選，不能把 source tests 當真人權限已更新。與既有 feedback 工作整合須依 hunk 合併新的 capability、safe export 與 fresh CAS 保護，保留其雙來源、歷史／operation receipts 和預設關閉的事件啟用。


## 第五批本機修復：登入提示語言與帳號來源回歸

SPA 的 protected login 原本把後端中文 error 直接顯示，越文模式因此混入中文。只在呈現層依目前 document language 對應已知 code／舊訊息；初始及 quick-account 提示亦本地化。內部 Error 保留原 message 並攜帶伺服器 code，未知錯誤不透出原文，提供核對頁面的提示；已確認登入但儲存／等待輸入變更的訊息保留不重送說明。fetch、cookie、身分核對、transition finally、5xx／斷線／成功回覆不合法的 unknown handoff 都不改。獨立 /login 仍是現有雙語入口，本批沒有宣稱逐頁翻譯完成。data-safety-ui cache tag 與確切 navigation 契約同步。

- 4 個新 UI ports 測試首次全 RED，修正後 4/4 PASS：中越文、6 個 API code 與舊中文訊息、初始／快速帳號、未知／舊身分錯誤、實際 platformLogin 的內部拒絕／成功／stale／unknown 清理。與 navigation 合跑 37/37 PASS。最終把新帳號／語言／feedback 來源測試與既有帳號結果、身分 fences、導覽、Begin／receipt、feedback、import-pending 合跑 237/237 PASS、0 skipped。未改舊 login-reentry 的原錯誤斷言。
- 7 個新增實際來源 API 測試 PASS：同權限不同帳號、既有 plaintext／scrypt、空白及中越文密碼、管理重設後新密碼登入／舊密碼與舊 session 失效、自改舊密碼核對、stale revision／CAS 競態、新增／更名／停啟用／軟刪與代碼保留、同級／primary／同源及輸出不洩漏秘密。只在 memory SQL/R2 使用 generated credentials；不是 phung／Frank 的真實密碼或站台操作。登入只更新合成限流表，不重寫帳號。
- 測試開發時曾把「DEMO 不可重設普通帳號」當預期，實際 200；核對既有規格／測試後發現這不是已確認規則（既有 DEMO negatives 是同級／primary）。移除未經確認的預期，沒有放寬產品守衛或隱藏已確認需求失敗。現行 DEMO ADMIN 可管理普通帳號的政策需要另行決定；本輪不改這項業務規則，也不操作任何真帳號。
- 此批只改 SPA 訊息呈現及 cache，另增來源測試到原 Windows CI，保留原所有檢查與失敗傳播。原 CRLF 保留，JS syntax／明確 cr-at-eol diff check PASS。完整 lint/type/build、舊需 TypeScript 依賴的 login-reentry runner、native browser／Windows CI／實體 IME／實站 NOT_RUN。先前正常 build 的 SOURCE_SYMLINK_REFUSED 未重試；沒有恢復依賴連結、跳過安裝或換 checkout。

## 四項未完成政策：已重現的相依與決策界線

診斷腳本保留全部十個原斷言，仍以 exit 1 回報四個 FAIL，另附合成移轉與 scope 證據，不能用其餘測試通過消除它們：

| 原始差距 | 實際來源證據 | 下一個具體條件 |
| --- | --- | --- |
| 舊審核不得升為版本平台確認 | 現行 legacy fallback 即可使 approval.approve=true；實際 prepareAccessMigration 將只有舊 approval 檢視／approve/reject 的合成角色寫成同名 saved approval.approve=true，metadata 只有 mappingVersion=2／credentialHashing，無逐格新高階授權來源 | 不能把既有勾選當新高階權。整合者需選定可核對的新高階授權／遷移表示，產生逐角色及覆寫 before/after；實際帳號授權由使用者決定 |
| 舊模組審核者應得送審／撤回 | 同合成角色移轉後 bom.submit／withdraw 仍 false；其餘 12 個現有 submit modules 亦 FAIL | 依已確認的「先獨立草稿再對應權限」順序，先固定新 module/scope manifest，再預覽映射，保留既有 denies／歷史及不升高階 |
| 高階確認包含模組送審／撤回 | 明確 high fixture 已有模組 view，但 12 個模組的 submit／withdraw 仍 false | 與新高階表示、獨立 scope、UI 派生能力和後端一起整合；不得因 high 順帶開未授查看或其他 create/delete/restore |
| 發回／撤回為同待審功能 | 同案件 withdraw-only actor 撤回200、return403；kernel 按 action 取權，route operation receipt GET 亦按原 action，routine-FQC 還有外層 receipt gate，角色與個人矩陣仍各有獨立格 | 同批同步有效授權、來源頁／版本平台 capability、receipt lookup、kernel 和 routine outer receipt；舊收據／歷史保留，禁止只改一處來掩蓋不一致 |

這些是明確整合相依，故沒有在這個 main-based 分支先行改動 runtime 審核／撤回語意。已核對 GitHub main 仍 d4ac309。當時開啟的 [#99](https://github.com/franktsai0421/process-os-sites/pull/99)（83dcd5c，PR 描述）明示未含權限模組調整或草稿資料切換，另一拆分候選採 LINES 整頁草稿但尚待資料／權限與 PROCESS link 適配。實際 moduleForURL('?view=data&dataTab=line-admin')=lines，舊 '/api/master/workflow?scope=AB'=ab，而 scope=LINES=null；不能宣稱該相依已整合。此工作沒有操作其他工作樹。

可交付內容已具體固定在本地 commits，沒有 GitHub mutation。原主要整合來源 upload 仍 UNCERTAIN（缺完整結果／manifest），既有來源傳送拒絕 BLOCKED 原樣保留，未重送、拆分傳送或換路。發布／合併及真帳號重設不在這批實作結果內；帳號與權限合併仍交使用者決定。


## 第六批本機修復：帳號對話框狀態與讀回對象

依後續指示繼續處理不依賴草稿拆分的帳號 UI。本批以 54a735f 為基準；先核對 #92：目前 user-access.css 與合併提交 638615807dafc32782dc327d56b348b6e4c82902 的 blob 完全相同（a14f05b96daa06047a9df0c5201d5ecb7a5d3464），本批不改 CSS／角色版面、API、帳號／權限 policy 或 schema。

原先 blocked 的 Confirm 在 finally 恢復可按，之後按下早退而無反應。現在保存期間顯示「保存並核對中」與 aria-busy；未確認／讀回失敗／對象已變時 Confirm 保持停用，輸入仍能複製。新開對話框遇既有 unknown 也立即顯示不重送說明並停用 Confirm。原本確定的 4xx 拒絕可以恢復供使用者修正後確認，既有 disabled 控制保持；重複點擊不增加 send。唯讀核對不 POST，只有有效 ACK 對象與讀回完全相同才可顯示成功；舊身分回覆不關閉／核准舊視窗。

另一個真實來源缺口是 UI 允許輸入大寫代碼，API 會 trim/lowercase，但讀回比較找原大寫 ID；ACK 與讀回可能同為 null 而誤判成功。現依同一 canonical ID 核對，且非 delete 的 ACK 缺少對象一律不認成功，後續 null/null 唯讀核對亦不能解除。delete 的合法「對象已移除」結果保留。沒有自動重送、偽造 role/grant 或改真人資料。

持續結果只記 owner／canonical ID／password-change boolean；密碼變更明列仍需用新密碼重新登入驗證，不能當真帳號可登入的證據。原本的本人原密碼欄位保留，他人改為「重設密碼」標題；補四個既有 API code 的明確中越文，越文其他權限摘要改用逗號。其餘語言來源／二次翻譯問題仍由既有帳密候選的整合追蹤，本批不重套或轉送該候選。

- 新 dialog-feedback 測試最初 10/10 RED；修正後擴充至 14/14 PASS，涵蓋 user／role、兩語、等待／原 disabled、unknown／readback／null ACK、canonical target、唯讀恢復及舊 owner。新增實際 source API case 亦確認 padded uppercase 目標在 ACK／audit／session 失效均使用 canonical ID。
- 擴大回歸初次 255 項中 254 PASS／1 FAIL：既有 test-own-account-entry 未載入 ownPermissions，呼叫 ownAccount 時未建立 dialog；對未修改 main d4ac309 的來源在記憶體重跑同樣 FAIL。其舊「不能包含任何矩陣」斷言也不符合現有本人唯讀權限功能。夾具改載入實際 ownPermissions／matrix，核對全部 162 格 disabled、沒有恢復／其他人管理控制，保留其他人資料、本人密碼、DEMO password、viewer、epoch／identity、normalizer 與自訂角色名 negatives；不以 stub 掉權限內容取得 PASS。該修正已單獨 PASS，並加入既有帳號 CI 命令。修正後以相同 18 個檔案完整重跑：255/255 PASS、0 skipped；完整命令及終端計數見外部 evidence 的 account-dialog-final-regression.json。
- JS syntax、diff check PASS；本機完整 lint／typecheck／normal build、native dialog／鍵盤／手機／IME、遠端 Windows CI／實站仍 NOT_RUN。維持同一 worktree，沒有依賴連結、安裝／build 重試、換路或改守衛。

這批可獨立審查的 source hunk 已完成；與舊帳密候選整合時須語意合併 submit 的 canonical target／ACK／button-state hunk，保留候選 fresh prewrite、native validation、語言來源、ownership／unknown fences，禁止整份覆蓋。四項草稿／審核權政策 FAIL、真帳號登入／重設驗收、原生畫面與原先上傳狀態仍是具體未完成項。沒有 GitHub／Site mutation，也沒有把先前拒絕或 UNCERTAIN 操作重送。

最新只讀 GitHub 核對：#92 merged=true，merge 仍為 638615807dafc32782dc327d56b348b6e4c82902；main 已因 #99 合併前進至 021f0f388b16ebcdff0f64ff44039d2ea07f4165。該 commit 的 parent 為 d4ac309，12 個 changed files 中未改帳號 JS／CSS，與本批只重疊 Local safety 和首頁交接／CHANGELOG。本分支仍保留 d4ac309 為基底，沒有把最新 main、其他候選或任何資料移入。整合需保留 #99 的 CI／文件內容；#99 是新工段沿用流程類型修復，不代表獨立草稿／權限拆分已完成。


## 最新 main 相容性整合（021f0f3）

依後續指示，已將固定 main 021f0f388b16ebcdff0f64ff44039d2ea07f4165（#99，parent d4ac309）合入同一帳號候選工作樹。這是本地 feature branch 的相容性整合，不是合併 GitHub main、資料移轉或發布。未建立新 checkout，未安裝／連結依賴，未重試正常建置或既有上傳。上一節「尚未整合」是當時狀態，這節取代該狀態。

- 對 main 的 12 個 changed files 逐一核對：產品差異僅 master-stage-link；帳號 JS/CSS、登入、access policy、帳號 API、feedback API 均未由 main 修改。與帳號候選重疊的 Local safety 自動保留 #99 原目錄測試及全部帳號命令；HANDOFF／CHANGELOG 只在頂部新增紀錄衝突，已保留雙方完整段落。其餘 #99 程式、原測試及兩份專用 workflow 與固定 main 位元組一致。
- 新增來源相容性 adapter，使用已存在的 native-worker-source，在同一 checkout 讀取原封不動的三份測試文字，只替換其 TypeScript dependency loader port；原 assertions 完全未修改。執行 #99 原目錄 20 個 node:test、獨立線別 reducer 42 groups，以及 inline／records 各 13 個實際 stage-link API groups。23 個 node:test cases PASS（20 原案例 + 3 wrappers；內層群組不另加總為 node:test 數）。與前批完整 18-file suite 合跑最終 278/278 PASS、0 skipped，證據為 account-main-compat-regression.json。
- adapter 初次執行的兩個失敗是 fixture literals／Response.json 的 realm 差異，及未預載入 master-process-lock，均在測試載入層定位修正。fixture 現維持 Node 正常 realm，Worker modules 留在隔離 realm；預備來源清單取自既有固定 load calls，仍經 source fixture 的同 checkout／非 symlink／路徑／無依賴／禁止 outbound checks。沒有改 assertions、弱化型別／建置／業務守衛，亦不是 compiled Worker 驗收。
- 原三份測試仍依 main 的標準命令保留；新相容性測試另加入帳號的 Node 來源命令，不取代 lint、typecheck、normal build 或原生瀏覽器 gate。

明確未完成仍為四項需求診斷 FAIL：舊審核轉成下層送審／撤回且不得升高階、可核對的新高階權來源及其下層包含規則、return／withdraw 逐層同權。#99 的 42-group LINES reducer 仍是未接 storage／HTTP／codec／CAS 的獨立候選；不能因 unit PASS 就開始賦予真人 LINES 權限。須先由草稿工作固定 active scope manifest／資料切換，再整合矩陣、effectiveCells、API／receipt／kernel 與 before/after 權限預覽。DEMO ADMIN 管理普通帳號的規則另待業務決定。真帳號登入／重設驗收、normal build／完整 lint/typecheck、Windows/native browser／手機與實站驗收，以及被拒／不明來源傳送的核查仍是相同外部限制。


## #100 合併後相容性（固定 main 9fbba823）

Frank 合併 #100 後，本輪先只讀核對 main=9fbba823090f03da8385c8d92f5e59293d19d2f1，並只 fetch 該 main 的歷史到既有 repository；這是下載官方已合併來源，不是重送任何舊 upload／被拒傳送。接著在同一 worktree 合入固定 main，未使用其他候選工作樹。

五處內容衝突逐一處理：CHANGELOG／RUNTIME／SHARED_DRAFT 保留雙方新增政策；index 同時保留 #100 shared-client／authoring／IPQC／notice 的新版本與帳號候選的 user-access／login／return-confirm／feedback／policy／bootstrap 版本；navigation 精確期望同步兩方版本，沒有回退為舊 cache tag。兩份 CI 自動合併後保留 #100 no-poll／source-proof／foreground tests 和全部既有帳號／feedback 命令。

#100 的四個執行模組（shared-draft-client、process-authoring-v3、process-ipqc、effective-version-notice）及 browser timer inventory 程式／清單均維持與固定 main 完全相同。新 account-background-compat 回歸確認這些位元組及 inert scheduler 在反覆 schedule、cancel、focus／visibility 狀態改變時不產生 callback、timer 或 listener。此為來源／VM port 驗證，不能冒充 native browser 或整個 AST 盤點重跑。

共同相依包括 index 的精確 source inverse：原 #100 index afterHash 僅涵蓋 main 的版本號，而帳號候選另有 6 組版本號差異。保留原 beforeHash 與原 3 個背景檢查 inverse rules，追加這 6 組 account cache-only inverse，afterHash 固定合併後完整 index。其他四個 contracts 與原 proof 程式／測試完全不動。新增測試逐一核對原 rules 前綴完全一致、新差異移除版本號後相同、逆向中間值等於 main 9fb index、最後仍還原 d4ac309 原位元組，並拒絕空白／截短／舊 main 等錯誤來源；沒有改 source/history 掃描器或加入寬鬆通過條件。

擴大測試第一次 command 包含 shared-draft-restore-admission，部分實際 C API 組在動態載入舊 TypeScript harness 時報 MODULE_NOT_FOUND:typescript。這是**部分執行後的環境 BLOCKED**，不能列為完整 PASS。其原檔及 CI 保留，沒有 stub 掉 API 或修改斷言。global-background-checks／browser-timer-inventory／poll-wiring／bounded-media／canvas-manual-sync 的完整原命令同樣需 TypeScript，未在缺依賴時冒稱跑過；compiled equipment-transfer、native browser／Windows／hosted 仍 NOT_RUN。已讀知 worktree 的標準 postinstall 不適用，故不安裝／借用依賴，不恢復 symlink、不換路、不重試 SOURCE_SYMLINK_REFUSED。

本輪只做本地 feature merge、共同檔案相依與來源回歸。仍有四項原始政策診斷 FAIL，以及 inactive 草稿 scope／授權來源／return-withdraw／DEMO 業務決策；沒有因此改任何真人帳號、角色設定、資料／schema、發布或 GitHub main。先前被拒傳送與 UNCERTAIN upload 均原狀保留。
