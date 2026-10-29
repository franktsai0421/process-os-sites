# 權限設定 → 介面 → 後端對照（CLOUD 29102026）

草稿專項追加：[草稿頁面複核與修改建議](USERS_CLOUD_DRAFT_PERMISSION_AUDIT_29102026.md)。IQC 已確認僅保存／送審／撤回缺按鈕，以及還原可越過 delete 格造成草稿軟刪除；尚未修復。

前輪實測：[設定後各頁面權限核對](USERS_CLOUD_PAGE_PERMISSION_AUDIT_29102026.md)。604 次共用函式比對、600 次目的頁判定、87 組流程權限、11 個撤權會話及 IQC 實際頁面；已確認落差未修復，不能標為全站通過。

基準及驗收限制見 [主報告](USERS_CLOUD_29102026.md)。catalog 為 `public/process/access-policy.mjs`，27 列、151 個有效格。角色矩陣與個別矩陣沿用同一 catalog，未新增權限鍵。

通用對應：view=查看、create=新增、edit=套用／編輯、delete=草稿刪除、save=儲存草稿、submit=送審、withdraw=撤回、approve=核准、return=發回、exchange=匯入／匯出、settings=設定。列全選是 UI 控制，不是第 152 個權限。view 相依由 API 驗證，不靜默擴權。`permission-controls.js` 與 `process-state.ts:can` 依 URL/module 對應 legacy 鍵；`destination-delivery.mjs` 另檢查目的頁 view。後端仍須同時滿足 CAS、pending、角色、歷史及工作流限制；勾選不是無條件放行。

標記：「已符合／已修復」僅對下列證據；「尚未驗證」表示只盤點路徑，不代表每一操作均已跑真瀏覽器。「需要確認」不得當作完成。

