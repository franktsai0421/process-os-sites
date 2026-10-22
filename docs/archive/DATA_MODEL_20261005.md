# Deprecated — 歷史快照

原位置：`AI_CONTEXT/DATA_MODEL.md`。保留2026-10-05整理前內容（包含先前未提交文件修改），不作目前分支、需求、DB、驗收或部署狀態。替代來源：[AI_CONTEXT/DATA_MODEL.md](../../AI_CONTEXT/DATA_MODEL.md)。原文內程式／證據路徑依原位置或 repository root 解讀；不得直接重跑歷史操作。

---

# PROCESS OS - Current Data Model

Last verified: 2026-10-05 (V3 source, process advisory JSON metadata and authorized FQC cleanup399→401; no SQL migration). This document describes only the current repository implementation.

New process:platform cases optionally store contentIssues:{policy:'process-platform-v1',issues:[{kind:'missing',path,message}]}, captured on submission and retained in numeric-version/public-approved projections. result.contentIssuesConfirmed records explicit acknowledgment. Old cases are not bulk rewritten; an old case lacking this field can acquire a review-time record only on explicit approval. The permission-checked contentIssues=1 GET separates working, saved and fixed pending-case lists; no saved snapshot reports checked:false. Other modules keep their validation policy.

Draft Save receipts optionally retain reason/source audit strings. expectedRevision is an opt-in strict guard on non-restore commands; ordinary field coediting retains server-order/dependency-guard semantics. FQC cleanup uses it plus expectedAB versionId/full exact product-code list inside fresh adapter contexts for Apply and Save. Only guarded product links change; unrelated absent equipmentSnapshot fields stay absent. No SQL column, migration, binding or wholesale conversion is added.

The unified interface adds a read-only `uiHistory=1` workflow query, under the existing view/history permissions. Independent version/save cursors return at most20 metadata rows each; `uiVersionId` resolves the selected case's original saved ID to its actual saver/time. It does not hydrate snapshot/content bodies. Exact history details reuse case/version reads; IPQC-C now also accepts permission-checked `versionId`. Invalid cursors return409 and unauthenticated reads403. No persisted fields, entities, schema, bindings or data conversion change. Old records without a real save event remain “未記錄”; editor/updatedAt metadata is not a substitute for saver/time.

Submission/review validation failures retain the existing error contract `details.issues:[{kind,path,message}]` and request ID. Quality adapters now resolve applicable legacy messages to existing stable item/error IDs in `path`. Clients associate displayed issues with the actor and saved ID/generation (or case); working repairs do not rewrite saved validation, and manual Save invalidates the old result. This is response metadata/UI state only: no persisted entity/column, binding, SQL migration or automatic data conversion is added.

Authoring emits `PRODUCT_MISSING:<code>` as a missing issue at each original workspace/stage/operation path when a referenced product no longer exists. Unchanged orphan operations can remain in working/saved content; submission validates the full `process:platform` saved snapshot, with approved business-content codes now advisory and technical/integrity failures still blocking. This is distinct from a conversion content conflict. `workflow.saved=null` means no V3 manual-save receipt, not loss of the legacy saved18 archive. A direct archive entry retains original status/time, while working19 stays separately editable. The later approved application adds the already-defined authoring control/recovery JSON keys and records-v1 envelope; it adds no SQL schema or binding.

The master workflow adds `masterDataControl.workflowScopes[AB|C|PROCESS]` only on explicit adoption. AB/C products, lines, nested stages and categories receive additive stable IDs; PROCESS equipment defaults are normalized. Original snapshots remain archived; public projection omits private workflows. A topology-changing AB/C fixed case may carry `linkedProcess:{scope,baseVersionId,added,removed,before,content}` with only necessary template changes. PROCESS draft/pending or another effective linked case blocks those changes, not unrelated AB/C edits. Approval rechecks permissions, pinned source and references, then publishes AB/C, a derived PROCESS version and `processMasterData` in one shared-state CAS. It never merges independent drafts or clears PROCESS work. This JSON initialization changes the data model despite no SQL migration; existing Local master scopes were not batch adopted.

PROCESS template IDs/presets describe reusable defaults, not the editor's flow instances. `newOperation` copies defaults and retains `templateId` with an independent operation ID. The opt-in `processAuthoringControl` holds one `process:platform` workflow whose content is `{workspaces:[{id,category,line,stages}]}`; workspace IDs encode `[category,line]`, not separate approval scopes. Its API enforces existing editor/approval permissions and changed-line access. Public projection exposes only effective content and removes archived authoring caches; adopted legacy writes are fenced. `processAuthoringRecovery` is not publicly projected. The conversion plan preserves byte-exact legacy strings/hashes/revision and four saved draft payloads separately, initializes no successful V3 save and does not turn old versions into fabricated cases. BORUAXE1021/A retains the saved 18-operation draft and compatible unsaved 19-operation workspace (one added entry, four coordinate edits). Conflicting business edits or pending cases still stop conversion. API and actual canvas/dialog integration pass named isolated-copy tests. The approved Local conversion completed once at revision334→335, preserving all21 original serialized values byte-exact and adding only authoring control/recovery. Actual readonly HTTP/browser acceptance passed; saved remains null until a user manually saves V3 content.

