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
