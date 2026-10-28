## 2026-10-28 登入初始意圖 / Server-owned initial login intent
- 登入頁以正式server searchParams（保留重複值）交原loginIntent判斷初始系統／線別，SSR與hydration不再先顯process/A再跳動。
- Initial system/line now come from the server entry through the unchanged intent allowlist. Manual choices persist; submit still reads the current URL after its actual response, with original attempt fencing, marker handling and authorization.
- 新增23組query/SSR/submit負測，獨立ReactDOM hydration13例；不等同原生瀏覽器登入驗收，也不改raw-query匯入觀察規則。

## 2026-10-28 管理導航操作與 abort 型別契約 / Management navigation actions and abort contracts
- 經確認，7個設定／匯入頁的14個入口改為13個原生GET表單按鈕及1個本頁核對按鈕；保留原query值、4個_top及replaceState，不改中控首頁／FQC業務導航。接受不再提供連結專屬另開／複製操作。
- Owner-approved action-button semantics replace 14 management links. Native GET destinations, targets and local verification transition are retained; no framework prefetch or automatic business POST is introduced.
- 兩個真正不讀this的snapshot abort producer補明receiver-independent型別，body／回傳函式identity／儲存順序不變；受保護R1 consumer原始碼不動。新增14個假資料正負測，不等於真實R1資料驗收。
- Normal source/SSR and ReactDOM-emulator regression cover form ownership, repeated activation, precise query and cleanup. Native keyboard/frame navigation and responsive browser layout remain untested; full CI/lint blockers are still reported, not waived.

## 2026-10-28 初次觀察收據 owned GET（隔離候選）
- 首畫面即等待收據，不先短暫顯示可點；初次GET由effect獨立持有controller，僅實際回覆後更新狀態。
- 手動GET/單次POST、60秒終止、錯誤/未知回覆與unmount最新controller仍遵原規則；13 source/SSR及8 ReactDOM負測，不代表原生瀏覽器或R1匯入驗收。

## 2026-10-28 匯入停止按鈕 committed state（隔離候選）
- 原 AbortController 同步建立/清空與 abort handler 不動，僅以同時更新的 state 顯示可停止狀態，避免 render 讀取 mutable ref。
- 正常 React SSR/source 邊界10例及獨立 jsdom ReactDOM commit/event6例通過；後者是測試 DOM，非實體瀏覽器或資料匯入驗收。應用依賴/鎖檔未更動。

## 2026-10-28 FQC parent 查找索引（隔離候選）
- 完整結構/identity檢查後，以單次呼叫索引取代每個項目掃描全部錯誤碼；保留原錯誤順序、首筆比對、收據與存檔結果。
- 三十組 historical/current paired 回歸；120錯誤碼/1000項目的比較工作減少，但單一早命中項目會多建索引，並非每份資料更快。R2/SQL/權限檢查不減，未宣稱解決10–25秒I/O等待。

## 2026-10-28 CI lint 基準輸入鑑別（隔離候選）
- 保留 head typed lint 與固定 db190 baseline 的原失敗退出碼、正常獨立 checkout/install 及全部後段檢查。
- 七個輸入仍逐一核對原始 Git blob；僅已審查的 main-push-guard 未用 import 刪除 exact pair 可分類為非功能差異，其他差異/缺檔仍 NOT_COMPARABLE。不是 lint 豁免，也不是位元組完全相同。
- 新增十五項正負回歸；Windows 原生 CI 與完整 ancestry 仍須在精確遠端提交驗證。

## 2026-10-28 FQC 規則溢出與矩陣狀態（本機候選）
- 長自訂規則完整換行於原欄位；FQC 單符號矩陣格不受共用歷史按鈕 padding 擠壓。
- 產品納入 `✓`／未納入 `—` 與啟用狀態分開；明確 false 才顯示列標題停用 badge，雙語及 legacy default 對齊編輯頁，不改選擇資料或寫入路徑。
- 新增純 DOM／CSS 契約回歸及 CI 入口；非原生 layout／發布驗收。實作與證據界線見 [QUALITY](modules/QUALITY.md)。

## 2026-10-27 FQC bootstrap active body 去重（本機候選）
- 只在實際已採用 FQC records metadata 合格時，將重複 active body 讀取留給原 mandatory workflow GET；其他 quality libraries、canonical fallback、fresh authority 不動。
- 保留明確 full-GET 錯誤／readiness；body fault 時點變化有隔離實證，不宣稱整體延遲或 OOM 已解決。詳見 RUNTIME 與 portable paired regression。

## 2026-10-27 — 設備反查逐模組唯讀候選

- 查看資訊先開 metadata，展開模組才查引用；未查詢/失敗不再冒充零筆。
- FQC 改用既有授權 full workflow GET，保留 active/history 與 exact snapshot readonly 明細，不採入編輯 model。
- 保留嚴格 edit/delete/replacement 查核與所有持久語義；本機隔離證據不等於發布/native驗收。見 modules/RUNTIME.md。

# 2026-10-27 - Local FQC structure first-match lookup (not published)

- Reuse a lazy per-structure previous-row index for FQC errors/items, preserving first duplicate, malformed-row fallback, order and equipment snapshots.
- Add portable historical-source paired adapter regression and one normal CI command. Synthetic handler pairs retain exact DTO/persistence/I/O, current authorization and CAS path.
- CPU lookup work only; no selective hydration, auth cache, live speed/heap claim, schema or real data change. See [Runtime](modules/RUNTIME.md).

## 2026-10-27 scoped automatic-read pause（本機候選）
- 401/403 只暫停同owner／endpoint／read-kind的後續自動輪詢；保留資料與未知操作，不自動登出或重送。
- 單次清楚提示＋獨立GET-only核對，晚到舊回應不能解除新拒絕；各自動consumer加精確guard並同步cachetag。
- 403原因與native整頁仍待確認；非TTL/ACL或密碼修正，詳見RUNTIME。

## 2026-10-27 C 線 IPQC 查詢顯示隔離候選
- 啟用查詢後顯示已核准標準與產品／照片／檢具／頻率；保留 C query-only 與 AB assignment 差異。
- 明確空來源／未核准／錯誤；same-actor／delivery／產品／工段／modal 晚到守衛與 GET-only 手動重讀。
- 不改後端 ACL／資料或原 unknown 操作；詳見 RUNTIME 與 portable focused test。

## 2026-10-27 Save／Submit rapid-intent 隔離修補
- 第一次 await 前保留同 owner 意圖；重複點擊不新增命令或錯誤，不自動排程下一個 Save／Submit。
- 精確待審 receipt/control 綁定後，Submit 不再等待 advisory inspection 才解操作 busy；送出前與後端驗證不變。
- 不一致 ACK 僅一次 fresh GET，再提供獨立唯讀確認出口；未確認禁止寫入，歷史 Restore 的當下入口亦守衛，不更改共享 transport 或原未知重試協定。

## 2026-10-27 製程送審回饋隔離候選
- 理由對話框先顯示，確認後仍 fresh inspection＋同身分／版本／編輯狀態 fence；阻擋重複點擊與已知未知結果。
- 真正 code/details 放入「報錯」，恢復按鈕依 receipt／inspection 等狀態命名；不移除必要恢復或新增自動重送。
- 保留手動畫布同步、固定 Save、backend 檢查與全部歷史；本地針對性證據不代表 live memory／POST timeout 已修復。詳見 RUNTIME 最新候選段。

## 2026-10-27 IPQC 待補檢查的單次解析重用（本機候選）

`process-ipqc.ipqcIssues` 在一次同步檢查內按需解析 master／AB／C 來源各一次，
同次各工段與既有關聯沿用該已解析來源。完整項目、照片、rules、順序、缺少／失效
提醒與 malformed 錯誤不刪減；對外 `ipqcChoices` 每次仍建立 fresh 來源及輸出，
不跨請求保存、沒有 ACL cache。`validateIPQCAssignments`、workflow POST、CAS、
readState／record hydration、手動同步與核准來源選擇未改。

`test-authoring-ipqc-read-reuse.cjs` 用 exact PR34 基線與候選 actual handler 配對，
正常合成登入／Apply／Save／Submit／獨立發回；品質核准來源明標 derived synthetic，
不冒充實際品質核准生命週期。17 pairs／34 GET 保持 DTO/status/header/I/O 與零寫入，
另 10 domain 條件含 C、失效、空值及 malformed；完整 photos/rules、回傳別名與
只讀來源保留另有斷言。候選 actual Apply／Save／Submit／獨立發回另走通，
3 組拒絕 POST（過期 revision、無 Save 權限、pending Apply lock）保持零寫入；
拒絕 DTO 僅個別生成且驗形的 requestId UUID 不作位元相等。24 個關聯的 AB fixture 重解析 25→1，屬 parsed byte／
次數減少，不代表真實 Worker 記憶體峰值、毫秒等比例改善或 v25 OOM 已排除。

# 2026-10-27 - Combined quality replacement preview and C operation policy alignment (not published)

- Carry the reviewed FQC/IQC/scoped-AB preview correction onto current main; align adopted C preview with its explicit view/edit capability. Preserve AB scope and whole-module pending fences.
- At the user's explicit request, separate C edit/save/submit operations without changing entry/view, global access catalog, role defaults or actual accounts. Preserve review/history/withdraw/seed and V3 legacy refusal; delete metadata reflects existing edit-plus-delete mutation checks.
- C Photo PUT uses edit. Direct legacy Save/Submit require every operation they perform because they replace snapshots; list every new allow/deny in [Quality implementation](modules/QUALITY.md).
- C UI gates Save/Submit independently and fails closed for unknown/revoked operation permissions while retaining input and uncertain receipts. Add normal-login isolated backend and actual-JS VM regressions, exact cache-tag expectation and CI invocations.
- No schema or manual canvas Sync change. Local dependency/build environment remains unaccepted; GitHub clean CI and independent review are required. Combined draft PR is authorized; merge/deploy still need the final specific gate.

- Local rework onto merged main `4e1eaca` / tree `f079f1b` preserves PR32 login/recovery and PR34 Save/deadline/validation fixes, tags and tests. No new permission policy or actual account changes; new-base CI and final permission-impact decision remain required before upload/merge/publication.

# 2026-10-27 - Local authoring deadline tolerance (not published)

