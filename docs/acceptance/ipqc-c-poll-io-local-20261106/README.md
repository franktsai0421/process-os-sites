# Local-only IPQC C unchanged-poll I/O candidate

Frozen PR #89 remains `429e1784b93a76105a651ad8d1d7629e5a1eeef6`. This work is on local branch `perf/ipqc-c-unchanged-poll-local-20261106`; no push, new PR, merge or deployment. It does not modify the B line's scheduler/Save adapter or the shared transport/state libraries.

## Useful findings

Parent supplied a sanitized authorized Worker-log observation: 14 successful GET `/api/ipqc-c/workflow` events with query keys `since/caseMetadata/compact`, at roughly 30-second intervals, had wall time 6.196–7.572 seconds and CPU 0.747–0.944 seconds. Those are actual server observations, not CUA durations. They cover later reads, not the earlier Save/approval traces. One 503 and one canceled read cannot classify any write or justify replay. No raw logs, account data, headers, signatures, addresses or operation identities are stored here. This worker did not query live logs or operate the Site.

Source matches this query path: GET loads `readState` before checking `since`; no pure-poll shortcut exists. `readState` reads one D1 manifest, then the records decoder traverses all selected aggregate objects and required immutable bodies, validates their hashes and hydrates the C model. `readControl`, identity and access precede the unchanged response. Thus an unchanged response still incurs full selected-state I/O. Exact deployed commit/source was not independently recovered here; the log route/query and repository handler correspond, but middleware/platform contributions remain unallocated.

A private fixture with 869 errors + 866 items, two archived withdrawn cases and five small unrelated synthetic modules performs 15 R2 GETs. With session revocation explicitly enabled it also performs 14 D1 SELECTs: one shared-state read and 13 session-revocation lookups. These counts are fixture evidence, not claimed live-object counts. The repeated authorization calls are a second coordination target; consolidating them touches common `workflowAccess`/`can`/`identity`/`verifiedSession` semantics and is not changed in this branch.

## Minimal candidate and exact overlap

Only product change: `app/api/ipqc-c/workflow/route.ts`, GET query classification and its `readState` options (approximately lines 59–62). A query containing `since` and only `since`, `caseMetadata`, `compact` opts into the existing `aggregateReadAhead:true` capability. Existing helper overlaps up to five aggregate GET metadata requests. Body consumption, SHA/JSON validation and error traversal stay in order; required immutable bodies and the final permission/revision checks remain. No object or response is cached across requests. No data, dependency, role, history, receipt, pending, CAS or selector checks are removed.

No product edits to `lib/process-state.ts`, `lib/state-records.ts`, `lib/versioned-shared-workflow.ts`, `public/process/shared-draft-client.js` or `public/process/ipqc-c.js`. No payload/compact-protocol change, no timer/frequency change, no stale-view bypass, no write/retry. A mixed receipt/history/permission selector does not activate this opt-in. Integrate this small GET-options hunk with the B line explicitly; do not overwrite its scheduler/Save-time work.

## Before/after evidence

Run `node scripts/test-ipqc-c-local-poll-io.cjs` for correctness and counts. Run `IPQCC_MODEL_GET_DELAY_MS=1000 node scripts/test-ipqc-c-local-poll-io.cjs` for the delay model. Baseline uses the same current handler/payload with read-ahead disabled only in the test's readState wrapper; candidate uses the production opt-in. A fresh request still reads every selected object. Paired payload and sorted object-read sets must be exactly equal; the underlying DB/R2 snapshot must be unchanged.

The per-R2-GET 1-second model is not live timing: it models GET admission latency only, not body transfer size, D1 latency, cold start or scheduling. The initial pair was 15.05s serial versus 9.04s overlapped, 15 GETs on both sides, maximum in-flight 1→5. This demonstrates six seconds of serial amplification can be avoided in that model; it does not show a six-second live improvement or solve the remaining serial body/D1 costs. A separate no-delay run was about 24ms→22ms with session revocation enabled; do not infer CPU savings from that small single pair. Final enabled-revocation pair: 15.064s → 9.047s, with all 14 D1 reads retained; [safe aggregate model output](delay-model.json).

## Tests and integration limits

New fixture checks unchanged payload/object-set parity, no state writes, mixed receipt selector, no-since fallback, fresh view revocation and revoked sessions, plus 30 missing/corrupt-object cases with matching 503 outcomes. Existing `tests/fqc-read-ahead.test.mjs`: 48 PASS, exercising the unchanged common helper's overlap/fallback/failure behavior. Lint checked locally.

`test-ipqc-c-permissions-read.cjs` P1–P7 functional/authorization/revocation/I/O checks PASS. Its final historical whole-source byte proof FAILS because the new opt-in is not in the old source-inverse reconstruction. The proof was not relaxed or edited. Integrating the candidate requires an exact reviewed inverse for these added lines before CI can pass that source proof; coordinate that with the B/core owner. This is reported as an unresolved test gate, not a successful full suite.

No production improvement, rollout, live data mutation or diagnosis of earlier unknown writes is claimed. PR #89's source is untouched on its branch. Its busy-after-redraw and equivalent-algorithm benchmark observations are separate follow-ups; this candidate does not alter those consumers. Exact production helper/render timing must supersede the earlier equivalent-algorithm microbenchmark before making a product function performance claim.

## Superseded scope — timer removal

The original pure-`since` opt-in in local commit `89a0380` is **not for integration**. Its only direct C consumer was `scheduleSharedRefresh`; B owns removing that background timer. Keeping or optimizing a timer is not the user requirement. The current local successor is documented in [necessary readback candidate](NECESSARY_READBACK.md); it supports ordinary safety reads without a timer or `since`. The original delay artifact above remains historical model evidence only.
