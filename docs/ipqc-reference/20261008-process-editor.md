# 3020 製程編輯台實作與驗收（2026-10-08）

狀態：**EXECUTED；獨立複審待完成，並非全項驗收完成。** 59 項：**50 PASS、8 NOT_RUN、1 BLOCKED**。逐項結果見 [acceptance.csv](evidence/process-editor-20261008/acceptance.csv)。沒有以設計圖冒充驗收截圖。

## 基線與已有成果

- 工作區 `<WORKSPACE>/中控系統`；分支 `codex/ipqc-ab-local`；開始及結束 HEAD `ba6c7a25b211f83df9bbe7caf82bf646737bdbca`。本輪未 commit/push/merge/deploy。
- 依最新 ZIP SHA256 `7da665039b9cd0f54295ef8d9c46f04065f0b5b7674a9f7953edc70c91947e2a` 閱讀 README、最新文字、圖片更正、驗收表、執行規範、HTML 及五張圖；文字為準。
- 既有：核准最大路線、隱藏工段保留、整份共享草稿／手動 Save／固定 Submit、角色及 CAS、IPQC 來源與唯一分配。以上重用，沒有整套重寫。
- 本輪補足：單工段畫布、卡片摘要與互動、2/6/7 分頁、機器與作業頁、BOM 合併選取及後端全工段保護、正交布局、復原、明確刪除。停止渲染時隱性補 BOM 分配。
- 原上方 editor HTML 截到 `.editor-workspace` 前保留，原儲存送審 handler 沿用。V3 模式才启用新版；舊封存查看仍保留相容入口。

## 實作

- `process-editor.js/css`：工段橫向切換、搜尋、視角保留、320px可讀卡片；基本設定預設頁，2/6/7 頁，分頁輸入獨立於原資料。內容/照片/標題/刪除事件分開。只有共用作業照片入畫布，產品補充不取代共用。支援中越文切換。
- `editor-graph.js`：以 DOM 卡片尺寸分層排列與正交避障，不改 nextIds；重複整理穩定、位置 guard 的復原；單節點拖動或標題方向鍵局部防重疊。端點方向、多入口/單出口、循環等受前後端約束。
- `process-editor-integrity.ts`：最終 working 內容核對產品自己的 BOM 來源、跨所有 workspace/隱藏工段唯一占用、來源重複碼、機器類型及核准同工段來源、連線合法性。既有非法關聯列影響，不靜默清理；新非法關聯 409。
- BOM取消產品先改 modal draft，Apply才釋放；取消不變，再加入不繼承。沒有「恢復 BOM」入口，不寫後台 BOM 或用量。
- AB IPQC 重用既有候選來源及唯一占用；C 編輯頁只有查詢開關，原 C 分配唯讀保留。未新增下游播放路由。
- Apply 使用原 V3 patch/CAS，加整個方塊依賴 guard 防同節點覆盖；手動Save/待審鎖/自審确认不繞過。缺起終點/無產品/待補仍為提醒。

## 實際驗證

[原始輸出索引](evidence/process-editor-20261008/raw-output-index.json) 含 SHA256、檔案時間與 exit code；原始文字在同目錄。

| 命令/範圍 | 結果 |
| --- | --- |
| `node scripts/test-process-editor-geometry.cjs` | PASS：5/10/15/20 節點，0重疊、0穿卡、0blocked；此分支圖交叉及共線0；布局穩定、2/6/7分頁 |
| `node scripts/test-process-editor-integrity.cjs` | PASS：正常handler、BOM偽造/跨工段/race、產品釋放/重加、非法線、不同節點協作/同節點guard、Save/Submit/鎖定/撤回、來源改動待確認 |
| `node scripts/test-process-editor-legacy.cjs` | PASS：機器來源/類型、來源重複/無BOM拒絕、旧非法及重複關聯保留 |
| `node scripts/test-process-editor-ab.cjs` | PASS：既有核准AB4候選，首次分配200、第二節點409 |
| `node scripts/test-process-editor-review.cjs` | PASS：有待補正常送審；員工核准403、自審未確認409、明確確認及待補確認後核准200、歷史與固定內容一致 |
| TypeScript `tsc --noEmit`、受影響 JS `node --check`、定向 `git diff --check` | PASS；未重新跑無關全站功能套件 |
| 真實瀏覽器 localhost:3020 | [結構化實測紀錄](evidence/process-editor-20261008/ui-observations.json)：20卡20線，寬320高257–612、0重疊/穿卡；Save重開、衝突保留、共同BOM/半選/占用、機器重用、刪除、相簿、全螢幕、中越文 |

所有 mutation 驗收使用專用合成副本或 SQLite 記憶體 handler。UI 20節點全圖fit為使用者明確視角操作；預設及100%保持大字，未縮字硬塞。兩次方向鍵只改pe-1（y80→100→120），其餘19不變；整理復原逐ID差異0。產品補充填寫後切共用仍保留原共用文字，放棄不寫入。

實際UI截圖曾顯示1366×768 BOM/共用、1920×1080機器/BOM/全螢幕及390×844。**CUA圖像存檔返回EPERM，EV02 BLOCKED**；沒有可讀截圖檔，不宣稱已歸檔。DOM代理不能可靠返回indeterminate，半選以實際畫面minus及1/2確認。早期錯誤與續跑限制见 [repair-history](evidence/process-editor-20261008/repair-history.md)。

