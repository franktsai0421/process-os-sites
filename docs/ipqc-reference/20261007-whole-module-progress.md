# 2026-10-07 整份文稿與日常交接：第7輪補驗複審DONE；新審核UI計畫待修

Task c2c_9fa2 / iteration 6。<WORKSPACE>/中控系統；分支 codex/ipqc-ab-local；HEAD 84278d837898f4e836ec003f7adb67ff38f785c8。保留全部原有未提交及並行模具、Routine FQC 工作。有效需求見 [整份文稿規格](../specs/current/WHOLE_MODULE_DRAFT.md)。本檔取代此前「執行中／3000 未啟動」狀態。

## 第7輪複審補驗

Astra已回覆[STATE: DONE（僅第7輪補驗收）](evidence/20261007-whole-module/astra-review-7.txt)，[畫面證據](evidence/20261007-whole-module/astra-review-7.jpg)。三項補件通過；不代表新提出的ADMIN審核／C重複案件／歷史收折介面問題已修復。移除「發回」按鈕與本機先前要求保留發回功能不同，已向本機使用者提出明確澄清，尚未依網頁中的新計畫擅自刪除入口。

Astra 第6輪[獨立複審原文](evidence/20261007-whole-module/astra-review-6.txt)確認主要實作及日常交接有證據支持，要求補員工實際編輯、AB逐群組撤回／發回一致性及BOM盤點。本輪只新增 `scripts/test-whole-module-review.cjs` 與更新驗收文件，沒有修改業務實作、操作服務或写入3000／3020／3030；不重做核准，不改並行Routine FQC／模具工作。

- PASS：10個文稿模組的員工真正 Apply 兩個類別／群組、整份手動Save、fresh GET重讀、固定Save送審、本人撤回及完整內容雜湊比對。非AB另加Save後未儲存修改，確認不混入送審快照。模具原捕捉副本為空，僅在記憶體測試透過正常employee Apply建立兩個明確隔離類別／器具；非真實模具資料UI驗收。
- PASS：AB legacy與records兩種儲存格式，整份Withdraw及ADMIN 2 Return均逐一核對24群組：無pending鎖、內容等於原固定快照、active ID不變、每組只有一筆對應歷史，且每組實際重新begin可編輯。先前withdrawn案件在return後仍保留原狀。
- PASS：新測試檔語法與定向lint；[靜態檢查](evidence/20261007-whole-module/review-supplement-static.json)。未改TS，沿用先前typecheck；既有25筆lint仍FAIL。
- 測試過程曾因測試程式誤以為員工可讀歷史、IPQC-C GET會回完整control/saved，以及空模具fixture而中斷；已修正測試假設，僅重跑受影響項目，未隱藏舊日誌的exit 1。最終合併結果及逐項來源見[補驗總表](evidence/20261007-whole-module/review-supplement-summary.json)，日誌：[第一批](evidence/20261007-whole-module/review-supplement-legacy.log)、[C及製程](evidence/20261007-whole-module/review-supplement-remaining.log)、[模具](evidence/20261007-whole-module/review-supplement-tooling.log)、[AB records](evidence/20261007-whole-module/review-supplement-records.log)。
- BOM無文稿入口及處理路徑已加入下表。全部主資料完整UI鏈、實體手機、完整媒體及發送／播放仍未測；不宣稱「全部模組UI皆通過」。本輪handler補驗不等於新一輪瀏覽器操作。

## 根因與修正

- AB 原逐群組批次可部分成功，改為 moduleDraft：全部 A/B 群組一次手動保存、單一固定案件、同次 CAS 整份處理。保留群組版本及歷史；舊待審列衝突、不代撤回；無效成員整案不寫入。
- FQC ADMIN-only、一般員工模組權限與前端 view:data 判斷不一致。編輯／保存／送審／撤回依模組存取權，ADMIN 跨帳號處理；核准另查既有權限，自審明確勾選及留紀錄。缺資料、no-change 改待補，非法引用／停用帳號／CAS／generation／待審鎖保留。
- FQC／IQC／檢具原生 prompt 不支援內建瀏覽器，改頁內理由與自審確認；補版本台撤回。修正舊案件重投影造成 superseded 版本錯回 approved、主資料 active 基底錯配。
- AB/C 成功訊息被品質總覽誤判讀取失敗，成功改 toast。初次未授權不誤報權限被撤銷，真正權限下降仍提示。Tooling 只改共享權限及手動保存政策，保留並行介面。
- 日常開發服務曾被並行文件鎖觸發 Vite EBUSY；排除 docs 監看，沿原服務／原資料位置重啟。

