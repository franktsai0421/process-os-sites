# 製程完整候選：剩餘相依與交接

## e5 整頁接線合樹後的發布阻擋

本輪產品5729e17真實合入#102固定e5c3c78，保留25305c1／88／2e及42cd來源權威修正。例行FQC整頁核心、實際route、基本UI與照片接線已存在，不能再稱「只有未註冊核心」；但尚未完成可發布驗收。依最新順序，#102／#101先一起核對更新，再接其他整合；不先單獨合併#101。本輪未更新公開PR文字或上傳程式。

1. **P2：legacyArchive晚到撤權。** `app/api/routine-fqc/route.ts` 的 `legacyArchive=1` 早return缺最終session／revision／權限fence。真signed私有fixture在最後permission await撤銷session後，inline及records仍200並回傳核准內容；下一次同cookie GET為401。版本查看owner需修正；本製程owner依分工沒有獨立改寫核准歷史API。
2. **P2：照片PUT回覆未知後重送。** `public/process/routine-fqc-page.js:60` 直接PUT、pendingSave在POST準備後才建立，缺照片UNKNOWN／hash結果保護。私有實際UI＋photo handler模擬PUT已寫入但回覆遺失，第二次Save使同一File PUT從1變2並繼續workflow POST。交草稿拆分owner修正；需保存原照片sent／hash outcome，未知只查原結果，不能重PUT。
3. **整頁歷史契約未接。** `/api/routine-fqc/page?approvedOnly=1&uiHistory=1`目前422 `ROUTINE_PAGE_SELECTOR_INVALID`；`?permissions=1`無revision，新UI只有文件選擇器。版本owner需接list/detail、新endpoint註冊與display／writer fences；用page.workflow.cases及savedId證明真整頁核准，舊document保留原scope與版本來源，不能假造成整頁核准。

本機證據：整頁kernel13／route14／UI9 PASS，正式來源12及master review PASS；來源／cache／前身／導覽／收據／無輪詢1988 PASS；正常lint／非增量TS／guarded build PASS。擴大功能首輪303 PASS／74 FAIL，失效腳本數量及兩個舊fixture修正後，僅重跑原失敗組：legacy contracts73 PASS、script bundle4 PASS（有3項重疊，勿相加）。舊beforeunload完整負向證據改讀真正固定d4；目前程式明測沒有beforeunload、新page owner與舊busy／UNKNOWN guard保留；departure fixture載入真實history guards，未stub掉權限。兩個產品P2另留可重現反例，不因上述PASS宣稱已修。

精確來源26 targets、80 current、1244 inverses、240真Git objects、79原requests，4,616,425 bytes，原25target順序／值、173＋138物件及5MiB guard保留。最終包裝head及source-only／乾淨consumer結果見外部manifest；不是GitHub CI或原生／實站。

以下表格為25305c1前一檢查點；例行整頁未註冊的描述已由上方e5進度取代，其餘UI、資料切換與發布限制仍適用。


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
