# FQC Apply reliability — isolated candidate, not deployed

Base: `268a8e49ec751bb6849033e20a27d30194aad67c` (merged #55). Separate from routine FQC, AB performance, login and canvas work. Only synthetic data, memory SQLite/R2 and ephemeral signing keys were used. No employee record was read or changed by these tests; no Site or account configuration changed.

## Cause and evidence

The shared transport gave FQC mutations 15 seconds, although Begin and reads already had 45 seconds. Sanitized hosted observations included one successful FQC POST taking approximately 32 seconds and several canceled POSTs near 15 seconds. They lack operation/actor/query correlation: they do **not** prove which particular operation committed or that a 404 meant rejection.

A controlled slow-R2 test with the actual FQC handler reproduced `RESULT_UNKNOWN_CHECK_BEFORE_RETRY` at the old cutoff. The original server operation can continue after the browser abort; its concurrent receipt read can see an older snapshot and return 404. Clearing the unknown marker or issuing a new operation would risk a duplicate or overwrite. The original screenshot's message was cropped; its full code was not inferred from the image, and no private image/content is included here.

## Changes

- Only the exact bounded FQC transport gets a 45-second mutation budget. This prevents the observed 32-second class of operation from being canceled at 15 seconds. It is **not** a latency target or an unbounded retry. Other scopes retain their existing budgets.
- FQC's exact workflow route uses one request-local permission evaluation per selected State/attempt. Fresh session and revocation checks remain at initial identity, the end of permissions, before encoding, and immediately before CAS. Replay has its own final fresh check. Preflight and selected GET phases are separate. The original direct create/restore checks remain.
- The shared-state revision check/CAS retry still reselects account epoch, permissions and maintenance. This does not promise a new mid-request permission snapshot or bypass the existing CAS contract.
- The earlier AB phase uses the identical evaluator/body; an exact reversible source contract proves every unrelated identity/revocation byte remains unchanged. No permission cell, role or stored schema was added.
- Exact bounded FQC Apply alone requests `projection=fqc-apply-ack-v1` with unique `compact=1` and `caseMetadata=1`. Successful Apply/replay retains the complete receipt and global revision but omits duplicate live bodies from the POST wire. The original visible/compact projection still runs first, including its failures; no R2 read, body validation, permission check or CAS is skipped. The mandatory fresh terminal GET remains the only adopted full model. Old clients/servers remain compatible; Begin, Save, restore, errors and GET retain their old response contracts.
- No success/receipt/owner/tab/generation guard was removed. No automatic POST retry, local-storage cleanup, working-to-saved promotion or saved-input discard was added. Busy forms still freeze the submitted controls and keep input on failure.

## Apply coverage

| Entry | Isolated coverage |
|---|---|
| New/edit error code | Actual form handlers → actual FQC route; name preserved, server numbering, explicit Save, reload |
| New/edit check item | Actual form handlers → actual route; independent input and media/other fields retained |
| Batch existing-item product assignment | Explicit form Apply; full authoritative working result; not automatic Save |
| Matrix choices | Local only until explicit Apply; add/remove via durable batch and bounded receipt/readback |
| Soft-delete item/error | Existing guarded Apply; tombstones/Save boundary retained |
| Equipment replacement | Existing FQC bridge Apply; dependencies checked; active and saved remain unchanged |
| History restore Apply | Exact saved ID/revision; working changes only, saved/active retained |

Legacy equipment replacement without an adopted workflow uses its separate legacy endpoint and was not changed. Legacy approve/return/withdraw paths likewise are not silently converted by this change. FQC Excel is export-only and has no additional Apply endpoint.

## Counts and measured synthetic speed, not a live speed claim

Actual handlers on the same synthetic record-storage fixture; Apply/Save include the mandatory terminal GET:

| Operation | Prior fresh revocation reads | Candidate | R2 reads |
|---|---:|---:|---:|
| Begin | 13 | 4 | unchanged, 12 |
| Existing Apply | 39 | 8 | unchanged, 25 |
| Insert Apply | 40 | 9 | unchanged, 26 |
| Save | 39 | 8 | unchanged, 26 |
| Receipt lookup | 26 | 4 | unchanged, 13 |
| Full workflow GET | 26 | 4 | unchanged, 13 |

### Fixed-source n5 paired benchmark

`node scripts/benchmark-fqc-apply.cjs` compares exact main server bytes, the candidate server without the ACK selector, and the candidate ACK. Same current transport, ephemeral fixture with 256 items; alternating pair order, n=5 for every cell, 150 successful operation samples across two explicit wait profiles. No failed sample is discarded. The fixture records a parsed response clone for wire evidence; wall/CPU include this diagnostic overhead and do not estimate deployed or native-browser latency. Machine-readable min/median/max, CPU, SQL, R2, consumed body bytes and wire counts are in [performance-summary.json](performance-summary.json).

No added storage wait, whole Apply including mandatory terminal GET, median milliseconds (range):

| Operation | Main | Phase, legacy full POST | Phase + ACK |
|---|---:|---:|---:|
| Existing Apply | 92.73 (82.04–121.16) | 67.28 (66.34–72.17) | 54.18 (47.19–60.62) |
| Insert Apply | 88.79 (84.37–97.32) | 66.23 (59.36–76.30) | 52.41 (48.28–61.87) |

Existing Apply POST shrank from 400,515 to 274 bytes; complete two-response wire total from 801,066 to 400,825 bytes. Insert total shrank from 801,442 to 401,013 bytes. The POST still sends 361 bytes for the measured edit; there are still exactly one POST and one GET. Existing Apply total SQL calls: 44 → 13; R2 GETs: 25 unchanged; consumed R2 body bytes: 638,220 unchanged. These are synthetic byte/count facts, not private production payloads.

With explicitly artificial 5 ms per SQL call, 15 ms per R2 GET and 5 ms per R2 put, existing Apply medians were 694.77 → 485.04 → 477.24 ms; insert 720.54 → 513.59 → 501.74 ms. This separates permission-roundtrip savings from the smaller additional ACK wall-time saving when storage dominates. These waits are **not live latency**. Save has no ACK optimization; its same-phase variation is noise, not a claimed improvement.

The R2 traversal and full receipt/readback cost remain. No unrelated corrupt/missing aggregate is skipped or cached across independent reads. Removing those reads or trusting a POST in place of terminal verification would change the fault/authority contract and is deliberately outside this patch. No all-page speed target or deployed timing improvement is claimed.

## Verification

- PASS: `tests/fqc-apply-reliability.test.mjs`, 43 actual-handler/transport/synthetic-DOM cases; baseline red test reproduced before runtime edits. The ACK companion adds 22 projection/compatibility/fault/owner tests, including wrong operation/generation, missing receipt, old clients and terminal denial. The companion uses the same storage/fresh-auth fences, not a mocked success proof.
- PASS: existing FQC feedback/race suite, 25 groups; existing record mutation and lifecycle8 regression suites.
- PASS: exact FQC and AB auth-source inverse and changed/duplicate/missing/outside-span negative checks.
- Coverage includes same-field conflict, different-field merge, same-account tabs, prior/next form input, precommit timeout, committed lost ACK, receipt 404, 403, pending lock, revocation/read failures at fresh boundaries, immutable-write revocation, CAS permission/epoch/maintenance changes, fingerprint reuse and actor ownership, repeated page re-entry and old-form ownership refusal.
- Native Chromium form tests are registered in Local safety CI for 390/1280 px and Chinese/Vietnamese with actual handlers and isolated SQLite/R2. The first public reliability commit passed all four on CI run `41275475737`; the ACK follow-on requires its own exact-commit CI run. They are **not locally passed**: this executor's browser/socket restriction was already established, and was not retried or bypassed. Synthetic DOM is not native UI acceptance or a physical iPhone test.
- Full `tsc --noEmit --incremental false` and the normal guarded build passed locally for the first reliability candidate (including the post-build known-auth-client check). The ACK follow-on also passed full TypeScript and normal typed lint on its five affected code/test files. Its final guarded build/source preflight are required separately before publication; exact receipts belong to that final commit, not this earlier pass.
- Normal typed lint ended with child `SIGKILL` both during the initial overlapping compiler window and in the later isolated window. It remains BLOCKED, not PASS; no cause was guessed. A separately labelled focused **non-type** lint passed after fixing one unnecessary fixture spread; that does not replace normal typed lint.
- The first CI run completed all functional/native/source/build steps, but normal typed lint failed on one new test-only `await-thenable` diagnostic. The closure-assigned in-flight promise is now initialized as a Promise without removing the awaited original server completion. The diagnostic baseline has its own unrelated errors; they do not excuse this new failure. Exact follow-on CI must pass.
- Full-history/worktree source preflight and the committed 114-comparison auth-source contract passed. Exact final source/CI receipts are recorded by the publishing parent; native and normal typed-lint CI remain required before readiness is claimed.

## Data model and remaining risk

No schema, migration, data package, credentials, media or visibility change. A request exceeding 45 seconds, an unavailable/404 receipt, or revoked permission still remains conservatively unresolved. That is deliberate protection, not a claim of rollback. Existing unresolved employee operations must be queried through their original receipt; this patch does not blindly clear them. Native CI and final checks are release gates; no merge or deployment is authorized by this report.