| catalog／設定 | 導航／頁面 | 按鈕或操作 | 後端 API／判定 | 狀態與限制 |
|---|---|---|---|---|
| dashboard.view | `view=dashboard` | 查看總覽 | `/api/process-bootstrap`、shared-state 授權投影 | 已盤點；逐項真資料未測 |
| player.view | `view=player` | 播放／查看 | bootstrap、shared-state、state-media ACL | 已盤點；播放器細項未測 |
| dispatch.view/edit | `view=dispatch` | 查看、編輯發送 | bootstrap；`/api/shared-state` 的 dispatchBoard | **已實證越權，未修復**：只勾 view、未勾 edit，直接 POST 200 且 dispatchBoard 實際改變；需獨立修復 |
| status.view | `view=productStatus` | 產品狀態查看 | bootstrap、state-media | 已盤點；legacy status.viewDetails／viewMedia／viewAllLines 無獨立新 catalog 格，需確認是否仍須細分 |
| ab.* | dataTab=AB | 查看、新增、編輯、刪除、儲存、送審、撤回、核准、發回、匯入出 | `/api/master/workflow?scope=AB`、versioned workflow | 已盤點；全操作尚未驗證 |
| c.* | dataTab=C | 同上 | `/api/master/workflow?scope=C` | 已盤點；全操作尚未驗證 |
| bom.* | dataTab=bom | 查看、編輯、儲存、送審、撤回、核准、發回、匯入出 | `/api/bom/workflow` | **已符合（定向）**：角色撤銷 bom.edit 後舊會話拒絕、新登入直接 begin API 拒絕；其他操作尚未全測 |
| lines.* | dataTab=line-admin | 線別／工段草稿操作 | master workflow（AB/C scope） | **已實證不一致／需確認**：僅 lines.view 可過入口，AB workflow permissions GET 卻 403；需決定與 AB/C 的關係 |
| templates.* | dataTab=process-master | 流程資料草稿操作 | `/api/master/workflow?scope=PROCESS` | 已盤點；全操作尚未驗證 |
| editor.* | view=editor | 建立、編輯、刪除、儲存、送審、撤回、核准、發回 | `/api/process-authoring/workflow`、process-authoring adapter | 已盤點；不修改其他任務的製程流程 |
| approval.view/approve/return/withdraw | view=approval | 查看／核准／發回／撤回 | 各模組 workflow；legacy shared-state approvalVersions | 已盤點；跨模組 authority／creator／pending 規則尚未全測 |
| fqc.* | dataTab=quality-fqc | 版本草稿操作 | `/api/fqc/workflow` | 已盤點；尚未全測 |
| iqc.* | dataTab=quality-iqc | 版本草稿、媒體 | `/api/iqc/workflow`、`/api/iqc/photo` | **實測設定／撤權與既有零件修改通過；新增按鈕不一致**：edit=true、create=false 仍顯示新增；後端 403 且未改資料。完整業務未全測 |
| ipqc-ab.* | dataTab=quality-ipqc-ab | 版本草稿、媒體 | `/api/ipqc-ab/workflow`、photo | 已盤點；尚未全測 |
| ipqc-c.* | dataTab=quality-ipqc-c | 版本草稿、媒體 | `/api/ipqc-c/workflow`、photo | **已實證舊規則衝突／另立 PR**：view-only 可撤回；跨頁審核查看及核准／發回另有 approval.view 前提。見最新實測 |
| tooling.* | dataTab=quality-mold-equipment | 草稿及模具檢查 | `/api/tooling/workflow`、checks、iqc、photo | 已盤點；子操作尚未全測 |
| routine-reports.view | dataTab=quality-routine-reports | 查看入口 | bootstrap；placeholder | **不適用新增操作**：現為建置中，不創造不存在的業務 API |
| equipment.* | dataTab=quality-routine-equipment | 草稿、替換、照片 | `/api/routine-equipment/workflow`、photo、quality-equipment-replacement | 已盤點；尚未全測 |
| quality-dashboard.view | view=quality-dashboard | 查看 | bootstrap；placeholder | 已盤點；頁面框架不是完整品質報告 |
| quality-search.view | view=quality-search | 查看／搜尋入口 | bootstrap；各品質標準專用 API | 已盤點；跨模組搜尋尚未全測 |
| quality-reports.view | view=quality-reports | 查看入口 | bootstrap；placeholder | 尚未全測；不把框架當成既有新增／刪除功能 |
| fpy.view | view=quality-fpy | 查看入口 | bootstrap；placeholder | 尚未全測；不新增指標管理權限 |
| routine.* | view=quality-inspections | 建立／刪除計畫、報告、草稿、送審、設定 | `/api/routine-fqc` | **已符合（定向）**：現有五項 actual-handler 測試確認 create/delete/settings 及撤權後 receipt 重播仍拒絕；其餘尚未全測 |
| feedback.view/create/edit/exchange | dataTab=web-feedback | 查看／新增／編輯／ZIP | `/api/web-feedback`；adminOps、原圖 ACL | 已盤點；依本次邊界不修改或重驗另一任務的問題回報；無 delete 命令 |
| users.view/create/edit/delete | dataTab=users | 查看／建立／個別權限／邏輯刪除 | `/api/user-access`；managementRight/editableCells／CAS | **已修復／定向驗證**：唯讀自身矩陣、舊設定相容、越權拒絕、讀回／舊回應防護；users.view 對 admin 固定允許，非 admin 僅「我的帳號」 |
| user-status.edit | users→更多 | 停用／重新啟用 | `/api/user-access` status-user | **已符合**：manager 限非 admin；Frank 自保；舊 session 失效 |
| user-password.edit | users→更多 | 重設非 admin 密碼 | `/api/user-access` password | **已修復／驗證**：所有身分改自己密碼均驗舊密碼；他人重設依 actor/target 限制，無 target 舊密碼要求 |

## 角色管理與個人帳號分離

- 角色 CRUD／角色矩陣、授予或撤銷 admin 身分：固定可信帳號 ID `frank`，且 stored role=admin、啟用、未刪除、非 DEMO；不看顯示姓名或前端角色。普通 admin 顯示姓名為 Frank 的合成帳號亦不能通過。
- 普通 admin 不可修改自己／其他 admin 的角色、權限、啟停、刪除或重設密碼；自己的密碼需舊密碼。個別授權只允許 actor 有權且 target 適用的格，null 恢復繼承也不能繞過授權上限。
- 普通帳號 GET 僅回自己的資料、有效 cells 與自身角色繼承 cells；不回其他帳號／角色模板。沒有擴大人員清單可見範圍。
- `/api/users` 已停用（410）；generic shared-state 帳號鍵寫入拒絕（403）。角色／個別權限變更使真正有效權限改變的帳號 epoch 更新，直接 API 重驗 stored identity，不信 UI 快取。
- 本次未修改其他模組的 auth/navigation/shared-state 寫入機制；全站所有 151 格的正反操作尚未完成，不應據此宣稱全站通過。
