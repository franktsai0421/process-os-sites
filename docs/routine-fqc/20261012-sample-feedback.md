# FQC樣品與複測14項回饋驗證

日期：2026年10月12日。Task：本批14項FQC頁面批註。STATE: EXECUTED；功能檢查與實際畫面範圍分開列出。

## Changed

前端移除repeat-result與use-required入口；初測使用同列單選radio，同項其他列已選樣品停用。複測直接顯示固定原樣品，create followup帶入原樣品空白結果；舊草稿已有列尚無樣品時只在buffer補固定原樣品，不新增列、不改既有樣品或正式內容。每項新增列只接續可用未選樣品。resultOpen／sampleOpen保留展開狀態，照片上傳及重畫不自動展開其他列。

draftPhoto提供草稿結果照片及處置證據移除，只移除buffer引用，不DELETE R2、不代Save。上傳前固定原照片陣列，列順序變更不把上傳結果放入另一列。必要照片移除後恢復缺漏並阻擋Submit。

新報告維持既有Document.kind=report：初測FQC-RPT藍色、複測FQC-RTS紫色、更正FQC-COR琥珀色，清單各自分類。舊號使用顯示別名並附原編號，搜尋／明細／審核卡／匯出一致，不改正式編號、ID、來源或連結。

structure拒絕新多選、跨列重複與換原樣品；對沒有requiredSamples欄位的舊案件由linkedCase補伺服器防護。未改選樣的舊草稿可存其他欄位，新Submit仍需符合新規則。正式歷史的既有結果與失敗聚合保留，不在唯讀歷史套用新選樣錯誤要求更改舊版。

## Tests

| 檢查 | 結果與實際範圍 |
| --- | --- |
| test-routine-fqc-repeat.cjs | PASS，生產kernel記憶體fixture：單選、同項跨列防重複、RTS建號與固定原樣品、舊案件換樣拒絕、必要照片、Save／Submit／Approve、再次失敗、後續全合格、明確結案、舊樣品保存相容與原正式不變 |
| test-routine-fqc-sample-ui.cjs | PASS，真實前端bind事件：radio與已用樣品停用、mock上傳目標不隨索引搬動、移除引用只改buffer、照片缺漏、結果列收合保留與明確展開、中越文、正式無移除按鈕 |
| test-routine-fqc-navigation.cjs | PASS，捲軸／焦點、分類／計數、RPT/RTS/COR識別、原樣品文字、無舊按鈕、原報告與資料保留、中越文 |
| test-routine-fqc-actions.cjs | PASS，前端act接kernel的改善複測原子操作、取消、收據、防重複、權限、待審、CAS、復原及歷史 |
| test-routine-fqc.cjs／operations.cjs | PASS，核心12組與操作12組回歸；舊換樣測試改為在Apply時提前拒絕，不等到Submit |
| TypeScript／JS語法 | PASS，tsc --noEmit --incremental false及node --check |
| 新修改測試檔lint | PASS |
| 完整影響範圍lint | FAIL，13項既有診斷；本輪新增的2項測試lint已修正，新測試乾淨。未擴大修正無關基線 |
| 真實3040唯讀桌機 | PASS，獨立審核分頁：複測紫色rgb(112,50,140)、RTS別名／原號、固定原樣品、舊按鈕數0；1280寬度無水平溢出 |
| 390×844中越文模擬 | PASS，實際innerWidth390、scrollWidth375、結果列summary44px，無水平溢出；語言及viewport已復原 |
| 真實新複測建檔、實際草稿照片上傳／移除／Save／Submit | NOT_RUN，不代操作使用者文件；mock照片上傳不是R2實體驗收 |
| 實體手機、3000整合及獨立ChatGPT複審 | NOT_RUN；未commit/push/merge／部署，未操作其他服務 |

批註對應：1／9／14移除再測按鈕；2／11／12初測複測編號與顏色；3／8／10單選與同項不重複；4移除照片；5／6／7／13原樣品提示及不自動新增／展開結果列。對應的kernel與事件／render檢查PASS，不冒充14項全部真實業務端到端驗收。

第一次新測試曾因舊期望「原樣品包含已通過B」及VM跨環境陣列比較失敗；確認案件固定的是原未通過A後修正fixture。UI fixture補齊工作參照、時間與DOM容器後通過。最後分類回歸查出correction漏在分頁分類filter外，已修正並重驗，不留下文件漏列。