`state-chunks.ts` adds an opt-in R2 storage envelope `__processChunks` pointing to a SHA-verified manifest and immutable packs under `state-chunks/v1/`. Module JSON strings, formatting and historical/media payloads are preserved byte-for-byte. Content-defined chunks deduplicate repeated snapshots; writes reuse verified old blocks and upload changed packs plus a manifest before the existing D1 revision CAS. Backups retain the exact envelope and objects are never deleted. Storage verification metadata is request-local and omitted from HTTP payloads. Legacy inline/`__processR2` reads and default writes remain unchanged; only an explicitly converted isolated copy keeps the new format. Core/API decoding, reverse restoration and Local maintenance codec compatibility are tested; bounded history/manifest growth and full Workers capacity remain unfinished. This experimental chunk format remains unadopted on existing Local, which now uses the separately verified records-v1 format. No SQL migration/binding was added.

The explicit records-v1 envelope `__processRecords` maps module keys to SHA-verified immutable R2 objects under `state-records/v1/`. `legacySources` preserves original strings byte-for-byte; snapshot/content/before/working bodies use trusted internal references. Read verification and parsed-model sharing are request-local. Changed bodies/metadata upload before the existing D1 CAS; upload failure or a losing writer never publishes a new pointer. Backup pointers retain all old objects; there is no automatic collection. Partial authentication reads cannot be saved. Non-adopted legacy scopes always hydrate snapshots for old readers. Local initialization/data codecs read both new formats and preserve the adopted format on write; isolated tests check stale CAS, reopening and backup decode. Physical converted-copy restore passed for the representative isolated set described below; the approved limited Local records-v1/authoring application subsequently passed full-backup restoration, isolated conversion and actual readonly acceptance. Other workflow scopes were not batch adopted; full V3 remains uncertified.

`caseMetadata=1` returns active/open versions and metadata, including link source/affected stages without nested historical bodies. Authorized case/version/restore selectors hydrate only selected immutable bodies. Prepared master/authoring/quality models avoid historical stringify/parse rebuilding. Records full-history HTTP responses stream SHA-verified bodies sequentially with bounded output chunks; a missing/corrupt body rejects stream consumption, not a fabricated valid JSON response (headers can already be 200). Existing legacy formats keep their original full-read fallback. Records manifests also reference verified minimal reserved-code/equipment-number indexes; old manifests without indexes use the full validated fallback. Metadata arrays remain unbounded and native memory peaks uncertified; existing Local now uses records-v1 with all original logical values retained.

Legacy quality parsers retain full validation for unadopted data. Adopted records parsers accept only trusted request-local deferred history references while validating live/selected content; legacy direct writes are rejected before expanding unrelated history. Five quality modules and master/authoring pass representative 40-case actual Workers tests, including complete JSON history consumption, concurrent writes and saved reopening. All 31 actual-copy scopes pass initialization/structure/rollback (pending equipment stays locked). A persistent copy passes D1/R2 disposal/reopen, authoring Apply/Save, converted physical restore and original-format rollback across 15 source keys/13 images. A later revision334 restored-application check extends that older sample to21 source keys,313 private photos (939 authenticated reads),119 referenced absolute public raster files and36 inline references, preserving original account/role bytes and using the preserved runtime secret. Conversion reopen and exact legacy rollback pass only in the isolated copy. No eligible original non-demo account existed for password/Session continuity, so that check is NOT_AVAILABLE. Relative public aliases, videos, physical devices and unlimited capacity remain unverified.

Authoring legacy history is separately permission-gated via `legacyHistory`/`legacyVersionId`; original versions stay read-only and retain their original metadata/stages. It does not fabricate V3 saves or allow legacy records to use a V3 save identifier for restore. V3 historical previews flatten workspace/stage operations for readable fields/photos and restore only unsaved working content.

`/api/effective-versions` returns revision plus permitted formal IDs, never snapshots, receipts or account data; clients show a manual new-page notice. Actor-owned legacy failure recovery is browser session/in-memory quarantine, not a successful server save; it retains only attempted keys and their baselines, never the whole authentication values map. Non-BOM initialization/import APIs require the separate maintenance credential in addition to their existing checks. No SQL schema/binding change or existing-data migration is performed.

## Persistence Overview

Request-only `commandWireVersion:1` envelopes intern repeated raster data URLs using `media[]` and bounded `__commandMedia` references. They are expanded before module validation, permission checks and idempotency fingerprinting; they are not persisted storage references. Old commands and recovery records remain readable. The request limit is unchanged; invalid/unused references fail closed. Browser recovery uses the same envelope but preserves the original operation identity and guards on retry.

New receipts store action plus canonical interned-command SHA-256 (`commandDigestV1`), avoiding photo-sized receipt metadata. Replay uses the stored receipt's old/new fingerprint format; legacy raw fingerprints remain valid. Envelopes allow 64 unique raster strings, 256 references, depth48 and 8 MB expanded repeated-media characters; violations reject before mutation. These bounded request/receipt changes do not convert existing Local records.

