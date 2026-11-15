# 檢具／模具與品質頁實測根因修復

基底：遠端 main `e040a7e838133c0c9870850a49955cf045dbc02b`（#119，2026-11-15 本輪以 `git ls-remote` 核對）。隔離 clone 與 branch `fix/quality-save-read-root-causes-20261115`；不改既有部署 checkout、不操作測試站 QA 資料。既有 #118 標準／來源與 #119 效能／權限規則保留。下述時間皆為隔離測試；站點數字僅為委派觀察，不能互相比成實站加速。

| 問題 | 根因／判定 | 本輪處理及限制 |
| --- | --- | --- |
| FQC 移轉後長時間「儲存中」 | 合格 Save 收據已取得，但結果未 render，仍串行等關聯與 preview；查詢錯誤可能覆蓋寫入結果 | 先 render 真收據結果，背景更新關聯；獨立更新中／錯誤，更新中阻止舊選取重複確認。失敗／UNKNOWN 仍走原收據政策，沒有假成功 |
| AB GET Worker exceededMemory／45 秒取消 | 完整 GET 重複傳 active／working／saved／versions；無 ref 大子樹會一次 JSON.stringify，再一次完整 UTF-8 配置。檢具關聯更只需少量摘要，卻下載完整標準／照片資料 | records 完整 AB GET 有界容器序列化；新增明確 `references=<equipmentId>` 精簡投影供兩個檢具查詢入口，逐份驗歷史 SHA 與結構、同權限／可見版本，保留全部原必要依賴。未重現 Cloudflare 記憶體超限本身；單份 immutable 原件和所有 live bodies 仍需記憶體，不能保證任意容量 |
| FQC 按批次預設 AQL 欄不見、完成無回饋 | cadence handler 只開外層；由 none 切 batch 時，內層 AQL 仍 display:none，必填錯誤也藏在該欄 | 同步更新預設 batch/time 子欄，必填與正常提交流程保留；兩語系測 none→batch→空值錯誤→0.4 Save |
| 檢具首次 Save 約 14 秒 UNKNOWN，稍後成功 | 原有檢具 Save 已有合格 POST 結果直接採用及 receipt-first recovery，沒有額外 ProcessSync 版本 refresh；15 秒傳輸預算可因實際 I/O 製造 UNKNOWN。未取得該筆完整 trace，不能猜為同一種刷新 bug | 減少已量測的重複 session 查詢；預算未延長。保留 UNKNOWN 原操作、guards、generation、鎖與讀回驗證；檢具未知 UI 僅查原收據。原有 lost ACK／404／離頁／重進／重點測試保留；未宣稱根治所有 >15 秒寫入 |
| 本地未存、頁首仍「已儲存」 | 檢具未傳 localUnsaved 到共用頁首，原狀態只比 saved 與 server working | 顯示本地編輯／未套用未儲存、已套用共用未存、處理中、已持久化、同步失敗、結果未知；輸入與儲存開始即更新，不重繪表單；移轉另外顯示關聯更新中 |
| C07 暫編後變 C09 | 本地只依工作草稿最大碼預估；伺服器還保留歷史碼與 reservedCategoryCodes，正常可跳號 | 類別卡標暫編、Save 回報舊暫編→正式分配；保留 stable ID、歷史碼／關聯，不重編原件。隔離保留 C02 後新類別由 C02→C03 |
| 模具 Save／Submit／Withdraw／Approve 慢 | 與檢具獨立量測後，確有逐 permission 重做 session／revocation 讀取；完整 GET 26 次、生命週期各 13 次 | 僅精確兩個 inventory workflow 採既有逐請求 phase，完整 GET 4 次、各生命週期 4 次；R2 讀取數不變、每次只一 CAS、寫後新鮮 session 保留。525 待補屬資料，不改；實站約一分鐘確認仍待測量 |
| C V42 Save 後操作紀錄 UNKNOWN／APPROVED_HISTORY_SUPERSEDED | 補充 trace：POST 200 7.868 秒；另一次 approvedOnly uiHistory GET 409 6.750 秒，其後 compact GET 200。共用 historyMetadata catch 錯用寫入 UNKNOWN 文案，並無重試歷史按鈕 | 歷史失敗／版本更新獨立顯示、提供明確只讀重查；不改原 Save 狀態／收據，不自動寫入。未取得該筆實站項目持久化證據，不能因 HTTP200 或 UI 已存就代替唯讀項目核對 |