## Documentation updated

更新現行規格最新回饋節、ROUTINE_FQC模型、QUALITY入口、DATA_MODEL、CHANGELOG與HANDOFF；2026-10-08設計指南增加歷史提示，原ZIP不改；IQC規劃只補FQC規則後續變更連結，不替IQC定案。

資料模型影響：沒有新增欄位、SQL、schema或migration；samples仍為既有陣列，限制由操作驗證實施；新number前綴與舊號顯示相容。照片實體與正式內容不刪改。

Material risks：舊草稿曾多選或同項重複者，重新Submit需先手動修正；保存其他欄位不默默重配樣品。真實新報告與照片全流程、實體手機未驗，完整lint尚有既有問題。獨立分頁驗證唯讀歷史，原使用者分頁未重整、未代儲存或送審。

## Evidence and recovery

畫面保存在本對話visualizations的fqc-sample-20261012：desktop.png、phone-zh.png、phone-vi.png。修改前程式、未提交／未追蹤文件及user-before.json位於專案外TEMP/fqc-sample-20261012，guards保存SHA256。復原須逐段合併目前並行變更，不整庫還原、不覆蓋使用者後續文件，也不把舊續談包程式覆蓋目前checkout。

只使用已運作的3040，服務未重啟／初始化、未另開埠；測試資料只在記憶體fixture。原分頁與照片分頁保留，未觸發舊自動接續或其他任務checkpoint。

## 2026-10-13 續作範圍核對

Task：本對話專用原 FQC 例行檢查頁面，交付固定 3040；沿用上述 14 則批註。第 4 則要求錯放照片可清除，第 5 則要求上傳不展開其他結果列，照片工作僅為這些頁面操作的驗收。初測／複測識別、單選防重複、固定原樣品及移除再測按鈕沿用 10/12 修改與已通過的檢查，沒有重新宣稱端到端完成。

Changed：本日未再修改 FQC 程式、共用設定或資料模型。恢復原 3040 啟動服務，PID 26544；任務自有 3041 驗收啟動器研究已停止，副本及錯誤證據保留。3041 啟動在 vite-create 階段遇到相依套件重複預設匯出，未達頁面驗收，不是 FQC 操作 FAIL，也不作為交付環境。

Tests：3040 照片 API 實際上傳／下載與內容雜湊、重複上傳，以及未登入／跨來源／MIME／圖片簽名／未登入讀取檢查，共 7 項 PASS。這些不是頁面上傳、移除、保存、送審的完整驗收；本日僅新增兩張專用 QA 圖片實體，未新增報告或照片引用。

保全檢查 PASS：原 routine control 與本日起始快照完全一致，revision 722、25 個工作、96 份文件、19 個案件；4 個 FQC 程式檔 SHA256 一致。未代儲存、送審、核准或改動使用者文件。證據：[保全摘要](20261013-preservation-evidence.json)。

續作初始狀態（下節已補齊）：實際新複測建檔，以及草稿照片上傳／移除／Save／Submit 當時 NOT_RUN；现有專用 QA 工作已完成，沒有可安全續用的 QA 草稿。未安排手動 DEMO 與原文件保留，若補齊流程，須先確認新增明確標示的 3040 專用驗收資料，再用正式 UI／API 完成。實體手機 NOT_AVAILABLE；不等待實機、不將 viewport 模擬冒充實機。其他已通過檢查不重跑。

Documentation updated：只追加此 FQC 專用驗收報告與保全摘要；共用 HANDOFF／CHANGELOG／索引未改。資料模型影響：無。Material regression risks：完整操作流程尚未實驗驗收、原既有 lint 診斷仍保留；本日無程式變更造成的新回歸。

## 2026-10-13 原 3040 實際頁面驗收完成

使用者已明確確認「允許新增專用驗收資料」，並指定已登入 Chrome。只在原 3040 經受支持草稿／審核流程新增一組 [FQC 專用驗收 20261013] 標準與工作、計畫、初測報告、複測報告及異常案件；未重設既有項目或消耗手動 DEMO。原全部來源項目／錯誤資料逐項不變；新增專用標準需正式核准才可排程，已明確 Admin 自審確認。既有 96 份文件、25 個工作、19 個案件逐筆 deepEqual 通過；總數現為 99 份文件、26 個工作、20 個案件。程式候選四檔 SHA256 不變，本日沒有追加功能修改、schema、migration 或共用設定變更。

