## 2026-10-13 搜尋與歷史

需求唯一來源為[規格第 9 節](../../docs/specs/current/ROUTINE_FQC.md#9-搜尋與歷史2026-10-13-更新)，分層驗收與限制見[搜尋驗收](../../docs/routine-fqc/20261013-search-acceptance.md)。新增 public/process/routine-fqc-search.mjs：buildSearchIndex 建唯讀關聯索引，querySearch 以工作期別、來源身份、同項產品条件查詢；15 個分類數量獨立、兩區單選。有效正式報告依樣品追蹤失敗及核准更正鏈；原文件明細不被目前結果覆寫。

routine-fqc.js 僅在歷史頁掛載獨立搜尋 UI；同語言更新保留輸入 DOM、組字時延後刷新；原項目回查延後到資料載入再套用。歷史讀取不 Generate，離開歷史回到正常工作分頁沿用原同步。CSS 限定 rf-history，手機單欄明細與返回位置避開固定頁首。

GET /api/routine-fqc?search-preview=1 使用原 view gate，從正式啟用可解析來源及既有未來工作投影下一期，不写資料、備份、收據或 R2。既有 ?preview=1 排程設定 gate 保持。無 schema、migration、權限配置或持久資料模型變更；索引、查詢、返回堆疊與預覽只在記憶體。

## 2026-10-12 最新樣品選取與報告識別

最新使用者回饋取代10/8同報告跨列重測介面：ResultRow.samples沿原string[]格式，但新選取最多一個、同一Line跨列不重複，已測送審要求一個；unable仍空白。structure拒絕新非法選取，未變更的既有樣品陣列保存相容；reportIssues在新送審阻擋違規。requiredSamples不可patch，create followup以固定原樣品生成空白列；buffer只可補入尚無實測樣品的既有非unable列，不新增列或重配測量證據。RTS/COR前綴用於新文件；displayNumber提供舊號別名，legacyNumber顯示原號，無資料遷移。

resultOpen／sampleOpen只在瀏覽器記展開狀態；所有重畫先讀現有details，照片上傳不增列、不展開其他列。draftPhoto移除buffer引用，不DELETE照片；上傳的photos陣列在await之前固定。舊原樣品／正式報告與失敗聚合保留。驗證與限制見[本輪報告](../../docs/routine-fqc/20261012-sample-feedback.md)；需求見[現行規格最新節](../../docs/specs/current/ROUTINE_FQC.md#2026年10月12日單樣品與複測回饋)。下方10/8同樣品重測為當時實作記錄，已由本段取代。

# 例行 FQC 資料模型與執行方式

2026-10-07。需求唯一來源：[ROUTINE_FQC](../../docs/specs/current/ROUTINE_FQC.md)。本文件描述實作；驗收及本機整合結果見[驗收報告](../../docs/routine-fqc/20261007-acceptance.md)。

## 持久化與權限

- `shared_state.values.routineFqcControl`：schemaVersion 1，revision、startDate、jobs、documents、cases、receipts、events。沿用 D1 單列 revision CAS、records-v1/R2 儲存及 `backupStoredState`，不新增 SQL 表或 migration。
- `routineFqcEnabled='1'`：3000 的增量啟用旗標；3040 依本機埠啟用。日常不匯入隔離 control 或起始日。
- 專用 `/api/routine-fqc` 讀写；generic shared-state 不允許寫入此 control，publicState 刪除私有 control。所有操作重新核對登入、權限及 maintenance；文件核准沿用 approval 權限，一般 staff 不新增核准權。管理起始日使用 `master.import`，反確認使用 `approval.revoke`，更正使用 `approval.revise`。
- 每份 plan/report/waiver/disposal 各有 `SharedDraft<Content>`；scope 是 `routine-fqc:<id>`。Apply 使用欄位 guard；Save 固定整份 working；Submit 指向已存 savedId；核准／發回／撤回指向 pending caseId。Admin 自審需明確勾選，actor/time/selfReview 寫入共同案件 result。
- root operationId+actor+命令指紋是可重試收據；所有資料與收據於同一次 CAS 生效。未知回應先查本人收據，再重試完全相同命令。不同文件不共用 pending 鎖。全庫還原檢查包含例行 FQC 的 pendingId。

## 工作、文件與异常

`Job` 的 identity 由 itemId＋起日＋截止日構成，保存期別及不可變 `Source`：來源標準 ID/版本、生效日、項目 ID/名稱/編號、線別、類別、錯誤代碼、當次說明及涵蓋產品 code/name。安排計畫立即保留 job，避免多人重複占用。只用正式生效、啟用且時間頻率可解析的 FQC 項目；未知／自訂頻率列預覽待確認。

篩選來源保留現行正式來源與歷史工作快照，先依線別／類別選候選，再按itemId整理選項；同範圍正式來源優先，歷史獨有範圍標示歷史版本。不得先以itemId合併而覆蓋現行名稱或丟失舊分類；既有文件搜尋與明細繼續使用當次快照。

`Document` 保存 id、不可重用 number、kind、owner、createdAt、planId、caseId、correctionOf、共享草稿及下游影響。`Content` 保存 title、實際 date、notes、lines、reason、disposition、evidence。每條 Line 保存 jobId 和 Source；每個 ResultRow 分別保存 samples[]、outcome、value、notes、photos[]。樣品必須來自該項目當次涵蓋產品，不得跨項或在同一結果列重複；不同結果列可重測同樣品；無法測試的 samples 必須空白。

送審必要內容是本模組的 error，沒有改共同主資料政策：合格需樣品與實際值；不合格／無法判定需樣品、說明、成功上傳照片；無法測試需原因且不造樣品。處置需原因、處置及證據；免做需原因。缺漏可 Save。

`Case` 依工作串連初測及每次複測文件、必要複測樣品、改善紀錄、照片、事件與操作者時間。`open → retest → ready-close → closed`；合格複測核准不自動結案。再不合格須新增改善再複測；每次報告保留。無法測試先建立需核准的補測 plan，再建 report；或獨立 waiver 核准。disposal 保留 fail，waiver 不等於 pass。工作完成、計畫全項完成、異常結案分開計算。新期工作不關閉舊案。

複審第二輪：每份新複測文件的 `Line.requiredSamples` 固定當時應複測樣品，與 `ResultRow.samples` 實測分開；舊資料缺省為空且不批次回填。無法測試列不造樣品，可因原因完整而核准留存，Case 保留未測義務；後續真正量測仍須涵蓋原樣品。依固定報告歷史推導的 `unresolvedFailureSamples` 是讀取投影，未驗證的不合格不能用免做關閉，仍可依正式證據申請處置。

更正保存 caseId／planId／correctionOf；一般初測報告涉及多個案件時，按原reportId與jobId找回各自案件。已結案報告的更正會留原結案事件，加入重新確認事件，再按核准後實際結果進入 open／ready-close，需另外確認結案；免做／處置更正保持原終止狀態並增加核准歷史。後續案件狀態已變更時阻止用舊終止文件覆蓋。缺失或不一致的案件連結於送審／核准前以422／409回覆，不直接解參照造成500。

正式內容 immutable。2026-10-13 更新為不可復原捨棄：草稿非待審才可捨棄；正式計畫需 approval.revoke 且無相依報告／案件／更正版，才可刪除。`Document.cancelled` 保存 actor/at/原狀態，`lifecycle[]` 保存捨棄與復原歷史；不刪 SharedDraft、照片或案件。初始計畫捨棄只釋放其仍占用的工作；報告草稿捨棄釋放本次報告占用；複測草稿移除回到原異常 open，不把處置草稿當結案。復原入口已移除，restore-document 回覆 RESTORE_DISABLED（409）；舊資料 cancelled/lifecycle 不回填，既有歷史相容。需要重做時建立新文件，不能重新啟用已捨棄文件。

`planFamily` 沿 correctionOf 推導根計畫，`reportAvailability` 逐 jobId 回傳已有報告 IDs及assigned，前端與 create-report 使用同一判斷。assigned只接受目前job.planId指向同一家族的未取消、已核准計畫，或仍open/retest的補測案件；取消新版後舊formal不自動重新占用，報告復原也不能搶已改派項目。現有 plan10 更正版與 plan9/report20 關係不回填、不改 status；預設計畫清單只顯示目前占用家族的目前版本，原版留搜尋與版本歷史，最新計畫接續原報告。GET 增加唯讀 familyId、reportAvailability、dependencies、workingIssues、savedIssues，無 schema/migration。後台來源改名／停用／改版不改 Source 快照。

僅 trusted routine-fqc adapter 的 `optionalReasonPolicy` 允許本 scope Submit/Withdraw 不填操作理由；其他模組仍沿用原限制。核准不用理由視窗，Admin 自審在固定 pending case 旁明確勾選，換案件即清除；發回保留必填修正意見。必要缺漏在 UI 顯示待補並有穩定 line/result ID 的修改導引，後端仍是阻擋 error，不能因此送審。合格免填問題原因，但實測樣品／數值仍必填，處置照片仍成功上傳才能送審。

## 曆期與交接演算法

公司日由 `Intl.DateTimeFormat` 的 `Asia/Ho_Chi_Minh` 取得；日界線 UTC+7。日期演算以日字串的 UTC midnight 計算，避免主機時區及夏令時間偏移。

| 頻率 | 起訖 |
| --- | --- |
| weekly | 星期一至星期日 |
| monthly | 每月 1 日至月底 |
| quarterly | 1–3、4–6、7–9、10–12 月 |
| semiannual | 1–6、7–12 月 |
| yearly | 1 月 1 日至 12 月 31 日 |

第一次從 max(管理起始日,正式生效日) 所在當期納入；不往前補舊期，未來起日未到不產生工作。已有文件後不能改起始日；尚無文件可經預覽重新確認，舊起始日留 audit。

有舊工作時，下一段從最後截止日的翌日開始，套用目前正式頻率的曆期終日。頻率變更的首段可縮短，再對齊曆期。例如月轉週：10/31 結束舊月，11/1 是過渡週的最後一日，下一週 11/2–11/8；無空窗、無重疊，不刪舊工作。預覽會包括下一尚未產生期別，即使它在未來。

執行採請求時補齊：開啟 FQC 時生成截至公司當日的工作；頁面同步檢查日期與來源變更時補齊。關頁／停機後下次開啟補齊，不另外建立系統服務或任意開埠。產生工作仍需已設定起始日及有編輯權限的登入；只讀者不觸發寫入。

## 照片、搜尋與匯出

六項使用者回饋補充：[驗收與四項手動演練](../../docs/routine-fqc/20261007-feedback.md)。`routineCatalog` 是讀取投影：正式AB分類／產品分類＋有效FQC錯誤／項目分類，包含無定期項目的類別；後台A/B/C線別及歷史快照身份可查。`routineSources` 獨立限制正式啟用時間頻率，實際後台 `half_yearly` 映射為半年曆期，不再列待確認；未知頻率仍不猜。無資料回填或migration。三級連動清除不相容下層、來源項目回查先清理舊篩選；同步後清除已安排勾選但保留其他範圍有效選擇。工作列同欄顯示正式結果、案件狀態、不可安排原因與下一步，草稿／待審標示不能當正式結果。

`/api/routine-fqc/photo` 驗登入／權限、maintenance、25 MB、MIME 與圖片簽名；不可變 R2 key `routine-fqc/photos/<sha256>`。PUT 成功才加入結果列；文件寫入再核對 R2 head。GET 採 private cache，其他埠不同儲存與 session。3040 使用 `process_demo_3040` 及独立 session secret，3000 保留原 cookie。

主頁、後台例行報告資料庫、原 FQC 項目回查、版本台共用同一 control 與權限。搜尋涵蓋產品快照，同時明示實測樣品，不將所有涵蓋產品標合格。正式匯出從 active.content 取得，下載獨立 HTML，圖片以已授權 GET 的實際 bytes 內嵌，包含版本與審核稽核；沒有直接複製視覺參考 HTML。

## 2026-10-08 清單、階段與原樣品引導

`routine-fqc.js` 在重畫後恢復頁面／祖先容器／左清單與明細捲軸，桌機列點選阻止預設焦點捲動並用 preventScroll 聚焦，CSS 關閉此區塊的自動捲軸錨點。手機維持選取後進入明細。工作進度快捷只篩選檢視，不縮小 Save/Submit 範圍；草稿優先、型別標 RPT/DSP/WVR、選取列與目前文件編號同步，連結開啟的歷史文件不因主清單系譜投影而失去標示。

`documentStage` 明示文件階段與下一步，核准不代替異常結案。計畫依原 reportAvailability 接續同系譜草稿／待審；不可新增報告時顯示目前計畫／異常入口。Routine adapter 只整理自身 VersionDraftUI metadata 和樣式，保留既有按鈕、事件與共用元件。

複測指南讀既有 `Line.requiredSamples` 與同項目 case 的必要樣品（更正沿 correctionOf 找原案件）。原報告唯讀；建立樣品列只編輯目前 buffer，不自動儲存／送審／寫入結果。必要原樣品已選時不可取消，重複列例外允許移除重複；無法測試仍清空實測樣品。待補使用目前 buffer 並即時更新，同列重複／越界樣品為報錯，不同列重測允許；原項目缺漏定位到建立結果列入口。未新增持久欄位、migration 或 API 寫入路徑。[11項驗收與限制](../../docs/routine-fqc/20261008-navigation.md)。

## 2026-10-08 複測狀態與範圍標記

前端 `followupState/retestActions` 讀取既有 caseId、文件狀態、改善時間與 reportAvailability。建立複測及收回後留在案件；草稿使用原 `discard-draft`、expectedRevision與operationId流程，不另建取消API。待審改開啟文件／撤回指引；核准補测計畫改接續填報；已有申請、改善缺漏、相依及結案原因就近顯示。並行更新衝突後先重新讀取，再顯示原失敗原因；未知寫入結果仍查receipt／重試原operation。

`s.highlight` 僅為本機視圖；尚待完成對應無completion工作、未結案對應非終止案件，不合格含原正式失敗歷史。統計與快捷同色標記、再次點選取消，未匹配列保留。文字徽章與aria-pressed使狀態不只依靠顏色；選取文件另有藍底。異常列表移除文件進度快捷。無持久欄位、schema、migration或後端規則改動。[4項驗證與界線](../../docs/routine-fqc/20261008-actions.md)。

## 2026-10-08 計畫報告、分組定位與同樣品重測

前端planReportState沿reportAvailability逐項判斷可建報告，計畫階段區分尚未／部分／已建報告並接續同系譜文件。groupedList分別建立文件與案件框、數量及分類定位；jumpListGroup只改rf-scroll及preventScroll焦點，不寫資料。holdFilterView保留頁面可捲高度，避免移除明細時瀏覽器夾縮scrollY。Modal自備Routine色彩變數，確認文字與焦點可見。

followup report接受既有cmd.notes：非空時在同個kernel/CAS/receipt寫入improvement及事件，再建立複測文件；原分步改善仍相容。先核對未終止、無後續草稿／待審、權限和必要改善，失敗無部分寫入。沒有新action、schema或migration。

repeat-result在當前buffer新增同samples、独立ID的空白列，無自動保存。structure允許跨列重測，仍保護同列唯一、涵蓋範圍、100列上限、ID及requiredSamples。unresolvedFailureSamples按每份正式報告各樣品所有attempts聚合：任一fail保留失敗，all-pass才解除，pass＋undetermined不解除既有失敗；不依結果列順序。原正式快照、Case requiredSamples及歷史維持既有關係。逾期投影是job.end<today && !job.completion，異常結案另計。

[本輪驗證、10個DEMO與復原限制](../../docs/routine-fqc/20261008-plans-groups.md)。十個DEMO經既有來源Save/Submit/明確Admin自審/Approve/Generate增量建立，原項目及documents/cases/jobs保全；後續使用者紀錄不可用前置快照覆蓋。

## 2026-10-13 文件色彩與照片編輯

`.rf-app [data-rf-tone]` 統一文件分類色票；`reportType/searchKind` 依既有文件身份決定 PLN/RPT/RTS/COR/WVR/DSP，cross-document link 在 bind 時按 id 查型別。搜尋卡、文件列及分組標頭採相同色彩變數；結果徽章獨立。取消列永久排除搜尋（舊 state.cancelled 亦無效），移除取消顯示選項與前端復原命令；核准歷史列表不列 cancelled。

`draftPhoto` 顯示紅色移除按鈕（44px），適用結果列及處置證據。上傳成功去除同張重複引用並呼叫 touch；移除只編輯目前 buffer，下一次整份 Save 固定不含該照片的新內容。原有 immutable saves／正式歷史和共享 SHA256 R2 物件維持原資料政策；此操作不是全庫照片實體清除。無新增持久欄位、schema 或 migration。

[2026-10-13 追加驗收與限制](../../docs/routine-fqc/20261013-colors-photos-discard.md)。
