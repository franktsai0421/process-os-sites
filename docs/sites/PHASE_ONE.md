# Sites derivative — phase one

## Implemented in this copy

- Sites binding template: `DB` / `STATE_ARCHIVE`, no project ID or credential.
  Independent test/formal runtime templates disable DEMO and old release access.
  They do not create resources or change sharing policies.
- `/login` is a public Traditional Chinese/Vietnamese account form using the
  existing `/api/platform-login`. It does not use or redefine the Sites reserved
  sign-in, sign-out or callback routes. The existing SPA follows successful login.
- DEMO is closed when unset; normal passwords, existing HMAC sessions, authEpoch,
  disabled users and session revocation remain. Hosted identity requires an
  application session; Sites/admin headers cannot bypass that requirement.
- Login requests have an 8 KiB limit and five-minute D1 counters (30 per address,
  15 per account). Only digests are stored. New schema-only `0003_login_limits`
  is appended to the journal; public requests never create tables. Missing counter
  storage fails closed. Nothing was migrated or enabled on a real account.
- Shared-state GET authenticates before full business hydration and projects
  authorized modules. Generic media reads require a reference in that projection.
  New private image responses are no-store. Existing workflow/CAS/backup guards
  remain. This is not acceptance of every role/line combination.
- Company static datasets/images are absent from public source. Their old URL
  paths now use authenticated route adapters. A future trusted importer must write
  `company-assets/index.json` and immutable `company-assets/objects/<sha256>` in
  the target's private R2. Index entries include exact URL, size, MIME, digest and
  explicit `.view` permissions. Missing imports return 404; invalid index fails
  closed. Public source checks reject reintroduced company data folders.
- The authoring BOM reader requires a complete `bomOverrides.replaceAll` baseline;
  it does not silently substitute an empty or bundled company BOM. Sparse legacy
  data needs an explicit reviewed migration before authoring can proceed.

## Snapshot interface

`lib/snapshot-contract.mjs` supplies V1 export/import ports with pinned code
commit, source revision, schema fingerprint, bounded 1 MiB chunks, SHA-256,
resource coverage/order, object metadata, source-change refusal, completion and
staging-abort semantics. Credential policy is `excluded`; the future runtime
export adapter is responsible for scrubbing all current/history/R2 account
verifiers and private credentials before asserting this policy.

Import accepts only an empty `isolated-local` adapter with the same schema.
It has no hosted-target implementation and no automatic return upload path.
The fake adapter tests keep all payloads in memory.

`GET /api/snapshots` exposes this contract only to a normal, non-DEMO ADMIN with
existing export permission. `?action=export` returns 501 while a real, bounded,
credential-scrubbing D1/R2 adapter is absent. POST returns 405. These explicit
responses are not a working production backup or R1 importer. The offline
`snapshot:inspect` command validates a manifest without importing it.

## Verification and remaining work

Fixture results and scoped type-check evidence are in the parent task directory.
Only Node VM handlers, pure functions and fake storage were used. The compiler
was read from an existing installation; dependencies were not copied/installed.

Not run: full install/build, Miniflare/Workers runtime, D1 migration application,
browser/desktop/iPhone UI, real account login, full 8 GB export/restore, R1 import,
Site source synchronization or deployment. No existing G3/C1/MF denied operation
was retried. Old test windows/quotas were not reused.

R1 remains the separately retained 2026-10-14 rev495 → curated496 package. No R1
payload was read or imported during implementation. Existing account verifiers
are not supplied by that scrubbed package: a separately authorized compatibility
migration is still needed to use existing website passwords. No reset, new
account or production secret was created here.

The new local source intentionally refuses automatic Local startup/seeding.
The supported local snapshot runtime adapter and restore acceptance must be
implemented before development startup; do not remove that guard or copy an old
Canonical package to make startup pass. Old CF publication commands fail with a
Sites-workflow explanation. Legacy `0002` migration seed compatibility with Sites
must be resolved without rewriting already applied migration history.

Future authorized publication must map one reviewed GitHub commit to each Site's
own source commit/version, keep distinct DB/R2/session settings, validate the
test Site with Frank, and then publish the same program to the formal Site.
Test data is never promoted with the program. Platform access/sharing and
existing sites/repositories remain unchanged.
