# Static closure — source/schema pin and remaining bridges

Historical pin: [phase six](PHASE_SIX_LOGICAL_BRIDGE.md) implements the explicit
logical core, private image mapping and commit guard, while preserving the real
descriptor/outer-archive evidence gap. The phase-five hash is not the current
modified-source hash.

This is a static inventory after [phase four](PHASE_FOUR_INTEGRATION.md), not
runtime, build, platform or real-data acceptance. No program, dependency or SQL
change is made in this checkpoint. The only copy changes are this document and
the handoff link; evidence files live outside the copy in the parent task folder.

## Exact source and schema evidence

`sites-source-freeze-phase-five.json` in the parent task directory records every
regular file's relative path, byte length and SHA-256, plus a deterministic tree
digest. It includes current documents and the package lock. It is a source-tree
fingerprint, **not** a Git commit, build artifact hash or release authorization.
The copy has no Git metadata. M1
`7f5dc57239d6db483f096d96df6bd6cdd7357f5a` remains the previously verified
baseline; this checkpoint does not inspect current 3000 or run a Git command.

The receipt separately pins schema sources (`db/schema.ts`, all four journaled
SQL migrations and Drizzle metadata) and the Snapshot V1 transport table contract.
These hashes have different meanings:

- SQL/schema-source hash: exact files describing intended schema, constraints
  and indexes. No database was opened or inspected and no migration was applied.
- Snapshot contract hash: three exported table names and ordered column lists;
  it is not a live-schema or migration-version hash.

Declared schema has `shared_state`, `state_backups`, `web_feedback_store`,
`process_revoked_sessions`, and `process_login_limits`. Snapshot V1 exports the
first three. Source revocation tokens and login-attempt counters are not moved;
an eventual fresh destination needs migrations 0000–0003 before login gates can
work. SQL 0002 also inserts an empty feedback singleton; the local import code
only removes that exact empty placeholder in its newly created private stage.

`sites-static-audit-phase-five.json` pins the four existing R1 metadata documents
read here. Archive sizes/hashes and earlier validation claims are attributed to
those documents; the archives were not rehashed, unpacked or revalidated.

## Sites configuration / build / authentication

| Area | Confirmed in source | Gap / required next step |
| --- | --- | --- |
| Registration | `.openai/hosting.json` declares `DB` / `STATE_ARCHIVE`, with no Site ID | Not registered. Actual Site IDs, source binding and data resources are platform operations |
| Test/formal split | Templates specify `process-os-test` Frank-only and `process-os` public login entry; independent bindings are an intent | Templates do not provision bindings or apply access settings. All deployment URLs must still be treated as production |
| Build | `npm run build` -> source-boundary check -> guarded vinext build; Vite imports vinext, Sites and Cloudflare plugins and retains authentication/output audits | Not executed. No `node_modules` or compiled `dist` is included in this copy; build/runtime dependencies and generated config remain unverified |
| Worker configuration | Non-serve Vite branch supplies `nodejs_compat`, `DB` and `STATE_ARCHIVE` using placeholder resource names/ID; local worker config separately pins `2026-05-15` and `remote:false` | Hosted branch has no explicit compatibility date in this source. Actual platform-generated compatibility/bindings must be inspected later, without substituting local placeholders |
| Startup | `dev` launches the guarded local server; `start` invokes Wrangler against generated `dist/server/wrangler.json` | Both start runtimes and are outside this checkpoint. There is no root Wrangler config or generated dist to validate as a deployed target |
| Normal login | `/login` + `/api/platform-login` retain the existing account/password verifier and signed application session; DEMO defaults false | No source account verifier or real signing configuration is present/migrated. `dataReady` does not imply `authReady` |
| Gates | Templates request session revocation `1`; login limiter uses D1 and fails closed on errors | Fresh target must contain tables 0002/0003; enabling flags alone does not initialize them |
| Intent-only variable | Templates contain `PROCESS_AUTH_MODE: platform`; the reviewed auth implementation does not read this variable | Do not present that template field as enforcement. Hosted enforcement is the application session/role code; document/remove the unused field or validate it in a later small source-only change |
| Export version | Export requires `PROCESS_PROGRAM_COMMIT` to be 40 lowercase hex digits | Templates currently omit it. Record it as a required reviewed-version input; do not fill a dummy SHA or substitute the 64-character tree fingerprint |
| Media | Private static routes require an authenticated role and `company-assets/index.json` in R2 | R1 static media needs a converter that builds the index and explicit role ACLs while preserving legacy URLs; no real index was created |
| Feedback | Vite's local feature settings do not configure a hosted environment; templates do not set `WEB_FEEDBACK_ENABLED` | Feature availability remains to be explicitly specified/configured; do not silently enable it during migration |
| Release | Old staging/production/sync commands deliberately refuse; package postinstall can configure local Git hooks in a future Git checkout | Do not use legacy commands or run install in this checkpoint. Future GitHub and Site-bound source Git need an explicit reviewed synchronization step; arbitrary GitHub is not a one-click Sites release |