- Bound only the canonical relative authoring workflow mutations at 45 seconds; other mutations stay at 15 seconds and GETs at 45 seconds. No new permission, retry, receipt or storage policy.
- Keep exact unknown operation bytes and all actor/generation fences. Longer waiting is neither a performance improvement nor proof of commit; failed or malformed acknowledgements remain receipt-first.
- Add fake-clock authoring/other-module/deadline/late-receipt cases to existing CI-covered recovery tests and update only the shared-client cache tag. See [Runtime](modules/RUNTIME.md).

# 2026-10-27 - Local authoring contentIssues validation reuse (not published)

- Reuse pure validation only for the same decoded content object within one contentIssues GET. Keep separate projections and immutable fixed-case issues.
- Preserve authorization/storage reads and failure priority; no I/O reduction, POST change, schema/data mutation or live latency claim.
- Portable actual-handler regression covers exact DTO/status/header/I/O parity and zero writes; see [runtime boundary](modules/RUNTIME.md).

# 2026-10-27 - Local canvas unknown-recovery hardening (not published)

- Bind command ACK/receipt to the existing six-field receipt and exact operation ID;
  Apply additionally binds generation while review generation changes and Begin remain compatible.
- Preserve original unknown/journal and newly blocked input. Only a distinct unsent command gains
  matching explicit Cancel eligibility; Retry preserves remaining local failures. Late receipt
  lookups cannot erase a newer unknown. See [runtime boundaries](modules/RUNTIME.md).
- Synthetic old-failure/new-pass evidence covers manual eight-node Sync, recovery, Cancel-to-Save,
  malformed receipts and delivery fences. No claim about the first live failure cause or native
  acceptance; no timeout/server/ACL/data/automatic-retry change or publication.

# 2026-10-26 - Local authoring BOM map removal fix (not published)

- Preserve the existing product-removal requirement: the authoring-only diff emits a guarded whole `bomSelections` field when supported string-array map keys are removed. Shared generic diff, server protocol/integrity, permissions and schema are unchanged.
- Same-map concurrent changes require reconfirmation. Manual canvas Sync, Save, product-specific history and effective/fixed snapshots retain their boundaries. See [V3 implementation](modules/V3.md); exact local checks are task evidence, not native or hosted acceptance.

# 2026-10-25 - Cloud-only asset read candidate (not published)

- Accept the exact canonical producer URL fragment, not arbitrary fragments or
  substring matches. Share SHA-verified, pre-hydration public/role projection
  between canonical-assets and state-media, preserving legacy/adoption rules.
- Preserve sanitized caller identity references and mixed master snapshot
  equality. Fence image delivery by fresh actor/revision and cancel undelivered
  bodies, including read errors; never cache across requests or actors.
- Read notification IDs from control metadata without immutable snapshot
  bodies, retaining existing ordering. Projected records cannot be written.
- Add isolated handler and exact producer/state-media compiled regressions to
  existing CI. This is source-only work: no data, schema, account, remote source,
  package or deployment change; live latency/memory and owner/staff UI remain
  separate acceptance. Details: [Runtime](modules/RUNTIME.md).

# 2026-10-24 - Local one-shot observation (not published)

- Add a default-off, exact-case c273 read/hash observation using the existing
  owner session, with a consumed independent receipt and no new API credential.
- Bound fetch/body/hash, reject replays and drift, disclose only fixed diagnostic
  fields, and leave the original unknown request/lock/cursor/charges unchanged.
- Schema-only 0007 adds one control table. Synthetic and compiled tests are local
  evidence; no real observation, live schema mutation or business activation.
- The recovery preparation below is historical: version 6 was deployed, the
  first version-19 window failed unknown at c273, and recovery was closed.

# 2026-10-23 - Local restricted verification recovery

- Consume/hash bounded R2 bodies before successful read intent settlement.
- Add exact-incident guarded hold/maintenance/resume transactions, separate
  persistent verify/audit-only authority and same-process secret custody.
- Preserve old charges/history, keep baseline unverified, deny payload/business
  writes, and pause after the first clean verification window for exact review.
- Recheck server time after the final asynchronous owner read and bind the fresh
  timestamp into the durable maintenance expiry guard; delayed-owner regression
  refuses expired dispatch while retaining unknown receipt/lock.
- Register schema-only 0006 and align the fresh schema model with all 19 tables.
  This is local implementation; no live recovery, credential or deployment.

# 2026-10-23 - Native import precision regressions

- Cover both-first-admission nonce races (including different hashes), failed
  intent settlement, pre-dispatch revocation, and readback across expiry.
- Bound native inventory to128 pages of100 names within the existing512 total
  operation ceiling. Incomplete scans refuse; existing quarantine checks remain.
- Exercise native multi-page pollution detection and a small fixed capability
  operation limit without changing live grants, schema, data or credentials.

# 2026-10-23 - Dormant native staging importer

- Add exact-target independent application capability checks and generation
  revocation, durable nonce/request/provider intents, conservative unknown
  outcomes and expiry-safe admitted metadata settlement. No normal session is
  fabricated; copy, restore and activation remain excluded.
- Read back previously receipted chunks before staging new ones. Direct fixed
  folders and bounded pipe input replace browser selection for the dormant CLI;
  request/registration deadlines, cancellation and receipt-only reconciliation
  do not automatically retry an uncertain write or clear its lease.
- Add local synthetic authority, provider, partial-effect, pipe and guarded
  latency-model tests. Migration0005 and native runtime flags are NOT applied
  remotely; security review and real credential approval remain required.

# 2026-10-23 - Scoped offline photo references

- Replace bare digest substitutions with explicit resource/module photo mapping;
  unchanged feedback attachments retain their original checksum/size pins even
  when identical pixels are also used in another module. Module-bound id-only
  records and large encoded JSON retain bounded reference handling.
- Check any preexisting optimized target regardless of inventory order. Unequal
  bytes or business metadata refuse completion instead of losing metadata.
- Add shared-image audit/export, both collision orders, fragmented large-state
  and ambiguous/pin-mismatch regressions. No schema, live data, credential,
  audience, upload or publication change is performed by this correction.

# 2026-10-23 - Operational offline import preparation

- Cancelled full-package direction: derive a new pinned operational view from
  current business references, all standalone media/private mappings and feedback.
  Separate global backups offline; preserve current approval/version dependencies.
- Audit selected payloads/references and create a small new browser handoff using
  original aliases. No source/target deletion, live reset, credential change or
  resume of the cancelled campaign.
- Add bounded 16-chunk/8MiB framed optional-gzip transport, server-computed durable
  reservations and transactional receipts, with no refund or lock reset. Audit/
  copy can process four bounded resources; single-chunk compatibility remains.
- Display receipt-backed phase/bytes/chunks/speed and stable-sample stage ETA,
  start sending after the first missing-page scan, and reconcile stop/error
  receipts. Import login returns only to a fixed allowed admin destination.
  Real hosted import and browser pixel QA remain separate from code/fixture PASS.

# 2026-10-23 - Bounded initial import preparation

- Correct progress display: bounded preflight explicitly retains unknown quota;
  activation-status, final reply and client result use the same fail-closed
  target/budget predicate as actual data visibility. No phase-only enabled claim.

- Preserve verified-capacity mode and add an explicit unknown-capacity attempt
  for the one test Site/owner/manifest. Server-owned persistent admission and
  debit counters include retries and partial/uncertain writes without refund.
- Append two control tables through 0003; preserve old migrations, target owner
  verifier, source records and all integrity/CAS/activation safeguards. A retained
  in-flight/stopped budget keeps company visibility closed even after an active
  marker. No live configuration, paid upgrade, credential change or true upload
  is performed by this source batch. See docs/sites/IMPORT_READINESS.md.

## Sites isolated derivative - inactive root entry

Known inactive GET/HEAD / now has a bilingual, no-store HTML entry with login and
owner-setup links. Database failures and every existing API/business/image gate
retain their refusal. No authentication, schema, secret or platform change.
See [root entry](../docs/sites/ROOT_ENTRY.md) for evidence boundaries.

## Sites isolated derivative - default-off owner setup and pinned Site main

Added the fixed private-test, same-origin, key/expiry/target-pinned first owner
flow with existing scrypt login compatibility and a durable singleton receipt.
The fresh schema appends one table; original migrations/business schema remain.
The main guard retains GitHub/other-target refusal and supports only the exact
registered Site source with reviewed commit/tree, expected remote ancestry and
one-use non-secret execution receipt. Installed hooks, real accounts/secrets,
permissions, source access and publication are not configured by this change.
See [phase twenty-three](../docs/sites/PHASE_TWENTY_THREE_OWNER_SETUP.md).

## Sites isolated derivative - source-only PR CI and history bridge

Joined the private repository's initial README history without rewriting either
root. Replaced CI's unpublished canonical-package execution dependency with
bounded source/history scanning, exact reviewed synthetic classifications and
negative fixtures; retained full types, real-SHA build and applicable synthetic
permissions/import/native isolation tests. No business code, schema, dependency,
true data or platform/security setting changes. See
[CI evidence boundaries](../docs/sites/PHASE_TWENTY_SOURCE_ONLY_CI.md).

## Sites isolated derivative - canonical import and consumed owner storage

Added a bounded recipe-backed normalization view with source/curation pins,
current/history/feedback reference rebuilding, shared-content provenance and full
output audit. Activation now updates consumed record/R2 owner storage through
the resumable immutable-object writer and retains the closed gate until CAS.
Added an explicit fresh-target source projection for the official root-drizzle
packager without rewriting applied migration history or installing dependencies.
See [phase eighteen](../docs/sites/PHASE_EIGHTEEN_NORMALIZED_IMPORT.md) for evidence
boundaries and the remaining parent-controlled platform steps.

## Sites isolated derivative - protected initial import and option type repair

Preserved the sole private test project ID; implemented default-off owner/origin/
target/manifest-pinned import with resumable D1/R2 receipts, incremental semantic
audit, multipart copy, bounded restore and gated activation. Generated a separate
schema-only fresh-target profile without changing legacy migration history.
Explicit numeric option types repair two TS2353 errors. Post-import export keeps
all business objects and excludes only known duplicate internal transfer keys;
unknown layouts refuse. Legacy R2 owner overlay and disabled owner activation
refuse rather than falsely claiming a working login. Latest source-specific
tests/build are separate receipts; no real credential/data/platform action or
acceptance. See [current contract](../docs/sites/PHASE_SEVENTEEN_IMPORT_BUILD.md).

## Sites isolated derivative - source delivery preparation

