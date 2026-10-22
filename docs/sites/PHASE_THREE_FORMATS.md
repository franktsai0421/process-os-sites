# Snapshot format checkpoint — synthetic verification

Historical checkpoint: ZIP/chunked complete-snapshot integration has since been
implemented and tested with fake bindings. See
[phase four](PHASE_FOUR_INTEGRATION.md) for current results and remaining limits.

This checkpoint supersedes the format-limit section of
[phase two](PHASE_TWO_VALIDATION.md). It does not qualify full R1, a live Site,
the SDK importer or publication. All work is in the independent source copy
based on M1 `7f5dc57239d6db483f096d96df6bd6cdd7357f5a`.

## Implemented and tested

| Format | Actual implementation | Synthetic verification | Remaining integration |
| --- | --- | --- | --- |
| Large state JSON | `lib/snapshot-json-stream.mjs`; wired into D1/R2 export and isolated-local restore for recognized immutable JSON namespaces | 7 codec cases; adapter suite includes a 9 MiB current/history round trip | Full-size runtime and real format coverage remain unverified |
| Feedback ZIP | `lib/snapshot-feedback-zip.mjs`; explicit existing `web-feedback-utf8-store-v1` profile | 4 cases, including existing producer -> scrub/rebuild -> codec round trip | Not connected to snapshot export/restore; handoff table metadata and archive digest/size mappings still need coordinated rewrite |
| Legacy chunked state | `lib/snapshot-chunked.mjs`; explicit existing `state-chunks-v1` profile | 4 cases, including existing encoder -> rewrite -> existing decoder for a 9 MiB value | Not connected to bucket-level export/restore; union coverage of current/history manifests, pack slots and all listed objects still required |

The ZIP/chunked adapter refusal remains intentional until that integration is
complete. Standalone codec success is not a successful complete snapshot of
those formats. No object, history record or orphan pack content was silently
discarded to obtain PASS.

## Safety and compatibility boundaries

Large JSON is parsed incrementally. Known JSON-encoded state fields are also
decoded, scrubbed and re-encoded incrementally. Unknown large encoded JSON
fields refuse explicitly. Hashes and source references are verified before
rewriting, and immutable keys/current-history links are rebuilt. The original
small-object 8 MiB cap is unchanged; this adds a separate streaming path rather
than increasing that cap. Synthetic tests ran with a 192 MiB Node heap ceiling;
that is not proof of Workers memory capacity or an 8 GB restore.

ZIP handling follows the existing producer's UTF-8 STORE layout. It validates
names, layout, sizes, CRC and the source member manifest; scrubs JSON, rebuilds
markdown from scrubbed issues, regenerates manifest hashes/sizes and streams
image members. Traversal, unknown paths, duplicate names, missing references,
short reads, corruption, truncation, encryption and deflate refuse. ZIP64,
generic ZIP and encrypted backup containers are unsupported. Metadata is
bounded separately from images. Free text and image metadata are not claimed
to be semantically secret-free.

Chunked handling verifies manifest/pack/block/whole-value hashes, UTF-8 byte
lengths and UTF-16 block lengths. It uses a bounded pack cache and recreates
blocks, packs and the manifest after structural credential removal/reference
rewriting. Unknown versions/value formats and missing/corrupt dependencies
refuse. Returned source coverage is per manifest, not proof of complete bucket
coverage. The write callback is for a private spool or isolated stage only;
the standalone codec must not be pointed at live source storage.

Credential exclusion covers recognized structural credential fields, including
encoded state and normalized snake-case names. Source account IDs/roles remain
compatible; account verifiers/signing secrets are excluded. No new account,
verifier or signing secret was generated.

## Evidence and limitations

Reports are in the parent task directory:

- `sites-json-stream-results.json`: 7 PASS / 0 FAIL.
- `sites-feedback-zip-results.json`: 4 PASS / 0 FAIL.
- `sites-chunked-codec-results.json`: 4 PASS / 0 FAIL;
  `bucketCoverageQualified: false`.
- `sites-adapter-fixture-results.json`: current adapter regression results.
- `sites-fixture-results.json`: affected authentication/authorization fixtures.
- `sites-types-results.json`: scoped compiler result. `checkJs` remains false;
  parsing/inclusion of JavaScript is not full JavaScript type checking.
- `sites-source-diff.json`: refreshed source-only differences from M1.

No R1 payload was unpacked or read, no true DB/R2 connection or SDK was opened,
and no network, dependency installation, full build, browser, Git mutation,
credential transfer, sharing change or deployment was performed. Original M1,
daily 3000, R1 and prior G3/C1/MF refusal boundaries remain untouched. There is
no new policy refusal in this batch; the integration and runtime gaps above
are unfinished work, not tool approval requests.

## Minimum next code step

Connect the known ZIP profile to resource preparation using private bounded
spooling, preserving source integrity and synchronizing every feedback handoff
record's archive size/hash. For chunked state, first build an inventory-wide
coverage map across current/history manifests, reject uncovered pack slots or
objects, then coordinate rewritten envelope/pack references with restore.
Exercise both through the complete mock export/transport/local-restore path,
including interruption and shared-history references, before claiming those
formats are supported by a complete snapshot. Real R1 and platform acceptance
remain separate, unperformed work.
