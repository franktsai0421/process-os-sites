# 2026-10-07 下班暫停／翌日登入續做

使用者明確要求明天開機後開啟程式與 Codex with ChatGPT，自動接續本對話。這是排程交接，功能尚未完成。

## 當前狀態

- checkout `<WORKSPACE>/中控系統`，分支 `codex/ipqc-ab-local`，HEAD `84278d837898f4e836ec003f7adb67ff38f785c8`。大量既有／並行未提交內容，不可 reset、checkout 舊版或整檔覆蓋。
- 本輪3020起始及下班快照 revision **258**；兩個產品仍在 PVC，尚未做業務寫入。C pendingId 為 null。明日以實際最新狀態重新核對。
- 本輪剛對 app.js 的三處試改（最大路線及隱藏工段同步範圍）已另存 `app-incomplete-at-pause.js`，再精確撤回這三處，避免尚未補齊 script 載入順序的半成品影響頁面。不得直接覆蓋整份 app.js；其他修改保留。
- c2c_9fa2 iteration12 INIT 已送出並確認可見；**先讀原 ChatGPT 的回覆，不重送 INIT**。上一輪9–11已DONE，本輪尚未驗收。
- ChatGPT：<https://chatgpt.com/g/g-p-6aa92cd426048191b704fdcc0ad78631-zhong-kong-xi-tong/c/6abcc68a-4e64-83ec-b2f9-f51cf34668c3>（製程平台IPQC建議，GPT-6 Astra）。沿用這個 task chat，不改其他任務保存的「設計例行檢查流程」指標／checkpoint。

## 明日工作

1. 按 codex-with-chatgpt 技能 doctor gate 恢復連接，沿用上述對話，讀 PLAN。若登入／同意畫面需要人處理，留下進度告知。
2. 將產品 **3060109 INOX 12MM** 與 **3060113 INOX 18MM** 從 C/PVC 移到 C/INOX，保留 stable ID 與 `C-CHI → C-INOX` 路徑；正常 Apply / Save / Submit / 明確自審核准，不改 raw status。保留他人草稿／待審。
3. AB/C 產品清單及例外清單移除「查看路線」按鈕；例外 inline 路徑保留。PVC 最大路線應隨產品移轉變成 `C-PREP → C-PVC → C-FINAL`。
4. 畫布只顯示核准的群組最大路線，算法與上方圖一致。路線變動只能隱藏舊工段；重新加入須顯示原流程、媒體、座標、連線、BOM、IPQC。檢查 app.js categoryStageCodes、selectedEditorOperation、synchronizeWorkspaceBomSelections、synchronizeWorkspaceProducts；master-data.js cleanEditorSet/reconcileEditorMaster 的 legacy prune；V3 保存全量 workspace。禁止單純把隱藏工段從持久資料刪除。
5. 定向測試正常保存／重開／核准、隱藏／恢復、合法引用、並行 CAS、待審鎖定與資料保全，桌面／iPhone viewport、中文／越文。更新規格／實作／HANDOFF，交 Astra 獨立複審。
6. 本輪不操作3000／3030，不新增埠，不提交／推送／合併／部署，不覆蓋模具或 FQC 並行工作。

## 關機保全與啟動

專案外保全根：`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/group-route-canvas-20261007/`，含 files-before、3020-before.json、app-incomplete-at-pause.js、啟動腳本與日誌。

翌日可恢復資料：`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/whole-module-20261007/3020-overnight-20261007.json`。同目錄 `isolated-photos` 保留原191個媒體檔；不要搬離此相對關係。3020服務是記憶體隔離 fixture，不能當作日常3000資料庫。

若3020不存在，以 repo 為 cwd，執行 `node scripts/ipqc-isolated-server.cjs --source <上述快照> --port 3020`，背景服務使用隱藏視窗。若已有3020，先核對其服務及最新 revision，不停止／覆蓋它，不再啟動第二個。

明日起一次性 Windows 登入啟動器 `resume-at-login.cjs` 只啟動原3020（未占用才啟動）及既有 Codex；寫 `login-started.json` 後不重複啟動。`--check` 為唯讀設定檢查，不啟動服務。完整重啟／實際登入驗證留待明天，今天未重启電腦。

Codex heartbeat **ipqc**「明日接續 IPQC 路線與畫布」每小時檢查，2026-10-08前安靜跳過；完成後暫停它。此排程依賴 Codex 運行及網路，不保證登入瞬間就開始。撤銷方式：在 Codex 暫停該排程，移除 Windows Startup 內本次專用 `Codex-IPQC-Resume-20261008.lnk`（僅此檔）；保留快照與既有服務。