## 隔離測量

實際 TS handler + 簽名合成帳號 + SQLite `:memory:`／Map R2；不連實站。`tests/inventory-permission-phase.test.mjs` 對真 e040a7e route 作配對。正常模具 Begin／Save／Submit／Withdraw／再 Submit／Approve 每一步 session revocation reads 都由 13→4；archive GET 數依序 15／15／16／16／16／16，前後相同；每步 CAS=1。單次 Node 樣本前後約 5–32 ms，非穩定效能基準，也非網路／Cloudflare 時間。其他 module 或角色權限不變；每個 selected state／CAS retry 重新建 phase，測 auth/header drift 與 immutable 寫入中撤權不得 CAS。

`tests/ipqc-ab-capacity-probe.cjs` 兩個獨立 `node --expose-gc` 子程序對同一合成 DTO：輸出 25,243,734 bytes，前後 SHA256 都是 `085a59f49421c62ef8029a1fa63a857baab29a37c1fccc766bb639fdb72c0bc4`。本輪樣本 baseline/current ArrayBuffer 峰值增量 25,243,734／977,152 bytes，heap 增量 32,645,824／23,433,488 bytes，序列化 92／296 ms。容器有界以增加 CPU 換取較低峰值；樣本不是 Worker 128 MB 峰值測量。完整回應 chunk ≤64 KiB；單份歷史文字仍先完整驗 SHA，沒有降低完整性保護。

關聯專用投影測試驗同一原可見版本／項目摘要、穩定 equipmentId、pending／superseded、無寫入，合成回應小於完整回應 1/10；不把未授權／失敗當作零筆。缺失／腐敗歷史返回 503，不回部分成功。

UI 延遲測試保留 Save 結果，刻意不釋放關聯查詢也能立即看見 applied 1；更新中第二次確認不寫入。失敗與離頁晚到回應不改原結果。這是 synthetic DOM 執行全產品腳本；視覺／實體手機驗收需另列。

## 驗證狀態與交付

最終命令、PASS／FAIL／NOT_RUN 及精確提交／CI，以 PR 和本輪交付補記為準。新增 fixture 不寫正式資料；沒有 schema、migration、ACL、照片品質或資料包變更。來源完整性沿用原 manifests，另加精確 current→main 反向證明及 drift 負例，不能用測試修改豁免任意來源。

未做：測試站寫入／重送／清理、Cloudflare 實際峰值、真人驗收、實體 iPhone／IME、merge、部署、帳號權限調整、原工作站 connector。程式／CI 通過不代表實站所有頁面通過。

## 本輪本地驗證補記

- PASS：最終 runtime 的 `npm run lint`、`tsc --noEmit --incremental false`、`sites-source-check`、`git diff --check`；提交候選 25 檔敏感資料 scan 無 findings。
- PASS：新增 31 項（五套新 fixture）；既有受影響 568 項；來源逆向與任意 drift 拒絕 142 項。來源測試需已提交候選；初次 dirty/HEAD 差異曾拒絕，已保留記錄並在固定候選上通過，未調弱原 pins。
- PASS：`test-tooling-workflow-request.mjs`：126 個 handler 操作；`test-routine-equipment-isolated-workflow.cjs` 與 `test-routine-equipment-four-module-transfer.cjs` 完整腳本。涵蓋原操作收據、UNKNOWN／404、快速重點、CAS／撤權、已核准不可刪、照片／來源與全模組草稿邊界。
- PASS：第一次隔離 build 的 safe result 為 `PASS_BUILD_EXIT0_AND_POSTBUILD_KNOWN_AUTH_CLIENT_CHECK`；最終 commit 綁定 build 另於交付回報，既有 safe output 規則保留。
- BLOCKED（環境）：實際系統 Chromium 啟動因 `socket() failed: Operation not permitted`（process singleton Unix socket）失敗，原生頁面斷言未開始；compiled fixture 測試因此中止。另嘗試安裝 Playwright 專用 headless shell，官方下載回傳空／截斷 zip，安裝失敗。沒有繞過 sandbox 或借用其他工作的瀏覽器／服務。須由 GitHub 原生 CI 或可用隔離瀏覽器補驗桌面／390px、兩語系與視覺互動。
- NOT_RUN：Cloudflare runtime 峰值／實站延遲、C V42 具體新項目持久化核對、真人驗收與實體手機／IME。未部署、merge 或操作正式業務資料。

