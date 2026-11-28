## 2026-11-05 — FQC 替換保存範圍已確認

開始前讀取失敗若能由原 client 私有證據確認本次尚未送出，可撤掉本次未送 intent，再由使用者明確確認；不能以公開 flags、404 或已存標記推論未執行。

明確重選同一檢具仍須重驗目標有效且啟用；普通保存保留未重選的歷史 snapshot。來源在 Begin 發送前保存原身分，復原只查原收據，核對後需重新明確確認才 Save。

共用草稿的存取範圍及修訂核對見下方「檢具反向引用與替換」。以前送出的操作仍按原回執核對。

## 2026-11-05 — 檢具主檔草稿統一候選

本輪檢具主檔（類別／子類／規格群組／設備／校正／照片）以本機編輯、明確一次原子存取為原則；完成表單不寫共享 working，存取保留欄位與父層 guards、世代／CAS、角色及待審保護。送審獨立且不能送出本機未存內容；離頁直接放棄未送輸入，unknown 仍保留原操作與 barrier，只查原收據，404 不代表未執行。舊無識別 Begin 不可按目前草稿冒認成功。此段是主檢具候選，未部署；下方跨品質移轉的獨立確認／各目標 scope 流程仍維持，未聲稱已全部改成原子保存。 [實作與驗證界線](../../acceptance/equipment-local-atomic-save-20261105/README.md)。

# 品質檢具與測試設備

狀態：Current。整理 KD/ROUTINE 來源決策及後續品質紀錄；舊原型表名、binding、API 不作實作規格。

類別 → 子類別 → 規格群組 → 個別設備；保留空分類。相同資產編號的分件有獨立穩定身分，保留號碼與來源疑點，不按照片猜能力或合併實體。校正方式、週期、啟用、核准、來源確認狀態獨立。

版本流程依[共享草稿](SHARED_DRAFT.md)，送審維持品質驗證，不套用製程放寬。持久化沿用 D1 DB／R2 STATE_ARCHIVE；不得依舊原型新增 EQUIPMENT_DB／EQUIPMENT_MEDIA 或 equipment_* SQL 表。

FQC、IQC、IPQC-C、IPQC-AB 使用生效核准且 enabled 的設備；選擇／替換／反向引用按穩定設備及項目身分，保留人工內容、照片、正式版及歷史。待審案件不能被替換改寫，依現有 coordinator／revision 防護處理。舊可選數量不代表今日狀態，不暗中新增 confirmed／校正限制。

Begin 結果不明不得盲目重送或自動接續移轉；匹配草稿僅供唯讀核對，使用者明確選擇既有草稿後才恢復編輯，不能宣稱原 POST 已成功。目的模組依原權限開始草稿。替換入口只處理已開啟的共用草稿，依目的模組的一般 Save 存入所有已套用修改，待審不得覆寫；四模組皆須保留正式版、saved 與歷史。跨 scope 的部分失敗必須明列，不自動核准或補套。

沿用目前刪除保護：未核准的新器具不得作移轉目標；已生效或來源器具即使移空引用仍不可刪，停用依原流程處理。只有未生效且無正式／待審／草稿引用的新草稿項可刪；有下階資料的分類不可刪。不為隔離測試放寬此規則。

已確認的測試流程：類別／子類先確認沒有下階資料才刪；新增兩器具正常核准後，再驗四品質模組的首次移轉自動開稿並存取、替換與共用修改一併存取，以及待審保護。相關草稿按 Save→Submit→Return→修改→新 Save→Resubmit→獨立 Approve 驗證，正式標準在核准前不變。用過器具改測停用；若仍有正式引用，先正常移轉並核准清引用，再送審停用，保留 ID 與歷史。刪除功能另用未核准、無引用或移轉紀錄的新測試 draft；不把停用改成刪除。

照片使用一般圖片上傳並保留舊照片；業務規格群組與檢具規格不是照片格式篩選，不能因此移除。

實作與例外見[品質模組](../../../AI_CONTEXT/modules/QUALITY.md)，欄位見[品質模型](../../../AI_CONTEXT/models/QUALITY.md)。[IMPORT_AUDIT](../../../KD/ROUTINE/IMPORT_AUDIT.md) 保留119筆來源匯入、照片及疑點，屬當時證據。

待確認：舊原型要求核准／發回必填意見，後續品質 UI 現況允許不填，而 V3 核心對非 approve 的 reason 另有要求。沒有足夠明確確認紀錄可統一，見[未決清單](../../DOCUMENTATION_INDEX.md)，不自行改規則或程式。

### 檢具反向引用與替換

替換預覽以標準所存的設備分件 ID 連結當前生效和開啟版本。詳情與替換的主清單共用同一修訂的替換預覽，只列目前核准生效版直接引用該分件的項目，以模組、範圍及穩定項目 ID 去重。主清單名稱與連結固定在生效版本。顯示直接引用數、可選數及鎖定原因；草稿和待審在預設收起的輔助區。這兩個畫面不列歷史標準；原模組保留版本及照片。只有草稿引用的列仍可按原權限明確勾選，不預選。版本明細和預覽修訂或定位不一致時要求重新查詢，不顯示零筆。待審範圍鎖定，須依現行流程撤回或結案，再重新選取。原模組可回查已取代或撤回版本；僅存在於歷史的列、舊替換紀錄、群組或工具文字不產生可移轉列。無權讀取、查詢失敗、回應不完整均須顯示其狀態。正式標準直到新案件核准才變更。

