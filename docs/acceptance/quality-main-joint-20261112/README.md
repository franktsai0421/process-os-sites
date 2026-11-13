# #109 quality integration with merged account/process main

## Candidate and scope

This follow-up preserves the real parent histories of #105 (`d14808c`), #106 (`21a1765`), and #107 (`8a6d64e`) through `0850a46732ce4d468a2238450d83c3f2f8fb3d07`, and merges main `fc2e83d4a2d4974fab6274e3f0b79558dad8af64` (merged #108 with #103/#104 ancestry). The earlier two-module evidence is historical, not final combined acceptance.

Preserve independent FQC/IQC/routine/C/AB drafts, whole-set conflict selection, original IDs and photo associations, UNKNOWN original receipt recovery, pending locks and final authority checks. Keep same-page approved history readonly. The merged main's account choices, PROCESS master history and routine whole-page lifecycle remain included. No production account/policy/data changes, migration, deployment, backup or PR merge is part of this follow-up.

## Navigation requirements

- A/B module filters retain RAM edits and File objects; leaving the module discards unsent input.
- C product changes retain RAM edits and photos; leaving C discards unsent input.
- C stage and coverage selectors retain their prior discard behavior; pending-item navigation retains only within the same scope. Product retention is not used to silently redefine those independent selectors.
- Saved data and sent UNKNOWN operation receipts are not discarded or blindly resent.

## Verification

The implementation and exact source projection are being validated against this combined tree. A passing original PR or prior local candidate is not a pass for this tree. Final lint, TypeScript, build, source-only preflight, source proofs and affected combined regressions must be recorded on the final candidate before upload.

Native/physical-device, real-account, V41 site latency and production acceptance remain separate. No site deployment has occurred in this follow-up.

## Completed cloud checks (runtime candidate `c608694`)

- Fixed C product selection retaining unapplied editor fields and photo objects under the original product/stage. It never applies or writes on selection; returning restores only the same version/generation and current actor/edit context. Module departure clears cached forms. Actual handler, ownership rejection and preview cleanup tests: 6/6.
- Concentrated C/quality/navigation suite: 537/537 PASS (includes current source provenance, FQC/IQC/C/AB isolated lifecycle/concurrency and bundle checks).
- `npm run lint`: PASS. `npx tsc --noEmit`: PASS.
- `PROCESS_PROGRAM_COMMIT=<actual HEAD> npm run build`: PASS, child exit 0 and postbuild known-auth-client check. The prior missing-commit failure was corrected by supplying the real candidate identifier, not by disabling a gate. This identifier is not publication authorization.
- `node scripts/sites-source-check.mjs`: PASS_SOURCE_BOUNDARIES, businessDataIncluded=false.
- This follow-up changes no schema or live records. GitHub checks on the newly uploaded SHA and native/physical-device/real-account acceptance remain pending. No merge/deployment is performed.
