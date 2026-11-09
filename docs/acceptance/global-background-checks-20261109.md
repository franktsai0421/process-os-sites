# Global background check retirement

Candidate starts at main `d4ac309fe05c89288af226b52c18161865ccdcb8` (#97 and #98 already merged). Source-only change. No schema, migration, account/role change, business-data write or Site publication.

## Confirmed policy and implementation

No fixed-second/minute background server query, refresh or synchronization on any web page. Entry, explicit Update and operations may read. Save/Submit retain current versions, permissions, CAS, pending locks and original uncertain-result receipts. Conflict choices and unsent-form recovery removal remain separate concurrent work; this change does not claim to implement them.

The shared `createForegroundPoll` API is retained as an inert compatibility facade because separately cached modules and independent candidates still call it. It retains no callback, timer, focus/visibility listener or server cache. This makes all old callers inactive without editing their business paths or overwriting ongoing module work. Cancelling/disposal still invalidates captured ownership. Dead producer cleanup can follow module integration; it is not a substitute polling frequency.

| Actual page/function | Main behavior | Candidate |
| --- | --- | --- |
| AB line/category | shared 30s owner | retired centrally; entry and atomic Save reads remain |
| C line/category | same owner | retired centrally |
| Line/stage management | same master owner | retired centrally; separate draft/permission split remains other work |
| PROCESS templates/machines | same master owner | retired centrally |
| Master review platform | same master owner | retired centrally |
| BOM / BOM review | shared 30s owner | retired centrally |
| FQC standard / review | shared 30s owner | retired centrally |
| IQC standard / review | shared 30s owner | retired centrally |
| IPQC A/B standard | shared 30s owner | retired centrally |
| IPQC C standard / review | shared 30s owner | retired centrally |
| Tooling / review | shared 30s owner | retired centrally |
| Process editor / process review | 4s direct interval | removed; entry and explicit workflow reads remain |
| Quality viewers' process references | 5s interval | removed; mounting/language/user history reads remain |
| Effective-version notice | 30s + focus/visibility | removed; initial and explicit `check` remain |
| Fixed-history / restore preview | recursive 4s permission check | removed; each explicit read/navigation/review/preview/Apply checks fresh permissions and fences late replies |
| Equipment library | already removed in #97 | unchanged; original receipt and explicit delivery recheck protected |
| Routine FQC | already removed in #98 | unchanged; entry/explicit Update and unknown guards remain |
| Accounts, feedback, dispatch/player/status and setup/import | no further periodic server checks found | no periodic owner added; normal entry/action reads retained |

44 remaining timer call sites are listed in `tests/fixtures/browser-timer-inventory.json`, collected from 139 browser-entry/import-reachable source modules with direct and aliased timer calls: local clocks/elapsed displays, request deadlines, URL cleanup, user-action UI callbacks, edit-triggered write/local-storage debounces and one startup observation resume. The bundled XLSX timers only release object URLs. Three aliased recovery timers are local debounce operations; four client-imported library timers abort individual startup/import/verification requests. Third-party dependency internals are not inventoried by this source guard. These are not periodic idle server checks. This task does not change host backup scheduling, browser internals, dependency runtimes or the separate unsent-recovery policy.

## Verification and evidence limits

- PASS: 150 current-source history/permission cases, including real handlers with private synthetic SQLite/R2, late success/denial, close/navigation/actor/epoch changes, review changes during permissions, and original receipt preservation.
- PASS: 201 equipment sent-batch/quarantine/insert-ACK cases; current main's ACK structural equality and explicit delivery recheck preserved.
- PASS: seven exact production legacy caller closures/startup statements with actual inert facade cannot schedule callbacks, timers, listeners or requests; browser timer inventory rejects additions. Separate production facade test checks repeated schedule/cancel/dispose and focus/visibility transitions.
- PASS: retained legacy producer ownership, stale GET/ACK/hydration and denied-read tests under an explicitly test-only retired callback driver. These tests exercise inactive legacy function safeguards, **not** production automatic refresh. Existing guards/assertions remain; the retired driver is never imported by application source.
- PASS: scoped read/receipt-kind denial/retry and unknown-record checks; explicit effective-version/reference behavior. Typecheck, lint, source boundaries and fresh build at committed follow-up `06ef6e2b821e5deef634f2d77aac1b7edcc274ec`.
- PASS: 171 shared-client Begin/Save/Submit/prepared/unknown/pagehide contract cases and 216 PROCESS/AB-C bridge, permissions and navigation cases (cache assertions updated to exact new executable tags).
- PASS: 64 composed historical-source cases and 14 dedicated background-retirement/source-inverse cases. Changed-file safety scan has no findings. The full scanner reports two pre-existing synthetic test fixtures, verified byte-identical to main; no secret values are printed or added.
- Exact source inverse proofs restore the five changed production files to main d4ac309 and reject byte drift; existing historical pins are preserved. They are source-lineage evidence, not runtime tests.
- BLOCKED: Chromium desktop/narrow tests cannot launch in this executor (`socket() failed: Operation not permitted`). No local workaround to the restriction is used. Native/physical-phone and deployed-site checks remain NOT_RUN.
- Two legacy AB attribution tests fail because the current main no longer exposes their `departureOwnShared` fixture hook; reproduced unchanged with main shared-client source. These tests are not altered or presented as PASS.
- A legacy editor-read test reports `80 !== 900`; the identical failure is reproducible with untouched main authoring source. It is not newly caused by deleting its inert interval in the synthetic test. This test is not used as acceptance evidence.
- Full remote CI, independent review and live-site acceptance must be evaluated at the actual uploaded head. A local PASS cannot stand in for them. Do not merge with required failures or unresolved review blocks. Local socket-blocked and live/physical-device acceptance must remain explicitly unverified; source merge does not approve Site publication.

## Integration

Keep the main equipment recheck/ACK changes; do not replace the full shared client with the older history candidate. The history patch is composed onto current main and its explicit-read ownership checks added around the existing private equipment request owner.

Other draft/canvas/type-catalog candidates in the workspace are deliberately not merged here. When they integrate, retain the inert facade and the removed direct interval lines; semantically combine cache/source-proof changes and rerun only affected checks. This branch changes no business schema/data and creates no production release.

## Independent review follow-up

The independent fixed-e37 review found three P2 issues; none is waived. The follow-up keeps initial focus inside an open history error dialog on permission/list 503 (two new regression cases), retains known HTTP error status when an expired explicit-read predicate rejects adoption, and composes the exact background source inverse before the existing authoring departure/panel proof without changing its old hashes or mutation negatives. The unchanged shared-read race runner now passes 20 checks; the unchanged source-EOL runner passes 78 checks.

The timer guard now follows client static/dynamic imports into local libraries and known timer aliases; synthetic import/alias/server-only tests cover that discovery. The remaining 44 registrations are reviewed one-shot deadlines/debounces/UI cleanup or local display clocks; no further periodic server query was found. Independent re-review of fixed `06ef6e2b821e5deef634f2d77aac1b7edcc274ec` confirmed all three P2 findings resolved with no new blocking finding; it independently passed 164 history/no-poll/source cases, read-races 20, source-EOL 78 and panel differential 15. The new uploaded head still requires its own full CI. Browser socket restrictions and hosted/physical-device acceptance remain unchanged and unverified.

The cancelled e37 Windows run exposed an additional obsolete assertion in `canvas-manual-sync`: it required the retired 4-second registration. That assertion now verifies zero idle interval and unchanged explicit-read authority/editor behavior. The unified-master legacy callback composition uses the same explicitly test-only driver as the other retained producer-fence tests; current production scheduling is verified separately. No application behavior or safety assertion is relaxed to satisfy these retired-cadence expectations.
