# 2026-10-10 統一主資料送審

## Task / Changed

依三項最新標註，把 AB、C、BOM、線別工段及 PROCESS 流程主資料的固定案件整合至同一「主資料送審案件」清單。移除獨立 BOM 卡與報表式入口；資料後台的查看案件使用相同路由並定位 scope + case ID。製程編輯台案件維持製程版本確認分頁，不併入主資料。

待審預設只列 pending；確認、發回、撤回均沿既有伺服器 workflow。發回／撤回必填原因，自審須明確確認，取消不送出。處理成功後案件離開待審列表；歷史頁保留固定快照、送審／處理者、時間與原因。保留角色、CAS、pending 鎖及原有效資料投影。舊非 V3 歷史只讀，不自動轉換或提供不成立的核准操作。

固定案件內容按需讀取、差異每頁 50 項，BOM 待確認摘要最多展開 30 筆；帳號切換清除案件快取、過期回應不覆蓋。對話框開啟時略過主資料輪詢；重繪透過穩定父節點保留清單／差異捲動。中文／越文標籤獨立。

## Tests

- PASS：scripts/unified-master-review-fixture.cjs --test，AB/C/PROCESS/BOM × confirm/return/withdraw 共 12 組，真實 API 處理器搭配記憶體 SQLite/R2。包含無權限 403、空理由 422、自審未確認 409、過期重送 409、固定內容不變與其他 scope 保全。
- PASS：scripts/test-unified-master-review.cjs，合併列表、撤回移除、歷史稽核、只讀、雙語、定位路由及帳號切換。
- PASS：scripts/test-ui-review-refresh.cjs 八組既有定向回歸；修改 JS 語法與差異空白檢查。
- PASS：CUA 瀏覽器 synthetic 3031：四類同列，PROCESS 撤回、BOM 確認、C 發回後依序 4→3→2→1；AB 取消保持待審；歷史顯示操作者／原因且無審核按钮。唯讀帳號三動作停用。桌機與 390px 中越文無水平溢出。手機為 viewport 模擬，非實機驗收。
- PASS：日常 3000 唯讀點選 BOM「查看送審案件」到 view=approval&approvalTab=master、移除 dataTab，選中 BOM V4；只有一個統一案件區。
- Not run：實體手機、跨電腦網路、正式 BOM 核准與發布後完整播放、全站完整回歸。前輪 quality-shared-rebase 初始化失敗仍保留，不宣稱已修。
- 舊 scripts/ui-collaboration-fixture.cjs 的 BOM 審核 mountReview 入口已 Deprecated；本輪審核入口驗收使用新的 unified-master-review-fixture，舊工具保留其協作測試來源。舊 test-master-review-entrances-v3 的預設歷史列表假設不再適用，未執行。

## Data-model impact / Risk

無 schema、migration、API 協定或業務資料修改。沒有操作真實案件的確認／發回／撤回。日常唯讀收據時間 2026-10-10T05:28:41.460Z：revision 461，BOM V4 為 354 主件／6105 列，pending ID 932eaeaa-1c41-4cf6-869d-c03c9851ae49；25 個保護鍵與原備份一致。此為使用者後續資料，不以先前 11/227 快照覆蓋。691 筆引用待確認仍由審核者處理；本輪未證明來源完整性或核准安全性。保留一般權限政策，不因 UI 整理擴權。

## Recovery / delivery

工作分支 codex/ipqc-ab-local，HEAD 8b182626085bb2aa1f3a216903c5b373ee82bc44，保留原有 dirty checkout。外部修改前備份：<USERPROFILE>/Documents/PROCESS-OS-Backups/unified-master-review-20261010-01。before-manifest、daily-readonly-receipt、candidate-manifest 留在該目錄。還原僅逐檔語意合併本輪差異，不回灌資料庫或整個舊工作區。

資源 review2。沒有 commit、push、merge 或部署。C2C doctor GREEN，保存原 chat 指標與頁籤，未因舊交接啟動其他任務。