Quality photo endpoints read only live account/role/maintenance keys for authorization, not historical workflows. User-reference protection first inspects legacy/V3 actor metadata, then scans verified immutable bodies serially when needed. Operational records restore validates every reachable body/index plus byte-exact legacy sources, streaming source SHA in Workers, and commits the original backup pointer via CAS instead of re-encoding complete historical JSON. Effective pending cases across all applicable scopes prohibit whole-state restore. Legacy restore retains its compatible path; reads and restore previews never automatically adopt a workflow.

### Hosted D1 / SQLite

`db/schema.ts` and the Drizzle migrations define two tables:

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

## Allowed Shared-State Keys

### Quality V3 persistence

The common model also applies to `ipqcABMasterControl.scopes[line:group].workflow`, `qualityMasterControl.libraries.fqc.workflow`, and `routineEquipmentControl.workflow`. FQC retains legacy string version numbers in storage; its adapter exposes numeric versions to the common route without rewriting old numbers. Routine Equipment persists its established flat version fields and exposes transient `snapshot` projections to the common route; legacy version records are preserved. Successfully allocated category codes/piece marks remain reserved after draft deletion or historical restoration. Public shared-state delivery projects only effective content for adopted scopes; history and work content require dedicated authorized reads. Existing Local quality JSON remains byte-exact inside records-v1, with no quality workflow adoption or SQL migration. Quality workflow activation still requires its own applicable acceptance and explicit begin; equipment V5 remains legacy pending.

`ipqcCMasterControl.workflow` and `iqcMasterControl.workflow` each store one scope generation with working content, last successful save, immutable saves/cases, contributors, tombstones, ordered-client sequences and actor-owned idempotency receipts. Each case fixes its saved content, before-content, reason, submitter/time and final review event. Withdrawal/return starts a new generation without deleting the old case; approval changes the active version atomically. Legacy `versions[]` remain compatibility projections. Public shared-state exposes only the active IPQC-C and IQC versions; dedicated authenticated reads check history permission and omit private recovery commands. Case metadata is paged and individual fixed cases are separately readable. Historical restore has permission-checked previews and generation/revision-checked application into unsaved working content; save, active state and old cases remain unchanged. Newer numbered rows remain soft-deleted to preserve identity reservations.

The pilot adds JSON model fields, not SQL tables/migrations or bindings. Legacy persistence still rewrites the aggregate. The isolated chunk format reduces physical reads/writes but still reconstructs complete module JSON; records-v1 adds lazy historical bodies for adopted scopes. Complete history JSON, old-format reads, partial upload/CAS failure and saved reopening pass bounded representative Workers tests. Unbounded metadata/native peak certification and all-module activation remain unfinished. The approved Local application activates authoring only; existing master/quality workflow states were not batch converted.

`backupStoredState` copies the stored D1 representation under a revision guard instead of decoding/re-encoding its R2 snapshot. Shared-state media restoration reuses SHA-verified existing data URIs by content identity, fetching/verifying only new references; it does not use array position or replace historical image bytes.

- `platformUsers`
- `processCustomRoles`
- `processRoleTemplateOverrides`
- `approvalVersions`
- `dispatchBoard`
- `publishedProcess`
- `processMasterData`
- `masterDataControl`
- `bomOverrides`
- `versionSampleSeed4`
- `backupSettings`
- any key beginning with `processEditor:`

The server rejects other shared keys and rejects values that are not valid JSON strings (or explicit deletion).

## Core Entities

### Platform User

Stored in `platformUsers`.

- `id`: login identifier and stable user key.
- `name`: display name.
- `authMode: "demo"`: marks the three fixed test identities (`demo-admin`, `demo-rd`, `demo-staff`); these users contain neither `password` nor `passwordHash`. Names are Demo Admin / Demo RD / Demo Staff.
- `password`: legacy formal-account verification value; absent from demo users and seed, stripped from public responses. Formal hashing is outside this change.
- `role`: `admin`, `rd`, `staff`, or a custom role ID. User ID `admin` is forced to role `admin`.
- `enabled`: whether login and authenticated operations are allowed.
- `inheritRole`: when true, the role template supplies the user's scope; when false, individual scope fields are used.
- `lines[]`: allowed production-line codes.
- `views[]`: allowed page IDs.
- `permissions[]`: allowed action keys.

User IDs are canonicalized to lowercase for storage and compared case-insensitively. The ADMIN-only `/api/users` route applies optimistic shared-state revision updates, preserves password values when ordinary edits omit them, and returns only sanitized users. Historical or audited users are archived with deletedAt and deletedBy, hidden from the active list and blocked from login; records retain their identity. Unreferenced users can be removed. Current-user deletion and final enabled ADMIN removal/demotion are prohibited.

### Role Template

Built-in defaults live in code; custom roles are stored in `processCustomRoles`, and built-in role changes are stored in `processRoleTemplateOverrides`.

