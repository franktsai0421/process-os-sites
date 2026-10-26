# Loading and Feedback — current local change notes

## Changes and preserved contracts

- Hosted IPQC-C GET selects eight existing identity/access/control dependencies.
  Loopback historical-code reads remain complete. POST, history streaming,
  numbering, original images, workflows, CAS and unknown receipts are unchanged.
- Common bootstrap no longer reads unused backup settings except on the users
  destination, whose response and writable-key contract are unchanged.
- Identity-only records-format bootstrap can reuse four SHA-verified raw identity
  strings between its initial and selected read. The token is private to one
  request; no parsed model, actor, permission or session result is cached.
  Every state read still checks current storage metadata. Revision, complete
  manifest or storage-binding change disables reuse; references remain validated.
  The final read independently fetches/verifies records and rechecks authority,
  revocation and revision. No parallel authority request or cross-request cache.
- Reuse opts out for normalized media/immutable-body markers, including the inline
  maintenance override, or any raw exceeding 262,144 UTF-16 code units. This is
  not a UTF-8-byte or peak-heap bound. Legacy storage formats retain full reads.
- Feedback retains lazy/coalesced loading and its existing list/search behavior.
  Ordinary pages wait for UI readiness; direct Feedback entry uses its own
  destination readiness. Availability is not create/view permission, and common
  bootstrap does not read or initialize Feedback records.
- Feedback callbacks remain actor/epoch/generation-owned. Fresh admission precedes
  private draft reads. Pending content and operation IDs survive unknown outcomes;
  no automatic submit/retry is added. Unsaved input/notes/export state blocks
  destructive navigation. Forced invalidation keeps memory-only state private,
  but that memory is **not reload recovery**. Existing durable drafts remain
  distinct. Platform edit controls are neither moved, hidden nor clicked.
- The local/global performance observer proposals are excluded: no new site timer,
  profiler, instrumentation gate, endpoint, Server-Timing header or DOM summary.
  There is no schema or persistent-data-model change.

## Validation and limits

External actual-handler fixtures cover all 24 destinations plus four approval
intents, permissions/revocation/revision races, missing/corrupt records, media
opt-out, legacy formats, forbidden partial saves and separate login behavior.
Ten existing identity-only fixture destinations use 8 rather than 13 object
GETs (7,046 rather than 10,616 consumed fixture bytes). The new Feedback
destination independently uses 8 GETs; it did not exist in the remote v20
baseline and is not claimed as same-endpoint parity there. Other non-users save
one GET; users is unchanged. Existing-route body comparison validates and isolates
only the known added Feedback-availability field; all other fields remain exact. Successful bootstrap still performs three state
SELECTs and four revocation checks. These are work counts, not live speed ratios.

A deliberate failure-observation difference remains: verified raw bytes may bridge
a middle-only same-reference storage outage that is restored before the final
read. First or final persistent missing/corrupt identity data still fails closed
with 503. This is not complete equivalence for all I/O failures. Media opt-out and
final-failure fixtures show no newly introduced cache writes in the covered cases.

Focused safety/admission checks, TypeScript, lint, build and independent local
source review passed in separately bound phases, not a full final-head suite
rerun. Earlier fixture/temporary-edit failures are retained in local evidence.
Broader UI-refresh/schema-upgrade fixtures remain unresolved outside this delta;
source isolation is not a baseline execution PASS. Documentation-only packaging
reuses the unchanged-code build rather than claiming a new build execution.

Login POST, rate limits/password verification, client script/render costs, FQC
serial dependencies and approval-panel broad data are not accelerated by this
patch; after-login bootstrap may benefit. Login, sidebar, backend tabs and helper
real-speed acceptance is **NOT_PASSED**, not formal-release readiness. Native
browser/IME/heap acceptance is NOT_RUN; repeated synthetic requests are not actual
cold/warm/reload browser trials. No live deployment or remote CI result is claimed.
