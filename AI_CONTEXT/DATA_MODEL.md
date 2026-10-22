## Sites isolated derivative

IQC's optional legacy first-Excel-import baseline is no longer a bundled business
JSON import. Its existing maintenance/role/CAS and content checks now consume an
explicit private object key/file SHA pin; unset/unavailable source refuses. No
source object, schema or business row was created/changed, and it is not inferred
from the R1 current data. See [phase twelve](../docs/sites/PHASE_TWELVE_PINNED_NATIVE_DIAGNOSTICS.md).

The default-off hosted initial-import source now implements five operational
ledger tables: process_snapshot_transfers, process_snapshot_target,
process_snapshot_chunks, process_snapshot_activations and
process_snapshot_resource_audits. They bind owner/project/target/manifest, pin
chunk receipts and semantic/resource/multipart/row cursors, and gate activation.
They are excluded from the three-table business snapshot. Transport chunks in
the exact reserved process-import/v1 namespace are duplicate private operational
payloads, excluded from later business export; unknown reserved layouts refuse.
No real binding/schema/data was changed. A separately generated ten-table
schema-only candidate lives in drizzle-sites-fresh; old applied drizzle history
remains unchanged and the publication helper has not selected the new profile.
See [current contract](../docs/sites/PHASE_SEVENTEEN_IMPORT_BUILD.md); phase eleven's
earlier design is historical. Isolated-local target guards remain unchanged.

Local import staging now references the pinned Snapshot V1 chunks read-only,
rechecking every read, instead of persisting a duplicate transfer payload. The
target local DB/R2 ownership model and schema remain unchanged; this new importer
path is simulated-only. See [runtime preparation](../docs/sites/PHASE_TEN_RUNTIME_SOURCE_PREP.md).

True selected R1 -> Snapshot V1 local conversion now passes full data integrity:
1 current/100 history/1 feedback row, 14 identities and 3 roles, original 1,734
logical objects plus 299 unique private images and their index (304 URLs).
No schema/SQL migration was applied. Credential fields remain excluded and
authReady:false; real runtime restore/login is unaccepted. See
[verified local result](../docs/sites/PHASE_NINE_TRUE_R1_LOCAL.md).

The real R1 manifest's observed counters, account counts and policy metadata now
have a complete typed header profile. Real metadata passes; 1 current, 100 history,
1 feedback row and 1,734 logical objects are declared. No real data snapshot or
runtime restore has executed. Source SQL/table contracts are unchanged. See
[local R1 checkpoint](../docs/sites/PHASE_EIGHT_LOCAL_R1_CHECKPOINT.md).

The known R1 profile now requires exact `schemas`/`tables`, four source table
metadata records, typed static records and checksums, curation links and complete
member classification. SQL strings are metadata only, never executed. Snapshot
V1 adds the checked `source.origin.delivery` custody receipt; existing SQL and
table contracts are unchanged. See [strict parser](../docs/sites/PHASE_SEVEN_STRICT_R1.md).
The following phase-six description is historical:

Snapshot V1 additionally labels explicit logical-member conversions as
`r1-logical-members` with manifest/database/layout provenance hashes; it does not
label them as live Site exports. SQL and the three exported table/column lists
are unchanged. Private image URL/ACL mappings are generated only from explicit
normalized descriptors; the true R1 descriptor parser remains unavailable.
See [phase six](../docs/sites/PHASE_SIX_LOGICAL_BRIDGE.md).

Migration 0003 declares process_login_limits (hashed key, bucket_start, attempts); it is not applied. Snapshot V1 source/local adapter code is verified with mock bindings only. Large immutable JSON can stream, scrub and rekey current/history references; Known feedback STORE ZIP and legacy chunked v1 are now integrated with fake-verified export/transport/local restore; real R1 and runtime remain unqualified. No business schema, original data or credentials were migrated. Business immutable/CAS contracts remain. See [snapshot formats](../docs/sites/PHASE_FOUR_INTEGRATION.md).

## 2026-10-17 離線完整快照的本機操作紀錄

