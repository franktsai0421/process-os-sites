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

## 2026-11-16 — Draft #124 與已合併 main 的共同候選

同一審查流程在收到新的明確要求與既有上傳授權後允許一次重試；公開提交 `07ee2330876b0a87663894494a5ed309eb2f3a21` 的 tree 為 `b22873c7f5cc06815e390018b1d5179ab44faf86`，和原本機 `7e7b5202` 完全相同。原 11/15 worktree 消失後，先保全 31 檔並逐檔核對 blob SHA，再從這個公開分支恢復同一隔離路徑；不是重建或連線原工作站。

Draft #124 建立時 base 已到 `a1775a8a342d58335edf96d199a9c42844227dc6`，有四個共用檔案衝突，因而沒有 CI。僅在修復工作分支整合該已合併 main：CHANGELOG/HANDOFF 各自新增內容均保留；index 與冷啟動測試保留最新品質/AQL cache tags 及 account receipt→user-access 順序；source-proof chain 先移除本次精確整合差異，再沿原品質/頻率鏈核對。原 account-outcome、quality-root、frequency JSON manifest 均不改，新增 account-outcome-main manifest 以完整位元組逆向證明真 main；既有負例與實際 runtime 測試保留。

一般 POST 不再以 15 秒宣判 UNKNOWN；停止等候不取消後端。回執 revision 必須對應原 base 且不超過新鮮 GET，重用已 commit requestId 即使換 payload 也拒絕；過期 fresh GET 不能用 ACK cache 冒充成功。原操作 pending marker 只在有效回執／回讀後清除。這些最終讀回負例已在原候選補測，整合後將重新核對最新提交。

這不是把尚未合併的速度或品質辦公室 dirty 工作混入。最新共同候選的完整 SHA、CI、測試結果與未驗項以 PR 最新回報為準；這裡不預先宣稱通過，也不合併 PR、部署或操作任何實站帳號/資料。

前置失敗另作確定性區分：只有非密碼操作、且還沒有呼叫 D1 UPDATE 時，服務異常才回 `503 ACCOUNT_PREWRITE_UNAVAILABLE`；client 只釋放這個精確碼/狀態與既有維護/密碼服務前置拒絕，保留輸入供稍後明確確認。已發出 DB request 的失敗、lost ACK、錯誤回執及無原回執仍為 UNKNOWN。這避免 R2 準備失敗在根本未寫入時留下持久未知鎖，沒有用全體 5xx 當作失敗，也沒有清掉真正未知操作。


### 整合回歸補正（同一 Draft #124）

首個共同 head `743885bfc7af5a96185bb7aaba679c2105e1ae66` 的 CI 揭露三種整合差異，沒有將該 head 宣稱為 CI 通過：

- `status.view` 的三個舊只讀別名曾移到 legacy permission 尾端，破壞原精確順序。保留既有位置，只追加缺少的別名；未授查看仍全部移除。114 組歷史等價比較明列僅 feedback/status 的預期差異，其他 cells、欄位、順序及 malformed throws 仍精確比較。
- 原精確 runtime union 缺新增的兩個 account helper。只加入固定的兩個路徑與原不可變 manifest 雜湊；同時驗 committed/working bytes、LF/CRLF、錯誤路徑、非 Buffer 與 byte drift。沒有改成任意檔案白名單。
- shell bundle 的獨立 oracle 原固定 main50＋7；新增 receipt helper 需精確成為第58個、在 user-access 前載入。原固定 main50、順序、私有來源排除、缺漏／重複／移位、失敗不可發 receipt 的負例均保留，並覆蓋新 helper。新增 main inverse 僅對真 main 已存在的變更檔案逐一保存完整 hash/span；歷史 JSON 不變。

補正後本機已重跑：103 項 focused proof/bundle、342 項 source/joint/bundle、294 項 adoption/joint/source、71 項 quality/submission、26 項 role/outcome/transport/status 與34項速度來源檢查均通過（群組重疊，不能相加當唯一案例數）；114 組權限結果及三組原 bounded-read commands 亦通過。lint/type 已通過。完整 SHA/tree、後續 compiled 與 CI 結果以同一 PR 最新交付紀錄為準。所有檢查皆為隔離 fixture；不代表 Frank 實站或實體手機驗收。


其後 `549601f7` 的 CI：LINES 與 PROCESS review 轉為通過，compiled Begin/process lifecycle 也通過。IPQC link/PROCESS source gate 揭露 timer inventory 尚未更新；只更正 user-access 的單筆精確 closure hash/行號/用途，GET 45秒上限、POST terminal/手動停止維持，沒有加入背景排程。Windows 文件前綴為空行時，原 `subarray(1)` 只刪 CR 而不改 normalized bytes；負例改為先 normalize 再實際改內容，新增 hash 不同的斷言，原 restore throws/projectKnown 原樣保留。78 項原來源/背景/帳號來源測試、67項 CRLF 注入模擬通過；未把這個中間 CI head 宣稱全部通過。
