# 3020 共用／產品專用作業七項標註（2026-10-09）

本子任務 EXECUTED；不代表網頁回報、登入與日常整合的全部閘門通過。沿用 `codex/ipqc-ab-local`／`8b182626085bb2aa1f3a216903c5b373ee82bc44`，未 commit／push／merge／部署。驗收只寫 localhost:3020 的合成 EDITOR ACCEPTANCE；127.0.0.1:3020 原資料分頁只讀，不操作其他服務。

## 原標註與實際結果

| # | 使用者原文 | 修正 | 驗收狀態與證據 |
|---|---|---|---|
| 1 | 進站裡面不要有這個 是不是有甚麼問題 | 原始JSON改為收合的關聯數量與可讀明細。原產品／BOM／機器／IPQC仍保留，不隱藏占用或默默清空。 | PASS：原 A-CUT-07 實際展開顯示三產品編號、無JSON；原資料348完全不變。ui-annotations-legacy-entry.png、VM及保存guard。 |
| 2 | 要有 項目名稱 操作內容 操作標準 並把顯示在方塊上 | 共用三欄「項目名稱／項目內容／項目標準」，進站亦顯示名稱、內容及標準。 | PASS：原進站空表與合成進站有資料的兩頁UI、所有六型摘要VM；ui-annotations-entry-zh.png。進站本輪未另寫新業務項目。 |
| 3 | 版面優化 | 緊湊左側清單、右側三欄；空清單可直接填寫，首次輸入才建立項目，頁面只用主要內捲動。 | PASS：桌面1280×720、無彈窗橫向溢出、底部固定；新增／上下排序／移除及取消確認實際操作。手機BLOCKED，不能算PASS。 |
| 4 | 跟進站那邊依樣 優化版面 要有項目名稱 項目內容 並顯示在方快上 | 出站沿用共用三欄與完整摘要，仍維持兩頁。 | PASS：合成出站實際兩頁與內容／標準、原出站無內容時正常空摘要；六型摘要VM。出站本輪未另写新業務項目。 |
| 5 | 這裡是要有項目名稱 項目內容 項目標準 目前版面有問題 目前這裡的共同作業編輯 要在所有有這個共同作業類型的模型方塊上反饋在方塊資訊上面 看板面有沒有問題 目前作業說明在上面不知道要做甚麼 | 六型共用項目直接顯示；舊整段作業說明收合保留，空白時不放大框；不刪舊文字。 | PASS：進／出站、人工、人工檢查、機器、自訂流程共用頁實際查看；人工正常Apply→Save→重開、10卡實際本機整理零重疊後復原、無位置API寫入。 |
| 6 | 選擇產品要有標題 | 可見「選擇產品」標題，選項有編號＋名稱，仍僅限本方塊適用產品。 | PASS：實際 PED-A／B 切換及標題，ui-annotations-product-top-zh.png與DOM。 |
| 7 | 所有有產品專用編輯的方塊上 不須要反饋資訊在製成編輯台方塊上 這裡的編輯要有專用項目名稱 內容 與標準 目前排版設定有問題 | 專用三欄；卡片不顯示專用名稱／內容／標準／媒體或「產品補充」數量。 | PASS：PED-A首次輸入→切PED-B空白→切回保留→Apply→Save→重開；放棄再開仍是已存值。實際卡片只顯示共用三欄；全六型VM檢查隔離。 |

## 根因及範圍

舊UI把整段instructions與instructionSteps同時鋪在上方，空項目必須先新增才看到三欄；卡片摘要只串接text，沒有name或standard。產品選擇框缺少標題，卡片仍顯示產品補充數。進出站的歷史資料保留防護直接輸出JSON，容易被誤認錯誤。此次保留原欄位、守衛、手動Save与送審來源，只調整呈現及空項目的本機輸入。

修改：`public/process/process-editor.js`、`public/process/process-editor.css`、`scripts/test-editor-integration-ui.cjs`、新增 `scripts/test-editor-work-items.cjs`、現行PROCESS_EDITOR規格及本報告／交接索引。六類仍為2／6／7頁，未修改BOM主檔、IPQC規則、權限、CAS、generation或待審鎖。內容Apply繼續從共享原值保持x/y/nextIds。

## 可重查的證據

外部證據根目錄：`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/integration-20261009/`。

- `annotation-before-01/manifest.json`：修改前7個程式／文件與132個最新runtime檔，逐檔hash核對。
- `annotations-ui-vm.log`：既有5項PASS；`annotations-work-items-vm-v2.log`：新增9項PASS；`annotations-lint.json/.log`：受影響三個JS/CJS lint PASS；`annotations-syntax.log`：語法PASS。初版VM因跨realm prototype比較失敗，原 `annotations-work-items-vm.log` 保留；改成比較序列化模型再通過，不是略過資料差異。
- `annotations-save-guard.json`：合成43→45，只允許A-CUT-02共用三欄及productInstructionSteps.PED-A；工作內容精確比對、saved.content等於working，saved ID `4eb27209-3be4-4b8b-9f54-aaa8eee64f70`。位置、連線、BOM、IPQC、媒體、舊instructions、其他產品及全部其他工作區不變。原348→348全部13鍵相同。
- 實際桌面截圖：`ui-annotations-common-zh.png`、`ui-annotations-product-top-zh.png`（頂部標題）、`ui-annotations-product-zh.png`（內容／標準）、`ui-annotations-entry-zh.png`、`ui-annotations-common-vi.png`、`ui-annotations-legacy-entry.png`。來源是實際頁面，不是設計圖。
- `annotations-layout-ui.json`：實際10卡、9線，本機自動整理後卡片零重疊；隨後Undo回到已同步，沒有同步位置。這份紀錄不證明所有線零交叉；本輪沒有重跑20卡。

中越文桌面欄位／切頁可讀PASS；保存採同一份資料、沒翻譯或覆寫使用者內容。實體手機NOT_RUN；瀏覽器390×844 override未實際生效，先前證據顯示仍1280×720，故手機幾何BLOCKED。本輪未重新提交／核准業務案件，也未測每一型各自新的Apply/Save：實際保存鏈集中人工的共用與產品專用，其他類型是讀取與呈現＋共享建構器VM。

## 保全與恢復

原使用者分頁不重整、未關閉其未存彈窗。新增原資料預覽分頁不寫資料；原PID13744未重啟。可回復本次程式區塊，與並行修改逐段合併；備份檔供比對，不可整套覆蓋checkout。合成測試內容如需撤回，用正常guarded內容更新取消指定測試三欄，再手動Save，不以43或舊整庫checkpoint覆蓋最新45。原348不得以舊快照覆蓋後續資料。

整體仍未完成：受控負載完整開啟2694ms FAIL；登出撤銷已有人類授權、隔離日常副本15项API PASS但現有服務未啟用／實際browser與process重啟NOT_RUN；日常切換、完整業務分類／历史相容、connector獨立複審尚有閘門。不要將此七項UI通過當作全部3020／3000功能已驗收。
