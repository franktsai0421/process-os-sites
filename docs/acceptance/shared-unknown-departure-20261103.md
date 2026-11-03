# Shared-transport unknown departure candidate

Originally stacked on PR #66; the current integration incorporates merged main
`9aafc288402be0b7cfb30fb07605ef53e0694cdd`, preserving #65, #66, #67 and #70.
No deployment, live-data operation, schema change, server authorization/CAS
change, input checkpoint, restore archive or new browser storage key.

## Main integration after dependency merges

Merge the existing #68 head `66cd38aab1dfd6a0b4305404c3559fd903352076` with that
verified main, retaining both parents. Three conflicts are limited to asset
references in `index.html` and their exact-version assertions in
`navigation-adapters.test.mjs` and `shared-draft-receipt-recovery.test.mjs`.
Combined master-data and delivery-navigation sources use the new
`20261103-unknown-approval1` token. Keep main's bootstrap, FQC, IQC and process
authoring/editor code and asset versions; keep #68's unknown transport/adapter
and permanent view-denial lease retirement. No server or data-model changes.

Against merged main, the unchanged FQC/IQC implementations, authoring/editor,
bootstrap and login destination files are byte-identical. The master-data and
navigation diffs contain only #68's original additions. CI retains #67's
approval-link regression, #70's IQC tests, #66's nine compiled abandonment cases
and sequential FQC browser fixtures, plus #68's transport and compiled-browser
cases. No historical hash, assertion, permission, write barrier or test gate is
removed. A plain diff check of imported CRLF IQC lines reports line endings;
the #68 diff against main passes whitespace checks without rewriting those files.

The first integration run passes 362 focused transport, navigation, login,
bootstrap, permission, adapter, authoring and canvas cases. Exact committed-head
build/browser results, full CI and independent integration review are tracked
in PR #68; earlier evidence below remains scoped to its named source. Passing
the original branch does not establish integration acceptance. No merge or
deployment is authorized by local validation, and all requested work must finish
before any coordinated release.

Independent read-only integration review of `75e4f1230752f2b078c6bcd1424e34cfe6b552f4`
confirmed preservation of the merged features and ran 261 focused cases, but
found a P2 malformed-body denial gap: a plain-text HTTP 401/403 caused JSON
parsing to throw before ordinary permission reads retired navigation coverage.
Both guarded and ordinary clients reproduced the defect. The follow-up sends
such read denials through the existing owner-fenced access projection before
rethrowing the original parse error (or the existing accepted-access HTTP error).
It tightens UI view permission and retires navigation coverage, preserving
unknown markers and write locks; stale read replies cannot revoke a current
lease. Four denial regressions fail before the fix and pass afterward, with two
stale-read checks and 98 focused transport/adapter/cache/permission cases PASS.
The compiled AB cases now cover both JSON and plain-text denials at both
viewports/languages. The client asset token advances to
`20261103-unknown-departure3`. New exact-head validation and independent re-review
are required; CI on the earlier integration is not acceptance of this correction.

## CI run 260 fixture-boundary correction

Run `41685595597` on `5e31e9c962b15e0c02d53d95b7689313446c3f27` failed in
Integrated entry and read-only delivery contracts. `fqc-readiness.test.mjs`
could not find its source-extraction end marker: it expected adjacent `clients`
and `transports` declarations, but #68 inserted `clientAccounts` between them.
The assertion failed at module load, before the 30 readiness cases executed;
this was independently reproduced locally. Later workflow stages were skipped,
so the failed run cannot be treated as complete CI acceptance.

Only the fixture boundary changes: use the unique `const clients=new Set(),`
prefix while retaining ordering and adding uniqueness assertions for both
markers. All readiness behavior assertions remain, and actual production
polling code still executes. The extracted span is byte-identical to merged
main `9aafc28`: 13,080 bytes, SHA-256
`9a08734adeaaa46953418ba542d584c048e398cb4761762e08ee715ea6cc518c`.
After correction all 30 readiness tests and 67 scoped-read-pause groups pass.
There is no product, workflow, schema, permission or unknown-recovery change in
this follow-up. Full new-head CI and independent review remain required; this
does not retry the separately blocked PR base or description updates.

## CI run 261 access-result expectation correction

Run `41692056440` on `89abc73d95359b87146e0e9761deb8f5072ce799` passed the
readiness correction, then stopped in `test-shared-access-result-races.cjs`.
Its old non-strict-read case expected `edit` to remain true after HTTP 403 with
an invalid JSON body. This contradicts the reviewed `5e31e9c` repair above:
an owned 401/403 revokes access even when JSON parsing fails. Non-strict reads
still return the original parse error; strict reads retain HTTP status/cause.
`guardAccessResults` does not exempt a client from this denial. Local execution
reproduced the exact old assertion failure before updating its expectation.

