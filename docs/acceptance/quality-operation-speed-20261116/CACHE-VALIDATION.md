# Historical cache guarantees and current integration sources

2026-11-17 continuation of draft #126. Runtime remains exactly local candidate
4ab02ab83d1442c2ab9dada9086360fdd241728f. No business data, permissions, schema,
source-contract implementation, original manifest, or cache implementation changed.

## Failure and repair boundary

The original six-test suite assumed HANDOFF and every product file still matched
pre-cache ea137c7dd8d608d216d45ab29b033fc5f782ff5d. Integration legitimately changed
11 product files and added two wire helpers. Feeding current HANDOFF to the old
oracle and requiring zero product diff therefore failed. This does not establish
a cache defect. No current source is projected to erase those differences.

The original tests/source-normalization-cache.test.cjs remains byte-identical,
SHA256 33f88a4ae7d8b3e72bcef47c503c83183b390e9388ac90bb6d7fa7c17510e005.
The runner requires current canonical cache bytes to equal the fixed historical
0f2c8ec5b3bc8f6a5625ef049782fab1f96988b1 implementation, SHA256
 a81c6662a3c2706a3a910d19b6cba7afa0550a6a879d0193c6871e7760064570.
It installs those verified CURRENT bytes into a temporary historical worktree and
runs every original assertion unchanged. Identity drift or absent historical Git
objects fail explicitly; there is no fallback to an old cache or skipped fixture.

A separate current-source suite uses raw current bytes and a direct uncached UTF8,
CRLF normalization and SHA256 oracle. It covers all 13 changed/new product files
and HANDOFF, output/input mutation, shared buffers and EOL variants. The original
six tests retain invalid input, slab contamination, LRU and oversized-input cases.
Existing real composition restore receives raw current inputs, with only the
cache replaced by an uncached oracle for comparison; complete output is also
compared to actual historical Git parent bytes. Existing dual-parent integration
tests retain positioned changed/missing/duplicated source negatives and HANDOFF
proofs. These are test-only provenance guarantees, not production authorization.

The two helpers have no historical parent files. They are verified as additions
with exact contents, then exercised by existing wire/handler regressions. They
are not assigned a fabricated historical inverse or new admission policy.

## Fixed inventory and EOL

The checked-in fixture tests/fixtures/quality-cache-source-pins.json records all
391 product paths, modes, blobs, canonical and LF SHA256 values, all 13 M/A deltas,
42 original JSON manifests and exactly three new manifests. Its full normalized
SHA256 is 44d61db165c51d1ee3b8e4a9aec265dd5770958566318c880b236f78e30608dc.
These are fixed candidate records, never generated from HEAD during tests.
Historical manifests remain bound to their actual base Git objects.

HEAD and index must match canonical records exactly. Disk text must be valid UTF8
and differ only in CRLF/LF; binary bytes must match exactly. Disk traversal includes
ignored and untracked files, rejects symlinks and unknown source directories, and
uses no gitignore exclusion. app/lib/public permit no generated files. Root build,
dependency and isolated fixture directories are outside that bounded source scope.
JSON enumeration uses fixed scripts directory names and exact JSON path sets, so
missing or ignored extra JSON cannot disappear from validation.

The historical fixture uses core.autocrlf=false to preserve the original raw-byte
assertions. Current checkout EOL is tested separately. The runner needs Git, Node,
a writable temporary directory/worktree metadata and fixed history/base objects;
no dependency junction is required. Existing CI fetch-depth=0 and its 15-minute
job limit are retained. A Windows job runs the same dependency-free runner with
the same 15-minute limit. Missing fixtures fail; no retries or increased limits.

## Local evidence and remaining gates

- Original historical assertions with current cache: 6/6 PASS, no skips.
- Current raw-source and existing dual-parent assertions: 67/67 PASS, no skips.
- Existing wire, quality/process handler, readiness, bounded-read, local atomic-save
  and CAS/permission regressions: 94/94 PASS, no skips (Linux Node 24.22.1).
- Isolated inventory negatives: ignored/untracked product additions, unstaged
  non-EOL change, staged change with restored disk, missing pinned JSON and extra
  JSON all rejected. Clean inventory and CRLF helper checkout accepted.
- Lint and whitespace validation: PASS after correcting new test lint findings.
- No runtime edits since the prior integrated build; this continuation changes
  test orchestration, fixed evidence and documentation only.

These are local synthetic checks. New remote head/tree and full CI must be checked
after upload; previous-head results cannot substitute. Local safety must retain
its complete original steps. Windows EADDRINUSE and original Feedback
INVISIBLE_TARGET remain not uniquely attributed; subsequent passes alone do not
resolve their causes. No Office latency improvement or live acceptance is claimed.
No merge, deployment, account changes or restricted connector use.
