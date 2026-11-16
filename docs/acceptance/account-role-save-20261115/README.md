# 角色與人員保存修復候選

2026-11-15，Dot Linux/Node 24.22.1。基底為當次 fetch 核實的 main `c6ac41a6a996ac88e1b68370b371aed400773e34`；獨立 `fix/role-user-permissions-20261115` worktree，第一個程式候選 `cc8ee87ef1e25edc3a65a3befe4efe41c898c3d9`，後續同分支補充 UI actor 隔離及 fixture。最終 commit/PR/CI 以 GitHub 分支與交付訊息核對。本紀錄只證明列出的隔離條件。

## 根因與修正

1. 一般角色／帳號 POST 使用 full `readState`，讀取並重編碼不相關業務 records。固定 main 隔離注入「publishedProcess 讀取失敗」，update-user/update-role/create-role 均回 500、revision=1、零寫入；不能由畫面未知結果斷言實站有無寫入。新增 account-only overlay：只讀四個帳號相關 aggregate、maintenance 和 LINES 能力投影，保留其他 refs/allocations/legacySources/歷史；原通用 partial-state writer 仍拒絕寫入。handle 與原 snapshot 綁定、一次消耗，核對 append-only audit、單一帳號／角色、credential 不變、角色變動的有效 authEpoch。原 route 的 fresh identity、依賴、授權 ceiling、protected target、前置 revision 與最終 D1 CAS 不變。
2. 一般 POST 的 15 秒 abort 會把仍在執行的操作變成 UNKNOWN。現在等候 terminal response 或明確「停止等候」；GET 仍有 45 秒上限。停止不是伺服器取消，已送結果仍 UNKNOWN；finally 恢復關閉／取消及原 disabled 狀態，不會自動重送。
3. 以前 UNKNOWN 的 GET 無法辨識原操作。非密碼操作新增隨機 requestId，和同一 CAS 的既有 processAccessControl.audit 一起儲存；GET 以最新 session 只查原 actor/requestId。回執包含 action、target、commit revision、目前 raw target 是否仍等於原 after。沒有回執不等於失敗；後續 target 改變也不冒充原值驗證。每個操作保留獨立本機 metadata marker，不含表單、密碼或 hash，跨分頁不覆蓋；ACK 後仍保留到 fresh readback，重新載入可只讀查證。密碼仍保留原專用 overlay、原密碼與 fresh-login 驗證，不新增密碼回執。
4. target 比對改採 JSON 語意排序，避免 key 順序造成假衝突；真正 target/actor/權限變動仍阻擋，整組選擇不送 POST，須再次保存。
5. 自訂角色只授 `status.view` 時缺少舊 status 明細／媒體別名。現在由同一查看格導出全部線別、明細、照片、影片的舊只讀別名；未授查看時全部移除。無新 catalog key，無其他業務 grant。

兩張私人診斷圖片已依 Library 指定 consumer-local 路徑 materialize、驗證可讀並實際查看；只用於診斷，未納入 repo、PR 或公開證據。未操作 Frank/Diem 實帳、Site、正式資料、schema、migration 或被禁止的原工作站連接器。

## 量測

同機、同 Node、相同 80 個額外合成 immutable aggregate，各 16 KiB，R2 get 注入每次 10ms，三輪/操作。非真實業務量，不代表實站速度。完整樣本：[main](benchmark-main.json)、[候選](benchmark-candidate.json)。

| 動作 | main 中位數 ms | 候選中位數 ms | R2 reads main→候選 | 不相關業務 reads |
| --- | ---: | ---: | ---: | ---: |
| update-user | 951.5 | 66.6 | 88→5 | 81→0 |
| update-role | 964.6 | 87.0 | 88→5 | 81→0 |
| create-role | 1094.4 | 70.2 | 88→5 | 81→0 |

一般修改的 puts 由 3→2；新增角色 2→2。未調弱 CAS、auth、依賴、內容驗證或測試門檻。

## 驗證與界線