## 逐模組验收

後端矩陣使用隔離 fixture 的 ADMIN、ADMIN 2、employee。不同模組獨立；線別工段歸屬主資料文稿。例行報告資料庫於本輪開始時無可送審文稿；並行新增 Routine FQC 不列為本輪通過。

| 模組 | 後端權限／工作流 | 3020 實際 UI | 日常 3000 |
| --- | --- | --- | --- |
| AB 主資料／線別工段 | PASS | 本輪未逐頁操作 | 保留原資料 |
| C 主資料 | PASS | 本輪未逐頁操作 | PASS，V4 單一測試產品清除 |
| 流程主資料 | PASS | 本輪未逐頁操作 | 保留原資料 |
| BOM 資料 | 不適用：沒有文稿或審核案件 | 已核對入口程式，未操作匯入 | 本輪未改資料 |
| 製程編輯平台 | PASS | PASS，A/B/C 分配與整份 Save | PASS，原分配未改、核准來源可讀 |
| FQC | PASS | PASS，完整鏈與跨類別保存 | 原資料不變 |
| IQC | PASS | PASS，完整鏈 | 原資料不變 |
| 檢具與測試設備 | PASS | PASS，完整鏈 | 原資料不變 |
| IPQC-AB | PASS | PASS，員工送整份、ADMIN 2 核准全部24群組 | PASS，24群組／337有效項目 |
| IPQC-C | PASS | PASS，來源／分配、窄版中越文 | PASS，V8／861有效項目 |
| 模具設備 | PASS，政策定向 | 未測，保留並行工作 | 本輪未改業務資料 |

FQC／IQC／檢具實際鏈：修改 → 套用 → 手動保存 → 重整 → 送審 → 版本台撤回 → 再保存送審 → 明確自審 → 核准 → 重整。FQC V16撤回／V18核准；IQC V14撤回／V16核准；檢具 V7撤回／V9核准。[UI/API紀錄](evidence/20261007-whole-module/ui-api-progress.json)。

BOM 盤點依據：`public/process/master-data.js` 的 `selectDataTab()` 對 BOM 呼叫 `bomTable()`，不掛主資料文稿；`bom-search.js` 只有查詢／樹狀展開，`bom-excel.js` 的工具列只有匯入／匯出。匯入寫入 `bomOverrides`，由 `shared-state.js` 同步及 `app/api/shared-state/route.ts` 檢查 `master.import`，沒有固定 Save／Submit／案件模型。本次沒有改寫或驗收 BOM 匯入；它不是漏掉的文稿案件。AB/C/PROCESS 主資料完整 UI 鏈仍是未測，API 通過不等同全部 UI 通過。

3020 A/B/C 各一個真實類別：A BORUAXE1021/A-CUT、B PHAODIEN/B-PHAO、C INOX/C-CHI。A/B 共用核准案 1382df0a-b9a4-4afb-a410-35c85b64cf02；C 沿用有效 V24。整份 Save cdd43d09-79fe-4251-bec8-f6bbf3f8592b 包含8工作區。三線重開保留勾選，引用在頻率下顯示草稿已儲存；其他方塊同項目占用會禁止。[分配API](evidence/20261007-whole-module/abc-assignment-api.json)、[最終快照](evidence/20261007-whole-module/3020-final-ui-api.json)。

- PASS：[AB legacy 11項](evidence/20261007-whole-module/ab-atomic-final.log)、[records-v1 11項](evidence/20261007-whole-module/ab-records-final.log)，含整案失敗不寫入、固定快照、CAS、歷史不展開。
- PASS：[9模組權限](evidence/20261007-whole-module/permissions-extended-fixed.log)及[模具修正後](evidence/20261007-whole-module/tooling-permissions-fixed.log)。前檔尾端 Tooling 403 是修正前問題，以後檔為其最終結果。含兩ADMIN、員工、跨帳號、自審、停用、待審鎖、失敗重試。
- PASS：[共用核心14項](evidence/20261007-whole-module/kernel-final.log)、[權限通知](evidence/20261007-whole-module/permission-notices.log)。
- PASS：最新 tsc --noEmit，[退出狀態](evidence/20261007-whole-module/typecheck-status.json)。先前並行 Routine FQC 型別問題在最新重跑已消失。
- FAIL：28個程式／測試檔案完整 oxlint 有25筆既存問題。[日誌](evidence/20261007-whole-module/lint-final.log)、[逐條基線比對](evidence/20261007-whole-module/lint-baseline-final.json)確認25筆所在原碼均已存在任務開始版本；不宣稱 lint 全通過。
- 未測：實體手機、一般媒體全部載入、發送／播放端到端、全部主資料分頁完整UI鏈、並行 Routine FQC。390×844 是模擬尺寸。

