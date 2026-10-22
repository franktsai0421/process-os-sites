# Phase eighteen: normalized initial-import source

This derivative continues phase seventeen. No remote source, Site publication,
real credential setup or production import is authorized by this document.

## Content addresses and preservation

`snapshot-normalize.mjs` rebuilds content-address names and all known current,
historical and feedback references after credential removal. It preserves original
source/curation provenance, business row identities and account/role fields.
Every source object maps to a checked target. Equal canonical payloads may share
one target only when target metadata agrees; original ETags remain provenance.
Missing, conflicting, cyclic, unknown or corrupt resources fail explicitly.

`normalize-snapshot-view.mjs` consumes the already verified local Snapshot V1,
not the original R1 ZIP. Its new directory holds bounded replay recipes, manifests
and receipts rather than a duplicate image/chunk store. Each source read is pinned;
output audit checks hashes, canonical names, all rows/history, accounts and image
coverage. COMPLETE is written only after that audit. Stopped owned outputs retain
their partial recipes; ambiguous RUNNING outcomes require inspection, not blind
restart. The view depends on the unchanged original snapshot directory.

Plan metadata is private data and must stay outside source delivery. The CLI
requires a clean real program commit; a source fingerprint is not a commit.

## Target owner and application login

Initial activation retains only the separately configured target owner's verifier.
It does not migrate source passwords, tokens or employee credentials. Account IDs
follow normal login case folding while source business fields retain their IDs.
Disabled, deleted, DEMO, ambiguous and non-admin owners refuse activation.

For `__processRecords`, activation writes a new immutable users record and updates
the consumed reference. For `__processR2`, it streams a replacement root, rekeys
it and updates that reference. Inline-only overlays are insufficient for these
decoders. Shared bounded multipart code records progress and verifies readback;
the company-data gate stays closed until the final database CAS succeeds. Old
owner sessions are invalidated by an increased authentication epoch. This is own
application login, not a new OAuth system or trust in Sites request headers.

## Fresh Site source profile

The installed official packager selects root `drizzle`. `sites-fresh-source.mjs`
therefore materializes a new source-only projection from one real commit: original
applied migration bytes remain archived under `drizzle-legacy-history`, while the
separate ten-table schema-only candidate becomes the view's active root `drizzle`.
The original checkout's applied history is unchanged. A SOURCE-PROFILE receipt
pins both original commit and projection. No Git repository, credential, data,
dependency tree or platform migration is created by materialization.

The projected source still needs its own reviewed Site-bound Git identity before
publication. The existing main-push guard remains unchanged; creating another
checkout or using no-verify is not its disposition. Local validation may reuse
the exact installed ancestor dependencies only when declared version and lock
bytes match. It never installs or upgrades dependencies.

## Evidence boundaries

Phase-eighteen receipts outside the repository distinguish synthetic unit checks,
actual compiled HTTP, source projection/packager checks and any private real-data
view audit. A stub packager fixture is not the built app. A normalized real-data
view is not a restored database, functioning real account or accepted Site.
Original ZIP conversion evidence remains phase nine and is not rerun here.

Remaining platform steps are parent-controlled: resolve exact main-source guard,
establish reviewed Site-bound source, use supported ephemeral authentication,
apply fresh migrations to the confirmed empty test target, configure target owner
and signer with explicit security authorization, then transfer pinned chunks and
verify activation/login/roles. No secret is passed through conversation or files.
Test remains Frank-only; formal target is separate with public entry and protected
company APIs/images/writes. No automatic local-to-production data return exists.
