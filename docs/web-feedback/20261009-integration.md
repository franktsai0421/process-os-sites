# 3020 修復與隔離整合驗證（2026-10-09）

狀態：安全交接；停止新增修改。最新七項製程標註子任務已 EXECUTED；這不表示日常整合或效能全數通過。下一階段由使用者指定的另一Codex對話接手，**本執行者未開始日常3000的schema/config/業務資料整合或服务切換**。3000／3030／3040均未修改或重啟；没有 commit／push／merge／部署。工作基礎為目前 `codex/ipqc-ab-local`、`8b182626085bb2aa1f3a216903c5b373ee82bc44`，保留全部並行變更。

## 已完成與最新範圍

- 共用／產品專用作業的七項標註與實際證據見 [作業編輯報告](../ipqc-reference/20261009-work-items.md)。原3020業務348的13鍵完全保留；合成副本43→45僅寫指定驗收方塊的共用／產品專用項目及正常Save。
- 入口、全螢幕按鈕、機器照片、問題回報整列選取／明細及起始頁固定等修復已實作。之前的獨立驗收仍有完整開啟超300ms、手機工具未生效等限制，不能由設計或單元測試抵銷。
- 登出後舊會話仍可重播的既有問題已獲人類同意修復；新撤銷表與rollout gate先在私有副本驗證，再啟用既有3020。參見 [登入撤銷](../ipqc-reference/20261009-session-revocation.md)。不得把3020測試簽章／帳號／ledger帶入日常。
- 使用者在本對話明確答覆「保留未同步修改、不替我保存，允許切換服務並重新登入」。原id6 A-CUT-02表單及id8七筆未同步移動維持開啟，不代替Apply／Save，也不重新整理原分頁。可見欄位、位置與畫面已保全，**不宣稱已保存所有隱藏的modal內存資料**。

## 效能修正與驗收界線

129MB的隔離checkpoint先前每次GET重複解碼／序列化，與業務API共用隊列。新 `ipqc-durable-checkpoint.cjs` 只在落磁碟成功後安裝完整Buffer；每次GET仍核對當前DBrevision，最新checkpoint缺失或失敗時拒絕。隊列、正常handler、成功回應前checkpoint保護都保留。私有副本5項PASS，完整payload129,353,538bytes；不是縮小資料負載。12次Buffer查核最大0.073ms是helper量測，**不是HTTP或完整開啟延遲**。

`readState`的inline legacy值已在同一request解析一次，移除第二次相同JSON解析；R2仍驗SHA／路徑，records/chunks仍沿原decoder。私有完整大小讀取432ms，資料雜湊一致；fresh讀取不共用可變物件、R2錯誤拒絕、chunks／records／demo權限回歸PASS。完整瀏覽器目標目前仍需同負載重測，不宣稱達標。

## 證據、保全與回復

私有證據根目錄：`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/integration-20261009/`。before-code、annotation-before-01、session-before-01均保留修改前程式／狀態。切換前135個runtime檔案逐檔SHA一致，見 `session-switch-before-01.manifest.json`。最新資料來源仍為同上父目錄 `editor-feedback-20261008/runtime/*-latest.json`、`*-web-feedback.json`及原archive，媒體仍取 `whole-module-20261007/isolated-photos`。

真實日常資料只做唯讀備份與private COPY演練：daily-before保全D1/R2，session-revocation-daily-01、daily-feedback／daily-process-self-review等在新副本執行，不能寫成日常3000已驗收。撤銷表及測試案件只在副本或3020獨立runtime。原始失敗紀錄保留；有包含完整私人狀態的失敗log不得貼出、上傳或收入交付ZIP，使用摘要與修正後可讀結果。

回復程式需按任務差異語義還原，不能整套覆蓋dirty checkout。重新啟動只能沿用**當時最新**3020 runtime；舊before業務checkpoint僅供比對，不得覆蓋後續資料。撤銷ledger不得倒退而復活已登出session；恢復副本須先合併較新撤銷紀錄，再啟用。持久簽章只留私人本機runtime，不進Git／報告／ZIP。

## 尚未完成

真正3020同簽章重啟驗收的協調程序逾時FAIL；最新PID8500 HTTP已正常，但舊token仍在記憶體的probe已退出，不能補推PASS。雙分頁logout UI與同負載完整開啟本輪NOT_RUN，留接手者定向補驗。完整日常瀏覽器、實體手機、原非空案件歷史、全部101個共享基礎dirty檔的語義分流與下一階段安全增量整合仍未驗收。C2C設定修復先前被自動審查拒絕，未更換或擴張權限；不得把此限制寫成ChatGPT獨立複審完成。

收尾只讀結果 `closing-readonly-check.json`：primary348、synthetic45各13鍵未變，兩业务JSON及兩feedbackJSON皆與切換前byte-equal；127.0.0.1／localhost HTTP200分別31／15ms。這是fixture-info readiness，不是完整畫布／小幫手負載目標。沒有仍運行的驗收probe；正常3020服務保持開啟。其他並行Codex是否idle未由本執行者核實，不作保證。
