## 2026-10-27 401／403 自動讀取暫停（本機候選）

只對讀取遭拒的 actor／identity epoch／delivery、endpoint 與 read-kind 暫停後續自動輪詢。不是全站登出：403 可能是此模組無權限，也可能未通過身分驗證；不診斷密碼錯誤或 session 到期。保留目前 cached data、未套用表單、canvas journal、unknown receipt 與現有讀寫／ACL 判定。第一個拒絕仍拋原錯誤；單一 alert 說明暫停，附「唯讀重新核對」只發原 GET，不呼 receipt resend，不自動導頁、清儲存或延長 TTL。

shared-draft client 提供 `canPoll(kind)`，真正 timer/focus 消費端先判斷；state、inspection、review、permissions、history、receipt 互不代替，AB/C 等 scope 仍由獨立 endpoint 分開。明確同kind成功 GET 只解除讀取暫停，不直接採用資料或解除 authoring 操作鎖。request admission sequence 防止較早成功回應清掉較晚拒絕；不同 actor/epoch/delivery 或 requiresReload 不得解除。已在途請求仍會正常完成/報錯，這不是取消或壓掉所有錯誤；404、409、5xx 與所有 POST/未知處理不變。

來源覆蓋：authoring、master AB/C/PROCESS、FQC、IQC、IPQC-AB/C、equipment、BOM（state/review及必要receipt讀取）、tooling（timer/focus），以及獨立 effective notice 30s、routine-FQC 15s、IPQC references 5s。後三者透過既有 index 中更早載入的 actual shared helper；standalone test/embed 必須同樣載入它。shared-state 本來就沒有 background read poll；history/restore permission timer 原本401/403會停止，本輪不改。媒體圖片、所有手動讀取與未列出的頁面不冒稱已全驗。

`node scripts/test-scoped-read-pause.cjs`：actual shared transport、九種 production timer callback（周邊closure ports）和三個direct consumer完整script，synthetic DOM/HTTP；同kind/跨kind/跨endpoint、晚到回應、一次通知、cached IPQC保留、POST與未知紀錄不變。不是native每頁驗收，也不是403根因、真實毫秒或heap改善的證明。手動重查成功仍需要原模組正常讀取與權限流程。

## 2026-10-27 製程 C 線 IPQC 查詢結果（獨立隔離候選）

C 線「啟用 IPQC-C 查詢」現在於流程表單內讀取既有 `/api/process-ipqc?mode=choices&line=C`，只顯示核准來源的標準、適用產品、照片、檢具／檢查方式、頻率。關閉或沒有適用產品時不發查詢；沒有核准來源、沒有匹配項目、讀取失敗各有明確狀態，失敗不沿用舊結果。手動重讀只有 GET，沒有自動輪詢或資料補造。

這不是 AB 式分配：C 不建立 checkbox assignment handlers，不更動既有唯讀 assignments、後端 ACL／核准篩選或任何寫入流程；只延續原 checkbox 修改本機 draft flag，再由使用者明確 Apply／Save。查詢需同 actor、identity epoch、delivery、模態框、線別／類別／工段、產品與開關狀態；撤權或交付失效事件會清舊結果，晚到回覆不得覆蓋新範圍，模態框關閉移除請求顯示所有權。AB 原分配路徑保留。

`node scripts/test-process-ipqc-c-query.cjs` 以實際 editor renderPanel／toggle、完整 process-ipqc 加 synthetic DOM／GET port 證明查詢與晚到守衛。不是 native／真 API ACL／照片實際載入驗收；backend 與 tab9 未知結果不在本候選範圍。

## 2026-10-27 Save／Submit 重複意圖與送審 ACK（隔離候選）

只有同 actor／delivery／本機 context 已承接的 Save preflight、Submit 理由準備或實際命令，後續 Save／Submit 點擊才不另排程、不報新 unknown，也不回傳假 ACK。其他 busy 不會遮掉舊 unknown。Save 在第一次 await 前保留意圖；手動確認 canvas Sync → Save 仍是兩個不同命令，不省略同步、不自動送審。context reset／actor／delivery／route 變化後的舊 ACK 或 finally 不得採用或解除新 context busy。

Submit 的 fresh pre-inspection 與 backend mandatory validation 不變。只有回應 receipt 與 captured generation／process:platform scope／savedId，以及 control 的 pendingId／pending case savedId/status／pending version 相符，才採用待審狀態並釋放操作 busy；後續 advisory inspection 改為背景 single-flight，失敗仍可見且不能解開待審編輯鎖。這省去 ACK 後等待 advisory GET 的 UI 阻塞，不保證 POST 或 live 計算已變快。

合法六欄 receipt 但缺失／矛盾的領域投影不會宣告送審成功。先作一次 authoritative full GET；失敗保留當前文件、該意圖專用的唯讀保護，顯示「送審狀態尚未確認」及獨立「重新讀取送審狀態（唯讀）」出口。此按鈕只 GET，不能走 receipt 404 重送路徑；舊背景 poll、stale revision、晚到 actor/delivery/context 結果不能解除保護。GET 以 trusted 發送前 revision/scope/saved 與新 linked case（同 saved、原 actor、非已知舊 case）核對，不信已矛盾 ACK 的 caseId。linked case 仍待審時核其 generation 與目前 pending；已核准／發回／撤回時核合法結果，再獨立驗目前 pending/case/version/active 的一致性，容許後續合法新 generation 或再次送審。確認的是目前狀態，不是原操作收據。權限投影不足／stale／錯誤仍不猜；本機未套用表單或 dirty canvas journal 不會被此 GET 採用覆蓋，先保留原內容與 guard。此保護不跨文件持久化，重新載入不能宣稱原操作已解決。唯讀案件／歷史仍可查看；authoring 傳給歷史工具的 command 在呼叫當下也禁止 Restore，包含先前已開的預覽。

