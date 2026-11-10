# PR #102 local synthetic fixture repair

Base: `42d1727565c52ea7ac490df736fa98e95db64bb1`. Test-only repair;
no production caller, permission, persistence, schema or business data changes.

## Equipment delivery recheck

The integrated caller quarantines the old DOM as soon as its delivery is stale.
The former test invoked an input handler on that detached node and expected it
to mutate RAM. The approved-history guard correctly refuses detached events.
The replacement asserts actual detachment/quarantine, unchanged RAM and original
basis through recheck, live typing after the recheck, and continued rejection of
the old handler, with no POST. It does not remove the guard or bypass quarantine.

## Routine FQC Save compatibility caller

The former extracted-function fixture assumed Apply followed by Save and omitted
the integrated display guards and merge helpers. It now runs the entire shipped
closure and shared receipt helpers through the existing durable fixture. HTTP and
storage are synthetic. This covers the document caller compatibility boundary,
not acceptance of the newer whole-page module flow.

The tests enforce one atomic `save-local-v1` POST, original document pinning,
newer input retention, identity/epoch/delivery/generation fences, UNKNOWN receipt
no-replay, and independent Save-only permission. The exact saved ID/content is
the acknowledgement boundary: a superseding saved snapshot rejects and keeps
input, whereas newer peer working content remains separate from the original
saved snapshot. No assertion permits overwriting peer content or treating it as
saved. This follows the saved/working distinction and atomic Save policy in
[SHARED_DRAFT](../specs/current/SHARED_DRAFT.md).

## Verification boundary

Local results on the test-only candidate:

- Equipment no-poll / sent-batch five-file group: 282 passed.
- Routine explicit-refresh / manual-generation / durable / receipt / departure
  seven-file group: 259 passed.
- Equipment and Routine approved-history suites: 56 passed.
- `git diff --check`: passed.

These groups overlap and are not added into a coverage total. All checks use
isolated fixtures; there is no native browser/socket test, live API, production
data operation, upload, merge or deployment. These local synthetic results are
not an exact-head hosted CI or native-browser pass.
