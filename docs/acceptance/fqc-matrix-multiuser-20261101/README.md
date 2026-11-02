# FQC matrix: two-actor local verification

This candidate adds tests and their existing CI entry only. The local actual-route suite was first fixed at `524e1701300305b8ac817991a4e909c6569ad704`; the following native candidate is a distinct, not-yet-run addition. It is based on the reviewed local FQC lifecycle candidate `196b743da756cbac9e1985d485fac8445de4ea00` (which includes public main `0008df71130fb165054fd38e9f801a86749237aa`). It does **not** publish that candidate or replace a native CI result. The previously blocked six-file lifecycle publication remains a separate approval boundary.

## What executes

`node --test --test-concurrency=1 tests/fqc-matrix-multiuser.test.mjs`

- Two separate production FQC module/shared-client/recovery-helper VM instances, with separate local/session storage and different signed synthetic actors (`editor` / `other`).
- Actual TypeScript FQC API, shared-draft kernel, authorization, global CAS and records-v1 encoding over isolated in-memory SQLite/R2.
- Real matrix event handlers. Synthetic DOM/timers and VersionDraftUI mounting; UI `hasPermission` is a fixture port. Server authorization is real and is independently tested after one actor's edit grant is revoked.
- Deterministic overlap pauses the first real SQL CAS attempt while the other actor commits. This is not merely two sequential API requests labelled concurrent.
- Response-loss/404/503 are explicit transport fault injections; successful responses and operation receipts come from the actual handler. No employee service, credential, data or live network is used.

## Tested contract

| Scenario | Required outcome |
| --- | --- |
| Different rows, overlapping Apply | Both changes survive the stale global CAS retry; distinct actor/client/operation IDs; no Save. |
| Same cell, overlapping Apply | One wins; stale field guard returns 409; loser keeps its local selection; no silent overwrite or automatic resend. |
| Different cells on the same row | `productCodes` is one guarded field, not independent per-cell CAS. The stale Apply conflicts. Explicit **核對最新勾選**, confirmation and two fresh reads retain local intent plus the peer's other selection; a later manual Apply sends it. |
| Reconcile Cancel / peer changes during confirmation | Cancel retains the input/original guard. A changed second read refuses rebase; the next Apply still carries the original guard and is rejected rather than overwriting the peer. |
| Apply → Save → another actor's fresh read | Apply is unsaved working data; explicit Save persists the full snapshot. A fresh other-actor module reads that exact saved content. Another local unsent choice is not silently included in Save. |
| Submit / Withdraw | Actual Submit locks the peer's pending Apply. Withdraw changes generation; an old local batch cannot apply into the new generation. A fresh explicit module open can start a new manual batch. The old retained input is not automatically migrated. |
| Lost ACK + receipt 404/503 | Repeated checks use only the original operation receipt, never another POST or Save. The other actor cannot read that private receipt. A later valid receipt + authoritative read settles the original operation without re-applying it. |
| Edit permission revoked | Actual handler returns 403; shared DB is unchanged and local selection remains. |

## Existing evidence is not interchangeable

- Prior #56 PROCESS/canvas **90 native CI samples** do not cover FQC.
- The new FQC lifecycle candidate has **33 × 5 native samples planned, not yet executed** at this checkpoint. Its editor/reviewer lifecycle is not simultaneous peer editing.
- Existing matrix layout/recovery native tests use memory HTTP and one actor. They are not real-route multiuser acceptance and did not cover the matrix→Save chain.
- Existing real-handler FQC native forms cover Begin/new/edit/Save/reload, but not two simultaneous matrix sessions.
- This new suite closes the local actual-route/module two-actor gaps above. **Two browser contexts, polling/focus behaviour, real browser Web Locks, mobile, and two real users on a live station remain unverified.** No native browser is launched in a locally restricted environment.

## Counts and timing

Successful ordinary matrix Apply and Save retain one POST followed by one authoritative GET. Local choices and reconciliation confirmation do not POST; reconciliation uses the existing two GETs. Failed field-guard POSTs do not silently retry. Diagnostic request/response byte counts and synthetic VM durations are printed per scenario. Their window covers the module transport since synthetic mount, excluding the fixture's initial pre-read, seed and DB oracle. They are **not** click-to-ready measurements, real HTTP transfer timing, a five-sample browser benchmark or proof of a sub-one-second site.