實際 shared transport／transition kernel 與 synthetic HTTP、DOM、deferred ports 驗證快速連點、實際 reason form 雙 submit、Save→Submit、晚到 ACK、正確 ACK 提早釋放、inspection 失敗、領域錯配／唯讀重查、malformed receipt unknown 保全。非 native 快速點擊、route auth、完整 concurrency matrix、live latency 或原 V12 恢復驗收。此意圖修補維持 command／idempotency／receipt／timeout 協定、手動 Sync 與 backend／Approve 必要檢查；整合版本另新增的自動 GET 暫停見上方「401／403 自動讀取暫停」，IPQC 驗證來源解析重用見下方對應章節。

## 2026-10-27 製程送審理由與報錯回饋（隔離候選）

製程 V3 的合法 Submit click 先顯示理由對話框，不再把 fresh contentIssues GET 放在開啟對話框前。這只移除前置等待，不省略送出前的 fresh inspection 或後端檢查；確認後仍檢查同 actor／delivery、generation／revision／savedId、pending、目前權限與編輯範圍。準備期間鎖住第二次點擊；取消不發 request，等待時有更新則保留理由／工作並要求重新確認。canvas persist 的本機 epoch 只作 UI fence，不寫 journal、不自動同步。

已知 unknown／損壞 recovery record 在 dialog 與 inspection 前阻擋，不能把 saved badge 當作未知命令已解。真正錯誤 code、request／operation ID 與至多前 50 項詳情放入可展開且有 alert 的「報錯」區；超過顯示上限時保留總數提示。純內容檢查失敗與操作未知分開呈現。原通用黑色按鈕改為符合當前狀態的次要操作名稱；未知時明示「查操作收據／確認重試」，仍保留原 receipt-first、404 明確確認後同 ID 重試流程，並非純讀按鈕。健康／檢查中的狀態不顯示無用途的重查按鈕。僅新承接 Save 或 Submit 等待 command ACK 的同 actor／delivery 階段視為處理中；原 unknown、不匹配身分、已失敗操作與檢查中的 unknown 不被遮蔽。finally 清顯示 marker，不清 recovery record。

不變：手動 Sync／Apply／Save／Submit 分離、固定 saved 快照、舊 working 與圖片／歷史、cas／pending／權限、transport timeout、receipt schema、重送規則、版本確認平台與所有 backend handlers。仍可明確送最後 Save，不會替使用者自動 Save 較新的 working。Submit 成功後檢查的調整見下述 rapid-intent 段；Approve/Return/Withdraw 路徑保留。本候選不是 live POST canceled 或 contentIssues exceededMemory 的根因修復；後者需獨立 backend 量測與候選。

`node scripts/test-authoring-submit-feedback.cjs` 使用實際 authoring/shared-client/transition kernel，加 synthetic HTTP/DOM，另執行實際 VersionDraftUI reason cache 與報錯 mount。含先開理由、防雙擊、取消零請求、fresh inspection、晚到範圍變更、未知 404／503 保全、不自動 Save 與固定案件內容。這不是 native layout／IME／真站點速度、正常登入 API 或原 V12 未知結果驗收。測試 prefix 只重用既有 Save fixture，不改 runtime permission 或 transport 判斷。

## 2026-10-27 IPQC 待補檢查的單次解析重用（本機候選）

`process-ipqc.ipqcIssues` 在一次同步檢查內按需解析 master／AB／C 來源各一次，
同次各工段與既有關聯沿用該已解析來源。完整項目、照片、rules、順序、缺少／失效
提醒與 malformed 錯誤不刪減；對外 `ipqcChoices` 每次仍建立 fresh 來源及輸出，
不跨請求保存、沒有 ACL cache。`validateIPQCAssignments`、workflow POST、CAS、
readState／record hydration、手動同步與核准來源選擇未改。

`test-authoring-ipqc-read-reuse.cjs` 用 exact PR34 基線與候選 actual handler 配對，
正常合成登入／Apply／Save／Submit／獨立發回；品質核准來源明標 derived synthetic，
不冒充實際品質核准生命週期。17 pairs／34 GET 保持 DTO/status/header/I/O 與零寫入，
另 10 domain 條件含 C、失效、空值及 malformed；完整 photos/rules、回傳別名與
只讀來源保留另有斷言。候選 actual Apply／Save／Submit／獨立發回另走通，
3 組拒絕 POST（過期 revision、無 Save 權限、pending Apply lock）保持零寫入；
拒絕 DTO 僅個別生成且驗形的 requestId UUID 不作位元相等。24 個關聯的 AB fixture 重解析 25→1，屬 parsed byte／
次數減少，不代表真實 Worker 記憶體峰值、毫秒等比例改善或 v25 OOM 已排除。

## 2026-10-27 authoring contentIssues 單次請求驗證重用（隔離候選）

僅 `contentIssues` GET：records 解碼器以 immutable body SHA 共用同一 request-local object；正常 Save 後 working/saved 可指向同一內容。以 WeakMap 重用該物件的純 validation 結果，不做深度內容快取，也不跨 request、actor、generation 或 revision 留存。不同物件仍逐一驗證；固定案件 issues、working/saved/review 的 id／checked／fixed 與錯誤格式保留，wrapper map 不修改原 issues。

所有 readState、aggregate/body integrity、身分與即時撤權、history 判斷及未知 validation code 的 fail-closed 檢查均不變。POST、Save/Submit/Sync、receipt、pending、CAS、ACL、schema 與讀取零寫入契約不變。這只減少重複 validation CPU 工作，不減 SQL/R2，也不是 first POST 未知結果的修復或 live 毫秒改善保證。

