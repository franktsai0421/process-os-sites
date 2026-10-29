# lint 載入契約與驗收界線

## 2026-10-28 新批准的 D2 契約調整（隔離候選，未發布）

使用者於 2026-10-28 14:00 UTC 明確同意三項使用契約調整；其中 Spinner 與離頁提醒在此記錄。這是新授權，不把下方歷史保留 FAIL／撤回候選改寫成當時已批准或已驗收。R1 工具另案。

- Spinner 現在以真正 HTML `output` 包住原 SVG。預設為原生 status，名稱 `Loading`（可用原 `aria-label`／`aria-labelledby` 指定中越名稱），預設 polite／atomic；caller `role` override 與 label／labelledby／describedby／live／atomic／busy 移到 output。非 status 的 role override 不強加 status 的 live／atomic 預設。
- 此 output 只表示載入狀態，不是表單計算／提交欄位；明確 `form=""` 解除 form owner，避免原生 form reset 的 output reset 演算法清除內層 SVG／留下 stale ref。正常 DOM 反例與修後 formowner=null、SVG/ref 保留均需驗證；不修改外部 form。
- 原 SVG 仍是 ref、className、style、size／動畫、event currentTarget、tabIndex／focusable 的目標；React 19 callback-ref cleanup 沿原 lucide 轉送。未指定互動／ARIA 的 SVG 預設 decorative；明確 tabIndex（含 -1）、focusable=true、事件 handler、title／children／其他 ARIA 或 aria-hidden=false 保留 SVG 暴露並附同名／說明關聯。這是保守 props 判斷，不是對 AT 操作性的保證。
- 明示 aria-hidden 同步 output 與 SVG；hidden、inline display:none、visibility:hidden/collapse 同步隱藏 output，不殘留可讀 busy status。顯式互相矛盾的 caller focus/aria-hidden 意圖不擅自改寫。任意外部 CSS／className 隱藏無法由 props 完整推斷；className 留在 SVG，整體隱藏應用 hidden／上述 inline style／aria-hidden。外部 root／direct-child SVG selector 必須依新 output DOM 調整，不能假稱完全相容或使用 display:contents 略過驗證。唯一 tracked attachment vertical spinner selector 改為匹配內層 data-slot=spinner SVG；未擴大共享樣式。
- Routine FQC 僅刪除 deprecated returnValue 賦值，原 dirty 計算、preventDefault、SPA 離頁 guard、manual Save 與資料／審核邏輯不變。批准能力底線是桌面 Chrome 119+、Edge 131+ 且無 legacy override；不是建議使用舊版本，也未核對公司裝置政策。其他 browser／mobile 不推定支援；行動裝置終止程序本來就不保證 beforeunload。

回歸涵蓋實際 React/lucide SSR、Tailwind selector 編譯、正常 ReactDOM hydration、object/callback refs／cleanup／StrictMode、SVG focus/keyboard/click currentTarget、hide/remount、中越名稱／ARIA props，以及實際 Routine dirty/handler/canLeave 的合成事件；合成 event.defaultPrevented **不是原生離頁提示 PASS**。原生畫面、responsive、AT announcement、dirty reload/close、取消保留／繼續離頁及公司 browser 設定仍未驗，必須在正式支援接受前補證。相關實作不得放寬 lint、guard、ACL 或規則；當前完整 lint 結果由精確候選／整合收據另列，不由下方歷史數字推算。

## 歷史判斷（保留原證據與當時限制）

2026-10-19 三處 borrowed-method 修正整合後，最新完整實跑為 **FAIL 2／exit 1**：Spinner 的 `jsx-a11y(prefer-tag-over-role)` 與 Routine FQC 的 `typescript(no-deprecated)`（`returnValue`）。三個 `typescript(unbound-method)` 已移除；規則、typeAware／typeCheck及其他安全守門未放寬。這是 lint 結果，不能把修正理由、純fixture或局部瀏覽器證據合併稱成全功能PASS。

2026-10-17 的 **FAIL 5／692 files，exit 1** 保留為歷史：當時有3個動態receiver、1個SVG accessibility、1個beforeunload診斷。精確CJS適用性調整由468移除463個require診斷、新增0，其餘5項multiset不變；收據位於 `Temp/sol61-equipment-clearance-cjs-root-20261017/`，不是目前仍有5項。

