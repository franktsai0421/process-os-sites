# 2026-10-07 AB/C 群組最大路線（iteration9–10）

Task：依本機使用者三項回饋追加最大聯集、例外路徑直顯、產品套用預設。分支 codex/ipqc-ab-local，HEAD 84278d837898f4e836ec003f7adb67ff38f785c8；保留開始時175項未提交／未追蹤及其後並行工作。Astra第11輪獨立複審DONE，見[原文](evidence/20261007-group-routes-max/astra-done.txt)。上一輪及先前審核UI未完成項目見[前輪報告](20261007-group-routes.md)。

## Changed

- master-admin-ui.js：最大路線涵蓋同線／類別全部產品，去重且不受搜尋分頁影響。优先產品先後關係；矛盾循環以工段主檔順序打破並提示原產品。ABCD＋ABCEDE → ABCDE；B/PHAODIEN保持 PHAO→HCT→ASSY→PACKING→FINAL，不因主檔列舉順序把FINAL插到中間。
- 明確採用最大路線同次Apply改 defaultStages／routeMode，保留所有原產品stages。手動預設與最大建議分開，手動修改預設仍只更新繼承者。
- 產品列表／例外列表直接顯示不同路徑，相同者用預設標示。已明確例外但路徑相同保留獨立設定。
- 產品新增／修改增加預設預覽及套用按鈕，按套用至草稿才同步，取消不寫入。已有預設只改該產品；無預設時同次原子建立群組與模式，其他產品路徑不改。
- master-shared-client.js：群組原子Apply除了原欄位、完整產品集合guard，增加lines排序guard。CSS例外路徑換行。

排序是保留業務資料的實作選擇，未將未回覆的本機選項視為使用者已確認的業務順序；沒有將所有產品補齊為最大路線。矛盾路線須由使用者看提示、調整並經正常核准。

## Tests

| 項目 | 結果／證據 |
| --- | --- |
| A/B/C例子、重複工段、原產品不改、最大採用／移除、B一致順序、真實C整份手動Save／固定Submit／正常明確自審approve、並行排序衝突原子拒絕 | PASS，12項，[backend.log](evidence/20261007-group-routes-max/backend.log) |
| 既有工作流／跨ADMIN／員工／待審／並行新增／換群組／例外、產品投影、其他模組保全 | PASS，13項，[compatibility.log](evidence/20261007-group-routes-max/compatibility.log) |
| revision輪詢／延遲回應／帳號變更 | PASS，3項，[client.log](evidence/20261007-group-routes-max/client.log) |
| 3020 C/TIEN UI採用最大→手動Save→重整 | PASS，保存923d2241-697c-424d-be1e-dc39f78393b5；V5草稿，未核准；正常核准本輪在隔離handler fixture驗證，未稱真實3020 UI核准 |
| C新增產品套用預覽後Cancel；C/PVC既有3030101套用相同預設後關閉 | PASS；無新增產品／額外版本／其他产品变化 |
| AB B/PHAODIEN最大順序／C手動PVC預設保留、例外inline | PASS；[B順序](evidence/20261007-group-routes-max/b-maximum-order.jpg)、[C例外](evidence/20261007-group-routes-max/c-maximum-exceptions.jpg) |
| 桌面／390×844手機尺寸、新按鈕中越文、Esc取消 | PASS 定向；[中文](evidence/20261007-group-routes-max/mobile-default-zh.jpg)、[越文](evidence/20261007-group-routes-max/mobile-default-vi.jpg)、[套用預覽](evidence/20261007-group-routes-max/default-applied-form.jpg) |
| 定向oxlint／node語法 | PASS；全庫lint未重跑，不宣稱全庫通過 |
| 實體iPhone、全部群組逐一UI、日常3000資料核准、完整新發送播放 | NOT_RUN；沒有以尺寸模擬代替真機 |

測試初版排序使用主檔順序，實際B頁面發現不合理排序，已改為保留共同先後並補回歸。其後ABCD重複循環測試曾失敗，修復保留原相鄰順序約束後通過。初次lint測試檔有字串spread／prefer-const，修正後定向通過。

越文新控制文案正常；舊同步toast在切換語言時仍可能被既有翻譯器混譯，未宣稱全站翻譯完成。工段主資料名稱保留原內容。

## 資料保全／日常界線

