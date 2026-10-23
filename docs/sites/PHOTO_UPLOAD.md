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
image. Process-editor/canvas, inline state media and feedback attachments retain
their existing separate flows; they have not been silently rewritten. Existing
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

Local checkpoint: 19 lossless helper cases and 19 explicit-dependency route VM
cases pass, with full TypeScript and actual build. The compiled photo fixture
currently stops at startup with `connect EACCES 127.0.0.1:58410`; zero native
photo cases ran. It was disposed and no alternate executor, network permission,
firewall change or further connection retry was used after EACCES was identified.
The route VM is independent evidence, not a substitute native PASS.

The owner reports current3000 unchanged. A bounded fixed-path sample of 13
business source files in the original local tree matches M1 by SHA-256. This is
sampled code evidence only; no live process or DB was opened. Existing R1 and
operational reference audits remain data-snapshot evidence, not a new live DB
comparison. Old backup dates do not prove there have been modifications.