- `id`, `name` for custom roles.
- `lines[]`, `views[]`, `permissions[]` define shared scope.
- Users relate to a template by `user.role`. Role changes reset inheritRole=true and replace old individual scopes; custom mode uses only the user's arrays. Role edits affect followers dynamically. ADMIN is fixed. Role/user writes use /api/users with the existing shared-state revision. Demo Sessions are versioned HMAC-signed HttpOnly cookies containing a fixed identity ID, `sessionType: "demo"`, nonce and eight-hour expiry, never passwords. Every protected use validates `DEMO_LOGIN_ENABLED`, demo mode, fixed role and live account status. Local signing secrets are random and persisted outside Git.

### Master Data Control

Stored in `masterDataControl`.

- `active.AB` and `active.C`: currently approved catalog snapshots.
- `versions[]`: historical/draft/pending master snapshots.

Each master version contains:

- `id`, `scope` (`AB` or `C`), `number`, `status`.
- `snapshot`: catalog content.
- `creatorId`, `creatorName`, `createdAt`, `updatedAt`.
- optional `parentVersionId`, reviewer fields, warnings, and history entries.

Only approval copies a version snapshot into `active[scope]`. Typical statuses are `draft`, `pending`, `approved`, and `superseded`.

### Catalog Snapshot

- `name`.
- `products[]`.
- `lines[]`.
- optional `categoryGroups[]`, allowing an empty category to exist independently of products.

Product fields used by current code include:

- `code`: unique SKU/product identifier across scopes.
- `name`, `category`, `specification`, `unit`.
- `line`: A/B/C line code.
- `stages[]`: ordered route stage codes.

Line fields:

- `code`, `name`.
- `stages[]`.

Stage fields include `code`, `name`, and optional operator/machine metadata used by the UI. Product `stages[]` entries must refer to stages belonging to the selected line.

### Process Template Master

Stored in `processMasterData` as a map:

```text
stageCode -> ProcessTemplate[]
```

A template contains `id`, optional `presetKey`/`presetVersion`, optional shared `catalogKey`, `name`, compatibility fields `mode`, `people`, and `machineIds[]`, plus `media`, `mediaName`, `mediaType`, and `mediaItems[]`. Every valid stage retains the same ordered five required presets: Entry, Manual, Manual Inspection, Machine Setting (internal compatibility key `machine-assembly`), and Exit; user-created templates without a preset key may follow them. The master-data UI presents one global catalog instead of a stage selector: standard/custom names, photos, additions, and deletions propagate to every stage through the shared preset or catalog key. Static curated images provide the initial preset media. Additional uploads are stored in the existing template JSON after client-side photo compression. Selecting a template copies its media items into the operation, after which operation media is independent. The preset version keeps required-template migration idempotent, migrates legacy Machine Setting equipment into the unified machine preset, and does not rewrite approved history.

The authoritative process-template version set now lives in the existing `masterDataControl` JSON alongside AB/C versions. `active.PROCESS` is the approved stage-to-template map; version records with `scope: PROCESS` contain the usual `id`, `number`, `status`, `snapshot`, creator/reviewer timestamps, warnings, and history. Draft and pending snapshots never alter the editor. On approval, `active.PROCESS` is updated and projected to the existing `processMasterData` shared-state key for backward-compatible editor reads. The API validates required presets, template identity, duplicate IDs, media-array shape, approval authority, and deletion rules.

The process-master page exchanges its complete selected snapshot using `PROCESS_OS_PROCESS_MASTER_EXCEL` format version `3` (v1/v2 imports remain supported). Sheets are `格式說明`, `流程資料`, `照片資料`, `設備資料`, `設備照片`, and `照片內容`. Template and equipment fields are editable rows with unknown fields retained in `其他資料JSON`. Version 3 removes the obsolete equipment quantity and manually entered process columns, adds machine type and an informational approved-usage column, and maps legacy machine assembly/setting rows into the unified machine preset. Photo metadata references a deduplicated content ID; image bytes are split into ordered chunks of at most 28,000 characters. Import rejects missing/duplicate chunks, unsupported versions, invalid associations and duplicate equipment IDs. A bundled asset URL is reused only after byte comparison with embedded content, otherwise the embedded image is retained. Import replaces only the current draft after confirmation, never the approved catalog.

The unified Machine Setting template may contain `equipment[]`. A record has a stable `id`, physical `number` (blank if unknown), `line`, `stageCode`, compatibility `kind` (`machine-assembly`), `name`, `nameVi`, optional `machineType`, `purpose`, `purposeVi`, `note`, `mediaItems[]`, and optional `source` metadata (sheet, row, photo code, original stage/number and source cells). Quantity and manually maintained process are not stored. The displayed process usage is derived dynamically from approved `approvalVersions` snapshots, so an approved block rename or reassignment is reflected without editing equipment. Source records use deterministic IDs and line/stage/number deduplication so repeat imports replace the source catalog without duplicating physical machines while preserving manually created records. API validation enforces ID uniqueness, stage/line/preset association and array shape; removing equipment uses the existing master-delete permission. `operation.machineIds[]` may contain these stable IDs or legacy machine IDs; `machineDetails[]` stores selected equipment snapshots. The same physical machine may be selected by multiple operations. No new D1 table or shared-state key is added.

