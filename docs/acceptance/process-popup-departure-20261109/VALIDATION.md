# PROCESS popup departure cleanup — isolated validation

Base: `4a10e935`. Local source only; no publication, API/business-data mutation,
schema change, version-view policy change, or Canvas change.

`master-data.js` now counts unapplied equipment popup input as local input.
Both clean departure and projection reset clear the equipment editing closure
and current-owner name bindings. Same-page equipment filters/language repaint
retain input. Existing unknown operation references remain intact. Cross-owner
name cleanup still uses the existing runtime installation before projection
reset; this change does not broaden the name-discard API.

| Check | Candidate | Baseline master-data source |
| --- | --- | --- |
| New actual-closure popup suite | PASS: 8/8 | FAIL: 6/8; 2 pass |
| Existing input-resource lifecycle suite | PASS: 15/15 | Not rerun |
| Existing departure-bindings suite | **FAIL: 89/154**, 65 pass | **FAIL: same 89/154**, 65 pass |
| JavaScript syntax; targeted oxlint; diff whitespace | PASS | Not rerun |

The new suite loads the complete equipment closure, production master departure
block and departure coordinator, and the actual name-binding cleanup methods.
DOM/storage/unknown-client ports are bounded synthetic ports. It checks clean
and dirty popup departure, reentry/language non-revival, same-page retention,
unknown marker preservation, direct/identity-install projection resets, and late
photo preparation. It is not native-browser or full API acceptance.

For the baseline comparisons, the exact `4a10e935` master-data bytes replace only
that source read in memory; every test and other source remains identical.
The old suite's failures include incomplete extraction fixtures referencing
`saveChoices`, `cancelSaveComparison`, and `clearConflictEscape`. They were not
modified or reported as passing. The sorted unique 89 failed test names have the
same SHA-256 in both runs:

`98c3e451c9fd9b8da5db1583767e29fc3ee57057159c2d5071e5072c4002bd5c`

Hash encoding: UTF-8 `JSON.stringify(sortedUniqueFailedNames)`, stripping only
elapsed-time suffixes and excluding the reporter's “failing tests” heading.

Raw logs and machine-readable results are retained locally outside the checkout:
`/workspace/scratch/73c7e87b530a/process-popup-departure-evidence-20261109/`:
`popup-current.log`, `popup-baseline.log`, `input-resource.log`,
`bindings-current.log`, `bindings-baseline.log`, and `results.json` (full failure
sets plus each log's SHA-256). No existing failed log was overwritten or removed.

Remaining validation limits: inherited old-suite failures; no native/mobile UI
run or deployed acceptance. No data-model impact identified.