| 實際檢查 | 結果與證據 |
| --- | --- |
| 真實檔案選擇器上傳 | PASS，紅／綠 PNG 經 Chrome 表單成功上傳，DOM img.complete=true、naturalWidth/Height=48；R2 實體 SHA256 與解壓後像素一致 |
| 移除照片與保存 | PASS，Chrome「移除照片」後圖片引用清空，原兩列 ID 與第二列收合狀態不变；原生 Save 回讀 saved.photos=[]，舊 R2 紅圖仍可讀 |
| 缺照送審／恢復照片 | PASS，移除必要照片可 Save；正式 API Submit=422、pending=null，原生頁面送審仍停留草稿；再由頁面上傳綠圖、Save／Submit 成功生成固定待審快照 |
| 單選與同項跨列防重複 | PASS，实际選單 radio，第一列樣品勾選、第二列已用樣品 disabled；再測按鈕數 0 |
| 新複測與固定原樣品 | PASS，頁面一次輸入改善並建立 FQC-RTS-20261013-0045；API 與 DOM 都只有原不合格 105B100051 一列，沒有選樣輸入或原樣品建立／再測按鈕；紫色 rgb(112,50,140) |
| 複測完整生命週期 | PASS，原生 Save／Submit；正式 API 明確 QA 自審核准後到 ready-close，再明確 close 到 closed；初測正式快照雜湊與綠圖引用保留 |
| 原資料與来源保全 | PASS，原 96/25/19 全部逐筆相等、來源舊 items/errors 相等，4 個 FQC 程式 SHA256 不變；紅綠圖在移除／結案後仍可 GET 與解碼 |
| 實體手機／3000整合／獨立ChatGPT複審 | 手機 NOT_AVAILABLE；3000及獨立複審 NOT_RUN；沒有擅自開啟或連接 C2C，沒有重跑昨日有效單元與畫面檢查 |

初測 FQC-RPT-20261013-0044；複測 FQC-RTS-20261013-0045；案件 FQC-CA-00020。這組為明確標示的非業務驗收證據，保留在 3040，不搬入日常環境。

[完整驗收與持久化證據](20261013-page-acceptance-evidence.json)、[照片上傳與第二列收合](20261013-photo-upload.jpg)、[紫色 RTS 正式報告](20261013-retest-completed.jpg)。三次原生照片 Save 證據 ID、待審 ID、複測 savedId、R2像素與原始保全結果見 JSON。

本批 14 則要求的實作與定向驗證已完成：1/9/14 無再測按鈕；2/11/12 RPT／RTS 名稱、顏色與編號區分；3/8/10 單選與跨列防重複；4 真實移除保存及送審 gate；5/6/7/13 上傳不增列／不展開其他列、複測固定原樣品文字與一列。昨日已 PASS 的檢查沿用，不宣稱所有權限／其他模組或實機已全測。既有 13 項 lint 診斷未在本輪修復。

進行範圍：3040 例行檢查頁面；3041 任務 helper 已停止、副本及啟動錯誤保留，未用作交付；Main/IQC/BOM 及共享工作未操作。Documentation updated 僅本報告與 FQC 證據；資料模型影響無。Material regression risks：既有 lint 基線、實體手機及日常整合未驗；本日無程式更動的新回歸。

## 2026-10-13 批註逐項證據收斂

本節只核既有證據並補明確缺口，不重跑昨日有效 PASS、照片 API 七項或完整業務流程。四個 FQC 程式候選 SHA256 仍與原驗收基準相同。先前 R2 實體、保存快照、原 96 份文件／25 個工作／19 個案件保全的結果沿用其檢查時間；本輪未新增或修改任何業務文件。

下表 E1–E9 對應 [原頁面證據](20261013-page-acceptance-evidence.json) 的 uiChecks 陣列第 1–9 項（JSON index 0–8）。10/12 kernel／事件／render PASS 按原範圍沿用；不是把它們改稱全部真實端到端。

