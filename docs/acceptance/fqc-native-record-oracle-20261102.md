# FQC native fixture record oracle

## Scope and evidence boundary

This tests-only candidate changes the two FQC native runners' authoritative
fixture inspection transport, not application routes, roles, state schemas or
browser success conditions. The PROCESS runner and the default root-entry
fixture are unchanged. No native run is claimed by this local checkpoint.

CI 41369898655 failed after 127 FQC action samples / three complete cycles.
The page was ready, but the test-side read failed at `record-decode`; D1's
failure-only revision probe still returned revision 12. This is not a complete
five-cycle result, and its matrix suite did not start. Earlier 165-sample FQC
success remains separate historical evidence.

A private Linux non-browser probe using actual Miniflare 4.20260515.0 and the
production decoder also produced `TypeError: fetch failed`, with
`UND_ERR_SOCKET`, after 16 decodes. That does not prove the Windows CI has the
same socket failure. A subsequent instrumented 300-decode run and separate
property/method probes did not reproduce it; no fix had been applied, so these
are not red-to-green evidence. No dependency patch or retry is introduced.

## Transport change

The opt-in root-entry fixture adds a private service Worker in the same owned,
nonpersistent Miniflare instance. It uses the same D1 and R2 identifiers as the
application. It has no public route, asset mapping or browser-facing port.
One fixed GET through `getWorker()` performs exactly the original D1 SELECT,
JSON parse and full production `decodeRecordValues(bucket, envelope)` call,
with default options. The decoder is bundled from the current repository, not
copied or reimplemented. Its bundle SHA-256 is included in native reports.

This keeps per-object R2 metadata/getter/body accesses inside workerd instead
of crossing the Node binding proxy for every operation. The complete `values`
map is returned once. Original browser action lists, mandatory clicks, HTTP
checks, state comparisons, read-only checks and timeouts remain intact. Oracle
inspection remains outside UI duration, as before. No request is retried and
no partial-state, cache, history omission or fallback can satisfy the oracle.

The one service request, setup/migration/seeding D1/R2 proxies and other
fixture calls can still fail. Any failed dispatch, response body, decoder or
shape check fails the test. This is not a claim of eliminated transport faults,
measured product speed improvement or a proved root cause of the CI failure.

## Local validation

- Five unchanged synthetic FQC seeds produce exact full-value equality between
  the previous Node/proxy decoder and the workerd oracle.
- The application and oracle read the same isolated database; inspection does
  not mutate its row. An additional unrelated historic snapshot is preserved.
- Missing/corrupt aggregate and historical body, unrelated aggregate corruption,
  malformed manifest/JSON and absent row remain fatal in both decoders.
- Wrong method/path/query cannot invoke the private reader; no application route
  exposes it. Dispatch/body errors retain failure, with exactly one attempt.
- Existing FQC browser contracts and matrix guard tests remain required.

The contract fixture uses a tiny synthetic Worker to validate binding and
oracle equivalence. It is not the compiled application or a Chromium result.
The actual compiled-browser CI remains necessary before release decisions.

## Later-merge gate

This candidate retains the main `c129318` baseline and does not contain #61.
If a later merge adds `node:async_hooks` or another native builtin dependency
to the decoder, explicitly verify neutral-bundler/native `nodejs_compat`
compatibility and rerun the oracle contracts on that exact merged source.
The present checks do not cover that future integration.
