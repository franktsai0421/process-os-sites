# Equipment ordinary Save conflict choices (local candidate)

Exact available base: b06394ce0065849733399423afd2d906761d69c1, tree
a382bdc478eca740ede13f298c960557888baefc (merged #97). This is independent
of unpublished PROCESS, IQC and FQC candidates. Their product code is not adopted.

## Behavior

Save captures the original comparison base, completed RAM snapshot and exact
pending File entries, then reads current equipment working and fresh permissions.
Nonconflicting local and peer changes are retained. All actual ordinary conflicts
are shown together with Mine / Theirs / Cancel; one decision covers that group.
PhotoId/photoHidden are one semantic choice. A pending File with an ID shared
by different photo collections fails closed before any upload/command, retaining
input. This addresses a reproduced pre-existing wrong-row risk without changing
IDs, data or ordinary-field saves that contain no ambiguous File. The current equipment model has one
photo per row, not a photo-array API. A pending File counts as local photo intent
before upload. Captured local previews and peer photos/removal state appear in the
choice. Theirs uploads none of the rejected photo; other selected files continue.

Existing inserts, removes and parent changes retain their original exact guards.
Remote deletion or ambiguous identity is not resurrected. Source, references,
approved history, rights, pending locks and calibration/structure validation stay
in the existing handler. The compared generation/revision is sent to that handler;
a peer edit after comparison rejects and requires another explicit Save. No CAS,
server validation or protected dependency is waived by choosing Mine.

Until durable confirmation the original RAM/base and File entries remain.
UNKNOWN retains the chosen command, original operation ID and receipt barrier.
Receipt recovery never reposts it. Only matching confirmation settles the batch
and clears its exact entries. Later fields/files stay a next unsent batch. Existing
row references, open form cancellation snapshots and node dialog models are
reconciled without erasing actual later input or restoring untouched old peer data.
Unfinished node fields/photos keep their seen basis privately in that dialog;
only explicit completion installs their guards. Cancel discards those private
values without changing the confirmed global base.

Departure during the unsent comparison GET or choice atomically invalidates only
that private attempt and discards unsent input. Old responses cannot adopt or send
after a new Save. Once upload/command begins, original busy/UNKNOWN rules apply.
No local recovery key, polling producer, persistent unsent draft or migration is
added. Shared client and all server files remain exact b063 bytes.

## Verification and limits

The included full browser-script harness evaluates the shipped IIFE, default
shared client, shared-draft kernel and equipment adapter. DOM/timing/HTTP ports
are deterministic synthetic boundaries, not a native browser. Existing real
route tests use isolated SQLite/R2 fixtures. Exact commands, exits and final SHA
are delivered in the external local receipt rather than asserted by this text.

Initial runs are preserved, including invalid synthetic unit values, retired
zero-GET/automatic-409 expectations, and six real settlement defects found in
review: detached row/form cancellation state, a choice-departure busy race, and
old photo choices overriding a later File’s visibility, and later photo removal
losing its original pair/basis, and unfinished node fields/photos losing their
seen basis, plus a late node editor silently completing after its row was removed.
All have direct interaction
regression cases; no historical FAIL is relabeled.
Existing tests retain all cases: request counts now distinguish the comparison
GET from ACK fallback; fallback faults begin after dispatch; conflict tests use
actual decision buttons and keep late-peer exact-revision rejection controls.

The new test-only inverse attests the whole current equipment blob and every
changed span, restores exact b063 bytes, then composes the unchanged #97 and
no-poll proofs to the original historical pins. Negative controls reject rollback,
wrong file/type, partial/repeated projection, corrupted proof and byte drift.
Normal Local safety and Feedback CI include the new checks and their dependencies.

Native browser/Windows/mobile/IME, remote CI, full-history/privacy acceptance and
formal Site acceptance remain NOT_RUN/HOLD. Earlier browser EPERM and terminated
security work are not retried. Available Git history is shallow/incomplete; no
bundle is offered as full-history proof. No GitHub write, PR, publication,
deployment, account, live-data, connector or external artifact upload occurs.
