# BOM local Save and approved inline history integration

## Scope and source boundary

This isolated candidate starts at verified main `dc34874913c417ac5e3194a7e3c3956d971eb0d0`. It preserves the main checkout and the earlier A/B, account and feedback candidates. No remote write, live data operation, migration, deployment or browser run is part of this local evidence.

The saved f069 package was verified against all 23 manifest entries. Its BOM display adapter is recovered source, but it was explicitly contract-tested rather than integrated with a common history implementation. The older two-stage package supplies the available occurrence domain/backend and conflict CSS. Its BOM base matches current main. The newer f069 domain/backend context hashes were not present in those packages; the common history candidate was also unavailable. The structural-choice and common approved-reader work here is a controlled new integration, not an exact reconstruction of f069 or the missing common tree. Unrelated historical module files were not copied.

## Intended behavior and safety boundaries

- Editing remains local. Explicit Save reads the latest authorized state, merges independent edits and uses one atomic Save to share and save the module. Normal hot Save is GET → POST → terminal GET; a user conflict decision requires a second pre-dispatch check.
- One dialog lists all actual overlaps, with all-mine, all-theirs and Cancel. Nonconflicting changes from both editors remain. Cancel retains local journal, original basis and shared state. New input, changed remote state or revoked access during the decision requires reconfirmation.
- Structural import reconciliation retains original ordered import decisions and source attribution, and validates a decision against the complete base, operations and latest input on the server. Removed occurrences are not resurrected. Existing CAS, pending locks, permissions and receipt identity remain authoritative.
- The approved-only selector is BOM opt-in. It displays immutable approved content on the same page without replacing the current writer, private editor, original import decisions or unknown-operation identity. Returning to current restores the private presentation. History switching never resolves, discards or resends an unknown write.
- Approved cases require consistent case/version identity plus complete approval evidence. A superseded label or reviewed timestamp alone is insufficient. The current authoritative formal baseline remains distinct from a fabricated approval event.
- No periodic BOM refresh is installed. Selection, language and rendering must not trigger writes. Existing records, saved snapshots, pending cases and history are not converted or cleaned up.

## Verification ledger

Final BOM combined run: 373 PASS, 0 FAIL across sixteen suites. This includes 35 real common/handler/actual-paint cases, five full UI → real handler regressions, ten whole-choice controller cases and 23 recovered adapter-contract cases. The 23 adapter cases deliberately use a common-selector double; only the separate real-common suite establishes this integration. The exact execution status and source/build hashes are retained in the delivery receipt.

Independent review found and verified fixes for two Save faults: hashing raw operations with undefined properties rather than the transmitted JSON, and requiring the obsolete current saved pointer before settling a valid old receipt. The wire-normalized review now matches server reconstruction. A retained preflight candidate is a RAM-only comparison aid; private original receipt and accepted-read checks still authorize settlement. Later input, peer Saves, changed generation and revoked view preserve their boundaries.

History review also found async immutable/aggregate reads could outlive authorization and ambiguous selectors could enter a different archive path. BOM-only history now validates its exact selector contract before storage reads and checks fresh actor/session/access/revision after hydration, before releasing any body prefix. Metadata reads do not hydrate historical bodies. Independent final probes cover both revocation paths, malformed selectors and actual synchronous paint/remount without changing the writer or sending a POST.

The initial run of seven legacy controller suites had 194 PASS and 20 FAIL. Nineteen assertions still expected the previous no-preflight request counts; they were updated to exact latest-read/Save/readback sequences. The remaining test expected a disjoint remote field to reject merely because the revision changed; it now asserts both independent values survive the atomic Save. A separate large RAM-only same-field conflict test keeps the no-bypass requirement explicit. No request-size, storage-size, owner, permission or receipt guard was relaxed.

Full typed lint, typecheck, source-boundary and independent Save/history reviews are part of this local verification. Normal build passed, and the separate compiled Miniflare smoke suite passed three scenarios: approved-only list/immutable detail without writes, structural all-theirs Save with original receipt, and revoked BOM-view denial. These remain separate from the 373 source-level tests. The compiled fixture compares complete D1 result rows, excluding only nondeterministic query timing metadata. Exact head/build hashes are retained in the delivery receipt. The broader shared-interface regression ran 277 cases with 275 PASS and two existing AB fixture failures (`departureOwnShared` missing). Both failures reproduce unchanged on main dc348749; they are not silently removed or counted as green, and this BOM candidate does not import the separate A/B fixes. Five existing evidence/access/presentation scripts also passed.

Browser/real iPhone acceptance remains HOLD because of the earlier browser execution restriction. Windows/remote CI, full-history source proof for the new head, real-account acceptance, upload and release are not established by these local checks. Earlier source/history PASS for another candidate does not transfer to this one.

## Data model and integration

No persisted schema or business-record migration. New approval reads and structural reconciliation metadata are read/command contracts, not authorization changes. Common files must be semantically reconciled with the separately retained A/B/account/feedback candidates before a combined delivery; this candidate is based on main and does not include those branches automatically.