歷史 dd4b 候選為 415／681 files，其中 410 個 `typescript/no-require-imports` 分布於 110 支 `scripts/*.cjs`：229 個 Node builtin literal、137 個相對路徑 literal、6 個套件 literal、38 個動態載入。同步取得 helper、isolation guard、模組 cache 與錯誤時序都有契約；不機械轉 ESM。這些分類不表示所有載入點已取得例外。

## CommonJS 檔型適用性與歷史精確例外

目前設定只對 `**/*.cjs` 關閉 `typescript/no-require-imports`；[設定](../../.oxlintrc.json)根層仍為 error，非 CJS 與所有其他規則、plugins、typeAware、typeCheck、env、ignore 不變。`.cjs` 明確使用 CommonJS，允許 require 是檔型適用性決策；不是全面轉 ESM，也不是宣稱每個 loader、cache 或隔離流程已通過功能驗證。同步載入／cache 契約說明不應機械改寫來源，無須靠保留 463 個風格 error 才能維持。

下列兩個 facade 例外與四個移除診斷，是 2026-10-15 已驗證的歷史範圍；保留原收據。新 CJS override 已經實測生效，這兩條歷史例外對 CJS 已冗餘；歷史「未列 require 應報錯」控測不再代表新 CJS 政策，其他規則的負例仍有效。

| 檔案 | 允許的完整 specifier |
| --- | --- |
| [canvas-task-diff.cjs](../../scripts/canvas-task-diff.cjs) | `./canvas-task-diff.mjs`、`./local-evidence-paths.cjs` |
| [canvas-final-manifest.cjs](../../scripts/canvas-final-manifest.cjs) | `./canvas-final-manifest.mjs`、`./local-evidence-paths.cjs` |

兩支 CJS facade 保留同步完成、空 exports、cache 命中不重跑、清 cache 後重取 helper／spawnSync、同步 throw 與重試契約。既有 Node 22.13／24.19 原生對照及 fixed output 證據依 exact source SHA 沿用；本次只改設定，沒有重跑已通過套件。[測試入口與界線](CANVAS_EVIDENCE_TOOLS.md)說明實際覆蓋。

2026-10-15 的完整 checkout 實跑確實移除上述四個診斷。與 dd4b manifest 共同的來源範圍為 411 項，其中 406 個 require 診斷及下表五項完全相同；這是全量結果的子集核對，沒有另稱一次完整候選 411 實跑。checkout 多出的歷史 `docs/ipqc-reference/evidence/20261007-whole-module/verify-daily.cjs` 不在交付 manifest，另有四個 require 診斷，全部保留，因此總數仍為 415。沒有刪檔或修改 ignore 追求較小總數。

2026-10-15 的純語法正反對照：相同 `scripts/` 路徑兩個 facade 共四個允許 require 為 0 診斷；新增兩個相似後綴路徑、第三支未獲例外的檔案使用相同 specifier，共三個 require 診斷；兩支 facade 的 `var` 仍有兩個 no-var 診斷。明確核對實際檔數 2／3，避免被 Temp ignore 略過。對照 fixture 只關閉 type information；完整 checkout 實跑保留 typeAware／typeCheck。

## 診斷處理與保留界線

| 範圍 | 處理與剩餘驗證 |
| --- | --- |
| 原 463 個 CJS require 診斷（118 檔） | 已以單一副檔名規則適用性修正移除，未改載入程式。七個真 fixture 前後各受檢 7 檔：原 7 require＋3 no-var，調整後保留 4 個非 CJS require＋3 個 CJS no-var，僅移除 3 個 CJS require；兩次 linter 均 exit 1。fixture 未執行，只有 fixture 關閉 type information；完整實跑維持 typeAware／typeCheck。 |
| 三個 `typescript/unbound-method` | 已以 `Reflect.get` 擷取 `http.Server.prototype.emit`、`net.Socket.prototype.connect`、`dgram.Socket.prototype.send` 的callable。實際每次委派仍是原函式的動態 `.call`／`.apply` lookup、caller receiver、args／return／throw；不提前bind，不改成繞過該lookup的直接 `Reflect.apply`。TLS原文未改；歷史第三項誤標tls.connect已由typed負控校正為UDP send。 |
| Spinner 的 `jsx-a11y/prefer-tag-over-role` | 診斷仍FAIL。原SVG props／同步ref／callback及status契約保留；S2實際Chrome已限定驗hydration、object/callback focus、keyboard、hide/remount、ZH/VI及390×844模擬無overflow。這不是完整AT／跨瀏覽器／實機或全站驗收，不能為消診斷直接換成會改DOM或ref target的標籤。 |
| Routine FQC 的 `typescript/no-deprecated` | 診斷仍FAIL。保留dirty時 `beforeunload` 的 `preventDefault()`＋`returnValue`；未有明確瀏覽器floor，不擅刪legacy行為或以字串索引／`Reflect.set`隱藏同一診斷。H25真人Chrome Ctrl+R原生提示、取消後保留文字及乾淨重載已有該流程對照；不擴成所有瀏覽器或完整FQC業務閉環PASS。 |

