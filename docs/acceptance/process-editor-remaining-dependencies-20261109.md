# 製程完整候選：剩餘相依與可獨立工作

本輪真正合樹的產品為 `42917bfcf940f034ba3cad318bc89bf470baf686`（tree `34ddcd2ec9b0473679db4463bcfa9b54da1b2689`），雙親包括完整編輯台驗收增量與 #102 固定 `972e3a8cad7be5da7af0f4d7519fc36ff8bb2b6d`。版本查看固定 `e3d92846` 已在真實祖先；f61 測試增量逐段採用。未取其他工作樹 dirty 檔、未啟用 page-v1 或移動真實資料。最終包裝 HEAD 見外部 delivery manifest。

## 已可獨立完成的工作

本輪已新增並獨立複核 8 項驗收：非 admin writer/reviewer 的實際簽章 HTTP／SQLite 生命週期（inline／records）、自訂機器中越文依本線本工段選取、C 類別五個主要工段中越文、明確空設定及 legacy fallback。受影響完整套件 143 PASS；後續合樹 Canvas／history／C callback 277 PASS。它們不需要等待 #102 真實資料切換。

#102 runtime 固定後已本機合樹，並通過其實際 page route、真 transport／合成 DOM 測試。保留原 no-poll、IPQC request-entry owner、restore 權限、current-canvas Save、PROCESS 離頁表單及 UNKNOWN protections；marker 缺失仍不開啟新 writer。

既有核准歷史 route／master／PROCESS／例行 FQC 162 PASS，來源／cache／前身鏈／導覽／收據 1550 PASS；正常 lint、非增量 TS、guarded build PASS。來源證據新增固定 boundary_runtime target，原20 targets順序和值／173物件／79請求不變；74 current、999 inverse、207 witness objects。索引編碼可逐 byte 解回原 V1 JSON，5,687,067→3,869,397 bytes；沒有提高5MiB閘門或放寬舊驗證。

## 精確未完成項目

| 項目與責任交界 | 固定來源／缺口證據 | 完成條件與可獨立前進 |
| --- | --- | --- |
| 新 AB/C/LINES owner 的核准歷史：頁面 owner＋版本查看 owner | 新 endpoint 是 `/api/master/pages?scope=AB|C|LINES`，flow scopes 是 `master:AB.catalog`／`master:C.catalog`／`master:LINES`。目前 `lib/approved-history-query.ts` 只認舊 master/workflow AB/C/PROCESS；真路由三頁的 approvedOnly uiHistory 皆422 `INVALID_APPROVED_HISTORY_QUERY`，`public/process/master-page-editor.js` 沒有原頁 history adapter | 新 endpoint 的嚴格路由／scope opt-in、真核准證據與只讀 selector；保留 legacy 來源身分而不假造 combined 核准案件。history/current切換不得回填writer，保留pending/UNKNOWN/form/actor/revision fence；需舊＋新核准、角色拒絕、晚到回覆及零寫入測試。此工作已有固定972接口，可獨立開發，並非等待資料切換 |
| 新主資料 UI 功能等價：#102 owner | 972 基本頁面 editor 已接，owner驗收明列匯入匯出、進階整理及原生UI仍未完成 | 逐項比對舊AB/C與line-admin使用路徑，保留既有欄位與匯入匯出；不得因新owner而以基本JSON輸入代替完整頁面。可在隔離fixture完成，無需真切換 |
| 例行 FQC 整頁草稿：#102 owner＋版本查看 owner | `lib/routine-fqc-page-save.ts` 只有未註冊核心，scope `routine-fqc:page`、content `documents:[{id,content}]`；目前 `lib/routine-fqc-approved-history.ts` 及UI仍要求 documentId 並讀各document.flow | 固定整頁HTTP/CAS／新建文件／Save／Submit／Review副作用、pending、媒體與UNKNOWN接線；歷史投影須對應整頁固定案件並保存原文件識別，不能借舊document approval冒充整頁核准。需先有其固定endpoint／schema交付，再合樹重驗 |
| 核准 LINES→類別／PROCESS→畫布的跨模組整合：#102與製程 | 972 的相容active組合保留各自核准來源，LINES有union pinned PROCESS link；本輪路由測試通過。製程仍讀 `master.active.AB/C.products/lines` 及 `active.PROCESS` | 在固定新writer與版本adapter後，以隔離完整流程確認只有核准工段／類別／機器進畫布、A/B/C無串寫、舊引用不誤刪。最後真實C/GIA CONG與真帳號仍須實站驗收 |
| 真實切換與原樣還原 | 所有新頁 writer 必須既存 trusted `pageDraftLayout:page-v1` 及三個已建立有效baseline，查詢／env不啟用。舊working可放棄的規則已確認，但不等於已執行切換 | 固定來源與待審／原receipt盤點、DB/R2閉包、原樣隔離還原與必要明確切換確認後由授權流程處理；本輪不改marker／資料／schema／ACL |
| 完整程式上傳／CI／合併 | #101遠端仍8f1f243 Draft；原243-path create_tree結果UNKNOWN缺原payload與未執行證據，設備tree先前拒絕保留 | 精確查明適用傳送限制後才可執行合法一次傳送；不能用本機bundle、新PR、拆分或替代executor接續舊未知／拒絕。新完整HEAD的遠端CI與最後審查尚未執行 |
| 原生／手機／IME／兩人／效能／測試站 | 本環境原生Chromium socket EPERM既有阻擋，未換executor繞過；沒有新部署或實站40秒重現 | 在適用授權及可用環境執行桌面、390px／實體iPhone、IME、兩人完整生命週期，量測進頁／切頁／存取／送審。>5秒優化、>10秒優先；40秒未查明。合成測試不代替此項 |

## 共用檔案及整合交付

新 master 接線主要共同檔是 `app/api/master/workflow/route.ts`、`lib/versioned-shared-workflow.ts`、`lib/process-state.ts`、`lib/master-workflow.ts`、`public/process/shared-draft-client.js`、`master-data.js`、`fqc-master.js`、`access-policy.mjs`、`index.html`。後續版本查看若改新pages adapter，請基於此合樹或逐段採取固定提交，不整檔覆蓋回972／e3d／d1的舊shared client或index。

優先接新page歷史，再完整UI及例行整頁介面；每個新runtime要更新精確來源／cache並保留固定舊target。資料切換、遠端傳送與實站是另外的阻擋，不能統稱「全部等#102」，也不能以文件或部分測試通過推定完成。

外部證據：`page429-required-history-gap-probe.json` 明記需求未滿足；`page972-actual-route-merged-first.log`、`page972-actual-ui-merged-first.log`、`page972-canvas-history-callback-first.log`、`page429-history-route-master-process-routine-first.log`、`page429-source-cache-chains-first.log` 及最終manifest分別綁定範圍。不是整批Ready、合併或部署宣告。