## 資料、媒體、服務與回復

[最終逐鍵比較](evidence/process-editor-20261008/final-preservation.json)：原3020 **262→262、13鍵相同、changedKeys=[]**，含作者平台、主資料、IPQC、其他品質模組及媒體引用。未新增原業務送審/核准/移轉、未回寫3000；舊3060109/3060113移轉成果未重做。

原3020是 `scripts/ipqc-isolated-server.cjs` 記憶體fixture服務，原始資料/登入來源沿用既有 `ipqc-assignment-fixture.cjs` 合成session；不是日常帳號。實測及程式更新只重啟原3020，PID由12792經10364更新為20744，重啟前核對兩份最新revision無變更。未操作3000/3030/其他port。

最後原資料 source：
`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/whole-module-20261007/3020-editor-final-mode-20261008.json`。
媒體：同目錄既有 `isolated-photos/`（191檔），未改寫；原媒體引用逐鍵相同。

原網址 `http://127.0.0.1:3020/process/?view=editor&system=process`。
合成驗收 `http://localhost:3020/process/?view=editor&system=process`，只有明確 `--editor-fixture` 時依Host區分同埠記憶體資料，頂部有不同標示；不額外開3021。這是隔離測試伺服器功能，非正式環境存取控制。

專案外保全根目錄：`<USERPROFILE>/.codex/visualizations/2026/10/08/process-editor-3020/`。
- `before/`：修改前檔案；`baseline.json`/`git-status-before.txt`：基線。
- `3020-before.json`、`primary-final-before-reload.json`：原revision262完整快照，含私人資料，**不commit、不貼到ChatGPT**。
- `synthetic-final.json`：最新合成revision16；`editor-fixture.json` 是最初合成測試基線，不能拿来覆盖新的合成成果。
- `legacy-data-audit-final.json`：原資料待補/舊關聯影響；3個進站保留產品（其中一個保留C IPQC）；一個早期機器節點留有M-A-001/003/006，來源已失效；其既有mode=machine現正確保留七分頁，不再誤報非機器類型。未清理；應由使用者另行確認處理。

重啟3020時先GET兩Host的最新 `/fixture-checkpoint` 保全並檢查寫入已完成，沿原source媒體位置。只有原服務未运行才启动；目前服務已運行，**不要照抄重啟或用舊快照覆蓋**。若要回退程式，逐hunk比對本輪task.patch與最新並行修改，用before取回相應區段；不要git reset/整檔覆蓋共享檔。資料無本輪原業務變動，無需回退業務資料；合成fixture單獨保留即可。

## 未測、阻礙與風險

8項NOT_RUN：本輪再次演練隱藏工段恢復(ST03)、後台新增類型UI(TY05)、實體指標拖曳誤觸(UI03)、媒體失敗重試(UI05)、歷史恢复刪除節點(DL02)、指標拖動/新增布局完整交互(LY05)、BOM載入失敗注入(BM12)、發送/播放/產品狀態完整下游鏈(RG01)。已通過子情境見CSV，不以部分測試冒稱整項PASS。真機iPhone未測。

未新增刪除專用undo；既有版本歷史保存路徑仍在，刪除不自動補接。舊非法關聯保留可能需要人工处理；部分恢復/下游未測與截圖未歸檔是本次交付的主要限制。布局驗證屬指定5/10/15/20分支案例，不宣稱所有任意密集DAG都無交叉。

## 交接與複審

本輪程式/文件/測試差異見 [task.patch](evidence/process-editor-20261008/task.patch)，只對本輪before作差（不是整個dirty HEAD diff）。新規格 [PROCESS_EDITOR](../specs/current/PROCESS_EDITOR.md)；現況/模型/CHANGELOG/HANDOFF已更新，無schema migration。

透過 codex-with-chatgpt 交回原「製程平台IPQC建議」GPT-6 Astra，使用獨立本輪TASK_ID，不改共享C2C session/checkpoint或重送舊iteration12 INIT。實作者狀態EXECUTED；獨立複審不能以自測代替。連接本機doctor全綠；ChatGPT實際讀取結果另記於下方，不因本機綠燈假稱複審已完成。

### Astra 實際複審結果

已在原對話以 GPT-6 Astra 送出本TASK iteration1 EXECUTED，Astra回覆 **STATE: BLOCKED**。workspace_info兩次、讀取本規格/報告、execution_output列表均回 `MCP -32603 Internal error`，沒有取得程式或證據，不能標REVIEW DONE，也未提出有證據的程式缺陷。記錄見 [review-status.json](evidence/process-editor-20261008/review-status.json)。本機doctor綠燈不代表ChatGPT端可讀；未變動連線地址、共享session/checkpoint或重複刪建connector。

### 最後原資料相容補驗

原3020展示時發現早期機器template已退休、只留穩定mode=machine。前後端加上該欄位fallback（明確editorType仍優先），不以名稱猜測。新增前後端回歸、幾何與最終tsc均exit0；原A-CUT-03實際開啟7頁後取消，無原資料Apply。最後原資料仍262/13鍵一致，舊machine type誤報0，失效source3條保留。詳見legacy-test-output及typecheck-final-output；相容修正前輸出另存before-mode-fix，不覆蓋歷史證據。此補修同樣尚未由Astra讀取審查。