更新器新增私有 `.process-update` 版本基準、交易指標、雜湊鏈事件、完整實體備份與恢復證據，以及交易期間的 `.u1s` SDK 暫存；成功基準置於 `.wrangler/local-only/installed-package.json`。這些不是業務記錄或 Git 資料，不增加 SQL 表、migration 或 shared_state 鍵。業務格式、身分角色與個別權限不變；本機 CAS revision 與發布來源 revision 分別記錄。私有憑證不進資料包，較新的撤銷紀錄在恢復時保全。f722 的隔離完整容量 TEST 更新、拒絕、實體還原與備份複製恢復已有分項完整讀回證據；這不接受原 rev495 含 pending／草稿的業務更新，也不代表正常服務關站或新版製包通過。當前階段依 [HANDOFF](../HANDOFF.md)，操作見[操作契約](../docs/local-integration/OFFLINE_SNAPSHOT_UPDATE.md)。

## 2026-10-12 傳輸與授權補充

BOM 匯入 command.input 新增 `baseDigest` 與 `importMode:incremental-v1`；只影響傳輸及比對規則，持久 BOM occurrence、版本／快照／引用 ID 與 SQL schema 不變。一般缺列保留，新兄弟接至穩定父位置。角色範本更新依有效授權差異遞增既有 authEpoch；名稱／說明與不受範本影響的主要管理員不遞增。無 migration、遠端 binding 或真實帳號／業務資料移轉。見[BOM 規格](../docs/specs/current/BOM_REBUILD.md)、[權限規格](../docs/specs/current/PERMISSIONS_ADMIN.md)。

## 2026-10-10 帳號權限候選模型

沿用platformUsers，新增passwordHash（scrypt）、authEpoch、accessOverrides、deletedAt等可選欄位；processRoleTemplateOverrides/custom roles保留legacy欄位並支持151格access。processAccessControl保存schemaVersion/primaryAdminId/mappingVersion與無秘密audit。無SQL/schema migration；現有D1/R2records/CAS不變。真實14帳號尚未移轉，登入不自动hash。帳號/角色/模板不得经generic shared-state改寫；只由user-access专用API或明確離線工具处理。敏感password/hash/其他人設定由publicState/media/409投影移除。[欄位](models/CORE.md)、[規格](../docs/specs/current/PERMISSIONS_ADMIN.md)。

## 2026-10-10 BOM occurrence 與共享草稿

新增shared_state值`bomMasterControl`（scope `bom`），沿既有V3版本／working／saved／cases及R2 immutable record。`{bom,referenceIssues}`以根主件分組；每列十欄字串、原始level、id、parentId、path與来源。ID由根＋每層項次／料號建立，L2以上數值固定空白。核准才同一CAS投影`bomOverrides`的`PROCESS_OS_BOM_OCCURRENCES_V3` replaceAll wrapper；其他scope及舊製程選取不改。新BOM選取以產品＋occurrence ID套用原互鎖；舊code-only引用仍保留待確認。canonical保持ID且拒絕繞過工作流修改有效BOM。無SQL表／migration，日常BOM已經明確授權核准V6並投影生效；原最初待審為歷史證據。[規格](../docs/specs/current/BOM_REBUILD.md)、[收據](../docs/local-integration/20261010-bom-rebuild.md)。下方2026-10-08「產品＋零件碼」描述保留舊格式適用範圍，新格式以上述識別補充。

## 2026-10-09 會話撤銷（僅明確啟用的目標）

新增獨立 `process_revoked_sessions(token_digest,expires_at,revoked_at)`，token_digest為SHA-256及主鍵；不含原cookie、password或業務ID。不新增shared_state鍵，不修改流程／BOM／IPQC／案件歷史。公開API不建schema，`PROCESS_SESSION_REVOCATION_ENABLED=1`在明確migration後啟用。3020用自身private SQLite ledger；經2026-10-09使用者明確授權，0002 migration已在日常3000新增表並保留原業務；切換與驗證見[整合報告](../docs/local-integration/20261009-3020-to-3000.md)。保全與fail-closed界線見[登入撤銷報告](../docs/ipqc-reference/20261009-session-revocation.md)。共用／產品專用項目仍沿原name/text/standard JSON欄位，無業務模型遷移。

## 2026-10-09 網頁回報 V1（3020及日常Local明確啟用）