### Process Editor Workspace

Stored under `processEditor:<category>:<line>`.

- `category`, `line`, `savedAt`.
- `stages`: map of `stageCode -> ProcessOperation[]`.

The corresponding in-memory workspace key is `<category>:<line>`. Only stages required by approved routes in that category/line are added.

### Process Operation / Node

Important current fields:

- Identity and placement: `id`, `stageCode`, `number`, `templateId`, `name`, `x`, `y`.
- Graph relation: `nextIds[]` references other operation IDs in the same stage graph.
- Applicability: `productCodes[]` references catalog product codes. Their union is the participating-product set for the current `category:line` workspace.
- Selecting or removing a product in one node applies that workspace choice to every existing node whose stage belongs to the product's approved route. New nodes inherit the same union filtered by target stage. Products not selected on any node are excluded from submission-level route and BOM checks. This uses existing fields only; temporary validation placeholders are UI state and are never persisted. Saved sample versions are not normalized/relinked on startup.
- BOM: `bomProductCode`, `bomItems[]`, and/or `bomSelections` keyed by product. Every operation editor displays the complete root BOM for each selected product. Authoring enforces one owning operation per normalized product/item combination: an item assigned elsewhere remains visible with its owning operation number/name, but its checkbox is disabled until the original operation clears it. The owning operation remains editable so the assignment can be removed before selecting it in another block. Validation still uses the union of that product's assignments across operations whose stages belong to its formal route; one occurrence satisfies completeness, while assignments outside the formal route do not. Inside one operation, an available selected item code is mirrored across enabled `bomSelections` rows of selected products that contain the same normalized code; products without that code, different item codes, and rows owned elsewhere are unchanged. When the category/line participating-product set is propagated along formal route stages, each affected operation performs the same intersection-based inheritance so a newly added product receives only codes already assigned in that operation and present in its own root BOM. Existing legacy duplicate assignments are not deleted automatically and remain removable from their owning operations. Storage still uses the existing arrays; no new field or schema is introduced.
- Labor/equipment: `mode`, `people`, `machineId`, `machineIds[]`.
- Work instruction/QC: `instructionSteps[]`, `productInstructionSteps`, `instructions`, product-specific instruction text, and `ipqc`.
- Media: operation-level media URL/data, name, MIME type, and `mediaItems[]`; optional `productMediaItems` maps each assigned product code to its own media-item array. New raster-photo uploads are normalized client-side to WebP with a maximum 1600-pixel edge before being stored in those existing arrays; video, GIF, SVG, and existing saved media retain their original representation. This remains inside the existing operation JSON and adds no D1 table or shared-state key. Product-specific media is read only for the selected/dispatched product.

An instruction step has `text` and `standard`. This is the current SOP/QC representation; there is no separate SOP or QC table.

### Process Version

Stored in `approvalVersions`.

- `id`, `number`, `category`, `line`, `status`.
- `stages`: complete stage-to-operation snapshot.
- creator/timestamps and optional `parentVersionId`.
- review fields such as `reviewNote`, `reviewerName`, `reviewedAt`, `changeRequested`.
- `history[]` entries with action/label, actor, timestamp, and optional note.

Statuses used by current workflow: `draft`, `pending`, `approved`, `superseded`, and `rejected`. At most one version per category/line is treated as current approved production data; approving a replacement supersedes the previous approved version.

### Product and BOM Source Data

- Base product/BOM data is generated into `public/process/data/imported-data.js` as `window.IMPORTED_DATA`.
- Base line, stage, and product-route data is in `public/process/data/line-process-data.js` as `window.LINE_PROCESS_DATA`.
- C-line master input is in `public/process/data/line-c-master.js`.
- Approved `masterDataControl.active` is applied over these sources at runtime and becomes the authoritative operational catalog.
- `bomOverrides` stores imported/replaced root BOM structures. Legacy values remain a plain SKU map and overlay the generated source. A complete-page BOM Excel import stores `{ __format, replaceAll: true, data }`; runtime loading clears the generated BOM before applying `data`, so omitted SKUs remain omitted after reload.

BOM rows retain source identifiers, names, levels, quantities, units, specifications, waste, and source type as available. Tree relationships are determined by preorder level and contiguous descendants, not by a normalized parent foreign key.

System-exported AB/C master workbooks use `PROCESS_OS_MASTER_PAGE_EXCEL` v2 and include format metadata, products, category groups (including empty groups), lines/stages, unknown-field JSON, and a read-only version-history sheet. Line/stage-only workbooks use `PROCESS_OS_LINE_STAGE_EXCEL` v2. BOM workbooks use `PROCESS_OS_BOM_EXCEL` v2. The format marker distinguishes full-scope replacement from backward-compatible legacy partial updates.

### Dispatch Board

Stored in `dispatchBoard`:

```text
{ A: productCode[], B: productCode[], C: productCode[] }
```

Each line is limited by UI/business logic to three unique product codes. A dispatched product must belong to the line and have a current approved process version consistent with the latest approved route and BOM.

### Backup Settings and Backups

