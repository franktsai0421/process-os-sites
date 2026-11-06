# 權限映射只讀盤點

基準 `2882f35de8e68370304a2d2235c039e226a2e4e5`，2026-11-06；27 列、162 個 catalog keys。本任務未改 policy、API 或帳號資料。以下是已讀來源與隔離證據，不等於逐頁完整業務按鈕驗收。

## Catalog 與實際入口

`public/process/access-policy.mjs:3–36` 定義欄與 keys；`moduleForURL:84`、`public/process/delivery-purpose.mjs`、`lib/destination-delivery.mjs` 決定頁面 admission。

| 模組／頁面 | 完整 catalog 操作（key 前綴為模組 ID） | API／控制 |
| --- | --- | --- |
| 總覽 (`dashboard`) | `dashboard.view` | 只讀頁面；經 bootstrap／shared-state 授權投影；無該頁專屬寫入權限 |
| 產線播放台 (`player`) | `player.view` | 只讀頁面；經 bootstrap／shared-state 授權投影；無該頁專屬寫入權限 |
| 發送介面 (`dispatch`) | `dispatch.view`、`dispatch.edit` | `/api/shared-state (dispatchBoard)` |
| 產品製程狀態 (`status`) | `status.view` | 只讀頁面；經 bootstrap／shared-state 授權投影；無該頁專屬寫入權限 |
| AB 產線與類別 (`ab`) | `ab.view`、`ab.create`、`ab.edit`、`ab.delete`、`ab.save`、`ab.submit`、`ab.withdraw`、`ab.approve`、`ab.return`、`ab.exchange`、`ab.restore` | `/api/master/workflow?scope=AB` |
| C 產線與類別 (`c`) | `c.view`、`c.create`、`c.edit`、`c.delete`、`c.save`、`c.submit`、`c.withdraw`、`c.approve`、`c.return`、`c.exchange`、`c.restore` | `/api/master/workflow?scope=C` |
| BOM (`bom`) | `bom.view`、`bom.edit`、`bom.save`、`bom.submit`、`bom.withdraw`、`bom.approve`、`bom.return`、`bom.exchange`、`bom.restore` | `/api/bom/workflow` |
| 線別與工段管理 (`lines`) | `lines.view`、`lines.create`、`lines.edit`、`lines.delete`、`lines.save`、`lines.submit`、`lines.withdraw`、`lines.approve`、`lines.return`、`lines.exchange` | `/api/master/workflow?scope=AB / scope=C` |
| 流程資料 (`templates`) | `templates.view`、`templates.create`、`templates.edit`、`templates.delete`、`templates.save`、`templates.submit`、`templates.withdraw`、`templates.approve`、`templates.return`、`templates.exchange`、`templates.restore` | `/api/master/workflow?scope=PROCESS` |
| 製程編輯台 (`editor`) | `editor.view`、`editor.create`、`editor.edit`、`editor.delete`、`editor.save`、`editor.submit`、`editor.withdraw`、`editor.approve`、`editor.return`、`editor.restore` | `/api/process-authoring/workflow` |
| 版本確認平台 (`approval`) | `approval.view`、`approval.approve`、`approval.return`、`approval.withdraw` | 聚合各模組 workflow；`approval-tabs.js`／`master-review.js` |
| FQC (`fqc`) | `fqc.view`、`fqc.create`、`fqc.edit`、`fqc.delete`、`fqc.save`、`fqc.submit`、`fqc.withdraw`、`fqc.approve`、`fqc.return`、`fqc.exchange`、`fqc.restore` | `/api/fqc/workflow` |
| IQC (`iqc`) | `iqc.view`、`iqc.create`、`iqc.edit`、`iqc.delete`、`iqc.save`、`iqc.submit`、`iqc.withdraw`、`iqc.approve`、`iqc.return`、`iqc.exchange`、`iqc.restore` | `/api/iqc/workflow` |
| IPQC-AB (`ipqc-ab`) | `ipqc-ab.view`、`ipqc-ab.create`、`ipqc-ab.edit`、`ipqc-ab.delete`、`ipqc-ab.save`、`ipqc-ab.submit`、`ipqc-ab.withdraw`、`ipqc-ab.approve`、`ipqc-ab.return`、`ipqc-ab.exchange`、`ipqc-ab.restore` | `/api/ipqc-ab/workflow?module=1` |
| IPQC-C (`ipqc-c`) | `ipqc-c.view`、`ipqc-c.create`、`ipqc-c.edit`、`ipqc-c.delete`、`ipqc-c.save`、`ipqc-c.submit`、`ipqc-c.withdraw`、`ipqc-c.approve`、`ipqc-c.return`、`ipqc-c.exchange`、`ipqc-c.restore` | `/api/ipqc-c/workflow` |
| 模具設備 (`tooling`) | `tooling.view`、`tooling.create`、`tooling.edit`、`tooling.delete`、`tooling.save`、`tooling.submit`、`tooling.withdraw`、`tooling.approve`、`tooling.return`、`tooling.exchange`、`tooling.restore` | `/api/tooling/workflow` |
| 例行報告資料庫 (`routine-reports`) | `routine-reports.view` | 只讀頁面；經 bootstrap／shared-state 授權投影；無該頁專屬寫入權限 |
| 檢具與測試設備 (`equipment`) | `equipment.view`、`equipment.create`、`equipment.edit`、`equipment.delete`、`equipment.save`、`equipment.submit`、`equipment.withdraw`、`equipment.approve`、`equipment.return`、`equipment.exchange`、`equipment.restore` | `/api/routine-equipment/workflow` |
| 品質總覽 (`quality-dashboard`) | `quality-dashboard.view` | 只讀頁面；經 bootstrap／shared-state 授權投影；無該頁專屬寫入權限 |
| 標準搜尋 (`quality-search`) | `quality-search.view` | 只讀頁面；經 bootstrap／shared-state 授權投影；無該頁專屬寫入權限 |
| 品質報告 (`quality-reports`) | `quality-reports.view` | 只讀頁面；經 bootstrap／shared-state 授權投影；無該頁專屬寫入權限 |
| FPY (`fpy`) | `fpy.view` | 只讀頁面；經 bootstrap／shared-state 授權投影；無該頁專屬寫入權限 |
| 例行檢查 (`routine`) | `routine.view`、`routine.create`、`routine.edit`、`routine.delete`、`routine.save`、`routine.submit`、`routine.withdraw`、`routine.approve`、`routine.return`、`routine.settings` | `/api/routine-fqc` |
| 網頁問題回報 (`feedback`) | `feedback.view`、`feedback.create`、`feedback.edit`、`feedback.exchange` | `/api/web-feedback` |
| 使用者與權限 (`users`) | `users.view`、`users.create`、`users.edit`、`users.delete` | `/api/user-access` |
| 帳號啟用／停用 (`user-status`) | `user-status.edit` | `/api/user-access (status-user)` |
| 重設普通帳號密碼 (`user-password`) | `user-password.edit` | `/api/user-access (password)` |

