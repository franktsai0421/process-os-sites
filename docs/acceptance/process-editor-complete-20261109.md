# 製程編輯台完整目標與單一 PR 整合門檻

使用者最新要求：完整製程編輯台已討論修改一起放在同一個 PR。#101 維持草稿；8f1f243 的計數 CI 是元件證據，不是完整編輯台的合併授權。不得把既有 UNKNOWN 上傳透過 #101、新 PR、拆分或其他路徑重送。此文件與本機整合分支均不代表已上傳完整功能或測試站更新。

| 完整目標／驗收標準 | 已核對來源與目前狀態 | 尚未完成的整合門檻 |
| --- | --- | --- |
| 篩選後可切其他頁，不將自動空工段當未存 | b159/d1 已有比較修正；main021 隔離 f5d902c 功能複核 PASS，主線3紅反例修復 | 尚未進 main；最終完整樹與實際導覽須驗；40秒現象未重現 |
| 未存離頁不提示，放棄未送內容；關閉不恢復未存 | b159/d1 RAM-only 與 main departure guards；807 另處理同頁篩選 | 原始「切線／工段放棄」與後續「同頁仍同草稿」要在最終流程清楚區分；807 保留 RAM，不能無聲當成完全同一政策 |
| 一個存取草稿，方塊／表單／連線一起處理 | main已有原子Save核心；b159與d1有後續比較與UI整合 | 已在本機改回原確認的當前畫布Save；其他畫布修改／未完成表單保留，2個原候選失敗反例修復。legacy跨畫布原UNKNOWN收據相容與零重送保留；整組功能／角色／原子性仍須最終合樹重驗 |
| 送審整份已存製程，核准固定快照 | 現有process workflow與各候選保留固定Save/Submit/CAS | 存取未完成／UNKNOWN／他人pending時不可偷送；完整樹驗證整份快照 |
| 只在明確存取時比對；整組我的／對方／取消，保留非衝突 | d1與canvas/tooling候選有整組決策、fresh read、選後改版重比 | 全部放入同一來源樹後重跑；不得重送原UNKNOWN上傳；不能用局部PASS宣稱整合完成 |
| 刪除、連線、同編號新增與選擇期間再改均安全 | b159/d1有結構群組、依賴、revision與原收據pin | 兩使用者最終組合驗收；保留409與CAS／權限／pending／晚到回覆拒絕 |
| 移除同步、查看最新共享內容、未送恢復、復原／重作 | b159/d1含相關畫布UI改動；#100移除全站背景輪詢 | 逐一查頂部、全螢幕、快捷鍵、舊快取入口；UNKNOWN防重送紀錄仍保留 |
| 無固定4／30秒背景檢查，不以focus/visibility暗中同步 | #100已由Frank合併，main9fbba823；來源head158bb6b，無輪詢產品已納入本機共同底座 | 與d1、歷史client一起語意合併；保留明確entry/Save/Submit權限與fresh read，不抹掉read fencing |
| 畫布依已核准類別主要工段，C/GIA CONG可顯示設定5工段 | main categoryStageCodes 優先approved category.defaultStages；未設定fallback產品路線集合 | 真實類別、空類別、隱藏工段、舊引用實站核對，不能只用純函式當驗收 |
| 已核准線別／工段與流程類型／機器連動，缺自訂補自訂 | #99已合併main021f0f3，3CI與獨立審查PASS；新工段繼承已核准preset/catalog設定、獨立防碰撞ID | 不回填舊歷史或複製機器；新選機器依線別/工段；需實際新增→核准→類別→畫布測試 |
| 製程草稿與其他功能頁草稿／權限分開；同頁不依篩選另拆模組 | process:platform現有；#102 b172aaf為未啟用頁面ownership預演；line-admin仍未真正拆分 | 三規則已確認：舊草稿可不保留、A可整份AB送審、例行FQC整頁共用；完整codec/CAS/舊writer fences/PROCESS link/審核/歷史/UI及還原演練仍待#102實作驗證，不開flag冒充拆分 |
| 送審／撤回與審核確認權限分開；核准後不得撤回 | main與各workflow有既有guards，帳號／權限由別案處理 | 各角色與各入口在完整樹、真實帳號驗證；不得用admin成功代替拒絕角色 |
| 原頁只顯示已核准版本，唯讀；返回當前草稿，無歷史彈窗／回朔 | 本機已接固定3f6e736（含d1），API與部分模組前端PASS；另一owner後續9914864與bfa2650已提交PROCESS/IPQC AB/例行FQC及#100整合，但尚未納入此固定runtime | 畫布原頁只讀前端仍缺；另案已提交PROCESS模板機器／IPQC AB／routine前端，須以新凍結交付接入並驗證；不讀取其dirty測試／證據或以API PASS代替前端完成 |
| 存取後流程總數立即與畫布一致 | #101 8f1f243，獨立複核、36相關測試、build與598來源PASS；4CI全部PASS，但依最新單一完整PR要求保持草稿 | 元件尚未合併；舊版唯讀／篩選／新版Canvas API合入後重驗，不能宣稱所有數字皆修好 |
| 進頁、切頁、存取、送審速度，>5秒優化、>10秒優先 | 有局部合成測試；本批沒有實站效能證據 | 分別量測可操作時間與完成時間、記錄資料量及網路；40秒未重現，不縮短deadline來假稱修復 |
| 完整桌機、iPhone、IME、兩人生命週期與測試站驗收 | GitHub CI含隔離編譯瀏覽器；本機原生瀏覽器受環境限制 | 最終整合樹的草稿→存取→送審→核准→歷史、空畫布、類別/群組切頁、失敗與UNKNOWN必跑；實機/實站NOT_RUN |