獨立 web_feedback_store(id,revision,payload) 以 CAS 保存 issues／attachments／batches／handoffs；不加 shared_state 鍵，不變更製程／BOM／IPQC模型。Drizzle 0002納入schema；既有Local使用明確upgrade，空環境沿正常初始化，公開API不建表。本機日常已啟用，遠端未部署。STATE_ARCHIVE 使用 web-feedback/v1/ 原圖與 immutable ZIP，附件記錄 owner／原存取 envelope／SHA-256。瀏覽器 IndexedDB process-web-feedback-v1 保存按 origin＋核驗帳號隔離的 Blob 草稿及固定待確認批次。資料流與容量／授權限制見 [WEB_FEEDBACK](modules/WEB_FEEDBACK.md)，實測保全見 [交付](../docs/web-feedback/20261009-implementation.md)。

## 2026-10-08 畫布本機 journal

伺服器資料模型、D1/R2 schema與BOM/IPQC所有權不變。新增瀏覽器localStorage恢復紀錄，以origin／頁面／actor／generation／tab隔離，entries以workspace、stage、operation ID、x/y/nextIds欄位辨識，保留base與value；pending存固定patch/guard及operationId供收據查核。這是本機預覽，不是共享working或Save內容。細節與界線見[製程編輯台規格](../docs/specs/current/PROCESS_EDITOR.md)及[本機画布報告](../docs/ipqc-reference/20261008-canvas-local.md)。

## 製程編輯台相容欄位（2026-10-08）

operation JSON 新增可選 `editorType`（entry/manual/inspection/machine/exit/custom）及 `ipqcQueryEnabled`（C 查詢開關）。沿用 productCodes、bomSelections[productCode]、machineIds、instructions/instructionSteps、productInstructions/productInstructionSteps、mediaItems/productMediaItems、nextIds、x/y；不另建 BOM 表或改用量。沒有 SQL/schema migration、持久鍵或日常資料移轉。舊缺 editorType 依 template.presetKey 判斷；模板已退休時沿用穩定 mode=machine，其他未知類型通用顯示，不依名稱猜能力；原 C ipqcAssignments 保留。唯一占用鍵為產品＋正規化零件碼，涵蓋完整 working workspace 隱藏工段；來源改動或舊非法分配列待確認。新非法占用由最終 CAS 寫入驗證拒絕。視角／產品高亮不持久化。見 [規格](../docs/specs/current/PROCESS_EDITOR.md) 與 [保全結果](../docs/ipqc-reference/20261008-process-editor.md)。

## 群組路線相容欄位（2026-10-08）

categoryGroups[].defaultStages 為群組有序預設（null 表示已移除）；products[].routeMode 為 group 或 exception，products[].stages 仍保存實際有效路線。移除群組設定轉為保留路徑的例外；製程 workspace 保留隱藏工段完整內容。無 schema migration。見 [本機提交範圍](../docs/ipqc-reference/20261008-local-commit.md)。

# PROCESS OS — 實際資料模型入口

狀態：Current checkout source；2026-10-05核對db/schema.ts及serializer/adapter。純文件分工，無資料／schema／migration改動。本次未驗證實際DBrevision或scope狀態。

| 任務 | 正式欄位／資料流來源 |
| --- | --- |
| 使用者、角色、主資料、workspace/node、版本、BOM、dispatch、backup | [CORE](models/CORE.md) |
| FQC、IQC、IPQC-AB/C、設備與來源稽核欄位 | [QUALITY](models/QUALITY.md) |
| 模具設備／目錄／IQC引用／移轉／初始來源 | [TOOLING](models/TOOLING.md) |
| 例行 FQC 工作／計畫／報告／逐樣品結果／異常／照片 | [ROUTINE_FQC](models/ROUTINE_FQC.md) |
| V3shared draft、records-v1、receipts、照片wire／legacy相容 | [V3](models/V3.md) |
| Canonicaldomain／manifest、bootstrap、同步base | [CANONICAL](models/CANONICAL.md) |

## Persistence Overview

2026-10-07 Routine FQC回饋：新增唯讀`routineCatalog`完整分類投影，與正式時間排程來源分開；`half_yearly`對應既有半年曆期。沒有新增持久鍵、欄位、SQL或migration；既有Source快照不回寫。[模型](models/ROUTINE_FQC.md)／[驗收](../docs/routine-fqc/20261007-feedback.md)。

