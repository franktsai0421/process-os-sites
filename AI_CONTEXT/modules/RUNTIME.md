## 2026-10-25 Sites 圖片讀取候選（未發布）

`canonical-assets` 僅新增接受正式 `imageUrl()` 產生的精確 `#asset-<source SHA>`
片段；錯誤片段、其他版本與文字子字串仍拒絕。與 `state-media` 共用 request-local
可見引用掃描：先驗證 aggregate SHA，再依既有 `publicState`／角色規則移除不可見
內容，僅 hydration 一個可讀 aggregate，找到引用即停止。保留 caller 的已去秘密身分
欄位、legacy editor／adoption 邊界，以及混合 inline／immutable master 的舊 equality
路徑；不擴權、不改全域 active-only 政策。兩條圖片路由回傳前重驗 actor／revision，
拒絕或例外會取消未交付 body。無跨 request／actor 快取。

`effective-versions` 先認證，再只讀 SHA-verified control metadata；保留 master 首個
approved、legacy 同 category/line 最後 approved 與各 scope active ID 的既有順序。
讀後重驗身分及 revision。投影被標記 partial，不能當寫入 baseline；無 schema、
資料、帳號、R2 物件或 ACL 修改。legacy inline/chunks/monolith 仍有原本全解碼成本。
隔離測試／編譯與真站台驗收是不同證據；候選不代表 live 延遲或記憶體已修復。

## 2026-10-17 離線完整快照更新與儲存入口

`scripts/dev-package-update.mjs` 提供 register／plan／apply／status／recover 及隔離 TEST install-test。管理者核對的固定輸入與雜湊限制目標、來源、相容版本及發布包；不是 Canonical 同步或帳號管理入口。`local-update-guard` 拒絕未完成交易，`local-storage-lease` 讓已啟用目標的正常 SDK／SQLite／server 入口在實際關閉前持有互斥；`local-storage-sqlite` 保留未提供 options 的原生建構語意。未知建構或關閉結果留 HOLD，不從 catch 推定資源安全。舊未啟用目標不建立新互斥檔，但仍檢查未知交易。

`local-data`、初始化／server、備份／還原／排程及 feature-upgrade 依此共同契約；未支援的直接 Wrangler／歷史診斷入口不等於受到 OS 強制隔離。交易的 .u1s 與 .process-update 不允許當一般專案根，也不進備份／Git／交付程式。完整容量更新、SDK 暫存關閉搬移及中斷恢復仍依實際收據驗收；不得從原生小型 SQLite 回歸外推。操作與保全見[更新說明](../../docs/local-integration/OFFLINE_SNAPSHOT_UPDATE.md)，資料模型見[本機操作紀錄](../DATA_MODEL.md)。

## 2026-10-16 入口、正常平台登入與品質編輯路由

i18n 顯示修正限 DEMO 關閉提示、播放完整句／計數與正式工段 code/name 完整 label；保留代碼、中文、計數及空白，不改主資料。21個工段的42個 option/header label採完整比對，避免 substring 搶先消耗較長線別／工段文字。早期 B選項尾字及 C標題混語 FAIL 保留原收據；修後真 GUI 與 synthetic 範圍依[整合進度](../../docs/local-integration/20261014-github-upload.md)區分。

styles.css 僅調整非全螢幕空播放頁卡片／文字／標題及 LIVE 對比；真 Chrome 深綠 rgb(40,114,50) 對原紙色背景為5.30:1，原1.44:1 FAIL保留，全螢幕不由此接受。DEMO入口關閉、後端正常／demo身分、角色及CAS規則不變；H6正常 Chrome 表單登入既有 frank 的證據可依差異沿用，H9 retained session 不是另一次登入。dual-system.js 在原 canView(editor) 通過時保留品質側合法初始 editor 路由；H8真 reload／新分頁停在editor，sidebar／go／popstate／login及其他 quality views權限不改。PROCESS重繪的 binding保全契約集中於[主資料](MASTER_DATA.md)，最新來源、站台生命週期與驗收限制集中於[整合進度](../../docs/local-integration/20261014-github-upload.md)。 EQ／FQC的語言來源改為當前分頁document已知zh／zh-*／vi優先，僅unknown才fallback共享storage；不改global i18n或寫storage。H11 已真雙分頁以相反語言及正常搜尋重繪確認當頁語言保留；此限域PASS不代表所有輸入／IME、全站雙語或實體裝置接受。共用唯讀快照使用i18n-skip以保留原始使用者文字，與UI局部翻譯分開。 shared-state GET 過期判斷僅追加 user.sessionType===platform 的既有已驗證正常session通道；sessionType先經HMAC、有效期、撤銷、帳號啟用／刪除、authEpoch及stored-DEMO區分，不採偽造header。匿名、DEMO關閉、普通OAI或credential-header-only通道仍依原期限拒絕，原ADMIN保留。POST、角色、CAS、scheduledBackup與privacy projection不改；18項真handler／HMAC記憶體及TypeScript通過後，H14另有正常STAFF／RD各一次既有憑證表單登入與dashboard投影的窄原生接受；不同人流程、暫態查看入口與後續修正狀態集中於[整合進度](../../docs/local-integration/20261014-github-upload.md)，不擴成全角色/API接受。