Public Site sharing and application login remain separate. Employees need the
application access assigned to them; this plan does not require a ChatGPT
account for every employee. No explicit application routes named
`/signin-with-chatgpt`, `/signout-with-chatgpt` or `/callback` are to be added or
overridden. Actual platform route dispatch remains untested. Missing Sites
identity headers do not grant a user identity.

## R1 outer-package gap

Existing R1 `VERSION-MATRIX.json` identifies a source-only program/data pair,
2026/10/14 parent rev495 curated to rev496. Its 64-character original source
fingerprint is a different measure from M1's 40-character Git SHA; compatibility
with the modified derivative is not established by either identifier alone.

Documented data archive: 1,781,028,009 compressed bytes; 1,734 logical objects
totalling 8,133,120,116 bytes, 100 history rows and 306 static media. These figures
are not a D1 database size. Documents retain draft/pending state and explicitly
require direct-overwrite update refusal. Do not clear history/pending state,
rewrite old status/release markers or substitute the separate QA dataset.

The reviewed old `dev-package-restore.mjs` / `u1-package.mjs` source expects
`PROCESS_OS_PRIVATE_DEV_PACKAGE_V1_PROTOTYPE`, `manifest.json`, `database.json`
and `objects/<sha256>`; it also checks provenance/dependency/manifest pins.
Its table contract includes source revocation rows. New Snapshot V1 instead
expects a complete chunk manifest and hashed transport chunks for three business
tables, with a fresh-local-only target. The old tools call SDK/native storage,
leases and restore/update machinery: **they are not the format-only bridge and
will not be invoked as an alternative path**.

Missing pure-code bridge:

1. Define a virtual member-reader for the old logical package; validate its
   metadata pins, row/column contract, object sizes/hashes and complete inventory
   before emitting Snapshot V1. Handle security-table exclusions explicitly and
   preserve all business revisions/history/references. Retain the original R1
   document hashes as provenance rather than manufacturing an approval marker.
2. Convert each legacy logical object's named key/content/metadata through the
   existing JSON/STORE feedback/chunked codecs with bounded reads. Build a
   complete mapping for static-media destinations and company-asset ACL index;
   reject ambiguous/missing paths or permissions rather than guessing an ACL.
3. Add representative synthetic old-package fixtures for the conversion only,
   including hash/path/duplicate-member/unknown-format/missing-object refusal and
   interrupted output. Reuse the established snapshot mock pipeline; do not rerun
   unrelated release suites or start the old restore/updater.

The real outer ZIP's entry-root layout, compression/ZIP64 features, exact inner
manifest schema/status and static-media member mapping were not inspected here.
Existing program readers describe an expected old package; that is not proof
that every real R1 member matches. Do not assume the feedback STORE ZIP codec
also accepts the outer 1.78 GB delivery archive, or add a generic decoder based
on that assumption. A true Sites first-data importer is also absent: the hosted
snapshot API continues to return 405 for import and has no automatic local-to-
production upload path.

## Smallest next step and authority boundary

Within current source-only scope: specify/implement the logical R1 member-reader
and converter with synthetic inputs, add explicit required runtime-value
documentation (`PROCESS_PROGRAM_COMMIT` and schema gates), and resolve the
intent-only configuration field. No real package or platform is needed for
those source changes. This checkpoint does not begin that implementation.

Separate authorized actions are still required for: inspecting/processing real
R1 archive members, reading or migrating real account verifiers, creating
signing secrets, invoking SDK/native runtime (after checking the unchanged prior
denials), building/installing dependencies, initializing any real DB/R2,
registering Sites/repositories, assigning sharing/resource permissions,
transferring real data or publishing. Scope each to the exact isolated target
and operation; current manifests or synthetic PASS grant none of these actions.

No new functional tests were needed or run for this documentation/fingerprint
checkpoint. Phase-four synthetic evidence is reused with its stated limits.
No new policy denial occurred; G3/C1/MF and D-drive Git/CIM boundaries are not
retried. A supplemental source-excerpt command returned exit 1 with only the
known PowerShell provider warning; it was not retried, and the required old-format
identifiers above had already been obtained from an earlier successful source
read. No runtime, ZIP payload, account data, network or remote mutation was used.
