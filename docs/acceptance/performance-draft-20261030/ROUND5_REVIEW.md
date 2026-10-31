# Round 5：獨立程式審查

## 製程編輯表單與線別／類別切換

本節由 IPQC 子項代理只讀審查主代理的 `public/process/process-editor.js`、`public/process/editor-line-selection.js` 新增離頁 hooks 與重複 clone 移除，並查閱直接呼叫端 `process-authoring-v3.js`、`delivery-navigation.js`、`navigation-lifecycle.mjs`。未修改受審程式。本節未執行原生瀏覽器，不能取代整合驗收。

在已審範圍未找到可證實的新增 correctness 缺陷：

- `commit(next)` 的兩個呼叫端 Apply／remove 均傳入自己的新 clone；仍保留原 workspace 的 rollback copy，sync 亦複製送出的 stages。失敗時只有仍由該 Apply 持有的 optimistic workspace 才還原，不覆蓋期間已採用的其他回應。
- `saveApply({keepOpen})` 成功後保留表單到外層 Save 與目的頁準備完成；失敗留在原頁。表單 owner 包含身份世代、delivery、workspace、草稿 generation；paint yield 前後及晚到成功結果有目前 owner 檢查。
- 目前 dialog 關閉事件只清除自己對應的 modal，避免舊 close 事件清掉新表單。套用／上傳中不能取消；departure 的 inert lock 可重入且各自只釋放一次。readonly 的 dirty form 不能 Apply，純本機 Discard 不寫入。
- 線別／類別選單先恢復原值，等同一個離頁決策執行才改 state；實際執行前再次檢查目標仍存在。Stay 不額外 render，保留原輸入和選取。有效 owner 與舊導航取消由共用 coordinator 負責。

審查提出一項實際測試缺口：新方塊第一次套用成功而外層 Save 失敗後，再次 saveApply 不應重複 insert；再次編輯須使用已存在方塊的 guard。主代理已加入此案例，審查者閱讀新增測試與 `/tmp/round5-editor-departure-direct.log`，確認該組 PASS。

| 證據 | 結果與界線 |
| --- | --- |
| `tests/process-editor-departure.test.mjs` | 主代理執行 15/15 PASS。含新方塊重試、Apply 衝突、晚到 owner、readonly、鎖定及 rollback；使用截取 production function 的 VM fixture，外層 Save 失敗是情境假設，不是完整 API/browser 實測。 |
| `tests/editor-selection-departure.test.mjs` | 主代理回報 5/5 PASS；審查者閱讀測試來源，涵蓋 Stay、延後執行、失效目標與未安裝 adapter 的相容路徑。 |
| 原生瀏覽器、鍵盤／觸控、dialog close/cancel 任務順序、IME composition、慢網路、Save＋目的頁失敗組合 | 本審查未測，由主代理的 compiled browser 結果另列。 |

剩餘風險是整合與原生事件時序的驗收範圍，不把上述直接函式測試擴大宣稱為全站離頁流程通過。未變更的既有「新增但未編輯預設欄位」仍按原 dirty 判斷處理；本輪沒有另外改定義或創建草稿的業務規則。