## 2026-10-15 最低 Node 的明確升級備份

`local-feature-upgrade.mjs` 透過 node:sqlite namespace 判斷 backup 能力。Node22.13缺API時在交易開始前用轉義目的地的 VACUUM INTO；Node24保留原生backup，其失敗直接拋出，不換路徑。兩者驗全部表值、明確ID、schema/index與integrity；邏輯snapshot不保證隱含rowid或page/byte相同。DDL中途失敗回滾；COMMIT後flags發布失敗會停止、保留舊flags與備份，可明確新備份路徑重試，不能宣稱跨DB／檔案整體原子性。無schema或正式資料migration變更。[驗收範圍](../../docs/local-integration/20261014-github-upload.md)。

## 2026-10-15 本機候選契約與工具範圍

Spinner恢復原React.ComponentProps<svg>及单Loader2Icon，defaults後props spread、ref／tabIndex／focusable及focus／key／pointer callback/currentTarget原樣留SVG。曾試驗OUTPUT wrapper／statusProps與強制SVGhidden／focusable均撤回，不為lint改公開API。exactbytes＋7element／SSR定向及typecheckPASS；nativeDOM未宣稱。

112組standalone試驗只留8組有actualpositive，104非必要未驗core已在outside備份後恢復原CJS；冷入口截停不是normalworkflowPASS。test-local-backup兩版本以正式API、syntheticSQLite及System32tar完成加密backup／restore／rollback，外部PROCESS_BACKUP_PATH清除、TMP／FS／SQL／tar／delete限ownedrunner，無MainSQL。CJS UI factory與guard/browser fixedbuiltin sidecars維持同步契約；複製完整scripts必含必要adjacentcores／sidecars，未保證未知外部單檔copy。

三dynamicdelegate仍保留captured method與每次apply/call lookup；bound adapter反例表示提早捕捉並非strict等價，未套用。合法CJS／beforeunload／原SVG status lint警告誠實保留，規則未降。完整V5payload/importer/productionAPI不變，保留之前真cold/normalHTTP與history保全的來源證據；最新binding以[整合紀錄](../../docs/local-integration/20261014-github-upload.md)／忽略pointer為準。

## 2026-10-13 受保護工作區啟動

備份網站遍歷現在同時排除 `.env*` 與 `.dev.vars*`，含子目錄；不變更私有D1/R2內容、AES-GCM或既有還原流程。新實際加密archive定向測試核程式／圖片／D1／R2 metadata及blob保留，密钥／設定另存與全量範圍見[備份規則](../../BACKUP_AND_RESTORE.zh-TW.md)。獨立11項合成完整還原是在修正前5c94來源；本次8b84僅補設定排除及共用walker相容，不冒充重跑完整套件。

Windows停機檢查核建立時間、預期entry／root、所有Local Node與workerd父鏈；另一Local實例還必須核其runtime PID／creation、root/config/state、source/config hash與local bindings。相對entry只從本工作區與本module來源的既有isolation声明發現唯一有效runtime；未知、缺metadata、重複匹配仍拒絕。future local-dev marker附root/entry，現有marker不改；非Windows保留保守PID規則。20個合成邊界與真正Main stop gate PASS；完整私有資料保全的執行被自動審查拒絕，沒有开始Main copy／restore。