Added the missing deployment entry with supported portable Sites source workflow,
independent test/formal targets and precise unimplemented import/account steps.
Verified installed helper paths without executing remote operations. Preserve the
main push guard and migration history; a returned main source branch and the
historical empty-singleton INSERT need disposition before hosted publication.
This phase is documentation/source packaging only; existing actual build and
12/12 synthetic compiled-app evidence remain pinned to efaedbd, with no repeated
runtime, true-data conversion or dependency changes. See [deployment](../DEPLOYMENT.md).

## Sites isolated derivative - source-backed local import staging

The importer now reuses verified read-only snapshot chunks without a full staging
payload copy. Four targeted fake-binding cases pass; no runtime, account or real
restore was started. The accepted real R1 conversion remains pinned separately.
See [phase ten](../docs/sites/PHASE_TEN_RUNTIME_SOURCE_PREP.md).

## Sites isolated derivative - selected real R1 local data verified

True curated496 conversion completes with full input/checksum, output readback,
history/account/image/reference audit. JSON batching and a bounded canonical
object path retain safeguards; checked incomplete-prefix reuse avoids overwrites.
Owner-selected inherited E permissions remain unchanged. No SDK, real login,
credentials, Git or platform action. See [phase nine](../docs/sites/PHASE_NINE_TRUE_R1_LOCAL.md).

## Sites isolated derivative - bounded outer ZIP and local integrity audit

Read-only STORE/DEFLATE reader, typed real-header extension and independent output
audit have targeted synthetic evidence. Real archive pin/directory and metadata
pass, but complete real conversion is unexecuted pending the exact new private E
directory security confirmation. Hard-link optimization returned EPERM once and
was removed without retry. No runtime, credentials, Git or platform change. See
[phase eight](../docs/sites/PHASE_EIGHT_LOCAL_R1_CHECKPOINT.md).

## Sites isolated derivative - confirmed R1 member contract

The strict parser connects confirmed database/static/curation metadata to the
existing Snapshot V1 pipeline. Twelve synthetic strict cases and affected
regression suites pass. Unknown/extra/missing/conflicting members refuse; SQL
is never executed. Credential exclusion preserves business identities/roles,
while the local receipt remains authReady:false. No true R1/archive/runtime or
platform acceptance is claimed. See [phase seven](../docs/sites/PHASE_SEVEN_STRICT_R1.md).

## Sites isolated derivative - explicit logical bridge

Explicit logical-member conversion and private image ACL mapping now have
synthetic end-to-end/refusal evidence. Commit presence is enforced before build
preparation, and the unused auth-mode template field is removed; normal account
authentication remains. The true R1 descriptor/outer archive is not accepted.
No real data, verifier, runtime or platform change occurred. See
[phase six](../docs/sites/PHASE_SIX_LOGICAL_BRIDGE.md).

## Sites isolated derivative — snapshot format integration

Large immutable JSON streaming now integrates with mock-verified snapshot export/local restore. Known feedback STORE ZIP and legacy chunked v1 now have complete mock export/transport/local-restore coverage, including shared-history and pack-slot coverage, ZIP record metadata, corruption and interrupted-stage retention. Default DEMO remains closed, hosted account/role boundaries remain, templates have no Site ID, and no live data or credential was moved. See [snapshot formats](../docs/sites/PHASE_FOUR_INTEGRATION.md) and [phase one](../docs/sites/PHASE_ONE.md). Fake-only verification does not qualify runtime publication.

## 2026-10-20 FQC 審核案件連結導覽修正

修正審核報告的異常案件連結只換選取、未離開審核 renderer 造成空白明細。僅此分支走既有例行檢查路由，維持路由權限、原樣品／照片／歷史與所有核准規則。抽碼正反控制與獨立來源核對屬限定證據；修正後 GUI、建置及實際包另行驗證，詳見[品質實作](modules/QUALITY.md)與[交接](../HANDOFF.md)。無資料模型或帳密變更。

## 2026-10-20 FQC 空白環境讀取修正

修正合法空檢具庫阻擋整個FQC頁，以及冷瀏覽器只依本機快取而缺少正式AB產品的問題。保留API失敗／權限／格式錯誤，使用現有正常唯讀入口載入唯一正式AB快照至RAM，維持身分與掛載競態保護；原草稿、審核、角色與CAS規則不變。可攜正反回歸及適用範圍見[品質實作](modules/QUALITY.md)，實際GUI與最終包證據由[交接索引](../HANDOFF.md)定位。沒有資料清理、schema、migration或帳密變更。

## 2026-10-20 Miniflare Undici 精確安全修補候選

以專案 override 將 Miniflare 4.20260515.0 所用 Undici 7.24.8 精確解析為7.30.1，既有 image-size override 保留；SDK／native 本體、儲存格式、角色與審核規則不變。這是專案待驗候選，並非上游相容性承諾。乾淨安裝、13項公開離線 consumer 與4項公開 Miniflare 正向測試有各自限定證據；完整容量、最後ZIP及冷裝仍依當次實測接受。audit 18與lint 2仍FAIL，未放寬檢查或豁免風險。詳見[依賴門](../docs/testing/DEPENDENCY_RELEASE_GATES.md)、[lint 契約](../docs/testing/LINT_CONTRACT_POLICY.md)及[唯一交接入口](../HANDOFF.md)。無業務資料、schema、migration、帳密或權限變更。

## 2026-10-19 建置認證輸出防護

正常 npm build 保留框架原認證與網路防護，子程序輸出改由有容量限制的記憶體捕獲產生固定欄位診斷；原始行、錯誤視窗、認證值及個別值雜湊不進日誌。接入建置後 client 已知認證邊界檢查，缺少／重複結果與捕獲超限皆失敗。新增診斷及入口／掛鉤兩個離線測試，合成正反控制 64 項通過；實際新依賴建置、最終 ZIP 與冷安裝仍需各自證據，不將模擬視為實建通過。詳見[建置認證邊界](../docs/testing/BUILD_AUTH_BOUNDARY.md)。舊編譯包私有保留、禁止分發部署；不把停止服務當撤銷，也未修改員工帳密或正式權限。

## 2026-10-19 借用方法契約與兩項命令列依賴安全修正

三處借用方法改以 Reflect.get 擷取，保留原動態 call／apply、接收端、參數及拒絕行為；TLS 邏輯未改。限定正反控制與獨立源碼核對通過，實際全專案 lint 由五項降為兩項，未關閉規則；Spinner 與 FQC legacy 離頁提醒仍列管，不宣稱原生功能全面通過。

鎖檔僅更新 MCP SDK 1.30.0→1.31.0 與 shadcn 內層 Undici 7.29.1→7.30.1，package.json 及其餘節點保持原樣。官方套件完整性及限定函式對照通過；官方 audit 仍 FAIL19，Miniflare 根部 Undici 風險保留。新版本乾淨安裝、正常建置入口、實際 ZIP 與完整資料驗證尚待取得證據，詳見[發布檢查](../docs/testing/DEPENDENCY_RELEASE_GATES.md)及[HANDOFF](../HANDOFF.md)。本項沒有業務資料、權限、schema 或 migration 變更。

## 2026-10-19 source-map-js 有限範圍安全修補

將 lock 中 source-map-js 由 1.2.1 精確升為 1.2.2，採官方 tarball SRI／SHA1，修補 GHSA-68fv-2mgg-jv7q 的異常 indexed source map offset 資源耗盡風險；只改該節點的 version／resolved／integrity，不更動 SDK/native、其他 lock 節點或 package.json。新增不展開超大映射的離線回歸及[發布檢查](../docs/testing/DEPENDENCY_RELEASE_GATES.md)。已知 indexed 邊界／轉換限制與原失敗測試保留；新安裝、建置、ZIP 及剩餘安全風險分別驗證，未宣稱 audit 或 lint 全通過。無業務資料、角色、schema 或 migration 變更。

## 2026-10-19 FQC 摘要計數與新版 ZIP 冷安裝查驗

修正 FQC 審核摘要前後使用不同計數母體造成的假刪除提示，兩側都排除舊墓碑；不修改業務資料、歷史或審核規則。完整 renderer 7 組、兩檔語法及定向 lint 通過，實作見[品質](modules/QUALITY.md)。

格式工具 oxfmt 固定升至 0.67.0／tinypool 2.1.2，以修補已公告的工具依賴漏洞；lock 僅替換官方解析的 21 個 formatter 節點及根引用，其餘 764 節點與 SDK 不變。這不是完整稽核歸零，實際乾淨安裝、CLI 與依賴讀回需另有收據；未放寬檢查或更換 Cloudflare SDK。

本輪固定使用原 2026-10-14 rev495 私有資料，不混入 QA 或日常資料。舊 42de 首次安裝、f722 完整更新及 17e0 關站證據依程式與依賴差異限定沿用；新版實際 ZIP 的冷安裝須另有收據。IQC UNKNOWN、Master AB HOLD、完整 lint 五項與依賴風險保留；唯一當前狀態與版本依[HANDOFF](../HANDOFF.md)索引，沒有 GitHub 或部署操作。

## 2026-10-18 離線完整快照更新分層驗收與交付待完成

離線更新保留版本／來源相容性、完整實體備份、交易切換及精確恢復守門；正常儲存入口以存活期間互斥保護 SDK／SQLite，未知關閉保持 HOLD。業務格式、SQL schema、原角色／個別權限與首次匯入語意不變。

f722 的完整容量 TEST A→B、同包重複、修改／草稿／pending 拒絕與實體還原、階段匯入失敗恢復及 NEW_ACTIVE 真備份複製恢復已分別取得完整讀回證據；42de 的首次 ZIP 匯入及正常／三 DEMO 登入 GUI 另有窄證據。原 rev495 的 pending／草稿仍應拒絕更新，未清理原業務資料。不能把 TEST 或舊來源結果外推成新版 ZIP 冷安裝通過。

工程來源：17e06098a104…（1,560 檔；`Temp/sol61-i1-u1-execution-root-20261017/current-u1-source-checkpoint-v5.json`），完整容量更新器行為證據另屬 f722。17e0 的啟站程序已將本程序 SIGINT／SIGTERM 清理順序化：先等候既有 Vite／公開資料引擎與 HTTP 關閉及租約釋放，再透過原 EventEmitter 執行原有回呼。原安裝執行環境 Node 24.19.0 的實際正常啟站／關站已通過；七個自有程序全部退出、主程序回傳 0、無強制停止，私有安全檔未變。69 項純時序控制與該檔 lint 0 另有證據。這不證明全部 SDK 私有佇列或舊版原生失敗根因；舊失敗保留。直接證據依唯一索引的 `serialized-signal-normal-root-actual.json`。 配對包只作私有 TEST 保存，不代表正式發布或全站驗收。實際來源／建置清單、程式／資料 ZIP、版本、大小、SHA-256 及另一代理的實際核對結果，以外置 `PAIR-RESULT.json` 與唯一交接索引為準。資料固定為使用者接受的 2026-10-14 rev495，不混入 QA 站或日常3000；新版 ZIP 全新匯入及 Git clone 尚未重跑。

