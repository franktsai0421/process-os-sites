# 製程平台整合候選與完整需求矩陣

基底 main `9fbba823090f03da8385c8d92f5e59293d19d2f1`；分支 `codex/process-platform-integration-20261110`；[Draft PR #104](https://github.com/franktsai0421/process-os-sites/pull/104)。本輪已從計數擴充至畫布存取、離頁、衝突、歷史查看及主資料頁草稿相依。**程式候選不等於整體實站驗收完成，維持 Draft，不合併、不部署。**

## 來源與沿用界線

- 已合併：#77 原子 Save、#96 歷史 helper、#99 工段類型、#100 無固定輪詢。保留 main 成果；新需求只取必要增量。
- 舊測試站：使用者已說以前完成者不重做；缺少將所有20項綁到同一部署 SHA 的收據，因此不補造測試站 PASS。
- 已沿用：#101 `e2591c6` 計數；`ec5b2eb` 畫布群組衝突／RAM表單、`8074589` 同頁類別切換、`14caf33` 當前畫布 Save、`59027b1` 無提示離頁、`1a147d9` Canvas 歷史、`d4a5ef9` 回草稿 fresh 權限；#102 固定 `55d4672cb8004d0b01715714cbc91fbce6b22d2b` 的主資料頁 writer／權限與核准來源依賴。逐項抽取，沒有整包套用舊分支。
- 其他來源的精確 blob 與保全清單見 [branch inventory](process-platform-branch-inventory-20261110.json)。benchmark10檔、#99四檔與 main 相同，直接保留；preview 專用入口與 seed 不帶入。
- #101/#102 保持關閉且未合併，來源分支保留。#103 帳密工作不帶入；本輪 `user-access` 僅為模組送審與最終核准的必要政策投影，不改密碼／登入API。

## 完整20項核對

需求來源：[固定完整清單](https://github.com/franktsai0421/process-os-sites/blob/55d4672cb8004d0b01715714cbc91fbce6b22d2b/docs/acceptance/process-editor-complete-20261109.md)、[PROCESS_EDITOR](../specs/current/PROCESS_EDITOR.md) 與最新使用者指示。

| # | 需求 | 本輪狀態與驗證界線 |
| --- | --- | --- |
| 1 | 橫向工段、搜尋、縮放、全螢幕 | 沿用 main；原生桌面／手機待驗 |
| 2 | 新增、拖曳、平移、連線、高亮 | 沿用 main；新增衝突／刪除依賴回歸；手勢命中待驗 |
| 3 | 類型適用分頁及隱藏舊資料 | 保留 main/#99，不因隱藏刪資料；完整UI待驗 |
| 4 | 雙語卡片、文字、本方塊照片 | 保留原實作；合成表單與照片 guard 回歸，IME／實際照片待驗 |
| 5 | 連線、刪除影響、自動整理 | 納入刪除節點與新邊整組相依；合成競態通過，原生排列待驗 |
| 6 | 編輯視窗、跨分頁輸入、Apply/Save | 未送表單與 journal 為 RAM；明確 Save；晚到表單／離頁回歸通過 |
| 7 | BOM唯一性／跨工段 | 保留 main handler 與最終 Save驗證；不另改BOM資料模型；真實兩人流程待驗 |
| 8 | IPQC占用及機器來源 | 保留 main/已核准來源；新頁主檔只能引用正式工段；實站待驗 |
| 9 | 主內容先顯示、失敗不當空流程 | 保留 main；不把空scaffold當dirty；冷啟動與讀失敗實站待驗 |
| 10 | 空工段不誤判dirty | 新增實際controller回歸：系統補空不是修改；真增刪仍dirty；40秒原因未量測 |
| 11 | 切頁／線／工段直接放棄未存 | 已整合 silent checked departure；不提示、不自存；保留已送UNKNOWN及原結果查詢 |
| 12 | 一鍵Save當前畫布、保留其他已存 | 已整合 scope filter，節點／內容／連線同存；同頁類別保留其他journal；整份已存製程送審 |
| 13 | fresh比較、整組我的／對方 | 已整合群組選擇、無衝突保留、刪除／連線／同ID／選擇中peer改版；revision/CAS保留 |
| 14 | 取消輪詢、恢復、undo/redo | 保留#100；移除畫布多餘入口與未送恢復；必要權限fresh與已送結果查詢保留 |
| 15 | 類別defaultStages | 沿用 main 的核准類別優先與legacy fallback；明確空設定及C/GIA CONG實站待驗 |
| 16 | 核准工段類型與機器連動 | 保留#99；新增主資料頁來源核對，草稿工段不可冒充正式；新工段到類別全流程待驗 |
| 17 | 各頁草稿與權限分離 | 納入 AB.catalog／C.catalog／LINES API、UI、Save、import/export與CAS；只接受已存在可信page-v1；未啟用或遷移真資料 |
| 18 | 送審／撤回／核准分開 | 納入draft-review-policy：模組submit/withdraw與最終approval分離；return修正可退回本人案件、自己的最終核准仍受限制；可信政策標記未開 |
| 19 | 原頁核准版本只讀、回草稿 | Canvas及新AB/C/LINES已接selector、唯讀快照、actor/revision/late-display fence、回草稿fresh權限；PROCESS主資料後續重繪修復受原UNKNOWN32阻擋，其他頁不宣稱完成 |
| 20 | Save後計數與效能 | #101可見CanvasJournal投影計數；實際selector測試通過；真實進頁／切頁／Save/Submit效能未量測，>5秒優化、>10秒優先 |

## 相依與安全邊界

新主資料頁保留已核准catalog／topology各自來源、版本ID與不可變Save；LINES覆蓋AB/C兩個partition，catalog不擁有lines。舊pending不自動丟棄，未完成處理則拒絕切換。一般shared-state寫入不能初始化或覆寫managed layout；既有legacy operation receipt仍由原owner查詢。public state只投影已核准內容並先驗來源，隱藏新舊私有草稿。新頁寫入在R2後／CAS前再次檢查session，其他頁既有kernel行為保留。

`page-v1` 和draft review可信標記皆未設定；沒有schema、DB/R2、真人ACL、備份還原或部署操作。即使程式齊備，現有正式資料仍需獨立唯讀盤點、pending/UNKNOWN分類、保全及經授權切換，不能用query/env/一般POST啟用。例行FQC整頁與其歷史／照片UNKNOWN屬更廣跨模組相依，本輪不複製舊候選已知缺陷，也不宣稱13頁全生命周期完成。

## UNKNOWN操作仍未重送

原32-path `github.create_tree` base `d52e44319e6453a45bf9db8b0ff66d3f0c0ebec9`，expected `5005cba09d970cec70334d6bd540db1b599858d2`，約4789秒後中斷；讀回422／404不能證明沒執行，仍為UNKNOWN。未重試、拆分、換工具重送；舊243-path及設備拒絕也未重試。

路徑相交須區分：index只組合本次獨立模組／計數tag；version-draft-ui只有generic mount callback，Canvas及新主資料歷史使用獨立 `ProcessCanvasHistory`，沒有帶入原UNKNOWN32的PROCESS owner/prepareRender/app.js重繪修復。scripts-build僅驗本次main50→55實際bundle及單次載入，沒有重送原62檔fixture修復。role fixtures／舊proof修復未套用。新proof以遠端已確認#104前身tree `8eff928e54b9da8d483e8084fabc7ef1bdcea82c` 做精確逆向，main原pins及負向測試保留。

## 驗證與剩餘項目

本機當前畫布核心510案例PASS；核准歷史／頁權限／保存快照／腳本組合85案例PASS；主資料邊界、name Save、真正route SQLite/MapR2、UI、工具、public authority及review回歸逐腳本PASS。main原legacy橋接逐byte保留，199個既有橋接／保存／權限回歸全通過。測試組有重疊，不相加成覆蓋率。最終來源159及原收據/cache39案例合組198項PASS，lint及非增量TypeScript PASS。最終guarded build在真實本機8c6a88a6b0d71503b5f2247348224f1bb730a314回exit0，postbuild auth boundary PASS；後續只有文件收據修改，產品輸入相同。GitHub CI依遠端新HEAD另核對。另20個跨模組合成回歸及12個權限政策案例PASS。

依賴為相同lockfile的實體副本，沒有聲稱全新安裝。synthetic DOM不是原生瀏覽器；SQLite/R2為合成記憶體。擴大回歸誤選含原生Chromium的IPQC scope測試，9案例被既有socket/ptrace限制阻擋；該原生組停止，未換路重試。其餘20個合成案例另組全數通過，不能用它們抵銷原生未完成。

剩餘：PROCESS主資料UNKNOWN32修復、跨模組整頁相依、可信資料切換、原生桌面／實體iPhone／IME／兩人測試站、C/GIA CONG真實生命周期及效能。完整發布狀態仍NOT_READY。#104保持Draft，無合併部署。

本輪自動審查曾拒絕恢復舊pollMaster排程內容（操作未執行，原因為可能恢復固定輪詢）。採取安全替代：直接移除排程及所有啟動／重置呼叫，實際測試改為明確要求排程不存在；既有無輪詢inventory及固定前身負向來源pins保留，沒有重送被拒排程。

GitHub初次整合head 0d9ea8a16de70c20d7b1ae5a403f1b9a9cda7a6f 的專項CI（42831612397）及IPQC C通過，但Feedback／AB C／PROCESS因舊cache-tag fixture及Feedback入口多讀master control失敗。已對齊本次精確tag、讓非master入口不讀control，另修新頁切換URL；原失敗Feedback整組293及PROCESS整組338本機全通過，後者含AB C原失敗組。沒有刪除或跳過失敗斷言。最終遠端HEAD的CI仍需獨立讀回，不引用初次head的通過替代。

第二次head 96df92fd684122aab4633538eddd00c186974a58 的專項（42832781363）、Feedback（42832781206）及IPQC C（42832781031）通過；AB C／PROCESS進一步執行舊版Begin協定檢查時，原固定hash尚未組合新候選來源而失敗。只新增本候選→已確認#104前身的精確組合，保留原Begin所有hash／rules／歷史scope及負向斷言；舊protocol測試先驗現候選，再對原前身測原反例，沒有取用或重送UNKNOWN32既有proof修復。六個真正舊handler都以422拒絕新Begin且D1/R2零變動，另67項組合／原pins反例PASS。這批當時僅改測試；後續首次進頁修正與新build以最新紀錄為準。最終HEAD CI需另核對。

第三次head 22984fc8b3befd0bfddee1b15279cd4491a97a81 的專項、Feedback、IPQC C通過，但PROCESS後續真瀏覽器冷啟動／離頁組有6項在首次進editor就緒前逾時（run42833825421），不是環境socket拒絕。已在實際controller＋client＋signed handler的合成環境重現：先paint後read會過早掛歷史權限watcher，首次access回覆使尚未取得flow的history owner失效，導致AUTHORING_LOAD_REQUIRED。兩個中越文／inline-records新反例在修正前全FAIL，修正後全PASS；歷史元件改為當前flow與view/history權限就緒後才掛載，原撤權／唯讀fence不放寬。重跑畫布510、歷史政策bundle85、來源與cache198全部PASS；lint、非增量TypeScript及真實8c6a88a guarded build/postbuild auth PASS。native原逾時及斷言未修改；最終新HEAD需以原CI再驗。
