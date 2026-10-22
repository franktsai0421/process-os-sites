# FQC 搜尋與歷史：3040 驗收（2026-10-13）

本次已實作搜尋器，並在原 3040 以專用 QA 原生完成新標準→正式核准→工作→計畫→初測不合格→固定原品項複測合格→確認結案。未宣稱全部驗收項目通過；逐項限制如下。需求唯一來源為[現行規格第 9 節](../specs/current/ROUTINE_FQC.md)，原附件是本次驗收基線，不是另一套持續維護規格。

## 環境與保全

- 開始／完成分支 codex/ipqc-ab-local，HEAD 8b182626085bb2aa1f3a216903c5b373ee82bc44；使用現有 checkout 與未提交內容。依附件不 commit／push／merge／部署。
- 僅原 http://127.0.0.1:3040；process_demo_3040、原 runtime/.wrangler/state 的独立 D1／R2。未開新埠，未修改 3000 資料，未開發 IQC／模具／校準，無 schema／權限配置改動。
- 開始前已做 SQLite online backup、integrity_check 與 R2 完整備份：2508 檔、8,785,723,545 bytes；備份保留在 <USERPROFILE>/.codex/visualizations/2026/10/07/01a11470-77ad-76f3-98e9-32faedaef621/fqc-search-20261013/data-before。整庫私有內容不放進續談 ZIP。
- 原資料 99 文件、26 工作、20 案件、18 照片逐筆 SHA256 均不變；結束 102／27／21／18。原正式來源 534 項及 166 筆錯誤代碼完整相同，另加 1 項 QA。
- 新 QA 標準核准為 V28；改版僅追加 QA 說明並核准 V30。改版前後 102 文件／27 工作／21 案件／18 照片雜湊全部相同；舊文件仍用 V28 快照。[保全證據](evidence/search-20261013/preservation-final.json)、[來源保全](evidence/search-20261013/source-preservation-final.json)。

## 改動

| 檔案 | 用途 |
|---|---|
| public/process/routine-fqc-search.mjs | 唯讀索引、工作期別、同項條件、15 類單選、正式結果與曾經失敗、關聯明細、語言／焦點／組字保護 |
| public/process/routine-fqc.js | 搜尋頁掛載、來源回查、搜尋讀取不 Generate，回到正常作業才同步 |
| public/process/routine-fqc.css | 搜尋頁桌機／手機版型、44px 按鈕、可見焦點、手機返回避開頁首 |
| app/api/routine-fqc/route.ts | 受 view gate 保護的唯讀 search-preview；既有排程設定 gate 保留 |
| scripts/test-routine-fqc-search.mjs | 期別、產品、同項統計、更正、取消、免做／處置與聚合 fixture |
| scripts/test-routine-fqc-search-api.cjs | 直接執行真正 route 的隔離 SQLite／R2 權限与零寫入測試；不開 listener |
| 現行規格與 AI_CONTEXT/models/ROUTINE_FQC.md | 更新需求及實作說明；不修改並行維護的全域 HANDOFF／CHANGELOG |

無持久資料模型變更。來源、工作、文件、案件及照片沿原模型；新增搜尋索引／返回堆疊僅在瀏覽器記憶體。

## 原生 QA 識別與流程

操作者為既有 3040 FQC admin；每次自送自審均明確勾選並走版本確認平台，沒有 API 代替本輪核准或結案。

| 節點 | 編號／ID | 原生結果 |
|---|---|---|
| 新標準 | BORUAXE1021-FQC-L1-17；fqc-item:9497d0bb-c8d4-4962-b7d2-90827f0d693b | 啟用、每月，涵蓋 105B100051／105B100151；草稿及待審未生成工作 |
| 初次正式來源 | V28；7cef4435-3e1e-435d-971f-a33f9471062e | 正常 Save／Submit／明確自審核准 |
| 工作 | 上述 item ID @2026-10-01@2026-10-31 | 正常同步自動生成，未手動插入 Job；第二正常分頁／重整不重複 |
| 計畫 | FQC-PLN-20261013-0035；0e9d820e-3cb8-4b1b-82ba-252f0ebb0ca8 | 核准，核准前無建立報告入口 |
| 初測 | FQC-RPT-20261013-0046；c285a1c6-eb0b-486d-b866-78d1de07db6c | 樣品 105B100051，fail；真 PNG 上傳、移除後 Save、缺照片 Submit 阻擋、補圖 Save／Submit／核准 |
| 改善＋複測 | FQC-RTS-20261013-0047；b2e6a4f4-aca0-43b9-99a6-5c99c1df9743 | 同一改善入口建立；固定原品項，pass；原生 Save／Submit／核准 |
| 案件 | FQC-CA-00021；736252d5-40ad-4326-89f9-65ae0436348f | 核准 pass 後先 ready-close，再填 QA 原因確認 closed，2026-10-13T07:50:41.307Z |
| 改版來源 | V30；2cc0b4d6-d39c-41fc-bca9-2ac2ed226c97 | 原生核准，只改 QA 說明；舊工作／文件快照不變 |