`node scripts/test-authoring-contentissues-cache.cjs` 以同一 synthetic SQLite/R2 比較 exact af7 route 與候選；CI 保留完整 Git history 供歷史 route byte 讀取。含正常 login/Apply/Save/Submit/Return、working/saved 相同與不同、legacy 未固定案件、inline、權限/登出撤權、實際 BOM422/409/body503、完整 DTO/header/I/O 與資料不變。未知非advisory code 另以明示 fault-injected validator port 證 fail-closed，不稱自然產品路徑。量測 counter 為 Node fixture，非 Workers/native 效能。

## 2026-10-27 受保護登入的手動新頁面邊界（候選）

投影頁面的帳號變更仍走既有 `setPlatformIdentity`／`clearIdentity`、quarantine、identity epoch 與 invalidation；不重設 `requiresReload`，不在舊閉包 refresh／enter。已確認且仍屬目前嘗試的登入，在身分 fence **之後**只移除 `process-platform-signed-out`。顯示保全提醒，由使用者手動 reload **目前完整網址**；絕不自動重載、重送未知命令、清除／搬移 canvas journal、tab 或 actor-owned recovery。logout 使用 optional account menu，以免同步 invalidation 移除 shell 後再 dereference。

帳號請求前，已知 open dialog／overlay、IME／drag、編輯表單與模組 busy guard 先阻止；其餘投影操作必須明確確認保全提醒。請求期間 shell inert，不清輸入。若等待時另出現 modal，保留其值但隱藏／inert，不讓下一身分使用舊控制項；不宣稱可恢復該表單。收到 2xx 但無有效身分／JSON、網路或 5xx 回應均屬未確認結果，清除舊 in-memory identity 並增加既有 epoch、保留 marker 與 recovery，手動新頁面確認；確定 4xx 不改身分。儲存 marker 失敗仍先 fence，不可把換 cookie 後的舊閉包重新啟用。

獨立 `/login` 只在目前成功嘗試移除同一 marker；unmount／較新嘗試、失敗／429／網路不得清除。既有 `loginDestination` 與 allowlist／canonical 路徑不改，因此 `/process/` 與 `/process/index.html` 的 canvas pathname namespace 相容／還原**仍未保證**。本修正不解釋早先真實「密碼錯誤」、不修改密碼驗證／cookie／ACL，也不保證使用者已自行登出／刷新前的記憶體輸入仍存在。

可移植回歸：`node scripts/test-login-reentry.cjs`、`node scripts/test-login-entry-marker.cjs`（已安裝 repo TypeScript）；測真正 source functions、transport、invalidation listener／form events，搭配隔離 DOM／合成登入與 bootstrap 回應。不是 native browser、實際 cookie persistence、IME、top-layer dialog 點擊或真資料驗收。native top-layer raced dialog 是否阻擋按鈕仍須真瀏覽器檢查；瀏覽器自身 reload 不屬自動動作。本候選須與 canvas／其他 navigation 修改由單一整合者合併語義後再跑對應檢查，不把獨立來源 PASS 當整合 PASS。

## 2026-10-27 畫布未知結果恢復候選（未發布）

畫布依然手動 Sync；Sync／Apply、手動 Save、送審及核准不是同一步。
Canvas `channel=canvas` 與主 authoring 是不同 transport。網路未知結果保留原
operation、session recovery 與本機 journal，不自動清空或換 ID 重送。

- 只有被既有 unknown 阻擋、且 operationId 不同的新命令標記 `notSent`；仍保留
  sync failure 和本機輸入。原已送命令／同 ID 預先排隊 duplicate 不得改標未送，
  duplicate 也不覆蓋原 RESULT_UNKNOWN failure。只有既有 matching-path 明確
  Cancel／成功修正流程可清除未送 failure；unknown 尚在時 Cancel 不清它。
- 主面板 Retry 查到原收據後，以剩餘 failure 決定 localFailure，不讓未送內容
  失去明確 Cancel 路徑。已驗證「保留輸入 → 查到原收據 → 明確還原／Cancel →
  載入最新模型 → 手動 Save」；不是宣稱保留舊表單直接 Apply 必定成功，舊 guard
  仍可能正常 CAS 拒絕，需要重新核對，不能自動 rebase／overwrite。
- 命令 ACK／收據須有既有 DraftReceipt 的六個欄位與正確 operationId，Apply
  再核原 generation（canvas 以 pending batch 傳入）。Review 可輪替 generation；
  Begin 的 control-only 回應不套收據驗證。缺欄、錯 ID／generation、403／404／503
  不假報成功；僅有效收據可清對應 unknown。晚到舊查詢只能退休其 captured ID，
  不清另一個新 unknown。有效收據後 fresh model GET 失敗仍保留 canvas journal。
- Canvas「查收據／重試」不是唯讀按鈕：既有 404 分支仍可同 ID POST；本次未改
  此規則、15s mutation／45s GET deadline、伺服器權限／待審／CAS／歷史／資料格式。

隔離回歸跑完整 production JS + synthetic ports，authoring 另用真 transition kernel；
不是 native browser、真站台 timing、API 權限或完整 modal DOM 驗收。原始 v23
可重現 recovery bookkeeping／無效收據誤確認缺陷，但沒有 live HTTP／收據證據可
斷言使用者第一次 unknown 的原因。Server 收據 GET 仍有完整 body hydration 成本，
metadata-only 讀取、登入與效能候選不納入本次。新三個測試已加入既有安全 CI；
本機未安裝依賴／未跑 typed lint、完整 build 或遠端 CI，發布需另核來源及授權。

## 2026-10-25 Sites 圖片讀取候選（未發布）

