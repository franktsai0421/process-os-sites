# 帳號與權限獨立整合（2026-11-10）

以 main `9fbba823090f03da8385c8d92f5e59293d19d2f1` 為基底，工作分支 `codex/accounts-permissions-cleanup-20261110`。從已關閉、未合併的 #102 `55d4672cb8004d0b01715714cbc91fbce6b22d2b` 逐項抽取帳號相關成果；沒有合入整包草稿架構。這是帳號優先的小範圍候選，不能表示所有模組／草稿審核權限已完成。

## 修改、風險與驗證

| 範圍 | 變更與保護 | 驗證及限制 |
| --- | --- | --- |
| 登入與既有人員排查 | 保留 exact legacy/Unicode/空白密碼；格式異常 fail closed；對匿名失敗統一回應；服務端只記固定原因碼。可重設目標的管理者才得到 credentialState，無 password/hash/salt | 實際 TS handlers + 隔離 SQLite/Map R2；不以相同角色推定密碼相同；沒有讀取或修改 phung 等真帳號，根因及實站仍未驗收 |
| 管理者重設／本人改密碼 | 管理者重設他人不要求目標原密碼；所有本人變更包含 Frank 均驗證原密碼；輸入型別與長度檢查；crypto 故障在寫入前回明確 503；維持 scrypt 參數與 authEpoch | 新密碼可登入、舊密碼／舊 session 失效，停用者重設不自動啟用；crypto 隔離故障零帳號/audit/archive 修改 |
| 人員與角色操作 | 提交前 fresh GET 比較 actor/target；保存、讀回、相符後才顯示持續成功提示；保存中鎖定控制與離頁；角色／個別權限繼承、主要／同級保護保留 | 新增／編輯／角色模板／個別權限、啟停、刪除、角色 CAS 及 caller/target session 的來源測試；授權不超過操作者 |
| 刪除代碼與歷史 | 沿用 tombstone、保留 ID 和業務引用；確認視窗明示代碼不能重建；沒有恢復／重用新功能 | 隔離 fixture：刪除隱藏清單、不允許同 ID 重建、歷史不變；沒有資料移轉或刪除歷史 |
| 操作結果、雙語及版面 | 區分未送出、已拒絕、回覆成功但未讀回、UNKNOWN；UNKNOWN 不重 POST，僅允許 GET-only 核對。中／越文跟隨目前頁語言；驗證錯誤與操作結果分開；延用 main 已合入 #92 的矩陣及手機版面 | 66 定向測試；原生畫面、真 IME、實體手機及實站兩人驗收 NOT_RUN。這次只新增驗證訊息共用版面，不聲稱原生版面全通過 |

## 舊分支盤點及保全

逐層比較 cloud 分支的真正 base/head，沒有把每條 branch 都盲合到 main。精確分支與 SHA 在 [branch inventory](account-permissions-branch-inventory-20261110.json)。

- `cloud/users-permissions-29102026`：帳號、角色及明確權限基礎；IQC/FQC/IPQC/檢具/線別/發送分支：各頁既有權限與 legacy writer 保護；review-polish：雙語；verified/layout：驗收及矩陣展開。
- 遠端 cloud 最上層 `e6abe5d96fb413f884541504e72d71a033514b6f` 的 app/lib/public/scripts/tests **1,046 個 blob** 與 main 祖先 source-only import `7f5bb72c4e81995b58b41ac61bcdffe6f62ef08d` 全部相同，差異零；因此這批程式早已保存在 main 及本分支。舊截圖與歷史文件仍保存在原 branch，不能因 Git ancestry diverged 就重合或刪掉。
- `fix/users-permissions-source-only-20261029` `4c44eca`、`fix/role-template-layout-20261106` `200dc03` 均為 main 祖先，既有成果已保留。
- `codex/login-performance-20261101` `f0532fe` 有獨有 CSS 掃描範圍、量測與測試，並未修正密碼驗證；讀取其說明及差異後留待獨立處理，不混入帳號正確性修復。
- #101 `8f1f243` 是畫布計數；#102 含大量草稿／其他模組成果。兩者保持關閉、不刪分支。
- **未刪除任何分支。** 新 PR 驗證後，逐條核對完整內容、可復原位置及當次確切刪除授權，才提出清理清單。

## 驗證收據（Linux／Node 24.22.1，隔離來源）

