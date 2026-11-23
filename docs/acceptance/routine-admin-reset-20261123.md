# Separate FQC / IQC Admin controls — local candidate

## Requirement and base

Frank's latest direction: all authenticated viewers of each module see Reset and start-date controls; only effective application Admins may use them. This supersedes the earlier owner-only date/enrollment requirement for these two operations. Other module permissions, startup locks and unrelated owner-only features remain.

Branch `fix/scoped-admin-reset-20261123` starts at reviewed #141 merge `b6d9b3fd0f6ae2ca98f3909413547586e755184c`, the application base of original test v69. This is a new local candidate, not the published artifact and not main. No #140 migration is included.

## Implementation

- `isRoutineAdmin` requires the verified platform session and current stored Admin role. Identity validation retains enabled-user/authEpoch checks. Client names, role headers and Sites identity alone cannot grant application authority.
- FQC legacy/preview and whole-page configure routes and IQC access/configure route require Admin plus existing module permissions. Date locks and pending/working guards remain. Start-retirement and legacy owner enrollment still use the original owner helper.
- Optional activation version 2 uses `authorization: application-admin`; it has the same exact original compiled project/origin, release pin, DB target/completed transfer/bootstrap lineage proof, expiry and independent `scopes: {fqc:boolean,iqc:boolean}`. It removes individual native-owner enrollment only for this explicit activation version. `ownerId` in this configuration attests the existing DB lineage, not the acting Admin.
- No activation means OFF. A version-1 owner activation remains owner-restricted. Enrollment is never enabled by this change. Its existing expiry check rejects requests at or after configured expiration without a cleanup write.
- Current Admin and module permissions are checked for capabilities and writes. Final authority/revision/DB guards, actor-bound receipts, module-specific reset generations and matched pending tombstones remain. Reset of one module cannot target both.
- Both module pages show disabled controls to non-Admins, with Traditional Chinese/Vietnamese Admin-only hints; startup/date locks and unavailable Reset activation have separate messages. Asset versions invalidate prior cached controls.

## Isolated verification

Final result: 227/227 isolated checks pass; TypeScript and whitespace/schema/hosting/dependency diff checks pass. A prior run found a legacy enrollment millisecond-boundary defect (separate Date.now calls could produce a 300001 ms challenge rejected by its own validator). Creation and expiry now share one timestamp, with a deterministic boundary regression. No enrollment authority or expiry limit was widened.

The acceptance command below covers application Admin and second Admin success, anonymous/disabled/named staff/header spoof denial, wrong site/DB lineage/expiry/scope, CSRF, missing permissions, role revocation during write, each configure route, bilingual disabled viewer controls, existing pending receipt/late-write fences and separate FQC/IQC reset/restart behavior. Admin-mode startup tests actually clear generated dated jobs, plans/reports/review states and dates, preserve the opposite module/source definitions, check unset-date reads and subsequent date regeneration. Existing owner-mode tests remain.

```
npx tsc --noEmit --incremental false
node --test tests/routine-admin-reset.test.cjs tests/routine-reset*.test.cjs tests/routine-reset*.test.mjs tests/routine-startup-isolated-restart.test.cjs tests/routine-iqc-workflow.test.mjs tests/routine-fqc-calendar.test.cjs tests/routine-iqc-workspace.test.mjs tests/routine-fqc-durable-receipt.test.mjs
git diff --check
git diff --exit-code b6d9b3fd0f6ae2ca98f3909413547586e755184c -- drizzle drizzle-sites-fresh db .openai package.json package-lock.json
```

No SQL/schema/storage key, Drizzle 0000–0009, hosting identity or dependency change. No 0010 packaged. Synthetic DOM checks cover confirmations/cancel and both languages; physical iPhone, real browser layout and hosted runtime QA are not performed by this local pass. Build/deployment preflight is separate.

## Next review/release step

Proposed draft: new head `fix/scoped-admin-reset-20261123` against existing `review/v68-reset-base-20261123` (verify still at b6d9 before upload). Do not target main or modify the existing merged PR. The inherited `scoped-reset-review.yml` is explicitly limited to PR #141 and its old branch; it will not run this new candidate. A separately reviewed test-only CI scope update is required, with exact new head checks; no CI success is claimed here.

After reviewed merge and separately authorized publication, preserve original v69 hosting overlays/resources/public audience, run applicable exact-package release gates, then provision the native bounded version-2 activation with independently reverified lineage and release pin. Opt in FQC/IQC separately; publication alone does not activate Reset. No new owner enrollment is needed. Enabling controls does not execute Reset. A real Reset remains an explicit separate per-module confirmed destructive operation.

No live configuration, enrollment, account/role change, Reset, GitHub push/PR, merge or publication occurred in this pass. No real credentials, rows or activation values belong in the recovery artifact.
