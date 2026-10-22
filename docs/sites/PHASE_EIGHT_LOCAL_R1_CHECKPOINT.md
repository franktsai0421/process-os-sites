# R1 local conversion checkpoint: metadata verified, private destination pending

Historical checkpoint: [phase nine](PHASE_NINE_TRUE_R1_LOCAL.md) supersedes the
protected-ACL blocker below. The owner explicitly chose inherited permissions,
accepted other local readers and confirmed E is not synchronized. Do not retry
denied registry/hard-link reads or request the same protection decision again.

The prior [phase seven](PHASE_SEVEN_STRICT_R1.md) 70 synthetic cases are retained.
This phase was explicitly authorized to read the selected real R1 and convert it
locally. It has **not completed that conversion**: creating the required private
destination would change its security permissions, for which explicit action
confirmation is pending. No real-data output directory or snapshot exists yet.

## Actual source and evidence

The existing PAIR-RESULT still pins the selected archive at 1,781,028,009 bytes,
SHA-256 `b986fdf80859488aaf5f712f591b9fbeb53a1ec2752102e9c310c826e4765714`.
The new read-only ZIP reader has matched those bytes/digest. Its central and local
directory checks passed for 2,038 named members, declaring 8,142,056,727 total
uncompressed bytes. The inner raw manifest digest is
`4e0ce0d0a38c721af52d507c93138b1a4d8f2a76961b49224575ae33a8da6140`.

The true manifest adds observed typed counters and policy metadata beyond the
phase-seven whitelist. The first attempt correctly stopped at
`R1_MANIFEST_FIELDS`. A structure-only receipt captured field names/types, counts
and machine-format identifiers; the decoder was then extended with an explicit
complete header profile, nested field/type checks, object classification and
table-count consistency. Unknown fields still refuse. No data-row, image or
credential value was logged, and no SQL or packaged program was executed.

The latest metadata preflight passed: curated revision 496; 1,734 logical R2
objects / 8,133,120,116 bytes; 964 JSON, 767 media and 3 feedback archives; header
declares 26 internal feedback entries. Tables contain 1 current row, 100 history
rows, 1 feedback row and no source revocation rows. There are 304 private company
image URLs plus 2 reviewed program UI SVG members, with 7 auxiliary members.
These are **metadata checks**, not a claim that all object payloads were checked:
only 7 of 2,038 member CRCs were reached by that preflight. Full source payload
hashing, conversion, output audit and true account/role/history preservation
remain unexecuted.

Parent-task receipts:

- `sites-r1-real-metadata-preflight-01.json`: stopped on additional header fields.
- `sites-r1-real-metadata-preflight-02.json`: structure-only contract evidence.
- `sites-r1-real-metadata-preflight-03.json`: PASS_METADATA_CONTRACT_ONLY.
- `sites-r1-isolation-preflight.json`: destination facts and exact pending action.

## Program work and necessary regression

- `lib/r1-zip-reader.mjs`: read-only ZIP32 STORE/DEFLATE, mandatory whole-input
  size/hash pin, local/central/descriptor agreement, no path traversal or duplicate
  names, no symlinks/encryption/ZIP64/unsupported methods, declared-size overrun
  rejection, CRC and complete compressed-stream consumption. It has no extractor
  or payload cache on disk. Four LRU readers use 64 KiB stream high-water marks;
  returned ranges and the explicit block ceiling are at most 1 MiB. Input inode,
  size and timestamps are checked; full input hash is checked again before final
  completion. Own stream descriptors avoid closing the master input handle.
- `lib/snapshot-audit.mjs`: independent, read-only chunk/resource readback,
  credential-field and canonical checks, current/all-history business-row
  comparison, complete object/asset mapping, reference coverage/cycle checks,
  feedback archives and attachments, account count and private-image checks.
  No database or R2 binding is opened, and images are not restored to a second
  full-size store. Unsupported audit formats fail explicitly.
- `scripts/r1-inspect-local.mjs`: selected-source metadata preflight, whitelist
  statistics/types only. It does not create a data snapshot.
