# 設定後的各頁面權限核對（CLOUD 29102026）

結論：設定有傳到有效權限、共用前後端判斷及多數新版流程 API，但各頁面／功能尚未完全對齊，不能宣稱全站權限驗收通過。本輪只新增隔離檢查與報告，沒有改動其他模組業務程式或站台設定。

來源 HEAD `92045fe`；執行程式仍為 `91942a677fb3fc5d912437b65bd8f495972d70ea`，後續差異僅測速文件。compiled Worker bundle SHA、來源雜湊及原始結果見[結果 JSON](users-cloud-29102026-page-permissions-results.json)。

## 已實際檢查

| 層次 | 方法與結果 | 證據界線 |
|---|---|---|
| 使用者設定保存 | 向實際 user-access API 發出 140 次隔離設定保存請求，使用 Frank 管理合成 staff／admin | 包含無變化保存；不是宣稱 140 次 DB mutation；沒有操作真實帳號 |
| 151 格有效權限 | 兩個角色、開／關兩種設定，共 604 次「保存後 GET 的 cells → 前端 allowed → 後端 can」比對一致 | 使用真正函式，不等於所有頁面按鈕皆已呼叫該函式；users.view 仍沿用 admin 固定允許規則 |
| 各頁面入口 | 24 個非帳號管理目的頁逐一只授予該頁查看，再檢查全部 25 個明確目的 URL，共 600 次 admission 判斷符合 | 是實際 destinationPlan 程式層；網頁回報僅在合成 feature enabled 下檢查入口，沒有測另一任務的業務寫入 |
| 流程 API 權限 | 11 個流程模組，87 組逐項授權的 permissions GET；80 組符合，7 組不一致均在 IPQC-C | 查看、編輯、保存、送審、撤回、核准、發回、刪除。刪除測試保留既有「同時有編輯」前提；新增／匯入出沒有因此被宣稱完整驗收 |
| 撤權後既有會話 | 11 個模組均在真實設定保存撤權後，拒絕舊 session 的 permissions GET（403） | Node harness 用隔離簽章與 stored authEpoch 發新測試 session；正常登入另由下列瀏覽器測試覆蓋 |
| 實際瀏覽器與正常登入 | IQC 查看 → BOM 禁止 → 授予編輯 → 實際修改既有零件並獨立讀回 → 撤權、舊登入拒絕 → 重新登入恢復唯讀，均通過 | 真正 compiled application／Chromium／非持久 D1、R2；代表性模組，不是假設所有頁面按鈕相同 |
| IPQC-C 已有業務回歸 | 7 組、208 次 direct handler 呼叫，正常建立／送審／撤回／核准、照片與歷史保護回歸通過 | 該套件刻意保留「查看可撤回」舊規則；它通過不代表符合使用者本次要求的未勾禁止 |

逐項 API 權限回應符合的 10 個模組：AB、C、流程資料、BOM、FQC、IQC、IPQC-AB、模具設備、檢具與測試設備、製程編輯台。這是本輪權限回應與撤權檢查，不是這些模組的全部新增、照片、匯入／匯出及完整送審瀏覽器驗收。

## 已確認落差（未修復）

| 優先程度／項目 | 設定與實際結果 | 實際檔案／原因 | 建議與影響 |
|---|---|---|---|
| 高：發送寫入可繞過編輯格 | dispatch.view=true、dispatch.edit=false，直接 shared-state POST 回 200；讀回確認 dispatchBoard 已變、revision 增加 | `app/api/shared-state/route.ts` 的 dispatchBoard 寫入只要求 view:dispatch；`public/process/app.js` 的發送操作也需一起核對 | 獨立發送權限修復 PR，後端強制 dispatch.edit，前端一致限制；保留查看、播放及 CAS，不擴大管理範圍 |
| 高／舊規則衝突：IPQC-C 未勾撤回仍可撤回 | 只有 ipqc-c.view，permissions.withdraw 仍 true；既有實際流程測試也允許 viewer 撤回其他合成操作者送審的案件 | `app/api/ipqc-c/workflow/route.ts` 的 withdraw 使用 data || review...，有查看即通過；`scripts/test-ipqc-c-operation-permissions.cjs` 明文驗證此相容規則 | 先確認要改為明確 withdraw 格，再另立 IPQC-C PR；一併測 pending、跨帳號、自我審核與歷史，不能只換條件後宣稱完成 |
| 需確認：IPQC-C 查看／審核額外條件 | ipqc-c.view=false 但 approval.view=true，permissions GET 仍 200 且 view=true；反之只勾 ipqc-c.approve 或 return，加自身 view、未給 approval.view，API 回應仍不允許核准／發回 | 同一 `access()` 把資料查看與審核平台查看混用；設定畫面目前沒有完整呈現這些跨頁依賴 | 確認審核者能看哪些資料，將必要跨頁權限明確呈現或拆開；不藉此把主要頁面改 admin-only |
| 需確認：線別管理入口與資料 API 不同權限 | 只有 lines.view 時，line-admin 目的頁允許；實際 master/workflow?scope=AB&permissions=1 回 403 | `public/process/access-policy.mjs:moduleForURL` 依 AB／C scope 判定；`lib/destination-delivery.mjs` 的 line-admin 用 lines.view；共用 master workflow 用 ab/c 權限 | 釐清 lines.* 是獨立管理權限或 AB／C 的共同入口，再對齊介面說明與後端；不能直接放寬 AB／C 資料存取 |
| 中：IQC 新增按鈕與設定不符 | iqc.edit=true、iqc.create=false，實際頁面仍顯示「新增零件」；直接新增命令回 403，確認資料沒有變動 | `public/process/iqc-master.js` 的新增入口使用 mayEdit；`lib/versioned-shared-workflow.ts` 另查 create 格 | IQC 獨立 UI 權限修復：新增按鈕／表單檢查 create，既有資料修改依 edit；後端拒絕已有效，不應移除 |

另外，新增／刪除等功能仍可能同時需要編輯權限或符合工作流狀態；本輪不因單格勾選而移除 pending、歷史、自我審核等保護。建議設定介面清楚列出必要權限組合，避免使用者把「已勾選」理解為無條件成功。

## 重跑與交接

```bash
USER_PERMISSIONS_EVIDENCE=/tmp/users-page-audit node scripts/audit-users-page-permissions.mjs
# 先對實際程式版本完成 safe build；下面使用當次 build 的 program commit。
PROCESS_PROGRAM_COMMIT=<built-source-sha> USER_PERMISSIONS_EVIDENCE=/tmp/users-page-audit node scripts/audit-users-page-browser.mjs
IPQCC_OPERATION_EVIDENCE_PATH=/tmp/users-page-audit/ipqcc-operation.json node scripts/test-ipqc-c-operation-permissions.cjs
```

Audit 工具用 `COMPLETED_WITH_FINDINGS` 明示待修問題；結束碼 0 只表示檢查執行完成，**不代表權限全部符合**。lint 已通過。沒有變更 production 程式，因此沒有為這輪報告再次 build；瀏覽器使用已驗證的 91942a6 bundle。

原任務的獨立分支與資料隔離規則持續適用。不同模組的修復應分開 PR；本輪沒有混入小幫手或問題回報修改。真實站台版本／資料、所有模組的逐一實際按鈕、完整業務與照片流程仍未全面驗證。外部隔離預覽與 Draft PR 仍受原先工具／網路限制，沒有 merge／auto-merge／發布。
