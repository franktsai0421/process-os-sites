# Local Canonical collaboration

`data/canonical/` is the reviewed, shared business baseline. Git merge updates this package, not any database. Each computer owns its ignored Local D1/R2. Staging is a separately synchronized test mirror; Production requires its own approved complete release and remains outside Local data commands.

Private complete snapshot replacement is a separate opt-in, stopped-target flow documented in [offline snapshot updates](../docs/local-integration/OFFLINE_SNAPSHOT_UPDATE.md). The f722 isolated TEST flow has scoped full-capacity update, repeat, refusal and recovery proofs; these do not authorize updating the original rev495 business snapshot with existing pending/drafts. Canonical projection, sync and export contracts remain unchanged. Normal shutdown and final package acceptance are separate current gates recorded in [HANDOFF](../HANDOFF.md). Normal supported storage openers hold a lifetime lease on update-enabled targets and refuse incomplete transactions or `.u1s` staging. Unknown SDK or native SQLite closure retains the lease. These controls are cooperative entry guards, not an OS access boundary for raw Wrangler or historical tools.

## First clone

The Local TypeScript loader resolves imports relative to each loaded source file. A copied test/bootstrap workspace that includes `lib/user-access.ts` must also include its real `public/process/access-policy.mjs` dependency; do not substitute a permission stub. See [the 2026-10-14 upload record](../docs/local-integration/20261014-github-upload.md).

Restore verification keeps exact data/WAL/media hashes and SQLite integrity/table comparisons. A read-only SQLite connection can change D1 `-shm` read marks; classify that specific transient metadata separately and inspect copies, retaining the immutable backup. A volatile SHM difference is not permission to ignore database or business-content changes.

```sh
npm install
npm run dev
```

Open the printed `127.0.0.1` URL with `/process/`. Only an empty Local schema receives the checked-in Drizzle migrations, the latest validated Canonical package and three passwordless demo identities. Restart verifies existing state without resetting it. Missing state in an existing schema, incomplete demo identities, conflicting IDs or initialization failure stop startup. Ordinary reads never create tables, seed state or inject an administrator. Existing Local databases require the explicit revision/hash-pinned `scripts/local-feature-upgrade.mjs` before enabling feedback/session revocation; the server stays stopped and an independent SQLite backup is retained. See [the 2026-10-09 integration record](../docs/local-integration/20261009-3020-to-3000.md).

**測試階段快捷入口預設開放；正式營運前必須由Frank明確確認關閉。** Unset/true allows demo; false rejects login and previously signed demo Sessions. Names, positions and role permissions of all three shortcuts stay unchanged.

## Work on approved data

Stop the Local server before CLI export, sync or physical backup. Quick-entry errors retain their existing message position and scroll into view with an alert role on mobile.

```sh
npm run task:status
npm run task:start -- data/work-name
# Restart dev, change and approve business data, then stop dev.
npm run task:submit
```

`task:start` requires clean Git and exported Local data. Without a remote it explicitly reports 尚未連接GitHub, switches local main, safely syncs initialized Local data and creates the requested branch. It does not pretend to pull. With a remote configured, this version refuses automatic network operations: an authorized user must first switch main, pull, sync, then create a branch. No CLI here uploads or deploys.

`task:submit` exports, validates relations, scans files and prints status/diff statistics. Review, commit, push and create a PR yourself when separately authorized. Frank reviews and approves. After merge, colleagues pull main and run `npm run data:sync`. Production never changes because of merge.

## Package format and versions

Domain files contain fixed-ID records, stable field ordering and records sorted by ID. `.gitattributes` keeps Canonical files as LF on Windows Git checkout so manifest hashes remain valid. Manifest schema/bootstrap versions describe compatibility; `dataVersion` is a digest of domain-file SHA-256 values. `generatedAt` changes only when package content changes. Same data exported twice produces identical files and versions.

Products, categories, lines, stages, parts/BOM, process templates, approved/superseded process and master versions, dispatch, role templates, settings, quality and asset indexes are separate files. First-version legacy names are resolved once to deterministic IDs; materialized records carry IDs thereafter. BOM level-zero rows with blank component codes use their root product code. All approved business records are retained, including manufacturing test equipment; drafts, accounts, identity fields and operation/audit history are excluded.

`quality/fqc.json`, `iqc.json`, `ipqc.json` accept fixed `id`, `productId` or `partId`, optional `stageId`, and non-sensitive standards/code fields. Local CLI storage uses `canonicalQuality`; these are Canonical collaboration records, separate from the implemented quality workspaces and dedicated controls described in [QUALITY model](models/QUALITY.md). Existing process-node IPQC remains in approved process versions. Do not assume Canonical quality export includes every dedicated draft/workflow body.

