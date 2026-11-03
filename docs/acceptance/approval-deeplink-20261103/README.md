# Approval tab deep-link repair

## Source and scope

Base: `f23fb5e9cce9e4c1cb89e556151e8d5ff229d830` (merged PR #63).
The isolated source tree was matched to GitHub tree
`fe54d9fbd89213e7bf8de9eef87845e8a420ec41`; Site publication packaging is not the base.

`/process/?system=process&view=approval&approvalTab=process` used the correct
existing navigation parameter, but cold initialization only adopted `routine`.
The old browser-contract test explicitly documented this gap. Process and quality
links therefore selected the master panel on first load/reload.

## Changes and boundaries

- Resolve one enumerated `master`, `process`, `quality` or `routine` tab before
  the first approval render. Missing, repeated and unknown values select master.
- Use the same rule for indexed Back/Forward navigation, including an invalid
  original URL reached again after clicking another tab.
- Carry a single valid tab through the fixed login redirect and login allowlist.
  Both system entry points can request the shared approval view. The existing
  server destination policy still normalizes that view to the process system.
- Advance only the three changed browser executable cache tokens. Existing tab
  clicks still use the authorization-aware destination coordinator.
- No server authorization, session, write, CAS, schema, business data, account,
  sharing, deployment or Site change. No state is saved by reading a deep link.

## Verification

PASS on this candidate's source:

- 241 Node tests across login intent/destination, integrated bootstrap,
  process browser contracts, destination planning and delivery, router/history,
  navigation lifecycle/adapters/departure, multiuser departure and quality review
  readiness. All 241 passed; none skipped.
- Existing login initial-state/SSR contracts: 23 groups PASS. The pinned historical
  blob was fetched through GitHub and hash-verified; no assertion was removed.
- Existing login success/failure/stale/unmount marker contracts: 11 groups PASS.
- Full normal typed `npm run lint -- --format unix`: exit 0.
- `git diff --check`, browser test syntax, and source-boundary checks: PASS.
- Independent read-only review: no remaining blocking findings after fixing the
  duplicate-query Back mismatch. This is not GitHub PR approval.

BLOCKED locally: native Chromium fails before opening a page because the cloud
executor disallows its native `socket()` operation (EPERM/SIGABRT), including the
supported escalation attempt. No browser PASS is claimed and no alternate flags
or executor were used to bypass the restriction.

`tests/approval-deeplink-browser.test.mjs` is added to the existing Windows Local
safety workflow with its exit checked. It exercises real master-data render
registration, ApprovalTabs and navigation sources in native Chromium with a
synthetic shell/session/projection. Coverage: four tabs, first load/reload,
invalid/duplicate query roundtrips, clicks, Back/Forward, keyboard/focus, Chinese
and Vietnamese, 1280/390 px. It is not full Worker/login E2E or physical-device QA.

Pending release gates: exact-head CI (including the new native test and normal
build), any required review, and separately authorized deployment/live readback.
No live publication or live company-data verification was performed here.
