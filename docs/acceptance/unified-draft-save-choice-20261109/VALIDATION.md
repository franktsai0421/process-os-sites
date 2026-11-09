# 整合驗證紀錄

本頁保留原 `4a10e935` 交付紀錄；後續程式與最新界線見[同頁篩選追加候選](../draft-filter-followup-20261109/README.md)，原交付目錄未改。

功能／資產固定版為 `def45f9837a5f5afc1dfad1118a1292cdf4e0143`；已合併 GitHub main `d4ac309fe05c89288af226b52c18161865ccdcb8`（#98）。從 `ce824f2` 到後續來源證明、測試 fixture 與文件提交，`public/process`、`lib`、`app/api` 精確 bytes 不變；最終 HEAD／tree、檔案雜湊、命令及日誌由外部交付 manifest 綁定。以下計數有交疊，不相加作總覆蓋。

| 證據 | 結果／有效範圍 |
| --- | --- |
| 新正常 CI 的共同 core 命令 | 740/740 PASS；實際 controller／transport／signed handler，合成 DOM、SQLite／Map-R2 |
| 入口／明確更新／定期同步移除 | 127/127 PASS；主資料、品質、例行 FQC |
| #98 合併定向回歸 | 126/126 PASS，另 departure attribution 24/24 PASS；使用現行真正 wrapper，保留原收據／世代斷言 |
| 主資料 auth／replay／owner／pagehide | 90/90 PASS |
| quality callback owner 與吞掉重入錯誤 | 18/18 PASS；predicate 返回後仍重核原 owner／lease |
| 精確來源／具名逆轉／有界 witness | 獨立來源批 581/581 PASS；原 helper pins 與負控制保留。最終共同 HEAD 再驗由交付 manifest 記錄 |
| 非祖先 82c 來源負控制 | 來源後續批 456/456 PASS；只讀固定 ref/path 真 commit/tree/blob witness，不寫 `.git`、不略過原斷言 |
| 舊 poll fixtures | scoped-read 44 groups＋equipment 28；poll-wiring、permission 10、dirty flush、負控制 PASS。G1–G9 原安全 block 逐 byte 保留 |
| navigation／receipt／delivery | 101/101 PASS，僅更新退休 poll fixture 及已改的 cache 期待值 |
| 標準 lint／TypeScript／受保護 build | PASS；build 亦通過既有 post-build 私有 auth 保護。runtime 相同者可重用；最終程序 stamp 另由交付紀錄確認 |
| 來源容量 | inverse contract 無損 span 去重：6,229,813 → 2,190,499 bytes；43 current／266 inverse／13 added 證據均保留，非拆檔繞過門檻 |

整體安全掃描原樣保留兩個 finding：未變動的 `multiuser-iqc-local-recovery-composition` 與 `multiuser-local-recovery-helper` 測試故意放入 credential-pattern 負控制字串。已逐 byte 核對與目前 main 相同，沒有印出匹配值，也沒有放寬掃描規則；本次 main-relative changed-path 掃描無 finding。最終掃描輸出仍由 manifest 留存，不能宣稱普遍／完整歷史「絕無秘密」。

## 尚未完成／不宣稱通過

- 線別工段仍共用 AB/C 持久 scope；同頁 AB/C scope selector 仍保留舊 `discardLocal(previous)` 行為（`master-admin-ui.js`），Save／Submit 仍按所選舊 scope，並非一份完整獨立頁面草稿。此句描述原 4a 交付；[後續候選](../draft-filter-followup-20261109/README.md)已補同頁 RAM 保留，獨立持久 scope 仍未啟用。架構切換不因有全組 chooser 而算完成；需先採納主文件的所有權／ACL／pending／歷史／receipt 無損切換方案。
- 原生 Chromium 啟動因環境禁止 socket 而失敗，沒有繞過或重試；桌機／iPhone 版面、實體手機、真實 IME、跨電腦與正式員工資料流程未驗收。合成 DOM 與 compiled HTTP 不代替這些項目。
- 新整合批未上傳 GitHub、未建立 PR、未合併、未部署，也沒有新 GitHub CI 結論。#98 的既有合併不代表本批已上站。
- 原 243-path tree `ee1352c5508376713bae156e205701e512c3212c` 與另品質 tree `beddd52759e5cd322e6d64b658b6e8c0a2f84025` 本次唯讀查詢均 404；仍為 UNKNOWN，不能據此證明未執行。原精確 payload 範圍未復原，未重送、未拆分繞行。
- 先前檢具 tree 建立曾被自動審查拒絕，理由是當時只有進度查詢授權、公開來源／文件目的地未確認。本次已有新的 GitHub 任務授權，但沒有重試該舊操作；UNKNOWN 的查證是獨立阻擋，不能以再次同意上傳代替結果查證。

沒有變更實站資料、帳號、權限設定、SQL schema／migration、connector 或 Site audience；沒有清理舊草稿／版本／收據。