`backupSettings` stores cloud schedule state: `enabled`, weekly frequency, Saturday day number, time, and `Asia/Ho_Chi_Minh` timezone. The local ADMIN backup page can switch its active endpoint between host ZIP backup and this cloud snapshot API; that mode choice is browser session UI state and is not persisted in D1. When cloud scheduling is enabled, an allowed shared-state GET performs an idempotent missed-run check, so the due snapshot can be created when the site is opened even if the backup page is not open.

Cloud snapshots use `state_backups`. Host ZIP backup settings are stored separately in `local-backup.settings.json`; schedule state, audit logs, locks, and the encryption key live under the configured backup directory's `.system` folder. The Windows default is `.local-backups`, overridable with `PROCESS_BACKUP_PATH`. A path-picker capability is reported by the local backend only when the host can safely open one; manual server paths remain available and are validated and created by the backend.

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

- Shared keys are allowlisted and must contain valid JSON.
- Server permissions gate protected key families and approval/deletion operations.
- Active master-data changes require approval; deletion requires `master.delete` and is blocked while relevant reviews are pending.
- Restore enters maintenance mode and prevents normal writes.
- Public API responses remove user passwords.
- Current password values are not modeled as hashes; improving credential storage would be a future data-model and migration change, not an existing capability.

## Local schema and seed initialization

Only existing Drizzle migrations create `shared_state` and `state_backups` in an empty Local D1. Startup checks schema, primary keys and nullability; ordinary reads do not create tables or silently add administrators. The initializer never re-seeds an existing singleton or replaces business data. Existing incomplete demo setup or ID conflicts stop startup for separate review. Non-authentication legacy seed values remain unchanged, but new Local bootstraps from Canonical rather than that legacy seed. Missing current state in a nonempty schema is refused. Local-only config and state are ignored under `.wrangler`; no Production binding is used. 測試階段快捷入口預設開放；正式營運前必須由Frank明確確認關閉。

## Canonical collaboration persistence

IQC check items additionally store optional `inspectionSpecVi`, `inspectionMode` (`visual` or `equipment`), stable `equipmentId`, a server-validated `equipmentSnapshot` (ID, asset/piece marks, name, specification and optional equipment photo digest), and ordered item-specific `mediaItems[]` with private photo digest, source URL and optional note. These photos use the existing `iqc/photos/<sha256>` R2 namespace, but are owned by the check item rather than the part. The Excel `methodVi` is the primary editable inspection method; distinct older `inspectionSpecVi` stays in the snapshot as compatibility data. Legacy Excel `toolVi`, `frequencyRaw` and `rules[]` entries with `cadence: source` remain separate provenance, never inferred into equipment links or formal batch/time options; all rule entries remain in the version snapshot. Formal batch-custom entries use `nameVi` and a nonempty string `value` that may be quantity or prose, whereas the other batch kinds still require a positive number. The Routine Equipment reverse view derives IQC references from the versioned item `equipmentId`, keeping distinct item IDs and approval states; it adds no separate relation table. FQC `rule` batch-custom values now include both `customBatchText` and `customBatchValue` (string, allowing quantity or prose). A shared-state 409 may be rebased only when every key in the attempted batch still equals the previously loaded baseline; a changed same key remains a conflict. Existing D1/R2 bindings, SQL schema and migrations are unchanged.

Schema/bootstrap versions are 1. Domain files have fixed-ID records, optional explicit deletedAt tombstones, stable ordering, and file SHA-256 indexes. Manifest dataVersion is content-derived; generatedAt is unchanged without domain changes. No accounts, identities, passwords, sessions or audit history enter Canonical. Local quality collaboration uses `canonicalQuality` with separate fqc/iqc/ipqc records; existing process-node IPQC fields are preserved separately. Quality applicability remains backward compatible with singular `productId`/`partId`/`stageId` and additionally supports `categoryId`, `productIds[]`, and `partIds[]` for category-level standards and multi-product FQC items.

The Local-only `qualityMasterControl` shared-state value owns the existing FQC and placeholder IQC/IPQC/routine-report collections. Each collection has an `activeVersionId` and complete version snapshots. An FQC snapshot contains independent `errors[]` and `items[]`; items carry immutable check numbers, error/category/line relations, Vietnamese source text, tool, enabled, monthly/quarterly/yearly flags (`isMonthly`, `isQuarterly`, `isYearly`), custom period settings (`isCustomPeriod`, `customPeriodText`), product codes plus typed product/semifinished references, notes, reasons, and ordered `mediaItems[]` with stable IDs, names, types, sources, and per-photo notes. Draft/pending/review identities and history stay private to that Local and are deliberately not projected into Canonical. `data:sync` updates `canonicalQuality` while retaining `qualityMasterControl`; no SQL schema or migration is added.

