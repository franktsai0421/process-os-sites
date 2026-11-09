# Standalone BOM successor source proof

## Scope

This test/documentation continuation starts from BOM
`6354299922c702c80e7a8a16e4fad03efb48d4d4`, based on verified main
`dc34874913c417ac5e3194a7e3c3956d971eb0d0`. It does not import the separate
account, A/B or reporting candidates. Application, browser runtime, authority,
schema, stored data, original receipts and publication guards are unchanged.
The original BOM candidate and its [behavior acceptance record](bom-save-history-20261108.md)
remain separate evidence.

An actual pre-fix run of the original reporting source test had 23 PASS and
four FAIL. Three were newly introduced BOM successor bytes; the master-route
failure also reproduced on unmodified main. A separate cache test still
expected the older shared client and BOM asset versions. Those results are not
relabelled as successful; this continuation adds their missing composition.

## Exact composition and current-source proof

The new static `scripts/bom-successor-source-contracts.json` ledger records
complete before/after hashes, lengths and exact spans. Its test-only module
reverses six spans across the shared backend, shared client and BOM adapter
to their complete raw dc348749 bytes. Existing metadata, Begin and batch-3
inverses then retain their original historical pins and negative cases.
Unknown or changed source is not silently accepted or normalized.

The master route receives only the three-span static inverse for already
merged PR94, commit `a1d810894d9ef82e99e1d272c4f43715fb798080`.
Its original predecessor SHA-256 remains
`e59302315b30f2e2bce1d47ea6d6ea4f9d7228babaa0ddfc23267fee90ec2de8`.
No runtime from the independent reporting successor is needed.

Current BOM sources and their authority/UI dependencies are separately
attested against fixed hashes and lengths: four successors plus twelve
dependencies, including the BOM API delegate. An entire rollback to historical
bytes or a helper-only authority change must therefore fail even if an old
projection could match. Committed raw bytes may be used only after verifying
the working copy differs solely by checkout CRLF/LF; other working changes
are rejected. The inverse itself does not normalize source bytes.

The cache contract now requires the exact existing versions of the shared
client, BOM workspace JS/CSS, common version UI and both BOM domain imports.
Other modules retain their previous assertions. This is a source reference
contract, not a promise that an already open old page updates itself.

## CI and verification boundary

CI must execute the new proof with failure propagation, not merely mention its
paths. Its source dependencies and proof tests are included in the relevant
Feedback and local-safety workflow checks. The full-history source/privacy
preflight remains in place before compilation, with no exceptions added.

Exact command results, independent review and final commit/tree are recorded
in the separate delivery receipt. The original BOM runtime suites and compiled
smoke results are reusable only where product bytes remain identical; they do
not become a fresh execution on this descendant.

- Final joint command: **417 PASS**, zero failures/cancellations/skips/todo
  across twenty files. It includes all 96 focused new/original source proof
  cases, related BOM handler/history cases and the complete 240-case Feedback
  Node command, including the 39-case receipt/cache suite. These component
  counts overlap the joint total and are not added again.
- Source negatives cover corrupt spans/offsets/hash/length, complete rollback,
  changed authority dependencies, unknown path/type and removed CI commands.
- Independent review found a later old-server atomic inverse reread raw source
  instead of reusing its verified canonical bytes. That call now reuses the
  retained source. The new regression separately covers actual Git-filtered
  bytes and simulated fully CRLF bytes, retaining the complete historical hash
  and rejecting substantive edits. Default Git filtering preserves the mixed
  C source, so this is not a reproduced default Windows CI failure.
- Actual Git autocrlf-filtered source and CRLF YAML simulation was also tested.
  This is Linux checkout simulation, not native Windows acceptance. Independent
  follow-up review found no remaining must-fix in this scoped continuation.
- Full typed lint, nonincremental typecheck and source-boundary checks pass.
  The unchanged privacy scanner accepts the thirteen changed current files;
  that scoped check does not inspect or approve complete history.

This local checkout is shallow and lacks historical objects needed by some
old-server/source tests and the publication preflight. Those checks remain
unavailable or failing for that explicit reason. Projection proof is not a
substitute for complete Git ancestry, all-history privacy scanning, remote CI,
native Windows, browser/iPhone or live-site acceptance. No blocked transfer,
remote write, upload, publication, live-data operation or deployment is retried
or performed here.

## Data model and integration

No data-model or persisted-record changes. Standalone BOM behavior does not
depend on the unmerged account/A-B/reporting runtime. A later combined batch
must reconcile common files and attest/test its own resulting bytes; neither
candidate's source proof or successful build is inherited automatically.