實際已授權3035舊checkpoint還原找到268字元SQLite staging path ERR14，目標啟用前停止；同一檔以Windows namespaced path可讀。`local-revocation-recovery.mjs`四個SQLite constructor用`path.toNamespacedPath`，保留原manifest/path、feature/schema與新logout閘門。338字元合成實際還原、受影響signed-session既有檢查與1.625GB真Miniflare形式舊fixture還原PASS；後者是rev27/6合成帳號，不是Main最新或全部產品UI驗收。

`version-workflow.js` 在 ProcessSync protected 工作區不執行legacy範例seed、dispatch預設或persist。未保護工作區仍保留有效範例行為；空A-CUT或無樣例產品時安全略過並還原原category/line，避免startup TypeError留下錯誤選擇。隔離VM及3036真正C01/C02冷載窗口無新錯誤的限定採證，與未測範圍見[驗收紀錄](../../docs/local-integration/20261010-permissions-admin.md)。不建立業務資料來掩蓋啟動錯誤，不改登入撤銷規則。

## 2026-10-09 隔離登入撤銷與讀取修正

`session-revocation.ts`新增opt-in持久token digest撤銷；啟用前明確migration，公開request不建schema，讀寫失敗拒絕。3020僅自身private runtime使用持久secret與獨立SQLite ledger；日常3000未啟用。逐session API及副本恢復PASS，真正restart-replay協調逾時FAIL保留，最新PID8500 HTTP可用，不代表全部驗收通過。[完整範圍與恢復](../../docs/ipqc-reference/20261009-session-revocation.md)。

inline legacy readState避免同request第二次JSON解析，R2/chunks/records保護不變。隔離完整checkpoint在落磁碟成功後快取完整Buffer，每GET查DBrevision，原queue及checkpoint成功回應閘門保留；完整開啟負載尚未達標或重驗，不由helper時間冒充UI。[安全收尾](../../docs/web-feedback/20261009-integration.md)。

# 執行、權限與備份現況

狀態：Current source notes；整理自本 checkout 既有現況文件。2026-10-05只定向核對來源，不重跑功能測試；歷史數量／版本與PASS僅屬原日期證據。確認需求見[現行規格](../../docs/specs/current/README.md)。

## Runtime and Architecture

- 2026-10-05整合：legacy共用同步收到revision衝突時，重新讀取並逐key比對，僅對未改變的本次寫入key重試一次；同時記錄其他已變動key，阻擋後續或已排隊的舊畫面寫入。保留帳號專屬未同步保全及切換帳號防護。儲存失敗依衝突／權限／連線提供中越提示，1366／390不溢出；V3手動Save、固定案件與權限規則不變。

- Git workflow, hook limitations and review authority: [AGENTS](../../AGENTS.md) and [employee workflow](../../EMPLOYEE_WORKFLOW.zh-TW.md).

- The formal Git working copy is the repository root. The older site source is a readonly recovery copy. Tracked files contain no workstation-specific absolute paths. Browser regressions resolve optional installed tooling through `PLAYWRIGHT_MODULE`/`CHROME_PATH`; missing dependencies fail without downloading. Host backups default to ignored `.local-backups` under the repository, with `PROCESS_BACKUP_PATH` for an explicit local override. `test:portable` verifies these defaults without performing a real backup.

