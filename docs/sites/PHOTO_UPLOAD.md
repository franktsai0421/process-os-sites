# Shared photo upload policy

The IQC, IPQC-AB, IPQC-C, routine-equipment, routine-FQC and tooling photo PUT
routes use `lib/photo-upload.mjs` after their existing identity/role/origin and
feature checks. GET permissions, maintenance checks, object namespaces and module
limits remain. Original upload limits are 5,000,000 bytes, except routine-FQC and
tooling at 25,000,000. Body streaming enforces the actual bound independently of
Content-Length. The stored content address is computed after normalization.

The first supported optimization is lossless PNG recompression using standard
CompressionStream/DecompressionStream. Reversible row filtering preserves sample
bytes, dimensions and ancillary/profile/palette/transparency chunks. The result
is selected only if it saves more than 1,024 bytes. Small PNGs, animation,
interlace and layouts beyond the bounded optimizer retain their original bytes.
JPEG/WebP/GIF retain their bytes and formats. No resizing, colour conversion,
paid encoder, native sharp Worker import or new dependency is used. Invalid
signatures, corrupt PNG chunks/data and oversized bodies fail before R2 writes.

Optimization is limited to 8 MiB input, 32 MiB inflated samples and a 256 KiB row.
This is a conservative baseline, not a promise to optimize every format or
image. The shared portable core lives in `public/process/photo-policy.mjs`.
Process-editor uploads use this same lossless-first policy. They preserve
technical drawing dimensions/alpha; JPEG/WebP are no longer sent through an
unnecessary second 1600px/WebP0.82 lossy pass. Existing saved1600px WebP remains
compatible. Feedback attachment POSTs use the same core after source/account
permission checks and before their size/digest/owner/location/ACL-dependent IDs.
Their5MB/6-image limits and export/visibility semantics remain. Inline delivery
externalization and old historical objects are not globally rewritten. Existing
R1/3000/candidate image objects are untouched by new uploads. Re-encoding an
existing candidate requires a separate complete reference/hash/MIME mapping and
current-source/data parity evidence before activation.

Checks: `node tests/photo-upload.test.mjs` uses the existing locked Node sharp
only as an independent decoder; 16-bit samples are compared at ushort depth.
`node tests/photo-upload-native.test.mjs` exercises the actual compiled Worker,
normal synthetic sessions, ephemeral D1/R2 and the enabled import gate. It uses
synthetic activation records to reach post-import paths without disabling the
gate. No true user session, password, media, network or remote binding is used.
Actual Site/device visual acceptance and real-data migration are separate.

Local receipts distinguish19 helper,19 route VM,5 editor,46 feedback and19
snapshot-copy cases from the nine compiled native groups. The earlier EACCES
was resolved for the same-executor test through the tool's formal sandbox review,
without changing ports/configuration, OS/firewall or guards. Invalid synthetic
Content-Length and absent feedback initialization fixtures were corrected before
the final nine-group PASS. Route VM evidence remains separate from native PASS.

`snapshot-photo-copy.mjs` writes only a new offline copy, uses the same PNG codec
with a required independent pixel verifier, and rebuilds image keys/URLs/private
index lengths/checksums, current/history references and feedback ZIP pins. The
existing normalization/audit writer then verifies canonical object identities
and all references before browser handoff. Failures retain an incomplete copy;
original R1/3000 and the old candidate remain intact. PNG output is measured;
the earlier183-PNG benchmark actually encoded lossless WebP, not PNG, and its
88,059,514-byte saving is not a PNG-codec measurement or delivered215MB package.

Offline photo rewriting is resource scoped. A digest shared with an unchanged
feedback attachment is never globally substituted. Explicit photo keys/URLs,
typed module photo arrays and their descriptor size/checksum fields are updated;
the actual collections are `photos`, `mediaItems`, `standardPhotos` and
`methodPhotos`, plus the equipment `photoId` scalar. Ordinary business row ids
are never treated as photo references. Equipment snapshots keep the equipment
namespace even when embedded in another module; explicit photo URLs take
precedence over inferred containing-module context.
id-only records inherit module context only through explicit state-record links.
Ambiguous contexts and inconsistent descriptor pins fail. Large JSON uses two
bounded passes over the pinned source: collect direct descriptor scalars, then
apply their resolved plans. Large inline content is streamed, not buffered as
one descriptor; the index is limited to100,000 descriptors and scalar fields to
4,096 characters. Long explicit src strings remain explicit, unmodified media.
Before coalescing into an existing target, both source orders must pass the same
byte/hash and complete HTTP/custom metadata comparison. Different disposition
or custom metadata fails rather than silently dropping it; source ETags remain
provenance in the conversion plan. Regression cases include one PNG used by
tooling and feedback, a full hosted audit/export, both collision orders and
fragmented encoded photo state above8MiB. They do not establish live Site QA.

The owner reports current3000 unchanged. A bounded fixed-path sample of 13
business source files in the original local tree matches M1 by SHA-256. This is
sampled code evidence only; no live process or DB was opened. Existing R1 and
operational reference audits remain data-snapshot evidence, not a new live DB
comparison. Old backup dates do not prove there have been modifications.
