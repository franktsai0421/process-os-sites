# 製程完整候選：剩餘相依與交接

本機產品固定 a2c5f551d0b897f19bceb4205fcf934daf759467；#102 dfdfe76、衝突88a4a2c、版本owner2e4d20f已真正合樹。保留#100／7ef祖先及所有畫布／歷史／UNKNOWN保護。固定來源之外的dirty程式未取用，trusted page-v1 marker未啟用。

| 剩餘項目／owner | 精確缺口 | 接續完成條件 |
| --- | --- | --- |
| 主資料 UI 功能等價／草稿拆分 owner | AB/C/LINES基本 editor與writer已接，但完整匯入匯出、進階整理與舊頁功能等價尚未交付 | 逐項比對舊入口、欄位與操作；不能以基本JSON代替完整頁面；可用隔離fixtures完成 |
| 例行FQC整頁草稿／草稿拆分 owner | routine-fqc-page-save.ts仍為未註冊核心；現行document flow／媒體／UI未全接整頁scope | 固定整頁HTTP／CAS／新建文件／Save／Submit／Review副作用、pending、照片與UNKNOWN，再交固定commit；不可拷dirty檔 |
| 例行FQC整頁核准歷史／版本查看 owner | 現行核准歷史仍讀各document.flow，新整頁schema／endpoint尚未固定 | 取得整頁固定契約後投影真整頁核准案件並保留文件ID，不借舊單文件核准冒充整頁 |
| 跨模組最終流程／製程＋草稿 owner | AB/C.catalog與LINES已有真核准來源驗證；PROCESS及畫布仍用相容active組合。P2 publicState來源驗證已修 | 新writer完整後跑新增工段→核准→類別→機器→畫布→Save／Submit／Review，確認引用、線別與權限；最後C/GIA CONG需實站 |
| 真資料切換與原樣還原 | marker與正式資料均未改；schema／ACL未動 | 固定實際來源、轉換／rollback方案、精確適用授權與安全門檻，不能用本機fixture代替 |
| GitHub完整來源交付與審查 | #101 Draft仍8f1f243，#102仍ee7d4fd。原243-path create_tree UNKNOWN無精確原payload／未執行證據；設備tree既有拒絕保留 | 先查明未知結果與適用傳送限制；不可換PR／拆分／executor重送。完整HEAD遠端CI及最後審查尚未執行；本機bundle不是已上傳 |
| 原生／手機／IME／兩人／效能／測試站 | 原生Chromium既有socket EPERM；沒有換executor繞過。40秒問題未查明；測試站未更新 | 可用且獲適用授權環境執行desktop、390px及實體iPhone、IME、兩人與失敗流程；量測進頁／切頁／Save／Submit，>5秒優化、>10秒優先 |

已解除的新三頁歷史422由版本owner2e4d20f實作，本製程只做語意合樹，原精確重現留作歷史。新的AB/C/LINES history scope whitelist／selector、來源ID、唯讀及晚到權限fence通過63項page＋canvas合成／signed route檢查。不要再將該422列為現行阻擋。

共用檔：shared-draft-client.js、index.html、version-draft-ui.js、master-page-editor.js、master-page-workflow.ts、versioned-shared-workflow.ts、process-state.ts、master-workflow.ts、Tooling／FQC／IQC／routine程式。後續基於完整a2產品合樹，或逐段採取固定owner提交，不能整檔覆回舊972／7ef／88／2e共用檔。新產品變動須更新精確來源及cache證據。

給#102 owner：請採取產品修正42cdba6及12案例 scripts/test-master-public-page-authority.cjs（CI已接）。publicState必須在移除master.workflowScopes之前驗證AB/C正式內容及LINES active pointer，否則唯一已核准fallback可能吃掉權威指標矛盾。獨立舊碼反證8個負向失敗／新碼12通過，inline／records GET資料bytes不變。

已完成的317／272／63及source suites僅代表各範圍本機證據；source-only consumer不代表新npm install、HTTP compiled或實站。真資料、schema、ACL、connector、上傳、合併、部署未操作。V42未知操作未重送。