- Vinext `1.0.0-beta.5`, React 19, TypeScript, Vite, and Cloudflare Workers-compatible server routes.
- `app/page.tsx` redirects `/` to the client application at `/process/index.html`.
- The primary UI is an existing JavaScript SPA under `public/process`; React currently supplies the host shell rather than the process screens.
- Hosted persistence uses Cloudflare D1/SQLite through the logical binding `DB` and private R2 snapshot storage through `STATE_ARCHIVE`.
- Canonical images: 205 real metadata-stripped WebP images (~7.92 MiB) are versioned under data/canonical/assets/web. Local bootstrap/export/sync retain existing immutable-image and backup safeguards; /api/canonical-assets remains loopback-only with PROCESS_LOCAL_IMAGES=true. Complete hosted releases import these same bytes into target STATE_ARCHIVE and package generated static WebP plus Canonical-derived legacy image aliases, without changing the Local-only API. Originals/videos/private uploads remain private.
- Canonical collaboration uses domain files under `data/canonical/`, stable IDs/hashes, Local export and conflict-aware three-way sync with verified backups/rollback. Task commands guide local branches and review without automatic network/Git upload. Quality records are CLI collaboration data; no new quality UI has been added. See [Local collaboration](../LOCAL_DATA_COLLABORATION.md).
- `scripts/import-local-bom.mjs apply <reviewed-plan.json>` coordinates Local BOM updates with the dev server stopped, a work branch, revision checks, transactional D1 batch, staged Canonical files and verified physical/project-file backups. `rollback <backup-folder>` restores the backed-up version. It tests restoration/reapplication, checks the reviewed duplicate's preorder position and updates the sync base. Actual-BOM browser acceptance uses isolated SQLite/R2 fixtures without changing real Local draft selections. Backup inspection uses disposable copies to preserve SQLite backup indexes.
- `npm run dev` first verifies Local-only mode and the existing Drizzle migrations, then bootstraps only an empty Local schema from Canonical with passwordless demo users. Installed Miniflare uses its supported built-in Request.cf fixture, telemetry is disabled and Node outbound guard allows only loopback. It rejects remote/Production overrides and refuses incomplete existing schemas, missing demo setup or ID conflicts without overwriting existing business data. Vite and the initializer share `.wrangler/state`; remote bindings are disabled. Windows host backup support remains separate.
- `.openai/hosting.json` binds the existing Sites project and D1 database. A saved source version is not necessarily the currently deployed public version. Sites uses a separate D1 from the fixed Workers release targets, so a public-demo Sites release must independently verify or safely append the three passwordless demo identities and pass `test:sites-demo`; a code-only publish does not seed them.
- Release/target/backup/synchronization policy is maintained only in [DEPLOYMENT](../../DEPLOYMENT.md); full-data and explicitly data-preserving maintenance paths differ.
- Historical Staging Paid-CPU acceptance is retained in the archived context/changelog; no current remote inspection was performed during documentation cleanup.


## Authentication / Permissions

- Backend write authorization is enforced in `app/api/shared-state/route.ts`; frontend hiding alone is not the security boundary.
- `/api/user-access` provides the current guarded account/role/password operations with protected backups and revision CAS; `/api/users` returns 410. Primary/peer/self/DEMO restrictions and public privacy projections apply. Generic shared-state account/role mutations are rejected. See [permissions](../../docs/specs/current/PERMISSIONS_ADMIN.md).
- Permission families include approval actions, status visibility/media, master delete/import/export, and view access.
- The shared-state API allows only an explicit key allowlist and uses optimistic `revision` checks. Same-origin checks protect writes.
- Startup uses asynchronous shared-state loading and parallel script preloads, executing the existing scripts in order after the snapshot arrives. Large embedded raster images and videos are delivered separately through immutable R2 copies and the permission-checked `/api/state-media` route, including byte-range playback. Writes resolve those delivery URLs back to the original data URIs and return SHA-256 receipts; neither the stored snapshot format nor original image/video bytes change. Original R2 snapshots remain intact. The generic shared-state client has no polling or automatic conflict overwrite; IPQC-C V3 has dedicated revision polling.
- Shared business JSON and new uploaded photos are held in memory and sent to the protected revision-checked API; large snapshots use private R2 with D1 references. Device preferences remain in `localStorage`. Existing browser process drafts are retained on load: a valid draft missing from the backend is staged after authentication, while a conflicting draft can be explicitly recovered from the editor. A legacy cache is cleared only after the returned complete stage content matches it and no later update is queued; changed or invalid old caches remain preserved. Save waits for all queued writes, including changes made during a write, and cannot report success before the server accepts them. A temporary failure retains the in-page data and best-effort session recovery, pauses background writes, and can be retried by pressing Save; 401/403/409 remain blocked for login/conflict handling. The generic client has no polling or automatic failure retry; IPQC-C V3 reads revision tokens and looks up uncertain operation receipts.
- Reopening a draft keeps a saved workspace at least as recent as its draft-version snapshot, including operation Apply and coordinate changes; approved/pending versions retain their existing locks. Initial shared-data failure refuses writes and displays a reloadable error state. Rendering errors also display an error state instead of an empty content area. Raster files that cannot be decoded are rejected rather than retained as broken photos; valid images can still fall back to their original bytes if compression fails.
- Legacy BORUAXE demo-photo defaults reuse matching media from approved versions of the same route before falling back to legacy static paths; existing operation photos are preserved. Image acceptance must verify decoded pixels and actual response content, because a successfully loaded placeholder is not proof that the image exists. The separately merged canonical-image baseline is required for Fresh Clone real-image availability.
- Master active-data changes require approval permission. Deleting master records or process templates requires `master.delete` and is blocked while review cases are pending.
- Operational backup APIs and host controls retain ADMIN authorization but are not ordinary daily-user navigation. Backup restore blocks effective pending cases across all adopted workflows before creating a safety backup or changing state. Restore/delete operations require secondary confirmation; host restore also re-verifies the ADMIN password.
- Documentation must never include real passwords or backup encryption keys.