## 日常 3000 已完成的真實核准

使用使用者指定既有真實身分 demo-admin / Demo Admin，正常 Save／Submit／版本台核准，明確自審勾選及理由留存。沒有直接改 status、沒有匯入3020整庫或測試案件。

| 日常案件 | 固定ID | 結果 |
| --- | --- | --- |
| IPQC-AB 整份V2（群組各自續號，BORUAXE1021為V3） | 482c0eed-1e20-4031-9b2d-f25b044d951a | 24群組／337有效項目，同案全部核准 |
| IPQC-C V8 | 9201033e-98f4-476c-aa1e-55c6b0a0a008 | 861有效項目核准 |
| C主資料V4 | 52e4b996-85be-489a-9a46-d993ed990912 | 僅移除測試產品11111111，保留140產品 |

C首次送V6後收到測試清理授權，只撤回本輪自己送的V6，清理後重新保存送V8，未處理他人案件。AB因其他人新增帳號，兩次global revision變更被 MODULE_CHANGED_RECONFIRM 擋下，重讀並重新確認原已保存快照後成功，沒有覆寫他人內容。

使用者明確授權清除「111…」舊測試資料後，正常API移除 AB CUT-L4/L5/L8 三個錯誤碼及L4-01子項；真實CUT-L1-01/L1-02/L3-01只去除產品1111111；C-11111111-PREP-L1及子項；主資料產品11111111。歷史與已軟刪除紀錄保留，未把其他數字名稱猜成同一測試資料。[清理操作](evidence/20261007-whole-module/daily-cleanup-api.jsonl)、[唯一產品差異](evidence/20261007-whole-module/daily-master-c-diff.jpg)。

revision447唯讀比對：[最終驗證](evidence/20261007-whole-module/daily-final-verification.json)、[驗證程式](evidence/20261007-whole-module/verify-daily.cjs)、[actor/理由/版本紀錄](evidence/20261007-whole-module/daily-after.json)。原製程、分配、其他品質模組及AB/PROCESS主資料不變。platformUsers有本任務未發起的並行新增帳號，原三帳號不變；新帳號保留。daily-after.json的 unrelatedKeysUnchanged:false 正是此差異，沒有掩蓋成全部不變。

A/B/C來源API皆200、sourceVersionId符合日常有效案。A彈窗顯示7項來源；B原流程尚無產品，僅在未套用彈窗暫選101CTP007查到3項，沒有Apply/Save；C/INOX 3060104/C-CHI回4項。完整分配寫入鏈在3020驗證；日常核准標準並保留原分配。

沿原啟動命令 node --import ./scripts/local-network-preload.mjs ./scripts/local-server.mjs --port 3000，原 .wrangler/state D1/R2。HTTP程式SHA與checkout一致；AB/C另開新頁後正式版仍保留。舊驗收分頁曾出現瀏覽器控制逾時，新分頁可正常載入；不將逾時操作計為通過。

## 實際截圖及修改檔案

