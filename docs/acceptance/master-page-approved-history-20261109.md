> 例行FQC整頁介面後續已提供e5，本機版本查看接線與legacyArchive修正見[新紀錄](routine-page-approved-history-20261109.md)；下方保留本批原交付範圍。

# 新頁面 owner 的核准版本查看

本批基於製程整合固定 `679ad0e492dae15d40900324f140e8e81ca2633d`，其真實合樹已包含草稿分界 `972e3a8cad7be5da7af0f4d7519fc36ff8bb2b6d`、#100 main 與既有十三組核准查看。不整檔覆寫舊 f61/e3d 或其他候選。本批只接新頁歷史 API／原頁 selector，不負責啟用或變更草稿分界。

## 新三頁交付

| 頁面 | 實際 endpoint／owner | 本機 | GitHub | 測試站／實際驗收 |
| --- | --- | --- | --- | --- |
| AB 產線與類別 | `/api/master/pages?scope=AB`／`master:AB.catalog` | 原頁單一 selector、已核准唯讀、回原草稿；合成 API／UI PASS | 本批未上傳 | 未部署；原生／實機／實帳號 NOT_RUN |
| C 產線與類別 | `/api/master/pages?scope=C`／`master:C.catalog` | 同上，C 的原 scope／權限獨立保留 | 本批未上傳 | 同上 |
| 線別與工段 | `/api/master/pages?scope=LINES`／`master:LINES` | 新整頁核准快照；舊 AB/C 各自標示來源，不冒充共同核准 | 本批未上傳 | 同上 |

修正可重現的 approved-only GET 422；parser 明確綁定 path/key/scope，拒絕重複、混合、restore、receipt、document 等 selector。metadata 不 hydrate 歷史 body，detail 僅 hydrate 所選原核准內容；完整序列化後仍由共同 route 重新驗證 session、view/history 及 global revision。舊來源以 response-only tuple ID 保留 `sourceScope`、`sourceVersionId`、原 case/saved/reviewer 證據；不儲存 alias、不合併兩份舊核准，不讀目前組合 active 當歷史。

`master-page-approved-history.js` 使用共同 VersionDraftUI。選歷史後同步鎖定顯示；writer、舊 DOM callback、晚到 state/body 回覆不可穿越。回草稿只讀新 permissions，保留原 mine/base/generation、搜尋、LINES AB/C 分頁、pending、UNKNOWN bytes。瀏覽 UNKNOWN 不查收據、不重送；返回後仍可明確查原操作。禁止歷史 Save／Submit／撤回／套用／還原，無歷史彈窗。接收正常 Begin/Save/Submit 資料時先退休舊 working view，避免 control 換物件後阻擋畫面重繪；三頁實際 pending 回歸保護此缺陷。

未改 trusted `page-v1`／baseline／pending-source fences。未啟用時 history GET 仍回 `MASTER_PAGE_CUTOVER_REQUIRED`，不建立 baseline。無 schema、ACL、真資料或部署設定變更。

## 驗證與依賴

- 新 API 21 項與原頁 UI 21 項：真實 Workers handlers、簽章合成帳號、SQLite `:memory:`、Map R2、實際 editor/common/client、有限 synthetic DOM；零真資料。涵蓋 inline/records、跨來源同 ID、固定 case content、query 拒絕、撤權／revision 晚到 fence、零寫入、精確 body 讀取、marker 不啟用、中越文、原 RAM／篩選／待審／UNKNOWN、過期 callback、回草稿新權限及返回後 Save 恰一次。
- 保留原 writer runtime／UI 回歸與全部舊來源 pins／負例。新增兩個正常 CI job 的新頁 API／UI 檢查；原生 CI fixture 加載實際 helper。本機不重試先前 socket/ptrace EPERM 的瀏覽器；新增腳本載入不代表原生已驗。
- 精確來源與 build 的最終 commit／測試數由交付 receipt 記錄；不得引用基準 proof 作本批 runtime 證明。依賴採既有鎖定版本安裝結果，未宣稱本批重新 `npm ci`。
- 收到後續 `ddcc7a6`（製程提示文字）及 `88a4a2c`（跨頁草稿衝突）通知；本批未把它們整合。由各 owner 後續語意合樹並重新更新 cache／來源證據，避免共用 client/index 覆蓋。Routine FQC 新整頁 HTTP/schema 尚待草稿分界 owner；本批保留既有每文件核准 viewer，不自行改 writer/scope。
- 其餘逐頁本機結果見[原十三組紀錄](approved-history-unification-20261109/README.md)。舊 AB/C combined viewer 仍供未切換布局使用；新 page-v1 不會冒用舊 owner。

## 遠端與交付界線

本次唯讀核查 main=`9fbba823090f03da8385c8d92f5e59293d19d2f1`；#102 仍 draft/open、未 merge，remote head=`ee7d4fdc750ab5227f25559f52c9edac62b09086`，不是本機修正972。後續寫入前須重新查最新遠端。

原243-path GitHub create_tree 結果 UNKNOWN，原 payload 無法完整核查；404 不證明未執行。另 equipment create_tree 曾被自動審查拒絕，原因為當時僅進度授權且公開來源／文件目的地未確認。依 parent 明確限制，本批不重送、不拆分繞過、不新開 PR／executor 改道；只產生本機可審查 commit／bundle／receipt。沒有上傳、合併、部署或啟用 marker。

## 固定本機結果

產品提交 `dfe1679274b1c06c2f0b8898e1fc196158dbdba2`；精確來源提交 `5a685b6514bba78354bc687386ea0e0445817f78`。來源綁定前者的真實 runtime/tree，後者只更新證據；最終文件提交不更改 runtime。保留21個既有 targets、原79歷史請求及原 frozen witness 物件，76 runtime files／1003 exact inverses；manifest 3,890,831 bytes、witness 3,214,579 bytes，均低於既有5MiB guard，未提高限制。

- 全頁 viewer／新三頁／共同 API：**427 PASS，0 FAIL，0 SKIP**，含本批新 API 21＋UI 21；`page-history-all-viewers.log`。
- 完整來源／witness／inverse／導航負向：**1738 PASS，0 FAIL，0 SKIP**；`page-history-source-gates.log`。
- 指定畫布 POST／設備一鍵 Save／原子 Save 及主資料衝突／篩選／snapshot：**276 PASS，0 FAIL，3 SKIP**；`page-history-writer-and-canvas-regression.log`。三項僅因固定 c82a395 paired-performance baseline 缺失，沒有聲稱成對效能改善；舊紅燈不是略過或改弱斷言。
- 原 master-page writer runtime 13組及 UI 8組 PASS；核准證據13組、無輪詢28＋28項、source composer 16項、正常 typed lint、TypeScript、source boundary PASS。
- 受保護 build 指定實際 `5a685b6514bba78354bc687386ea0e0445817f78` PASS，含 postbuild auth check；不是發布批准。首次漏填 program commit 的建置被既有 guard 拒絕，補實際 SHA 後通過，沒有更改 guard。

這些是本機隔離證據，不是 GitHub CI、原生瀏覽器／iPhone／IME／測試站或真實生命週期驗收。原 API/UI 初始失敗、lint fixture 問題及搜尋 synthetic DOM 選取問題的日誌均留在外部 evidence 目錄；產品重繪缺陷已實際修正。後續合入 ddcc/88 或例行 FQC 新 scope 後，必須依新固定 runtime 重新驗證相關共用程式與精確來源。