前後 trace、Node heap/ArrayBuffer、完整 log 都是本輪隔離證據；歷史查詢錯誤不證明 Save 失敗，HTTP200 也不代替業務項目唯讀核對。PR 為 draft，剩餘 CI／瀏覽器驗收須明列。

## 後續實測續修與分工（同一候選）

新增證據：檢具 Begin POST 200（8.227 秒）、後續 GET 200，reload 確認 V16 草稿／正式 V15；IQC 撤回 POST 200（10.669 秒）後另頁確認 V21 草稿／正式 V18，舊頁曾仍待審。這些證明原操作成功，不能作失敗重送。共同 client 原本會在合格原收據後等待完整授權讀回；等待期間 durable marker 的 hasUnknown 被頁首當作「結果未知／同步失敗」。新增 **只讀的 confirmedOperation 狀態**：只有原操作識別／世代等收據通過既有校驗才顯示「原收據已確認，草稿／權限讀回中」。保留 marker、UNKNOWN 寫入 barrier、完整讀回驗證與恢復程序，沒有以 HTTP200 或現在草稿取代原收據，沒有減少授權檢查或提早解鎖寫入。讀回失敗後可同頁查原收據恢復，不另送 Begin／Withdraw。IQC 在 live request 期間也不再把 in-flight marker 標成寫入結果未知；一般真正未知與讀取遭拒的隔離仍保留。

檢具「修改」後來約數分鐘才開啟，是 `openEditEquipment` 在顯示表單前 await 四品質反查。現改為先開表單，引用區自身顯示 loading／失敗並只更新該區，晚到回應不替換已輸入欄位。這不是移除任何儲存或刪除驗證。

檢具刪除原本沒有 loading，也沒有 strict preflight 的 fetch 時限，造成使用者看不到正在查引用。現保留原完整新鮮／順序查詢，加入 45 秒 action signal、可取消、單次 preflight 鎖與 actor／epoch／世代／原 row fencing；失敗／取消／切換不移除資料，不將查詢失敗當成零引用。無引用的新 QA fixture 能確認本地刪除，明確 Save 後 persisted working/saved 都移除；原生／來源設備及有引用資料仍阻擋。刪除不自動把其他本地修改保存，維持全庫一次 Save 規則。

AB V40 反查 `EQUIPMENT_REFERENCE_RESPONSE_INVALID` 屬完整 JSON 未能取得／不符舊 caller 格式的失敗提示，不能推定無引用。本輪新關聯專用 route 已由檢具編輯與唯讀查看兩入口使用，輸出相同可見版本的 stable-ID 摘要，不帶完整照片／標準樹；壞資料與權限負例仍失敗。Cloudflare 60 秒現象仍須後續實站複驗，不能由隔離測試宣稱已量測實站根因唯一性。

IPQC-C 移轉的 Begin／Apply 兩個 POST 200 及 working 檢具改變，**不等於保存快照**。本候選延續 C／AB 只套用 working、另到模組明確 Save 的既有授權界線，並立即顯示「已同步、尚未手動儲存」；FQC／IQC 的移轉才明確原子 Save。未對實站任何既存 QA 重送。

追加回歸：`equipment-reference-actions.test.mjs`（立即開編輯、保留 typed input、無引用刪除＋明確 Save、有引用阻擋、慢／失敗／取消／切換／重點／時限），`quality-ack-readback-status.test.mjs`（Begin／IQC Withdraw 真 handler、慢／失敗讀回、同頁原收據恢復、偽 HTTP200 收據負例）。原生 browser 的環境限制仍同上，不能取代實站真人驗收。

Frank 後續已將整體速度交給另一隔離 Codex；本工作不再擴充泛用速度優化。既有已完成的 request-local inventory phase 仍記錄於前述證據，供逐段整合，不另重做。共同檔案與注意事項：

