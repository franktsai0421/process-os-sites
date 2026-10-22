# True R1 local conversion: verified data-only result

This supersedes the pending protected-ACL decision in
[phase eight](PHASE_EIGHT_LOCAL_R1_CHECKPOINT.md). On 2026-10-22 the owner confirmed
that E is not synchronized and explicitly requested no extra protection. The
output therefore retains ordinary inherited ACLs. Other local accounts may read
it; the owner accepted that. The word `Private` in its directory name is not an
ACL claim. No ACL, share or sync setting was changed, and denied registry/hard-link
operations were not retried.

Selected output: `E:\ProcessOS-Sites-Private-20261022\r1-rev496-snapshot-v1`.
The parent and completed snapshot now exist. The parent was created
exclusively, has this task's owner marker, and was read back with ACL inheritance
enabled. Available space at start was 115,295,813,632 bytes, with a conservative
18,000,000,000-byte estimate plus 10,000,000,000-byte safety margin.

## Actual completed result

Session 78719 terminated with exit 0 at 2026-10-22 02:06:59 UTC (09:06:59 Vietnam).
The final report is `sites-r1-real-conversion-03.json` in the parent task; the
same result is saved in the output's `CONVERSION-VERIFIED.json`. Status:
`PASS_TRUE_R1_LOCAL_SNAPSHOT_CONVERSION_ONLY`. COMPLETE exists; INCOMPLETE and
FAILED do not. The complete directory was reopened with its expected manifest
hash, and the marker/report result was separately checked after process exit.

The selected original archive is unchanged: 1,781,028,009 bytes, SHA-256
`b986fdf80859488aaf5f712f591b9fbeb53a1ec2752102e9c310c826e4765714`.
All 2,038 source members passed CRC and pinned SHA checks. The original manifest
SHA is `4e0ce0d0a38c721af52d507c93138b1a4d8f2a76961b49224575ae33a8da6140`.

Output: **9,387 chunks / 8,143,387,205 data bytes**, all independently read back
and hashed. There are 2,037 resources: 3 business tables and 2,034 logical R2
objects. All original 1,734 logical R2 objects remain; the 300 additions are the
private index and 299 unique image objects representing 304 retained image URLs.
Five shared-image references therefore do not create extra asset objects.

The independent audit passes 1 current row, 100 history rows and 1 feedback row;
current/all-history business rows match the scrubbed source. It retains 14 account
identities and 3 distinct roles, verifies 831 unique referenced objects, all 304
private image mappings, 3 feedback ZIPs and all 26 internal feedback members.
Source security records/credential fields are excluded. SQL was metadata only,
never executed. No DB/R2 binding, SDK, runtime, network or website was opened.

Snapshot manifest SHA-256:
`6a76b54864f9a1c1fa76a944cb0013fe3bcb5a60185a622c6a92515a826fab6e`.
Source program baseline remains M1 `7f5dc57239d6db483f096d96df6bd6cdd7357f5a`;
this is explicitly baseline lineage of an uncommitted derivative, not its exact
Git commit. Executed code fingerprint:
`9901234b8efc336f81bf90bd81cacfa2250c19792002d43bc1cc7ac407f0b5f4`.
Use `sites-source-freeze-phase-nine.json` and `sites-source-diff.phase-nine.json`
for the current source-tree/schema pin. A source hash is not a publication commit.

The third execution verified/reused all 749 existing chunks / 253,405,469 bytes
without overwrite, then added 8,638 chunks / 7,889,981,736 bytes in the same output.
No full extraction copy or restored second image store was made. The reported
30,832,230,451 inflated bytes count multiple verification/analysis passes; it is
not the stored database or output size. The V8 old-space limit was 256 MiB and
reads remained bounded (largest range 1 MiB; observed inflation block 64 KiB).
No claim of measured total-process peak RSS is made.

## Capacity distinction

Read-only central-directory metadata confirms that `pack-v5/database.json` is
**1,811,923 bytes** (33,450 compressed). This is the JSON schema/table envelope,
not measured SQLite/D1 allocation. The archive's 1,725 physical R2 members total
8,130,891,748 uncompressed bytes; logical R2 volume is 8,133,120,116 bytes because
9 named logical references share existing physical members. Static payload is
306 members / 8,502,160 bytes, including the 2 UI SVGs. Other metadata is
6 members / 850,896 bytes. The receipt is
`sites-r1-capacity-central-directory.json`; no database rows or image bodies were
read by that metadata-only capacity inspection. These sizes do not establish any
Sites hosting quota, request limit or cost acceptance.