`canonical-assets` 僅新增接受正式 `imageUrl()` 產生的精確 `#asset-<source SHA>`
片段；錯誤片段、其他版本與文字子字串仍拒絕。與 `state-media` 共用 request-local
可見引用掃描：先驗證 aggregate SHA，再依既有 `publicState`／角色規則移除不可見
內容，僅 hydration 一個可讀 aggregate，找到引用即停止。保留 caller 的已去秘密身分
欄位、legacy editor／adoption 邊界，以及混合 inline／immutable master 的舊 equality
路徑；不擴權、不改全域 active-only 政策。兩條圖片路由回傳前重驗 actor／revision，
拒絕或例外會取消未交付 body。無跨 request／actor 快取。

`effective-versions` 先認證，再只讀 SHA-verified control metadata；保留 master 首個
approved、legacy 同 category/line 最後 approved 與各 scope active ID 的既有順序。
讀後重驗身分及 revision。投影被標記 partial，不能當寫入 baseline；無 schema、
資料、帳號、R2 物件或 ACL 修改。legacy inline/chunks/monolith 仍有原本全解碼成本。
隔離測試／編譯與真站台驗收是不同證據；候選不代表 live 延遲或記憶體已修復。

## 2026-10-17 離線完整快照更新與儲存入口

`scripts/dev-package-update.mjs` 提供 register／plan／apply／status／recover 及隔離 TEST install-test。管理者核對的固定輸入與雜湊限制目標、來源、相容版本及發布包；不是 Canonical 同步或帳號管理入口。`local-update-guard` 拒絕未完成交易，`local-storage-lease` 讓已啟用目標的正常 SDK／SQLite／server 入口在實際關閉前持有互斥；`local-storage-sqlite` 保留未提供 options 的原生建構語意。未知建構或關閉結果留 HOLD，不從 catch 推定資源安全。舊未啟用目標不建立新互斥檔，但仍檢查未知交易。

`local-data`、初始化／server、備份／還原／排程及 feature-upgrade 依此共同契約；未支援的直接 Wrangler／歷史診斷入口不等於受到 OS 強制隔離。交易的 .u1s 與 .process-update 不允許當一般專案根，也不進備份／Git／交付程式。完整容量更新、SDK 暫存關閉搬移及中斷恢復仍依實際收據驗收；不得從原生小型 SQLite 回歸外推。操作與保全見[更新說明](../../docs/local-integration/OFFLINE_SNAPSHOT_UPDATE.md)，資料模型見[本機操作紀錄](../DATA_MODEL.md)。

## 2026-10-16 入口、正常平台登入與品質編輯路由

i18n 顯示修正限 DEMO 關閉提示、播放完整句／計數與正式工段 code/name 完整 label；保留代碼、中文、計數及空白，不改主資料。21個工段的42個 option/header label採完整比對，避免 substring 搶先消耗較長線別／工段文字。早期 B選項尾字及 C標題混語 FAIL 保留原收據；修後真 GUI 與 synthetic 範圍依[整合進度](../../docs/local-integration/20261014-github-upload.md)區分。

styles.css 僅調整非全螢幕空播放頁卡片／文字／標題及 LIVE 對比；真 Chrome 深綠 rgb(40,114,50) 對原紙色背景為5.30:1，原1.44:1 FAIL保留，全螢幕不由此接受。DEMO入口關閉、後端正常／demo身分、角色及CAS規則不變；H6正常 Chrome 表單登入既有 frank 的證據可依差異沿用，H9 retained session 不是另一次登入。dual-system.js 在原 canView(editor) 通過時保留品質側合法初始 editor 路由；H8真 reload／新分頁停在editor，sidebar／go／popstate／login及其他 quality views權限不改。PROCESS重繪的 binding保全契約集中於[主資料](MASTER_DATA.md)，最新來源、站台生命週期與驗收限制集中於[整合進度](../../docs/local-integration/20261014-github-upload.md)。 EQ／FQC的語言來源改為當前分頁document已知zh／zh-*／vi優先，僅unknown才fallback共享storage；不改global i18n或寫storage。H11 已真雙分頁以相反語言及正常搜尋重繪確認當頁語言保留；此限域PASS不代表所有輸入／IME、全站雙語或實體裝置接受。共用唯讀快照使用i18n-skip以保留原始使用者文字，與UI局部翻譯分開。 shared-state GET 過期判斷僅追加 user.sessionType===platform 的既有已驗證正常session通道；sessionType先經HMAC、有效期、撤銷、帳號啟用／刪除、authEpoch及stored-DEMO區分，不採偽造header。匿名、DEMO關閉、普通OAI或credential-header-only通道仍依原期限拒絕，原ADMIN保留。POST、角色、CAS、scheduledBackup與privacy projection不改；18項真handler／HMAC記憶體及TypeScript通過後，H14另有正常STAFF／RD各一次既有憑證表單登入與dashboard投影的窄原生接受；不同人流程、暫態查看入口與後續修正狀態集中於[整合進度](../../docs/local-integration/20261014-github-upload.md)，不擴成全角色/API接受。

## 2026-10-15 最低 Node 的明確升級備份

`local-feature-upgrade.mjs` 透過 node:sqlite namespace 判斷 backup 能力。Node22.13缺API時在交易開始前用轉義目的地的 VACUUM INTO；Node24保留原生backup，其失敗直接拋出，不換路徑。兩者驗全部表值、明確ID、schema/index與integrity；邏輯snapshot不保證隱含rowid或page/byte相同。DDL中途失敗回滾；COMMIT後flags發布失敗會停止、保留舊flags與備份，可明確新備份路徑重試，不能宣稱跨DB／檔案整體原子性。無schema或正式資料migration變更。[驗收範圍](../../docs/local-integration/20261014-github-upload.md)。

## 2026-10-15 本機候選契約與工具範圍

Spinner恢復原React.ComponentProps<svg>及单Loader2Icon，defaults後props spread、ref／tabIndex／focusable及focus／key／pointer callback/currentTarget原樣留SVG。曾試驗OUTPUT wrapper／statusProps與強制SVGhidden／focusable均撤回，不為lint改公開API。exactbytes＋7element／SSR定向及typecheckPASS；nativeDOM未宣稱。

