# ZIP / legacy chunked snapshot integration — synthetic acceptance

This supersedes the unconnected-codec status in
[the format checkpoint](PHASE_THREE_FORMATS.md). It qualifies only the named
profiles through mocked bindings, not a Site, SDK runtime, full R1 or release.
The independent copy is based on M1
`7f5dc57239d6db483f096d96df6bd6cdd7357f5a`; its new edits are uncommitted and
the copy has no Git metadata. That baseline SHA is not an assertion that the
modified program already has a reviewed release commit.

## Implemented behavior

`snapshot-format-plan.mjs` coordinates container preparation with the existing
export/transport/isolated-local restore path. Source DB/R2 bindings receive no
writes. It retains descriptors and bounded indexes, not a bucket-sized payload.
Pack coverage uses compact bitmaps; rewritten pack descriptors are shared across
manifests rather than duplicated for every historical reference. Export
recomputes pinned transformed objects under transport backpressure instead of
keeping a complete transformed bucket in memory.

Feedback archives use only the existing UTF-8 STORE producer profile. Every
handoff must have its corresponding archive, and every listed archive must have
one handoff. The original archive size/hash, member CRC/manifest, issue list and
selected-issue digest are validated. Attachment records/objects are checked by
size and hash. After structural credential removal and reference rewriting,
archive bytes and the handoff record's `size`/`sha256` are updated together.
Restore repeats validation and rebuilding after immutable dependencies have
been rekeyed; ZIP/DB issue references therefore agree in the local destination.

Legacy chunked preparation includes every listed v1 manifest, including those
outside current DB references. It validates manifest/pack/block/value integrity
and unions all manifests' pack-slot coverage. An unreferenced pack, hidden slot
or unused manifest block descriptor is refused rather than dropped. Verified
secret fields are excluded; other values are streamed into new blocks/packs and
manifests. Current/history envelopes are rewritten together, and repeated
history rows pointing to identical content remain repeated rows sharing the
new immutable object. Local restore rebuilds again after dependent records are
rekeyed. Bare chunk-storage strings outside a verified envelope are unsupported.

## Actual evidence

- Mixed format integration: **10 PASS / 0 FAIL** in
  `sites-format-integration-results.json`.
- Existing adapter fixtures: **20 PASS / 0 FAIL**.
- Affected account/role/media fixtures: **18 PASS / 0 FAIL**.
- JSON stream codec: **8 PASS / 0 FAIL**; known ZIP and chunked codecs:
  **4 PASS / 0 FAIL each**.
- Scoped compiler check: **0 diagnostics**, `checkJs:false`. This includes the
  new format coordinator but is not full JavaScript type checking.

Reports and the current `sites-source-diff.json` are in the parent task folder.
The mixed fixture contains a 9 MiB state value produced by the existing chunk
encoder, current and distinct historical states, repeated historical references,
legacy JSON snapshots/records, company images and a feedback archive made with
the existing ZIP producer. It crosses the NDJSON transport and is restored by
the actual local adapter using fake DB/R2 only. The existing legacy decoder
checks restored business values; ZIP bytes and handoff hashes/sizes/issues are
compared after local dependency rewriting. Source binding write counts are 0.

Failure cases cover missing/corrupt packs, hidden slots in a shared historical
pack, orphan packs, unknown manifest versions/unused blocks, missing ZIP/image,
outer metadata mismatch, a correct outer ZIP digest with invalid internal CRC,
unsafe paths/deflate/truncation, forged import encoding, transport checksum
corruption and export/R2-write interruptions. Failed imports retain isolated
staging/partial objects without publishing DB records or a completed receipt.
The existing nonempty-target refusal and private-directory checks still pass.

An early regression run found an outdated test expectation: malformed chunk
namespace keys now receive `SNAPSHOT_CHUNK_OBJECT_PROFILE`, not the old blanket
unsupported-format code. The refusal assertion was updated for that specific
input; it was not removed or relaxed. The failed intermediate report remains
`sites-adapter-integration-progress.json` alongside final PASS evidence.

## Limits still enforced

- Input is Snapshot V1 plus the named object profiles. **The outer R1 delivery
  ZIP is not a direct input to this snapshot importer.** This code is not a
  generic ZIP/backup converter or a first-data hosted importer.
- Feedback ZIP: UTF-8 STORE only; archive at most 64 MiB, at most 256 entries,
  combined source metadata at most 8 MiB, each image at most 5,000,000 bytes.
  Encryption, deflate, ZIP64, extras/comments and unknown paths refuse.
- Chunked: v1 only; known JSON state fields and the two explicit raw flags;
  8 MiB manifest, 256 KiB pack, four-pack cache, 50,000 block descriptors per
  manifest. Unknown data semantics, bare references and incomplete inventory
  coverage refuse. Generated object count is at most 10,000; accumulated
  manifest dependency-index entries at most 100,000.
- Existing bounded D1 capture (4 MiB / table row limits), 10,000 listed objects,
  small-JSON 8 MiB cap, known large-JSON streaming profile, transport chunk/count/
  total limits and empty-local-target requirements remain. No cap was raised
  and no history was ignored to obtain PASS.
- Synthetic integration used a 256 MiB Node heap ceiling; codec cases used
  192 MiB. These are not measured Workers memory/CPU/subrequest acceptance or
  proof of an 8 GB transfer. Export currently performs multiple pinned passes;
  actual platform request/CPU limits are unverified.
- Structural credential exclusion is not a claim that arbitrary free text or
  image metadata can be semantically classified as secret-free. Source account
  verifiers/signing secrets are excluded; imported receipt remains
  `dataReady:true, authReady:false`.

## Minimum prerequisites for a separate real-environment phase

1. Fix the reviewed program version and schema/migration target, then authorize
   the exact isolated runtime exercise. Check that it is not a retry/equivalent
   of prior denied G3/C1/MF operations; this work grants no such exception.
2. Prepare separate Frank-only test DB/R2 bindings and an empty isolated local
   destination; verify actual Workers/SDK compatibility, close/cutover behavior,
   memory/CPU/request budgets, capacity and Windows filesystem safety first
   with synthetic data. Platform sharing/deployment is still a separate action.
3. Provide an approved private application-auth setup for the eventual test
   environment without placing verifiers/signing secrets in a snapshot or Git.
   Export still requires a normal admin session and `master.export`; no hosted
   write/import endpoint or automatic return path was added.
4. Separately authorize and identify the real data operation and format bridge.
   The selected 2026/10/14 rev496 R1 must be mapped/qualified to the supported
   initial-data flow before import, including all inventory formats, history,
   images, exact counts/hashes and capacity. Neither outer-package conversion
   nor real first-data import has been performed or accepted here.

No SDK, site, true DB/R2, R1 payload, real secret, network, dependency install,
Git write, access change or deployment was used. Original M1, daily 3000 and R1
are preserved. No new tool-policy denial occurred; prior G3/C1/MF refusals are
unresolved and were not retried. Full build, browser and platform acceptance
remain unperformed under the current task boundary.
