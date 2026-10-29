# 模具設備 — 使用者流程的隔離覆蓋

2026-10-28；未發布。此頁只指 `quality-mold-equipment` / `tooling.js` / `/api/tooling/**`，不是「檢具與測試設備」。

交付基準重綁至 manager 的共同 lint 修正 local `205973a4`、tree `b2124089`（PR38 native `f41877a8` 同 tree，不是 main）。模具保留已審 `79e77a3a`（沿 `2d7279f`／`8660965`）的獨立流程、保留歷史方案與有限 UI 改善；不納入已否決 compact 原型或 MEMORY_HOLD 的 a3ab CPU 索引。

## 2026-10-28 14:36 UTC 已同意的收尾流程

使用者已同意保留歷史／刪除保護：兩個新器具完整修改、加入移轉後改測「停用」，未填原因必須拒絕，填原因後套用；另建**未核准、無引用、無移轉**的獨立器具測刪除。之後手動 Save → Submit → Return → 修改 → 再 Save → Resubmit → Approve，最後以正式版本及固定案件 GET 讀回。這取代「已移轉器具必須刪除」的舊測試步驟，不是放寬資料保護。

## 每一步實際驗證到哪裡

| 使用者步驟 | 隔離程式覆蓋 | 尚未驗收／限制 |
| --- | --- | --- |
| 進頁與每一步計時 | UI fixture 記錄 mount 時間與四器具每組控制、IQC、套用、移轉耗時；handler 記錄每次 GET/POST/照片 PUT/GET 的 ms、stage、狀態、synthetic target | 不是網站載入／網路耗時；無瀏覽器 |
| 等約 2 分鐘，Begin 不反覆灰掉；處理 abort | UI T1 虛擬 120 秒背景讀；T2–3、7–12、24、28–31 覆蓋逾時、GET-only 重入、權限／actor／delivery／ACK drift，未知不重 POST | shared 15 秒 timeout 未改；不宣稱已根治實站慢 I/O |
| 名稱／編號、類別／供應商與清除篩選 | UI T4 實際控制＋paired table 字串比較；IQC T6 與 paired picker | 非原生打字、IME／觸控驗收 |
| 類別「查看」 | T4 確認 readonly fieldset，未新增寫入 | 視覺排版未驗 |
| 修改兩既有器具，照片統一上傳、可放大 | T13 檢查單一上傳與原圖 dialog target；T32 兩既有＋兩新各上傳；handler 四次 PUT/GET 核對原始儲存 bytes | 沒有 native 檔案選擇器、照片解碼、清晰度／縮放實測 |
| 日期遺失互斥、位置／保管單位、啟停原因、不要封存操作 | T5、12、21、23、32；handler 驗日期錯配／空停用原因 422、legacy unrelated edit 可存，啟用不必填；封存操作 UI 缺席、原歷史欄位保留 | 不是刪除既有封存歷史 |
| IQC 搜尋／類別／供應商，加至少兩筆再移除一筆 | T6、32；handler 兩既有＋兩新均加入三筆、移除一筆；未知正式引用 422 | 正式 IQC 資料完全未改 |
| 移轉／更正、目的地／保管單位／頻率 | T21–22、32；handler 兩既有各移轉與已核准更正、兩新各新增移轉，週／月／季／半年欄位驗證；原核准移轉不改寫 | 新器具未有已核准移轉前不能更正，沒有捏造舊紀錄 |
| 套用；再新增兩器具重跑上列 | T32 四器具按實際 dialog handler 套用；actual handler 驗持久快照及有效位置 | synthetic DOM 不是 native click |
| 兩個新器具完成移轉後停用（新流程） | T32 兩筆 UI 空原因不得送出，填原因後成功；actual handler 兩筆空原因各 422，讀回仍啟用，再填原因停用成功，移轉保留 | 舊「已有移轉再刪」僅保留負測 422，不再是待決的正常流程步驟；無 cascade |
| 另建未核准、無引用／移轉的器具測刪除（新流程） | T33 實際 UI 兩次確認與 guarded remove payload；handler 先驗無核准／案件／IQC引用／移轉，再刪除 200 並核對正式版本不含該器具 | 獨立 fixture，只證明符合保護條件的刪除，不是刪已用器具 |
| 手動 Save→Submit→Return→修改→再 Save→Resubmit→Approve | actual handler 兩輪退回後都真正改內容並手動重存，savedId 更新；第二輪舊 savedId 重送 409，新 savedId 重送核准成功；editor/reviewer 分離 | 原生版本平台未驗，不把程式流程 PASS 當 native 100% |
| 正式版本／歷史讀回 | history list、4 個固定案件與對應 version GET、原基準 superseded 版本、最終 approved 版本皆核對 immutable snapshot、狀態、savedId／actor；R2 bytes hashes 與 D1 revision 讀前後不變 | 不還原／改寫歷史，不使用正式資料 |

## 本次速度改進的界線

1. 同一次器具／IQC 篩選只 normalize 查詢一次，原條件順序與搜尋文字拼接不變。
2. 位置計算直接逐筆掃描原移轉陣列，避免每次額外建立 filter 陣列；更正順序、首筆工具及 holder 驗證不變。沒有跨呼叫快取或全庫索引。
3. 同 fixture 的 exact output／counter 與交錯順序計時記在任務 evidence。不能把這些本地函式耗時當實站加速或 128 MB 安全證明。之前 checks 只縮短未用 DTO 引用跨 await 存活期，原 sampled max 並未降低；該限制仍在。

## 執行方式與 gate

- `node scripts/test-tooling-ui-request.mjs`：實際 tooling/shared transport，synthetic DOM/HTTP/clock ports。
- `node scripts/test-tooling-workflow-request.mjs`：實際授權 handler，SQLite `:memory:` / R2 Map、合成圖片、無 live 資料。
- `node scripts/test-tooling-checks-input.mjs`、`node scripts/test-tooling-checks-paired.mjs <flow-baseline-dir>`：projection／錯誤／revision／完整 ordered issues／I/O 與回應 metadata。
- `node scripts/test-tooling-filter-paired.mjs <exact-baseline-tooling.js>`：完整 source VM 執行，paired 字串、location、計數及本地計時；不是 resolver 或依賴替代。
- 舊 FINAL21 的共同 8 lint 已由 manager 另批修正；本模具交付重綁新基準，保留其 R1／import／Spinner／URL／unload／CI 檔。正常全 repo lint／type 與定向流程的 exact-pin 結果由任務 manifest 記錄；不把本地 PASS 當遠端 CI／發布通過。
- 獨立 review、最新共同基準整合、正式 CI 及尚缺的 native 驗收不得以 microbench 取代。瀏覽器取消仍有效；沒有 push／PR／merge／deploy。