四模組的「確認移轉並存取草稿」使用目的模組既有的共用存取。一次確認會將勾選的設備替換與所有已套用至該模組共用工作稿的修改一起存入，包含同事已套用的修改。尚無草稿時，同一個存取請求會依原模組權限開稿並存取，成功時資料修訂只增加一次。若同事已先開稿或資料修訂已變更，原確認失效，須重開清單。存取遭拒時不會留下空草稿。若送出後斷線，重開檢具替換畫面，核對原操作收據與存取編號後再決定下一步；不重送原操作。尚在其他分頁、裝置或同事瀏覽器而未套用的輸入仍留在原處。IPQC-AB 檢查最終存取涵蓋的所有群組，包括未勾選的群組。每次確認只涵蓋按鈕所屬的一個模組。該模組勾選的列會一起成功或一起失敗。其他模組分別確認。

移轉命令僅可修改所選穩定項目的檢具 ID 及必要的工具／檢查方式。伺服器核對目標分件仍生效且啟用、原權限、待審鎖定、整份工作稿及資料修訂。只有回執能確認已存。開單後若資料修訂前進，須重開清單；同欄清空再改回原值也會拒絕舊視窗。工作值與已存選擇均已是目標時，不再存取。反向改回原正式分件時，須證明對應列來自原移轉，且其後共享修訂未變。不能證明時，請在原模組核對。替換不會提交瀏覽器未存表單。正式引用要等獨立送審及核准後才變更。

Tiếng Việt: Nếu chưa có bản nháp, cùng một yêu cầu sẽ mở và lưu theo quyền của mô-đun. Nếu đồng nghiệp đã mở bản nháp hoặc phiên bản đã thay đổi, hãy mở lại danh sách. Yêu cầu bị từ chối không để lại bản nháp trống. Nếu mất kết nối sau khi gửi, hãy mở lại màn hình thay thế để kiểm tra biên nhận ban đầu và mã lần lưu trước khi tiếp tục. Hệ thống không gửi lại thao tác. Khi xác nhận, hệ thống lưu các lựa chọn thiết bị cùng mọi thay đổi đồng nghiệp đã áp dụng vào bản nháp chung. Dữ liệu chưa gửi vẫn ở trình duyệt của người nhập. IPQC-AB kiểm tra tất cả các nhóm trong lần lưu. Nếu dữ liệu đã thay đổi hoặc hồ sơ đang chờ duyệt, hãy kiểm tra trong mô-đun rồi mở lại danh sách. Mỗi lần xác nhận chỉ lưu một mô-đun. Thao tác không gửi duyệt.

測試用的歷史 V107 分頁相容性案例會從本機 Git 歷程讀取原版前端。僅有來源匯出檔時，以 `V107_EQUIPMENT_TEST_CLIENT` 指向同一個 V107 的 `public/process/routine-equipment.js`。測試會先比對 SHA-256，重新載入後核對新版回執。

IPQC-AB 後續人工編輯可於目的模組另行存取。存取須核對開啟時的資料修訂、草稿世代與業務內容，若已變更須重新讀取。

已從群組核准路線移除的工段，其既有正式 AB 標準可單獨替換設備分件並循原流程送審與核准。整份案件僅可更換既有、啟用標準的設備與系統產生的設備快照。產品仍須屬於原線別及群組。未選列與舊版本保留，核准前正式引用仍為原件。工段維持隱藏，日後恢復路線會顯示已核准的新分件。

### 2026-11-27 生效引用與替換驗收

中文「目前生效 · 直接引用」「確認移轉並存取草稿」與越文「Đang hiệu lực · Tham chiếu trực tiếp」「Xác nhận chuyển và lưu bản nháp」均適用四模組。取消、無權限、不完整或格式錯誤顯示查詢未完成及原因。使用者可重新查詢。成功讀到空的生效集合才顯示零筆。失敗或結果未確認的存取不能顯示已存。

隔離重現使用 Node、專案相依套件和 Playwright Chromium。共用草稿存取與最終 CAS 競態執行 `node scripts/test-equipment-clean-transfer-cas.cjs`。建置後可分別以 `EQUIPMENT_TEST_LANGUAGE=zh` 與 `EQUIPMENT_TEST_LANGUAGE=vi` 執行 `node tests/equipment-clean-transfer-browser.mjs`。舊版測試亦記錄了先前移轉規則。先執行 `npm run build`，再執行 `node --test --test-isolation=none tests/equipment-transfer-compiled.test.mjs`。控制器與實際 SQLite 路由的錯誤、衝突、回執及報廢保護以 `node scripts/test-routine-equipment-four-module-transfer.cjs` 與 `node scripts/test-routine-equipment-transfer-intent.cjs` 重驗。

效能對照只使用合成資料。用候選中的 `scripts/benchmark-equipment-reference-views.cjs` 依序執行 `seed 候選目錄 seed.json`、`baseline V107目錄 seed.json old.json`、`candidate 候選目錄 seed.json new.json`。同一份資料含每模組 42 個歷史版本，每項重複三次。輸出保存每次控制器耗時、請求與 POST 次數、資料修訂增量、封存讀取筆數及歷史本文數。另列 V107 的 AB、C 從套用至另行存取的時間，以成功取得已存草稿作共同終點。共用驗收站延遲應另行量測。

設備替換在 FQC、IQC、IPQC-AB 與 IPQC-C 共用草稿中保留原操作收據。結果待確認時，可重新開啟設備替換，直接查詢原操作，無須重新選取目標或標準。查無收據時保留待確認狀態，避免重送仍有可能完成的寫入。