PASS：66 個新定向測試；既有 user-access 51 個斷言群、projection 140 人次、角色有效授權/session、搜尋取消、同身分回應 fence、initial read、login marker 11 群、reentry 24 群、JSON coercion 47 案例；各組有重疊，不相加為覆蓋率。lint 無 findings；TypeScript 非增量檢查通過。安全 build 回 exit 0，postbuild auth 檢查通過。build 的 PROCESS_PROGRAM_COMMIT 指向基底 main，驗證的是本次未提交候選工作樹，不能稱 exact-head build。

重用 #102 過去 compiled 帳密 CI 只能作相容參考，沒有用它代替本分支驗收。新增獨立帳號 CI，遠端狀態以 PR 最新 head 為準。

NOT_RUN：真人帳號、原生瀏覽器／cookie、IME、實體手機、實站兩人及端到端延遲。沿用已知原生 socket 限制，沒有重試或換路。新資料表／schema／資料包／真帳號移轉：不適用。未合併、未部署、未重開 #101/#102。

## 原 UNKNOWN 操作與本次上傳界線

原 32 檔 create_tree `5005cba09d970cec70334d6bd540db1b599858d2` 仍 UNKNOWN；原 staged patch SHA256 `279f030c238c919f9fb8585946a03f7f353436cda9e48eb98168888ba75d0912` 已只讀核對，沒有重送、拆分或換通道。

本次是從 main 抽出的帳號變更。與原 32 檔只有公共入口 `public/process/index.html` 和 CHANGELOG 路徑相交：入口僅更新三個帳號資源 tag；CHANGELOG 僅加入這份帳號紀錄。原 UNKNOWN 的產品修復、測試、workflow 與其歷史內容均不帶入；其餘原 32 檔保持 main。這不是該舊操作的補傳。

## 尚需協調

新的逐頁草稿邊界、查看／編輯／Save 權限政策、模組送審／撤回與版本平台最終核准分離，與 #102 的 page-v1 架構相依；本 PR 不啟用政策標記、不授予真帳號高階權限、不移除既有 restore 格或實作恢復。需要另立有完整相依與逐頁驗收的整合，不能宣稱本帳號 PR 已完成全站權限切換。

## Local safety CI follow-up: status regions and composed source evidence

Read the complete #103 f6081ea Local safety run 42802175203/job 129782242429. Step 9 failed at the unchanged role fixture's capturePayload assertion: fresh account prewrite GET displayed a pending message in .ua-error before POST had occurred. The corresponding step 9 on #104 e6a6472/run 42804470301/job 129789989411 passed. This identifies an account UI status/alert regression, not a reason to bypass the fresh read or relax the payload assertion.

The product now has a separate .ua-progress status/live region. Error alerts remain empty during the prewrite and pending POST, become visible for actual failures, and retain UNKNOWN/readback recovery protections. Both languages are covered with held prewrite and POST responses, zero premature writes, double-submit blocking and disabled-control restoration. The role browser test and all original UNKNOWN-32 repair paths remain unchanged except this branch's already independent account index/CHANGELOG content; no original request is retried.

Step 31 failed because the exact background source proof expected the original main index hash 41474215..., while the account-only cache layer yielded 54601dc7.... The fix follows #104's explicit source-layer composition pattern, using an account-only helper rather than importing its process count code. It retains the original background contracts and hashes, and reconstructs genuine main 9fbba823 bytes before the unchanged d4ac309 background inverse. The historical published f6081ea index blob and current status-region cache layer each have pinned raw hashes, lengths, offsets and spans. Partial/duplicate tags, wrong paths, nonraw inputs and any unrelated drift are rejected. Routine now uses this same exact layer instead of its earlier ad hoc tag replacement.

Data-model/schema/business data: unchanged. No real account, merge, deployment, original UNKNOWN retry, guard relaxation or native executor retry. Local deterministic and source checks are recorded with the follow-up commit; final remote step 9/31 outcomes must be reported separately.

## 2026-11-10 擴充需求核對與本批結果

這節取代上文「所有查看／編輯／Save 政策均未納入」的概括限制；原帳號抽取及 CI 根因證據仍保留。已完成和未完成分開驗收，不能以本次帳號 PR 宣稱整個 page-v1 遷移完成。

