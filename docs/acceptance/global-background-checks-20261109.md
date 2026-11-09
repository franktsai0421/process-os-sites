# Global background check retirement

Candidate starts at main `d4ac309fe05c89288af226b52c18161865ccdcb8` (#97 and #98 already merged), with merged #99 main `021f0f388b16ebcdff0f64ff44039d2ea07f4165` integrated in the follow-up. Source-only change. No schema, migration, account/role change, business-data write or Site publication.

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

The approved stage-catalog batch #99 is included through latest main, preserving its workflow checks and documentation. Other draft/canvas candidates in the workspace are deliberately not merged here. When they integrate, retain the inert facade and the removed direct interval lines; semantically combine cache/source-proof changes and rerun only affected checks. This branch changes no business schema/data and creates no production release.

## Independent review follow-up

The independent fixed-e37 review found three P2 issues; none is waived. The follow-up keeps initial focus inside an open history error dialog on permission/list 503 (two new regression cases), retains known HTTP error status when an expired explicit-read predicate rejects adoption, and composes the exact background source inverse before the existing authoring departure/panel proof without changing its old hashes or mutation negatives. The unchanged shared-read race runner now passes 20 checks; the unchanged source-EOL runner passes 78 checks.

The timer guard now follows client static/dynamic imports into local libraries and known timer aliases; synthetic import/alias/server-only tests cover that discovery. The remaining 44 registrations are reviewed one-shot deadlines/debounces/UI cleanup or local display clocks; no further periodic server query was found. Independent re-review of fixed `06ef6e2b821e5deef634f2d77aac1b7edcc274ec` confirmed all three P2 findings resolved with no new blocking finding; it independently passed 164 history/no-poll/source cases, read-races 20, source-EOL 78 and panel differential 15. The new uploaded head still requires its own full CI. Browser socket restrictions and hosted/physical-device acceptance remain unchanged and unverified.

The cancelled e37 Windows run exposed an additional obsolete assertion in `canvas-manual-sync`: it required the retired 4-second registration. That assertion now verifies zero idle interval and unchanged explicit-read authority/editor behavior. The unified-master legacy callback composition uses the same explicitly test-only driver as the other retained producer-fence tests; current production scheduling is verified separately. No application behavior or safety assertion is relaxed to satisfy these retired-cadence expectations.

The final 7d0f126 Windows run passed through build, AB/C, IPQC A/B, BOM and input abandonment, but stopped on two more retired-poll expectations: compiled transfer waited for a background FQC GET, and the deadline fixture called a removed notice interval. Both are migrated to assert no idle request while preserving the original stale-Save 409/unchanged stored data and 45-second abort/unknown/no-retry checks. No timeout increase, test skip, workflow relaxation or runtime change is used. Local browser execution remains blocked; the changed compiled scenario requires the existing remote CI run.

## Latest-main and FQC CI follow-up

Remote head efdaa3d passed the four module workflows plus Local safety's compiled AB/C, IPQC A/B, BOM, equipment transfer, input abandonment, hosted-deadline/source/permission and outbound-denial steps. Local safety then failed eight FQC readiness cases that still expected the retired timer. The current-runtime initial-load test now requires zero timer registration and no focus/visibility reread. All original callback race and scoped-denial assertions remain under an explicitly labelled, SHA-256-pinned test-only historical driver; four additional current-runtime event tests fence replies after remount/epoch change without timers. The 34 FQC cases, nine global no-poll cases and 20 #99 stage-catalog cases pass together (63 total). No runtime change, skip, timeout increase or CI relaxation is used.

Merged main 021f0f3 has no executable-file overlap with this batch. Its Local safety additions merge cleanly; the two prepend conflicts in CHANGELOG/HANDOFF retain both batches. Historical inverse proofs still target the unchanged five-file d4ac309 baseline; #99 does not change those files. The newly integrated head requires fresh remote CI and independent review; prior-head green steps are diagnostic evidence only. No merge or Site publication is claimed here.

The previously gated follow-up also exposed a real compatibility regression: the explicit-read predicate replaced a stale non-JSON parse error before returning it. The catch path now suppresses stale access/read-pause effects while preserving the original parse-error identity (or the existing strict HTTP/cause wrapper). POST handling is unchanged. The unchanged 51-case access-result runner and 34-case FQC runner pass. The shared-client cache tag is bumped to explicit-checks3 and both exact source inverse hashes/rules are refreshed without changing their pinned predecessors.

Independent review of the latest-main merge found five history assertions still expecting the superseded marker for strict stale non-JSON denial. They now require HTTP 403 plus the original SyntaxError identity; JSON still requires ACCESS_READ_SUPERSEDED, and all permissions/zero-POST/no-overlay assertions remain. An additional assertion proves stale denial does not pause history reads in the next view. The combined history, original-receipt recovery and navigation suite passes all 222 cases. A later IPQC A/B ACK-denial script imports a native-browser fixture and remains blocked locally by the documented socket restriction; no browser/environment workaround is used and the required remote CI test is retained.

The previously gated IQC parallel-read runner found owner-error precedence had also changed: an expired view predicate masked existing BEGIN_OWNER_CHANGED. Existing transport-owner/admission checks now run before the new view predicate at request admission and after a parsed response. This preserves pre-existing owner errors and still fences access/model adoption; POST logic remains unchanged. All 13 unchanged IQC parallel-read cases pass. The shared-client exact inverse is refreshed; explicit-checks3 is still unpublished and remains the single new cache version for this follow-up.

Publication minimization: HANDOFF remains byte-identical to latest main 021f0f3. This acceptance record and CHANGELOG retain the background-check integration summary; no new combined historical HANDOFF payload is part of this batch. The earlier local merge remains available in local commit history for recovery.
