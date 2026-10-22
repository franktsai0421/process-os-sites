# Phase two — bounded adapter fixture verification

Historical checkpoint: current large-JSON and standalone ZIP/chunked progress
is recorded in [the format checkpoint](PHASE_THREE_FORMATS.md), which supersedes
the format limitations below. The counts below describe the earlier batch.

This document supersedes the unverified status in PHASE_TWO_CHECKPOINT.md.
It does not qualify a live Site, SDK importer, full R1 package or publication.

## Actual results

- Adapter fixtures: **19 PASS / 0 FAIL** after the recorded fix.
- Affected phase-one fixtures: **18 PASS / 0 FAIL** on current source.
- Scoped TypeScript/interface check: **0 diagnostics**. JavaScript files are
  parsed/included but `checkJs` is false; this is not full JavaScript type checking.
- No SDK, real DB/R2, R1 payload, network, dependency installation, build,
  browser, real credential or remote mutation was used. Filesystem cases contain
  synthetic payload only, in fresh task-local directories retained as evidence.

Reports in the parent task directory:
`sites-adapter-fixture-results.json`, `sites-fixture-results.json`,
`sites-types-results.json`, and the refreshed `sites-source-diff.json`.

## Failure found and repaired

An added regression first failed because structural credential redaction omitted
generic `secret` and snake-case verifier/token/key fields. The scrubber now
normalizes separators/case before matching known credential field names.
`sites-adapter-regression-before-fix.json` retains the failure. The corrected
test passes for current, historical and JSON-encoded values; IDs/roles/business
values are retained. This does not claim arbitrary free text or image metadata
can be semantically classified as secret-free.

The trailing-stream test was also corrected: it now sends a valid complete
manifest and all valid chunks before appending another record, then observes
the explicit trailing-data refusal. It no longer passes by rejecting an invalid
empty manifest before reaching the behavior it is intended to test.

## Tested boundaries

D1/R2 mocks exercised bounded table capture, R2 pagination, ETag/source revision
drift, nested missing references, immutable rekeying shared by current/history,
multipart image restoration and post-write verification. Tests confirm source
bindings receive no writes. Corrupt chunks/readback, truncated/trailing streams,
remote-target proof and nonempty targets do not publish completion.

The actual Node import entry was called only for its existing-target refusal:
the injected runtime opener was invoked zero times and the existing marker was
unchanged. A real fresh-target SDK import was not executed.

Normal-account session behavior, DEMO default-off, anonymous/header spoofing
refusal, role projection, visible-image authorization and cross-role snapshot
export refusal were rerun. This is not a complete role/line/workflow/browser
regression matrix. Windows junction/TOCTOU behavior and complete runtime close,
migrations and filesystem cutover remain unverified.

## Full R1 remains unsupported

The current conservative profile retains all refusals: JSON object maximum
8 MiB; bounded D1 capture; ZIP/unknown containers unsupported; old state-chunks
storage unsupported. No limit was increased and no history/archive was dropped
to obtain PASS. Source format coverage and full-size restore acceptance remain
open; prior R1 inventory contains ZIP objects, so this profile cannot claim a
complete R1 import/export.

Minimum next step is a bounded streaming JSON/encoded-JSON redactor and rekeyer,
an explicit ZIP entry/credential/CRC/path policy, and a chunked-state codec that
preserves every historical and media reference. Verify those with synthetic
large objects/containers before any separately authorized full-size runtime
exercise. Do not simply raise the 8 MiB cap or skip unsupported resources.

The hosted exporter needs an exact reviewed program commit at runtime. Imported
data intentionally has no source account verifiers or signing secrets; normal
local login still needs separately authorized private authentication setup.
No bootstrap account, verifier or signing secret was created by this batch.

Old G3/C1/MF refusals remain separate and unresolved. Presence of importer source
does not authorize retrying their actions, installing dependencies or launching
the local SDK. There was no new tool-policy refusal in this verification batch.
