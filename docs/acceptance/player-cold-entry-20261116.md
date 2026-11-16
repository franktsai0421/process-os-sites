# #121：player 冷進入與 fixture 來源檢查

基準：`71585bd1515653333ee77c7f06ea8d180f898434`。同一 Draft PR 續修，
沒有合併、部署、實站存取或資料／帳號／權限變更；未混入 #125／#126。
本輪 `app/`、`lib/`、`public/` 產品 bytes 保持基準不變。

## 已確認與未確認

原 [Windows Local safety](https://github.com/franktsai0421/process-os-sites/actions/runs/43918766186/job/133480093842)
在 player / C-CUT 首次進入等候 60 秒失敗。server destination 已是 player，但原 DOM 診斷
讀不到 app state；沒有 HTTP>=400 或 pageerror。這只能定位到註冊／初始化尚未完成，
原日誌缺少腳本的 request／response／完成狀態，不能斷言 D1、R2、權限或某個 asset 是根因。

確認 fixture 有獨立的一致性缺陷：撤權把 shared_state revision 700 改到 701，cleanup
卻把同一 row 倒退回 700。即使只還原合成基準，也不能重新使用舊 CAS 識別。修正為
`revision=revision+1`，還原後一次讀回 revision=702 與完整原始 raw values，確認兩者才進入下個案例。
原撤權／DOM清除／禁止採用新資料、player 初次／重載／popstate、品質與 writer 全部原斷言保留。

新 source-bound SQLite 回歸執行實際 fixture 的 SQL：

| 情境 | revision 流程 | 舊 revision 的 CAS |
| --- | --- | --- |
| 真實 71585bd 舊 SQL | 700 → 701 → 700 | changes=1，重現 ABA 識別重用 |
| 本候選 SQL | 700 → 701 → 702 | changes=0，拒絕舊 CAS；raw values／updated_at 原樣保留 |
| 不同起點 | 1007 → 1008 → 1009 | changes=0；不是改成另一固定 revision |

**這證明 fixture revision 問題，不證明它是那一次 60 秒逾時的唯一成因。**
[獨立 Windows 原命令對照](https://github.com/franktsai0421/process-os-sites/actions/runs/43936664240)
在修正 revision 前的 0e3ed482（產品仍相同）已通過：C-CUT 首次 405ms、重載 326ms，
包括後續 writer Save／reload／原收據恢復／預期403拒絕。只可記「本次未重現」，
不是部署後速度、前後改善百分比或產品逾時已被證實修復。

## 最小變更與保護

- failure-only 觀察同源 script 的固定 pathname、resource type、HTTP status、finished／failed，
  與 boot／generation／bundle receipts。失敗當下複製 rows，避免 cleanup 後取消事件改寫證據。
  不捕捉 cookie、request headers、response body、query 或業務媒體。
- `77d7eaa0` 的診斷新增觸發原整份檔案 canonical guard；[FQC/IQC失敗](https://github.com/franktsai0421/process-os-sites/actions/runs/43932612962/job/133528738271)
  是 source composition 缺少，不是新產品錯誤。現以四段精確可逆 spans 還原 genuine71585bd，
  SHA-256 為 `eae6a7d3bab1775f2deb7ba36a55042ad25458b7310302bdcfe6bb6414c6a612`，
  再執行原歷史 canonical／LF／CRLF／所有舊負例，另加 changed／missing／duplicate 負例。
  沒有盲改 canonical、忽略新內容或刪除 assertions。
- AST 比對保留原90個 assertions 與27個 wait calls 的完整文字，只增一個 fixture還原確認。
  原60秒與10秒上限不變，沒有新增 retries、sleep、提前成功或省略後續案例。
- 獨立 Windows 診斷 workflow 先跑 SQL invariant 與原 role／delivery commands；
  原 Local safety YAML 與所有57步逐 bytes 保持71585bd，早期 job 不替代完整 CI。

## 驗證與邊界

- Node24.22.1／Linux Dot：source-bound ABA、原 URL observer、spinner、unload、模組隔離合計97 PASS。
  lint／非增量 TypeScript PASS；新 workflow YAML 解析與變更檔敏感掃描通過。
- 先前相同 runtime 的77d7：guarded build、bootstrap來源16項、compiled bootstrap8組、
  root／bundle12組及原第37步七個test入口 PASS，可按產品零diff重用。
- 0e3ed482：另外跑原37–57步的20條非browser原命令全過；兩條runtime相同PASS重用。
  一條 retired-entrypoint browser 命令因環境不可用未跑，必須由新head完整CI補足。
- 本機系統 Chromium156在啟動時關閉；鎖定151的下載不是有效 ZIP，沒有本機 browser PASS。
  額外手動 Miniflare ABA probe 未產出終局並停止（exit130），不列為D1驗收或產品根因證據。
  ABA 的可重現證據是上表的真正SQLite與genuine fixture SQL；新Windows browser本身會驗證D1讀回。
- 所有 fixtures／圖片／身分為隔離合成；不是 Frank／Diem 實站驗收或真實資料效能結果。
- 最終 SHA、完整CI各終局及原先未跑的 Local safety 尾段，以同一PR當前Checks與交付回覆為準；
  不用先前綠燈或單次獨立PASS代替。原player逾時仍保留未唯一歸因的限制。
