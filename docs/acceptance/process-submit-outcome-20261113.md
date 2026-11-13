# 製程送審結果分類修復（雲端候選）

基底：`2434507ca8ef460b0c727d6d0c2b23345b86310b`，獨立分支 `fix/process-submit-outcome-20261113`。只準備草稿 PR；未合併、部署、修改真實資料／帳號／權限或操作實體電腦。#110 分支未修改。

## 根因與範圍

製程頁在版本元件首次 mount 及之後 updateSync 都把所有 loadError 當成 failed；共用元件將 failed 固定呈現為「結果未知／同步失敗」。實際原始 POST 422 已由 transport 清除未知標記、ledger 也已識別確定拒絕，但 UI 仍產生假未知。NO_SUBSTANTIVE_CHANGE 缺少操作錯誤翻譯，使用者無法得知草稿仍保留及下一步。

只分開呈現 transport 未知／同步失敗與已拒絕／讀取未完成，補中越文說明；已確認送審 ACK 的狀態核對沿用現有流程。未知操作入口明示唯讀原收據查詢，404 不再出現誤導的「確認重試」詢問，保留原識別／寫入鎖。三個修改 JS 資產同步更新 cache tag。

後端及資料模型沒有變更：仍禁止核准後無實質差異送審，保留撤回／發回原儲存快照重送、全部 scope、draft/saved/pending/active、CAS、冪等、權限及核准歷史唯讀。沒有新增輪詢或切頁阻擋。

## 驗證與界線

- 原始來源：新增的實際 UI/transport/ledger＋簽名 route 測試在中／越文、inline／records-v1 四種組合均失敗於假「結果未知／同步失敗」斷言；當時 transport unknown/failed 都已是 false。
- PASS：`node --test tests/process-submit-outcome.test.mjs` 9 項。四種組合確認拒絕時 DB manifest/R2 bytes 完全不變、無待審、草稿保存及可繼續操作，接續實質修改→存取→送審→撤回→同快照再送審。另覆蓋確定403、讀取503、提交成功但回應遺失、receipt404、新 JS realm 原識別恢復、ACK僅收據的狀態讀回、延遲回應及連點只一次POST。fixture 的內容待補仍保留並允許有效送審，未將站上223項推定為阻擋。
- PASS：既有 no-change、submit contract、receipt recovery、實際 route lifecycle、owned ledger；原45秒假時鐘 deadline／body timeout／不重送斷言不變，僅更新三個 cache tag 的預期。
- PASS：Canvas及主資料原頁歷史、Begin／history mount各種失效、無背景檢查及導航相關214項隔離回歸。
- PASS：來源／cache／完整歷史證據146項，panel完整差異與序列化17組，Save/Submit UI30組，中越文實際錯誤sink、完整lint、非增量TypeScript及實際build（含postbuild auth check）。build固定於 `bdf4d28181e19bbc3bb5e7978f1dd8cd0a76d281`；其後僅測試與文件變動，產品檔完全相同，因此可重用該build。
- 已修復測試FAIL：原來源證據尚未辨識新增fixture介面；舊A10將任意提示當unknown；錯誤sink fixture只取一行helper、缺現行FQC/IQC/history的closure ports及C取消例外。補齊實際來源與ports、保留原斷言並新增提示可見斷言後均PASS。
- BLOCKED：雲端 `node tests/process-draft-lifecycle-browser.mjs --isolated-desktop` 已嘗試，Chromium啟動即關閉，failedStage=fixture、0個UI步驟；非產品生命週期FAIL，不宣稱原生PASS。保留原runner/deadline與CI原生測項，未改瀏覽器安全參數。
- 精確來源 inverse 只接受本次固定四個產品檔的完整 bytes，還原到真實 main；原歷史 hash／來源保護不變，新增漂移／重複還原／錯誤路徑／非Buffer負例。CI增加本次定向測項。
- 本次測試使用雲端 Node24、合成DOM／WebLocks／HTTP分派及隔離 SQLite/R2，不是實站或實體裝置驗收。真實站業務送審、Frank實體電腦、實體手機及真人IME均 NOT_RUN（依範圍）。

最新型別、lint、build、原生瀏覽器及遠端 CI 狀態以本草稿 PR 的固定 commit 紀錄為準；不得把較早來源 PASS 當成新提交已通過。

## 安裝註記

獨立 Git worktree 的 `npm ci` 已安裝鎖定相依，但 postinstall collaboration-setup 因只支援 standalone .git 目錄而拒絕安裝（exit1）；未覆寫任何 hook／設定。測試繼續使用同一 worktree 已安裝相依；不以換 checkout 或關閉 guard 迴避。曾由同一共享 Git repo 既有受保護 standalone transport 嘗試指定新分支 ref；因缺 HTTPS Git 憑證失敗，已查遠端無該分支、main不變。改用已連線 GitHub API 上傳已驗證的相同 blobs/tree、新建 main-based commit／分支並建立草稿 PR；逐項核對 blob與完整tree hash，不更動main、任何既有分支或hook。

全庫 safety scan 的兩項 findings 位於既有合成安全測試，兩檔與基底main完全相同；本次變更檔掃描0 findings，未刪除或改弱既有負例。

## 遠端首輪 CI 續修

`a85d602dc630ec752368adb98e846d45eacddf05` 已核對 blob/tree、草稿PR #111及未變main。該遠端commit重跑18項送審／來源與實際build均PASS。Process integration新增送審、Save回饋、shell、EOL與lifecycle步驟PASS；step10為178/179，唯一FAIL是導航cache斷言仍期待舊標記。本地完整重現後，定向更新導航與account-entry的三個已變資產預期，並納入固定來源inverse；未改產品、斷言範圍、deadline或CI條件。

首輪其他CI的AB/C、PROCESS local Save與account失敗同為導航cache舊預期；Quality joint直呼restoreParent而未經projectKnown，未先套入新固定inverse。已讓兩個入口均經同一精確bytes逆投影，保留原長度/hash/來源/漂移/重複負例後重測。

## 後續固定證據

- PASS：Process integration工作流全部21組非原生步驟，以同一checkout／完整原命令執行，全部exit0（包含510項Canvas、188項完整step10、199項橋接保存及其餘來源／權限／逐頁生命週期組）。
- PASS：修正後Quality/source證據127項，保留所有既有hash及漂移負例；完整lint仍PASS。
- PASS：首輪遠端 `a85d602` 的原生job `131839274787`（run `43411651405`）全部成功，包括原Begin原收據與零額外POST、原完整process lifecycle／silent navigation，以及FQC和root-entry後續原生測項。本次後續僅cache預期／測試來源adapter／文件變動，產品檔與此原生PASS完全相同。
- PASS：實際遠端 `a85d602` 再次執行18項送審／來源檢查和build（含postbuild auth check）。最終提交CI另行核對，不能把首輪整個workflow標成PASS（其source job曾FAIL）。
