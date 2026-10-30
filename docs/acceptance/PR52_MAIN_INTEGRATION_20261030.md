# PR #52 與 main 的獨立本地整合

來源：`2203d5869ae14a756dbab18959689bd855936a5b`（tree `93d0ac736a5eee442c3323d569beab115029055c`）。
主線：`11151dfdc90a2a1920f694da0624d9ff50c76311`（tree `4ee8d6fea70f75070d39cd94f2467524277a3588`）。
本候選保留來源歷史及 main 新權限／還原／流程／照片實作，原 PR/base 不變，沒有 push、merge 或部署。

## 可獨立交付範圍與未啟用設計

保留一般線別／工段操作、C scope 輪詢、穩定目標表單重試、引用保護及權限遮蔽、子工段防連鎖刪除、legacy code 未修改相容、送審固定 savedId、既有 records-v1 serializeModel 優化。新版 main 權限矩陣已完整說明線別入口與 AB/C 權限，保留該矩陣，沒有覆回來源舊版。

正常 writer 使用原 encodeValues，未接入新 encodeMasterWorkflowValues；預設沒有新轉換開關或 query/body 啟用入口。原 helper、initializeRecordValues、legacySources 設計及隔離研究測試保留供後續決策；原 test-master-record-adoption.cjs 假定啟用首次轉換，屬待啟用設計的歷史驗證，不是本候選生產入口驗收。新 test-master-legacy-format-retention.cjs 驗證真正的 Begin/Apply/Save 沒有首次轉換。

原 legacy inline ≥512KiB 仍可依既有 encodeValues 轉成 whole-R2 快照；這不是 records-v1。既有 records-v1 解碼與更新保留，不把已轉換資料倒回 legacy。未操作任何真實資料。Frank 已同意本次先交一般修復、不啟用首次轉換；首次轉換仍需獨立批准；封存原 value 不等於完整 DB/R2 一鍵還原，首次成本與完整還原未驗證。原 600 產品速度包含轉換，不能當作此次拆分版速度。

## 整合補修

歷史還原入口改用明確 history/edit/restore，保留後端 create/delete effects。確認送審後核對 owner/epoch/delivery/generation/savedId。舊線別沒有 ID、後續加上穩定 ID 時按原 code 判斷是否保留，避免誤報 LINE_HAS_STAGES；原有 ID 被替換仍依 ID 保護。

舊回歸 fixture 的 admin 補上明確 ab.restore；其他人仍拒還原。stage-link 測試兩個既有欄位 set 補固定原值 guard，不放寬產品驗證或重新讀取 stale 命令。來源瀏覽器權限說明檢查改指 main 現行矩陣。

## 相依與交付順序

此候選獨立基於目前 main，不包含 #51。#51/#52 共同的 master API/workflow、前端 bridge/UI/index/version UI 必須語意合併，不能用整檔覆蓋。建議先交 #51，再以其已驗證內容更新 #52 的共同部分；不得在未檢查共同版本前宣稱兩個獨立 PASS 等於共同候選 PASS。全站離頁新工程與多人草稿規劃尚未納入。畫布位置/連線保持手動同步界線。

驗證以本次候選 SHA/tree 與實際日誌為準。CI、真站、真資料、跨機、實體手機與 OS IME 未執行。單一雲端 worktree 合成 fixture 通過不等於網站發布或真實速度達標。
