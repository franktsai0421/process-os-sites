# 檢具與測試設備校準的隔離驗收與上線條件

## 驗收範圍

本候選從私人 V14 的工作流程與介面復原，來源提交為 `48af173c5db3331fe956e28e7dc536cf1bc3e341`。主檔、權限、核准、照片與備份使用測試分支的 Worker、D1 與 R2 介面。測試只在本機 Miniflare 產生資料。瀏覽器測試涵蓋桌機繁中、390px 越文、兩件共用校準報告、主檔已有草稿及四個品質模組的引用。

## 重現

在鎖檔相符、具 Node 24 與 Chromium 的開發環境執行以下命令。若使用自備 Chromium，可用 `CHROMIUM_PATH` 與 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向同一執行檔。

```sh
export PROCESS_PROGRAM_COMMIT="$(git rev-parse HEAD)"
NODE_OPTIONS=--max-old-space-size=2048 npm run build
export PROCESS_TEST_BUILD_DIR="$PWD/dist"
node --test --test-concurrency=1 tests/piece-calibration-reset-model.test.mjs tests/piece-calibration-native-integration.test.mjs tests/piece-calibration-native-browser.test.mjs
node --test --test-concurrency=1 tests/equipment-atomic-compiled.test.mjs tests/equipment-transfer-compiled.test.mjs tests/tooling-review-compiled.acceptance.mjs tests/tooling-write-compiled.acceptance.mjs
```

## 資料與操作

校準帳本以 `pieceCalibrationLedger` 保存於既有原生紀錄。D1 的共用修訂號同時保護帳本及設備主檔的不可選用清單 `calibrationUnavailable`。未使用校準的主檔可省略兩欄。讀取既有繁中或越文的單一校正方式時，沿用設備主檔的內校、外校判定，保留原始欄位。自訂文字週期需要先在主檔核准可計算的週期，雙軌衝突需先確認單一方式。照片位於獨立的 `piece-calibration/photos/` 前綴。設備主檔顯示已核准報告的有效日期，草稿保留其原始值。已有校準鎖的設備不能藉由設備申請改寫日期。

單輪重設以整張計畫為單位，每一件設備都必須以此計畫為最新一輪。執行前會列出影響範圍及還原後的日期。無法核對首次校準的原始主檔版本時，必須保留紀錄並顯示錯誤。重設使用預覽修訂號和範圍摘要，可辨識已成功的相同重試。重設保留必要的操作紀錄。已清除文件的專用照片隨之撤銷存取，共用照片仍可隨保留的文件讀取。R2 實體位元及既有備份會保留，重設不能作為媒體實體清除證明。

FQC、IQC、IPQC A/B、IPQC C 的現行引用或尚未結案的草稿會阻擋報廢。在設備主檔逐一將標準移轉至替代設備，依各模組流程儲存、送審並核准，再重審原報廢單。歷史核准版本保留原設備。

## 部署前條件與回復

1. 核對最新測試分支、單一校準 PR 的實際 head、GitHub checks、檔案清單與並行變更。維持 FQC 的必填不良原因代碼驗證。
2. 核對測試站專案與既有託管清單，Worker 使用 `DB` 和 `STATE_ARCHIVE`。本變更沿用現有資料表、R2 和紀錄格式，沒有 SQL 遷移。部署前另行確認平台實際綁定與備份可還原。
3. 經授權後，以同一完整候選部署測試站。對測試站同時開啟 `PIECE_CALIBRATION_ENABLED=1` 與 `PIECE_CALIBRATION_RESET_ENABLED=1`。未設定時關閉。重新核對一般帳號、核准帳號及管理者的入口與權限。
4. 若須暫停作業，停用兩個開關並保留相容的 Worker，既有日期鎖及設備引用保護應繼續生效。若要退回尚未支援校準的二進位版本，先進入維護狀態、保全部署前後的完整 D1/R2，核對中途業務寫入與受影響設備後，再依授權採用經驗證的完整還原或資料相容方案。