- PASS：新 API 14 案例，inline/records/chunks/monolith 角色新增→指派→個人例外→null 恢復→角色撤權→刪除；跨帳號舊 session、並發/重複 ID、R2/DB/ACK 故障、零寫入 GET、corrupt SHA、單次 handle、partial writer 負例。
- PASS：實際 client＋實際 API 新回執傳輸案例（包含 fresh realm/reload、錯誤回執、停止等候、target 後改、無回執保持 UNKNOWN、metadata 不含憑證、跨 actor/tab 隔離）；固定 main 原 15 秒定時中止有明確測試，新 POST 無自動 abort，讀取仍限時。
- PASS：原帳號 CRUD/權限/密碼 API、dialog、整組衝突、結果通知、session/revision fence、初次讀取、角色 effective-session、preview/final approval 及來源證明；具體計數以提交後實際執行摘要與 CI 為準。初輪 fixture 缺 AbortController 和舊簽名擷取已修正，原斷言未移除；錯誤啟動未列產品 PASS。
- PASS：權限盤點 [permission-audit.json](permission-audit.json)，164 次合成設定保存、648 次 UI/API/effective cells、24 個 destination、111 組 workflow metadata 無差異、11 個舊 session 撤權、36 個未採用 LINES operation 值拒絕。這不是每個頁面完整業務生命週期驗收。
- PASS：編譯 Worker 原有 16 組帳號安全場景／186 次 API 量測（cc8ee87 後端）；primary/peer/self/DEMO、自己的原密碼、他人重設、停用/重啟、角色與個人撤權、舊 session/BOM 拒絕、刪除和 generic bypass、CAS。後續僅前端/fixture 改動時該後端證據仍適用。
- PASS：locked `npm ci --ignore-scripts`、lint、TypeScript、build auth check、source-only 歷史/工作樹掃描；沒有更新 installed hook 或發布設定。worktree 的 postinstall 要求 standalone .git，故此安裝只跳過該 hook 設定副作用；沒有依賴安裝缺漏。
- BLOCKED 本機 Chromium：native fixture 成功啟動，但瀏覽器 process_singleton Unix socket 被環境 EPERM 擋住，零 UI 場景。完整新 compiled runner 已納入 Account permissions CI；CI 成功前不得宣稱桌面／390px／中越文字／停止與回執的原生 GUI PASS。
- NOT_RUN：Frank 實站/實帳、跨實體電腦、實體手機、真實 IME、真實資料效能、各頁草稿送審核准全生命週期、任何部署或 live adoption。程式測試不等於 Frank 實站驗收。

## 政策相容與待決

完整 [權限對照](PERMISSION_MAPPING.md) 依目前程式與隔離盤點，不讀實站設定。沒有改角色預設、既有帳號或啟用任何 page/review policy。`draftReviewPolicy=page-v1` 的最終核准須主要管理員明確授權和 audit 證據；舊 reviewer 不會自動得到平台最終核准。未啟用該政策的 legacy 狀態仍沿用既有模板／舊 reviewer 規則，不能聲稱所有站點已是 Frank-only；若要求實站收斂，須先核對真實 marker/authority，另決策資料轉換，不能在本次程式修復中偷偷改帳號。已生效版本不可撤回，保留 pending case/CAS/reason guards。

舊版未帶 requestId 的未知操作沒有可驗原回執，本次不能替它補造成功證據；仍須查帳號現況，密碼須 fresh login。查不到本次新原回執也仍 UNKNOWN，關閉可用、只讀入口保留、保存拒絕重送；不提供「清除未知後重送」捷徑。

## 共同檔案與整合風險

未 cherry-pick 或覆蓋品質本機 `a03ee5b3`、速度 `8f94d0f3` 或製程 AQL 工程。主要 shared files：`public/process/index.html`、`AI_CONTEXT/modules/MASTER_DATA.md`、`AI_CONTEXT/DATA_MODEL.md`、`AI_CONTEXT/CHANGELOG.md`、`HANDOFF.md`、`scripts/process-platform-adopt-source-contract.cjs`；`lib/user-access.ts` 也可能被權限/效能工作共用。逐 hunk 合併並保留各自 cache tag、exact-source inverse 與 immutable manifest，不能整份選 ours/theirs。品質/檢具 route 和 state-records/process-state 共用底層未改動。本分支不合併、不部署。
