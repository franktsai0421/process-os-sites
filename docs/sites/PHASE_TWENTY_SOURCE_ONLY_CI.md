# Source-only PR validation

The work branch joins the new private repository's README root to the complete
independent derivative history using a merge commit. Neither root is rewritten.
Frank reviews and merges the PR. A branch upload, draft PR or green check is not
a main update, Site publication or true-data acceptance.

`local-safety.yml` runs on PRs to main using pinned checkout/setup-node actions,
read-only contents permission, full history, Windows and Node 24, locked `npm ci`,
the actual checked-out SHA as `PROCESS_PROGRAM_COMMIT`, complete TypeScript and
the existing isolated build entry. No new dependency or package-lock change is
required. There is no push, deployment or real-data trigger.

The replacement source preflight scans reachable Git trees and commit metadata,
then Git-listed working source. It refuses private/data/media/archive paths,
symlinks/submodules, invalid UTF-8, binary/oversized payloads, known credential
patterns and unreviewed workstation references. Bounded Git batches verify size,
framing and content hash. It never opens held legacy package tools or ignored
runtime/dependency storage. No credential values are printed.

The reviewed-blob policy pins exact historical bytes and path to the already
reviewed phase-nineteen source ancestor. Its exceptions classify synthetic test
secrets, the reviewed single-pixel inline image and existing workstation-reference
metadata. They grant no folder-wide allowance; changing one byte or the path
requires review. They do not make historical local paths portable dependencies.
The current CI does not execute those legacy workstation/package entry points.
Pattern scanning is evidence against known leaks, not a guarantee that every
possible secret format is detectable.

CI executes negative preflight fixtures, source-boundary/fresh-schema checks,
the phase-eighteen synthetic snapshot/normalization/authorization suite and the
native fake Worker outbound-denial regression. Every child exit is checked.
Private canonical packages are deliberately absent: the old canonical/release/
employee-package CI commands are removed, while the legacy scripts and history
remain intact. Dependency/security holds are not cleared or upgraded by this PR.

## Evidence boundaries

- New CI results apply only to their exact PR head and checked-out merge SHA.
  Local runs must be reported separately, including their actual commit.
- Phase eighteen's 142 synthetic cases and source-specific build receipts remain
  historical evidence; CI reruns the applicable in-repository suites in its new
  environment. The external 14-case compiled HTTP driver and official Sites
  packager receipt are **not** executed by this workflow.
- The completed real R1 normalization/integrity audit is reused without reading
  or copying the payload again. It did not open a target database, execute SQL,
  configure real account verifiers or prove real login/DB/R2 restore.
- Live Sites packaging, protected import, capacity, signer/account configuration
  and platform publication remain separate steps. No real data or credentials
  are included in this source PR.
- GitHub Free private repository hooks/CODEOWNERS are not server-enforced Frank-
  only merge rules. No plan, payment, collaborator, ruleset or bypass change is
  part of this work.