## Backup / Restore

- **Cloud snapshot**: D1 `state_backups` stores preserved shared-state snapshots, capped at the latest 100. V3 removes Backup & Restore from daily-user navigation, including ordinary admin navigation; authorized operational preservation APIs remain. Commit is not a database or media backup.
- **Host ZIP**: default path `.local-backups` on Windows, configurable through controlled host tooling or `PROCESS_BACKUP_PATH`; daily-user backup navigation is removed. The asynchronous native picker reports errors/cancellation, but Windows execution timed out without an observable dialog in this run; actual selection/cancel remains unverified. Validated manual server-path entry remains available. The backend creates safe missing directories, checks write access/free space, and rejects roots, sensitive system paths, and traversal. Archives retain the manifest and AES-256-GCM encrypted payload safeguards.
- Automatic backup is disabled by default. When enabled, the schedule is Saturday 12:00 in `Asia/Ho_Chi_Minh`, with persistent weekly de-duplication and missed-run catch-up whenever an allowed site state read occurs; the backup screen does not need to remain open.
- Restore validates archive structure, hashes, version compatibility, path safety, and unpacked-size limits; it creates a safety backup and uses maintenance mode/rollback protections.
- Windows task/startup registration is an external host setup step, not guaranteed merely by deploying the Site.


## Current Important Limitations

- Most business records are stored as serialized JSON inside one `shared_state` row rather than normalized tables. Legacy large writes replace the aggregate. Explicitly adopted records-v1 writes changed immutable bodies and metadata before the existing revision CAS; normal writes do not reconstruct closed historical JSON. D1 still holds a singleton pointer map.
- Platform authentication supports scrypt passwordHash and existing legacy credentials; public responses strip both. Explicit migration/recovery is separate from login and has not been applied to the real 14 accounts in this task. Role sessions refresh only for actual effective-right changes; real revocation/password changes retain fresh identity checks. The optional session ledger stores only digests/expiry and follows its explicit target/runtime enablement, independently of authEpoch.
- Product/BOM/routing seed datasets are large browser-loaded JavaScript assets. Approved master data and overrides update the runtime catalog, but there is no normalized server-side product/BOM schema.
- `STATE_ARCHIVE` R2 stores immutable SHA-256-checked JSON snapshots above 512 KiB; D1 keeps their reference, revision and local-backup account metadata. Small and legacy inline records remain readable. Media remains in the same business JSON or static assets, but shared business data no longer consumes `localStorage`; new uploads are still bounded by client-side processing and Worker request/runtime limits. R2 objects are private and retained for recovery, not automatically garbage-collected.
- Demo identities are `demo-admin`, `demo-rd`, `demo-staff`, with `authMode: "demo"`. HMAC-signed HttpOnly/SameSite cookies have `sessionType: "demo"` and an eight-hour expiry; hosted HTTPS uses Secure. Every protected request checks the current flag and live account status. Local signing keys are randomly generated under ignored `.wrangler/local-only`; formal authentication is unchanged.
- `/api/release-state` is a maintenance-only snapshot export/import endpoint, guarded by a separate temporary secret (or local management URL), never by public demo ADMIN. Replacement requires an exact revision and confirmation, preserves the old state, then creates the new-state backup transactionally. Remove the hosted maintenance secret after release. The local recovery page preserves browser work before source-of-truth replacement.
- Code/schema establish implementation only. Latest confirmed requirements are routed separately; conflicts stay documented.


## Conditional workflow reads (2026-10-12)

