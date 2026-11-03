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

## Not covered / still blocking the all-pages request

IQC pending error batches, IPQC-C creation recovery, BOM durable recovery, custom Tooling/equipment Begin, routine FQC custom retry, process canvas/ledger unknown and Users uncertain writes still need their own operation-bound navigation contract. Feedback's independent storage/upload/update/export paths are not changed by this PR. Do not describe these pages, all unknown operations or all native browser flows as completed.

A v37 page already open in the live site still runs its original code; an unmerged PR cannot unlock that page. No live unknown operation was cleared or replayed. Historical 500s beyond the specifically reproduced FQC authority-body fault remain unclassified.