完整 lint 保留原五項診斷與規則，IQC UNKNOWN、Master AB HOLD、實機擱置及 Git clone 未驗等限制保留。操作契約見[快照更新](../docs/local-integration/OFFLINE_SNAPSHOT_UPDATE.md)，當前與歷史證據的版本界線依[HANDOFF](../HANDOFF.md)及其唯一索引。

## 2026-10-17 檢具延遲開窗防護與 FQC 歷史篩選顯示

檢具引用讀取晚到時，核對操作序號、頁面、身分／世代、版本與目前視窗，防止重開已關閉表單、接管其他視窗或重設原編輯基線；重取當前檢具，不改引用等待、照片、CAS 或業務權限。FQC 清單外的歷史回查條件改為可見選項，由正常「全部」解除，避免畫面顯示全部但仍被隱藏條件篩掉。詳見[品質實作](modules/QUALITY.md)。

新增回歸實際 CLI 為 41 案／7 組通過，原續用 9 組與五檔語法通過；定向 lint 保留既有 FQC returnValue 1 診斷。H25 FQC 測試計畫兩端撤回、再送審、不同人核准及真人原生離頁取消已有窄 GUI 證據；新修正原生回歸、新來源建置與正式包依[整合進度](../docs/local-integration/20261014-github-upload.md)逐項接受。沒有 schema、帳號或角色變更，marker 消失原因未證，舊 v1 HOLD 與失敗證據保留。

## 2026-10-17 檢具同步狀態與未修改表單誤判

修正檢具讀取失敗後同步標籤仍顯示已同步，以及含換行的舊名稱在未修改時誤觸關閉確認。僅更新失敗標籤和名稱 dirty 比較基線，保留原始多語名稱、Apply／Save、照片、權限、CAS 與確認規則，詳見[品質實作](modules/QUALITY.md)。受影響九組記憶體回歸及兩檔 lint 通過，fixture 初始化原失敗保留；修後真 GUI、新來源建置與正式包尚待各自驗證，不能沿用18e5建置為新版通過。資料模型無變更。

## 2026-10-17 檢具編輯視窗刪除權限一致性

修正 STAFF 可編輯但無刪除權時，編輯視窗刪除鈕仍啟用的前端缺口；補既有 delete gate，並在入口及等待／確認後重核刪除權。保留引用、來源、雙確認、CAS 與原 API 拒絕規則，詳見[品質實作](modules/QUALITY.md)。新增真產品函式／client 反例與撤權回歸，原18項引用防護保留；修後原生驗收、新來源／建置及交付狀態依[整合進度](../docs/local-integration/20261014-github-upload.md)，不沿用 d98 為修後全面通過。資料模型無變更。

## 2026-10-17 檢具末列避讓與 CommonJS lint 適用性

檢具搜尋結果捲到最底時，末列刪除按鈕會與全站回報浮鈕重疊；只在有浮鈕時為該清單保留76px底部空間，既有視窗82px確認區避讓保留，排序、分頁與刪除／引用防護不變。新原生幾何、操作及裝置接受依[整合進度](../docs/local-integration/20261014-github-upload.md)逐項記錄。H18／H19同身分真離線表單恢復至正常新增／Save／true reload已有窄真GUI證據；內部File identity、全頁與多人未知結果不由此擴稱。

僅對 `**/*.cjs` 調整 `typescript/no-require-imports` 適用性，保留非CJS及所有其他檢查。七檔正反控測證明CJS require不報、非CJS仍報、CJS no-var仍報；完整lint468→5／692files，精確移除463項、0新增、原5診斷不變，仍FAIL exit1。[單一lint政策](../docs/testing/LINT_CONTRACT_POLICY.md)保存契約、舊FAIL及SVG／beforeunload未驗界線。沒有產品JS、API、角色、CAS、審核或資料模型變更；舊build／ZIP不替代新來源驗證。

## 2026-10-17 檢具表單續用與確認區避讓

新增檢具在登入讀取失敗後，可明確重讀並保留未套用文字、群組與照片；重讀核對同身分、權限、版本及同步狀態，保留舊欄位基線與未知結果限制。離頁／返回和延後請求只處理原操作，輸入事件不重畫或干預組字。檢具新增／編輯確認區為全站回報浮鈕預留空間。沒有 API、角色、CAS、審核或資料模型變更。

新增可攜 ESM 回歸入口，實際 CLI 九組與既有18項刪除引用防護通過；完整 lint 仍 FAIL468，與前次完整診斷逐項相同，這次產品／測試檔無診斷。H17 QA 檢具中越文、日期、頻率及照片增改刪各有正常儲存／true reload 證據；新續用／版面不因此改標真 GUI 通過。H17 正常停止仍 late cleanup UNKNOWN，當下自有程序與監聽缺席另證，不混為收尾成功。實作見[品質](modules/QUALITY.md)，來源、建置與交付界線見[整合進度](../docs/local-integration/20261014-github-upload.md)。

## 2026-10-16 欄位原值防護與流程名稱排程

master AB／C／PROCESS、process authoring、equipment、FQC、IQC、IPQC-AB／C 的既有欄位 Apply 帶入並要求原值 guard；過期同欄位拒絕，無關欄位可合併，保留原角色、pending、CAS、operation identity／fingerprint 與成功命令 replay。缺 guard 的新命令會拒絕，屬驗證行為收緊；持久 schema／資料關係未改。共用兩個衝突碼只在顯示出口轉中越文，raw error、unknown、receipt、retry 維持。PROCESS 名稱輸入固定編輯基線，逐次 ACK 才推進；Save 等待完整輸入鏈，Submit 仍只送最後成功儲存快照。

保留欄位 old-value guard、PROCESS repaint 輸入保全與品質 editor 初始路由等最小修正；歷史 renderer 相容 V3 actor／動作／理由，依當頁中越文顯示並保留使用者原文。H13 真畫面補驗正常登入後 BOM 即時投影與共用歷史假空訊息修正。shared-state GET 在原公開期限後，額外接受既有 identity 驗證通過的正常 platform session；原 ADMIN、匿名期限、DEMO、其他身分通道、角色、POST/CAS及審核規則不變。18項 handler／HMAC與既有 auth suite、TypeScript、定向 lint及獨審通過，H14 已限域接受正常 STAFF／RD 登入；指定製程／模具不同人四分支及P0恢復已依各自真收據接受，其他模組／角色／API不由此擴稱。另僅修改製程 review view 入口：等候既有讀取後，以同 client 正常 fresh GET 取得權限／案件，重核 owner、generation、pending 與頁面，失敗維持 HOLD、STAFF false 不升權；23組實際 module／client 記憶體測試及獨審通過，H15同件STAFF deny／RD首次查看可審且無reload workaround、正常196確認與P0核准／true reload已限域通過；其他timing／失敗／換身分情境仍按記憶體與未驗範圍區分。實作見[主資料](modules/MASTER_DATA.md)、[品質](modules/QUALITY.md)及[入口](modules/RUNTIME.md)，各來源驗收與限制集中於[整合進度](../docs/local-integration/20261014-github-upload.md)。未改持久 schema；舊 build／ZIP 不作新來源結果。

## 2026-10-16 隔離還原、有限真 GUI 與兩項顯示修正

原 2cd 來源完成乾淨 npm ci、V5 冷還原及 F 啟動／8 項 HTTP 與兩條私有哨兵檔拒絕讀取；原來源與證據保持不變。65527 真 Chrome 已可進行有限匿名 GUI 觀察；依實際畫面處理入口／播放頁越文與工段 label 混語，以及非全螢幕空播放頁／LIVE 對比。原 FAIL、V1 鄰接選項回歸與後續候選／修後結果分別保留。兩個靜態檔的[實作範圍](modules/RUNTIME.md)與[當前整合證據](../docs/local-integration/20261014-github-upload.md)為準，未改審核、身份、角色、資料模型或 schema；來源持續另建檢查點，不重標原 HTTP。當時正常後台 GUI 登入尚待接手；其後 H6 已經正常 frank 表單登入核對，最新現況見整合進度，完整驗收與最終建置／封裝尚未完成。

## 2026-10-15 上傳證據索引可攜性與員工操作說明

修正兩份驗收 JSON 的512個本機絕對路徑表示，保留所有hash、資料、狀態與原收據，原件在專案外可恢復；[整合進度](../docs/local-integration/20261014-github-upload.md)定義證據路徑基準。補足完整私有快照的安裝順序、ADMIN／正常／DEMO登入區別、後續更新與失敗還原說明。244個純換行差異已由Git真clean證明無有效提交變更，267個內容候選保留原target變更。無產品行為或schema修改；一次直接批准的隔離還原仍遭native參數guard停止，沒有功能或GUI接受。

## 2026-10-15 Canvas 成果整合與精確 lint 契約例外

將已驗證 dd4b 候選的兩個同步 core、CJS facade、內容比對修復、可攜式測試及工程文件備份後整合至開啟 checkout。只對兩個 facade 的四個確切 require specifier 增加 anchored allow，保持 error 與所有其他規則；正反對照 PASS，完整 checkout 仍 FAIL 415（共同來源 411、manifest 外歷史證據四項）。[單一 lint 政策](../docs/testing/LINT_CONTRACT_POLICY.md)保留分類、契約與未驗界線。另明確更正私有還原會新增開發用 ADMIN，不能誤作普通員工。無產品行為、schema、資料或 Git 發布變更；隔離環境尚待直接批准，尚未最終建置／封裝。

## 2026-10-15 第二支同步 Canvas 工具收尾

新增 final-manifest ESM core 並保留同步 CJS facade／空 exports／逐次 helper、spawnSync 及錯誤退出契約。Node 22／24 各補 30 項定向案例，另驗原生 cache／同步錯誤與實際目錄新增後重載；固定 golden／規則及既有有效案例不變。真 exit 1，全 lint 418→415，其他診斷 multiset 不變；兩支同步工具累減 6。方法與限制見[測試說明](../docs/testing/CANVAS_EVIDENCE_TOOLS.md)。資料模型與業務資料無變更；停止額外 lint／重包，把後續重點交回功能驗收。

