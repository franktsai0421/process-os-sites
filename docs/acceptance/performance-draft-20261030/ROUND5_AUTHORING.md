# Round 5 — 製程 authoring 範圍交接

工作基礎：`/workspace/process-os-performance`，接續既有 dirty tree；基準 HEAD `ca6647977a8680038444ce2c1ba4e80f2343cd0a`。本報告只記錄 authoring 程式、合成隔離回歸與工作量計數；瀏覽器速度及端到端驗收由主報告統一提供。沒有以此資料推定既有雲端站速度。

## 修改及邊界

- `public/process/process-authoring-v3.js`：Begin 等待原有 ACK 與有效權限後完成畫布更新；advisory 內容檢查改背景排程，送審仍重新檢查。未知權限的讀取、身分／delivery fencing 保留。
- 同檔審核頁 advisory 訊息改固定節點的 `textContent/hidden` 更新，避免只因檢查 pending／完成／失敗而替換查看按鈕。真正案件、權限或讀取錯誤變動仍維持原更新方式；全部 GET、fresh 授權與 ready 邊界不變。
- 同檔三選項 adapter：保存依序確認最新表單 Apply、畫布同步、單次 Save ACK 與目前 saved snapshot；全程保留編輯／畫布 lease 至導航交接。失敗不清輸入、不授權離頁；只有確認 clean 才可關閉來源視窗。寫入及持有 lease 期間暫停來源背景讀取。
- 寫入接入共用本人操作帳本；放棄只反轉可信的本次命令，保留先前共享內容、已保存快照及歷史。保留先前未 Save 內容時明確提示，不改全域 saved 狀態。
- inverse 結果未知時，只查原收據與目前權威內容。reload marker 存在時阻止新增 mutation，包括直接 Begin 入口及無 draft 時的 Begin 按鈕。reload 後確認收據仍缺內容對照時，提示使用者核對後明確 Save；不能無證據 Discard。404 不能視為未寫入或重送許可。
- `lib/process-authoring-workflow.ts`：同一 context 重用 master 及 BOM reader／查找結果，使用既有 `sameDraftValue` 深比較。IPQC optional prepared-master 介面由 IPQC agent 提供；保留原缺失、衝突、權限、引用與 readonly 檢查順序。不新增跨請求快取。

原有手動 Save 仍只保存已同步內容；使用者明確選擇「儲存草稿並離開」才先套用本機表單與同步畫布。原 Submit 仍送出先前成功 Save 的固定快照。初次載入共享 working≠saved 且無本人帳本時，不猜測修改歸屬；可依權限 Save，但不得無證據還原整份共享內容。

產品 SHA256：

| 檔案 | SHA256 |
| --- | --- |
| `public/process/process-authoring-v3.js` | `01f1437d86e0167787b2693dea0d8fb8ff05499dbc7bd9211bac963d23970732` |
| `lib/process-authoring-workflow.ts` | `5ae0cc754a7919ac41da11b42f5535df7dac9fc936bcc734e5346d016caa0ae7` |

## 測試結果

所有寫入均在合成 fixture、模擬 transport 或記憶體 SQLite／R2；沒有正式資料寫入。完整 log 與來源 manifest 位於 authoring-validation（本機證據 `.sites-runtime/process-platform-round5/authoring-validation/manifest.json`，依公開交接規則不提交），dot 資料包須保留此 ignored evidence 目錄。

| 測試 | 結果 | 範圍 |
| --- | --- | --- |
| `tests/authoring-review-status.test.mjs` | PASS 8 | 固定節點保留同一按鈕與焦點、中越文案、檢查失敗／重試、案件／錯誤更新、撤權及過期 delivery |
| `scripts/test-process-review-current.cjs` | PASS | 實際隔離 handler 的 Save／Submit／pending／withdraw／return／self-review，及中越 review renderer |
| `tests/authoring-departure.test.mjs` | PASS 19 | 真 controller＋ledger＋kernel；Apply／canvas／Save ACK、拒絕與失敗保留、外部交錯、prior-shared checkpoint、未知 inverse、reload marker、404、Begin 禁入與正常 Begin |
| `tests/authoring-begin-readiness.test.mjs` | PASS 5 | ACK／權限完成才可編輯、advisory 背景及失敗、過期 delivery |
| `tests/authoring-readiness-render.test.mjs` | PASS 27 | 前輪 readiness／重畫修復回歸；本輪 Begin／adapter 變動後通過 |
| `scripts/test-authoring-context-reuse.cjs` | PASS 17 | 實際 adapter 與前輪備份等價、錯誤與工作量計數 |
| `scripts/test-authoring-save-validation-ui.cjs` | PASS 30 | 手動 Save、未知／失敗、固定 cutoff、UI 狀態 |
| `scripts/test-authoring-submit-feedback.cjs` | PASS 60 | 固定 Save 快照、Submit／恢復、原有送審語義 |
| `scripts/test-authoring-unknown-recovery.cjs` | PASS 2 | 原 transport 未知結果恢復 |
| `scripts/test-authoring-begin-recovery.cjs` | PASS 22 | 已知／未知權限、過期回覆與顯式恢復；最終 Begin guard 後重跑 |
| `scripts/test-authoring-contentissues-readscope.cjs` | 有界 PASS：37 pairs＝34 exact＋3 既有差異 | 74 GET、0 寫入；差異詳見下節，不稱 37 組完全等價 |
| `scripts/test-authoring-contentissues-cache.cjs` | PASS 17 pairs／35 GET | 更新精確工作量斷言後全部通過；DTO／headers／I/O／權限不放寬 |
| `scripts/test-authoring-ipqc-read-reuse.cjs` | PASS 17 pairs＋10 unit＋3 拒絕命令 pairs | 34 GET、6 拒絕 POST；測量區間0寫入，setup 寫入另計 |
| `scripts/test-authoring-ipqc-assignment-reuse.cjs` | PASS 29 | 實際 TypeScript 驗證器、不可變輸入、來源／引用／錯誤順序 |
| `scripts/test-authoring-bom-map-removal.cjs` | PASS 14 | 實際 authoring diff／kernel／integrity；BOM map 移除與 guard |
| scoped configured oxlint | PASS | authoring 產品、新測試、兩個更新計數的既有測試；全專案檢查由主報告提供 |

