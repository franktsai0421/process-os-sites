# 現行全站權限對照

基底 main c6ac41a6 + 本分支 status 只讀別名修復。實際 catalog 27 列／162 keys，沒有新增 keys。以下每個 action 的完整鍵為「列 ID.action」。空格表示不存在，不新增全域權限或自動補授權。

| 模組（ID） | 存在的 actions | 實際 UI/API owner 與限制 |
| --- | --- | --- |
| 總覽 (`dashboard`) | `view` | bootstrap/shared-state 只讀投影 |
| 產線播放台 (`player`) | `view` | bootstrap/shared-state 只讀投影 |
| 發送介面 (`dispatch`) | `view`、`edit` | shared-state dispatchBoard |
| 產品製程狀態 (`status`) | `view` | destination status approved projection / media reference gate |
| AB 產線與類別 (`ab`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | master/pages?page=AB；舊 master/workflow?scope=AB |
| C 產線與類別 (`c`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | master/pages?page=C；舊 master/workflow?scope=C |
| BOM (`bom`) | `view`、`edit`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | bom/workflow |
| 線別與工段管理 (`lines`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange` | master/pages?page=LINES；未採用 page-v1 入口唯讀 |
| 流程資料 (`templates`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | master/pages?page=PROCESS；舊 master/workflow?scope=PROCESS |
| 製程編輯台 (`editor`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`restore` | process-authoring/workflow；process-ipqc |
| 版本確認平台 (`approval`) | `view`、`approve`、`return`、`withdraw` | 各模組固定 pending case 聚合，平台 final approval |
| FQC (`fqc`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | fqc/workflow |
| IQC (`iqc`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | iqc/workflow |
| IPQC-AB (`ipqc-ab`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | ipqc-ab/workflow?module=1 |
| IPQC-C (`ipqc-c`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | ipqc-c/workflow |
| 模具設備 (`tooling`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | tooling/workflow |
| 例行報告資料庫 (`routine-reports`) | `view` | 建置中：catalog 只讀，不宣稱完整報告功能 |
| 檢具與測試設備 (`equipment`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`exchange`、`restore` | routine-equipment/workflow |
| 品質總覽 (`quality-dashboard`) | `view` | 只讀品質總覽 |
| 標準搜尋 (`quality-search`) | `view` | 只讀標準搜尋 |
| 品質報告 (`quality-reports`) | `view` | 只讀品質報告 |
| FPY (`fpy`) | `view` | 只讀 FPY |
| 例行檢查 (`routine`) | `view`、`create`、`edit`、`delete`、`save`、`submit`、`withdraw`、`approve`、`return`、`settings` | routine-fqc/page；routine-fqc report/plan |
| 網頁問題回報 (`feedback`) | `view`、`create`、`edit`、`exchange` | web-feedback；edit/exchange adminOps；主要管理員軟隱藏另受既有規則 |
| 使用者與權限 (`users`) | `view`、`create`、`edit`、`delete` | user-access 專用；roles CRUD 只限 primary |
| 帳號啟用／停用 (`user-status`) | `edit` | user-access status-user |
| 重設普通帳號密碼 (`user-password`) | `edit` | user-access password；自己的密碼另須原密碼 |

## 有效格與管理邊界

角色模板/legacy source → 角色 access → 個人 accessOverrides（false 明確拒絕，null 刪除例外恢復角色）→ Edit 包含 Save 的既有規則 → 已啟用的 draftReviewPolicy 投影。停用/刪除/不存在角色無權。primary Frank 維持安全邊界；一般 ADMIN 不等於 primary，不能修改自己、同級、Frank 的角色/權限/啟停/刪除，自己改密碼例外。普通帳號只讀自身與改自己密碼；授權不超過 actor 的可編輯有效格。users.view 對 ADMIN 固定、feedback.view 對有效帳號固定，不能由 false 假裝撤掉。

- View 與 Edit/Save/Submit 分開；十三個 installed workflow 的 view+edit 推導 save，raw save=false 不能否定仍有效的 Edit。獨立 Save 不授 Edit/Submit/Approve。UI 展示有效格與來源，payload 只保存明確 raw choice。create/delete/restore 須 view+edit，FQC.view 另需 AB.view、equipment.view；不默默補勾。沒有的 create/delete/restore 不會出現在該列。
- 有權的有效帳號 lines 為 A/B/C；線別篩選不是授權來源。status.view 統一涵蓋全部狀態明細/照片/影片，舊三個 status aliases 由該格導出，關閉則全拒絕；照片實體仍受 destination/reference 授權。
- 資料後台是入口集合，沒有 data.* 萬能格；各 dataTab 依其 module.view admission。
- LINES 已安裝獨立 page-v1 API/整頁草稿；只有實際採用的 stored owner 才提供 operation cells。未採用時 lines.view 可查 approved catalog，但沒有 ab.view 仍不能讀 AB workflow，盤點中的 403 是正確邊界。不得用 lines.edit 放行舊 AB/C 整份交易。
- AB/C、LINES、PROCESS page owner 的歷史還原/額外 actions 依實際支援：即使保留 legacy catalog restore，不能借它啟用 page route 未實作的歷史命令。原 immutable history、revision/generation、pending locks、來源和 BOM 相依仍驗證。

## 送審、撤回、發回、核准

所有具 submit 的列具自身查看與 operation gate；只看按鈕不等於 server 授權。案例必須仍為固定 pendingId/status=pending，CAS、理由及原作者/自審確認仍適用。已核准生效版本不是可撤回 pending case。版本確認平台不會憑 approval.view 取得所有模組資料。

已採用 draftReviewPolicy=page-v1 時，模組 submit/withdraw 為設定來源，發回與撤回共用 correction authority；最終 approve 來自有效且有主要管理員明確證據的 approval.approve，另有平台查看及模組查看，舊模組 reviewer 不自動取得 final approve。未採用 policy 的 legacy snapshot 保留既有權限，這是相容狀態，不能據此推定實站 Frank-only 已驗收。IPQC-C final approve 已使用平台 gate；詳見既有 account-final-approval/module-review-access/draft-review-policy 正反例。

## 本次盤點證據

[實際隔離原始盤點](permission-audit.json)：648 次 cells 的 UI/API/effective 一致、111 組 workflow metadata 無差異、24 個 destination、11 個撤權舊 session 拒絕。LINES 舊 endpoint 依賴正確記錄。另有 status 自訂角色專案測試及 native compiled account 安全場景。這些證明 resolver/配置/API guard；各業務頁按鈕完整保存→送審→核准生命週期未全部重跑，不冒充真實站點/手機/IME 驗收。