## 2026-10-15 Canvas task diff：首檔同步 ESM core

保留 canvas-task-diff.cjs 同步入口、空 exports 與逐次 helper 解析，實作移入無頂層業務 IO 的 ESM core；不改寫另外兩個工具或 lint 規則。Node 22.13／24.19 的原生輸出、cache／重載、同步錯誤與回復契約對照通過；兩版各 67 項離線 fixture 通過，Git 使用 stub。全 lint 實查由 421 降至 418，首檔由 5 降至 2；其餘診斷 multiset 不變。載入圖差異與範圍見[測試說明](../docs/testing/CANVAS_EVIDENCE_TOOLS.md)。

封存 4cc417 已另在新副本普通權限離線 build，exit 0／dist 510 檔。該實際 build 屬於 4cc417，不能改標為本次工具／工程文件候選的實際 build。舊來源 ZIP、V5、restore approval 與原工作目錄均未修改；沒有還原、服務、Git 寫入或部署。

## 2026-10-15 Canvas 證據工具：可攜式離線回歸入口

新增單一 Node ESM 入口及相對 synthetic fixture，沿用已驗證的 21 項回歸、8 項固定輸出契約、30 項 IO 與 8 項 native CLI 案例。所有 native 子程序都先載入 Git／網路 stub，並以 child audit 核對指定故障確實觸發，避免環境錯誤造成負向案例誤報成功。支援從其他 cwd 執行及指定持久證據目錄；只有 Node 內建模組，不新增套件或更動 package.json。用法、退出碼及範圍見[測試說明](../docs/testing/CANVAS_EVIDENCE_TOOLS.md)。

本階段只在 b0b4cef 之後的新工作副本整合測試與工程文件，三工具產品碼未變。舊候選、建置、V5 及 restore approval 保持不動；不是產品功能、真 Git、GUI 或還原的新增 PASS。

## 2026-10-15 Canvas 證據工具 V2：Git 失敗判斷與跨檔回復

在新的隔離候選修正三個工具：內容比對依 workspace id 取得 baseline，找不到即停止；兩個 diff 工具拒絕 Git 執行失敗與 status 1 但 stdout 空白，保留合法的 CRLF 警告。兩份報告先完整暫存，以獨佔 lock、備份及 rename 發布；可捕捉的寫入或發布例外會回復舊檔。回復失敗保留 lock／backup 並明確報錯，發布後清理失敗則提示警告。輸出檔以 lstat 檢查，只有 ENOENT 視為不存在；拒絕一般／失效符號連結、目錄及多重 hard link。正常 CLI／JSON 輸出契約保持一致。

驗證：實際 Git 的新 Temp fixture 觀察同檔 exit 0、差異 exit 1、非 repository exit 129、缺少輸入 exit 1 且 stdout 空白。21/21 隔離回歸（重測受影響的 16 項，沿用 SHA 未變的內容工具 5 項）、8/8 輸出位元組／console／require 契約、30/30 IO 故障案例、8/8 Windows synthetic CLI 與三檔語法檢查通過。三檔 lint 仍為 exit 1／12 項既有 CJS 診斷，沒有新增，設定未變；先前全站 FAIL 421 僅沿用紀錄，未宣稱 lint clean。

新候選與來源指紋由 Temp/current-github-upload-tools-candidate-20261015.json 指向；舊 01b904 來源、build、V5 與 restore approval 均保持原始位元組。沒有修改 schema、業務資料、歷史、圖片或產品入口。此次僅完成本機工具候選，未 commit／push／PR／merge／部署或啟動應用程式。回復保證限可捕捉的例外；不保證斷電交易原子性、inode／Windows ACL／ownership metadata 完全相同，也不支援繞過 lock 的其他寫入者。

## 2026-10-15 最低Node相容與三區按鈕驗收

最低 Node22.13 sqlite backup 相容修復及先前引用／設備／Editor／IPQC-C ownership 修正保留。本輪再修正 IQC item／part、FQC item 舊表單跨使用者送出，以及 FQC 多檔部分成功照片未顯示卻被保存；修正範圍限瀏覽器擁有者核對、錯誤顯示與輸入保全，不放寬 server 規則。

14入口有限補驗含品質25、Master/users26、Tooling/AB23個具名 VM 案例；Editor新節點3、IPQC-C2、BOM File/field2、範本照片5、Routine transfer2、Tooling nested form2另有簽章隔離持久化或明列的 callback 證據。範本5含 data-only reorder，並非5案全為 UI caller；Routine2只有 working Apply／stale-preview，不含正式 Save／Submit／Approve。BOM另8事件案例，現版Master入口生命週期為7 checks／13 requests。這些是各自限定場景，不能加總成不同按鈕或整頁 GUI 已通過。詳見[驗收／未驗界限](../docs/local-integration/20261015-button-coverage.json)。資料模型、正式 records、核准／回滾規則未變更；Git／正式發布仍暫停。

## 2026-10-15 收回Spinner API變更與未驗工具遷移

2026-10-15 UTC續修：Spinner本任務新增output包裝、focus／keyboard currentTarget及tabIndex移轉、強制SVG hidden／focusable均撤回，恢復修改前exact SVG bytes；7項element／prop／ref／callback／SSR核對及現行TypeScript PASS，非native DOM接受。112工具遷移中7支既有normalpositive沿用，test-local-backup在清外部backup env、固定owned TMP／SQL／tar／delete防護後，原／新版真正API／SQLite／tar／encryption／backup／restore／failed rollback normal流程各exit0且stdout相同；總共保留8支。其餘104非必要未驗遷移逐SHA備份後恢復原CJS，僅刪本任務生成且無其他Source consumer的core，全部可還原。67cold原收據保留，其中65不是normalacceptance，未強迫跑歷史GUI／缺資料工具。

收斂早期快照421診斷／678 lint files／1533source（416literal require＋1 SVG prefer-tag-over-role＋3dynamic receiver＋1beforeunload deprecated），設定SHA b27badef835862a105b58ad08a924b366fba7ae7fb0bdef7cfee0398b3829db6未改。從20回升是收回未驗遷移與API變更後的誠實警告，不以消除lint擴大重構。三個receiver另補Node22.13／24純memory等價評估；apply/call-bound adapter雖保留普通this／args／return／throw，會提早捕捉method.apply/call，具體custom property變更反例證明非strict等價。保持原每次lookup契約，仍未解屬技術問題，不是需user批准的選擇；scoped candidate type-aware lint缺tsgolint未跑。

沒有Main／schema／正式migration／Git或部署變更；完整V5不變payload/runtime的cold及HTTP證據沿用，新的來源／建置／binding由獨立檔案核對。詳細版本與未驗界線只維護[整合紀錄](../docs/local-integration/20261014-github-upload.md)。

## 2026-10-14 GitHub本機候選持續修復

補正式begin的authoring／tooling隔離生命週期29項，與原八頁124項共153項scoped HTTP；保留來源綁定，無Main假案件。修shared-state非object body回400且無資料異動；FQC／equipment VM/memory、canvas journal及BOM fixture按現行流程補正，逐項失敗與復驗保留。JSON轉字串、排序與unused整理保留runtime契約；React SSR不冒稱GUI。

官方image-size 2.0.2→2.0.4，鎖檔只有該依賴版本變動、原依賴及來源可逐SHA還原，daily／candidate正常圖片四格式四入口各16PASS；漏洞重現／Maincache／罕見格式未驗。20:52最新runtime另23項真HTTP PASS；現行typecheck／四SSR、clean-init／微型Miniflare還原PASS且保留原身份／policy／history。全庫lint23:21 20／782仍FAIL，原規則未降；三組builtin-only sidecar保留公開sync函式反射／getter／cache，Node22.13及24定向PASS。完整新V5真冷還原、24正常signedHTTP與27業務鍵／14原身份／100history事後精確保留PASS。參考圖120unique全覆蓋，5human／2vendor flags保留，不作公開READY；技能可重用修訂僅可審閱草稿、原writer不可用。112個actual-diagnostic工具完成分範圍原／新版對照，另12組定向修正及現行UI-reader fixture修復；未驗GUI仍列未驗。同步guard反射契約FAIL保留原件，6個零診斷fixture遷移已撤回。PR13仍草稿，使用者Git暫停有效；新修正無schema/Main資料變動。詳細來源、證據與未完成項僅維護[整合紀錄](../docs/local-integration/20261014-github-upload.md)。

## 2026-10-14 正常重開後的未同步輸入恢復入口

修自動恢復登入後帳號選單漏掉未同步輸入下載入口，儲存失敗及語言切換亦即時更新，下載時重核owner，中文／越文各自顯示並保留44px單行按鈕。新純合成3035真失ACK後，保全登出、同tab reload、跨帳號隔離、原帳號兩次UI下載完全相同284 bytes通過；最後rev6／POST[200,409]與唯一commit不變。新5項定向及受影響桌面／手機viewport PASS，舊suite不重跑。無schema、Main3000資料／登入、C2C／Git／部署變更。[精確路徑、原FAIL及未驗界線](../docs/local-integration/20261010-permissions-admin.md)。

## 2026-10-14 未知儲存結果改回原值保全

修shared-state在ACK遺失／衝突後改回舊baseline時清掉dirty，導致發送誤報成功的問題。paused／blocked批次保留desired與recovery，沿用CAS及明確確認；不自動重送。新3項直接記憶體情境及必要identity4項PASS，舊功能及rev5 UI不重跑。前版ZIP／build與FAIL保留，新候選另封存對齊；無schema、現有資料／登入／服務、Git／C2C／部署操作。[唯一進度與驗收層級](../docs/local-integration/20261010-permissions-admin.md)。

## 2026-10-14 原merge：BOM清單與唯讀投影／派送可靠性

BOM版本清單改metadata讀取，compact6.3MB→370KB（-94.12%傳輸量），完整動作前才讀案件／權限，未變輪詢不重繪。修流程說明混譯及手機44px頂列；唯讀核准PROCESS鏡像不再排寫入，有master/V3資料時不做legacy啟動補種。修V3派送漏計進出站端點，以及未等伺服器儲存就提示成功。新API/controller10、純讀投影5、dispatch7定向PASS；完整副本495不變，新合成UI核准／派送／正常重開player與實體rev5讀回PASS。不是全站／實體手機／跨機或LCP/INP驗收；既有lint失敗與未驗項保留。最終封存與建置以[同一進度及收據](../docs/local-integration/20261010-permissions-admin.md)為準，59b/e9b只證明各自舊來源。無新schema或日常3000資料／登入、Git、C2C、部署操作。