BOM and process-authoring opt into a client token paired with an owned full model and its shared-state revision. Unchanged polls and permission-only queries hydrate fresh auth keys before returning; changed/full/history requests retain domain hydration and integrity checks. Metadata-only replies cannot advance the paired model token. Other adapters retain their default read behavior. Measurements and first-read/browser limitations are in [the current receipt](../../docs/local-integration/20261010-permissions-admin.md).

## Mobile Behavior

- The sidebar becomes an off-canvas menu below 720 px; major grids collapse to one column and dialogs constrain themselves to viewport height/width.
- The process inspector is a wide modal on desktop and near full screen on phones. User rows become readable cards, editor actions remain reachable, and status/dispatch layouts stack.
- Wide tables and process canvases use contained scrolling rather than forcing the entire page wider.
- Traditional Chinese and Vietnamese have dedicated responsive adjustments.
- The application language selector supports Traditional Chinese and Vietnamese only; English application mode is not implemented. Draft-save, legacy-recovery and load-error notices have complete Vietnamese translations.
- Known limitation: the graph canvas is still materially easier to use on a tablet or desktop. Every editor change still requires a mobile overflow and action-access check.


## QC

- QC is implemented as operation-level standards/IPQC content, approval validation, and status/player presentation.
- Legacy validators detected missing steps/standards/BOM/connections. Adopted process:platform reports approved business-content codes as advisories; permissions, locks, no-change restrictions, integrity and applicable BOM ownership interlocks remain. Quality validation is separate. See [confirmed process rules](../../docs/specs/current/PROCESS_WORKFLOW.md).
- The Quality Management shell and its placeholder pages are implemented, but there is still no standalone QC entity, inspection-result transaction table, or statistical quality module. Existing operation-level standards/IPQC and Canonical quality collaboration data are unchanged and are not represented as new UI records.
## Sites client import readiness

public/process/shared-state.js exposes importPending only for the exact 503 JSON
IMPORT_TARGET_NOT_ACTIVE response. bootstrap.js waits for that response before
preloading private scripts; pending imports show bilingual static navigation,
without claiming a verified identity. Other failures remain failures. No API,
image, session, draft/recovery, schema or platform gate is relaxed. The separate
recipe uploader is transport-neutral; see
[import readiness](../../docs/sites/IMPORT_READINESS.md).

The optional bounded-attempt import mode retains unknown quota, exact test-site
pins and existing owner/admin/session/export/origin checks. Its persistent
singleton and request ledger debit writes before execution and retain failed or
uncertain reservations; only one writer may enter across requests. Previous
verified-capacity behavior remains. A stopped/unresolved bounded campaign also
keeps active-marker visibility closed. No automatic cleanup, account reset or
paid upgrade is provided. See the same import-readiness contract for limits.

## 2026-10-25 FQC readiness candidate (not published)

The scoped candidate retains the existing sequential FQC workflow → approved AB
catalog → equipment data-read order. The dominant equipment read is narrowed
server-side; there is no new client permission round-trip or all-module revision
equality barrier. Unrelated concurrent state revisions remain usable. Adoption
and background event/poll paths are fenced by actor id, identity generation,
mount/host and reload invalidation. Normal same-actor refreshes may replace the
identity object without invalidating that generation. A workspace renders once
its required reads complete; polling begins afterwards. Failed/current-actor-
mismatched equipment reads cannot reuse cached choices. IQC's data-then-
permission ordering and document navigation remain unchanged. This is data
loading correctness, not a new page-admission permission rule.

`GET /api/routine-equipment?catalog=effective` retains the existing route's view
policy but selects only active approved catalog fields before immutable body
hydration. It uses one pinned state snapshot, preserving the full GET data-rights semantics.
Session identity is checked before business reads and after hydration for token
expiry/revocation, without a second global state read or unrelated-write retry. Legacy inline/chunk/R2 fallbacks and
legal empty catalogs remain supported; malformed active pointers fail closed.
The full GET and POST paths, business schema, stored records and ACLs are unchanged.

Isolated actual-handler fixtures cover payload parity, integrity, session revocation and baseline-compatible concurrent
revision behavior; VM tests cover concurrent load, current-generation adoption and
failed/stale responses. Synthetic fewer reads/bytes are not live latency evidence.
This does not remove full-page transitions: all major destinations need one
reviewed lifecycle/projection handoff design, including module-specific dirty
guards and side-effecting routine-report refresh. Source, build and live acceptance
remain distinct; see task evidence for exact candidate results.