112組standalone試驗只留8組有actualpositive，104非必要未驗core已在outside備份後恢復原CJS；冷入口截停不是normalworkflowPASS。test-local-backup兩版本以正式API、syntheticSQLite及System32tar完成加密backup／restore／rollback，外部PROCESS_BACKUP_PATH清除、TMP／FS／SQL／tar／delete限ownedrunner，無MainSQL。CJS UI factory與guard/browser fixedbuiltin sidecars維持同步契約；複製完整scripts必含必要adjacentcores／sidecars，未保證未知外部單檔copy。

三dynamicdelegate仍保留captured method與每次apply/call lookup；bound adapter反例表示提早捕捉並非strict等價，未套用。合法CJS／beforeunload／原SVG status lint警告誠實保留，規則未降。完整V5payload/importer/productionAPI不變，保留之前真cold/normalHTTP與history保全的來源證據；最新binding以[整合紀錄](../../docs/local-integration/20261014-github-upload.md)／忽略pointer為準。

## 2026-10-13 受保護工作區啟動

備份網站遍歷現在同時排除 `.env*` 與 `.dev.vars*`，含子目錄；不變更私有D1/R2內容、AES-GCM或既有還原流程。新實際加密archive定向測試核程式／圖片／D1／R2 metadata及blob保留，密钥／設定另存與全量範圍見[備份規則](../../BACKUP_AND_RESTORE.zh-TW.md)。獨立11項合成完整還原是在修正前5c94來源；本次8b84僅補設定排除及共用walker相容，不冒充重跑完整套件。

Windows停機檢查核建立時間、預期entry／root、所有Local Node與workerd父鏈；另一Local實例還必須核其runtime PID／creation、root/config/state、source/config hash與local bindings。相對entry只從本工作區與本module來源的既有isolation声明發現唯一有效runtime；未知、缺metadata、重複匹配仍拒絕。future local-dev marker附root/entry，現有marker不改；非Windows保留保守PID規則。20個合成邊界與真正Main stop gate PASS；完整私有資料保全的執行被自動審查拒絕，沒有开始Main copy／restore。

實際已授權3035舊checkpoint還原找到268字元SQLite staging path ERR14，目標啟用前停止；同一檔以Windows namespaced path可讀。`local-revocation-recovery.mjs`四個SQLite constructor用`path.toNamespacedPath`，保留原manifest/path、feature/schema與新logout閘門。338字元合成實際還原、受影響signed-session既有檢查與1.625GB真Miniflare形式舊fixture還原PASS；後者是rev27/6合成帳號，不是Main最新或全部產品UI驗收。

`version-workflow.js` 在 ProcessSync protected 工作區不執行legacy範例seed、dispatch預設或persist。未保護工作區仍保留有效範例行為；空A-CUT或無樣例產品時安全略過並還原原category/line，避免startup TypeError留下錯誤選擇。隔離VM及3036真正C01/C02冷載窗口無新錯誤的限定採證，與未測範圍見[驗收紀錄](../../docs/local-integration/20261010-permissions-admin.md)。不建立業務資料來掩蓋啟動錯誤，不改登入撤銷規則。

## 2026-10-09 隔離登入撤銷與讀取修正

`session-revocation.ts`新增opt-in持久token digest撤銷；啟用前明確migration，公開request不建schema，讀寫失敗拒絕。3020僅自身private runtime使用持久secret與獨立SQLite ledger；日常3000未啟用。逐session API及副本恢復PASS，真正restart-replay協調逾時FAIL保留，最新PID8500 HTTP可用，不代表全部驗收通過。[完整範圍與恢復](../../docs/ipqc-reference/20261009-session-revocation.md)。

inline legacy readState避免同request第二次JSON解析，R2/chunks/records保護不變。隔離完整checkpoint在落磁碟成功後快取完整Buffer，每GET查DBrevision，原queue及checkpoint成功回應閘門保留；完整開啟負載尚未達標或重驗，不由helper時間冒充UI。[安全收尾](../../docs/web-feedback/20261009-integration.md)。

# 執行、權限與備份現況

狀態：Current source notes；整理自本 checkout 既有現況文件。2026-10-05只定向核對來源，不重跑功能測試；歷史數量／版本與PASS僅屬原日期證據。確認需求見[現行規格](../../docs/specs/current/README.md)。

## Runtime and Architecture

- 2026-10-05整合：legacy共用同步收到revision衝突時，重新讀取並逐key比對，僅對未改變的本次寫入key重試一次；同時記錄其他已變動key，阻擋後續或已排隊的舊畫面寫入。保留帳號專屬未同步保全及切換帳號防護。儲存失敗依衝突／權限／連線提供中越提示，1366／390不溢出；V3手動Save、固定案件與權限規則不變。

- Git workflow, hook limitations and review authority: [AGENTS](../../AGENTS.md) and [employee workflow](../../EMPLOYEE_WORKFLOW.zh-TW.md).

- The formal Git working copy is the repository root. The older site source is a readonly recovery copy. Tracked files contain no workstation-specific absolute paths. Browser regressions resolve optional installed tooling through `PLAYWRIGHT_MODULE`/`CHROME_PATH`; missing dependencies fail without downloading. Host backups default to ignored `.local-backups` under the repository, with `PROCESS_BACKUP_PATH` for an explicit local override. `test:portable` verifies these defaults without performing a real backup.