- `scripts/r1-convert-local.mjs`: selected-source conversion entry, requiring the
  exact new private parent and its verified isolation receipt. It checks fresh
  output and free space before opening the package. It writes ordinary bounded
  chunks into one new snapshot, audits them, verifies source/code stability and
  only then writes the completion marker. Failures retain incomplete staging.
  The CLI has passed syntax inspection but has not executed against real data.

Actual synthetic results: strict header/parser **13 PASS** (including the new
header-policy/counter refusal case); ZIP reader **8 PASS**; independent snapshot
audit and staging safeguards **5 PASS**. Scoped compiler: **0 diagnostics**, with
`checkJs:false`; this is not a complete type-proof of the MJS implementation.
Unchanged prior business/security/format suites are reused, not rerun broadly.
No package install, build, SDK, network, database, browser or deployment occurred.

An optional hard-link optimization was attempted once using fake chunks at
`sites-audit-fixture-QhpABo/dedup/chunks/c0` -> `c1` in the parent workspace.
Windows returned `EPERM`. It was not retried or routed through another tool.
That optional implementation was removed; the original ordinary sink is retained.
The failed report remains `sites-snapshot-audit-results.hardlink-EPERM.json`.
There is one planned snapshot output and no full archive extraction, even without
hard-link deduplication. Logical same-content references remain preserved.

The selected M1 baseline is still
`7f5dc57239d6db483f096d96df6bd6cdd7357f5a`. The converter explicitly labels it
as baseline lineage, not the exact commit of this uncommitted derivative; it also
records the executed code fingerprint. This does not authorize publication or
claim that a source-tree digest is a Git commit. No Git operation is needed.

## Exact current blocker and continuation

Proposed private parent: `E:\ProcessOS-Sites-Private-20261022` (does not exist).
Proposed snapshot: `E:\ProcessOS-Sites-Private-20261022\r1-rev496-snapshot-v1`.
E was a fixed local drive with 115,295,813,632 bytes available when checked.
Conservative new-space estimate: 18,000,000,000 bytes; safety margin:
10,000,000,000 bytes. The converter rechecks available space at actual execution.
Existing artifacts are not moved/deleted and the input is not copied/extracted.

E's inherited ACL grants Authenticated Users and local Users access, so it cannot
be used directly for private output. C's workspace is also under the configured
`Users` share and is not selected for real data. Configured non-administrative
shares did not include E. The environment's OneDrive root is
`C:\Users\Admin\OneDrive`; the proposed E path is outside it. Reading
`HKCU\Software\Microsoft\OneDrive\Accounts` was denied with "Requested registry
access is not allowed". That read was stopped, without alternate enumeration or
permission changes. Other sync-account roots were therefore not fully inventoried.

The required action confirmation is limited to this **new** E parent: create it
with inheritance disabled and FullControl for only the current Frank/Codex user
SID `S-1-5-21-3934142330-2015880501-1933580559-1001`, SYSTEM and local
Administrators, inheritable to its children. Do not change E root or existing
directories. Also confirm the new path is outside synchronization software scope;
no additional registry access is necessary. The native shell identity was checked
and matches the user SID; no extra sandbox principal is being requested.

After that exact confirmation: create the new directory with its protected ACL,
read the resulting ACL back and record a receipt with `path`, `permissionConfirmed:
true`, `newDirectory:true`, `protected:true`, `allowedSids`. Do not fabricate this
receipt or substitute a permission flag. Run the existing converter once with
`R1_PRIVATE_ISOLATION_RECEIPT` pointing at that receipt and
`R1_CONVERSION_REPORT` at a new aggregate-only report path. No program change or
repeat of the 70 old tests is needed merely to receive that confirmation. If the
new target already exists, inspect its markers and do not overwrite or blindly
restart. Real format failures must be fixed minimally with targeted regression.

A successful local snapshot would still not qualify a runtime restore, real
account login, Workers/Sites bindings, capacity limits, GitHub upload or release.
Those remain distinct. Old G3/C1/MF and D-drive Git/CIM denied operations were not
retried, and no account, credential, sharing, original source, 3000 or R1 setting
was changed.
