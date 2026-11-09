# 例行 FQC 整頁核准版本查看與舊封存撤權修正

本機真實合入草稿分界 `e5c3c780fac8413ede01809d5fc871ad0477a225` 與既有版本交付 `2e4d20f4560fe1480576680d07edcf903b67fef9`，保留製程基準679與#100。不是整檔套回972或舊Routine。製程後續5729／25305、88其餘UI及帳號權限候選仍由各owner協調，不宣稱完整整合；沒有上傳、部署、啟用marker或修改真資料。

## 已實作

- `/api/routine-fqc/page` 的 approved-only list/detail/permissions 綁定 `routine-fqc:page`，修正原422。只接受單一查詢種類與實際transport需要的 `compact=1`；拒絕重複、document、receipt、restore等混合參數。一般permissions補實際revision，沒有把歷史回覆當writer狀態。
- 由真實 `page.workflow.cases` 的完整approved creator/savedId/reviewer/time證據列新整頁版本，核對原immutable Save、before/base與caseDependencies。舊 `documents[].flow` 以 response-only tuple ID、原sourceScope/sourceVersionId保留；同case ID分屬兩份舊文件仍各自唯一，絕不偽造整頁共同核准。不列正式baseline、未存／未核准、pending／returned／withdrawn或不完整證據。
- aggregate SHA驗證後僅投影必要歷史metadata與所選內容引用；清單不讀current／歷史body。選detail才完整緩衝其原固定body，隨後重查session、角色view/history、enabled及全域revision，避免先回傳內容前綴。投影不存回、不作adoption／baseline，也不改原receipt。
- 原頁同一 `routine-page-approved-version`，新整頁與原文件核准分別標示；內容在原頁純唯讀，沒有歷史彈窗、還原、套用、Save／Submit／撤回。返回只讀fresh permissions，保留mine/base/generation、文件選擇／搜尋、建立佇列、原File物件、pendingSave及原UNKNOWN journal。瀏覽UNKNOWN不查收據、不重送；返回後才可明確查原workflow操作。
- 獨立display epoch保護舊DOM callbacks、直接Save／domain／receipt、一般metadata讀回與延遲body；Save／比較／上傳忙碌時不切換。正常install/finishSave先退休working顯示，防止舊control lease擋住正常重繪。真實RoutineFQCUI availability入口可導入此owner，舊每文件查看仍保留。

## legacyArchive P2

製程owner在5729合樹重現原 `legacyArchive=1` 最後permission await撤銷session，當次仍200、下一次401。此處修正原endpoint：完整hydrate／序列化原archive後，再讀fresh登入／view/history／enabled／revision及最後session，全部通過才回傳buffer。inline/records最後permission await的session、revision及view變更均拒絕；另延遲R2舊case正文直到撤權，不能洩出內容。原archive結構、文件／case／Save身分及原legacy receipt未轉換或刪除。

## 驗收界線

本批測試使用真實handlers／page元件／common client／kernel、簽章合成帳號、SQLite `:memory:`與Map R2；File保留與SHA媒體也只在私有fixture。初始fixture碰到舊API命名被projection ID helper遮蔽、缺媒體及compact GET攔截錯誤均已修正，未放寬產品guard；初始日誌留外部evidence。原生瀏覽器／iPhone／IME／實帳號／測試站及正式切換NOT_RUN，不重試既有socket／ptrace EPERM。

**尚存另一owner的照片PUT UNKNOWN P2：** e5 writer可能在PUT已存但ACK遺失後重PUT同File。此處未改寫該照片協定，不能拿本批workflow POST UNKNOWN測試當成照片UNKNOWN已修。需由草稿owner提供固定修正後再語意合樹；版本helper的忙碌／File／顯示epoch保護需一併保留。此為發布阻擋，沒有因本機viewer通過而解除。

完整來源保留原21個pins，另增真實page-history dfe及routine-page e5兩個比對target；不改任何舊pin／前身負例、不提高5MiB限制。當前變更資產逐一更新cache，保留舊歷史cache gate。最終產品／proof SHA、測試數與交付雜湊以本機receipt為準。GitHub原243-path create_tree UNKNOWN與equipment拒絕仍不重送、不拆分繞過；不是GitHub CI或合併／部署批准。

## 較早版本查看工作的唯讀交叉核對

Frank指定舊對話 `01a1b57f-bda8-75bf-a224-1320cc24a028`。Personal Context回報此對話不可用，房間訊息以該ID搜尋無直接結果；因此不聲稱已讀其完整turn或全部交付清單，也沒有啟動／傳訊／刪除舊對話。房間唯讀搜尋「BOM 核准」已完整取完32筆，找回2026-11-07的同頁selector／移除歷史視窗／BOM規則，以及11-08歷史底層與11-09 BOM本機整合的既有進度紀錄。這些對話進度不代替Git／測試證據，亦不產生新的上傳授權。

本機獨立核對：真實 `4960d74f0db395e34f2faef91325345b55c22927` 已是此分支祖先，且原BOM交付README／REVIEW記錄其parent合樹、原頁唯讀／回當前、原RAM／receipt、CRLF及淺clone修正。當前 `bom-workspace.js` 仍沿用原workspace與VersionDraftUI history model，沒有另寫BOM查看；共用viewer及read-only lease在此後全頁工作擴充。差異可由保留的 `bom_integration` exact projection逐byte回到真實4960；所有舊pins與負例保留，並在本次新runtime重跑BOM actual-common及全頁viewer檢查。原scope相容後端保留，不等同現行頁面仍有舊歷史彈窗／還原入口。

已涵蓋可核對的功能成果：BOM入口／同頁selector／純查看／返回原草稿、共用核准證據與最後權限fences、逐頁移除歷史彈窗，以及十三頁接線；本批只補後續新page協定和legacyArchive P2。無法直接歸屬舊thread的未見commit不猜測、不匯入；若有其他獨立交付需parent補具體SHA後另作差異核對。這是檢索界線，不是要求重新描述既有規則。

## 擴大回歸後的收尾

修正真實 `process-language-change` 會進入舊Routine `paint()`、清掉新page畫面的缺陷：page模式只委派原page runtime重繪，不讀伺服器、不動File／mine／history selection。實際RoutineFQCUI入口＋語言事件驗證歷史仍在原選單、文字轉越文、切回原File物件與原內容不變；新page／舊Routine兩個修改資產升到history2。

擴大source／legacy離頁首輪有49項失敗，根因為舊fixture要求現行程式仍存在已退役的beforeunload，連帶讓Save函式抽取無法建立。唯讀採用製程固定test-only提交7e409a0的同項修正：完整原beforeunload、Save SHA與所有負例改讀真正固定d4前身；另明確測現行沒有beforeunload、page owner delegation及舊busy/retry/dialog/inflight防線。不是刪除原負例、恢復輪詢或重開原生瀏覽器；目前actual common／全closure／signed handler測試獨立執行，不能把歷史函式測試稱作現行產品實測。沒有整批採用5729／7e runtime或其26-target證據。
