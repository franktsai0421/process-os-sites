# Import contract repair and current source validation

The only registered test Site is `appgprj_6ad9abaff47c8191846eb9821034696b`.
Its identity is retained with D1 `DB` / R2 `STATE_ARCHIVE`. The parent created it;
this executor has not created another Site, pushed source, uploaded data, set
credentials, changed its audience or deployed it.

## Contract repair

`verify` and `restore` use `expectedVersion` for existing compare-and-swap checks.
Their JavaScript default options caused TypeScript to infer only `limit`, leading
to TS2353 at the two correctly formed route calls. Explicit JSDoc now describes
`expectedVersion?: number` and `limit?: number`; no `any`, suppression or guard
removal. Existing missing/stale-version refusals remain. Audit initialization
can use the server's initial version; completed verification remains idempotent.

An additional post-import export regression exposed the retained transport
manifest/chunks being classified as business R2 objects. Export now recognizes
only the exact reserved `process-import/v1/<64-hex>/manifest.json` and
`.../chunks/cN` grammar. It excludes these duplicate transport payloads while
retaining all actual business/current/history/image objects. Unknown reserved
layouts refuse; this is not a generic skip of unknown or historical objects.
Original source inventory/path/encoding/chunk/capacity checks remain.

Activation refuses a disabled source owner and a legacy `__processR2` user
envelope: that decoder takes users from the immutable body, so an inline
credential overlay cannot establish a working owner login. The latter needs a
separate reviewed adapter; do not rewrite immutable history or claim it works.
The same refusal applies to `__processRecords` owner storage: its real decoder
loads the users record, not the proposed inline credential overlay.

The new post-import export regression also exposed that the existing Snapshot V1
transport preserves original immutable names after credentials are scrubbed;
its existing isolated-local restore performs the reference/hash rebuild. Hosted
audit now explicitly refuses mismatched content-address names before copying.
Positive hosted fixtures first use that existing rebuilder with synthetic local
bindings, then export a normalized Snapshot V1. They are not raw/true R1 evidence.
Direct selected R1 upload therefore still needs a reviewed bounded normalization/
reference-plan adapter (prefer a delta or virtual view over another full payload
copy), plus record-owner credential activation support. Neither is claimed ready.

## Implemented source and default-off endpoint

`/api/snapshots/import` is separate from the unchanged generic snapshots POST
(405). It defaults to 404 until `PROCESS_IMPORT_ENABLED=1`. Every operation needs
the configured target origin, exact owner ID, target fingerprint and manifest
SHA; normal own-account admin session and `master.export` are required. Mutations
also require exact same-origin headers. Missing/fabricated platform identity
headers grant nothing. No token-based public bootstrap was added.

The D1 ledger binds target/project/owner/manifest. Immutable conditional R2 puts
accept only descriptor-pinned <=1 MiB chunks. Paginated missing receipts, version
CAS, bounded readback verification and new service instances support resume.
Lost acknowledgement preserves bytes. Changed bytes, missing objects, expired
sessions/generations and unknown formats fail with fixed error codes.

Semantic audit processes one logical resource per call using existing bounded
JSON/stream/feedback STORE ZIP and image/reference validators. It retains current
and historical rows, duplicate references, account/role fields and private media
ACL mappings. It refuses credentials or noncanonical data instead of changing
the pinned transfer bytes. The hosted profile presently refuses chunk-manifest/
chunk-pack resources; the separate local adapter's earlier support is not hosted
import acceptance.

Copy materializes only audited objects. Small writes are conditional; large
objects use persisted multipart IDs/parts and bounded parts. Lost part receipts
retry the same part. An interrupted create with no upload ID is explicitly
uncertain and will not create another orphan automatically. Partial work stays
retained; no automatic deletion or quota cleanup is authorized.

Restoration writes bounded row batches. The opt-in application proxy keeps
business pages/APIs/media unavailable until the durable activation marker.
Login/import/program assets and Sites reserved sign-in paths retain their proper
handling. The normal default-off application path remains unchanged.

For the supported inline-user profile, activation requires an explicitly
configured authentication-only owner row in
maintenance mode, with no company content. It preserves that target owner's
configured verifier only when the same enabled admin identity exists in the
scrubbed source, bumps authEpoch, reconciles restored rows, and activates through
D1 CAS. This is not migration of employee credentials. A blank target without
configured owner credentials stops at data-ready with the gate closed. No real
owner row/signer was configured or read here.

## Fresh-target migration candidate

`db/sites-fresh-schema.ts`, `config/sites-fresh.drizzle.config.ts`, and
`drizzle-sites-fresh/` contain a separately generated schema-only baseline and
append-only activation-ledger migration (ten tables total). No seed INSERT/DML;
legacy constraints/indexes and three business table columns are preserved.
The existing `drizzle/` history and its empty singleton initialization remain
unchanged. These candidates were applied only to in-memory fixture SQLite.

**Not yet adopted by the publication packager:** the installed Sites helper
copies root `drizzle/`. Before first hosted save, confirm the actual target has
no applied migration history and select the fresh baseline in its reviewed
Site-bound publication source. Do not silently edit applied migrations or assume
the ordinary local build selected this candidate.

## Source authentication and remaining acceptance

The platform returned `http_extra_header` access for its dedicated source Git
branch `main`. The project's own pre-push guard rejects current main or a source/
destination main ref, independent of remote URL. This is a project rule, not a
new tool-policy denial; no bypass or push was attempted.

Installed Sites 1.1.1 `site-workflow.mjs` supports that mode: a native credential
object stays in session memory and enters its hidden terminal stdin; the helper
passes authorization to Git transiently, without source files or persistent auth
configuration. No token should enter chat, argv or a file. This executor cannot
read a credential already held in the parent's memory. When source access is
authorized and the main rule has a disposition, the official same-Site credential
tool and local helper can run in the same tool context; refresh only that Site's
short-lived access when necessary. No custom inter-thread secret relay exists
or was created here, and no credential tool was called.

The latest type/unit/build receipts are stored outside source in the parent task
with their exact source hashes/commit. Intermediate 17/17 and older efaedbd
application HTTP results are not proof of this later program version. No true R1
rerun, real DB/R2 import, employee credential migration, hosted runtime/gate,
browser/iPhone QA, source synchronization or publication acceptance is implied.
Hosted staging plus materialized objects may temporarily approach two payload
copies; actual quota/cost and cleanup require target-specific review. A complete
true hosted import/export and per-request CPU/subrequest behavior remain untested.