Only tests and this evidence note change. Replace that one obsolete case with
eight owned-response cases (guard off/on, HTTP 401/403/200/500), preserving error
identity and asserting view/edit, disabled controls and no extra request/POST.
Sixteen stale-denial cases verify identity, read-state reset, delivery and module
ownership fences for both guard modes and both denial statuses. All 51 access
race checks pass; 52 unknown-departure/readiness tests and typed lint also pass.
All 55 commands from the failed case through the end of that CI stage pass
locally, including the actual IQC browser fixture (synthetic data, two languages
and three viewport sizes). This Linux run does not replace the complete Windows
workflow; final exact-head full CI remains required. No product permission, receipt, unknown marker, write lock,
workflow, schema or deployment changes occur. PR base/body updates remain blocked
and are not retried.

## Implemented scope

Master data (AB/C/lines/PROCESS), IPQC-AB, Tooling and routine equipment opt into the common navigation lease only when their actual shared transport holds an intact unknown operation, no queued work, verified view access, matching actor/session generation and the original durable marker. IPQC-AB must account for both scope and module transports. Unsupported Begin recovery in Tooling/equipment remains blocked. Additional unrelated unknown operations still block departure.

Explicit abandonment calls the module's local cleanup. The navigation lease never clears operation records, marks a 404 failed, submits Save, performs a shared inverse or retries a POST. Reopening/reloading retains the original write barrier. A confirmed matching receipt remains the only existing settlement path. Navigation coverage survives the source projection's normal cache reset; a real view denial, marker change, session change or pagehide invalidates it. Held leases recheck local input, readiness and transport membership before committing navigation.

## Evidence

- PASS 14 direct tests executing the actual transport and common adapter together: multi-transport coverage, retained bytes, 404, late matching receipt, no replay, reload, other-scope blocking, identity/epoch/pagehide/access changes, local-input/readiness/peer races and normal projection-cache reset.
- PASS 248 focused shared recovery/router/adapter/cache tests, including the 14 new direct cases.
- PASS 11 FQC real Chromium departure regression cases after fixing the cache-reset invalidation found during this extension.
- PASS typed lint and isolated compiled build; two compiled AB unknown departure → C → dashboard → AB cases at 390px zh / 1280px vi, retaining the exact operation bytes without another POST. These exposed a verified same-session identity replacement issue, also corrected in prerequisite PR #65. Full latest-head CI remains pending.
- No independent review is claimed by this author report.

## Independent review follow-up

Reviewed the remote `b624dd2d7ad2fa1911bd68d05025a753f6e8139a` against PR #66
`b42294f0d884992be6d72f841450e439ab8d8f82` in a separate cloud checkout.
Found a P2 navigation-authorization defect: after explicit abandonment, a verified
view denial disabled the lease only while the permission cache retained `false`.
`invalidateReadState()` reset it to `null`, reviving the old lease. Reproduced both
in the actual transport/adapter and in the compiled AB browser at 390px zh and
1280px vi with a real intercepted HTTP 403; the original operation stayed unknown.

The transport now retires navigation coverage on view denial before optional UI
gates. A cache reset or later permission grant cannot revive that decision; a new
explicit abandonment must establish a fresh lease. The durable operation, write
barrier and receipt-only recovery remain unchanged. Guarded and ordinary clients
have regression coverage, and the compiled cases verify unchanged marker bytes
and POST count through denial, reset and regrant. The browser asset version advances.

The initial independent 201-case focused run passed before this new regression
exposed the defect; the repaired focused run passes 207 cases including four BOM
permission-order regressions. The fixed product commit `fd54530ada0bedd183e5bb78cb4f1a4370918ea3`
passes the exact-commit compiled build and both AB denial/reset/regrant browser
cases; 42 FQC source/browser cases and full typed lint also pass. Two existing
cache-version expectations were updated to the advanced client asset tag; no
assertion was removed. Final exact-head CI remains a separate gate. The first FQC
browser invocation lacked the installed Chromium path and failed at launch;
the supported `PLAYWRIGHT_CHROMIUM_EXECUTABLE` setting is used for reruns.
Locked dependency installation and collaboration-hook installation succeeded in
this standalone checkout. This is not a live-data initialization certification.

PR #65 and #66 remain unmerged, and the original #68 full CI was still running
when the defect was found. The repaired head needs its own CI and independent
fix review, then dependency integration/revalidation after #65 and #66 merge.
No merge or publication is authorized by these local results.

## Not covered / still blocking the all-pages request

IQC pending error batches, IPQC-C creation recovery, BOM durable recovery, custom Tooling/equipment Begin, routine FQC custom retry, process canvas/ledger unknown and Users uncertain writes still need their own operation-bound navigation contract. Feedback's independent storage/upload/update/export paths are not changed by this PR. Do not describe these pages, all unknown operations or all native browser flows as completed.

A v37 page already open in the live site still runs its original code; an unmerged PR cannot unlock that page. No live unknown operation was cleared or replayed. Historical 500s beyond the specifically reproduced FQC authority-body fault remain unclassified.
