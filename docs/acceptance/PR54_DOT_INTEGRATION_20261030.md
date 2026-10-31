# #54 dot 本地整合候選（尚未發布）

## 來源與保留

以遠端 #52 `5ebaa8023e509872ede466abdb4e654c21632a81` 的精確樹 `728f6d8a46b24a8a31886177ffa42a99caad3e33` materialize；本地 `4ef3dec` 是明確標註的人工 materialization baseline，不是原 Git 歷史。接入 #54 `d96056719a96cdfec3b41abb4f1621c871f00775` 相對其基準的105檔差異。原停機雲端 fb281999 與7份 dirty files 未取得，不能宣稱使用那些 bytes。私人多人43條包仍獨立，未包含在此候選。

- 保留 #51/#52 的 active IQC baseline、optional projection、歷史/引用、actor/epoch/delivery fencing、restore 與 savedId 邊界。
- 保留最新 master serializer/prepared models，不以較舊 #54 替換 AB/C 的全歷史引用與線別/子工段防刪。
- 最新 AB/C、線別及 BOM 離頁 Save guard 與製程三選項合接；其他模組仍使用其原 guard，不能宣稱全站三選都完成。
- 製程離頁 Save 不暗中 Apply/Sync。任何本機表單／畫布尚未套用或同步時，顯示原因並阻擋 Save；本人 Discard 使用可證明的收據鏈，不整份覆蓋他人草稿。
- 保留 latest52 的 master-reference-viewer、root fixture applicationRoot 與原始診斷，加入 #54 buildDirectory。建置合併含46份 IIFE（比原54多1份既有 viewer），順序與內容逐份檢查。
- 本次不恢復舊資料自動轉換；既有 legacy/records-v1 讀寫及歷史保留。無 schema、帳號、業務資料、部署變更。

## 證據界線

本輪測試原始 logs 留在 dot 私人 `/tmp/dot-takeover-20261030/evidence54/`，不發布執行產物。最終提交/樹與逐項結果由交付收據固定。早期 full focused run 241/250 PASS、9 FAIL：7條舊 leave-Save暗Sync預期、1舊clone宣告、1舊bundle數量；原失敗保留。依新明確手動Sync規則重寫前置與零隱藏寫入負測，修復組49/49 PASS。最終合併與完整 workflow 檢查仍在進行；不能以此中間結果宣稱全綠。

歷史速度與其版本界線見 [#54原始交接](performance-draft-20261030/DOT_GITHUB_HANDOFF.md)。未取得31份原始 timing，55/67中位≤500ms與40/67五次全≤500ms是歷史結果，不是本次新測。C500首次回退、rejected detail最大4.2s、實體手機/原生IME/實站負載未驗仍保留。contentIssues三項 unrelated tooling fault政策差異已在 #52；本候選沒有更動該讀取route或放鬆寫入驗證，既有 FAIL證據不抹除。


## 固定候選後的審查修復與最終本地結果

- 首次固定候選 `5932c418` 的 build、全量 TypeScript、lint 均 PASS；20份聚焦測試 256/256 PASS。其後只修改 CI/測試及本文，產品程式未再變更，因此沿用該產品建置證據。
- 審查發現新的 paired CI 缺少 baseline 環境：現以第二個 pinned checkout 明確取得 `ca6647977a8680038444ce2c1ba4e80f2343cd0a` 的六個原始檔，從 Git blob 讀取避免 Windows CRLF，全部 SHA256 驗證後才寫入測試基準；缺檔或不同 bytes 立即失敗。每個 paired script 明列基準環境，不用 candidate 靜默代替 baseline。
- IPQC choice-read 使用跨平台正規化路徑；Windows/POSIX regression 均確認基準與候選是不同原始碼。修復後實際 domain/Request/Response 合成測試 52 cases PASS；其餘五個 paired scripts PASS。這是讀取計數與合成資料等價，不是網頁500ms驗收。
- 完整136條 workflow 命令都曾執行，並保留初次失敗。依精確歷史 object 補齊、修正合法 bootstrap import／常駐 shell listener 的 fixture 範圍後，135 PASS、1 BLOCKED、0 未解決產品 FAIL。BLOCKED 是 Linux 無 `powershell.exe`，無法執行 Windows CI exit-contract；沒有跳過或修改該門檻。最後 lint PASS。CI 新增固定基準 helper 負測2/2 PASS，bootstrap anchor負測18項與5項 readiness情境 PASS。
- 瀏覽器兩項測試在啟動階段被執行環境阻擋；遵守停止指示，不改沙箱或換執行器。故 AB/C 的實際 DOM 離頁、403、未知ACK恢復，以及製程完整原生操作/審批/圖片渲染與頁面速度仍為 BLOCKED／NOT_RUN；原生IME、實機手機及正式負載仍 NOT_RUN。不得用單元/API結果替代。
- contentIssues 的三項舊 tooling fault 503→200 差異是本候選未更動的既有 #52 行為；測試保留 explicit fault-policy hold，不回寫為全站新接受。
