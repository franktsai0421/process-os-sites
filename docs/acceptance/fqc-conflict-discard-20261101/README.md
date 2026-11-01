# FQC matrix conflict Discard → Save recovery

Status: independent local candidate based on merged #58 / `0008df71130fb165054fd38e9f801a86749237aa`. Not merged, published or deployed. No business data, account, permission, schema, employee DB or Site change.

## Defect and narrow repair

A real same-field `DEPENDENCY_CHANGED_RECONFIRM` 409 is proven pre-CAS and its durable transport marker is removed, but the settled Apply promise still records a synchronization failure. The matrix Discard previously removed private choices without retiring that exact failure. Save appeared enabled but `flush()` refused before any POST.

The matrix now retains volatile references to its own confirmed original command/error/client pairs. Explicit Discard first checks exact ownership and inactivity, reads the current FQC draft, validates current view/edit permission, generation, draft identity and pending lock, plus complete working/saved content and the unique matching draft snapshot, then removes only this batch's local recovery/choices and these exact confirmed failures. It adopts the fresh projection without any shared-data mutation. Save remains a separate explicit operation and retains the original server permission/CAS/receipt flow.

The transport capability is FQC-matrix-only. It verifies the original HTTP response provenance and immutable captured status/code/path, exact command bytes and operation ID, the same current actor/runtime client, and settled failure membership. It rejects unknown, unresolved receipt, queued/in-flight/begin/retry, revoked access, changed generation and pending state. It never clears by path alone, never clears another operation and never replays a POST. Failed reads or local cleanup leave the input and failure blocked. Repeated rejected attempts and toggling back to zero choices still require explicit Discard; an ordinary GET cannot dismiss the failure.

Cleanup failure is split by its actual owner: transport-marker finalization may already retire the failure, while helper-only finalization retains its exact conflict until explicit Discard. A later successful receipt cannot silently drop an earlier independent conflict proof; only failures actually absent from the original client are pruned.

The pre-existing generic field-based `discardRejected` API is not used or broadened. Other audited refusal codes, generic 4xx, forged error flags and GET/receipt failures do not acquire the new capability. Other scopes retain their existing behavior.

## Verification

- True RED: the actual FQC module, recovery helper, shared transport and signed TypeScript route over synthetic SQLite/R2 reproduced `failed: true` after the actual Discard handler. No product internals were replaced to make recovery succeed.
- GREEN: actual Discard performs a fresh GET and zero POSTs; the actual Save button then performs one Save POST. The other actor's selected cell and later unrelated edit both survive in the saved snapshot.
- `tests/fqc-matrix-conflict-discard.test.mjs`: explicit positive and negative tests for repeated rejection, zero-choice batch, ordinary GET, forged/changed/duplicate proof, same-account different client, unrelated same-path operation, read failure/revocation, edit revocation, generation change, pending lock, storage cleanup failure, eight malformed projection cases, both marker-cleanup branches, later unknown-operation receipt recovery, single-flight/retry, Save revocation, actor replacement, queued/in-flight/uncorrelated 409 and receipt 404. Real route auth, CAS and isolated persistence remain in the fixture.
- Existing focused suites cover FQC Apply reliability, matrix batching, bounded recovery/wiring, quality transports and pagehide generation. This is targeted regression, not full repository functional acceptance.
- `tests/fqc-matrix-conflict-discard-browser.test.mjs`: four CI-only Chromium cases (390/1280 px × Traditional Chinese/Vietnamese), two contexts and signed actual TypeScript routes. Registered in Local safety. **Not run locally**: existing native browser/socket limitations were not retried or bypassed. This harness validates the actual module UI with an isolated routed backend and synthetic UI permission/mount ports, not the compiled full root-entry Worker or live employees/physical phones. It omits the full application i18n/administration style stack; the viewport/language matrix is not full-layout or global-translation acceptance.

Reproduce portable proof:

```sh
node --max-old-space-size=256 --test tests/fqc-matrix-conflict-discard.test.mjs
```

The lower Node heap bound prompts collection between isolated route fixtures; it does not weaken assertions or skip checks. Runtime/tool output and review receipts are retained outside the source checkout, not published as private payloads.

## Current local result receipt

- New actual-module/route tests: **25/25 PASS**.
- Existing affected suites: **240/240 PASS** (separate final affected-suite rerun after review fixes).
- Separately frozen multiuser test handoff: **20/20 PASS** with `FQC_SOURCE` selecting this candidate’s product modules; the frozen handoff itself was not edited. Its native contracts are not native execution.
- Focused typed lint and JavaScript syntax checks: **PASS**. Full normal typed lint was attempted, but its `tsgolint` subprocess was killed with `SIGKILL`; one lower-memory/two-thread retry was also killed. Full lint is **unestablished**, not a source diagnostic pass, and remains a supported-CI gate.
- Diff whitespace: **PASS**. Native browser, full build and full repository suite: **not run locally**.
- Independent review found malformed fresh-projection cleanup and two lost-conflict lifecycle branches. All were reproduced RED against the frozen first candidate and fixed with scoped GREEN tests; final source/safety re-review of `93320e39ab1a6f0ebad8d658af7bbda074db9114` passed with no remaining known source blocker in this scope. The reviewer independently reran four representative cases (already included in the writer suites, not an additional coverage count). This is not release readiness.

## Remaining release gates

Independent source/safety review is complete; exact-head supported CI/native results must still be established before release readiness. Integrate cache tags for both changed JS assets with the separately staged UI/cache-tag candidate rather than overwriting it. This repair does not claim full FQC multiuser, live latency, reload/beforeunload, native IME or physical-phone acceptance. No automatic merge or deployment is authorized by this candidate.