## 空格與詳細入口

只有主要四欄 view/edit/save/submit 中 catalog 不支援者才顯示「—」，不是遺失的 permission key。無額外權限列：`dashboard`、`player`、`dispatch`、`status`、`routine-reports`、`quality-dashboard`、`quality-search`、`quality-reports`、`fpy`、`user-status`、`user-password`。現改用靜態說明；有可編輯權限或個別設定時仍保留本列全選／恢復；沒有刪除任何 cell。`lines` 的舊值仍保留且 disabled，未復活舊授權。

## 已證實的對應差異及分類

1. **衍生 Save 與原始 cell 的表示差異（既有契約，非新授權漏洞）**：`lib/versioned-shared-workflow.ts:151–156` 與 `app/api/ipqc-c/workflow/route.ts:17–20` 使 AB/C、流程資料、BOM、FQC、IQC、IPQC-AB/C、模具、檢具在 edit=true 時可保存，即使原 save cell=false。現 matrix 仍呈現已存原值；本任務沒有改依賴或自動補勾。舊 audit 在 108 組 workflow metadata 中回報 38 個 save-only 差異，逐項都是此規則；該腳本最後的零差異斷言 FAIL，不能算成整套 PASS。
2. **線別入口與資料讀取的必要條件不同**：單獨 `lines.view` 可以通過 line-admin 入口 admission，但 `/api/master/workflow?scope=AB&permissions=1` 會在缺 `ab.view` 時回 403。`public/process/master-data.js:321–325` 已顯示 AB/C 權限不足的說明；`permission-controls.js:39` 依當前 masterScope 將舊操作映射到 ab/c；`master-admin-ui.js:103,468` 與 `master-shared-client.js:10` 仍使用所屬 AB/C 整份草稿。不能單改 lines cells 讓原本無權的人讀或寫。
3. **未發現原始 key resolver 的偏差**：合成普通／管理員、all-off/all-on 共 648 次 cell 比對，前端 allowed、API actor.cells、後端 can 一致；24 個 destination 的 admission 矩陣符合配置。11 個 workflow 撤權後舊 session 均拒絕。這只涵蓋 resolver／metadata，不代表每種業務按鈕完成執行。
4. **拒絕仍有效**：dispatch.view-only 對 shared-state dispatchBoard 寫入為 403、revision／資料不變（`app/api/shared-state/route.ts:197–214`）；approval.view-only 對 IPQC-C workflow 為 403，未跨模組授權。

