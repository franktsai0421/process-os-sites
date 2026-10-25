# Explicit system route selection

The private Site reproduced a navigation error after selecting Quality: opening
`?system=process&view=dashboard` still selected the remembered Quality system and
replaced the URL with its dashboard. The original initialization recognized an
explicit `quality` value, but treated explicit `process` as if no selection had
been supplied. The same source was present in the fixed paired R1 program.

Initialization now honors either explicit valid value first. Missing or invalid
selectors retain the existing remembered/default behavior. System switching,
login selection, device entry, history handling and authorization remain intact.
The actual IIFE runs in an isolated DOM fixture for nine regression scenarios;
no network, real account, credential, data or browser session is used.

This correction does not address backend latency, incomplete business content,
construction-placeholder features or employee startup. Live publication and
the corrected first-entry/Reload acceptance require a later approved release.

Employee acceptance currently has two distinct boundaries. No normal employee
session is available for live QA. Separately, `company-assets.ts` deliberately
limits the three complete multi-module seed scripts and their object aliases
to Frank's platform/admin session with `master.export`; `bootstrap.js` still
awaits these scripts before application readiness. Employee startup therefore
requires an independently reviewed, permission-filtered bootstrap design or
remaining owner-only. Do not grant employees the complete seed just to pass QA.
