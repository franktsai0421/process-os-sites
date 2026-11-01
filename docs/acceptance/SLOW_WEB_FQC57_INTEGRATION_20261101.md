# Four slow operations: first implementation integrated with FQC #57

Local integration only. No publication, merge, deployment, data migration, employee write, or live performance acceptance is implied.

## Source and scope

The public baseline is `848be13da54c7ae747bcdd96df19e01129fe980a`, tree `39c8c63d040322842312605aaaac778ecd937b2e` (merged #57). Two separate merges retain the reviewed backend candidate `8286b235d66e6f3c2826bc011bcd09d246dccaea` and routine frontend candidate `ac93517d91cb619088f715a7ba24e454b755dbcf`. These local candidates are not described as previously published Git history.

Implemented in this first batch:
- Master **AB Save**, not IPQC-AB and not general Apply: exact command/route/scope, same-row authority first, private single-use capability, original full master parser/projection and all non-target manifest refs preserved.
- IPQC-C workflow **GET**: five authority values plus the C control aggregate, same snapshot and original selector semantics.
- Routine-FQC **GET**: five authority values plus routine control, enablement, quality sources and master catalog; not the distinct data-backend FQC Apply path.
- Request-local pure permission calculation with separate fresh identity/revocation fences. It does not cache current DB authority across requests or combine rows from different revisions.
- Routine first mount uses one full GET instead of availability plus the same full GET. Generation still performs a real POST and a distinct confirmation GET. Unknown receipts are not automatically resent; exact first-read `404 FQC_NOT_ENABLED` alone selects the disabled UI.

Not implemented: general AB Apply closure optimization and destructive Apply's cross-module retained-history reference closure. Master internals C/PROCESS and quality internals still retain their original full validation boundaries. No new global cache, speculative business fetch, hash weakening, scope inference or migration is introduced. The earlier 12-file raw-reuse proposal is not included; its separate evidence remains historical and should not be published as though it were this payload.

## Integration boundaries

`lib/process-state.ts` retains #57's AB/FQC common pure evaluator and exact FQC factory. The only addition relative to public main is the previously reviewed scoped GET factory. `lib/versioned-shared-workflow.ts` retains #57's Apply-only ACK selector, full validation before ACK shaping, fresh terminal read/receipt behavior and CAS retry handling; only exact AB Save obtains the separate private capability. Retry creates a new state/capability/phase.

Two strict inverses cover both shared files:
1. remove scoped GET/AB Save additions → exact public main848 bytes;
2. remove FQC #57 integration additions → exact reviewed backend8286 bytes.

Unique spans, whole-file hashes and negative mutation tests are preserved. The old b625 baseline is reconstructed from the original fixed `a2ec...` 45-file manifest after these inverses, not renamed main848 and not represented as a remote Git ancestor. Public-main comparisons are separate from baseline-bytes permission-phase comparisons.

The required-authority/target/reference fault policy is explicit: necessary malformed/missing/corrupt data blocks; proven unrelated aggregates may remain unread, unverified and retained in the manifest. Diagnostic scope/revision/count is preserved, not falsely called a full integrity check. Required faults do not fall through to the full reader. Missing shared_state does not trigger a second SELECT. HEAD and legacy formats preserve the original fallback; legacy mixed blobs do not claim zero pre-authorization business bytes. Optional platformUsers mirrors are not authority, defined maintenance syntax and original override priority remain, and literal `__immutableBody` text is not confused with a real reference.

## Reproducible verification

Save's original 113 callbacks/assertions are byte-pinned through an exact registration-only inverse. All cases remain available in the original unsharded invocation. The CI runner uses six sequential resource-bounded shards, checks the exact unique union, preserves native exit/signal results and requires zero skipped/cancelled/todo cases. The local declared order and reverse **within each shard** both ran all 113; this is not a claim that the previously blocked unsharded entry or global reverse order passed. Each test owns its SQLite/R2/session/hooks/receipt fixture; the shared compilation cache contains source text only.

The new six-case seam passes real production route Responses into the real routine frontend VM. It tests full initial reads, persisted unknown, actual generation/CAS and fresh confirmation, and disabled/required-fault/late-revocation boundaries. It is not a browser or HTTPS test. Prepared Windows browser scenarios intercept an isolated `.invalid` origin and directly mount at two viewports/two languages; their result must not be mislabeled full navigation or live backend timing.

## Results and remaining gates

The integrated runtime source was frozen at `1f625ee3fff2e815f1b2d222bc284a541c204653` for the following sequential local runs. Later harness/documentation changes do not silently relabel that measurement commit.

- #57 actual FQC Apply/ACK: **65/65 PASS**.
- Seven affected routine initial-read/receipt/departure suites: **220/220 PASS**; new real-route/frontend seam **6/6 PASS** separately.
- Existing AB phase/replay plus Save compatibility: **69/69 PASS**.
- Save capability: **113/113 PASS** declared shards and **113/113 PASS** reverse-within-shard, the same 113 cases, not 226 distinct cases.
- Scoped read **245/245 PASS** and permission phase **229/229 PASS**, complete unique unions, zero skip/cancel/todo. The separately run source-pin case overlaps these 229 and is not added again.
- Exact baseline/materializer contracts, T5/access and both C source/runtime scripts passed. New baseline CLI has six pre-fixture negative admission cases.

True public main848 → integrated GET comparison (7 samples/source/profile, 56 timed samples total; 84 complete selector contracts and 13 named fault policies per source):

| Route | SQL | R2 GET | decoded bytes read | no injected wait, median/max ms before → after |
| --- | --- | --- | --- | --- |
| IPQC-C workflow | 14 → 5 | 26 → 8 | 147358 → 5367 | 42.446 / 154.421 → 7.572 / 21.854 |
| routine-FQC | 12 → 5 | 26 → 15 | 147358 → 9492 | 37.922 / 53.687 → 8.312 / 34.261 |

With an artificial 12 ms per R2 GET, C was 335.872/343.710 → 96.452/108.176 ms and routine was 343.535/534.258 → 185.922/212.736 ms. These are VM diagnostic workloads, not network or storage-service estimates. Their 07:02:20–07:03:22 UTC runner window was separate from other team runners.

The separate original a2ec baseline-bytes → integrated permission-phase comparison ran another 56 timed samples and all **594 full DTO contracts (198 × three sources)**. SQL was C 16→5 and routine 14→5; existing R2 count/bytes/order stayed identical. Zero artificial-wait median/max: C 30.296/45.194→8.547/21.451 ms; routine 28.774/58.015→13.616/41.009 ms. Artificial 12 ms per SQL: C 228.717/251.552→70.897/76.736; routine 200.871/238.356→75.910/104.768 ms. Preserve the system-CPU regressions: C zero-wait max 4.655→5.264 ms; C artificial-SQL median 0.032→0.780 and max 8.134→8.399 ms; routine artificial-SQL median 2.052→3.988 ms. The two different baseline/wait experiments are not pooled into a single speed claim.

A separate true-main848 **AB Save** comparison at `edec8049c34cce1861b5008aa3f50710c2b90f40` ran 28 timed samples (7/source/profile), all seven legacy/full-reply contracts and six named fault policies per source, plus ten full authority-compatibility DTO/persisted-state pairs. All passed. SQL deliberately **7→8** (one additional fresh authority fence); R2 GET **18→10**; read bytes **151343→6419**; CAS/PUT stayed **1/1**, written bytes stayed **5347**, and peak GET remained **2**. Zero-wait median/max was 16.674/42.585→14.758/28.113 ms; artificial R2 12 ms was 227.516/238.672→127.624/130.278 ms. System-CPU regressions remain: zero-wait median 0→3.670/max6.219→8.858 ms, artificial-wait median2.208→3.736 ms. Before/after child order and CPU/GC costs are harness diagnostics, not deployed guarantees. Window 07:10:10–07:10:30 UTC also included seven pre-fixture baseline-admission refusals and the existing three script-bundle tests; no other team runner overlapped.

The routine source remains in the existing content-hashed shell bundle; the script build proof retains exact source ordering and #57 assets without overwriting `index.html` or weakening cache identity.

The source manifest, independent review, full-history/worktree preflight, final typed lint/type/build and fresh public-like/autocrlf checks remain separate release gates. Local gate receipts accompany the fixed source manifest, and eventual public CI must target the exact published head. Earlier standalone SIGKILL/blocked unsharded outcomes remain historical and are not erased by sharding. Windows browser/CI and deployed acceptance have not run for this local combined candidate.

There is no current live click-to-ready or Worker timing for this local combined source. The historical deleted-site samples were ~3 seconds and cannot establish a new SLA. Synthetic injected waits explain dependency sensitivity only, not live latency estimates. General AB Apply remains open.
