# 跨品質檢具替換：安全邊界候選，原子保存待決

分支 `fix/equipment-transfer-draft-20261105`，精確基準 #81 / `4b5cdfbc0838556ecc39125e92edb1611f010dcd`。Draft PR base 為 `feature/equipment-atomic-save-20261105`；depends on #81、#82 (`7355d8fba6abf7a396314cf4a55551b19b17b972`)、#77 (`0af6d57e912e5615250959c9e76210fecd55d96b`)。產品 PR 未納入 #82 的差異。未改例行 FQC、流程／機器主資料、品質消費端或通用核心。

## 實際行為與本輪修正

目前各模組確認的內容是「把選定檢具替換套用到共享 working」，再到目標頁明確 Save。FQC、IQC、IPQC C 各一個草稿，AB 為多個 scope。各 scope Apply 是原子操作，跨 scope 可能部分成功；不是全域交易。主檢具 Save 不會保存品質 control。

本輪只修呼叫方：

- 原無操作識別的目標 Begin 標記即使 GET 的草稿相符也不清除，原 bytes、actor、endpoint、scope、generation 與 intent 保留；不以 404 或目前 creator 冒認原操作。marker 必須成功持久化並讀回相同 bytes 才能發送 Begin。正常明確 ACK 才可清除此輪 marker；不明及錯誤仍阻擋 Apply。identified target Begin 完整接入仍未完成。
- 顯示確認與實際執行之間，選定目標的 workflow generation／active ID 改變時必須重新核對。原欄位、選取 ID、open ID、來源 actor／delivery 與伺服器 guards／CAS 都保留。
- 重開頁面重試部分失敗時，已完整符合目標的項目不再 Begin／Apply；FQC tool、IQC／AB inspectionMode 尚未符合仍要帶原 guards 修正。unknown transport 及舊 marker 的阻擋先於「已相同」，不能用現況跳過原未知結果。原 transport 的 confirmed-rejection barrier 不被清掉，也不清理別人的失敗操作；必要時重新載入頁面再明確確認。
- 仍保留重大替換／覆蓋確認、原照片／來源／其餘欄位、pending、各目標權限、saved／正式／歷史。沒有自動保存、送審或新介面。

## 最小待決選項

| 選項 | 保存與部分失敗 | 目標頁已有本機輸入 |
| --- | --- | --- |
| A：維持現況 | 選取＋確認只 Apply 至各共享 working，成功後由目標 Save；部分成功分列。 | 原輸入繼續保留；之後依原 guards 合併／衝突。仍非全部先本機一次保存。 |
| B：每個目標明確「替換並存取草稿」（建議） | 確認必須明列整個該目標 snapshot 與既有共享修改；各目標獨立成功／失敗。AB 保存是整個 module snapshot，不能把 scope Apply 稱為各 scope Save。需要 #82。 | 不會保存其他分頁的未送輸入，也不清除；下一次 Save 仍受原 guards，遇同欄衝突明示。 |
| C：四模組全部成功或都不動 | 需要新的跨模組交易／收據協調，非目前 API 能力。 | 仍需另定本機衝突／scope 範圍，不能以檢具 Save 代替。 |

尚無 B／C 的使用者決定，因此本輪保持 A。不能把原「移轉至草稿」的確認視為保存其他共享修改的授權。若要求嚴格「只保存選定欄位、不保存目標其他 working」，現有 Save 固定整個模組 snapshot，不能只換 action 名稱達成。

## 相依與後續最小範圍

未來若選 B：呼叫方 `public/process/routine-equipment.js` 要按三種 payload 分別接 FQC／IQC `save-local-v1`、C `localChanges`、AB module `save-local-v1`＋scopes。identified target Begin 需 `public/process/shared-draft-client.js` 支援 AB 正確 module/scope endpoint，`lib/versioned-shared-workflow.ts` 目前 #81 whitelist 不允許 AB begin-v1；不能整檔搬 #82 client 覆蓋 #81 的 equipment opt-in。品質目標本機表單與輪詢規則必須先驗證，若需改消費端另報最小檔案；本輪不改它們。

無 DB／R2 schema、migration、真實資料、帳號／權限、connector 或部署變更。只用 private fixture 合成資料。

## 驗證紀錄

本輪固定最終 HEAD、命令、PASS／FAIL／NOT_RUN 與完整 CI 以交付回覆／PR 為準。專項增量：78-case transfer-intent、四模組 actual handler／manual Save 16 組、compiled Worker＋SPA 四目標未送表單保全。舊 unknown fixture 改為獨立私有儲存，不刪 marker 讓其他生命週期測試繼續；原照片／saved／正式／歷史斷言保留。歷史 handler hash／offset 規則未改。

NOT_RUN：實站／測試站、真實業務資料與照片、實體手機／跨電腦／原生 IME、全域交易與新的保存語意。#82 新協定之整合驗收及獨立審查必須另明列，不能沿用上游成功代替本候選。