最後固定節點修改的 before source 備份為 `/workspace/round5-review-status-before/process-authoring-v3.js`（SHA256 `e3b69e14c1f43320fef8a8e12a4914b635e61a8ad9d944948a79843b95087526`）。此修改後重跑新 8 案、既有 Save 30、Submit 60 及 process-review-current；其餘表內案例保留此前同輪實測，沒有為兩行局部顯示修改重跑全部領域套件。既有 process-review-current 的簡化 DOM port 原先缺 `querySelector`，首次執行失敗 log 已保留；只補固定節點 port 與空訊息 hidden 斷言後通過。

`node tests/authoring-departure.test.mjs`、`node tests/authoring-begin-readiness.test.mjs`、`node scripts/test-authoring-<名稱>.cjs` 可重現上述檢查。三個讀歷史 Git baseline 的腳本初次受 sandbox 的 Node `spawnSync git EPERM` 阻礙，使用已核可的工具 escalation 後執行；不是應用程式失敗。

## 工作量與舊計數斷言

本輪 context 合成 fixture 中 master parse `3→1`、BOM reader 建立 `3→1`、BOM 查找 `12→2`；AB／C 原必要依賴 parse 各維持 2 次。canonical 字串累計 code units `401770→458`。這是程式工作量，不是 API 或瀏覽器時間。

兩支舊回歸最初 FAIL 的 log 保存在 `contentissues-cache-stale-count-fail.log`、`ipqc-read-reuse-stale-count-fail.log`；沒有刪除或把初次結果改標通過：

- contentissues-cache 比較歷史 route `af7dbe48c6f3005ea5c02575f23f7de97e8bb024` 與目前 route，但兩側使用目前 adapter。新 request-local BOM cache 讓兩側各 1 次 factory、24 次 lookup、12588 次 key comparison；舊「baseline＝candidate×2」斷言不再成立。更新為上述精確計數及兩側相等；route validation `2→1` 的原斷言保留。
- ipqc-read-reuse 歷史基準 `4e1eaca6bbe83f72b0328a91da9972bcb9cc6348`，原預期 candidate IPQC reader 2 次；現在 master 由 authoring context 提供，IPQC reader 應為 1 次，且必須是 `ipqcABMasterControl`。更新為精確次數及 key 斷言；歷史 50 次、DTO、headers、I/O、拒絕權限與 CAS 檢查均保留。

## 既有 fault-policy 差異

readscope 腳本比較歷史 route `1c40495c4ee31d10501a6e46979ac8305db550c0` 與本工作基礎既有 route。34 組維持 DTO／status／headers／authority 等價；以下 3 組故障注入是歷史讀取範圍差異，不能稱完全等價：

| 注入故障 | 歷史 route | 目前 route |
| --- | --- | --- |
| 無關 tooling immutable body 缺失 | 503 | 200 |
| 無關 tooling immutable body 損壞 | 503 | 200 |
| 無關 tooling aggregate 損壞 | 503 | 200 |

目前 route 僅讀必要依賴，因此無關 tooling 故障不阻擋此 contentIssues GET；必要 AB／C、working 與 auth 故障仍保留檢查。這 3 組已由既有腳本標示 `UNRELATED_FAULT_POLICY_ACCEPTANCE_HOLD`，仍須負責人確認故障政策，不能因腳本有界 PASS 自動視為接受。本輪未修改 `app/api/process-authoring/workflow/route.ts`，其 SHA256 為 `e523ae6b0dc0fac2e81264ad252df708ff5c4e4f674d7f7e9d429e90e93ca674`。

## 整合注意

需與 root 的 editor departure hooks、bootstrap ledger 載入、導航 coordinator，以及 revert agent 的 canvas／ledger／marker 一起整合。原生 modal.close 事件延遲造成的 local-only Discard 問題由 root 在 editor 修正；本檔保持嚴格 clean gate。沒有資料遷移、額外套件或憑證設定。未在此宣告瀏覽器完成或速度改善；由原生驗收及全專案最後結果決定。
