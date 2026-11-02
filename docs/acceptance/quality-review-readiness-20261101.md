# Quality review: known-denied sibling readers (2026-11-01)

## Observed defect and boundary

PR #56 run `41316777798` failed at FQC reviewer entry. FQC was visible, authorized and pending, but the quality overview also started unrelated module readers. Their legitimate view denial remained in `navigation.error()` and made the whole quality page fail. The run remains **FAIL**: 25 FQC action samples, zero complete five-cycle FQC sets; the two-context matrix runner was not reached. The separate PROCESS 90 samples are not FQC evidence.

A local production-route + whole Tooling/shared-client + exact navigation closure counterexample independently reproduced the failure with an authorized FQC GET and a Tooling `403 FORBIDDEN`, without changing DB/R2 or permission cells. The paired new regression also loads the whole FQC module; the remaining sibling presentation ports are synthetic, not a native six-module UI run.

## Narrow product correction

- `shared-state.js` derives an opaque **negative admission** only inside its successful authenticated bootstrap and prepared-destination commit paths. The sanitized current-user row must be unique, enabled, actor-matching, and contain all six explicit Boolean effective view cells. The snapshot is pinned to identity object/id, identity epoch, delivery, destination and private baseline. Missing/invalid evidence is unknown, not denied. An older concurrent bootstrap cannot mint admission after a newer request. Load and prepared-commit minting also retain the original identity-object reference across the request. New load/prepare attempts and every state installation invalidate older prepared negative admission, including failed refreshes and untrusted DTO installations; generic commit semantics are not changed.
- Before binding a quality-review reader, `quality-review-overview.js` may omit it only for that known `view=false` snapshot. The section explicitly says it lacks view permission and data was not read; count remains `—`, not zero. It grants no model, read or write authority.
- `master-data.js` preserves all ordinary reader promises and `Promise.all`. `delivery-navigation.js` ignores only a currently valid omission for this exact quality overview. Single-module navigation is unchanged. Existing module errors are not cleared.
- Once a reader starts, its later 401/403/500, network failure, malformed response or missing required data remains a failure. A changed identity, destination, bootstrap, suspended/expired session, untrusted `applyServerState`, or invalid proof cannot reuse the omission. No role, seed, API, CAS or review-command checks change.

This is not an HTTP-403 allowlist and does not reinterpret failed responses as success. It does not provide realtime server revocation push. Already-admitted readers and every action keep their existing fresh server checks.

## Verification

- `node --test --test-concurrency=1 tests/quality-review-readiness.test.mjs`: **49 PASS, 0 FAIL, 0 SKIP** locally (production route/JS with isolated SQLite/R2 and synthetic DOM; not browser).
- Existing truthful FQC/overview checks and pending-badge checks pass. Six changed source/test files pass the repository's type-aware lint.
- Old-source paired counterexample remains red; required readers' denial/outage/malformed outcomes remain red-to-the-user in the fixed code.
- New suite is appended to the existing FQC CI Node command, preserving all prior suites, native commands, exit checks and workflow gates. Four cache tags and their exact-version oracle change together.
- Native FQC lifecycle/multiuser results for this product candidate: **NOT RUN**. The original failed CI is not retroactively reclassified. No live employee data or deployment is involved.

The separate legacy `scripts/test-master-read-projection.cjs` ad-hoc command fails on both the unchanged base and candidate because its extracted login fixture lacks `ProcessAccountTransition`; this change does not modify that fixture or claim it passed.

## Request/performance and remaining work

For the synthetic reviewer, four explicitly denied sibling readers are not started. No new GET or POST is added, and readable-module transport is untouched. The regression verifies bootstrap plus the actual FQC read, with no write. It is **not** an end-to-end six-module request benchmark or a UI/production latency improvement measurement. Initial bundle cache refresh includes the four changed scripts.

The independent same-cell conflict → Discard → Save failed-state issue, matrix positioning/localization, complete native five-cycle FQC results, and physical multiuser/device acceptance are outside this correction. They must retain their own evidence and release decisions.