[逐鍵比對](evidence/20261007-group-routes-max/3020-preservation.json)：3020 revision248→250，只masterDataControl的C草稿／保存紀錄變更；active、AB、cases及原產品stages全部保持。其餘IPQC、分配、發送、權限與模具／Routine FQC未改。

此輪未操作3000／3030服務或資料、不新增埠；共用checkout靜態程式可供日常3000使用，但3020設定與保存快照不會自動成為日常核准資料。沒有commit／push／Git merge／遠端部署。

## Documentation／data model／回復

更新GROUP_ROUTES規格、MASTER_DATA實作入口、CORE相容欄位說明、CHANGELOG、HANDOFF。沒有新欄位或schema migration，仍使用defaultStages／routeMode及products[].stages。主要回歸風險：群組順序存在矛盾時需人工確認；既有資料工段順序有歷史差異，不能把聯集視為每個產品必經工段。

私有備份根：`<USERPROFILE>/.codex\visualizations\2026\10\06\01a10f85-7632-7cb0-b39a-8257d8cdf705\group-routes-max-20261007`。3020-before.json=248；3020-after.json=250；files-before保存本輪修改前檔案。完整checkpoint不放repo。必要重啟前先另取最新checkpoint，不可覆蓋並行新資料；本輪沒有重啟服務。回復單次群組設定優先從保存／歷史內容建立草稿，保留現存原產品路線；程式按[本輪差異](evidence/20261007-group-routes-max/task-vs-start.patch)逐塊回復，禁止整檔覆蓋並行工作。

## Astra 第9輪複審修正（iteration10）

第9輪 NEEDS_CHANGES 的循環排序與產品寫入分支已修正／補驗。最大路線先以互相可達辨識強連通分量，再對分量排序，只在循環內依主檔排序；FINAL在循環下游時仍保持下游。衝突提示檢查原始相鄰順序，A→B→A也提示。新增兩個回歸，最新backend 12項PASS。

3020實際UI補驗（隔離admin2，並行注入admin）：
- GIA CONG無預設，新增隔離產品並套用預設；另一帳號先變更一個產品欄位，整次Apply拒絕（revision251不前進、無新增產品或群組設定），表單仍開啟且輸入保留；取消後以精確guard還原演練欄位。
- 重讀後相同操作成功，群組與新產品同次原子Apply，手動Save、重整顯示產品使用預設。revision254固定保存，所有原產品stages不改。[重開](evidence/20261007-group-routes-max/product-created-reload.jpg)、[衝突表單](evidence/20261007-group-routes-max/product-conflict-form.jpg)。
- 已有PVC預設：3050404原C-PVC→C-FINAL例外，產品表單明確套用C-PREP→C-PVC，Apply僅此產品變更，群組及其他產品不動；手動Save重整保留。[單品重開](evidence/20261007-group-routes-max/single-product-reload.jpg)。
- 演練後正常guarded API恢復3050404原路線／模式、移除本輪新增隔離產品，手動保存。保留TIEN及GIA CONG已採用的群組預設；新產品只留於隔離歷史Save審計，未送審／核准。其餘原產品工段全部一致。

[產品分支逐項API核對](evidence/20261007-group-routes-max/product-ui-checks.json)。最新[清理操作收據](evidence/20261007-group-routes-max/product-ui-cleanup.json)、[最终保全](evidence/20261007-group-routes-max/3020-final-preservation.json)：248→258僅C草稿／手動保存及操作收據變更；全部active、案件、其他scope、產品數／工段及其他模組保持。最新私有3020-final.json=258；保留原248及中間250，不以舊checkpoint回復。

本輪差異排除同時發生的Routine FQC交接／CHANGELOG段落，沒有將其算作本輪修改。新增／修改產品跨線分支與全部失敗形態未逐項UI窮舉；並行新增／換群組／例外／排序由既有定向API測試覆蓋。

第10輪複審確認排序／資料補件；截圖實際為JPEG但副檔名誤寫PNG，導致connector拒讀。第11輪僅更正九張圖為.jpg及報告連結，逐張核對JPEG檔頭與雜湊，原始位元組保留於專案外備份；沒有重跑資料操作。[格式證據](evidence/20261007-group-routes-max/image-formats.json)。

最終複審界線：衝突截圖直接顯示失敗後表單與路線保留；新增／單品重整截圖只涵蓋搜尋區、未完整呈現產品路線，保存内容及單品變更由API核對紀錄支持。第11輪DONE僅指第9–11輪最大路線功能與上述定向驗證，不表示完成先前審核UI或日常資料變更。