- Vinext `1.0.0-beta.5`, React 19, TypeScript, Vite, and Cloudflare Workers-compatible server routes.
- `app/page.tsx` redirects `/` to the client application at `/process/index.html`.
- The primary UI is an existing JavaScript SPA under `public/process`; React currently supplies the host shell rather than the process screens.
- Hosted persistence uses Cloudflare D1/SQLite through the logical binding `DB` and private R2 snapshot storage through `STATE_ARCHIVE`.
- Canonical images: 205 real metadata-stripped WebP images (~7.92 MiB) are versioned under data/canonical/assets/web. Local bootstrap/export/sync retain existing immutable-image and backup safeguards; /api/canonical-assets remains loopback-only with PROCESS_LOCAL_IMAGES=true. Complete hosted releases import these same bytes into target STATE_ARCHIVE and package generated static WebP plus Canonical-derived legacy image aliases, without changing the Local-only API. Originals/videos/private uploads remain private.
- Canonical collaboration uses domain files under `data/canonical/`, stable IDs/hashes, Local export and conflict-aware three-way sync with verified backups/rollback. Task commands guide local branches and review without automatic network/Git upload. Quality records are CLI collaboration data; no new quality UI has been added. See [Local collaboration](../LOCAL_DATA_COLLABORATION.md).
- `scripts/import-local-bom.mjs apply <reviewed-plan.json>` coordinates Local BOM updates with the dev server stopped, a work branch, revision checks, transactional D1 batch, staged Canonical files and verified physical/project-file backups. `rollback <backup-folder>` restores the backed-up version. It tests restoration/reapplication, checks the reviewed duplicate's preorder position and updates the sync base. Actual-BOM browser acceptance uses isolated SQLite/R2 fixtures without changing real Local draft selections. Backup inspection uses disposable copies to preserve SQLite backup indexes.
- `npm run dev` first verifies Local-only mode and the existing Drizzle migrations, then bootstraps only an empty Local schema from Canonical with passwordless demo users. Installed Miniflare uses its supported built-in Request.cf fixture, telemetry is disabled and Node outbound guard allows only loopback. It rejects remote/Production overrides and refuses incomplete existing schemas, missing demo setup or ID conflicts without overwriting existing business data. Vite and the initializer share `.wrangler/state`; remote bindings are disabled. Windows host backup support remains separate.
- `.openai/hosting.json` binds the existing Sites project and D1 database. A saved source version is not necessarily the currently deployed public version. Sites uses a separate D1 from the fixed Workers release targets, so a public-demo Sites release must independently verify or safely append the three passwordless demo identities and pass `test:sites-demo`; a code-only publish does not seed them.
- Release/target/backup/synchronization policy is maintained only in [DEPLOYMENT](../../DEPLOYMENT.md); full-data and explicitly data-preserving maintenance paths differ.
- Historical Staging Paid-CPU acceptance is retained in the archived context/changelog; no current remote inspection was performed during documentation cleanup.


## Authentication / Permissions

- Backend write authorization is enforced in `app/api/shared-state/route.ts`; frontend hiding alone is not the security boundary.
- `/api/user-access` provides the current guarded account/role/password operations with protected backups and revision CAS; `/api/users` returns 410. Primary/peer/self/DEMO restrictions and public privacy projections apply. Generic shared-state account/role mutations are rejected. See [permissions](../../docs/specs/current/PERMISSIONS_ADMIN.md).
- Permission families include approval actions, status visibility/media, master delete/import/export, and view access.
- The shared-state API allows only an explicit key allowlist and uses optimistic `revision` checks. Same-origin checks protect writes.
- Startup uses asynchronous shared-state loading and parallel script preloads, executing the existing scripts in order after the snapshot arrives. Large embedded raster images and videos are delivered separately through immutable R2 copies and the permission-checked `/api/state-media` route, including byte-range playback. Writes resolve those delivery URLs back to the original data URIs and return SHA-256 receipts; neither the stored snapshot format nor original image/video bytes change. Original R2 snapshots remain intact. The generic shared-state client has no polling or automatic conflict overwrite; IPQC-C V3 has dedicated revision polling.
- Shared business JSON and new uploaded photos are held in memory and sent to the protected revision-checked API; large snapshots use private R2 with D1 references. Device preferences remain in `localStorage`. Existing browser process drafts are retained on load: a valid draft missing from the backend is staged after authentication, while a conflicting draft can be explicitly recovered from the editor. A legacy cache is cleared only after the returned complete stage content matches it and no later update is queued; changed or invalid old caches remain preserved. Save waits for all queued writes, including changes made during a write, and cannot report success before the server accepts them. A temporary failure retains the in-page data and best-effort session recovery, pauses background writes, and can be retried by pressing Save; 401/403/409 remain blocked for login/conflict handling. The generic client has no polling or automatic failure retry; IPQC-C V3 reads revision tokens and looks up uncertain operation receipts.
- Reopening a draft keeps a saved workspace at least as recent as its draft-version snapshot, including operation Apply and coordinate changes; approved/pending versions retain their existing locks. Initial shared-data failure refuses writes and displays a reloadable error state. Rendering errors also display an error state instead of an empty content area. Raster files that cannot be decoded are rejected rather than retained as broken photos; valid images can still fall back to their original bytes if compression fails.
- Legacy BORUAXE demo-photo defaults reuse matching media from approved versions of the same route before falling back to legacy static paths; existing operation photos are preserved. Image acceptance must verify decoded pixels and actual response content, because a successfully loaded placeholder is not proof that the image exists. The separately merged canonical-image baseline is required for Fresh Clone real-image availability.
- Master active-data changes require approval permission. Deleting master records or process templates requires `master.delete` and is blocked while review cases are pending.
- Operational backup APIs and host controls retain ADMIN authorization but are not ordinary daily-user navigation. Backup restore blocks effective pending cases across all adopted workflows before creating a safety backup or changing state. Restore/delete operations require secondary confirmation; host restore also re-verifies the ADMIN password.
- Documentation must never include real passwords or backup encryption keys.


## Backup / Restore

