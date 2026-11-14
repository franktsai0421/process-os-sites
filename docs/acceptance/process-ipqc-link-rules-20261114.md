# 製程方塊 ↔ IPQC A/B、C 規則候選

基準：最新 main `379ae8deab89c0e90441cac50d6bb4f9f9cb22a0`（Frank 已合併 #115／#116）。獨立 Dot checkout、同一草稿 PR #117／分支 `fix/process-ipqc-link-rules-20261114`。沒有操作公司電腦、現有測試站／正式資料、真帳號、遷移、部署或 GitHub 合併。

## 修改矩陣

| 範圍 | 行為 | 證據 |
| --- | --- | --- |
| A/B | 僅線別＋類別＋工段；無／不同／多產品相同清單。來源產品僅供參考，無產品路線門檻；choices、validation、缺項及來源比較同步 | 新建來源 signed routes、domain、原生 A 操作 |
| C | 可勾選／取消並保存；有效產品＋畫布工段聯集，產品→錯誤→項目分組，穩定 ID 區分同名；無額外路線門檻 | 單／多／換產品、同名／停用／不適用、原生 C 操作 |
| 占用 | A/B 同線別／類別／工段，C 跨類別工作區；自己保留勾選可取消，其他方塊顯示名稱／編號並禁用 | 真 signed route CAS、跨工作區同 ID／競爭、原生390px占用 |
| 轉移 | 原 owner 取消並存取後，新 owner 才能勾選並存取；legacy Apply 未存取不能釋放 | saved owner 伺服器原子驗證與雙角色測試 |
| 歷史 | 穩定 source／scope／item／version；僅新建已核准啟用未刪來源。停用／刪除／換版／C 換產品不清除或替換歷史，要求明確處理 | stale reference、原歷史／來源採用與唯讀測試 |
| 保存／安全 | 完成編輯留本頁，再 atomic Save；保留權限、pending、CAS、receipt／UNKNOWN、安全去重，零自動 POST 重送、零背景輪詢 | inline＋records-v1、原子 Save stack、原生 lost ACK／404／原收據 |
| 相容 | 舊 C query flag 不轉全選；IPQC 核准不核准 PROCESS；無 schema／migration／資料包 | 新建 error＋item→Save→Submit→核准→choices→保存／reload／生成正常登入 |

## #115／#116 共同整合

前身 d26da7b 的定向來源154、原子／採用233、歷史63測試與 C24組、lint／非增量TypeScript／guarded build、隔離原生 UI 已通過；10個工作流成功，Windows仍在完整回歸時，Frank 完成 #116 合併並要求整合新 main。這些只屬前身證據，不能當作共同整合通過。

本候選再合入真 main 379ae8d，保留 #115 的獨立 LINES／PROCESS 邊界、已核准來源驗證、明確等待／停止與原收據，以及 #116 的 lifecycle180秒、確認／actor／revision柵欄、submit-only 權、UNKNOWN／no-replay。上游 master／review 核心 runtime 與四份原 manifest 加上 exact Git blob／完整 worktree 斷言；cache 同時保留兩邊及 IPQC 新版本。來源證據按「此精確候選→真379ae8d→原三個真前身→既有歷史」串接，原 hash／負例不變。共同路由、master等待、review恢復及三套原生工作流均須以新 head 重新執行，最終 SHA／CI 以 PR 為準。

實際相容修正：page-v1 C choices 必須與 authoring validator 一樣，使用獨立核准 C catalog／LINES 組合，不能讀舊 active.C 相容快取。新增真 signed-route 案例用生成 page-v1 approved-owner baseline：相容快取故意放 PHANTOM；C002 產品無 TIEN 路線仍可找到已核准子項、從原001改選002並原子保存。C catalog／LINES 待審或版本ID歧義均拒絕，PHANTOM 不授權；A/B 清單不受無關 C 頁資格影響。原生 IPQC 載具也使用這個生成 page-v1 核准基準。這是測試設定，不宣稱執行真 master 採用／核准或遷移。

## 驗證界線

測試均為獨立生成記憶體 SQLite／Map R2、隨機正常登入。真正 create-error／create-item→Save→Submit→另一角色核准；A/B 整份 module Save／review，C 從空 draft scaffold 新建，不改舊 QA 名稱冒充新增。

原生載具使用 production editor／controller／shared transport 與實際 signed routes，1440px 中文 A、390px 越南文 C；checkbox、跨頁保留、完成、Save、reload、自身／他人、兩步轉移、換 actor、晚回應、C lost ACK／404／原收據零 POST replay。這是隔離模組 UI，來源建立經實際 API；沒有宣稱完整 hosted/adopted SPA、品質來源建立 UI 或真人站點驗收。Dot 本機 Chromium 受 kernel socket／ptrace 限制，原生執行由 GitHub CI 提供。

NOT_RUN：真人站完整新來源流程、實體手機、真人跨電腦、多裝置／OS IME、真資料效能、部署，以及真人 master 採用／品質來源建立 UI 全流程。現場 v46 PROCESS V31 原撤回仍 UNKNOWN，沒有查明、清除或重送；AB V24／C V33、舊 QA L9空分類／C L10停用與進站樣本均未當作成功證據。

## 缺項 oracle 定向修復

bd9049c 的 Windows 全套在 read-reuse 雙版本 oracle 停下：舊產品資格只看24個已分配項目，新規則正確增加同 scope／工段168個未分配子項。oracle 保留真4e1基準，只接受 working／saved／未固定review中精確168個 advisory及其順序；固定歷史、全部其餘DTO／headers／I-O／拒絕不變。錯數／重複／亂序／錯scope／錯kind／額外欄位等負例保留；choices則明確驗舊2與新192完整記錄。此同一原測試亦提早放入精確head工作流，Windows原步驟不刪除、不跳過。

## 合併後 validator 載具接線

c96f24be 的 Windows 原步驟31在 assignment-reuse 載具舊 import 數量斷言中止：page-v1 C 正式來源修復新增 approvedMasterPageCatalog import，而舊載具只允許 shared-draft 一個 import，尚未執行 validator。載具改為精確辨識這兩個 import，實際核准 catalog 透過既有隔離 TypeScript loader 綁定，不使用 stub；任何其他 import 仍拒絕。原真 validator fixture、全部結果／錯誤順序／parse 次數／bytes 與不可變輸入斷言保留，成對載具已通過。同一原測試加入精確 head 工作流提早執行，Windows 原 gate 保留。production runtime 未因這個載具修復變更。

修復後的本機補驗：原 assignment-reuse 29案例 PASS（80個變更方塊parse160→3）；443來源／負例、lint與完整非增量TypeScript PASS。原Windows步驟31另預檢139個指令 PASS；PowerShell專用測試在Linux沒有powershell.exe，5個原生指令由GitHub Windows跑（其中1個透過間接fixture啟動Chromium，受同一socket／ptrace限制，未當產品失敗或PASS）。原Windows工作流及全部命令未修改；最後結果以新head CI為準。
