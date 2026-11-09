# 各功能頁草稿分界：盤點與切換前置候選

基準：GitHub main `d4ac309fe05c89288af226b52c18161865ccdcb8`。本分支為獨立小批，沒有帶入其他未發布候選；不是全頁拆分已完成，也不是可發布版本。

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

等待業務決定期間，另增 [master-page-name-save.ts](../../lib/master-page-name-save.ts)：只處理已存在線別／工段的名稱，整頁 ordered Save 在記憶體完成後只回傳一個 working＋saved＋sequence＋receipt 結果。後批 guard／validator 或權限失敗不改來源；沿用 shared kernel 的世代、pending、原 receipt 身分與精確重播。只接受 `master:LINES` 所有權及完整 owned history，不建立初始草稿、不推定 ACL cell、不接 HTTP／storage/CAS；新增刪除、code／路線／結構與 PROCESS link 均不由此元件處理。未決的舊資料切換和分區權限沒有被預設或繞過。

測試以兩個合成編輯者及另一審核者呼叫真實 Save 元件與 shared kernel，驗證單一完整案件、整頁鎖、撤回／發回／再送、核准、原收據、序列化重開及非衝突保留；UI 全組選擇、真正 Begin、HTTP 身分驗證、CAS、備份媒體還原仍未測。測試中的 context 為合成授權，不代表已採納 `lines.*`／AB/C 可見性政策。

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
- PASS：單一 LINES 名稱 Save／真實 shared kernel 14 組合成契約，DB/R2 零讀寫；它不是完整新頁面 adapter 的生命週期驗收。
- PASS：既有 document boundary 13 組、未啟用 line reducer 42 組、master workflow 及 stage link 8 組定向回歸。Line reducer 仍是舊 AB.lines/C.lines 隔離契約，不能算作新 LINES 的生命週期驗收。
- PASS：全專案 `npm run lint -- --format unix`、`tsc --noEmit --incremental false`、`git diff --check`。最初的型別窄化錯誤已修復，保留最初與最終日誌。
- NOT_RUN：新所有權 storage／CAS／HTTP／UI 全生命週期、雙身分、正式帳號、真資料遷移與備份還原、原生瀏覽器／手機／IME、Cloudflare 實站。
- NOT_RUN：完整 build／遠端 CI；本批未改前端資產，純規劃模組尚無 runtime consumer，實際 admission 改動已有 handler 定向回歸。後續接線後須重新驗證真正最終程式。
- GitHub：此批尚未上傳、建立 PR、合併或部署。舊 243-path create_tree UNKNOWN 與先前檢具 create_tree 拒絕保持原狀，本批沒有重送、拆包上傳或改用遠端路徑繞過。

沒有 schema／正式資料變更，沒有修改帳號／角色 cell，也沒有啟動或重連 C2C 連接器。