所有 QA 名稱均為 QA-FQC-SEARCH-20261013。測試圖片為專用小型 PNG，並非真實品管量測；圖片內容雜湊已存在，因此 R2 照片數未增加。移除只移除草稿引用，原照片 bytes 保留。

## S 搜尋驗收

PASS 僅代表表列層級，fixture PASS 不代表每種資料都在真實 UI 新增演練。時間均為 2026-10-13；檔案證據含實際 UTC 時間／原生快照。

| ID | 結果 | 層級、步驟與證據／限制 |
|---|---|---|
| S01 | PASS | fixture 本期／指定／範圍／全部；原生非法起訖提示及明確全歷史。ui-invalid-range.txt、ui-explicit-all-history.txt |
| S02 | PASS | 隔離 fixture 的下月複測仍歸原工作期別；未改系統時間、未在原 3040 建跨月新資料 |
| S03 | PASS | fixture 身份不合併；原生主檔回查正確指定 QA、全部歷史並清舊搜尋。ui-source-backlink.txt |
| S04 | PASS | 原生 Space 切計畫、Tab 後 Enter 切初測，兩區只有一個 pressed。ui-keyboard-space-enter.txt |
| S05 | PASS | fixture 多項文件只計一次、不同項不得拼條件；未新增多項業務文件 |
| S06 | PASS | 原生 QA 涵蓋未測 105B100151 可找到，切實測為 0；fixture 同項條件。ui-covered-vs-tested.txt |
| S07 | PASS | 原生完整閉環後目前 pass=1、曾經 fail=1、open=0；原 RPT 明細仍 fail。ui-search-closed.txt、ui-search-original-failure.txt |
| S08 | PASS | 原生 RTS pending pass 時 pass=0、fail=1、open=1；ui-search-pending-preserves-fail.txt、search-pending-desktop.png |
| S09 | PASS | fixture fail＋undetermined／部分複測聚合；核心既有測試通過。不是只看第一列 |
| S10 | PASS | fixture 更正鏈、RTS／COR 舊號別名、原 fail 保留；本輪未另新增更正原生案例 |
| S11 | PASS | fixture disposal 不算 pass、waiver 不算實測合格；既有核心條件未改 |
| S12 | PASS | fixture 取消開關、有效計數及取消不完成工作；未在原資料執行取消／復原 |
| S13 | PASS | 原生完整 RPT 號被十一月範圍擋住，使用者明確按改查全部歷史後找到初測 |
| S14 | NOT_CONFIRMED | 原生關聯計畫→返回保持條件、選取及文件；第二次穩定。但第一次工具操作 scrollY 1068→1333，無跳頂，尚不能證明所有原生捲動情境位置完全相同。保留 ui-return-preservation.json，勿寫全通過 |
| S15 | PASS | 原生十一月预覽、重複切換；shared revision 1241／routine 786 前後相同、所有 record hashes 相同。preview-readonly-proof.json；隔離真 route 驗零寫入 |
| S16 | PASS | 隔離真 route：未登入 401、無 view 403、有 view 200；原 ?preview 仍要求 settings，未新增寫權。補強測試明確關閉 inheritRole／edit／save／submit／approve 等寫權仍可讀（test-search-api-view-only.json）；未以另一個真實低權限帳號登入 UI |

## I 輸入與版面驗收

| ID | 結果 | 證據與限制 |
|---|---|---|
| I01 | NOT_AVAILABLE | 本工具不能操控真實中文輸入法組字／選字／取消；程式有 composition 防護，不冒充 IME 驗收 |
| I02 | NOT_AVAILABLE | 無真實 Telex／VNI 操作；中越 Unicode fill 與正常顯示不等於輸入法驗收 |
| I03 | NOT_CONFIRMED | 一般連續填值／刪改 UI 可用；查詢同步、預覽有 sequence＋revision guard；未注入網路反序回應 |
| I04 | PASS | Chrome viewport 1366／1024／390／320；已看圖，無橫向溢出。390 返回原被頁首擋住，已加 scroll-margin-top，重驗按鈕 top=118.39px。見 fixed 截圖；非實體手機 |
| I05 | PASS | 原生中越切換，搜尋項目及文字保留，業務原文不翻寫；390px 中越截图及桌機越文 |
| I06 | NOT_AVAILABLE | 桌機與模擬尺寸返回、展開可用；手機鍵盤開合／原生觸控捲動未驗，S14 精確位置仍未完全確認 |
| I07 | PASS | 真 UI Tab／Enter／Space；可見 3px 焦點，390／320 最小可見按鈕高 44px。實體觸控未驗 |
| I08 | NOT_CONFIRMED | 原 3040 102 文件可操作；Node fixture 1000 工作／5000 文件建索引 31.18ms、各查詢 7.68–20.59ms。未做 5000 文件瀏覽器 DOM／網路整體效能，不能當整體容量驗收 |