| 主題 | 前／操作中 | 後／重開 |
| --- | --- | --- |
| 介面 | [開始](evidence/20261007-whole-module/ui-before.jpg) | [AB整份核准](evidence/20261007-whole-module/ab-whole-approved.jpg) |
| FQC | [跨類別保存](evidence/20261007-whole-module/fqc-saved.jpg) | [明確自審](evidence/20261007-whole-module/fqc-self-review.jpg) |
| IQC | [自審](evidence/20261007-whole-module/iqc-self-review.jpg) | [核准重整](evidence/20261007-whole-module/iqc-approved-reload.jpg) |
| 檢具 | [修改前](evidence/20261007-whole-module/equipment-before.jpg) | [核准重整](evidence/20261007-whole-module/equipment-approved-reload.jpg) |
| A | [來源](evidence/20261007-whole-module/a-choice.jpg)、[唯一占用](evidence/20261007-whole-module/a-unique-occupied.jpg) | [重開](evidence/20261007-whole-module/a-reopen.jpg)、[引用](evidence/20261007-whole-module/a-backref.jpg) |
| B | [來源](evidence/20261007-whole-module/b-choice.jpg) | [重開](evidence/20261007-whole-module/b-reopen.jpg)、[引用](evidence/20261007-whole-module/b-backref.jpg) |
| C | [來源](evidence/20261007-whole-module/c-choice.jpg) | [窄版](evidence/20261007-whole-module/c-mobile-reopen.jpg)、[越文](evidence/20261007-whole-module/c-mobile-vi.jpg)、[引用](evidence/20261007-whole-module/c-backref.jpg) |
| 日常C | [原版](evidence/20261007-whole-module/daily-c-before.jpg)、[自審](evidence/20261007-whole-module/daily-c-self-review.jpg) | [核准](evidence/20261007-whole-module/daily-c-approved.jpg)、[重開](evidence/20261007-whole-module/daily-c-reopen.jpg) |
| 日常AB | [衝突保護](evidence/20261007-whole-module/daily-ab-concurrency.jpg)、[自審](evidence/20261007-whole-module/daily-ab-self-review.jpg) | [核准](evidence/20261007-whole-module/daily-ab-approved.jpg)、[重開](evidence/20261007-whole-module/daily-ab-reopen.jpg) |
| 日常來源 | [A](evidence/20261007-whole-module/daily-a-source.jpg) | [B](evidence/20261007-whole-module/daily-b-source.jpg) |

必要證據已存專案內，無需讀取專案外連結。[修改清單/SHA](evidence/20261007-whole-module/changed-files.json)、[task-vs-start.patch](evidence/20261007-whole-module/task-vs-start.patch)。主要為AB module/shared/workflow、master/fqc/process/tooling權限、前端文稿與審核、定向測試及vite監看。共享檔案可能含並行修改，禁止整檔回復patch。

文件更新：WHOLE_MODULE_DRAFT、SHARED_DRAFT、TOOLING政策段、規格入口、AI_CONTEXT DATA_MODEL/models/V3/modules/V3/modules/QUALITY、CHANGELOG、HANDOFF。資料模型僅AB根控制增加相容moduleDraft；無schema migration、無全域儲存架構更換。

## 備份與回復

私有根：<USERPROFILE>/.codex\visualizations\2026\10\06\01a10f85-7632-7cb0-b39a-8257d8cdf705\whole-module-20261007。daily-before/保存revision409、D1（read-only VACUUM INTO整合WAL）、完整R2/媒體、權限/session/設定及canonical-base。1274檔案雜湊再次全部核對，原1267 R2 blob未改寫。機密與完整原資料留在私有備份。[原備份證據](evidence/20261007-whole-module/backup-verification.json)、[再核對](evidence/20261007-whole-module/daily-final-verification.json)。

start/、baseline.json、start.patch保全原未提交程式；tooling-policy-before/保全政策調整前並行模具；3020最新checkpoint為3020-ui-checkpoint-resume.json、revision222，不得使用舊checkpoint覆蓋。12:34 收尾探測時3020已無listener（本輪未執行停止），未以較舊快照擅自重啟；上述3020驗收是停止前完成的實際結果。3000原服務仍在執行。

回復優先採固定歷史還原成新草稿，核對差異後手動Save/Submit/正常核准。若整庫災難回復，依[備份程序](../../BACKUP_AND_RESTORE.zh-TW.md)先確認無寫入、停止原3000、另保全最新D1/R2/session/WAL，再核對manifest及並行差異，回復同一.wrangler/state並用原命令啟動。未演練破壞性日常還原；已有並行新增帳號，不可直接用revision409覆蓋最新整庫。

沒有commit/push/Git merge/遠端部署，本輪未操作3030或新開PORT。日常核准與3020隔離核准分開記錄。12:43交付訊息後的審查曾中斷，舊分頁仍錯顯思考中；找回同一對話後已正常接續，取得第6輪NEEDS_CHANGES及第7輪補驗DONE。原未送草稿曾由私有備份whole-module-chat-draft-20261007.txt恢復；其後使用者已自行送出該草稿形成新UI計畫，不再重複填回或重送。並行Routine FQC的預設對話／checkpoint未改。新UI修復另列未完成，不混入本輪補验結果。
