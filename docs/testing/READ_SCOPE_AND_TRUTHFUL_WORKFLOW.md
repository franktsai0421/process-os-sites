# 製程／FQC 讀取範圍與真實狀態 / Process–FQC read scope and truthful state

## 第一批範圍 / Batch-one boundary

Base: `1c40495c4ee31d10501a6e46979ac8305db550c0` (PR #35 merged).
This batch is not a new storage writer, migration, permission grant, or published
performance result. The deployed browser findings motivated these changes:

1. FQC history displayed a missing comparison baseline as `0`; Begin could leave
   the approved version selected; review counts could show `0` before reading.
2. Process `contentIssues` read unrelated aggregate bodies before validating.
3. FQC asked the generic AB workflow reader for an approved catalog, causing
   unnecessary draft / other-scope hydration on adopted records storage.

Changes retain manual canvas Sync, manual Save, full content validation, receipt
and unknown-operation quarantine, fresh authorization/revocation checks, immutable
history, and the existing whole-state write/CAS guards. No business data, account,
database schema, dependency manifest, sharing, or publication configuration changes.

## 統一驗收契約 / Shared acceptance contract

Use **正式版 / approved**, **草稿 / draft**, and **送審版 / submitted draft**.
The submitted version is the locked submitted draft, not a third independently
editable workspace. Protocol `pending` remains unchanged.

| Contract / 契約 | Acceptance in this batch / 本批邊界 |
| --- | --- |
| Ordinary downstream lookups use approved data | FQC AB catalog selects the uniquely matched approved active version. Editing previews, review cases and history intentionally retain their own selectors. |
| Draft changes require explicit manual Save | No automatic Save/Submit, no extra mutation request. Existing shared-draft lifecycle is preserved. |
| Submitted drafts are locked | Existing pending fences, BOM interlocks and authorization remain. Reading an approved catalog does not authorize editing or bypass a submitted case. |
| Withdraw and reviewer Return preserve editable work | Existing transitions are not rewritten. Withdraw is not described as reviewer Return. |
| Approve promotes the reviewed snapshot and retains history | Missing historical comparison data is shown as unavailable, never invented as an empty prior version. The next Begin remains an explicit action. |
| No-change must not manufacture a new business version | Repeated Save does not create another saved snapshot/shared-workflow revision (a new operation may still record a receipt and advance the global storage revision); unchanged submission after approval remains rejected. Resubmission of a saved case after Withdraw/Return is an existing explicit exception, not removed. |
| Busy, failure and unknown are different | Unsettled/unavailable review reads are not zero cases. Genuine zero requires a current settled read. Unknown write recovery is unchanged, not cleared by a repaint. |
| Identity, route and panel ownership fence results | Stale read, old actor/epoch, detached panel and an old observer cannot install a new ready/error state. Only a valid owned explicit Begin selects the new draft. |

Process uses the `process:platform` scope; FQC uses its whole-library scope. A visible product/tab filter does not reduce the contents saved or submitted. The verified anchors are `lib/shared-draft.ts:applyDraftCommand`, `lib/versioned-shared-workflow.ts:projectSharedVersion/POST`, and the authoring/FQC adapters.

Content validation differs legitimately between modules. Existing BOM pending
interlocks, admin self-review conditions, approval/return/withdraw permissions and
source-specific missing-data rules are not unified by weakening them. This is a
shared acceptance contract plus a bounded Process/FQC change, **not certification
that every module already implements every rule identically**. The overview only
observes its six existing reader promises and current loading/error presentation;
it does not add requests or replace those modules' loaders.

## 已同意的唯讀故障邊界 / Accepted read-fault boundary

The owner explicitly accepted both narrow policies on 2026-10-27 at 16:20 UTC:
unneeded data must not block a valid requested read; required inputs retain their
existing error or advisory behavior. This is **not complete fault parity**.

| Endpoint / condition | Before → after | Preserved safety |
| --- | --- | --- |
| Process contentIssues, unrelated tooling aggregate/body missing or corrupt | 503 → valid module 200 | Ten server-owned keys still include identity/roles/access/maintenance, authoring, master, BOM and AB/C IPQC. Required decoding/validation remains. |
| FQC approved AB catalog, adopted records with unrelated C/PROCESS or inactive AB draft body corrupt | 503 → valid approved 200 | Required approved catalog and current AB view authorization still fail closed. No draft data substitutes for approved data. |
| Same catalog, SHA-valid but structurally invalid inactive AB draft | 422 → valid approved 200 | Same accepted unused-draft policy, not silent error-to-empty conversion. |
| Duplicate selected active IDs | Previously 200 DTO unusable by the FQC client → explicit server 409 | Invalid source remains rejected; no newly usable catalog is invented. |

Required malformed authoring/IPQC/auth still fails; malformed BOM remains 422,
incomplete BOM 409 and missing master 422. Missing IPQC already yielded explicit
advisory issues with HTTP 200; that behavior is preserved, not described as a new
failure or a clean validation result.

P2 fast path is limited to **adopted AB on records-v1**. Non-record and unadopted
legacy sources delegate the existing generic reader. Its existing failure coverage,
including malformed/missing historical bodies, remains. Neither endpoint can feed
a partial write: `Partial read cannot be saved` and global CAS are unchanged.

## 同一隔離資料的工作量 / Identical-fixture work units

Actual production handlers ran with synthetic SQLite/R2 fixtures; counters include
reads rather than assumed request latency. They are not live business datasets.

| Case | R2 reads | Bytes read | SQL reads | Scope |
| --- | --- | --- | --- | --- |
| P1 normal Apply/Save content inspection | 17 → 14 | 668,313 → 44,090 | 9 → 9 | Includes 8 fresh revocation checks on each side. |
| P2 adopted approved AB catalog | 7 → 4 | 730,178 → 29,701 | 19 → 19 | Shared-state reads 2 → 2; equal normalized approved catalog and permissions. |
| P2 inline legacy fallback | 0 → 0 | 0 → 0 | 18 → 27 | Compatibility cost; shared-state reads 1 → 2. **Not faster.** |
| P2 unadopted records fallback | 8 → 11 | 889,748 → 918,556 | 19 → 29 | Compatibility cost; shared-state reads 2 → 4. **Not faster.** |

P2's measured Node CPU sample was **56,014 → 57,186 microseconds**, not an
improvement. Node CPU/elapsed includes fixture instrumentation, scheduling and GC;
it is not Workers CPU, supported peak-heap profiling or a promised percentage.
P0 changes truthful presentation, not server I/O. Mutation POST hydration and the
observed roughly 10–18 second POST critical paths are **not solved by this batch**.
Writer optimization requires a separately reviewed design and fault-policy decision.

## 證據與發布門檻 / Evidence and release gates

- P1: 37 old/new handler pairs (34 exact parity + 3 accepted fault-policy deltas),
  74 measured GETs, no SQL/R2 writes or snapshot changes. Normal login/lifecycle,
  required failures, legacy formats, fresh revocation and stale state included.
- P2: 20 actual-handler groups; approved DTO/permissions, missing/legacy, scope/403,
  revocation, required integrity, explicit fault deltas, zero writes and partial-write
  refusal. Legacy fallback overhead is measured separately above.
- P0: 40 production-UI synthetic checks; 8 corresponding old-source defects fail.
  Existing FQC feedback 23, readonly equipment 21 and catalog 38 checks pass.
- Integration adapts the two extracted-function navigation fixtures to their new
  closure ports without removing stale resolve/reject assertions: navigation + IQC
  36/36 pass. Changed executable references receive coupled cache tags.
- CI adds all three new portable runners with normal nonzero exit guards. Existing
  runner, permissions, fetch-depth, build, historical source guard and other jobs
  are unchanged. Full clean CI/typecheck/build are still required before acceptance.
- Local snapshot is shallow: full-history validation is **not a local pass**.
  Native Windows, browser retest, live timing/heap and old unknown-operation
  recovery are **NOT RUN for this new batch**. Prior v27 browser success does not
  establish these changes are deployed or fix every rapid-click case.

Run the new checks from the repository root after the normal locked installation:

```sh
node scripts/test-authoring-contentissues-readscope.cjs
node scripts/test-master-active-catalog.cjs
node scripts/test-fqc-truthful-review.cjs
node --test tests/navigation-adapters.test.mjs tests/iqc-viewer-invalidation.test.mjs
```

Any later extension of validation dependencies must update the read closure and
negative tests together. Do not enlarge this batch into partial storage writes,
authentication caching, automatic workflow transitions or unrelated module rewrites.