The IQC workspace uses a separate `iqcMasterControl` JSON value in the existing `shared_state.values` row; the placeholder `qualityMasterControl.libraries.iqc` is not copied or overwritten. Legacy `/api/iqc` writes are fenced once adopted; `/api/iqc/workflow` then owns shared working/save/case writes and performs backend identity/permission checks plus D1 row revision compare-and-swap. It stores one active version ID, immutable historical snapshots, at most one draft/pending version, Excel and category-map SHA-256, import issues, and reserved error/check numbers so deleted numbers cannot be reused. Snapshots contain Vietnamese categories and suppliers; parts with stable IDs, original code, category reference, ordered supplier IDs, raw supplier text, source rows and ordered photo references; errors and check items preserve original codes, names, source rows, tool/method/frequency/source metadata and structured rules. IQC photos are private immutable `iqc/photos/<sha256>` objects in the existing `STATE_ARCHIVE` binding, served by authenticated `/api/iqc/photo`. The generated source manifest and row-anchored static media are preview/import inputs only. The baseline Local import created an unapproved IQC V1 draft with 187 category-assigned parts, 538 errors/items and 185 photos; later Local edits are stored in the same versioned key. No SQL migration, Canonical sync key or remote binding was added.

Routine Equipment uses a separate `routineEquipmentControl` JSON value in the existing `shared_state.values` row, written only by `/api/routine-equipment` using backend identity/permission checks and the row's D1 revision compare-and-swap. Generic shared-state updates cannot write this key. It also holds stable-ID `pendingReplacements[]` records (module, stable item ID, optional AB `scopeKey`, source/target equipment, pending version/revision, reason and waiting/conflict/applied status). `/api/quality-equipment-replacement` reads versioned FQC/IQC/IPQC-C and group-scoped IPQC-AB items and, under backend permission and shared-row CAS, writes only selected draft equipment relations plus necessary equipment snapshots; pending/pending-test links are read-only and no longer enqueue or reconcile deferred writes. Existing waiting records remain historical only. Each scope is atomic; unrelated scopes report independently. All four adopted quality modules use guarded `/workflow` working edits, preserving the prior successful save; mixed AB scopes have independent results and stable scope/item identities. AB preview selection IDs serialize `[scopeKey,itemId]`; persisted records retain these fields separately, and existing other-module IDs remain unchanged. This route preserves each module's other draft fields, reserved codes and approved/history snapshots. Normal confirmation can authorize selected manual draft equipment overrides; the API still requires explicit override IDs and a matching revision. It contains one active version ID, immutable historical version snapshots, at most one draft/pending version, source workbook SHA-256, the original 37-item source list, and persisted reserved `(assetCode, pieceMark)` values (including deleted draft numbers). Each version stores `categories[]` (`id`, `code`, `name`, optional `photoId`), `subcategories[]` (`id`, `categoryId`, `name`, optional `photoId`), group `categoryId`/`subcategoryId`, `name`, optional `spec`, and optional `photoId`, plus versioned issue resolution/status with backend-stamped actor/time. Legacy versions without independent hierarchy are deterministically derived in memory by their source labels; old bilingual fields, calibration channels and source text are retained, not rewritten. Equipment has a stable independent ID, original Excel row/reference/photo-anchor hashes, hierarchy/group references, a single editable `name`, confirmed/enabled flags, calibration code/date/cycle/expiry, quantity fixed to 1, immutable `effectiveAt` after approval, R2 photo digest and optional `photoHidden` so a draft can hide a photo without deleting historical R2 objects. New piece marks are allocated in the same revision-checked D1 update, including workbook imports with stable UUIDs, and never derived solely from current rows. Photos reside under immutable `routine-equipment/photos/<sha256>` keys in the existing `STATE_ARCHIVE` bucket and are served by an authenticated route. Availability requires enabled, confirmed, resolved source issues and valid calibration evaluated in `Asia/Ho_Chi_Minh`. The source manifest and row-matched WebP assets in `public/process/` remain reproducible Local import inputs; they do not create an approved version. No SQL migration, new Cloudflare binding or Canonical sync key was added. FQC and historical process records are not rewritten.

IPQC-C uses a separate `ipqcCMasterControl` JSON value in the same `shared_state.values` row, written by `/api/ipqc-c` for legacy controls or `/api/ipqc-c/workflow` after V3 adoption, with backend identity/permission checks and D1 revision compare-and-swap. Legacy writes are fenced once `workflow` exists. Generic shared-state writes cannot edit this key. It contains a source manifest (workbook name, SHA-256, row count, Local build time), one active version ID, version snapshots (`errors[]`, `items[]`), and reserved error/item codes that survive draft deletion. Error codes reference the existing C-line product and stage codes; each check item references a stable error ID and retains its source row, Vietnamese fields, independent `standardEnabled`/`cpkEnabled`, optional equipment-group reference, optional stable `equipmentId` and server-validated `equipmentSnapshot` for a single active-approved, enabled Routine Equipment item (same selector rule as FQC/IQC), and ordered photo references (`mediaItems[]`, optionally `afterParagraph`). `/api/ipqc-c` lists effective equipment with photo and availability state for inspection-mode choice; only active-approved and enabled new choices can be saved, while unchanged historical links retain their snapshot. V3 working edits and manual saves allow incomplete business fields; submission requires a nonblank description. Structural, identity, photo and equipment rules still apply during editing. The Local source build creates an `origin: initial-build` V1 with no supervisor review event; later draft/pending/approved/superseded versions preserve their own history. New photos are immutable private R2 objects under `ipqc-c/photos/<sha256>` and require authenticated access. The developer-only parser and seed command do not add a browser Excel workflow. The D1 binding `DB`, R2 binding `STATE_ARCHIVE`, SQL schema, and migration set are unchanged; FQC, IQC, and Routine Equipment keys are not modified by the initial build.