| 批註 | 確認要求 | 證據與範圍 |
| --- | --- | --- |
| 1 | 選樣後沒有再測按鈕 | E8 舊入口數 0；初測照片畫面及 sample-ui/navigation 的入口移除檢查 |
| 2 | 初測與複測名稱、編號分開 | 實際 RPT-0044／RTS-0045 建檔與 E8 明細 |
| 3 | 同項其他列已選樣品不能再選 | E4 實際 radio disabled；kernel 拒絕跨列重複及 render；本次未另錄從＋新增列開始的完整實測選樣流程 |
| 4 | 錯放照片可清除 | E1–3、E5–6 真實上傳／移除／Save／Submit；三個保存 ID 與實體圖保留 |
| 5 | 放照片不新增或自行展開第二列 | E3 兩個既有 ID 保持、第二列 false；照片畫面；上傳等待期事件檢查 |
| 6 | 原樣品入口不自行打開結果列 | E7–8 真實新複測只有一個預填原樣品列；舊建立入口已移除，不測點不存在按鈕 |
| 7 | 原樣品文字固定、不再提供按鈕或第二列 | E8 fixed 105B100051、一列、sampleInputCount=0、oldButtonCount=0；中越文原樣品文字 DOM/render |
| 8 | 樣品只能選一個 | E4 實際 radio；kernel SINGLE_SAMPLE_REQUIRED 與 sample-ui |
| 9 | 不用再測按鈕 | 同批註 1，沒有另一個功能入口 |
| 10 | 初測每結果列選一個品項 | E4 與原生 Save 兩列各一個 samples；kernel 單選 gate |
| 11 | 複測的編號、顏色與初測不同 | 新 RTS 正式號與 E8 紫色；初測 RPT／藍色保留的 navigation/render 證據 |
| 12 | 初測／複測分類、顏色和編號方式不同 | navigation 的分類、RPT/RTS/COR 檢查；E8 實際 RTS 色／號；未另保存兩個新分類同框截圖 |
| 13 | 直接顯示前次原樣品，無建立按鈕或額外列 | E8–9 固定樣品／一列／無舊按鈕／保存及初測快照保留 |
| 14 | 不需要再測按鈕 | 同批註 1／9，同一已移除入口 |

本輪額外補的是已核准專用初測報告的 390×844 唯讀照片版面及鍵盤 Enter：中越文 innerWidth=390、scrollWidth=375，兩個結果列 summary 高 44px，真實綠圖載入尺寸 48×48，側欄收起後 left=-280，內容未被遮擋。Enter 可開啟及收合第二列，第一列仍展開，焦點 solid outline 可見。語言及 viewport 已復原，原專用 RTS 明細保持開啟。不是新增 UI 功能，也不是實體手機驗收。

[補充 DOM 與 14 項映射](20261013-comment-audit-dom.json)、[390px 中文照片／收合／焦點](20261013-audit-phone-zh.jpg)、[390px 越文照片版面](20261013-audit-phone-vi.jpg)。調整 viewport 時的第一張截圖包含未完成的侧欄轉場，未作為無遮擋 PASS；原圖保留於本對話 staging/mobile-transition-before-settle.jpg，PASS 使用轉場完成後的 DOM 與截圖。

仍未支撐的廣泛驗收：Space 在工具兩種路徑下未觀察到 summary 切換，工具與產品原因尚未分離，列 NOT_CONFIRMED；不宣稱全部鍵盤操作 PASS。390px 編輯態選樣／移除照片／檔案選擇器及 Save/Submit 的完整鍵盤／觸控流程仍 NOT_RUN，既有封存 QA 文件是唯讀，沒有為此另造草稿或更正文件。實體手機 NOT_AVAILABLE。上述不冒充 14 項功能未完成或新增產品 FAIL，但必須保留驗收邊界。

Lint：最後完整影響範圍記錄仍為 10/12 FAIL、13 項既有診斷，未修復。本輪沒有重新執行 lint，不能宣稱目前一次新執行仍恰有 13 項，也不能宣稱 clean。新測試檔原 PASS 仍按原記錄列出。

Task：原 3040 的 14 則批註證據核對。Changed：僅 FQC 報告與補充證據，無程式、資料或資料模型更動。Tests：既有 PASS 沿用；新增唯讀 390px 中越文照片版面／Enter 鍵盤檢查 PASS，Space NOT_CONFIRMED，實體手機 NOT_AVAILABLE；文件鏈結／JSON／diff 定向檢查另列。Documentation updated：僅 docs/routine-fqc。Material risks：上述未驗鍵盤／觸控範圍及未修 lint 基線；沒有新增程式回歸。
