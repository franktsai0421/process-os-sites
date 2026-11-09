# AB/C existing display-field Save choices — local candidate

Base: GitHub main `b06394ce0065849733399423afd2d906761d69c1` (re-read
2026-11-09). This is one independent implementation slice, not completion of
all draft pages and not a publication or data migration.

## Implemented

When the entire staged AB/C batch contains only existing product name,
specification or unit, line name, or nested stage name updates, explicit Save
reads the current authorized workflow once before dispatch. True conflicts use
one native Chinese/Vietnamese dialog: use mine, use theirs, or cancel. One choice
covers all conflicting fields; nonconflicting changes from both sides survive.
Repeated local edits compare their final intent. Converged values and edits
returned to their original value do not require a conflict choice.

The chosen request retains server-checked guards for the exact remote values
shown, including fields where the user chose theirs or both sides converged.
A newer same-field change rejects atomically. A new explicit Save can read and
ask again; no failed or unknown request is automatically resent. Cancel, Escape
and pagehide send no POST. Input is pinned before the existing queue flush and
across the read/dialog; changed owner, delivery, generation, form or local input
prevents dispatch. Reset/discard closes the dialog. Values are rendered as plain
text, and the existing responsive native-dialog styling is reused.

One Save with local changes now has a preflight GET, one POST and the existing
required authoritative ACK readback GET. Lost ACK retains the original receipt
lookup and readback flow. The earlier read-count fixture is updated for that
intentional additional preflight, and its post-ACK revocation injection remains
post-ACK rather than accidentally testing the new preflight.

## Preserved boundaries and remaining work

- A batch containing insert/remove/order, category/route membership, codes,
  group defaults or any other unsupported edit retains its entire original
  ordered guards. It does not get silently converted to field choices. A
  conflict in such a batch can still reject without this new dialog.
- Missing or ambiguous entities are not recreated. Create/delete, references,
  pending locks, roles, generation, revision/CAS and immutable receipts/history
  retain their existing server enforcement. No API or schema was changed.
- AB and C remain separate existing scopes. Line/stage management still shares
  the selected AB/C scope; this does not implement independent per-tab stored
  drafts. PROCESS still shares its existing workflow and has no new chooser in
  this slice. Those are actual remaining gaps, not completed features.
- The existing master polling-removal candidate is separate and is not imported
  here. Main still has that polling until the separate candidate is integrated.
- No business records, accounts, permissions, saved versions, production state,
  connectors, GitHub refs or Site deployment were changed.

## Validation

Run from the repository root with installed dependencies:

```
node --test tests/abc-save-conflict-choice.test.mjs tests/abc-local-bridge.test.mjs tests/abc-local-save.test.mjs
node --test tests/master-bridge-ownership.test.mjs tests/master-shared-clone.test.mjs tests/process-local-bridge.test.mjs tests/process-local-save.test.mjs tests/master-ab-auth-phase.test.mjs tests/master-ab-replay-permission.test.mjs
```

Actual bridge + shared transport + production handlers use synthetic DOM and
in-memory SQLite/R2. Cases include both scopes, global mine/theirs/cancel,
nonconflicting preservation, only-theirs guarded Save, convergence/revert,
peer races and a new explicit retry, pending/revoked permissions, changed
owner/generation/input/form, pre-flush input, unknown no-resend, unsupported
structural edits and removed targets. No fixture uses real business data.

Independent review checked the implementation and independently verified that
confirmed raced rejection does not block a subsequent explicit Save. Its
late-input probe led to moving input capture before flush. Native browser
visual/keyboard/mobile acceptance, physical iPhone, live double-account and
remote CI were not run; synthetic DOM and build do not establish those results.
Exact local check counts and source identity are delivered with the candidate.
