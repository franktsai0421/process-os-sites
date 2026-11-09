# 各功能頁草稿分界：盤點與切換前置候選

原始基準為 GitHub main `d4ac309fe05c89288af226b52c18161865ccdcb8`，已語意合併 main `021f0f388b16ebcdff0f64ff44039d2ea07f4165`（#99）。本分支為獨立、未啟用的前置小批，沒有帶入其他未發布候選；不是全頁拆分已完成，也不是可啟用切換的版本。

## 獨立公開候選邊界

相對 #99 的 main，此批只新增兩個未註冊的頁面預演／名稱 Save 模組、三份合成回歸測試、必要的規格／交接，以及 AB/C CI 三條測試命令。唯一現用程式差異為 `master-document-boundary.ts` 拒絕尚未支援的 `page` query marker，避免誤落既有 combined writer。現行 UI、master writer、PROCESS link、共用衝突 client、snapshot/redaction、schema 及權限政策均與 main 相同；#99 的工段邏輯及測試保留。

來源為本次已核對公開 main 上的新提交，沒有匯入舊 243-path／quality／equipment 上傳 payload 或未發布整合祖先。新候選以 main 為遠端 parent，只公開本批差異；舊 UNKNOWN 仍保留 UNKNOWN，不能把樹查詢 404 當成未執行證據，也沒有以改用工具、重建連接器或拆舊 payload 的方式接續。草稿 PR 只供審查這個未啟用的小批，三項業務決策與正式資料切換不在其範圍內。

## 逐頁現況

| 真正功能頁 | 現行草稿所有權 | 本批結果／未完成 |
| --- | --- | --- |
| 製程編輯台 | `process:platform` | 已是整頁一份；workspace／類別／工段為內部畫布。未改 runtime，跨畫布 Save 本輪 NOT_RUN |
| AB 產線與類別 | `master:AB`，含線別工段 | 尚未拆。預演投影為 `master:AB.catalog`，只含 products/categoryGroups |
| C 產線與類別 | `master:C`，含線別工段 | 尚未拆。預演投影為 `master:C.catalog` |
| 線別與工段管理 | 依目前 AB/C 選取借用上述兩份 | 尚未拆。預演為單一 `master:LINES`；新增未註冊的既有名稱 Save 元件，AB/C 分區在同一份 content，不能變成兩份頁面草稿 |
| 流程資料 | `master:PROCESS` | 已獨立；模板、名稱、媒體與設備總表／機器 modal 同頁，不拆成新模組 |
| FQC | `fqc` | 已獨立；錯誤碼／項目／矩陣為內部視角，生命週期本輪 NOT_RUN |
| IQC | `iqc` | 已獨立；零件／項目／供應商等同頁，生命週期本輪 NOT_RUN |
| IPQC A/B | `ipqc-ab:module`，另保留 legacy 群組相容入口 | 現用整模組；A/B／群組／工段不拆，生命週期本輪 NOT_RUN |
| IPQC C | `ipqc-c` | 已獨立，生命週期本輪 NOT_RUN |
| BOM | `bom` | 已獨立；樹、根件、匯入不是新模組，生命週期本輪 NOT_RUN |
| 模具 | `tooling` | 已獨立；內部目錄／表單不拆，生命週期本輪 NOT_RUN |
| 檢具與測試設備 | `routine-equipment` | 已獨立；跨品質替換另有交易契約，生命週期本輪 NOT_RUN |
| 例行 FQC | `routine-fqc:<documentId>` | 依每張檢查文件持久化。不同文件是否也要改成全頁一份，現有確認規則未明確涵蓋；須另確認，不自行重組文件案件 |
| 問題回報 | 帳號私人 IndexedDB drafts | 私人回報，不納入多人業務草稿 |
| 帳號／權限、例行報告及建置中頁面 | 即時管理或 placeholder | 不因有表單就建立業務草稿 |

以上「已獨立」只表示程式中的 scope 分離，不代表存取／撤回／權限／多人整組選擇均已驗收。全站衝突、背景輪詢、歷史與權限另有並行候選；本批不以其舊測試替代最終合樹驗收。