IPQC-C items may additionally store an FQC-compatible `rule`: `none`, `batch` (AQL, fixed count, batch quantity, or custom name/value), or `time` (weekly, monthly, quarterly, half-yearly, yearly, or custom text). The API validates structured rules before saving. Historical `frequency` strings remain intact and are never inferred into a rule; new structured items need no duplicate frequency string or duplicate method input. `description` is required at submission; historical `method`, `tool`, `reason`, `notApplicable` and its reason are retained but no longer exposed as duplicate item-editor controls. No field or schema was removed.

IPQC-AB uses its own `ipqcABMasterControl` JSON value in `shared_state.values`, written by `/api/ipqc-ab` under authenticated role checks and a D1 row revision compare-and-swap. Each `line:group` scope owns an active version ID and complete draft/pending/pending-test/approved/superseded/tested snapshots of `errors[]` and `items[]`; test approval never changes the active ID. Stable item/error IDs and persisted reserved codes prevent reusing deleted numbers. Errors reference an effective AB group and stage; item `productCodes[]` are validated against the effective AB product line, group and stage route. Items separately preserve enabled state, visual/equipment mode, equipment ID and snapshot, formal batch/time rules, text, source rows/tool/method/frequency/version/change metadata and ordered standard/method photo references. Equipment selection validates active-approved equipment and enabled state, matching FQC/IQC; category/subcategory/group IDs in the read API derive from the existing equipment hierarchy; specification-group labels in IPQC-AB/C read projections omit legacy independent/candidate decorations without rewriting stored names, IDs or historical snapshots; incremental reimport preserves unchanged manual equipment snapshots, including historical links. Private immutable photos remain in existing R2 under `ipqc-ab/photos/<sha256>`. Optional item `sourceImport` holds a content-derived key (error/context/NFC standard/basic source fields, independent of row order or source numbering), SHA256, source item-code aliases, previous keys and last-source editable-field baseline. Optional error `sourceImport` stores source-name baseline and SHA. New provenance is retained by ordinary snapshot saves; legacy records without it remain readable. Initial seed still cannot overwrite existing control; a separately maintenance-authorized loopback/admin/master.import `reimport` merges group drafts against the current effective catalog and global revision, preserves approved/history snapshots and manual assets, defers ambiguous source/asset ownership, and soft-deletes only confirmed imported untouched items absent from the complete new source. Different standards get distinct reserved codes; shared basic-field conflicts are blocked. Source rows are audit provenance, never a row-sort-derived identity. Latest source SHA is recorded globally and in reimport history, with prior SHA in existing immutable history and pre-write backup. Raw tool/frequency text is not an inferred equipment link or invented rule. No SQL migration or new binding was added. Equipment references scan stable IDs across versions; the cross-module replacement coordinator can update only selected editable group drafts under the same global CAS and pre-write backup, preserving manual assets and other fields. Pending and pending-test scopes reject replacement without queuing, including scopes without an active version. No separate equipment relation table is introduced.

Ignored `.wrangler/local-only/canonical-base.json` holds last-synced domain values/version and last-export hash. Three-way sync rejects unexported or conflicting Local edits. Physical backups preserve complete D1/WAL/SHM/R2 and Local session/base settings; CAS updates revision, retains old R2 snapshots, verifies projection and rolls back failure. Unchanged domains retain Local serialized contents; existing accounts and private version history stay Local. Assets retain source-content IDs/hashes and add web metadata (relative path, SHA-256/content version, MIME, bytes, width and height). assets/web-manifest.json is hashed in the main manifest and includes image tombstones/package version. Verified WebP files enter Git; original content remains outside Git. Local R2 keeps immutable canonical-images/<source-sha>/<web-sha>.webp objects. The Local-only image route streams these objects; bootstrap/sync resolve Canonical references to that route while preserving private uploads and drafts. Unreferenced image objects are retained for recovery, not physically deleted. No SQL schema or bootstrap-version change.

Four layers: Canonical in reviewed main, individual Local D1/R2, an explicitly synchronized separate Staging mirror, and separately approved Production. Git merge changes Canonical only. Complete release materialization reuses the existing shared-state keys/serializer, preserves accounts/private drafts/history and non-managed keys, and appends only missing passwordless demo identities. No SQL table, field or migration is added. Target R2 retains immutable images and snapshots; `<environment>-canonical/latest.json` and revision/content-specific checkpoints store Canonical domains, dataVersion/generatedAt and managed hashes for conflict/tombstone checks. Reviewed image references use generated static copies of the same R2 WebP bytes; the Local image API stays loopback-only. Full D1 SQL exports are ignored private artifacts, and pre-write logical snapshots use state_backups. See DEPLOYMENT.md and LOCAL_DATA_COLLABORATION.md.