| 檔案 | 本候選擁有的變更／整合注意 |
| --- | --- |
| `lib/process-state.ts`、`lib/versioned-shared-workflow.ts` | 較早已完成的精確 inventory permission phase；速度工作如重疊須保留相同後置 session／CAS fence，不整檔覆蓋 |
| `public/process/routine-equipment.js` | 本工作功能正確性：回執、移轉、刪除、編輯／反查等待；速度工作避免重作此邏輯 |
| `public/process/shared-draft-client.js` | 只讀合格回執觀察，限定檢具 Begin／IQC command 的呈現；沒有改 PROCESS、deadline 或收據清除條件 |
| `public/process/iqc-master.js`、`version-draft-ui.js` | IQC live／confirmed/readback 與歷史 GET 狀態；原 lock／readback 不變 |
| `app/api/ipqc-ab/route.ts`、`lib/state-records-response.ts` | 本工作 AB OOM／關聯投影；速度工作已分工避免重疊 |
| `public/process/index.html` | 僅相關資產 cache tag；與製程 PR #120 逐項保留各自標籤，不整檔覆蓋 |

未改製程方塊採用新版、V36 disabled／CANVAS_REVIEW_CHANGED 的專屬功能或檔案，這些由製程工作處理。共同 workflow 檔僅上述精確 inventory 條件分支，PROCESS 行為未改。

## 最終固定候選驗證與 main 整合

原候選 `52d4765acfb62939b908b3bae785d6f086f65009`（tree `3b499866008a5c527cd60ff09aa3d57721cb9745`）已完成：新增回歸 43/43、共用 client／IQC 313/313、既有受影響 568/568、完整來源鏈 167/167；lint、完整 typecheck、source-check、diff-check 通過，30 個變更檔敏感掃描 0 findings。綁定該提交 build 結果 `PASS_BUILD_EXIT0_AND_POSTBUILD_KNOWN_AUTH_CLIENT_CHECK`；模具 126 handler 操作、檢具生命週期與四模組移轉腳本通過。上述分組可能重疊，不相加宣稱唯一案例數。

交付前遠端 main 已因 #120 前進至 `c6ac41a6a996ac88e1b68370b371aed400773e34`。在同一隔離 clone 保留原證據 branch 後整合，不改製程功能：保留雙方 CHANGELOG／HANDOFF、兩組 cache tags，並順序接合 quality→adoption→既有 predecessor 的精確來源逆向與負例。原 pins／manifest 均不改。新整合候選的檢查以最終交付記錄為準，不能沿用舊 SHA 宣稱已驗。

GitHub commit 建立曾被自動審核拒絕，已停在本地候選；準備過的 GitHub tree 不是 commit、branch 或 PR，沒有 CI head。未從其他入口繞過。仍須針對明確授權及最終 tree 完成 publish，並查精確 head CI。

## C V50 Begin 回饋及明確上傳授權續修

Frank 在原對話明確同意將本批功能修復上傳 `franktsai0421/process-os-sites` 新分支並建立 draft PR，與速度工作分開、不 merge／部署。已透過 user_message_read 核實直接回覆對應此題；先前拒絕是歷史 checkpoint，後續依本次授權只重試提交一次，結果以最終交付為準。

補充 C V50：伺服器 Begin POST200 且新版本確實建立，但原頁曾顯示未知。原共用 C Begin 已有 GET-only 收據恢復，卻沒有接入本批新增的合格收據呈現。現僅擴展 `boundedScope==='ipqc-c'` 的 Begin 原收據觀察，C header／read-blocked 呈現「收據已確認、草稿／權限讀回中」；活躍請求不標未知失敗，私有 marker、鎖、完整讀回、原收據校驗與清除條件均不變。觀察只更新 header，不重繪表單，且校驗原 client／mount。

新增 `quality-c-begin-feedback.test.mjs`：兩語系執行真 C handler、共用 transport 及完整 C page，延遲／503／偽 HTTP200 收據六種，保留 typed input、原操作只一 POST、同頁 GET-only 恢復，真正未知仍阻擋。這是隔離 fixture，沒有對 V50 重送或實站寫入。新增共同檔案 `public/process/ipqc-c.js` 僅此呈現；主頁 shared client／C cache tags 升至 quality-root3。