- **Cloud snapshot**: D1 `state_backups` stores preserved shared-state snapshots, capped at the latest 100. V3 removes Backup & Restore from daily-user navigation, including ordinary admin navigation; authorized operational preservation APIs remain. Commit is not a database or media backup.
- **Host ZIP**: default path `.local-backups` on Windows, configurable through controlled host tooling or `PROCESS_BACKUP_PATH`; daily-user backup navigation is removed. The asynchronous native picker reports errors/cancellation, but Windows execution timed out without an observable dialog in this run; actual selection/cancel remains unverified. Validated manual server-path entry remains available. The backend creates safe missing directories, checks write access/free space, and rejects roots, sensitive system paths, and traversal. Archives retain the manifest and AES-256-GCM encrypted payload safeguards.
- Automatic backup is disabled by default. When enabled, the schedule is Saturday 12:00 in `Asia/Ho_Chi_Minh`, with persistent weekly de-duplication and missed-run catch-up whenever an allowed site state read occurs; the backup screen does not need to remain open.
- Restore validates archive structure, hashes, version compatibility, path safety, and unpacked-size limits; it creates a safety backup and uses maintenance mode/rollback protections.
- Windows task/startup registration is an external host setup step, not guaranteed merely by deploying the Site.


## Current Important Limitations

- Most business records are stored as serialized JSON inside one `shared_state` row rather than normalized tables. Legacy large writes replace the aggregate. Explicitly adopted records-v1 writes changed immutable bodies and metadata before the existing revision CAS; normal writes do not reconstruct closed historical JSON. D1 still holds a singleton pointer map.
- Platform authentication supports scrypt passwordHash and existing legacy credentials; public responses strip both. Explicit migration/recovery is separate from login and has not been applied to the real 14 accounts in this task. Role sessions refresh only for actual effective-right changes; real revocation/password changes retain fresh identity checks. The optional session ledger stores only digests/expiry and follows its explicit target/runtime enablement, independently of authEpoch.
- Product/BOM/routing seed datasets are large browser-loaded JavaScript assets. Approved master data and overrides update the runtime catalog, but there is no normalized server-side product/BOM schema.
- `STATE_ARCHIVE` R2 stores immutable SHA-256-checked JSON snapshots above 512 KiB; D1 keeps their reference, revision and local-backup account metadata. Small and legacy inline records remain readable. Media remains in the same business JSON or static assets, but shared business data no longer consumes `localStorage`; new uploads are still bounded by client-side processing and Worker request/runtime limits. R2 objects are private and retained for recovery, not automatically garbage-collected.
- Demo identities are `demo-admin`, `demo-rd`, `demo-staff`, with `authMode: "demo"`. HMAC-signed HttpOnly/SameSite cookies have `sessionType: "demo"` and an eight-hour expiry; hosted HTTPS uses Secure. Every protected request checks the current flag and live account status. Local signing keys are randomly generated under ignored `.wrangler/local-only`; formal authentication is unchanged.
- `/api/release-state` is a maintenance-only snapshot export/import endpoint, guarded by a separate temporary secret (or local management URL), never by public demo ADMIN. Replacement requires an exact revision and confirmation, preserves the old state, then creates the new-state backup transactionally. Remove the hosted maintenance secret after release. The local recovery page preserves browser work before source-of-truth replacement.
- Code/schema establish implementation only. Latest confirmed requirements are routed separately; conflicts stay documented.


## Conditional workflow reads (2026-10-12)

BOM and process-authoring opt into a client token paired with an owned full model and its shared-state revision. Unchanged polls and permission-only queries hydrate fresh auth keys before returning; changed/full/history requests retain domain hydration and integrity checks. Metadata-only replies cannot advance the paired model token. Other adapters retain their default read behavior. Measurements and first-read/browser limitations are in [the current receipt](../../docs/local-integration/20261010-permissions-admin.md).

## Mobile Behavior

- The sidebar becomes an off-canvas menu below 720 px; major grids collapse to one column and dialogs constrain themselves to viewport height/width.
- The process inspector is a wide modal on desktop and near full screen on phones. User rows become readable cards, editor actions remain reachable, and status/dispatch layouts stack.
- Wide tables and process canvases use contained scrolling rather than forcing the entire page wider.
- Traditional Chinese and Vietnamese have dedicated responsive adjustments.
- The application language selector supports Traditional Chinese and Vietnamese only; English application mode is not implemented. Draft-save, legacy-recovery and load-error notices have complete Vietnamese translations.
- Known limitation: the graph canvas is still materially easier to use on a tablet or desktop. Every editor change still requires a mobile overflow and action-access check.


## QC

- QC is implemented as operation-level standards/IPQC content, approval validation, and status/player presentation.
- Legacy validators detected missing steps/standards/BOM/connections. Adopted process:platform reports approved business-content codes as advisories; permissions, locks, no-change restrictions, integrity and applicable BOM ownership interlocks remain. Quality validation is separate. See [confirmed process rules](../../docs/specs/current/PROCESS_WORKFLOW.md).
- The Quality Management shell and its placeholder pages are implemented, but there is still no standalone QC entity, inspection-result transaction table, or statistical quality module. Existing operation-level standards/IPQC and Canonical quality collaboration data are unchanged and are not represented as new UI records.
## Sites client import readiness

public/process/shared-state.js exposes importPending only for the exact 503 JSON
IMPORT_TARGET_NOT_ACTIVE response. bootstrap.js waits for that response before
preloading private scripts; pending imports show bilingual static navigation,
without claiming a verified identity. Other failures remain failures. No API,
image, session, draft/recovery, schema or platform gate is relaxed. The separate
recipe uploader is transport-neutral; see
[import readiness](../../docs/sites/IMPORT_READINESS.md).