## Known existing Discard limitation (not fixed by this test)

The actual-module/transport/route probe confirms: after a same-cell `DEPENDENCY_CHANGED_RECONFIRM` rejection, **Discard clears the local matrix choices but leaves the transport failed flag true**. Save then rejects before sending a POST; an ordinary read alone does not clear that failure. A new same-actor module instance with the empty resolved-receipt store can read the unchanged peer value and explicitly Save it (one POST plus the normal readback). That last proof is a socket-free fresh-instance check, **not proof of the real browser reload/leave-dialog recovery path**. No product change, automatic resend or flag reset is introduced. The native negative-scenario teardown token only allows that verified failed fixture page to be closed after its input is explicitly discarded; **it must never be reported as Discard restoring Save or as a product fix**.

## Publication / next native proof

No product source changes are included. `tests/fqc-matrix-multiuser-browser.mjs` is now prepared for the existing compiled-browser CI step, not launched locally. The existing workflow adds the Node suite to its FQC command, followed by this native runner with the same explicit exit-code gate. No existing checks are removed.

The native plan uses two separately signed editor contexts against the real compiled Worker and in-memory fixture DB/R2. A pure seed extension adds only a second actor with the same existing editor rights and two synthetic matrix rows; existing reader/reviewer rights and unrelated values remain unchanged. It does not replace product authorization with a browser stub.

Fifteen normal phases × five complete cycles plan **75 click-to-ready samples**: Begin, actor A/B choice and Apply, explicit reconcile open/confirm/Apply, Save, peer saved-draft selection, Submit open/confirm, Withdraw open/confirm and original-receipt resolution. Same-cell overlap, stale same-row conflict, pending lock, a clean saved peer reload and intentionally lost ACK are separate functional checks, **not latency samples inflated by orchestrated pauses**. The overlap holds the original browser POST while the other context commits; the local SQL-barrier suite separately proves actual stale-CAS retry.

Setup replaces only an exact old page with unchanged actor/epoch/target and no private input/modal, queued write or unknown. Normally its failed flag must also be false. All admitted API requests and bodies must drain and the error ledger must be clean before observation is detached and that fixture page is closed; the new page is observed before bootstrap. Shared unsaved data is verified unchanged, not automatically saved. This controlled fresh-page setup is not presented as user reload/beforeunload acceptance. A separate **real peer page reload** is exercised only after it has read a fully saved clean model. Any dialog remains an error. One narrow negative-scenario exception permits ending a known-failed page only through an opaque test-only token minted after the exact original request's actual guard409 body is verified. The token is observer/page/request/operation-bound, requires that request still be the latest POST, and expires on any later POST or observer stop; copies/foreign observers/planned-but-unobserved responses do not qualify. It changes no product flag, model or permission. Final PASS requires all contexts cleanly closed and the error ledger checked again; failed cleanup preserves diagnostics rather than erasing them.

Only a privately associated original request may produce an expected conflict, intentionally aborted ACK or exact operation receipt 404. The conflict must be the actual 409 guard code with UUID requestId and matching item/productCodes path. The intentional lost ACK first obtains and validates a real successful server receipt before aborting delivery; subsequent artificial receipt 404 is pinned to that original operation. Unknown HTTP errors/network failures and extra POSTs still fail. Classified requests remain in request/byte/timing accounting. Error-handling scenarios do not invent successful UI timings.

**Native 75 samples: NOT_RUN.** This cannot be combined with local 20 Node cases (the original nine actual-stack cases plus ten runner/observer contracts and one actual-route preflight of the exact native seed), prior PROCESS 90, or the separately planned FQC lifecycle 165. A successful native run would still not be employee-site or physical-device acceptance.

The precise proposed publication is nine unique paths: the earlier six lifecycle files, this Node test and document, and the new multiuser browser runner. The workflow is one of the original six, not a tenth path. This is a newly reviewed payload, not an implicit reuse of the earlier six-file approval. Publication/CI still require the pending explicit authorization.
