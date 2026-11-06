# Necessary normal workflow reads — local successor

Useful result: the pure-since candidate is superseded, not integrated. The successor covers normal compact C workflow reads still required when B removes the background timer. No public consumer/scheduler, transport, payload, frequency, authority cache, write or retry changes. PR #89 remains frozen at `429e178`; no push, PR mutation, merge, deploy or live action.

## Exact predicate and overlap

Only product file: `app/api/ipqc-c/workflow/route.ts` GET (near lines 59–61):

```ts
const workflowReadAhead=query.get('caseMetadata')==='1'&&query.get('compact')==='1'&&
  [...query.keys()].every(key=>['since','caseMetadata','compact'].includes(key));
```

The `readState` options receive `...(workflowReadAhead?{aggregateReadAhead:true}:{})`. This uses the unchanged common helper (up to five pending aggregate GET metadata requests) and preserves full selected aggregate/body traversal, SHA/JSON/error ordering, session and permission checks. No keys, bodies or D1 queries are removed. Mixed selectors fail the predicate and follow the original reader. The original pure-`since` predicate is removed.

| Necessary consumer/path | Route/query | Benefit |
|---|---|---|
| Enter page / explicit load retry / module data reload | `/api/ipqc-c?caseMetadata=1`, then or alongside workflow `permissions=1` | None; both excluded/unmodified |
| Read-denial retry / explicit reload / post-query UI adoption | same root data GET + workflow permissions GET | None; all safety checks retained |
| Existing error recovery readiness and reconciliation | `/api/ipqc-c/workflow?caseMetadata=1&compact=1` via `read()` without since | Yes |
| Begin preflight / ordinary bounded terminal read after Save, Submit, Withdraw or review confirmation | same normal workflow GET; request-level access acceptance retained | Yes |
| Create-item exact terminal read | normal endpoint plus `readback=ipqc-c-create-v1` | No; existing narrower key policy is preserved |
| Receipt query | normal endpoint plus `operationId` (optional `accessEvent`) | No for receipt GET; its subsequent ordinary verified terminal GET can benefit |
| Fixed history/case/version/restore / UI metadata / permission refresh | `history`, `caseId`, `versionId`, `restoreSaveId`, `legacyHistory`, `legacyVersionId`, `uiHistory`, or `permissions` | No |
| Removed background callback | normal endpoint plus since | No continuing consumer is required; candidate does not justify retaining callback |

Source locations: `public/process/ipqc-c.js` sharedTransport endpoint near line 44, recovery reads near 124–215, root data/permission reads near 510–535, manual reload near 980–997. Common transport appends `compact=1` at request dispatch; normal read/preflight/terminal consumers are near `public/process/shared-draft-client.js` 746, 906 and 972. These files were inspected, not edited. B owns the scheduler/Save adapter and when those operations perform reads.

## Strict source gate and exact paths

Historical gate: `scripts/test-ipqc-c-permissions-read.cjs`, P8. Frozen pre-opt-in route hash is `67dfc685a2374aeba0e2c8f3154a3594c69e8526a0201794a29e0ce6ee07c25e` at `429e178`.

New dedicated inverse: `scripts/ipqc-c-read-io-source-contract.cjs`. It requires the complete candidate hash, one exact unique opt-in span, and reverses only that span to the complete frozen route hash. `tests/ipqc-c-read-io-source-contract.test.mjs` rejects missing, duplicated, predicate-mutated and unrelated drift inputs and confirms full prior bytes. No baseline update, ignored span or relaxed comparison.

Shared proof entry overlap: `scripts/ipqc-c-local-save-source-contract.cjs` adds this exact inverse before its existing `withoutDurableBegin` call **for this route only**. All its older contracts/rules/hashes remain unchanged. Existing proof continues through `scripts/workflow-begin-source-contract.cjs`, `scripts/ipqc-c-create-source-contract.cjs`, `scripts/ipqc-c-composed-performance-source-contract.cjs`, `scripts/ipqc-c-permissions-source-contract.cjs` and `scripts/ipqc-c-operation-source-contract.cjs` to the full original baseline comparison. Other proof files were not edited. Coordinate this one entry-line change with the B/core owner; the actual common production libraries remain untouched.

## Commands and evidence boundary

```sh
node scripts/test-ipqc-c-local-read-io.cjs
IPQCC_MODEL_GET_DELAY_MS=1000 node scripts/test-ipqc-c-local-read-io.cjs
node --test tests/ipqc-c-read-io-source-contract.test.mjs tests/fqc-read-ahead.test.mjs
node scripts/test-ipqc-c-permissions-read.cjs
node scripts/test-ipqc-c-bounded-read.cjs
npm run lint
```

The fixture has 1,735 C rows, two historical withdrawn cases and five small unrelated synthetic modules. The measured primary request is normal `caseMetadata=1&compact=1` **without since**, so timer removal does not remove this consumer. Paired checks assert equal payload, equal multiset of fetched objects, no state/R2 mutation, unchanged-since parity, explicit selector exclusions, session revocation enabled, fresh account/view revocation, revoked session denial and 30 missing/corrupt-object failures. Selector tests use original statuses/bodies without weakening expectations.

15 R2 GETs and 14 D1 SELECTs (one state + 13 revocation) are **synthetic model counts**, not counts attributed to any of the supplied live traces. The supplied 6.2–7.6s Worker records establish a slow read route only. A 1s delay per modeled R2 GET is not remote storage measurement; it omits D1/body-transfer/cold-start scheduling costs. Same-object/read/auth parity does not prove equal instantaneous stream-memory usage: candidate intentionally permits five pending GET handles, using the existing helper's cleanup and ordered consumption policy. Full exact-base/receipt/unknown/pending semantics remain and no access checks are cached.

Final local test/model results are added after executing against the committed successor. No unmodified browser/whole-application suites need repeating for this GET-option-only candidate.

### Final local results

- Normal no-since necessary read, per-GET 1s model: **15.060s → 9.040s**; both read exactly 15 R2 objects and perform 14 D1 reads (1 state + 13 session revocation). Payload and object multiset are equal. [Delay model](necessary-read-delay-model.json).
- Final no-delay correctness run: about 23.92ms → 24.06ms, not evidence of CPU acceleration. Includes 30 missing/corrupt objects and two session revocations triggered during R2 hydration (one for each mode), all denied/failing as expected. [Correctness output](necessary-read-correctness.json).
- Full `test-ipqc-c-permissions-read.cjs`: **P1–P8 PASS**, including the unchanged full historical source baseline proof, role/session/revocation tests and original I/O assertions.
- Full `test-ipqc-c-bounded-read.cjs`: **9 groups PASS**, including its historical source/domain/image byte proofs. Expected fault-path diagnostics in this suite do not change its PASS outcome.
- `node --test tests/ipqc-c-read-io-source-contract.test.mjs tests/fqc-read-ahead.test.mjs`: **49 PASS**; includes exact inverse and negative mutation cases. Existing common helper remains byte-unchanged.
- Lint PASS. No browser/full-application suite was rerun because no consumer/UI code changed in this successor.

The original P8 failure described in README.md is resolved **only in this local successor** through the exact inverse. PR #89 is still unchanged. For integration review use the **net diff from frozen `429e178` to the final local successor**, not standalone pure-timer commit `89a0380`. Production overlap is the route GET-options hunk; proof overlap is the single route-only entry call in `scripts/ipqc-c-local-save-source-contract.cjs`. All other changes are dedicated fixture, negative test and evidence files. B must coordinate any later alterations of the route/proof chain; no scheduler or Save adapter hunk is included.