## 2026-10-13 FQC 文件色彩／草稿照片／不可復原捨棄

3040 文件類型配色統一，草稿照片可移除並保存重開驗證，缺照片仍擋送審；移除已捨棄顯示及復原入口，後端亦拒絕。新增 10 筆未安排 DEMO 保留，專用照片驗收草稿 COR-0048 未送審；原文件 flow／案件／工作保全。六組定向檢查 PASS，桌面中越文及鍵盤焦點已核；390px 全域選單遮擋、3050 缺檔造成全庫型別失敗及既有 lint 問題如實保留。無 schema、3000、埠或部署變更。[同一验收與證據](../docs/routine-fqc/20261013-colors-photos-discard.md)。

## 2026-10-13 最後放棄事後驗證

隔離3035由使用者按原生確定放棄合成角色說明，代理核對dialog關閉、重開原值及持久修訂33/wf26未變，分項PASS；沒有程式、權限、憑證或資料模型變更。代理自動native工具仍受句柄／網址辨識限制，不冒稱全自動驗收。續接排程已停用、原生控制歸還；[結果與分工](../docs/local-integration/20261010-permissions-admin.md)。

## 2026-10-13 隔離權限補驗與總覽混語

直接合成登入授權已收到；ADMIN既有分項、primary越文搜尋與STAFF本人／管理限制補驗通過，越文BOM下階像素已補。總覽補「尚未發送產品」完整越文、即時標籤及不限定早晨的標題，cache dashboard8；不改業務資料、權限或API。原生未儲存確認保留輸入通過，最後放棄受工具提示競爭影響尚未通過。[同一進度與版本界線](../docs/local-integration/20261010-permissions-admin.md)。

## 2026-10-13 BOM 真實報表閉環與權限介面修正

追加角色dialog搜尋排除：新production-handler案例先FAIL後PASS，姓名／角色／權限真正變更仍有取消／Escape保護；user舊已載入頁提示另列未核，不混稱回歸或browser PASS。登入頁中越文標題／說明、英文章節標籤與中文「工段」誤字修正，新隔離頁ZH／VI桌面限定驗證；完整角色與本人／他人browser互動待具體合成登入直接批准。Main保全獨立9/9 PASS，不重做、不上傳；[同一進度](../docs/local-integration/20261010-permissions-admin.md)。

新版1338來源私有ZIP／CRC／解壓逐SHA及Dot7/7通過；另一新Temp乾淨来源＋既有依賴build exit0、509outputs／18.58MB、Dot11/11通過。不是npm ci、新機或真資料啟動驗收；未複製business DB/session、未網路／開服務／登入／Git／發布。包保持生成時文件版本，後續階段紀錄另補、不回填。新舊翻譯lint同29项既有FAIL及剩餘browser／同步／手機界線見同一進度表。

停機marker PID被重用為瀏覽器的誤擋已补程序建立時間、entry與data-root/runtime證據；真正服務／metadata失敗／新PID／未知worker仍拒絕。20項合成與真正OS stop gate通過，Main marker／程序未動。早期私有複製拒絕收據保留；使用者在本任務直接授權後，日常3000完整物理資料唯讀保全及新Temp還原通過，2,380檔／8.17GB及rev495所有資料表精確保留。原資料、登入與分頁不改寫，不上傳或發布；結果及未測界線見[同一驗收紀錄](../docs/local-integration/20261010-permissions-admin.md)。

補SQLite Windows長路徑開啟，實際268字元stage原ERR14與338字元回歸採證；撤銷／feature還原閘門保留。3035舊rev27真fixture53檔／1.625GB／25歷史精確還原通過，另新六合成帳號工作副本CLI移轉與冪等27→28→28、8業務鍵／ID／hash／25歷史／35immutable blobs保留。真Main／14帳號未移轉，舊353f程式包保留，長path修正後的新source清單／包另外生成。

3035真實大／少報表副本正常匯入、保存重開及完整發回／再送／核准／撤回通過，354主件6128列、原位置與正式投影保留；誤建合成AB空草稿先備份後精準CAS復原。修正零差異匯入假未儲存、權限搜尋假dirty、窄版回報浮鈕遮確認及越文按鈕高度；protected啟動不再跑legacy seed。舊頁工具逾時與專用UI runtime初始化失敗均未取得提示像素，UI补驗擱置；C2C已依指示取消。本輪改補actual隔離API的合成primary／ADMIN／普通身分投影，33→33無資料變動；網站備份补排除`.dev.vars*`並保留程式／D1／R2／圖片，定向archive測試PASS。dirty source另完成私有程式ZIP／解壓完整性；日常3000與登入未改寫，無schema／Git發布。[驗證与限制](../docs/local-integration/20261010-permissions-admin.md)。

## 2026-10-12 FQC樣品與複測顯示

依14項回饋改為單列單樣品、同項不重複、固定原樣品；移除兩種再測按鈕，草稿照片可移除，展開狀態保留。新增RTS／COR識別，既有編號與正式歷史不回寫。[驗證及限制](../docs/routine-fqc/20261012-sample-feedback.md)。

## 2026-10-12 BOM 增量保存、有效授權與輪詢

BOM 用語意摘要保存、保留缺列／引用、配對state revision快徑及正確未儲存／413標記；相對層級僅顯示。ADMIN模板更新只撤銷有效權限真正變更的帳號session，主要管理員及metadata變更不登出。製程待審數不採過期legacy數。3035實際BOM完整送審／發回／再送審／核准／撤回及持久保全通過，3032真client只讀輪詢中位數約450–472ms降至54–57ms；不代表初讀或整頁效能驗收。真實3000输入保全尚待新匯出證據，未動其資料／登入；無schema migration／commit／push／merge／部署。[最新結果与未測界線](../docs/local-integration/20261010-permissions-admin.md)。

## 2026-10-10 權限／BOM／製程候選與保全

新增專用帳號權限API與共用151格、Frank/peer/self/DEMO保護、原密碼相容＋明確移轉/復原工具、response epoch fence與前世代输入保全。BOM穩定composition查詢、完整後代索引與品名/用量強調；製程固定案件審核整合。14帳號獨立舊backend逐格、CAS/冪等/rollback/recovery、workerd、feedback checkbox與routine gate定向PASS；真实帳號未移轉。3032固定8852c696…交Dot UI，lint有小項待checkpoint；實體手機/原生IME/CLI實體端到端等限制見[收據](../docs/local-integration/20261010-permissions-admin.md)。沒有commit/push/merge/部署。

## 2026-10-10 BOM 離頁最小修復

依實際欄位差異判定離頁，阻止未套用匯入保存舊內容；保存未知結果保護保留。函式／API 定向 PASS，瀏覽器部分與未完驗證見[檢查點](../docs/local-integration/20261010-bom-navigation.md)。未修改日常業務資料。

## 2026-10-10 統一主資料審核（最新）

統一主資料 pending／history 清單與 BOM 審核操作；修正資料頁誤開報表、路由與選案，保留撤回歷史、角色及競態防護。12 組隔離動作與雙語桌機／390px 驗證通過，真實案件未操作。 [完整驗證](../docs/local-integration/20261010-unified-master-review.md)。

## 2026-10-10 中越文與版本確認平台

本機 UI 整理、回報競態修复、BOM 輪詢與主資料案件入口、製程固定案件頁、差異／歷史延遲載入；雙帳號合成驗證通過，未發布。範圍、測量與未完成驗證見[報告](../docs/local-integration/20261010-ui-language-review.md)。

## 2026-10-10 BOM Digiwin 與 V3 草稿

新增十欄原檔解析、原始層級與occurrence路徑、欄位／結構比對、四頁籤樹圖及精簡匯出，沿既有核心接入BOM草稿與審核。A/B分母與C欄位限制、歷史檢視、canonical/一般寫入保護同步調整。日常原25鍵及回報表不變，新11/227真實案件於revision455待人工審核，未生效。原檔零差異、備份／獨立復原與定向測試PASS；兩项舊回歸FAIL與未測項見[交付](../docs/local-integration/20261010-bom-rebuild.md)。無SQL migration或Git／遠端發布。

## 2026-10-09 日常3000增量整合與Local復原保障

明確Local migration/功能設定、較新登出撤銷聯集還原、staging驗證先於切換、回報歷史防倒退；真實3020與日常資料按穩定ID整合，歷史分歧另留版本。修正390手機作業項目網格水平溢出。日常450→451、來源3020不改、無Git或遠端發布。正常啟動後25鍵／196媒體／原歷史與API讀回通過。收尾拒絕還原舊設定關閉撤銷檢查，補回adoption附加檔案還原，隔離真實簽章函式重播與回報歷史保護PASS。續修auth欄位SQL投影及原始型別拒絕、點擊並行授權與資產、defer注入、隔離route啟動編譯；原129MB/90s完整paint最終273/57/58ms，全部36連續LCP樣本中位-0.55%，48樣本含分組+1.21%。隔離API/保存/登入重啟/回報ZIP等通過；原效能FAIL、輪次波動、正式INP與實機未測保留，見[報告](../docs/local-integration/20261009-3020-to-3000.md)。

## 2026-10-09 作業七項標註、登入撤銷與安全交接

共用／產品專用作業三欄、產品選擇標題、緊湊清單與卡片摘要完成；歷史關聯／舊說明保留並改可讀收合。原3020 348不變，合成Save45精確驗證。登入撤銷opt-in與完整checkpoint讀取修正已實作，API與private COPY定向驗證通過；真正restart-replay協調FAIL、同負載完整開啟／手機未完成，保留證據。最新服務8500、primary348／synthetic45；沒有日常3000寫入、其他port／Git發布，依接手協調停止新增修改。[標註](../docs/ipqc-reference/20261009-work-items.md)、[登入](../docs/ipqc-reference/20261009-session-revocation.md)、[交接界線](../docs/web-feedback/20261009-integration.md)。

## 2026-10-09 網頁回報彈窗避讓與獨立驗收

小幫手於原native dialog內依tablist／footer幾何避讓，收合清理ResizeObserver，保留原取消與確認。新增分段效能診斷；試驗的先顯示私有草稿快取已撤回。續驗入口可立即輸入新文字，待新鮮登入驗證與JS/CSS就緒後才讀取／合併私人草稿，保留中文組字、图片、原起始頁及pending收據；9項隔離測試通過，同負載UI重驗待協調。獨立API／定位／ZIP／適用IQC與IPQC回歸通過；負載開啟仍超300ms，正式INP等未驗證，原畫布及業務資料不變。[獨立驗收](../docs/web-feedback/20261009-independent-acceptance.md)。

