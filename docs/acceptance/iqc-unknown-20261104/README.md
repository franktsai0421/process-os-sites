# IQC unknown-result reliability candidate — 2026-11-04

Base: fetched main `35949445ad073812863c0004acbee13ed3535747`. Independent branch `fix/iqc-unknown-operation-20261104`. Source-only candidate; no deployment, migration, live receipt query/retry, lock clearing or business-data mutation.

## Evidence and diagnosis

The delegated live observation was a v39/source `ddcbe99` IQC POST cancelled at 14.938 seconds, followed by two receipt 404s. Source confirms ordinary bounded IQC commands had a 15-second deadline. This establishes a plausible client-abort boundary, **not** whether the original command committed, nor the server bottleneck. The original live unknown remains untouched.

Source also confirms `VersionDraftUI.mount` moves `#iqc-shared-status` into collapsed history. The original query controls were inside that status. The new separate warning panel remains outside history, and the inspection-item dialog offers a query next to its error.

## Changes and preserved boundaries

- Exact bounded IQC workflow uses 45 seconds, matching existing read/Begin and bounded FQC budgets. Generic and unrelated command budgets are unchanged. A longer wait is not faster execution or a guarantee of completion.
- Unknown errors retain the original transport/decode failure and the separate failed receipt lookup as runtime-only `cause` / `recoveryCause`. Timeout still retains phase, deadline and original abort. No new recovery storage format.
- Only explicit receipt lookup resolves an existing unknown. Ordinary IQC write actions now reject an existing unknown immediately; they cannot query it and then continue a new command. The initial failure's existing automatic GET lookup remains; no automatic re-POST or Save is added.
- The dialog keeps entered values and stays closed to further submission once a result becomes uncertain, including after a successful query. The user returns to inspect the draft. A new form opened while unknown also cannot write. Query failure 404 explicitly says the result is still unknown, in Chinese and Vietnamese.
- Query ownership checks include actor object, identity epoch, mount, delivery and original transport. Concurrent queries are rejected. Existing full authoritative readback and access-denial handling remain.
- IQC-only request-local server timing reports a generated request ID, response status, last phase, total handler duration and accumulated phase durations. It includes state read, authorization, adapter, photo validation, projection, encoding and CAS; it contains no operation ID, command, identity or business text. Sink failure cannot change a write response. Duration ends at Response construction; later streamed body hydration/transfer is not included. The ordinary IQC `caseMetadata=1` route uses a nonstreamed response.
- No performance optimization, dependency skipping, permission relaxation, CAS/replay change or failure-boundary change. No schema/data-model/migration/account change.

## Verification matrix

Environment: managed Linux, Node 24.19, locked npm dependencies, in-memory SQLite/Map R2 and synthetic browser routes only. Browser viewport simulation is not physical iPhone or IME acceptance.

| Risk | Evidence |
| --- | --- |
| delayed ACK / timeout / diagnostics | `tests/iqc-write-reliability.test.mjs`: 32-second synthetic ACK, 45-second header and body timeout, 404, exact retained marker/reload, duplicate command, late receipt, actor change, unrelated BOM deadline; 5 PASS |
| actual writer / media / equipment / CAS | `tests/iqc-write-handler.test.cjs`: real IQC handler and records codec; new image + different tool, forced CAS retry, replay, missing receipt, request-before-revocation denial, timing and sink failure; 2 PASS |
| query ownership / readback | `tests/iqc-ordinary-verified-readback.test.mjs`: existing authoritative readback suite plus explicit query actor/mount/permission races, double click and no query-then-write |
| actual form / visible recovery | `tests/iqc-unknown-browser.test.mjs`: Chromium 390px Chinese and 1280px Vietnamese; normal unsent-input abandonment, photo upload, new equipment selection, 404 preserves input, query outside collapsed history, close/reopen with unknown never duplicates, successful query never resubmits; 2 PASS |
| shared transport/server regression | Combined FQC diagnostics/Apply/dependency and IQC editor/readback/recovery/departure suites: 266 PASS plus one stale IQC 15-second expectation. Updated that expectation to the intentionally changed 45 seconds, then all 5 deadline contract cases PASS. No other assertions relaxed. |
| independent review | Found and fixed auto-query-then-continue creation risk. Independent IQC suites 111 PASS and handler/timing 2 PASS before final presentation additions; final candidate review recorded in PR handoff. |

Typed lint, TypeScript, source preflight, build and exact PR-head CI results are reported with the candidate SHA in the PR handoff. Local test logs/screenshots remain outside Git; source fixtures are reproducible and contain synthetic data only.

## Limits / remaining work

- Original live operation remains unknown; this candidate neither resolves nor retries it. No current server latency attribution or speed improvement is claimed. After an authorized deployment, new timing evidence is needed to locate any slow server stage.
- IQC unknown-result cross-page abandonment is a baseline limitation: this module has not opted into `unknownTransports`/`discardUnknown`. Normal unsent input abandonment is tested. Generic unknown-departure tests do not establish IQC unknown navigation acceptance.
- Handler revocation test revokes **before** the next request; it does not assert newly added in-flight IQC revocation checks. Existing checks are unchanged.
- No live account/browser acceptance, deployment, physical device or native IME test. Draft PR only; Frank's review and separate merge/publication authorization remain required.