## 安全整合順序

1. 固定實際 main9fbba823（含#99/#100）、#1018f、#100158、#102b172 與可重現的d1/807/歷史committed checkpoints。#101暫停單獨合併；各對話原工作樹不改、不取dirty檔當完成來源。
2. 在獨立本機分支保留#99與#101，語意合併#100；index保留所有實際修改，source/cache helper保留兩邊pins和負例。舊CI只證明舊head。
3. 合入已凍結的d1／歷史共同底座，再接807同頁切換；解開process-authoring、Canvas、shared client、index及來源帳本重疊。對存取當前畫布／跨畫布差異先明確定義驗收，不能悄悄改範圍。
4. 歷史owner後續已提交PROCESS／IPQC AB／例行FQC與main100整合；待完整凍結交付再接入，畫布原頁只讀前端仍未完成。#102未啟用前置可合入檢查，真正ownership/權限/資料切換依已確認三規則由#102續作，仍需完整安全驗證。
5. 完整來源樹固定後，重新生成精確current-file witnesses、所有歷史投影與cache tags；保留真Git血緣、hash/span、原拒絕與UNKNOWN防護，重跑受影響功能、角色、結構、收據與編譯瀏覽器測試並獨立審查。
6. 遠端傳送須先解決原UNKNOWN／拒絕的適用阻擋，不能用#101既有通道或新PR重送原payload。合法可執行時，才一次更新共同約定的同一PR，確認實際head/tree與CI。此步尚未執行。
7. 所有合併條件通過後，再依測試站發布規則處理最終版本；原V42部署無回執不能重送。取得明確部署結果後跑完整實站驗收，未通過不稱整體完成。

## 已知不能用本機合併消除的阻擋

- 舊243-path/quality create_tree結果UNKNOWN，缺原精確payload／未執行證據；404不足。設備舊tree拒絕也不因本批授權自動解除。
- 已核實使用者06:18／06:19的新決定：目前草稿可不保留、A可送含AB修改的整份案件、例行FQC整頁共用一份草稿；全部草稿頁面統一在#102。這三項不再待答；真正拆分、待審關聯與安全轉換仍由#102 owner實作驗證，本候選僅含未啟用b172前置。
- 畫布存取範圍已依原確認改為當前畫布；同頁保留與真正離頁放棄仍須完整合樹與實站驗證，不得擴大保存範圍或清除其他畫布輸入。
- 歷史對話未凍結的製程前端，以及本機原生/實機/實站驗收未完成。

## 本機整合檢查（非完整發布驗收）

Frozen parents：main021／count8f／no-poll158／history3f6（含d1）／filter807／inactive-boundaryb172。未複製history對話dirty前端。已保留來源predecessor／原收據與roles/CAS；未啟用scope或權限切換。