## 送審、撤回、核准、發回與帳號操作

- 上表 11 個 workflow 的 POST 使用 `command.action=submit/withdraw/approve/return`（IPQC-C 的相容 API／UI 把 reject 對應 return），master 依 AB/C/PROCESS scope，IPQC-AB 使用 module=1。`lib/versioned-shared-workflow.ts:118–156` 依 module.view 與對應操作 key；`lib/shared-draft.ts:149–196` 再要求 view、操作權限、pending case、revision/generation、self-review confirmation 與理由。沒有只看按鈕就授權。
- `public/process/master-review.js:49,60,69–74` 以 scope 的實際 permissions 決定 approve/return/withdraw 的 disabled，BOM 走 `BOMWorkspace.reviewPermission/reviewAction`。`master-admin-ui.js:468` 接 Save/Submit/Withdraw selectors；`process-authoring-v3.js` 經 authoring workflow；`iqc-master.js:30` 的 permissionGates 明列新增、編輯、保存、送審、撤回、核准、發回、刪除 selectors。IPQC-C `ipqc-c.js:15,700,1141` 先經 sharedDraftPermissionAllowed／hasPermission，呼叫其 workflow。這些來源已讀；未逐一重跑全部工作流按鈕。
- 例行檢查不是上述 11 個端點之一：`app/api/routine-fqc/route.ts:33–38,205–208,251` 使用 routine 操作，create-plan/create-report 要 routine.create，discard-draft/delete-plan 要 routine.delete；settings 另要 routine.settings，舊 revoke/revise 還有 legacy gate。這輪僅列出，不新增缺少的 catalog keys。
- 角色 CRUD 及角色保存只限主要管理員：`app/api/user-access/route.ts:34,76–83`；`access-policy.mjs:60–79` 的 managementRight/roleEditable/editableCells 保護主要管理員、自己的管理員帳號、peer admin、DEMO 及 grant ceiling。普通 admin 有該 user 管理權時仍只編可授權的非 admin。設定密碼／停用／刪除均經 `/api/user-access` password/status-user/delete-user；本輪只用合成帳號回歸，沒觸碰真實資料。

## 拆稿完成後的具體相依

- line/stage 分離需先把 `lib/master-workflow.ts:30–42` 的 masterDataControl／workflowScopes AB/C snapshot，`public/process/master-shared-client.js:10` client scope，`master-data.js:321–325` 頁面選取與 `master-admin-ui.js:468` Save／Submit 整模組邊界一起對齊。否則只改權限會造成跨頁資料寫入或無法保存；本分支無這些 hunk。
- 正式逐模組權限改造需在資料 adapter／Save transaction 邊界固定後，重新驗證 `moduleForURL`、destination admission、workflowAccess、create/delete/restore 副作用，以及 review 的 case scope。不能由上述 648 次 resolver PASS 推論新邊界已安全。
- 畫布 Save/delete、草稿各頁 adapter、帳號登入／密碼候選各自整合；本分支僅 user-access.js 的 matrix markup（原 48–52 行）、user-access.css 的呈現段與 index 的 cache tags，合併時比對同檔其他 hunk，不整份覆蓋。