## 2026-10-09 網頁問題回報小幫手 V1

3020 opt-in 小幫手、帳號隔離的附件草稿、原位置攔截、公開案件／私人管理／immutable 交接 ZIP 已實作；独立資料列 CAS 與原圖權限，不混入製程共享草稿。大型狀態權限讀取改 revision 核驗快取，保留登入與變更即時失效；原 dialog top-layer、語言更新與失效定位已補驗。正式資料庫、3000／其他隔離服务与 Git 發布未操作。完整逐項結果及容量／效能／實體手機限制見 [交付](../docs/web-feedback/20261009-implementation.md)。

## 2026-10-08 製程畫布首屏載入

主資料 render 與待補／歷史讀取分離；bootstrap 在画布模組註冊後等待主資料再揭開。保留權限及並行編輯，加入延遲／失敗／跨帳號回歸。[證據](../docs/ipqc-reference/20261008-editor-startup.md)。

## 2026-10-08 FQC分類定位、計畫入口與原樣品多次測試

核准計畫明示報告建立狀態與接續入口；文件／案件／工作分框，分類按鈕附數量並只捲左清單，進度切換保留頁面位置。改善內容與複測文件同次CAS寫入。樣品可跨列重測，新增空白結果；同份報告任一失敗不被合格列抵銷，正式快照及固定原樣品保留。隔離3040增量加入10個未安排DEMO，保留原資料與使用者後續操作；無schema／migration／發布。[測試與界線](../docs/routine-fqc/20261008-plans-groups.md)。

## 2026-10-08 畫布本機編輯與手動整批同步

已接上獨立canvas journal、自動整理、復原／重做、固定批次guarded同步及Save前同步確認。3020原資料revision327保留，合成驗收使用同服務localhost。未操作3000/3030、未commit/push/merge/deploy。驗收及未完成項目以[本機畫布報告](../docs/ipqc-reference/20261008-canvas-local.md)為準；不沿用舊報告的全數PASS。ChatGPT connector仍MCP -32603，複審未完成，未改共享C2C指標。

## 2026-10-08 FQC複測狀態、收回草稿與清單標記

異常案件顯示已有複測與編號，未送審可確認收回並留歷史；已有後續申請、未記改善、待審及正式文件的下一步就近明示。統計與不合格快捷改同色標記及再次取消，其他資料保留；移除異常清單錯用的文件審核數量。前端沿用現有API／權限／CAS，未新增持久欄位。[隔離命令、UI與剩餘限制](../docs/routine-fqc/20261008-actions.md)。

## 2026-10-08 製程拖曳、預覽拉線與背景同步

整理改為僅重算連線，座標由使用者手動定位；移除自動避讓搬動。手勢與位置寫入延後render，poll去重及讀取不鎖編輯，純metadata不重畫。端點雙向預覽、合法綠線及點線確認刪除；保留CAS、BOM、權限及手動儲存。原3020 revision303／13鍵不變，無schema或其他服務修改。[驗證、限制與回復](../docs/ipqc-reference/20261008-editor-gestures.md)。

## 2026-10-08 FQC 清單進度與複測操作修復

桌機選取保持捲軸；文件明示階段、下一步、RPT/DSP/WVR與目前選取。草稿未送審快捷及置頂、計畫接續同系譜草稿、原樣品名稱／唯讀歷史／建立本次列、Routine專用緊湊版本卡與三色區塊。前端沿用既有資料与寫入規則，未修改使用者既有文件、未新增欄位或部署。[驗收及限制](../docs/routine-fqc/20261008-navigation.md)。

## 2026-10-08 畫布走線、回應與機器照片修復

V3直接渲染新工作區，減少舊畫布計算；動態尺寸避讓、直線優先路由、快取、機器來源照片、套用待補非同步與畫布鎖定狀態更新。3020大快照隔離服務新增序列處理與磁碟恢復快照。原資料292保全；[驗證及限制](../docs/ipqc-reference/20261008-editor-feedback.md)。

## 2026-10-08 製程編輯台畫布與 BOM 選取

3020 以原 revision262 延續：單工段橫向切換、可讀摘要卡片、2／6／7 頁、共用與產品補充作業、機器來源、正交整理與復原、全工段 BOM 唯一占用及 CAS 保護。原3020資料逐鍵不變；新操作均在同3020獨立 localhost 合成副本或記憶體 handler 測試。沒有本輪 commit／部署。狀態 EXECUTED，獨立複審與未測界線見 [驗收報告](../docs/ipqc-reference/20261008-process-editor.md)。

## 2026-10-08 群組路線與畫布保留

群組最大路線、產品例外直顯與換類別保留路徑；畫布隱藏工段不刪內容，輪詢競態及捲動保留。僅本機程式提交，未發布。見 [範圍與驗證](../docs/ipqc-reference/20261008-local-commit.md)。

# PROCESS OS — 重要變更入口

2026-10-08 IPQC 接續：兩筆 C/PVC 產品移至 INOX 且保留路徑；移除產品查看路線，畫布依核准最大路線顯示、隱藏工段完整保留。3020 正常整份 C 自審核准與 37 項定向測試 PASS；複審因唯讀連線 -32603 暫阻。[報告](../docs/ipqc-reference/20261008-group-route-canvas.md)。

2026-10-07 群組最大路線：以全部產品工段聯集取代眾數建議，保留產品先後關係並提示順序衝突；AB/C 例外路徑直接顯示，新增／修改產品可套用預設，取消不寫入。保留手動預設、原路線及原子／並行保護。[本輪報告](../docs/ipqc-reference/20261007-group-routes-max.md)。

2026-10-07 例行 FQC 第二輪操作改善：可復原捨棄草稿／無相依正式計畫、同一計畫更正版接續原報告、分開計畫與報告分類、版本確認平台新增例行檢查四入口、無理由送審／撤回／核准與固定案件自審勾選、必要照片與樣品修改導引。保留所有原3040使用者紀錄，不回填日常資料；[逐項验收與證據](../docs/routine-fqc/20261007-operations.md)。

## 2026-10-07 群組路線與工段连動

新增AB/C群組預設路線及產品例外，核准後投影畫布／IPQC；修正跨線同名群組、流程預設頁籤、全scope輪詢及重繪捲動。3020真實UI及原子／並行保護定向PASS；日常資料未改。本輪保留既有Routine FQC與模具工作。[驗收／未測界線](../docs/ipqc-reference/20261007-group-routes.md)。

2026-10-07 Routine FQC操作回饋：完整FQC後台分類與時間項目分開、三級連動與历史回查、同欄結果／鎖定原因／下一步、批次勾選與多人同步清理；後台每半年half_yearly可正常排程。3040四項未安排手動演練及定向PASS／NOT_RUN見 [回饋報告](../docs/routine-fqc/20261007-feedback.md)。原日常資料保留、起始日未設。

2026-10-07 模具 V12 最終銜接與 3030 退役：新增精確目標摘要／CAS 與完整歷史後繼保護，正常 Local ADMIN API dry-run／備份後接續原 3000 revision 449→450；366 筆、239 原圖、38 IQC 引用、12 版本與6案件延續，只改模具 pointer。3030 已停止且原 runtime 封存，舊腳本拒絕退役環境，未來另建新隔離基準。22 定向測試及型別檢查通過；收據、備份、驗證與界線見 [退役報告](../docs/tooling/20261007-retirement.md)。未 commit/push/Git merge/部署。