## PR #123 首輪 CI 修正

遠端 `92dbe97d9007b0ec72849d966335e321c117027d` 的 PROCESS／AB-C local-save、Process IPQC link 及 FQC matrix 首輪 CI 失敗，原始 log 均指向兩個遺漏的嚴格 cache tag 預期：`navigation-adapters.test.mjs` 與 `test-fqc-matrix-layout.mjs` 仍要求舊 FQC 等資產版本。修正為本批實際新版字串，保留一檔一筆、順序及精確版本比對；沒有刪斷言。新增兩檔到精確 quality→main 逆向，讓 #120 及更早來源 pins／負例保持不變。程式 runtime 未變；另跑失敗原命令及 source proof。最新 head／CI 以最終交付為準，不沿用首輪 SHA 綠燈。

同輪 IPQC operation-speed 的 Linux／Windows 真 handler 配對發現 AB bounded full GET 的 Content-Type 從原 `application/json; charset=utf-8` 變成共用 stream 的 `application/json`。僅 AB caseMetadata=1 保留原 reply charset，非 metadata 串流及其他 route 的既有 header 不變；保留原整份 body／header 配對比對，容量回歸也新增串流既有 content-type 斷言。不是擴充泛用速度工作。

續跑 CI 還發現：Quality C joint 的窄函式 fixture 未載入 `writeShared` 新增的 `updateEquipmentLocalStatus`，造成 ReferenceError，現載入真正呈現函式及其內容比較依賴，送審／競態斷言不變；Process platform 的精確 timer inventory 尚未登錄刪除 action 的單次45s AbortController deadline。僅新增該 call 的精確 hash／用途，保留全清單對比，不允許未知 timer 或背景輪詢，deadline／取消／finally清理另由實際刪除fixture覆蓋。兩檔納入新exact inverse，舊 manifests不變。

## AB V29 Submit 衝突與照片狀態補充

Diem 的 AB V29 Submit 原409 MODULE_CHANGED_RECONFIRM 是 module adapter 的 stateRevision pre-CAS 保護；原 client 只將 AB local Save 的此碼視為已知拒絕，Submit 未列入，因此保留UNKNOWN，404原收據也無法解鎖。現僅對精確 module Submit、savedId／expectedRevision／input.stateRevision 齊全且無額外moduleAction／patches／guards的**原POST**，沿既有flight／actor／原command／V4 requestId證明判為未寫入，保留草稿、顯示須重新讀取／確認，絕不自動重送。缺requestId、偽fetch狀態或receipt GET上的409仍未知。

新增 `quality-ab-submit-conflict.test.mjs`：兩語系真AB handler＋shared client＋完整AB controller，驗原衝突不寫入且只一次POST、明確第二次確認才能送審；proxy／lost ACK／receipt-only反例、重載及404保留原marker與草稿，查原操作入口可用。共用header layout另由原生CI檢查，測試僅隔離該呈現port。已有舊未知操作若僅剩404、沒有原回應證明，**本候選不推測未寫入或清除鎖**；入口說明404不能判定，仍須原操作收據／獨立診斷，沒有自動重送實站V29。

Diem檢具照片完成表單後頁首矛盾，已由本批hasLocalDraftInput（含pendingPhotos）及live status處理。追加 `quality-equipment-photo-status.test.mjs` 雙語完整設備事件／client／kernel／adapter驗：選圖／完成表單0 PUT、0新增POST、已存photoId不變且顯示本地未存；明確Save才1 PUT＋1 POST，photoId寫入saved後才顯示持久化。照片I/O是合成，不能取代原生檔案／實站重載驗收。

新增共用檔案注意：權限工作若改 `navigation-adapters.test.mjs` 須保留本批tags與自身權限斷言；速度工作若改timer清單須逐筆保留此明確使用者刪除action單次deadline，不能整檔覆蓋。未修改帳號／ACL功能或製程方塊功能。

新版 `98de5a3e` CI 的 Account permissions 已越過原 navigation 失敗，再於後段 `account-page-entry.test.cjs` 發現相同類型的冷啟動tag預期遺漏。只修shared client／version UI兩個精確tag，保留單筆、存在、載入順序與CSS獨立版本斷言；不改任何帳號或權限實作。該檔納入新exact inverse，且全面搜尋其餘可執行測試／腳本的舊資產tag（歷史manifest不改），沒有另一處未處理的直接舊tag斷言。


