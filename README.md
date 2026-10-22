# Process OS — isolated Sites derivative

Private source-only Sites derivative. Business snapshots and credentials are
maintained separately from this repository.

Base: selected M1 `7f5dc57239d6db483f096d96df6bd6cdd7357f5a` (six original commits,
preserved in their original location). The independent derivative's full history
is retained. Frank reviews and merges work-branch PRs; uploading a work branch
does not update `main` or publish a Site.

The existing test Site `process-os-test` is intended for Frank only. The separate
formal target `process-os` is intended to have a public entry with normal
application authentication and server role checks protecting company data,
images and writes. Templates grant no platform access. The test project's identity
is already recorded in `.openai/hosting.json`; do not create a duplicate Site.

No business package, real account verifier, signing secret, installed dependency
tree or runtime storage is included. Developers clone code and explicitly export
website data/images into isolated local storage when needed. There is no automatic
return of local or test data to production.

Start with [HANDOFF](HANDOFF.md), [deployment](DEPLOYMENT.md), and the
[phase-eighteen contract](docs/sites/PHASE_EIGHTEEN_NORMALIZED_IMPORT.md).
Local synthetic validation and real snapshot integrity evidence are separate from
actual target database restore, real account login and platform publication.
Existing dependency/security holds remain in force.

The [phase-one document](docs/sites/PHASE_ONE.md) preserves the initial preparation
and limitations as history. Its early unregistered/uninitialized status is no
longer the current repository status.