The input has 7,912,899,169 JSON bytes across 964 logical JSON objects (357 over
8 MiB; largest 27,499,317 bytes), plus 219,138,690 media bytes and 1,082,257 bytes
of feedback archives. It is processed through bounded streams, not loaded as a
whole database or 8 GB in memory. No full archive extraction or restored second
image store is made.

Two owned conversion executions were stopped to fix observed JSON-processing
overhead. They were not tool/policy refusals or arbitrary acceptance deadlines.
The first retained 676 chunks / 180,155,966 bytes; the second verified/reused that
prefix and extended it to 749 chunks / 253,405,469 bytes. Both incomplete outputs
were retained in the same directory, without overwriting or deleting chunks.
Their aggregate checkpoints are outside source in the parent task directory.

## Program changes and regression

The stream codec now batches text/escape/output tokens inside existing bounds.
An additional native path processes only complete canonical objects already in
the current bounded text buffer. It requires byte-identical JSON reserialization,
valid depth/keys, and no JSON-encoded strings or chunk envelope; other cases use
the prior parser. Numeric spelling, unsafe keys, unknown embedded JSON, reference
mapping and secret-field exclusion retain their checks. No size limit was raised.

`r1-resume-sink.mjs` verifies a contiguous named prefix by size and SHA before
reuse, compares each regenerated chunk, refuses mismatches/unknown members/gaps,
and writes only absent chunks with exclusive creation. It can mark completion
only after all old/new chunks are covered and the independent readback audit
passes. A retained source is never treated as a live database or uploaded.

Targeted actual synthetic evidence:

- Owner-selected inherited-local policy: 4 PASS.
- Bounded JSON codec including 40,000 structural records: 10 PASS.
- Affected mixed-format/current/history/ZIP/chunk integration: 10 PASS.
- Checked-prefix reuse/mismatch/gap preservation: 3 PASS.
- Scoped compiler: 0 diagnostics, `checkJs:false`.

Prior phase-seven/phase-eight applicable evidence is reused. No dependencies,
Git history, SQL/schema, platform settings, account verifiers or credentials were
changed. No old C1/G3/MF operation, SDK, database connection or website was run.

## Runtime preparation boundary

Static review confirms that `snapshot-import-local.mjs --apply` invokes
Wrangler `getPlatformProxy` and applies reviewed SQL to a new isolated stage.
That SDK/runtime operation has not been executed; it must not be an equivalent
retry of the prior MF/C1 refusal. `initializeImportedLocal` separately requires
an authorized session configuration and at least one enabled non-DEMO account
verifier. This credential-excluded conversion does not create those or claim
the original system had no passwords.

The local data is ready, while `authReady:false`: account verification material
and session signing configuration were not read, generated or moved. This does
not mean the original website had no passwords. No true login was tested.

The existing runtime stores `.wrangler` below its program root. This current
source copy is under C's configured Users share, whereas the approved real-data
destination is E. Before a real runtime import/start, keep actual state on an
explicit isolated E root rather than silently writing company data below the C
source. Source/state separation and SDK permission/dependencies remain explicit
runtime prerequisites, not reasons to run an unapproved initialization now.

The smallest actual runtime step is an explicitly approved fresh local E program
root with the reviewed source/dependencies, then
`snapshot-import-local.mjs --apply <fresh-root> <this-snapshot> <manifest-SHA>`.
It would create local import locks/staging and `.wrangler` DB/R2 state and apply
reviewed migrations only to that new target. Its current conservative space check
is 25,503,903,439 additional bytes; E had 107,130,355,712 available after conversion.
The CLI's SDK opener and the old C1/MF refusal boundary must be resolved in an
authorized execution environment before attempting it. No equivalent retry was
made here. A real non-DEMO verifier and independent signing configuration need
their own explicit action approval. The future server must use a separate port,
never silently start on daily 3000. No install/build/runtime command was run.

The subsequent [runtime source preparation](PHASE_TEN_RUNTIME_SOURCE_PREP.md)
implements verified source-backed staging and checks it with simulated bindings,
avoiding another full transfer/image copy. It is a separate source version from
this successful true-data conversion; its source pin does not replace the
conversion's executed-code fingerprint. No real local
restore, browser/login, Sites runtime/binding, GitHub creation/upload or publication
is accepted. Parent-controlled platform and credential actions remain untouched.
