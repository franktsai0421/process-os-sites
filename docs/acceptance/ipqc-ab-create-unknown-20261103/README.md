# IPQC-AB create unknown recovery (local candidate)

## Task and scope

Diagnose the test Site v37 create-error interruption without resending the real operation, altering hosted data, or publishing. The incident was reported as a canceled POST taking 14,934 ms, no response, then two receipt 404s. Site source `285c0401f5082c0fbc197bd3ee00933275df3552` corresponds to GitHub `f23fb5e9cce9e4c1cb89e556151e8d5ff229d830`. The initial isolated checkout used `dc1c6205d6b46c67931bf39c16cd925676e09d79` (navigation follow-on), with identical affected AB caller/client/API/adapter files. Before PR publication, the candidate was rebased onto verified current main `f23fb5e9cce9e4c1cb89e556151e8d5ff229d830`; unrelated navigation commits are excluded. The live operation ID was not available here. No live request was sent by this work.

## Findings

1. **Reproduced cause of the wrong UI error:** `writeShared` records every rejected create flight and calls `settleRejectedCreate`. An unknown result has no private original-POST rejection proof, so `finalizeRejectedCreate` throws `AB_CREATE_REJECTION_PROOF_REQUIRED`. The caller replaced the useful unknown error with that internal safeguard error. A synthetic lost ACK followed by receipt 404 fails the added test on the original caller and passes after the patch.
2. **Lost diagnosis:** AB's fetch-failure recovery wrapper discarded both its original transport error and the failed receipt lookup. It now preserves `cause` and `recoveryCause` in RAM, including timeout phase/budget and available receipt status/request ID. It does not log, persist or transmit new diagnostic data.
3. **Timeout mismatch is a supported mitigation, not a proven live root cause:** privately prepared AB creates inherited the generic 15-second mutation deadline. The observed cancellation is consistent with that deadline, but the trace does not prove what canceled the request or where server time was spent. Only these exact creates now use 45 seconds. Begin/read/FQC and ordinary AB mutations retain their existing behavior.
4. **Backend cost remains unmeasured:** AB creates request historical allocation information to prevent code reuse, then use the conservative state reader, normal authorization, adapter validation, immutable encoding and global CAS. Unlike the bounded FQC special path, this is not a narrowed AB mutation reader. No evidence identifies read, allocation, encoding, CAS contention or response transfer as the live bottleneck. Do not remove history/numbering guards or narrow dependencies on this evidence.

## Changed

- A read-only private-proof probe reuses the exact finalizer checks. Unknown outcomes skip refusal cleanup; trusted refusal cleanup still uses the original finalizer and its storage/owner checks.
- AB-specific Traditional Chinese/Vietnamese guidance describes the unknown outcome, keeps input and directs the user to the existing result-check button. Receipt 404 explicitly remains inconclusive.
- Exact prepared create-error/create-item requests get a bounded 45-second budget. This can make an unresolved operation wait longer (up to another existing 45-second receipt GET); it is not a latency improvement or guarantee of completion.
- Script cache versions and a focused CI test step are updated.

## Preserved safety and data model

No schema, persistent field, backend behavior, permission, shared data, historical allocation, CAS or workflow change. Unknown command bytes and input remain retained. Explicit retries query the original operation only; no automatic second POST or new operation is admitted. The six original proven pre-commit refusals still permit a later corrected manual create. A 404, proxy response, error flag, cloned command/error/promise or expired owner cannot mint refusal proof. Body-phase timeout keeps the existing policy of no automatic receipt lookup; an explicit query remains available.

## Verification

- Original caller reproduction: added lost-ACK/404 test fails with actual `AB_CREATE_REJECTION_PROOF_REQUIRED` versus expected `RESULT_UNKNOWN_CHECK_BEFORE_RETRY`.
- Final route + fake-clock suite: **51/51 PASS**, including actual in-memory SQLite/R2 handlers, private-proof probing, 24-second ACK acceptance, 45-second headers/body deadlines, unchanged generic deadlines and no second POST.
- Broad AB/shared/FQC run: **273 PASS**, with **11 historical FQC comparison cases blocked** because this shallow checkout lacks the files at `268a8e49ec751bb6849033e20a27d30194aad67c`. Their product assertions did not execute. This is not a full-suite pass.
- Focused source/test lint: PASS (exit 0). Diff whitespace check uses `core.whitespace=cr-at-eol` to retain the existing CRLF source convention.
- Current-only FQC reliability check: **34/34 PASS**, explicitly excluding the 11 unavailable historical comparisons. No test uses real business data.
- Final seven-file AB CI command: **279/279 PASS** on the final source, including the older cached-transport fail-closed case.

Not run: deployment/build acceptance, full historical comparisons, hosted replay, desktop/mobile browser acceptance, real timing, CI on a remote commit. Do not call the original operation rejected or unlock a new create based on the two reported 404s. To establish its outcome, use the original operation's authoritative receipt and server-side trace; do not create a replacement operation while it is unresolved.

## PR preparation

Independent read-only code review found no blocking correctness or safety findings. The review did not claim live outcome, browser/layout or CI acceptance. A publication check then found two stale exact-cache assertions; they reproduce failures against the intentional new JS versions. Their expected versions are updated without weakening the exact-reference assertions, and the tests are rerun. The repository was verified as public source-only; only code, synthetic tests and this engineering evidence are included. Current workflows run pull-request checks, not Site deployment. The original live operation remains unknown and is not resent or cleared by publishing this code.

Final PR candidate verification on current main: **352/352 PASS** across the seven AB suites plus navigation adapters, shared receipt recovery and hosted read deadlines. Full typed lint (`npm run lint -- --format unix`) and TypeScript (`tsc --noEmit`) both exit 0. Changed-source publication scanning passes. Independent final integration review found no blockers; remote CI, build and hosted verification remain separate gates. No schema or data package update is required for these frontend-only changes.