| Frank 新要求 | 本 PR 已納入 | 未完成／相依 |
| --- | --- | --- |
| 角色範本、詳細設定、中越文、訊息時間、桌機與手機 | 保留既有響應式矩陣、展開其他權限、角色來源／例外／依賴摘要；新增「修改包含保存」、固定回報查看、篩選不切 scope 說明。成功／失敗／UNKNOWN 均不靠短暫 toast 判定，操作結果持續保留；pending 使用獨立 status | f1ecc 的原生 role layout/payload 步驟通過，中越文 × 1440/1024/768/390/320；本批新文字仍須最新 head CI 重驗，不代表實體手機／IME 或實站驗收 |
| 逐頁 view/edit/save/submit/withdraw、前後端一致 | 27 個矩陣項目、24 個獨立目的地逐頁檢查；10 個已有原子保存的模組將既有後端 Edit→Save 結果同步至共同 resolver、帳號投影及角色／個別設定預覽。原始 Save=false 不被改寫，撤掉 Edit 後仍按原 Save 值；Save 可獨立授予，沒有自動補 view、submit 或 approve。無功能格保留 —；框架頁只提供現有 view，不新增空操作格。同頁 line/group/stage 參數不產生新權限 | lines 使用 AB/C 共用流程；只有 lines.view 的目的地可進、AB API 403，是尚未建立獨立頁面資料邊界的缺口。editor 為 process:platform，routine 多文件 scope；不將這三者假裝切成獨立頁草稿或擴大底層資料可見性 |
| 模組送審／撤回 vs 平台最終核准、舊 reviewer 映射、發回規則、已核准不可撤回 | 保留現行固定案件、pending、理由、世代、CAS 與收據，另驗證核心核准後不可撤回、發回／撤回已終結案件不可再審 | **新分離政策未啟用。** main 缺少 #102 的完整 page-v1 scope/adapter 與可信主要管理員最終核准授權證據鏈；legacy approval.approve/reject 仍沿用舊解析。因此舊模組 reviewer 仍可能得到目前核准能力，不能宣稱已解決。須與 13 頁邊界及平台入口一起整合，不能僅重命名勾選格、清掉舊值或自動授予最終核准 |
| 有效帳號查看錯誤回報；操作／匯出依權限；原圖／封存不越權 | feedback.view 固定給已啟用、未刪除、有效角色的登入帳號，矩陣為唯讀；停用／刪除／未知角色／匿名仍拒絕。新增帳號選單入口，沿既有 delivery coordinator；嚴格 feature flag 維持不變。feedback-only 不衍生泛用 view:data，避免打開其他業務 API。編輯／create／exchange 與現行 admin-only 限制保留。原圖須來源模組查看及原始 access envelope，普通 ADMIN 也不能繞過。歷史與兩種 ZIP 全部核對每筆案件與圖片來源；混合歷史不能透過重新匯出洩漏其他案件。未授權歷史隱藏並顯示雙語提示；下載前後 fresh 授權、雜湊及大小校驗 | 不改真實帳號、不啟用 WEB_FEEDBACK_ENABLED 或 access-event 功能旗標。主要管理員的既有全權身分保留；缺少 access envelope 的舊原圖只由有效主要管理員讀取。原匯出收據可回最小相同結果供未知操作追查，但原圖／ZIP 每次另驗目前授權，不藉重送產生新檔 |

10 個 Edit→Save 對齊模組：AB、C、流程資料（templates）、BOM、FQC、IQC、IPQC-AB、IPQC-C、模具設備（tooling）、檢具與測試設備（equipment）。這是將產品已存在的原子 Save 判定如實顯示，不修改真帳號或持久 ACL。新增依賴仍拒絕、舊不一致值不批次覆寫。

### 本批隔離證據與接受界線

- 修改前同一稽核：648 cells 一致，108 組 workflow metadata 中 38 處 Save 配置／API 落差。修改後：161 次合成帳號設定、283 次 API、648 cells、24 目的地、108 workflow metadata 全一致；11 個撤權舊 session 均拒絕。另核對 dispatch view-only 寫入 403 且零修改、IPQC-C 不因 approval.view 跨頁開放。這不是每個業務 action 的完整端到端驗收。
- 新增 policy／實際角色事件／帳號入口／原圖／兩種封存／混合歷史／下載中途撤權／收據保護測試；既有回報 API（72 項）、嚴格 bootstrap、access-event 的私密投影及 CAS 回歸一起執行。匿名、停用、普通使用者操作及越權圖片／ZIP 均有負向驗證，未放寬測試斷言來通過。
- 保留 69 個帳密／操作結果定向測試、原 49 個 exact source/navigation 檢查；新快取層另增加第 3 個 exact raw-byte inverse 變體，原 main/hash、舊兩個 account 變體和 background inverse 不變。所有新版 JS 入口鏈一致更新，無背景自動重送。
- lint、非增量 TypeScript、安全 build 與 preflight 按最新提交執行；最新 CI 狀態另以 GitHub head/run 為準。真人帳號（含 phung）、實站、cookie 實際重登入、實體手機及 IME 仍未驗收；沒有另啟本機原生 executor 繞過限制。

