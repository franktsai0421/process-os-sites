# Bounded reads and image loading — not published

This note covers the read/media portion of the integrated candidate.
[Persistent navigation](PERSISTENT_NAVIGATION_20261025.md) describes its separate
same-document behavior. Visible menus, URLs, layouts, workflows, data models and
existing session/data/action permissions are retained.

## Changes

- IQC initial GET selects identity/access fields and its own control before
  immutable-record hydration. Output, history/metadata, permissions and POST
  remain unchanged; legacy storage retains its complete fallback.
- Five compatible quality clients use the existing fresh-authorized conditional
  state read: FQC, IQC, equipment, tooling and scoped IPQC-AB. Metadata-only reads
  cannot advance a full-model token. No global-revision retry barrier is added.
- Thirty-two audited noncritical image producers receive native lazy/async hints.
  The policy covers quality lists/pickers, process/product-media grids, secondary
  galleries, draft comparisons, routine history and feedback thumbnails.
- Tooling and authoring interval reads skip hidden documents. Existing foreground
  intervals, manual reads and write/recovery behavior remain.
- Canceled equipment dialogs release only preview URLs not owned by pending photos.

## Compatibility

Original image bytes, URLs, full-size viewers, selected critical images, print/
export originals and canvas presentation remain unchanged. Existing boxes and
layout dimensions are retained. Authentication, reference authorization and
private no-store responses are unchanged. No recompression, media migration,
private cache, thumbnail API or all-image preload is introduced.

Native lazy loading is a hint, not a fixed request budget. It can defer offscreen
URL requests/decoding; it cannot remove inline image bytes already received in
HTML or JSON. No live latency, layout-shift or peak-memory improvement is claimed.
The precise producer policy is in
`tests/fixtures/bounded-image-policy.json`; executable checks are in
`tests/bounded-media-loading.test.mjs` and `scripts/test-iqc-bounded-read.cjs`.

## Validation status

Application code is byte-identical to
`fff6a8231f58af817e19e2b2d2828f1b86e95a28`. Test infrastructure now uses portable
Chrome discovery; 15 focused preflight/launcher checks PASS. The first CI run did
not reach the compiled browser; the corrected exact-head run remains pending.
Existing application evidence is reused, not represented as new executions:

- PASS: 10 actual IQC/route handler groups, including storage compatibility,
  permissions, history/adoption, corruption and unrelated revisions.
- PASS: targeted image policy, original/full-size references, 100-row IQC markup,
  conditional reads, hidden polling and preview-ownership checks.
- PASS: full TypeScript and the official build for the unchanged-code candidate.
- NOT_RUN for this revision: exact-head compiled-browser CI, user visual preview,
  native Chinese/Vietnamese IME and real-data latency/scroll/long-run memory checks.

Table/data readiness, visible-image readiness and all-offscreen-image completion
are different measurements. Synthetic results do not establish production speed.
This candidate has not been published.
