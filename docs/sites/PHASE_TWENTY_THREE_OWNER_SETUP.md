# Private-test owner setup and reviewed Site source push

This source change adds default-off owner setup and a constrained Site-source
main path. It does not configure a real owner, signer, token, installed hook or
platform permission. Frank merges its source PR; live actions remain separate.

## First application owner

The selected credential-excluded R1 business identity was checked locally:
`frank`, admin, enabled, non-DEMO, unique. It is also the existing primary admin
ID in access-policy.mjs. No original password/verifier is read or migrated.

`/setup/owner` submits only to `POST /api/setup/owner`. The server fixes this
flow to the existing process-os-test project and `frank`. Required runtime keys:

- `PROCESS_OWNER_BOOTSTRAP_ENABLED=1`, `PROCESS_IMPORT_ENABLED=1`;
- `DEMO_LOGIN_ENABLED=false`, `PROCESS_SESSION_REVOCATION_ENABLED=1`,
  `PROCESS_RELEASE_DISABLED=true`, real `PROCESS_PROGRAM_COMMIT`;
- `PROCESS_IMPORT_OWNER_ID=frank`, canonical HTTPS `PROCESS_IMPORT_ORIGIN`,
  reviewed `PROCESS_IMPORT_TARGET_FINGERPRINT` and `PROCESS_IMPORT_MANIFEST_SHA256`;
- `PROCESS_OWNER_BOOTSTRAP_EXPIRES_AT` as an explicit future ISO timestamp;
- separate independently random 64-lowercase-hex secrets
  `PROCESS_OWNER_BOOTSTRAP_SECRET` and `PROCESS_SESSION_SECRET`.

Configure these only after the applicable security approval through official
Sites Secrets/settings. Never put secret values in source, hosting.json, chat,
approval receipts, command arguments or files. The account holder enters their
bootstrap key and new application password directly in the private setup form.
No secret is prefilled or stored by the form. A generic environment-setup input
tool is not a documented Sites secret-input bridge.

The route enforces exact origin, key, expiry, fixed project/owner and input
shape/size, plus the existing database login limiter. Visitor-provided or absent
Sites identity headers cannot replace the setup key. The existing owner-private
platform gate remains required. Password hashing uses the existing scrypt
helper. It never accepts a role/id override or creates a DEMO user.

The new append-only fresh migration adds `process_owner_bootstrap`. Both owner
and singleton receipt are conditional writes in one D1 batch. A nonempty target,
prior receipt, history, transfer, activation or unexpected R2 contents refuse.
The durable receipt prevents resetting the owner even if its row later vanishes.
An exception rolls back the batch; ambiguous/partial receipts fail closed and
require diagnosis, not automatic reinitialization. D1/R2 are not one transaction;
R2 is checked before and after hashing and import also rechecks target contents.

The only initial business state is maintenanceMode=1 and one authentication-only
owner. Success neither issues a session nor opens company traffic. Use the normal
platform-login route afterwards. Retain the import gate until original durable
activation succeeds. Activation still preserves only the configured target
owner verifier, rebuilds actual records/R2 references and invalidates old owner
sessions. Employee credentials are not migrated. Exports continue to scrub
credentials and do not include the bootstrap receipt.

The setup page/API are the only additional exact paths through the inactive
import gate. Sites owns /signin-with-chatgpt, /signout-with-chatgpt and /callback.
Do not replace them or make all setup/API paths public. After initialization,
remove/disable bootstrap settings through the separately approved native flow;
the receipt already blocks reuse regardless of environment propagation timing.

Fresh source now has three schema-only migrations and eleven tables. Original
applied migrations are unchanged. Business snapshot schema/provenance is unchanged;
no full R1 conversion is needed. Verify the target's actual migration state
before publication, including after an uncertain failed deployment.

## Site-specific main workflow

GitHub main and every other destination retain main refusal. Only the registered
process-os-test HTTPS source URL is eligible. The pre-push wrapper forwards Git's
remote arguments; the self-contained guard verifies the exact URL, project,
hosting bindings, source profile, current commit/tree, clean worktree, installed
hook bytes and expected prior remote commit. URL rewriting, mixed ref updates,
deletion, missing ancestry and non-fast-forward updates refuse. The supported
workflow always uses ordinary push. A hook does not receive the original
--force flag; ancestry/expected-state enforcement prevents history rewriting.

After actual human authorization, a non-secret receipt matching the template
may be placed at `.sites-runtime/sites-source-push-approval.json` in the selected
Site-bound checkout. All nulls must be replaced with the exact reviewed values;
it is not a generic allow switch or a substitute for authorization/credentials.
Expiry cannot exceed the native source credential's returned expiry. The guard
atomically reserves that approvalId under sites-source-approvals-used before
push; repeat or uncertain attempts require readback and fresh disposition.
Neither receipt directory is source/package content.

Use the official source helper/opening result. Form and review a real clean
Site-bound commit before building so its exact SHA can be approved; do not use
the GitHub SHA or projection hash as that commit. If the helper would create a
different commit, the pin must reject and be reviewed again. A fresh Site-bound
checkout can use the existing collaboration-setup installer to install reviewed
templates; unknown or mismatching existing hooks still refuse. Do not silently
overwrite installed hooks in the current GitHub checkout or any old repository.

Obtain a short-lived credential for this one Site only when authorized; no
publish-on-push is requested. Native return stays in the same executor's memory
and enters the official helper's hidden tty stdin. No parent/child chat relay,
token file or persistent Git auth. The helper uses child env/config-env for its
header and still performs normal push/readback/package. A project-rule change
does not override a tool-policy rejection.

## Remaining live steps and evidence boundaries

The original Site remains owner-only and was last observed with version0 and no
runtime keys. Source-only preparation is not publication. Obtain canonical origin
from the actual native deployment result; the latest expected_url was null.
One safe sequence is an initial owner-private, schema-only publication with setup
disabled and import gate enabled, then separately approved runtime secret/pin
configuration, followed by owner-entered setup and normal login acceptance.

The Windows official npm build wrapper's earlier MODULE_NOT_FOUND remains a
technical diagnostic, not a policy refusal. The existing direct Node build entry
and official package helper have separate evidence. New publication still needs
the exact Site source SHA and matching fresh-schema build/archive.

R1 manifest metadata separates 1,810,926 bytes of serialized three-table data
from 8,141,576,279 bytes of R2 resources. Neither is actual D1 page/index usage.
Staging plus materialized R2 is 16,284,963,484 bytes plus metadata, owner overlays
and ledgers. Actual account quota, row/cell limits, hosted CPU/memory, uploader
session handling, resumability and real login/import/export still need target
acceptance. Do not rerun/copy the full snapshot, infer capacity from total ZIP
size, or auto-return local/test data to formal production.
