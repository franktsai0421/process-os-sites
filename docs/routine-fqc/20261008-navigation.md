# 2026-10-08 FQC 11項回饋驗收

狀態：EXECUTED；3040隔離工作區，未提交、未部署。這份紀錄僅涵蓋使用者11項頁面批註，沒有恢復或重建已取消的排程。

| 批註 | 實作與驗證 |
|---|---|
| 1 捲軸跳動 | 重畫恢復頁面／清單／明細、桌機 preventScroll 聚焦與關閉捲軸錨點。981×884實際畫面點選，前後windowY798／listTop477完全相同。語義自動化click本身會先捲至元素，不能拿它當原生滑鼠捲動判斷。 |
| 2 草稿只剩刪計畫 | 工作明細可直接接續草稿；計畫優先連到同系譜草稿。無可報告項目有原因、目前計畫及異常入口。隔離系譜用例與實際RPT0013入口PASS。 |
| 3、6、10 階段／完成 | 每列列出文件類型、草稿尚未送審、已送審、已完成審核與下一步；報告正式留存及異常待結案分開。計畫核准不當作報告完成。 |
| 4 文件分類 | RPT檢查報告、DSP處置、WVR免做的分類按鈕及列標示；窄桌機可直接辨識。 |
| 5 選中標示 | 目前文件編號、藍色列與aria-selected對應右側文件；經原文件／歷史連結開啟也有左列。 |
| 7 草稿簡化／顏色 | 共用元件仍接原操作；Routine自身metadata折疊、無用版本選擇標籤移除。報錯#fff0f2、待補#fff6df、歷史#eff5ff實際computed style確認。 |
| 8 複測卡關 | 草稿0013明示缺103S101204及名稱，無「結果列0」。前往修改聚焦use-required:0，1366定位top429；建立本次列後提示結果列3尚未選結果。 |
| 9 原樣品固定 | 原歷史報告唯讀；本次必要原樣品已選時checkbox disabled；建立列沒有自動選結果／Save／Submit，無法測試規則仍保留。 |
| 11 找不到未送審 | 草稿優先；草稿未送審數量／已送審／已完成審核快捷，點選後保留相容篩選。實際草稿1、待審0、完成審核21。 |

## 驗證

PASS：
- `node scripts/test-routine-fqc.cjs`：12組既有排程／複測必要樣品／照片／不可變歷史／權限／CAS用例。
- `node scripts/test-routine-fqc-operations.cjs`：12組取消、恢復、固定送審、系譜、報告占用及權限。
- `node scripts/test-routine-fqc-feedback.cjs`：分類／半年頻率原有定向用例。
- `node scripts/test-shared-draft-v3.cjs`：14組共用草稿轉移核、固定快照、權限與並行防護；非HTTP全功能驗收。
- `node scripts/test-routine-fqc-navigation.cjs`：無HTTP／DB的前端隔離契約，用真實清單、階段、樣品引導函式驗證中越文、原內容不可變、捲軸／焦點／篩選保持及草稿置頂。
- 新測試lint與前端語法檢查。
- 實際3040內建瀏覽器：1366×900／981×884與390×844；原生可視點選捲軸保持、草稿入口／標示／顏色／原樣品建立列／待補定位；手機中越文0橫向溢出，操作按鈕44px，定位欄位top399未被頁首遮住，page error為空。
- 原分頁所有文件／結果欄位、樣品選取、結果及展开狀態與事前DOM備份逐欄一致；未替使用者Save／Submit／審核。驗證分頁增加的一列只在記憶體，已移除，未儲存。

FAIL（既有基線）：
- 前端全檔oxlint有9項原有錯誤：未用變數2、未使用表達式2、sort比較函式2、template型別1、浮動Promise1、beforeunload returnValue1。本次備份檔執行同樣檢查有相同9項；未為這批UI回饋改寫既有不相關流程。

NOT_RUN：實體iPhone／原生輸入法驗收、ChatGPT獨立複審、3000整合／部署。此次未新增API／結構寫入规则，既有伺服器為最後驗證依據。

## 變更、資料與復原

程式：`public/process/routine-fqc.js/.css`。共用VersionDraftUI及後端未改；新定向檢查`scripts/test-routine-fqc-navigation.cjs`。正式需求見[ROUTINE_FQC§13](../specs/current/ROUTINE_FQC.md)，現況見[模型](../../AI_CONTEXT/models/ROUTINE_FQC.md)與[QUALITY](../../AI_CONTEXT/modules/QUALITY.md)，階段見[HANDOFF](../../HANDOFF.md)。

資料模型影響：None，僅讀既有Line.requiredSamples／Case.requiredSamples／文件系譜／reportAvailability；不新增欄位、migration、帳號、服務、埠或記錄。新列僅在使用者明確點選後的目前buffer。

復原來源：`<TEMP>/fqc-ui-20261008/source`存本次前端修改前完整檔案，`docs`存修改前文件，`user-input-before.json`存原分頁未存輸入。若有後續並行修改應按此差異語義回復，不能整檔覆蓋後續工作。原分頁有尚未儲存內容，不自動重新整理。

截圖：[桌機](evidence/navigation/desktop-1366.png)、[手機中文](evidence/navigation/mobile-zh.png)、[手機越文](evidence/navigation/mobile-vi.png)。界面模擬不是實機接受證明。
