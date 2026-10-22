Current Sites derivative: see [HANDOFF](../HANDOFF.md) and [offline runtime fix](../docs/sites/PHASE_FOURTEEN_OFFLINE_RUNTIME_FIX.md). Commit deb0e90 has successful approved loopback and actual build. A deny-all callback replaces the crashing native outbound object only in offline probes; shared guard 3 and full native D1/R2/crypto 8 PASS. Compiled application development HTTP fixture 12 PASS with synthetic/nonpersistent accounts/data; final version/build receipts remain separately commit-pinned. No dependency/security/true credential/data/platform changes. Accepted phase-nine real R1 and E inherited ACL/no-sync decision remain unchanged. Business workflow specifications below are retained.

# PROCESS OS — 實作現況入口

狀態：Current checkout source。2026-10-05文件整理，只定向核對實作；本次未跑功能測試或查DB。分支／HEAD／未提交狀態見[HANDOFF](../HANDOFF.md)。已確認需求與實作差距見[正式規格](../docs/specs/current/README.md)。

系統連結核准產品／路線、BOM、製程編輯與審核、發送／播放及品質標準。React/Vinext外框與API，既有SPA在public/process；D1 DB的shared_state/state_backups保存狀態及備份，R2 STATE_ARCHIVE保存大型／immutable內容。未建立normalized product/process/quality SQL表。

2026-10-05本機整合：目前V3成果已建立檢查點，整合shared-state記憶體／儲存修復；保留共享草稿，不合入已淘汰PR #11個人草稿。定向隔離驗證及提交邊界見[HANDOFF](../HANDOFF.md)，未修改業務資料或部署。

| 影響範圍 | 按需現況文件 |
| --- | --- |
| 製程canvas、設備、SOP、版本、發送、播放／狀態 | [PROCESS](modules/PROCESS.md) |
| AB/C、路線／工段、PROCESS主資料、角色及主檔連動 | [MASTER_DATA](modules/MASTER_DATA.md) |
| FQC、IQC、IPQC-AB/C、品質設備、反向引用 | [QUALITY](modules/QUALITY.md) |
| V3共享草稿、固定案件、legacy／adoption及驗收邊界 | [V3](modules/V3.md) |
| Local runtime、登入、权限、媒體、備份與mobile限制 | [RUNTIME](modules/RUNTIME.md) |
| schema／JSON欄位／讀寫投影 | [DATA_MODEL](DATA_MODEL.md) |
| 網頁回報小幫手／案件／圖片權限／ZIP | [WEB_FEEDBACK](modules/WEB_FEEDBACK.md) |

品質標準workspace已存在；模具設備已接入共用草稿，現況與 3030 隔離驗收見 [TOOLING](models/TOOLING.md)。例行檢查的四入口及 FQC 計畫／報告／異常閉環現況見 [ROUTINE_FQC](models/ROUTINE_FQC.md)，3040 與日常 3000 驗收分開記於[本次報告](../docs/routine-fqc/20261007-acceptance.md)。例行 IQC／模具檢查／校準仍建置中；品質報告總覽與 FPY 仍是框架，不把 FQC 完成視為全部量測模組完成。

V3整體NOT_COMPLETE，Local前次有限採用與隔離PASS不等於所有scope啟用或正式部署。working／saved不代替effective；2026-10-06 共同待補、自審與無修改提醒政策依共享草稿規格；權限、鎖定與適用 BOM 互鎖仍保留。完整歷史證據見[CHANGELOG](CHANGELOG.md)，日常不預讀。

目前限制：legacy密碼尚未hash；沒有per-token revocation或normalized業務schema；native IME／實體手機鍵盤及容量尚未全面認證。不要從版本標記2026.09.15.7100推定此未提交checkout已發佈。
