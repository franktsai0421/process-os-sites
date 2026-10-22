# 3020 編輯台首屏載入修正（2026-10-08）

Task：依最新 annotation 修正「從入口進入後方塊很慢出現」，使用者授權一次本機 commit；不 push、merge、部署。以目前 checkout `codex/ipqc-ab-local` / `ba6c7a25b211f83df9bbe7caf82bf646737bdbca` 及全部既有未提交工作為基礎。

## 根因及變更

1. `process-authoring-v3.load` 在收到共用工作內容後，仍 await 待補检查及逐頁舊版本清單，才 render。慢速附加讀取延長了畫布空白時間。
2. `app.js` 初次 render 早於最後註冊的畫布模組；bootstrap 完成腳本後原本直接揭開畫面，可能留下舊的空白畫布，等待後續讀取才改用新畫布。
3. 現在主資料讀取成功即 adopt / render，附加資料背景載入；歷史清單去重且完整取得才發布。失敗時保留歷史查閱入口，不把附加讀取失敗當作畫布寫入失敗。
4. bootstrap 等待 `readyForEditor` 再揭開畫面；已有本次主資料時不重複讀取。主資料失敗顯示原有重試畫面，不顯示假的空白可編輯畫布。新舊模組啟動順序保持相容。
5. 保留現有本機編輯及手勢保護，延遲回應核對目前帳號；待補檢查仍核對 generation/revision。未改權限、送審鎖、CAS、排隊、checkpoint 或寫入 API。

Changed：`public/process/bootstrap.js`、`public/process/process-authoring-v3.js`、`public/process/index.html` 的兩個資源版本、`scripts/test-process-editor-startup.cjs`，以及本報告及索引文件。提交採選擇性片段，未把並行 FQC／模具與先前未提交畫布功能整批納入。

## 定向驗證

| 項目 | 結果 | 證據界線 |
|---|---|---|
| 舊版延遲問題重現 | PASS | 備份版執行新回歸測試，於「主資料已到但仍未完成 load」斷言失敗；預期失敗保存原始輸出 |
| 主資料先畫、附加讀取未完成不阻擋 | PASS | 生產 adapter VM 測試，附加 Promise 故意保持未完成 |
| 歷史去重、附加失敗可繼續使用 | PASS | 同上 |
| 最後模組註冊後重新呈現、失敗不揭開空畫布 | PASS | 生產 bootstrap + adapter VM，共 7 項 |
| 輪詢、手勢中延遲回應、本機未同步內容保留 | PASS | 既有 polling 測試 5 項 |
| 套用、細粒度範圍、CAS失敗保留輸入 | PASS | 既有 sync-feedback 測試 6 項；不寫3020 |
| 定向 lint | PASS | 兩個 runtime JS 與新增測試；先修正 CJS harness 的檔案級註解 |
| 3020 真實桌機中文 | PASS | 獨立分頁唯讀載入原 BORUAXE1021，A-CUT 8 個方塊，無 legacy stage-empty |
| 3020 合成資料越文 | PASS | 同服務 localhost 隔離副本，EDITOR ACCEPTANCE A-CUT 10 個方塊，完整流程及全螢幕正常 |
| 390×844 模擬 | BLOCKED | 工具宣告成功但 DOM width 仍1265；不把無效尺寸截圖當手機驗收 |
| 實體手機／P95／瀏覽器網路trace | NOT_RUN | 本次無此證據 |
| 真實資料送審核准／儲存 | NOT_RUN | 此為讀取修正，避免代替使用者改資料 |
| ChatGPT 獨立連線驗證 | BLOCKED | 既有服務仍運行，但 workspace_info 回內部錯誤；尚未更換共享指標 |

## 時間與原始證據

原3020一次實測，從頁面導航起：共用資料完成1256ms、腳本完成1521ms、authoritative editor揭開4416ms。這是單次啟動觀察，不是P95或前後改善百分比。合成頁第一輪7914ms，時機／資料不同，不直接比較。前後可重現改善由延遲Promise回歸證明。HTML診斷屬性 `data-process-shared-ready-ms`、`data-process-assets-ready-ms`、`data-process-ready-ms` 可供後續分段追查；不包含寫入或checkpoint時間。

證據根目錄：`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/editor-startup-20261008/`。

- `regression-before.log`、`startup.log`、`poll.log`、`sync-feedback.log`、`lint.log`：可讀原始輸出。
- `desktop-zh.png`：原畫布中文；`desktop-vi.png`：合成畫布越文。`mobile-vi.png` 尺寸未生效，不能作為手機PASS證據。
- `primary-before.json` / `primary-after.json`、`synthetic-before.json` / `synthetic-after.json` 及兩份 `*-preservation.json`：逐鍵SHA256比對。
- `before/`：修改前源碼與文件保全；`git-before.txt`：起始dirty tree。

## 保全、回復及剩餘事項

原資料 revision332→332、合成資料41→41，兩份資料各13鍵完全相同。沒有重啟服務、替換媒體或寫入業務記錄。資料模型／schema影響：無。上方版本／送審、同步畫布／手動Save語意保持。

回復採本次commit反向片段，或依 `before/` 逐段合併；不可整份覆蓋仍有並行修改的文件，也不可用舊checkpoint還原整庫。備份不是授權覆寫新資料。

尚待完成指定「規劃問題回報小幫手」的安全連線確認；不能把有開啟頁面或既有服務running視為連接成功。不重建其他任務connector、不重送IPQC舊任務。其他既有未提交改動保留在工作目錄，這次局部commit不是整個3020的發布或資料備份。