## 423a930 FQC/IQC race fixture 與 #122 main 整合

精確 run 43732192912／job 132866870153 的原始 log 顯示步驟23 `test-routine-equipment-edit-open-race.mjs` 失敗 `0 !== 1`，前22步成功、後24–42步未執行。舊 fixture 的 render port 沒有真正的 lazy reference section，且仍要求反查完成後才開表單，與本批已授權的立即編輯行為相反。本次只改 fixture：載入實際 section HTML、loader、section updater／binding，保留模型／DOM-only 輸入、原始快照、single flight、關閉、modal、版本、身分／epoch／權限與離頁保護。44情境通過；三個 mutation 負例驗證 await-before-open、整表單重畫、刪除 late owner/request fence 都失敗。新負例加入既有 Equipment CI，未移除任何工作流程或放寬驗證。

已在隔離分支整合 main `346c5eefcca7621c481802502cbae61f2821e91d`（#122）。四項人工衝突：CHANGELOG／HANDOFF保留兩份唯一紀錄；index保留process-ipqc-frequency1與quality各自cache tags；source helper依序套用quality→#122 main→#120 main的精確逆向。#122的runtime process-ipqc.js／process-authoring-v3.js與新main完全相同，原frequency/adoption歷史manifest未修改；只為新組合建立嚴格hash／位置／EOL逆向，未知內容依舊拒絕。新head的本地與CI結果以最終交付為準，423a930的舊綠燈不沿用。

此次沒有新增整體速度優化、實站寫入、合併main或部署。原生瀏覽器仍需GitHub runner執行；fixture通過不是真人實站驗收。速度工作若整合共用routine-equipment.js／shared-draft-client.js／workflow與cache檔案，請逐段保留本批收據、輸入與引用保護，勿整檔覆蓋。


補跑舊步驟25時，transfer-intent的83情境有5個AB未知Begin案例仍假設executeTransfer返回時display refresh已結束。現在AB分範圍衝突結果先呈現，refreshing期間會拒絕重點，故第二次GET尚未發生。fixture新增驗證：refreshing期間重點不讀回／不重送；獨立查詢結束後明確操作才第二次GET；Begin仍只1 POST、Apply仍0、未知marker原bytes保留。未刪原案例，未改runtime或自動重試。


## a6f13841 Local safety 第31步來源 EOL 邊界

run43734705737／job132874671732完整原始日誌證明第31步的bounded-media-loading `C current-source policy uses exact HEAD bytes with CRLF checkout equivalence only` 失敗，具體是pure inverse未拒絕CRLF未知輸入。新quality successor投影可正規化checkout EOL，舊display inverse只對既有recovery successor驗raw hash，未涵蓋本批C successor，導致後續投影代為正規化；這是測試工具完整性邊界缺陷，不是產品照片或業務寫入失敗。

保留原測試全部斷言及原歷史manifest，為quality contract補raw afterHash，並在pure display inverse任何投影前對已知quality successor驗精確raw hash。imagePolicySource仍先用可信HEAD做checkout EOL核對，再把原始HEAD bytes交給pure inverse；不能以自行替換HEAD、修改image URL／lazy hints、刪除spans或其他bytes取得通過。新增EOL／偽HEAD／hint漂移及移除新guard的mutation回歸到Equipment CI。只改測試工具、來源證據及文件，不改runtime或資料模型；新head CI與實站驗收仍須獨立完成。


本機原bounded-media-loading 51/51與新三項控制通過；同失敗群組的14個可攜測試227/227通過。完整15檔原命令仍因Windows專用ci-integrated-exit需powershell.exe而在Linux不可用，未更改該測試或CI。繼續執行先前未跑的step31後段及32–34隔離命令；AB ack-deny native被Chromium Unix socket sandbox擋住，IQC content-issues／number-hint native缺既有headless-shell。這些均不是PASS，保留原日誌及Windows/native CI，不以替代品或skip改造門檻。step35–54 compiled/native驗證留待新head原CI，實站驗收仍未執行。
