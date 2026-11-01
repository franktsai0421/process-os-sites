# Master AB Save：依賴範圍與完整性界線

本階段以 public main `268a8e49ec751bb6849033e20a27d30194aad67c` 為準，僅改善 `/api/master/workflow?scope=AB` 的 canonical `save`。不是 IPQC-AB、不是登入，也沒有改 Apply／submit／approve／restore。routine 首次載入的 UI 消重另有獨立候選；先前四 API raw 重用候選亦未混入。

## 明示政策

owner 已同意分階段實作「權限、目標、必要引用損壞拒絕；經證明無關的損壞不阻擋當次操作，保留可追查資料」的故障隔離方向。本版是更小的第一步：五個 authority key 與整個 `masterDataControl` 仍使用原完整目標解碼、parser、context；master 內 C／PROCESS 的必要 body 也仍讀取，損壞仍拒絕。只不讀其他模組的 aggregate／body。後續縮小 master 內 scope 不是本版能力。

這會改變舊 full-state 的錯誤行為：無關模組壞資料可能由原拒絕變成成功（不是所有malformed raw原本都會parse，故前後故障實際結果逐案列）；records-v1 先驗權限，也會改變拒絕與業務資料錯誤的優先序。不能稱所有 storage fault 完全等價。

## 同快照 authority-first 與私有 writer

1. canonical command 只含既有 Save 欄位，精確 route/scope/body gate；不接受 client 宣告 projection/keys。read 前後及 encode 前綁定命令，不能 await 期間換成 Apply。
2. 只讀一個 D1 `shared_state` row；先以相同 manifest 解碼五 authority key。已存在 raw 的 SHA、JSON 語法及 authority mirror／override 格式必須成立，不把錯誤 catch 成空權限。合法缺省與既有 scalar 表示保留。
3. 以原 AB phase 檢查 signed actor、maintenance、view＋save；Save 不額外要求 edit。新增 pre-business fresh-session fence，才讀 master。仍保留原 master 解碼後、持久化前、CAS前及 replay terminal 的 fresh fences。
4. 同一 State 物件補入 master；auth raw、revision、credential basis 不換。原 master parser 的 active fallback／stable-ID normalization、所有 Save kernel、projection、receipt、review lock仍執行，不另造一套 Save 語義。
5. server-issued single-use handle 保 private 原 manifest／values／known／model／scope pins，普通 partial writer仍拒絕。非 AB active/scopes/versions、未知 root 欄、其他 aggregate refs、legacySources、allocations不得變。AB flow 的 working、active、cases、generation、base、pending、tombstones等非 Save 欄仍鎖；舊 saves prefix不可變。無 append 時 saved/contributors/flow revision不可換；新 saved須等於working、只 append一次、revision+1、contributors清空。所有已有receipt逐筆保留；至多新增本command operationId且actor相符，sequence只允本verified actor/client依canonical command單調更新，其他client完全不動。
6. AB root 的 active／versions projection由原受信任 adapter產生；codec不是獨立重新驗證全部 Save domain 語義。寫入僅overlay master ref到完整原manifest，不能把partial map覆寫其他模組。
7. immutable PUT→原fresh gate→原global revision CAS。失CAS重新讀取、重新授權、新handle，保原四次attempt上限；不刪失敗留下的共享immutable。unknown result仍receipt-first，不能重送POST。

records-v1 auth拒絕不讀master。inline/chunk/whole-snapshot及unsupported格式仍沿舊兼容路徑；其權限/業務可能同blob，不能宣稱也做到授權前0business bytes或相同加速。合法非canonical命令保原fallback，required已選資料SHA/JSON故障不catch→full讀取。

## 可追查不等於已驗全部資料

每次成功進入scoped path只記錄 bounded `record-read-scope` 診斷：policy `master-ab-save-v1`、shared-state revision、固定required keys與未驗aggregate數量。沒有帳號、cookie、body、命令或business內容。原manifest/ref完整保留，可交現有完整性驗證追查。未讀的物件當次是否損壞是 **unknown**，不聲稱已做全站integrity scan、不自動修復/刪資料或建立背景任務。

## 同條件 API VM 結果

真 route合成fixture與精確 main 比較；不是 Worker／HTTPS／browser click-to-ready。七次0人工等待、七次12ms/R2 GET人工等待，另外完整 legacy/full-reply契約比較。時間、CPU、SQL、撤權、R2、bytes、DTO、持久狀態分列；人工延遲不代表真R2 latency。Save新增fresh fence，SQL可能增加，不能只報R2下降。

目前較小的既有AB fixture：Save GET 8→6、SQL 7→8、revocation 4→5，PUT1/CAS1不變；Apply完全不變。replay仍無PUT/CAS，新增pre-body fence使SQL4→5、revocation3→4。不同完整fixture的絕對數另列，不混算。

完整 representative fixture（不是上述四鍵小fixture）：每source每mode七次，共28timing samples。

