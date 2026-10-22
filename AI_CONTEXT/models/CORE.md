# 核心業務資料欄位

## 2026-10-07 群組路線相容欄位

主資料 categoryGroups[].defaultStages：有序工段陣列；未設欄位表示舊資料只讀推導同群組全部產品工段聯集建議（優先產品順序、矛盾依主檔顺序），null表示明確移除預設。products[].routeMode 為group或exception；group的stages必須與群組defaultStages一致。products[].stages仍是所有下游的有效路線，歷史快照不重寫。無SQL schema migration。[完整規格](../../docs/specs/current/GROUP_ROUTES.md)。

狀態：Current source reference；2026-10-05由原DATA_MODEL拆分，無schema變更。需求與實作不同時見[規格](../../docs/specs/current/README.md)。

## Core Entities

### Platform User

Stored in `platformUsers`.

- `id`: login identifier and stable user key.
- `name`: display name.
- `authMode: "demo"`: marks the three fixed test identities (`demo-admin`, `demo-rd`, `demo-staff`); these users contain neither `password` nor `passwordHash`. Names are Demo Admin / Demo RD / Demo Staff.
- `password`: legacy compatibility only; login never rewrites it. Explicit approved migration verifies the original secret, replaces it with `passwordHash`, and increments `authEpoch`; real migration is not yet applied. Neither field appears in public projections.
- `passwordHash`: validated scrypt format; salted on creation/change, never returned or audited. DEMO stays passwordless.
- `authEpoch`: fresh session claim must match; password, role/permissions, disable and logical delete invalidate previous sessions.
- `accessOverrides`: only explicitly touched per-cell booleans; null/reset removes the override to inherit.
- `deletedAt`: logical deletion; stable ID/history retained and ID cannot be reused.
- `role`: existing `admin`, `rd`, `staff`, custom ID; no ID-based coercion. Exact enabled formal ADMIN `frank` is primary; DEMO cannot be primary.
- `enabled`: whether login and authenticated operations are allowed.
- `inheritRole`: when true, the role template supplies the user's scope; when false, individual scope fields are used.
- `lines[]`: retained legacy production-line metadata; no longer a platform AUTH boundary.
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

2026-10-06 adds optional `ipqcAssignments[]` inside the existing operation JSON: `{source:'AB'|'C', scope, itemId, sourceVersionId, productCodes[]}`. AB scope is `line:category`; C scope is `C`. Ownership uses source + scope + stable item ID within each workspace/stage/version; source version is provenance, not part of the occupancy identity. Applicable products are the intersection of the node products, current route and source item products. Unchanged historical links survive invalid sources/product changes with advisories. Legacy `ipqc` and older query settings remain untouched; there is no automatic backfill. No D1 table, shared-state key or migration is added. Reverse references are derived from persisted process working/version snapshots and never written into quality items.

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

Statuses used by current workflow: `draft`, `pending`, `approved`, `superseded`, and `rejected`. Legacy approvalVersions uses one current approved version per category/line. Adopted authoring uses one whole-platform effective version; its snapshots contain all category/line workspaces. A replacement supersedes the prior effective version without rewriting fixed cases.

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

Each line is limited by UI/business logic to three unique product codes. A dispatched product must belong to the line. Legacy readiness checks and adopted effective-platform projection differ; approved advisories do not certify executable content, and individual unexecutable paths remain guarded. See PROCESS_WORKFLOW and modules/PROCESS.

### Backup Settings and Backups

`backupSettings` stores cloud schedule state: `enabled`, weekly frequency, Saturday day number, time, and `Asia/Ho_Chi_Minh` timezone. The local ADMIN backup page can switch its active endpoint between host ZIP backup and this cloud snapshot API; that mode choice is browser session UI state and is not persisted in D1. When cloud scheduling is enabled, an allowed shared-state GET performs an idempotent missed-run check, so the due snapshot can be created when the site is opened even if the backup page is not open.

Cloud snapshots use `state_backups`. Host ZIP backup settings are stored separately in `local-backup.settings.json`; schedule state, audit logs, locks, and the encryption key live under the configured backup directory's `.system` folder. The Windows default is `.local-backups`, overridable with `PROCESS_BACKUP_PATH`. A path-picker capability is reported by the local backend only when the host can safely open one; manual server paths remain available and are validated and created by the backend.