## C 來源到結案验收

| ID | 結果 | 實際層級 |
|---|---|---|
| C1 | PASS | 原生新增專用標準／產品／每月；草稿、pending 快照工作仍 26 |
| C2 | PASS | 原生主檔 Save／Submit／自審核准 V28，並保存對話／持久快照 |
| C3 | PASS | 正常作業同步生成唯一 QA 工作、來源與產品一致；搜尋頁與主檔回查可見 |
| C4 | PASS | 原 3040 正常重整與第二分頁工作仍 27；readonly 預覽零寫入。管理起始／未來生效邊界另以核心及真 route fixture 驗，不改既有起始日 |
| C5 | PASS | 專用計畫原生 Save／Submit／核准；核准前不可建執行報告 |
| C6 | PASS | 原生一列一樣品、第二列重複樣品 disabled；真 PNG、移除 Save、缺漏 Submit 阻擋、補圖後核准。ui-duplicate-sample／ui-photo-*／ui-initial-review |
| C7 | PASS | 原生改善＋RTS、原樣品固定、pass 核准→ready-close→原因結案。ui-retest-fixed-original／ui-retest-review／ui-case-closed |
| C8 | PASS | 原生查 QA 名、產品與新文件號，計畫／初測／複測／結案串聯；舊號別名 fixture |
| C9 | PASS | 原生 QA 改版 V30、舊快照雜湊不變；未來生效／停用／刪除／未知自訂／既有未來工作由真 route fixture 驗 |
| C10 | PASS | 原 99 文件／26 工作／20 案件／18 照片及原 534 標準／166 錯誤代碼保全；新增清單吻合 |

## 命令與層級

- 最終 PASS：node scripts/test-routine-fqc-search.mjs；node scripts/test-routine-fqc-search-api.cjs；node scripts/test-routine-fqc-navigation.cjs；node --check public/process/routine-fqc.js。真實 stdout／exit 保存在 evidence/search-20261013/test-*-formatted.json。
- 本輪前段已 PASS：test-routine-fqc.cjs、test-routine-fqc-repeat.cjs、test-routine-fqc-actions.cjs、test-routine-fqc-operations.cjs、test-routine-fqc-sample-ui.cjs；終端結果在本對話。這些是隔離核心／事件／靜態 UI 檢查，不稱作原生 UI。
- tsc --noEmit --incremental false --pretty false：PASS，終端 session 63353 exit 0；typecheck-observation.json 記錄工具觀測，未重建 stdout。
- 新模組、route 及兩支新測試定向 oxlint：PASS，0 warnings／0 errors。首次新測試 CommonJS 診斷已修正；保留先前失敗紀錄。
- 完整 lint：NOT_AVAILABLE，並行 Temp/process3050-runtime/.oxlintrc.json 的非 root options.typeAware 使設定解析失敗；沒有改該設定。含既有 routine-fqc.js 的較早定向結果 FAIL，仍有未使用 catch、sort compare、template、floating promise、deprecated returnValue 等既有診斷。附件記錄的 13 個舊診斷未以本次結果冒充清零。

## 失敗／續跑與未驗證

初始 3040 停止與內建分頁接管問題，使用者在 Chrome 重新開啟後續跑；保留 preflight-blocked-checkpoint。曾因新靜態模組 404 重啟原 3040 runtime，未換資料或新增埠。搜尋轉正常作業漏同步、語言更新及手機頁首遮擋已修復並重驗。

主檔審核摘要顯示錯誤代碼 166→164（核准後還顯示 0→164）、確認者名稱顯示「—」；實際保存來源仍 166 且逐筆相同，核准稽核由資料記錄保留。這是既有共享審核畫面顯示問題，未擴散修改。審核平台中的案件連結曾未跳到异常頁，本輪經正常「例行檢查→異常追蹤」完成結案，沒有假稱該快捷連結已修復。

未完成：真 IME／Telex、實體 iPhone／手機鍵盤與觸控、S14 全情境精確捲動、I03 反序網路、I08 大容量瀏覽器測量、真低權限 UI、多項／更正／免做／處置的新增原生案例、完整 390px 編輯態全套。參考 preview HTML 已讀 source，但 file URL 被瀏覽器政策拒絕，未視覺比對。3000 整合、部署、實際工廠品管驗收依本次範圍未執行。

## 交付與續談

[續談說明](20261013-search-continuation.md)與[證據索引](evidence/search-20261013/manifest.json)。本輪停在 3040 本機實作驗收，不代表已發布。已驗項不應重做或以整庫還原撤銷並行資料；後續優先補齊上列未驗項。