| 成本／時間 | main268a | scoped Save |
|---|---:|---:|
| HTTP requests／request bytes／response bytes | 1／200／2579 | 1／200／2579 |
| R2 GET／decoded read bytes | 18／151343 | 10／6419 |
| R2 PUT／write bytes／HEAD | 1／5347／0 | 1／5347／0 |
| SQL／fresh revocation | 7／4 | 8／5 |
| global CAS | 1 | 1 |
| 0人工等待 median／max ms | 10.359／20.884 | 13.202／27.239 |
| 每R2 GET注入12ms median／max ms | 223.469／226.899 | 126.927／138.055 |

本fixture decoded R2 bytes少144924（95.76%），不是整頁95.76%加速。零等待elapsed與user CPU反而回退；user CPU中位0wait為9.790→11.480ms，12ms模式12.844→16.520ms。峰值GET2、body0wait2/人工wait1前後相同、結束0；這是harness觀察，不保證Worker總heap。沒有跨business預讀。

7組legacy/full-reply配對完整結果一致：缺stable IDs合法補全、existing-case active fallback成功；不存在active ID則原版與候選皆500且不寫，沒有把原錯誤美化成成功。6種故障對照中，無關aggregate missing/corrupt、body missing/corrupt/malformed皆500→200，原ref及全部既有物件bytes保留；不含bodymarker的malformed aggregate raw原本未解析，實測200→200。

正常資料已驗完整DTO/headers/decoded stored state等價；故障政策差異另外named tests，不能拿故障樣本要求偽等價。compat full reply仍可能以recordJSONResponse後置讀取歷史body，須量body完成而不是只量headers。

尚無部署後／真頁面速度，不保證 <2秒或<1秒。無schema/data migration／員工資料操作／站點建立，沒有merge/deploy授權。

## 驗證狀態

- 113新case：55＋58個互補positive-pattern shards，union精確113、交集0，全部PASS。未分片768MB執行111個PASS後子程序意外終止，無assertion/FATAL診斷，不稱全過或確定OOM；較早384MB有明確heap OOM，皆保留。既有required CI保留完整suite，不降低case或規則。
- 原54 AB authorization/receipt tests已PASS，包含172-row權限矩陣；只調整新Save實際R2/SQL/fresh-counter期望，非AB／Apply未改。
- 新25精準guard測試PASS；獨立review發現的inline authority與receipt/foreign-sequence三個RED已修，最末固定source窄審PASS；原3反例與26代表重驗通過，均屬113案例的重疊證據、不加總。
- 已加固定main checkout、new suite與28-sample paired runner到原Windows CI；不替代既有full lint/TypeScript/build/compiled/browser required gates。
- 最末同版full TypeScript（768MB）、7受影響typed lint、原records codec 40歷史案例、identity-prefetch 42案例及YAML/diff檢查PASS。全repo typed lint的tsgolint子程序仍SIGKILL、exit1；沒有完整結果，不放寬設定，交required Windows CI。
- 發布前仍須對固定commit執行實際source full-history＋worktree preflight；精確commit/tree/manifest與結果列本地handoff。尚未公開／未部署，不以本地窄審替代requiredCI。

## 530b checkpoint 後的 authority 相容性補正

獨立後續檢查發現兩個真實回歸：合法 records 缺少 optional users mirror、合法使用者名稱恰為字串 `__immutableBody`，在 530b 候選均由原成功變成 500。原 530b 證據與反例保留，不再宣稱該 checkpoint 已涵蓋所有合法 authority 表示。

後續最小補正不把 legacy `platformUsers` mirror 當授權來源，也不要求它存在或等於已 SHA 驗證的 users aggregate；defined mirror 仍須符合字串 JSON 語法。maintenance inline override 繼續使用原 decoder 優先序。所有原 envelope/mirror bytes（含缺省、合法 stale mirror）仍保留。authority JSON 以原 exact immutable-reference predicate 拒絕真正 body reference，不再誤拒普通字串／描述欄。

同一真 Save route：新 14 案 PASS；與精確 main 的 10 組 healthy 配對（primary／非primary、兩種缺省 mirror、stale users mirror、literal user 名稱與 role 描述）完整 DTO／decoded state 一致。真正 nested authority body、malformed inline 仍在 master GET 前拒絕；mirror 不能補出權限。既有 30 個 authority／denial 代表 PASS，與原 113 套件有重疊，不加總；affected 2 檔 typed lint PASS。本補正沒有重跑速度以美化結果，前述性能數字仍是原 530b source 的觀測；完整 Windows CI／實站仍待驗，不聲稱部署加速。

後續補上必要 shared_state row 缺失競態：若首次 SELECT 沒有 row，立即沿原錯誤退出，不能把缺失當 unsupported layout 再 SELECT。真 main 為 500／1 SELECT／0 writes；補正前 a77 在兩次查詢間新建 row 時錯誤成功並 CAS。新增回歸確保 1 SELECT／0 R2 GET／0 revocation／0 PUT／0 CAS；最末相容性套件 15/15 PASS，前述 14 與此套件重疊不加總。這不改正常 existing-row 性能路徑，未重測或改寫前述時間。