The optional bounded-attempt import mode retains unknown quota, exact test-site
pins and existing owner/admin/session/export/origin checks. Its persistent
singleton and request ledger debit writes before execution and retain failed or
uncertain reservations; only one writer may enter across requests. Previous
verified-capacity behavior remains. A stopped/unresolved bounded campaign also
keeps active-marker visibility closed. No automatic cleanup, account reset or
paid upgrade is provided. See the same import-readiness contract for limits.

## 2026-10-25 FQC readiness candidate (not published)

The scoped candidate retains the existing sequential FQC workflow → approved AB
catalog → equipment data-read order. The dominant equipment read is narrowed
server-side; there is no new client permission round-trip or all-module revision
equality barrier. Unrelated concurrent state revisions remain usable. Adoption
and background event/poll paths are fenced by actor id, identity generation,
mount/host and reload invalidation. Normal same-actor refreshes may replace the
identity object without invalidating that generation. A workspace renders once
its required reads complete; polling begins afterwards. Failed/current-actor-
mismatched equipment reads cannot reuse cached choices. IQC's data-then-
permission ordering and document navigation remain unchanged. This is data
loading correctness, not a new page-admission permission rule.

`GET /api/routine-equipment?catalog=effective` retains the existing route's view
policy but selects only active approved catalog fields before immutable body
hydration. It uses one pinned state snapshot, preserving the full GET data-rights semantics.
Session identity is checked before business reads and after hydration for token
expiry/revocation, without a second global state read or unrelated-write retry. Legacy inline/chunk/R2 fallbacks and
legal empty catalogs remain supported; malformed active pointers fail closed.
The full GET and POST paths, business schema, stored records and ACLs are unchanged.

Isolated actual-handler fixtures cover payload parity, integrity, session revocation and baseline-compatible concurrent
revision behavior; VM tests cover concurrent load, current-generation adoption and
failed/stale responses. Synthetic fewer reads/bytes are not live latency evidence.
This does not remove full-page transitions: all major destinations need one
reviewed lifecycle/projection handoff design, including module-specific dirty
guards and side-effecting routine-report refresh. Source, build and live acceptance
remain distinct; see task evidence for exact candidate results.


## Authoring Save acknowledgement and scoped advisory inspection (2026-10-27)

Only a confirmed Save command response plus adopted current model ends the Save
operation's busy phase. Content-issue inspection then runs separately with an
explicit Chinese/Vietnamese “verification in progress / not completed” status.
The saved snapshot remains visibly saved; a failed advisory read does not undo
that acknowledgement or pretend validation passed. Submit stays disabled until
an inspection matches the current actor/delivery, adopted model, generation,
revision, saved/pending IDs and editor/review scope. Explicit Submit/Approve keep
their existing fresh inspection and server-side mandatory validation. All other
actions retain their awaited post-action inspection; no deadline is changed.

Same-scope background polls share an in-flight inspection rather than sending
repeated GETs. A newer model/revision or actor/delivery/route/reset cannot adopt
an older result. A current failure leaves pending state and exposes a manual
retry; unchanged polling does not silently retry forever. New local edits remain
unsaved and guarded, never overwritten by advisory responses. This is no global
cache, no mutation cancellation and no bypass of pending/CAS or manual Sync.

The transport deliberately retains an operation before POST. During one newly
admitted Save only (no prior unknown or sync failure), a client/actor/delivery-
bound pending-command marker prevents this precautionary record from being
painted as a settled failure. Existing load/local failures still take priority.
The marker ends in command finally, is invalidated on reset/actor change, and
never clears the real recovery record. A timed-out/settled unknown, previous
unknown or blocked second operation remains failed and quarantined. Inspection
busy alone cannot suppress unknown state. Navigation guards are unchanged.

The focused runner uses the actual controller, transport, diff and transition
kernel with deferred synthetic HTTP/timers and a DOM mount port. Original
three-GET duplication, Save-after-ACK waiting and in-flight false-failure
counterexamples are retained. Fewer fixture requests are not live performance
claims; native UI/layout, complete ACL/lifecycle and real-user recovery remain
separate acceptance gates.

Canvas journal persistence optionally notifies a badge-only authoring callback.
It checks current actor/delivery and connected editor root, then updates only
the existing save-state text; it never invokes panel/render, sends a request or
changes the journal. Reverting positions can show saved only if the existing
server working content still equals its acknowledged saved snapshot. The
synthetic actual edit→persist→update chain is covered; native drag/layout remains
unrun. Legacy metadata paragraphs are not independently repainted by this hook.

Save also checks busy before entering the existing canvas pre-save confirmation/
Sync path. The later post-loading guard remains. Repeated public Save calls
cannot initiate an extra canvas Apply while the first Save awaits its response;
new local canvas entries stay retained for a later explicit Sync/Save. This is
public-controller admission coverage, not native rapid-double-click acceptance.
Approve's fresh-inspection source path is retained; no new complete Approve
lifecycle is claimed by the focused UI runner.


## 2026-10-27 Authoring mutation deadline candidate (not published)

Only the existing relative `/api/process-authoring/workflow` endpoint (including
its normal query and canvas channel) uses a 45-second mutation deadline. Other
module mutations, absolute URLs and lookalike paths retain 15 seconds; all GETs
retain 45 seconds. This is longer response tolerance, not faster performance or
a commit guarantee. A timed-out mutation may already have committed.

Operation IDs, saved unknown bytes, serial queue, receipt-first recovery, receipt
shape/generation checks and actor/terminal fences are unchanged. No automatic
POST retry is added; the existing canvas receipt404 retry behavior is unchanged.
No backend, permission, CAS, manual canvas Sync or Save meaning changes.
Fake-clock delayed ACK/abort/recovery tests and the coupled cache tag are in the
existing CI test files. Native latency, storage cost and runtime build remain
separate acceptance; this local candidate is not a release.