Delete through an explicit `deletedAt` tombstone in the corresponding domain record. Mere absence is rejected on export and never deletes Local data on sync. References to deleted or missing products, parts, stages or graph nodes are rejected. After a manually resolved business merge, `npm run data:manifest` validates domain files and regenerates derived manifest hashes; it never chooses between conflicting business records.

## Export and three-way sync

`data:export` reads Local logical state, excludes private data, validates relations and reports added/updated/deleted/unchanged/conflict counts. It performs no Git writes. Generated manifests are stable without business changes. It records a Local-only last-export digest; the last synced base remains separate.

`data:sync` compares Local projection, the last synchronized base and incoming Canonical by domain and ID. Unexported edits block it. Different edits to the same record stop with conflict classifications and hashed IDs. Missing records do not mean deletion. Before applying updates it closes runtime and verifies a physical backup of D1/WAL/SHM, R2 metadata/blobs and Local signing/base settings under `.wrangler/local-only/backups/`. The revision-conditional write retains prior R2 objects. Verification failure restores the backup and retains failed storage separately for diagnosis. A restoration failure is a hard stop. Repeated sync safely updates metadata without resetting business data.

Legacy formal accounts and drafts remain Local and never enter the package. Unchanged managed domains retain their exact Local serialized values. When approved versions are updated, excluded identity/history fields remain Local. Never run these tools against an active writer; use one Local server/CLI operation per project at a time.

## Offline runtime and assets

Project `.npmrc` disables npm's own update notifier, including the parent CLI of `npm run dev`. Dependency installation remains a separate phase; offline verification uses its populated cache and disables audit for that run only.

Installed Miniflare supports `CLOUDFLARE_CF_FETCH_ENABLED=false`, selecting its built-in Request.cf fixture. Local tooling sets it before loading Wrangler/Cloudflare, disables telemetry/error reporting, binds 127.0.0.1 and uses a generated configuration with fixed Local bindings and `remoteBindings:false`. Node guard rejects non-loopback fetch/TCP/TLS/DNS/UDP and writes only host, port, protocol, PID and time under ignored `.wrangler/local-only`. It does not replace an OS firewall or claim packet-level auditing of native/browser processes. The launcher uses the public ViteDevServer HTTP server and directly listens on loopback, avoiding Vite 8's wildcard port probes without network-refusal errors in normal startup. No node_modules patch is used. Dependency installation is the separate network-requiring phase; dev, data tools and verification use installed dependencies.

Canonical references assets by source content digest and versions metadata-stripped WebP in assets/web with assets/web-manifest.json. The initial reviewed package contained 205 verified Web images (~7.92 MiB); fresh clones import the images in their checked manifest into Local R2 and display them through the loopback-only image route. data:export creates Web images/versions and explicit tombstones when the last Canonical reference is removed; history references retain their images. data:sync imports images inside the existing backup/rollback and unexported-change gates. Restart/repeated sync verify existing immutable objects without overwriting Local uploads. Same-ID source/Web hash conflicts, corrupt/missing bytes and oversized packages fail closed (2 MiB/image, 25 MiB/package). Original high-resolution assets, videos and R2 blobs stay private. No Production download occurs.

Legacy INTEGER PRIMARY KEY is checked as the rowid alias, including SQLite PRAGMA's notnull representation. A legacy TEXT backup PK lacking explicit NOT NULL is allowed only with no NULL/duplicate IDs and reports LEGACY_SCHEMA_WARNING. Existing migrations/schema are not rewritten; new clone uses their explicit correct constraints.

## Release routing

Full releases and explicitly data-preserving maintenance releases use [DEPLOYMENT](../DEPLOYMENT.md). This file owns Local Canonical collaboration, not duplicate deployment checklists. No release is implied by a local edit or Git merge.

## Safety and recovery

Never commit `.env*`, `.dev.vars*`, sessions, SQLite/WAL/SHM, R2 storage, backups, archives, logs or diagnostic/test output. Use `npm run safety:scan` and `npm run data:validate`; the pattern scanner is a gate for known secret formats, not a guarantee that arbitrary free text is non-sensitive. Review new business fields/media before export. Do not copy old Git history into a clean candidate.

Validation commands: `test:demo`, `test:local-schema`, `test:local-init`, `test:canonical`, `test:data-merge`, `test:task-safety`, TypeScript and `build`. All database mutation tests use disposable fixtures. Existing Local conversion or workflow adoption requires applicable authorization and current-state checks; an isolated rehearsal does not authorize applying it back.