2026-10-07 例行 FQC 第二輪複審：無法測試保留逐份應複測義務而不偽造實測樣品；正式報告／複測／補測計畫／免做／處置更正保留案件連結與歷史，已結案報告更正需重新確認。真實3040補測、手機與匯出及核心回歸見 [驗收報告](../docs/routine-fqc/20261007-acceptance.md#第二輪獨立複審修正)。

2026-10-07 例行 FQC V2：四入口、按項目期別排程、涵蓋產品／逐項實測樣品分離、真實照片必要驗證、每文件共享草稿、計畫／報告／免做／處置審核、改善複測後明確結案、歷史與正式匯出。3040實體隔離驗收與日常資料保全、備份及增量啟用結果見 [驗收報告](../docs/routine-fqc/20261007-acceptance.md)；[正式規格](../docs/specs/current/ROUTINE_FQC.md)為V2唯一需求來源。保留並行模具／IPQC／整份文稿工作，日常起始日未設定。

2026-10-07 模具完整流程：修復普通身分讀取／媒體／歷史權限、新移轉唯讀來源、更正原紀錄帶入、歷史人員／時間／版本與不明目的保留已知位置；IQC 正式來源穩定 ID、停用／移除留存及來源詳情返回。保持 VersionDraftUI 與手動 Save 後 Submit 最後快照。3031 正常登入隔離驗證 16 組、定向 handler 21 組通過；3030 實際 V4 模組撤回、V6 平台撤回、整份 V8 明確 ADMIN 自審核准。備份／CAS 後只銜接模具控制與 239 原圖到原 3000 revision 447→448，366 筆與完整歷史延續，其他模組 pointer 未變。尚待補及未測界線見 [完整驗收](../docs/tooling/20261007-flow-acceptance.md)。未 commit/push/merge/部署。

2026-10-07 整份文稿：AB 單一原子案件／全群組鎖定與投影；一般員工模組存取與 ADMIN 跨帳號處理一致；FQC／IQC／檢具／主資料／製程使用頁內理由及明確自審。修正舊案件覆蓋有效版本、錯誤權限提示與模具 Submit 隱性儲存。模具後續以最後成功手動 Save 送審，覆蓋下方較早的送審自動 Save 描述。3000 Windows 文件監看 EBUSY 改排除 docs。使用者指定 demo-admin，經備份後正常核准日常 AB 全24群組與 C V8，依授權清除111…測試資料，原製程分配及其他品質資料保留；實際版本、隔離與日常證據、回復與未測界線見 [報告](../docs/ipqc-reference/20261007-whole-module-progress.md)。

2026-10-07 模具 16 項頁面批註：查看／修改／刪除分開、單語控制、基本頁照片與位置、五種檢查頻率、IQC 所選縮圖；送審先儲存全模組已套用共同修改。移轉先選新增／更正，待審與核准歷史保持鎖定。品質六模組確認總覽及歷史收折沿用原權限。測試、3030 環境及剩餘項目見 [介面驗收](../docs/tooling/20261007-ui-acceptance.md)。未提交、未合回 3000。

2026-10-07 接續驗收：IPQC 藍色占用卡片實際畫面、FQC／IQC／檢具實際 handler 送審與自審補測 PASS；僅新增隔離測試與證據，未改 production 程式或日常資料。見 [驗收紀錄](../docs/ipqc-reference/20261007-continuation.md)。

2026-10-06 review5：IPQC 狀態色卡／單語介面、C/INOX 跨線空工段修復、AB 全群組 Save/Submit、共同待補及授權自審政策；本機隔離證據見 [review5](../docs/ipqc-reference/20261006-review5.md)。

本檔只記重要變更，不替代現行規格、進度或驗收報告。

## 2026-10-07 — 模具設備與 3030 未核准草稿（未提交）

- 新增模具設備 API／資料模型、同頁 Danh mục、六頁器具編輯、原圖與已核准 IQC 引用、新移轉紀錄；復用 VersionDraftUI／品質樣式、共享草稿與版本確認平台。
- 依唯一 20261006 Excel dry-run／備份後匯入 366 筆至 3030，未送審核准；239 原圖完整核對，5 張照片與 19 筆 IQC 對應仍待識別。原 3000 資料未改。
- 修復新 prepared model 未登記資料鍵而重讀遺失；整庫還原納入模具待審鎖。保留並行工作，模具自審／無變更限制在自身 adapter 維持。詳見 [驗收與剩餘項目](../docs/tooling/20261006-acceptance.md)。

## 2026-10-06 — IPQC 瀏覽器操作與收折修復（第 4 輪，未提交）

- 以頁面內視窗修復內建瀏覽器不支援 `prompt()` 導致的發回／撤回失敗；AB 審核錯誤顯示於版本確認平台，固定案件與取消捲動保留。
- ADMIN 全環境自送自審沿用後端明確確認與稽核；3020 修正強制員工 `a` 的測試身分，採專屬隔離 cookie，保留當前完整草稿／歷史／收據。
- IPQC 項目與審核內容收折；占用、未核准來源、未選產品分別解釋並提供處理入口。見 [review4](../docs/ipqc-reference/20261006-review4.md)。

## 2026-10-06 — IPQC 最新送審政策、AB 儲存與 C 撤回（未提交）

- 三項明確分類待補不阻擋 AB/C 送審與核准；保留標準、非法格式、引用、角色、CAS、待審與無實質修改限制。V3、legacy API 與前端同步。
- AB 修復舊失效產品關聯使無關修改也無法保存的問題；保留舊關聯待明確修正，失敗保留彈窗輸入及錯誤。C 版本確認平台增加獨立撤回入口。
- 3020/3021 測試統一到 3020，原狀態先保全，以 3020 為延續副本。經明確授權，以正常隔離送審／核准實測 AB/C 全流程及反向引用；3000 僅確認程式更新，沒有代核准。见 [review3](../docs/ipqc-reference/20261006-review3.md)。

## 2026-10-06 — 流程 IPQC 分配與反向引用（前兩輪歷史）

- 第 2 輪審查修正：日常引用限 working／pending／active，歷史明確分頁且沿用權限；revision 相同不讀製程快照。來源與引用成功／失敗皆防止舊帳號及舊請求回寫。日誌、截圖與保全 diff 已移入專案供獨立讀取。見 [修正驗收](../docs/ipqc-reference/20261006-review2.md)。
- 既有流程彈窗新增基本資料／IPQC 分頁，AB／C 核准項目按穩定 ID 分配；V3 與 legacy 寫入均防重複，失效關聯保留，未分配只列待補。
- AB／C 卡片與查看／修改視窗在頻率下顯示真實已保存引用；C 單欄順序及頻率名稱更新。僅隱藏指定預設流程媒體，保留舊文字、原媒體及共享草稿機制。
- 實際來源 revision 409 的唯讀副本用於隔離驗收。C 完整來源與多人競爭已驗證；AB 無已核准來源，不自行核准。詳細結果見 [驗收紀錄](../docs/ipqc-reference/20261006-acceptance.md)。未 commit、push、merge 或部署。

## 2026-10-05 — 本機V3檢查點與既有修復分支整合

- `b2b1f6b`保全目前V3程式、測試與整理後規格；原始表格、截圖、匯入報告、Local資料及備份保留本機，不納入本次提交。
- 整合`codex/hotfix-shared-state-memory-20260928`，補入byte snapshot傳輸、legacy安全revision重試後的stale-key保護、儲存錯誤雙語提示及CI回歸；保留現行V3帳號隔離、CAS備份與digest照片重用。PR #11個人草稿依現行規格不合入。
- 隔離通過：snapshot round trip／引用備份、照片還原與媒體API、legacy容量／重試／競爭、帳號隔離、stale-key已排隊與後續寫入拒絕、V3 authoring、實際瀏覽器儲存競爭及1366／390中越提示。未全面重跑T01–T45；無真實業務寫入、push或部署。

## 2026-10-05 — 文件分工整理

- 精簡AGENTS、建立正式規格與全文件索引；依模組拆分AI_CONTEXT及資料欄位路由，保留整理前未提交文件內容與歷史證據。
- 明訂單一共享草稿、製程待補放寬及其安全邊界；需求／實作／實測分開，沒有功能、資料、schema、migration或release變更。
- 文件驗證結果見[索引](../docs/DOCUMENTATION_INDEX.md)，當前交接見[HANDOFF](../HANDOFF.md)。

## 截至2026-10-03的歷史

完整原紀錄（含本次開始前未提交更新）保留於[歷史CHANGELOG](../docs/archive/CHANGELOG_THROUGH_20261003.md)。原文的PASS、Localrevision、branch及release只屬當時環境；不作新checkout或本次驗收證明。
## 2026-10-08 畫布緊密排版與走線再優化

消除進站後額外500px空欄，雙向分支排序及緊密中心對齊；依畫面位置分配端點與折線通道。5/10/15中越文幾何、3020合成UI整理/復原/重做及資料保全見[報告](../docs/ipqc-reference/20261008-canvas-routing-compact.md)。不改拓撲或同步規則，未操作3000、提交或部署。
## Sites isolated derivative - build/runtime evidence and source handoff

Build prerequisite refused the unset reviewed derivative commit before compiler
startup. A distinct synthetic-only native Workers operation failed with
ERR_RUNTIME_FAILURE before cases, separately from old stopped C1/observer actions.
Nested private-source boundaries now have 4 fake checks; affected security checks
18 PASS and scoped types have zero diagnostics. Data/schema/lock are unchanged.
The source allowlist and staged/resumable hosted-import design are preparation,
not a build, real login or platform PASS. See
[phase eleven](../docs/sites/PHASE_ELEVEN_RUNTIME_HANDOFF.md).

## Sites derivative - pinned dependencies and native compatibility evidence

Installed unchanged lock (567 packages), with no lifecycle/Git writes. Native
socketless Worker basics and existing password/HMAC source pass 1 + 4 cases.
Native listener readiness and Node loopback EACCES narrow the remaining runtime
failure; no network-permission bypass. Full types are zero after replacing the
missing bundled IQC legacy import source with an explicitly pinned private read
(5 fake cases); its real source remains unconfigured. Normal IQC data flows and
true R1 remain unchanged. See [phase twelve](../docs/sites/PHASE_TWELVE_PINNED_NATIVE_DIAGNOSTICS.md).

## Sites derivative - offline native probe configuration repaired

Use the supported deny-all outbound callback in active Miniflare probes; the old
native network-service object reproduced a host-specific startup crash. Node
outbound guard remains; native GET/POST denial sentinel verifies zero connections.
Shared guard 3 and full D1/R2/password/HMAC 8 PASS. Compiled application development
HTTP fixture 12 PASS on the retained deb0e90 build; fresh-version receipts remain
separately pinned. No production authentication/data model or dependency change.
See [phase fourteen](../docs/sites/PHASE_FOURTEEN_OFFLINE_RUNTIME_FIX.md).

## Sites isolated derivative - post-login pending import and recipe upload client

The legacy bootstrap now recognizes only a 503 JSON IMPORT_TARGET_NOT_ACTIVE
response, shows a bilingual pending-import view and makes no private-script
preload or execution requests. Other auth, server and network failures retain
their prior error path. Drafts/recovery and server authorization remain intact.

Added a transport-neutral recipe upload controller, explicit data-write/capacity
gates, bounded checksummed chunks, paged resume, lost-ack reconciliation and CAS
activation orchestration. Transfer status now exposes its existing ledger version
for correct resume. The read-only CLI reuses completed normalization receipts;
no full snapshot copy, dependency, schema, credential or live data changes.
An owner/platform/admin/export-only import page supplies same-origin browser
requests. A new exclusive local handoff writer copies only <=16 MiB of replay
chunks and aliases the remaining original files. It does not read cookies or
request a new password. Unknown capacity also blocks server-side begin. Only
synthetic handoff files were created; actual file selection/upload remain pending.
See [import readiness](../docs/sites/IMPORT_READINESS.md) for remaining supported
authentication, capacity/fee and real-transfer prerequisites.
# 2026-10-23 - Cancelled campaign fencing preparation

- Archive a specifically approved receiving campaign and isolate its namespace;
  retain old staging/receipts and original owner credentials. Atomic counter/policy
  comparison fences late writers before switching a new active pointer/budget.
- Add lost-batch-ACK, late-provider completion, concurrent retirement and paged
  inventory tests. Normal owner/same-origin authorization remains required.
- New dataset activation waits for the user's current3000 parity requirement;
  the operational R1 view is historical input, not proof of current live parity.
# 2026-10-23 Independent Sites photo uploads

Use one bounded, lossless PNG optimizer across six existing photo PUT routes,
preserving dimensions, pixel samples, metadata and existing authorization.
Non-PNG and special layouts keep original bytes; no schema/data migration.
See [photo policy](../docs/sites/PHOTO_UPLOAD.md) for limits and test boundaries.


### 2026-10-27 — isolated authoring Save / advisory inspection candidate

- Release Save operation busy only after acknowledged/adopted success; run advisory
  inspection separately with honest pending/failure status and current-snapshot Submit gate.
- Coalesce same-scope background inspection, fence late scope/identity replies and
  retain explicit retry rather than silent polling retries.
- Distinguish a newly admitted in-flight Save recovery record from settled unknown
  failure without altering transport storage, navigation, backend validation or deadlines.
- Add focused deferred-transport regression, exact cache expectation and CI command.
  This entry is local candidate documentation, not publication/native acceptance.