定位證據：[主資料實際分頁及 line-admin 借用](../../public/process/master-data.js)、[PROCESS 設備總表與 modal](../../public/process/process-equipment.js)、[主資料 adapter](../../lib/master-workflow.ts)、[製程 scope](../../lib/process-authoring-workflow.ts)、[IPQC AB module 路由](../../app/api/ipqc-ab/workflow/route.ts)、[例行文件](../../lib/routine-fqc.ts)、[權限 cell catalog](../../public/process/access-policy.mjs)。其他模組 scope 見 lib/*-workflow.ts 與 app/api 對應路由。

## 已實作的小批

[master-page-boundary.ts](../../lib/master-page-boundary.ts) 取代「四份 AB.catalog／AB.lines／C.catalog／C.lines 就等於四個頁面」的推定，產生三個新所有權投影：AB catalog、C catalog、單一線別工段頁。PROCESS 原樣保留。舊 split-v1 與 line reducer 仍是未啟用相容證據，沒有冒充新整頁 writer。

預演必須固定同一來源 revision、完整 root SHA-256 與 AB/C/PROCESS 已核准版本向量。任何完整 root 變化（即使只有私有收據改動）、版本不符或尚未 hydrate 的歷史／working／saved／案件／PROCESS／extension body 均拒絕。取得來源後先複製再雜湊，防止 await 期間混入另一版本。

新文件只投影已核准內容；全部原 root 另保留於 `retainedSource`，含 working、saved、pending、歷史、收據、ID、照片引用與未知欄位，不改 status、不重建任何 Save／案件／核准人。這只是記憶體保全證明，**不是已驗證的 DB/R2／媒體備份**，不得作公共 API 回傳或提交真資料到 Git。

額外 Save 邊界驗證限制 AB/C catalog 只能寫自己的集合；LINES 的單次 ordered batch 可包含 AB/C 工段，但不能含 products/categoryGroups／PROCESS、整個 partition 或集合覆蓋。它不取代權限、真實引用、guards、CAS、世代、pending 及原操作收據驗證。

實際 HTTP 前置守門現在拒絕任何尚未支援的 `page` marker，防止新 caller 被忽略標記後落入舊 combined AB/C writer。新 preview 沒有 HTTP、storage、環境開關或啟用 writer；舊 route 其餘行為保留。

等待業務決定期間，另增 [master-page-name-save.ts](../../lib/master-page-name-save.ts)：只處理已存在線別／工段的名稱，整頁 ordered Save 在記憶體完成後只回傳一個 working＋saved＋sequence＋receipt 結果。後批 guard／validator 或權限失敗不改來源；沿用 shared kernel 的世代、pending、原 receipt 身分與精確重播。同次暫改又復原的欄位保留原貢獻者，不把中間態的修改者寫進最終 Save；其他真正修改仍歸屬實際操作者。只接受 `master:LINES` 所有權及完整 owned history，不建立初始草稿、不推定 ACL cell、不接 HTTP／storage/CAS；新增刪除、code／路線／結構與 PROCESS link 均不由此元件處理。未決的舊資料切換和分區權限沒有被預設或繞過。

測試以兩個合成編輯者及另一審核者呼叫真實 Save 元件與 shared kernel，驗證單一完整案件、整頁鎖、撤回／發回／再送、核准、原收據、序列化重開及非衝突保留；UI 全組選擇、真正 Begin、HTTP 身分驗證、CAS、備份媒體還原仍未測。測試中的 context 為合成授權，不代表已採納 `lines.*`／AB/C 可見性政策。

獨審補充後，名稱元件的 patch／guard 實體 selector 僅接受純 `{id:string}`（非空 ID），拒絕額外鍵、陣列或缺少字串 ID 的 selector，避免同一實體的不同外觀被誤當不同 contributor intent。拒絕發生在 staging 前，不修改原命令或 fingerprint；共用 kernel 與既有 writer 的相容格式不變。

## 資料安全演練與重大發現

[master-page-retention-snapshot.test.mjs](../../tests/master-page-retention-snapshot.test.mjs) 使用既有 record encoder／verifiedRecordRestore、分發快照匯出及 isolated-local restore，全部為記憶體 fake DB/R2。8 組測試涵蓋原樣業務 root／待審／原收據保留、尚未 hydrate 歷史與 partial read 拒絕、歷史 body／原 archival string 缺損或破壞、歷史／待審專用媒體缺失、來源改版、傳輸毀損及非空目標保護。分發演練另逐 byte 核對四份合成媒體（含跨 chunk 的待審圖片）；source fake DB/R2 沒有被 exporter 寫入，目標只寫 isolated memory bindings。

**已重現用途不相容：去機密分發快照不是原樣 cutoff 還原備份。** 現有 `snapshot-redaction.mjs` 的 `cleanJson` 會遞迴解析 JSON 外觀的字串，再去機密並 JSON.stringify。合法的自由文字／名稱若包含帶空白或 `1e2` 的 JSON 字串，分發重開後會改文字；原操作 fingerprint 字串若含該值也一起改變。合成資料中完整 root digest 與 fingerprint digest 均不同，原請求重播得到 `OPERATION_ID_REUSED`。穩定 ID、pendingId、版本數及媒體仍可存在，不能以它們判定原收據相容。這是目前分發 port 的已確認限制，沒有認定真實資料已受影響，也沒有在本題擅改全域 scrubber。

現有頁面預演使用原來源 pins 時會以 `MASTER_PAGE_SOURCE_CHANGED` 擋住這個分發重開結果；原樣 record restore 路徑則保留文字及 fingerprint，原請求可精確重播。原樣還原依下方精簡方案處理，不能以去機密分發快照代替。

## 精簡原樣保留／還原方案（文件準備，未執行真資料操作）

依 Frank 最新要求，**不新增備份診斷程式、排程、服務或維護入口**；本次只整理既有能力與已取得的合成證據，也不修改既有備份／redaction 程式。沿用受授權的維護流程時，最少保留以下四類，不額外複製每份畫布或每張案件成另一套業務資料：

| 保留內容 | 最小可驗要求 |
| --- | --- |
| 一致的完整 DB 原樣快照 | 含 schema、業務資料、working/saved/pending/active/history、receipts、sequences/generation、帳號／角色關聯及適用的撤銷／操作紀錄；不只摘出目前已核准 master root 或分發 port 的三張表 |
| 完整 R2／媒體來源閉包 | 保存每個被目前或歷史／待審引用的 immutable body、allocation index、`legacySources` 原字串及媒體 bytes；沿用原 key／ID／路徑。未分類物件先保留，不憑名稱當快取刪除 |
| 程式與版本識別 | 固定相容程式 commit、schema、全域 revision、master root digest 與 AB/C/PROCESS approved vector；必要的未提交成果另保全。這些 pins 要在整理／redaction 前從原來源取得，不能由轉換包自我產生 |
| 一份受控核對紀錄 | 記錄原樣備份及媒體的大小／SHA-256、物件／案件／版本數、原 receipt fingerprint 摘要，以及適用帳號／權限差異；只公開摘要，不把真實 payload、驗證資料或解密材料提交 GitHub |

只用無損壓縮或保留同一內容雜湊物件一次來減少重複，不能刪除看似相同但有不同原字串的 `legacySources`、舊收據或歷史。可重建的 build、node_modules、cache、測試輸出和診斷日誌不列為業務還原內容；沒有新增清理或刪除操作。

還原演練沿用既有受控流程，在**全新空白隔離目標**依序完成：

1. 固定原來源與獨立 pins，核對來源沒有改版；取得完整原樣副本及必要既有解密存取，不啟動新的備份服務或建立新憑證。
2. 先驗原始檔案／物件 hash 與 DB 完整性，再還原完整 DB 和 R2／媒體；保留原 owner、ID、路徑、status、世代及 receipt，過程不做 Begin、Save、Submit 或自動採用新 scope。
3. 依原來源逐項讀回：全部草稿／待審／歷史內容、案件與版本數、關聯、原文字／fingerprint、媒體 bytes 及權限。原收據用原 owner 的唯讀查詢核對，不向真系統重送原 POST；合成測試中的 kernel replay 不是重新執行真實寫入的授權。
4. 所有必要比較 PASS 才標記「該隔離還原已驗證」。缺 body／媒體、hash 或原 receipt 不符、來源改版、目標非空或還原不完整時保留副本與證據，不切換。正式拆分另受既有三項決策與完整 adapter 驗收限制。

切換前的原樣備份不能直接蓋回切換後的新寫入；若正式切換後已有新資料，先保全該狀態並另定前進修復／合併方案。本文件不授權覆寫現場或自動回退。

| 既有能力／證據 | 本方案可用範圍與目前結果 |
| --- | --- |
| `state-records-restore.ts`／現有 8 組合成演練 | PASS：驗全部 reachable record body／原 archival string，缺損拒絕；完整 hydrate 後保留原文字、pending、receipt。它本身不建立完整 DB／媒體備份 |
| 同一合成快照演練 | PASS：四份媒體 bytes、歷史／待審專用媒體缺失、來源改版、毀損傳輸和非空目標保護；並重現分發快照用途不相容。全部為 fake bindings，沒有真資料 |
| [既有 local ZIP 工具](../../lib/local-backup.mjs)／[CLI](../../scripts/backup-cli.mjs) | 是本機 `.wrangler`／SQLite／R2 目錄工具，會寫設定／稽核並有 retention 行為；這次不執行，不能直接套成雲端站的原樣備份命令。沒有在 Linux 上重跑其 Windows `tar.exe` 測試 |
| [既有部署／快照流程](../../DEPLOYMENT.md) | 去機密分發 port 另有用途；分頁資料查詢不是完整備份。現有能力不足以宣稱選定雲端站的完整原樣 DB/R2 還原已驗收 |

本次方案已可審查，重用 6645b42 的合成證據且未修改其測試或產品來源；不重複跑沒有受影響的 suite。**真實完整 DB/R2／媒體原樣備份與還原仍 NOT_RUN**，沒有執行 cutoff／adoption、改權限或啟用拆分。若現有選定環境沒有受授權的完整原樣取得／還原能力，就停在這個邊界回報；本題不另造備份診斷程式來補位。

## 尚需使用者決定的具體事項

1. **舊 combined 草稿如何切換。** 建議在舊流程正常結清待審及需要保留的未核准修改後，再從固定已核准版本建立新頁面草稿；永久保留舊版本、saved、案件和原 receipt 命名空間。若要帶著未結清 combined 草稿並行切換，必須另設舊案可處理範圍、交叉鎖及衝突政策。本預演只保留並列問題，不自動撤回／發回、清空、假核准或轉成新案。
2. **單一線別頁內的權限。** 操作應對應 `lines.*`，不沿用 AB/C 編輯／送審權。AB-only／C-only 帳號是否可保存與送審包含另一分區內容的整頁快照，需要決定：建議允許有對應資料查看權的分區編輯，整頁送審／審核要求能查看全部案件內容；不可顯示隱藏分區，也不可默默漏掉它。這是建議，尚未寫入 permission policy、帳號或範本。
3. **例行 FQC 例外。** 它目前每張文件一份，與主資料 FQC 分開。請確認「同頁一份」是否只指主資料編輯頁並保留例行文件邊界。

依本次委派明示「重大架構、資料與權限的合併需使用者決定」及 [AGENTS](../../AGENTS.md) 的資料／發布界線，先交付具體候選再等決定。沒有要求重新確認已授權的本機開發，也沒有任何自動審查拒絕。

## 後續接線與整合順序

- 固定實際來源、完整 DB/R2／媒體可還原備份與 cutoff，隔離演練。將 legacy archive 保持原 owner 及 receipt 查詢，不以新 scope 的 404 推定未寫入。
- 單一 owner 接 storage codec／讀取投影／CAS 與 writer inventory，原子接線 AB/C catalog、LINES、PROCESS link；舊 client 明確拒絕寫入新所有權。不可只改 URL 或打開 flag。
- 再接 line-admin／AB／C client、主資料審核平台、withdraw/history/readonly approved selector、引用與 runtime catalog；AB/C 只讀已核准 LINES。pending 及 PROCESS 關聯需同交易保護。
- 本批共用衝突點：`master-document-boundary.ts`、`abc-local-save.yml`、SHARED_DRAFT、WHOLE_MODULE_DRAFT、MASTER_DATA／DATA_MODEL、HANDOFF／CHANGELOG。與全站候選及 #99 語意合併；不要整檔覆蓋 master-shared-client、master-workflow、app.js 或 process-stage-link。
- 在最終合樹上以兩身分測各頁完整生命週期、視角切換保留、跨畫布不覆蓋、整組 mine/peer/cancel、選後再換版、撤權、UNKNOWN、不重送、備份還原與 linked PROCESS。未完成前不稱全頁拆分完成。

## 驗證與交付狀態

實際命令及最終輸出保留在工作區 `module-draft-boundary-evidence-20261109/`，摘要隨本次交付提供。新測試已加入 AB C local Save CI，沒有放寬既有測試。測試重用工作區既有依賴，沒有安裝、seed 或啟動開發服務。

- PASS：新頁面邊界／純預演的 11 組合成契約；實際 GET/POST 的 reserved page/split admission，DB/R2 零讀寫。
- PASS：單一 LINES 名稱 Save／真實 shared kernel 17 組合成契約，DB/R2 零讀寫；補上「暫改再改回」的貢獻者負控制、混合真修改及線別／工段／guard selector alias 反例。修正前會留下假貢獻者或接受 alias，修正後保留原歸屬並在 staging 前拒絕非純 selector；它不是完整新頁面 adapter 的生命週期驗收。
- PASS：資料保留／快照用途分界 8 組合成演練，含上述已重現的分發 port 限制及 cutoff 安全拒絕。合成目標 R2/DB 寫入不等於真實持久資料寫入。
- PASS：既有 document boundary 13 組、未啟用 line reducer 42 組、master workflow 及 stage link 8 組定向回歸。Line reducer 仍是舊 AB.lines/C.lines 隔離契約，不能算作新 LINES 的生命週期驗收。
- PASS：全專案 `npm run lint -- --format unix`、`tsc --noEmit --incremental false`、`git diff --check`。最初的型別窄化錯誤已修復，保留最初與最終日誌。
- PASS：首次合併 #99 後，在獨立乾淨 clone 重新執行當時的 11／14／8 組契約、document boundary、line reducer、master workflow、20 項 stage catalog、stage link、lines API 及 307 項 legacy bridge／Begin／permission／receipt 回歸。來源邊界、全專案 lint、型別與受控 build 也通過；沿用同版本既有安裝依賴，沒有重新安裝或改 build guard。後續未啟用名稱元件的貢獻者修正採 15 組及 lint／型別定向驗證；其餘實際 UI／API／writer／kernel 未變，既有結果按範圍保留，遠端 CI 綁定各自 head。
- NOT_RUN：新所有權 storage／CAS／HTTP／UI 全生命週期、雙身分、正式帳號、真資料遷移與備份還原、原生瀏覽器／手機／IME、Cloudflare 實站。
- NOT_RUN：新獨立候選的遠端 CI／原生瀏覽器；後續接線後須重新驗證真正最終程式。本機 build 不代表正式站或全部瀏覽器驗收。
- GitHub：本批只準備獨立草稿 PR，實際上傳／PR 狀態以遠端回執為準；不宣稱已合併或部署。舊 243-path create_tree UNKNOWN 與先前檢具 create_tree 拒絕保持原狀，本批沒有重送舊 payload、拆包接續或改用遠端路徑繞過。

沒有 schema／正式資料變更，沒有修改帳號／角色 cell，也沒有啟動或重連 C2C 連接器。

## 審查與其他 PR 的相依

首次讀回 #102 的 head `b172aaf53e6c2da6f9c5b1a6b331d15944340c03`：AB C local Save 與 PROCESS local Save 通過，Local safety 尚在執行；該結果不能冒充後續 head 的結果。當時沒有 GitHub review 或 comment。第一個貢獻者問題由作者自查重現並補回歸，不當作獨立審查通過。

隨後另一位審查者獨立核對 head `ee7d4fdc750ab5227f25559f52c9edac62b09086`／tree `fb3d634de91cfbfe52de9952bae0f22711e0a2d9`，實跑相關合成／lint／型別檢查，並以純記憶體案例重現一個 P2：額外 selector 鍵可把同一欄位分為不同 intents，繞過 reverted contributor 修正。此問題限未接線元件；已補 canonical selector admission 與 17 組回歸，保留修正前負控制。複審結果綁定其實際 tree 回執；獨立 Codex 審查不代替 Frank 的架構／資料／權限合併決定或 GitHub 人員審核。

| 對照 PR／本輪 head | 與 #102 的直接重疊 | 整合準備 |
| --- | --- | --- |
| #100 `158bb6b7ad3b98eda8104ef9a271073ee1caf0b3` | CHANGELOG、SHARED_DRAFT | 背景輪詢政策與頁面所有權規則可並存；文件需保留兩者新段落。沒有現用程式檔案重疊，也沒有啟用新頁面元件的依賴 |
| #101 `8f1f24321764d7aaa51941bce8c48b2b6634ac6d` | CHANGELOG、HANDOFF | 畫布總數修正與本批守門／未啟用元件分開；文件標頭需語意合併 |
| #88 `f0e9ae37731411801fda72c2e8843d30e467d091` | CHANGELOG、HANDOFF | 沒有本批 runtime 依賴；#88 自身舊基準與 IQC 驗收由其 owner 另行確認 |

以上是指定 head 的檔案／來源分析，沒有執行三批的合併、沒有把文件無重疊推定為完整合樹驗收，也不要求先合併 #102 才能處理其他批。未發布的全站整組衝突、權限與版本查看候選仍須在真正最終來源另驗，不以這張表推定相容。