## 三處修正的真實證據

來源為[readonly ingress guard](../../scripts/local-v3-readonly-guard.mjs)及[local network guard](../../lib/local-network-guard.mjs)。已選版本的完整ESM記憶體依賴fixture分別12與9項，加5項擷取等效／錯誤重寫反控；保留inherited getter的擷取receiver／function identity，以及委派時的動態call/apply、拒絕先於delegate、錯誤identity與參數順序。這些是isolated behavior fixtures，沒有native網路、TLS handshake、SDK服務或業務寫入。

真正typed對照使用同一208規則、typeAware／typeCheck：舊來源3診斷、新來源0；合併負控exit1正常。原未包含MJS型別專案而舊新都0的早期lint，以及先誤改TLS而仍剩UDP診斷的候選，均保留為不適用／失敗證據。根代理其後CAS整合精確兩檔並真跑全專案，收據 `lint-after-receiver-actual.json` 是FAIL2、receiverDiagnostics0；不是僅由fixture推全量結論。完整可定位證據由[HANDOFF](../../HANDOFF.md)交接索引管理。

## Spinner 與離頁提醒的保留判斷

[Spinner](../../components/ui/spinner.tsx)的S2限定原生Chrome結果是PASS，未改產品源碼或lint規則。預設可見viewport實際563×1001，不稱完整桌面螢幕；390×844是viewport模擬，不是實體手機。SVG的role／aria、refs及互動可見性均有觀察，沒有完整screen-reader／AT announcement驗證。[W3C status技術](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22)強調狀態訊息與AT通知；單靠DOM有role不能證明已達成。若改語意包裝／動態status，仍需保留SVG ref target與同步cleanup、同一實作的SSR/hydration、keyboard／focus、兩語、overflow及可用AT實測，不能用lint數字代替行為利益。

S2瀏覽器tab其後已關閉，但服務關站是獨立 **HTTP exit1 HOLD**：serverCloseObserved true、sockets0、無force、owned kernel actors全閉。原first failure未記錄，原因UNKNOWN；不能由browser PASS或all-owned-closed改稱服務正常exit0，也不強迫已通過的狹域UI重跑來掩蓋關站失敗。

[FQC handler](../../public/process/routine-fqc.js)仍只在dirty文件時保留既有離頁提醒。見[MDN beforeunload相容性說明](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)：legacy returnValue與modern preventDefault是相容性議題，不能由deprecated規則推出可直接刪除。現行 `returnValue = ''` 本身不是所有舊瀏覽器提示的證明，也不更改為新的truthy值冒稱已驗。若要移除／調整，先明定批准的browser floor，再驗真dirty/clean native reload提示、取消保留／繼續離頁、來源cache及既定支援瀏覽器；不能以純DOM dispatch或乾淨重載替代原生離頁測試。原草稿、pending、版本/CAS及正常審核契約保持。

目前結案判斷為三borrowed-method診斷已修、剩兩項保留FAIL與精確缺口；不新增ignore/suppression、不關規則、不縮browser floor。規則說明見[Oxlint no-deprecated](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-deprecated.html)。

歷史逐 span 分類與控測收據位於忽略的 `Temp/sol61-lint-policy-20261015/`、`Temp/github-upload-resume-20261015/`；本次唯讀適用性判斷及原始候選／protocol 位於 `Temp/sol61-cjs-lint-applicability-readonly-20261017/`、`Temp/sol61-cjs-single-rule-policy-candidate-20261017/`。2026-10-17 root 已依外部備份整合與實跑，歷史468與該次5項原始stdout／exit分別保留；既有 CI workflow 與 github:preflight 沒有 lint 命令，不宣稱 CI lint gate 通過。設定調整不代表產品 GUI、草稿審核、多人同時分頁、實機或跨電腦驗收通過。