2026-10-07 模具完整流程：新移轉可選 `quantity`／`unit` 保存當時數量，由伺服器固定來源與操作身分；IQC 零件可選 `isEnabled`，模具引用仍以穩定 ID 讀取正式版本，停用／移除顯示保留歷史投影。loopback ADMIN 的模具銜接保全完整 workflow、cases、saves、receipts 與照片，只變更模具 record pointer，CAS 前建立精確原指標備份。無 SQL schema、migration 或遠端 binding 變更，欄位及演算法見 [TOOLING](models/TOOLING.md)，實際 3030→3000 驗收見 [報告](../docs/tooling/20261007-flow-acceptance.md)。

2026-10-06: optional operation-level `ipqcAssignments[]` and derived process references are documented in [CORE / Process Operation](models/CORE.md#process-operation--node). They use the existing process snapshot and CAS lifecycle; no table, migration, source-standard rewrite or live-data conversion occurs.

2026-10-05本機整合維持既有資料模型：legacy大型snapshot直接上傳已計算digest的UTF-8 bytes，讀取以同一份bytes驗hash後解碼，減少重複編碼；原JSON／R2引用格式不變。保留V3 records/chunks路徑與revision保護的原始儲存引用備份，無schema、migration或既有資料轉換。

Request-only `commandWireVersion:1` envelopes intern repeated raster data URLs using `media[]` and bounded `__commandMedia` references. They are expanded before module validation, permission checks and idempotency fingerprinting; they are not persisted storage references. Old commands and recovery records remain readable. The request limit is unchanged; invalid/unused references fail closed. Browser recovery uses the same envelope but preserves the original operation identity and guards on retry.

New receipts store action plus canonical interned-command SHA-256 (`commandDigestV1`), avoiding photo-sized receipt metadata. Replay uses the stored receipt's old/new fingerprint format; legacy raw fingerprints remain valid. Envelopes allow 64 unique raster strings, 256 references, depth48 and 8 MB expanded repeated-media characters; violations reject before mutation. These bounded request/receipt changes do not convert existing Local records.

Quality photo endpoints read only live account/role/maintenance keys for authorization, not historical workflows. User-reference protection first inspects legacy/V3 actor metadata, then scans verified immutable bodies serially when needed. Operational records restore validates every reachable body/index plus byte-exact legacy sources, streaming source SHA in Workers, and commits the original backup pointer via CAS instead of re-encoding complete historical JSON. Effective pending cases across all applicable scopes prohibit whole-state restore. Legacy restore retains its compatible path; reads and restore previews never automatically adopt a workflow.

### Hosted D1 / SQLite

`db/schema.ts` and the Drizzle migrations define four tables. Local upgrade 0002 adds `web_feedback_store(id,revision,payload)` and `process_revoked_sessions(token_digest,expires_at,revoked_at)` as described above; no remote migration was executed. The two business state tables remain:

#### `shared_state`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | integer PK | Singleton row; current code uses `1`. |
| `revision` | integer | Optimistic-concurrency version for the whole logical state. |
| `values` | text/JSON | Map of allowed shared-state keys to serialized JSON strings. |
| `updated_at` | text | ISO timestamp of the latest accepted write. |

#### `state_backups`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | text PK | UUID, hourly key, or scheduled-backup key. |
| `revision` | integer | Source shared-state revision. |
| `values` | text/JSON | Complete `shared_state.values` snapshot. |
| `reason` | text | Backup trigger/reason. |
| `actor` | text | Platform user ID or `system`. |
| `created_at` | text | ISO creation timestamp. |

The database does **not** currently have normalized tables for products, BOM rows, process nodes, users, roles, SOPs, QC results, dispatch records, or media.

### Browser and sync layer

The SPA retains its legacy `localStorage` call sites, but `public/process/shared-state.js` intercepts every allowed shared key into an in-memory mirror, batches changes, and sends them to `/api/shared-state`. Asynchronous server reads populate that mirror from D1/R2 before the application scripts run; script downloads run in parallel. New business writes and embedded media never enter native `localStorage`; it stores device-local preferences and preserved preexisting process-draft recovery copies. D1/R2 remains the durable shared source.

The opt-in `X-Process-Media: deferred-v1` read representation replaces large raster/video data URIs with `/api/state-media?id=<sha256>` delivery URLs. R2 `delivery/media/` contains byte-identical immutable copies, and `delivery/v1/` caches sanitized snapshot projections by content digest. The media route retains the shared-state read policy and supports ranges. POST resolves delivery URLs and verifies their hashes before validation/persistence, retaining the original data-URI representation and backup/export compatibility. `X-Process-Receipt: sha256` requests a compact receipt for each exact submitted value after the revision-checked write; the client verifies every digest before reporting success. Older clients still receive the existing full response. No SQL table, field, key or migration is added, and existing R2 objects are never deleted.

Legacy writes include a base revision; V3 commands instead carry scope generation, operation ID, client sequence and dependency guards, with backend shared-row CAS. HTTP 401/403/409 blocks writes for login/conflict handling and preserves unsynced updates in memory, with a best-effort `sessionStorage` copy under `process-unsynced-recovery` when it fits. A network/temporary failure pauses automatic writes; an explicit Save retries it once. Concurrent Saves share the same pending operation and drain later dirty updates before reporting success. The generic client has no polling or automatic failure retry; the IPQC-C V3 client polls scoped revision tokens and queries durable operation receipts. Failed initial loading refuses writes until data is reloaded.

An old native `processEditor:<category>:<line>` cache is validated against its envelope and stage-array shape and is never deleted merely by loading. When its server key is absent, the valid cached workspace remains readable and is staged for an authenticated editor. A differing server snapshot remains authoritative until explicit legacy recovery and Save. Clearing the cache requires a successful API echo of the current write, identical complete stage content to the old cache, an unchanged native copy, and no later queued update. Modified or invalid caches are retained. Reopening a draft uses its saved workspace when `savedAt` is at least its version's `updatedAt`/`createdAt`; protected version snapshots keep their existing authority. This uses the existing workspace/version JSON and adds no shared-state key, table, entity, SQL schema change or migration.


## Source of Truth and Data Flow

1. `data/canonical/` is the shared reviewed collaboration baseline. New Local bootstraps from it; bundled product/BOM files remain legacy adapters, not the latest baseline.
2. `masterDataControl.active` is the approved source of truth for operational products, categories, lines, stages, and routes.
3. Master approval reconciliation updates permitted runtime projections. Stage deletion protects pre-mutation product routes and formal/pending/draft/workspace references; it cannot clear those references to bypass protection. Necessary template activation follows the pinned PROCESS source and atomic linked-case checks described above.
4. `processAuthoringControl.activeVersionId` is the process-content source after explicit whole-platform adoption; otherwise `approvalVersions` retains the legacy source. Working or saved drafts never affect line playback until approved.
5. `dispatchBoard` selects which approved products appear on each line.
6. Shared changes are written as a new singleton-state revision. Cloud and host backups snapshot that state before protected mutations/restores.


## File and Media Storage

- Static application assets are tracked under `public/process`; legacy demo PNG references are not proof that their files exist. Saved template photos live in the process-version snapshot and, after approval, in the existing `processMasterData` projection. Fresh Clone real-image availability requires the separately reviewed Canonical image package rather than browser caches or untracked files.
- Existing BORUAXE demo defaults first reuse matching operation media from approved versions of the same category, line and stage, preferring current approval over historical superseded versions. This changes fallback resolution only, introduces no image field/entity, and never replaces existing operation media.
- R2 binding `STATE_ARCHIVE` stores content-addressed `snapshots/<sha256>.json` objects when a serialized state reaches 512 KiB. The D1 `values` column then contains a `__processR2` reference, digest, platformUsers metadata for host-backup authentication, and an optional maintenance-mode overlay. The public API always expands the snapshot and removes account passwords; it never exposes a bucket URL or maintenance credential. Legacy inline JSON is still supported, with no schema migration.
- Every shared-state, user, backup, scheduled-backup and release write uses the same serializer; R2 is written before the D1 compare-and-swap. A failed D1 write can leave an unreferenced immutable R2 object, never a missing referenced object. Reads verify the hash and fail closed if unavailable. Current objects are retained, including older backup references.
- Local full ZIP backups include consistent SQLite snapshots of the R2 metadata plus its blob files. Restore copies blobs and replaces metadata rows transactionally, avoiding overwriting a live SQLite/WAL file. Portable maintenance exports expand all business JSON and embedded media and must be paired with the static asset package.


## Integrity and Security Constraints

2026-10-07 例行 FQC 操作：既有 Document 增加 optional cancelled（操作者／時間／原狀態）與 lifecycle[]，取消不刪草稿／照片／案件歷史。planFamily、reportAvailability、dependencies 與驗證 issues 為 GET 唯讀投影；CAS、actor 收據及 saved/pending 固定快照不變。無 SQL schema、migration、D1/R2 binding 或日常資料回填。參見 [ROUTINE_FQC 模型](models/ROUTINE_FQC.md)。

- Shared keys are allowlisted and must contain valid JSON.
- Server permissions gate protected key families and approval/deletion operations.
- Active master-data changes require approval; deletion requires `master.delete` and is blocked while relevant reviews are pending.
- Restore enters maintenance mode and prevents normal writes.
- Public API responses remove user passwords.
- Current password values are not modeled as hashes; improving credential storage would be a future data-model and migration change, not an existing capability.


## Key ownership

Generic /api/shared-state allowlist由lib/process-state.ts的allowedKey決定；platformUsers、processCustomRoles、processRoleTemplateOverrides寫入已由route拒絕，其他項含approvalVersions、dispatchBoard、publishedProcess、processMasterData、masterDataControl、bomOverrides、versionSampleSeed4、backupSettings、canonicalQuality、qualityMasterControl及processEditor:*。專用品質／authoringworkflow routes可經各自權限寫入其control／recovery keys，不因此把這些keys放進generic allowlist。細節見QUALITY及V3模型。

DB binding保持DB，R2為STATE_ARCHIVE。舊檢具原型EQUIPMENT_DB、equipment_*表及/api/equipment/draft只是淘汰提案，不是實際schema。

2026-10-06 IPQC policy: optional `DraftIssue.code` and `contentIssues.policy=ipqc-completeness-v1` classify fixed non-blocking submission reminders in existing workflow/version records. See [V3 model](models/V3.md). No new entity, SQL schema, migration, binding, storage architecture, bulk history rewrite or daily-data conversion.

2026-10-06 review5 的逐群組 AB 操作已由 2026-10-07 [整份文稿規格](../docs/specs/current/WHOLE_MODULE_DRAFT.md)取代。`ipqcABMasterControl.moduleDraft` 保存全庫 `scopes`／`bases` 的 working、saved、固定 cases；一次 shared-state CAS 更新整份案件及各群組的兼容版本投影，穩定項目 ID 與歷史案件保留。未增加跨模組資料鍵、SQL schema、migration、D1／R2 binding。`reviewer-completeness-v2` 仍分類非阻擋待補。

2026-10-07 模具介面：optional `inspectionFrequency` 與既有 `frequencyMonths` 共同表示週／月／季／半年／每年，舊快照保留原值；更正沿用既有 `correctionOf` 穩定 ID 關係。確認總覽只讀原模組 adapter，不存新關聯或事件。詳見 [TOOLING](models/TOOLING.md)；D1／R2、SQL schema 與 migrations 不變。

2026-10-08 路線隱藏：核准產品最大路線僅控制 canvas 可見投影；legacy 與 V3 完整 workspace 保留隱藏工段及其引用。未新增 entity、schema、migration 或 storage key。3020 兩產品只改 category；ID、stages 與其他 control 不變。見[保全報告](../docs/ipqc-reference/20261008-group-route-canvas.md)。

2026-10-08例行FQC：既有ResultRow[]允許跨列同樣品多次測試，既有followup notes同次CAS記錄改善及複測；無新增欄位、SQL或migration。正式快照不改寫，單樣品失敗依每份正式報告各次結果聚合，細則見[ROUTINE_FQC模型](models/ROUTINE_FQC.md)。

2026-10-12例行FQC：維持ResultRow.samples既有陣列及Document.number格式，不新增欄位／SQL／migration。新選樣單一且同項跨列不重複，未變更舊樣品保存相容；新複測RTS／更正COR號，舊號不回寫。照片移除僅文稿引用，正式歷史與R2實體保留。[模型](models/ROUTINE_FQC.md)。