儲存模型／schema／migration／業務資料：無變更。衍生權限有兩項明確變更：有效帳號固定 feedback.view；10 個現有原子流程 Edit 包含 Save。未導入 #102 草稿架構、最終核准授權證據、#104 製程計數、原 UNKNOWN 32 檔修復或任何真帳號設定；原 UNKNOWN 操作保持未定、不重送、不拆分。

與 #104 的共同入口只有各自獨立的 index 快取層及來源證明需語意合成；合併整合時須保留兩邊精確 layer，不能以一邊 index／hash 覆蓋另一邊。此 PR 未變更 process app/master/version draft 產品檔，也未帶入 #104 的製程計數。

## 8c06cb8 CI 相容修正（產品授權不放寬）

已完整讀取 Feedback run 42816052697/job 129829311437、AB C run 42816052695/job 129829312166、PROCESS run 42816052839/job 129829312049 的終態日誌。Account permissions 42816052670 已成功；這不抵銷其他 workflow 的失敗。舊 f1ecc 的 Local safety 因新提交取消，step 29 未完成、31 未跑，僅可引用已完成的 role step 9。

- Feedback 舊案例同時缺案件來源 dashboard.view 與原圖捕捉範圍 bom.view，新增產品來源閘門正確先拒絕 EXPORT_SOURCE_PERMISSION_REQUIRED。保留此產品規則及錯誤碼；現在先驗含圖／不含圖均不得越過案件來源，再只授予來源頁查看、保留原圖範圍缺權限，驗證 EXPORT_IMAGE_PERMISSION_REQUIRED。來源合法時明確排除圖片的安全預覽仍 200，無 locator/context 私密原值、無 R2 寫入。不是單改預期錯誤碼或讓無圖片匯出繞過來源授權。
- AB/PROCESS 的 172 列歷史矩陣還原把新 effective Save 當成原始 Save，因此沒有真正反轉 Edit→Save。修正只從同一 production policy 的 basePermissionCells 取原始 Save；保留原始完整 digest a80751bb12f51ef0685bc05a1ee12c6989dbb425abafe3e948d2136143ed3633、每列 DTO／無 DTO 拒絕及零寫入斷言，沒有改 hash 或 route 權限。
- 額外核對既有 access-template 性能／來源證明：新增兩個權限檔的精確 raw-byte account inverse，還原 genuine main 9fbba823 後再進原 PR44 六個 span。原契約/hash 與 session/identity/revocation 保護不動，新增位移、錯路徑、重複／部分／外部 bytes 變異拒絕。歷史性能比較只扣掉已禁止的 feedback-only 泛用 data 別名，其餘完整物件相等、4→2 次同一請求角色解析、114 組比較及跨請求撤權仍必須通過。
- 更新合成 import-pending fixture 的唯一 policy import 為此次真快取版本，保留 unknown module 拒絕；15 個啟動／身分／讀取順序場景通過。

本機已重跑三個失敗 CI 的完整受影響 source test 命令（AB/PROCESS 合併一組、Feedback 一組）均 exit 0；55 個根因定向測試、3 個權限來源 inverse 測試及性能 reuse 通過。最新 head 的遠端 CI 仍以其獨立結果為準，不能稱取消／尚未執行的原生步驟通過。此輪只改測試、精確來源證明及 CI；產品權限／原圖／封存保護保持 8c06cb8。

## 6f2bf38 原生員工回報入口修正

Feedback 42817524858/job 129834291274 的 293 項來源測試、schema、API、build 均通過；原生第六階段在員工登入後等待 .wf-row 逾時，前五個階段均通過。原因是 feedback-only 帳號已不再取得泛用 views:data，但 dual-system 舊的 data shell 仍只看這個泛用別名，所以 API 可讀、列表畫面卻無法進入。

產品只為目前已驗證的 data:web-feedback delivery 放行 data 畫面容器：protected/projected、目前身分相符、有效帳號、feature flag、feedback.view、目的地 view/tab/module/key 全部相符，且無 expired/requiresReload。沒有改 API view:data、currentUser.views、其他頁面、圖片／封存／private notes 或寫入權限。測試涵蓋正常入口及逐項身分／目的地／旗標／失效反例；既有 bootstrap 仍驗 feedback-only 的泛用 data API 權限為 false。原生案例、逾時與拒絕斷言均不改，等待新 head CI 驗證。