目前當前畫布actual stack／conflict／count批次117 PASS、1個已移除focus handler的fixture失敗；修正為更嚴格零註冊後該項單跑PASS，原失敗log保留。Recovery store167 PASS，新增legacy-global案例的額外capability假設失敗；修正為真實foreign-private-pin拒絕後該新案例單跑PASS，未改原產品receipt規則。不能將分批結果冒充單一118/168全綠，下一輪完整來源與角色驗收另記。合成composer15項正負PASS，未以source evidence代替功能驗收。

容量不足時只刪除此task自建的partial／duplicate node_modules，完整已驗證同lock依賴搬到本整合checkout；source/evidence／其他工作樹／真實資料未刪。不是乾淨npm安裝驗收。

## 本次可複核的本機結果

本機分支 `integration/process-editor-complete-20261109` 已以真實雙親保留8f、158、3f、807、b172及main9fb；13f基準產品固定在a31039d；最新380d016再接精確C回呼修正與共用client cache local2，來源witness已按該runtime重新生成。沒有 schema、ACL、真實業務資料或部署變更。

- 當前畫布Save兩個舊候選失敗反例修復，其他畫布未送內容保留；舊跨畫布UNKNOWN依原operationId查收據，不改pin、不重送。獨立畫布／scope／navigation159項PASS。
- 來源／快取／切頁／收據139項PASS；共用no-poll9項、composer15項與受影響typed lint PASS。額外來源鏈先182/184，修正兩個current cache期望後54/54 affected suites PASS；原歷史期望未改。
- 777項來源ledger／engine／witness檢查PASS；原9 targets原樣加7明列targets，共53 current、632 projections、164真Git objects、79原歷史requests。這是來源證據，不是功能或實站驗收。
- 當前完整初始化不設草稿timer，仍執行明確讀取／拒絕權限／晚到回覆／UNKNOWN控制；原已退休callback只在明示歷史fixture跑，不宣稱為現行自動行為。歷史fixture從完整current attestation後明確named inverse重建，驗固定commit/tree/真blob；不依賴虛構ref或新增Git物件，免重複快照。
- 完整編譯、乾淨來源consumer、最終全歷史掃描與獨立來源複核的最終結果另見交付manifest；尚未取得結果者不可推定PASS。桌機／實體iPhone／IME／兩人實站／40秒情況／最終GitHub CI與測試站仍未驗。

## 新收到草稿main100候選的最小相依接入

另案 `7ef04ed741249816aac2f1336cf15f888ff92fa0` 已讀取固定提交，沒有整檔覆蓋其共同client或把該候選當成已發布。只接其 `bbc5f9d` 的request-entry C比較版本防護及原新增測試；本機先6PASS/2FAIL重現callback1可誤取得Begin資格，再套精確5行產品patch。保存callback之前的版本，所有callback後資格必須仍屬同版，原fresh read／CAS／UNKNOWN／當前畫布Save及歷史顯示防護繼續保留。共用client cache另升local2；其他6個整合asset維持local1。

原來源掃描的唯一新阻擋已由獨立審查確認為合成收據key（actor與API路徑相接）的分類，不是工作站路徑。只增真祖先2245941、該檔43ca7bc、WORKSTATION_PATH精確tuple；不改掃描regex、size threshold、原anchor、私有Git證明或其他hash。全歷史掃描與新callback後的最終結果須看交付manifest，不能套用13f基準的舊PASS。

最新固定runtime380d016的C實際堆疊139/139、來源／engine／witness／count／background／Routine819/819、panel15/15、全庫正常typed lint、guarded build均PASS。18個真target、53 current、654精確projection、173 bounded真objects、原79歷史requests；compact contract4,453,246 bytes，無提高5MiB來源blob限制。source-policy原15 unit與16組exact/private-proof/真Git祖先負控PASS。來源證據與功能套件有重疊，不能相加為完整覆蓋數。最終source-only全歷史／乾淨來源consumer結果由外部manifest綁定，不可先推定通過。

最後本機交付：正常source-only history/worktree全667提交PASS；乾淨單分支無alternates、無node_modules且7ef commit不存在的consumer819/819 PASS；最終畫布Save/衝突/UNKNOWN282/282、cache/navigation/receipt182/182、count/stage/no-poll33/33 PASS，三輪獨立複核均無must-fix。測試與來源證據不是GitHub完整來源已上傳或實站完成；最新三項草稿決定已修正為#102待實作，無新DB/ACL/schema操作。
