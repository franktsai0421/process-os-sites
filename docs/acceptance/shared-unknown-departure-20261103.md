# Shared-transport unknown departure candidate

Stacked on PR #66, keeping PR #65/#66 product heads separate from this extension. No deployment, live-data operation, schema change, server authorization/CAS change, input checkpoint, restore archive or new browser storage key.

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
exposed the defect; the repaired focused run passes 203 cases. Additional exact
candidate build/browser/CI results are recorded in the PR handoff. The first FQC
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
