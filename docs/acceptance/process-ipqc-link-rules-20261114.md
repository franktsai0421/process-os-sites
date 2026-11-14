# 製程方塊 ↔ IPQC A/B、C 規則候選

基準：最新 main `c178ae227bcddf528a493dbf8b586cf310564c5b`（已合併 #116）。獨立 Dot checkout、同一草稿 PR #117／分支 `fix/process-ipqc-link-rules-20261114`。沒有操作公司電腦、現有測試站／正式資料、真帳號、遷移、部署或 GitHub 合併。

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

## #116 共同整合

前身 d26da7b 的定向來源154、原子／採用233、歷史63測試與 C24組、lint／非增量TypeScript／guarded build、隔離原生 UI 已通過；10個工作流成功，Windows仍在完整回歸時，Frank 完成 #116 合併並要求整合新 main。這些只屬前身證據，不能當作共同整合通過。

本候選合入真 main c178ae2，逐一保留 #116 的 lifecycle180秒、確認／actor／revision柵欄、submit-only 權、原收據診斷與 UNKNOWN／no-replay；`process-authoring-v3.js`、`shared-draft-client.js` 與 #116 pinned source JSON 均加上 byte-identical main 斷言。Cache 同時保留 review 與 IPQC 新版本。來源證據按「此精確候選→真 c178ae2→#116原 main→既有歷史」串接，舊 hash／負例不變。共同的 signed routes、review恢復、原生 review/IPQC 與廣域 CI 必須對新 head 重新執行，最終 SHA／完整結果以 PR 為準。

#115 最新唯讀查證為 `3361ec0b6a7ab5a32f3a3df0cc53dfedaa7b07f4`，仍獨立 Draft。未修改其 refs 或搬入整份成果；其核准 master 投影與本次 C 身分檢查可語意並存，index／cache／source helper 未來仍需共同串接。#115 與本候選合樹尚未驗證。

## 驗證界線

測試均為獨立生成記憶體 SQLite／Map R2、隨機正常登入。真正 create-error／create-item→Save→Submit→另一角色核准；A/B 整份 module Save／review，C 從空 draft scaffold 新建，不改舊 QA 名稱冒充新增。

原生載具使用 production editor／controller／shared transport 與實際 signed routes，1440px 中文 A、390px 越南文 C；checkbox、跨頁保留、完成、Save、reload、自身／他人、兩步轉移、換 actor、晚回應、C lost ACK／404／原收據零 POST replay。這是隔離模組 UI，來源建立經實際 API；沒有宣稱完整 hosted/adopted SPA、品質來源建立 UI 或真人站點驗收。Dot 本機 Chromium 被 kernel socket／ptrace 拒絕後未重試；原生執行由 GitHub CI 提供。

NOT_RUN：真人站完整新來源流程、實體手機、真人跨電腦、多裝置／OS IME、真資料效能、部署，以及 #115 共同合樹。現場 v46 PROCESS V31 原撤回仍 UNKNOWN，沒有查明、清除或重送；AB V24／C V33、舊 QA L9空分類／C L10停用與進站樣本均未當作成功證據。
