# 2026-10-08 製程畫布拖曳與連線

狀態：EXECUTED。範圍為使用者12:13／12:16回饋；只修改3020使用的前端。分支`codex/ipqc-ab-local`，HEAD `ba6c7a25b211f83df9bbe7caf82bf646737bdbca`。保留原有未提交、FQC及模具工作，無commit／push／merge／部署、其他port操作或真實資料送審核准。先前C2C自動複審已取消，本輪不恢復。

## 改動與原因

- 取消paint時separate及拖動放開時place的自動避讓，避免使用者座標被顯示排版覆蓋。「整理本工段」改「整理連線」，僅重算直線優先的避障路由；所有座標、內容及拓撲不變，不發位置寫入，移除不再適用的復原整理。
- 標題pointer capture即時更新本方塊；放開只同步x/y，以這兩欄guard保護競態，其他卡片不搬動。取消手勢不寫入；失敗恢復拖動前位置並顯示原因。方向鍵沿用相同路徑。放開後重算線路，保留手動儲存語意。
- 拖動、平移、拉線及位置寫入期間延後render。背景poll只保留一個in-flight讀取，不以讀取busy禁用編輯；讀取完成碰上手勢不adopt。只有目前workspace內容改變才重建畫布，純metadata改變僅更新上方狀態。
- 出入口支援點選後跟隨游標及按住拖拉；可接端點變綠，預覽線移到合法目標變綠，非法目標變紅。支援由入口反向操作，仍寫出口→入口。點線確認刪除，可取消；替換一般方塊既有出口仍需確認。保留前後端自接、重複、循環、跨工段、入口／出口度數及CAS檢查。

程式：`public/process/process-editor.js`、`process-editor.css`、`editor-graph.js`、`process-authoring-v3.js`、`index.html`。新增gestures／poll測試，更新controls測試。未改schema、資料模型、BOM／IPQC業務欄位、後端寫入規則或上方版本流程。

## 驗證

| 驗證 | 結果 | 證據／界線 |
|---|---|---|
| 真實桌面滑鼠拖動 | PASS | localhost:3020合成副本pe-1從580,120拖至620,70；同步後維持 |
| 整理後位置保持與繼續移動 | PASS | 整理前後620,70；越文方向鍵再移至640,70成功；handler測試斷言整理零寫入 |
| 點選及拖拉建立連線 | PASS | 刪除pe-0→pe-1測試線，再從出口拖入入口重建；入口點選再點出口也重建相同方向 |
| 預覽綠色／取消／非法端點 | PASS | 桌面讀到`.pe-link-preview.valid`及`data-valid=true`，綠線截圖；實際Esc取消。非法紅線及方向限制由真實handler測試驗證 |
| 點線刪除確認／取消 | PASS | 取消保留1條，確認後0條；未改方塊內容 |
| 手動儲存／重新載入 | PASS | 儲存620,70與連線，重開並選EDITOR ACCEPTANCE後完全保留。後續640,70亦已手動儲存於合成副本 |
| 中文／越文桌面 | PASS | 整理、狀態、端點顯示與鍵盤移動；desktop-zh.png／desktop-vi.png |
| 手勢、讀取及衝突時序 | PASS | gestures 7組、poll 5組、sync-feedback 6組、controls 4組，原始輸出保留 |
| 幾何／後端完整性回歸 | PASS | 原feedback與integrity測試通過；包含BOM來源占用、多人與後端連線限制；本輪未改後端 |
| 390×844模擬 | BLOCKED | viewport工具set未生效，DOM仍1280×720；已reset，不能把桌面截圖當手機驗收 |
| 實體手機觸控／長時間壓力 | NOT_RUN | 沒有可用實體裝置，未作長時間效能保證 |
| ChatGPT獨立複審 | NOT_RUN | 使用者已取消，不重啟C2C |

6份定向測試與3份JS語法檢查通過。`verify.cjs`第一次最後的只讀checkpoint因sandbox網路EACCES失敗；測試本身均PASS，隨後經授權只讀執行`preservation.cjs`完成保全核對，未重跑已通過測試。不是API或業務寫入失敗。

## 資料保全與證據

外部證據根目錄：`<USERPROFILE>/.codex/visualizations/2026/10/06/01a10f85-7632-7cb0-b39a-8257d8cdf705/editor-gestures-20261008/`。

- `before/`：本輪開始前受影響程式／規格／HANDOFF；`git-before.txt`。
- `primary-before.json`、`primary-after.json`：127.0.0.1原3020快照；兩者revision均303，全部13個values鍵完全相同，見`preservation.json`。不用舊292或262覆蓋最新資料。
- `test-process-editor-*.cjs.txt`：可讀原始測試輸出；`test-summary.json`；`task-code.diff`：相對本輪開始前副本的五份程式檔差異，不把整個髒工作區當本輪修改。
- `green-preview.png`、`desktop-zh.png`、`desktop-vi.png`為3020合成副本實際畫面，不是設計圖。
- 沿用既有3020服務與媒體來源，未重啟。最新成功寫入快照仍在前輪`editor-feedback-20261008/runtime/primary-latest.json`與`synthetic-latest.json`，兩者不得互換。

回復程式時以`task-code.diff`逐段反向套用並核對並行工作，不可直接覆蓋整份HEAD或HANDOFF。原業務資料本輪零寫入，毋須資料回復；如後續另需資料回復，先保全當下最新快照，依[前輪服務回復程序](20261008-editor-feedback.md)，不可用本輪303蓋掉較新的使用者資料。

限制：使用者若把卡片手動重疊，路由可能沒有可用通道；保留其位置並提示調整，不自動搬動。背景寫入期間仍受正常鎖定與衝突處理保護。未宣稱所有任意布局都可零交叉。規格及實作入口已更新，舊自動整圖排版要求由最新手動定位要求取代。
