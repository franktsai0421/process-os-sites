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
