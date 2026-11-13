# Tooling and inspection equipment integration

Draft candidate only. No merge, deployment, permission changes, schema migration,
real-data writes or test-Site mutation. Work performed in an isolated cloud clone.

## Provenance

Base: GitHub main `2434507ca8ef460b0c727d6d0c2b23345b86310b` (merged #109).
The requested `ed35ad1ed39607ff8d105ef8a84d3f73062643cd` was unavailable from GitHub
and the named handoff tarball was absent in this cloud workspace. This is not a
claim of having verified that missing candidate.

Available source: `codex/module-draft-boundary-main-20261109` at
`55d4672cb8004d0b01715714cbc91fbce6b22d2b`, three-way compared against merge base
`9fbba823090f03da8385c8d92f5e59293d19d2f1`. Only Tooling and equipment UI and their
applicable tests were integrated. Common history helpers/backend are already in
main; only the two exact client history routes are enabled. Other modules and old
branch histories remain untouched. Main's IQC original-operation journal and
atomic transfer Save survive the one navigation conflict; FQC transfer stays intact.

## Requirements and risk coverage

- Tooling Files preview locally and upload only on explicit Save. Grouped Mine /
  Theirs / Cancel retains nonconflicting local/peer changes; Cancel writes nothing.
- Equipment grouped choices retain original guards, pending Files and later input.
  Fresh comparison/revision, rights, actor and generation checks remain enforced.
- Each page owns its module draft; same-page category/equipment/filter changes
  preserve input. Module departure abandons unsent input, never uncertain writes.
- Approved historical versions render readonly in the source page, retaining the
  current draft and rejecting stale callbacks. No restore or automatic overwrite.
- No fixed polling. Ordinary uncertain writes retain existing 15-second transport
  policy and original receipts; no blind resend or timeout-based success.
- Photo requests bound headers AND body to 45 seconds. Uncertain upload recovery
  reads only the original SHA-256 object and verifies bytes. A 404 is not proof of
  absence and does not permit replay. Equipment retains outcomes by actor epoch
  and hash, including equivalent newly selected Files. Tooling retains its existing
  original outcome map. These are runtime protections, not a new persistent File
  store or cross-browser photo recovery promise.
- Tooling IQC picker/detail/linked references, advisory checks and history metadata
  have bounded reads. Late IQC responses cannot cross delivery/account ownership.
- FQC/IQC replacement saves remain; IPQC replacement is working-only as in main.

## Evidence so far

All fixtures are synthetic. Actual handlers use isolated SQLite/R2; DOM harnesses
are not native browser evidence. Counts below are separate runs, not additive.

PASS: core Save/transfer regression 143/143; bounded-media cases 8/8; equipment
lifecycle 8 groups; four-module replacement 16 groups/388 handler invocations;
Tooling workflow including Save, Submit, Withdraw, Return, Approve and validation;
TypeScript and source-only boundary check. Initial history tests failed due to
missing exact client route opt-in and were repaired; initial photo fixture expected
a fake hash and was replaced by real bytes/hash assertions. Old zero-GET tests were
updated using the old branch's explicit comparison/choice tests, not removed.

Final local PASS on runtime tree from `59f7cb7b210c27571c12a7279c4e92011fff2b39`:
combined new coverage 243/243, existing sent-batch 190/190, common source/no-poll/
quarantine 175/175, exact inverse 4/4, Tooling UI 52 groups, checks projection,
lint, TypeScript, source-only boundary and guarded production build. The initial
build command used an abbreviated SHA and correctly failed closed; the full
40-character candidate SHA passed without changing the guard. Later fixture/docs
changes do not alter those runtime blobs. Changed-source safety scan is clean.

The old Tooling UI fixture still expected periodic polling and immediate photo
PUT. Its already available successor from the same source branch was adopted;
all 52 groups pass using the original CI command. Disable-reason checks still
reject a new disable without a reason, permit unrelated edits to historical
missing-reason records, and preserve existing history. The full handler workflow
passes this policy too. No runtime validation was relaxed to satisfy a fixture.

BLOCKED: local actual Chromium and compiled-browser execution. Downloaded
Playwright archive was invalid; the installed system Chromium then failed at
`process_singleton_posix.cc` with `socket() failed: Operation not permitted`.
No browser sandbox or platform protection was changed. Native CI runs remain
required and are not claimed passed by these synthetic results.

NOT_RUN: physical phones, real IME, real users, real network/scale and hosted
acceptance. New remote CI is pending. These limits prevent a release-ready claim.
