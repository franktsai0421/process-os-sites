# IPQC filter and whole-set choice follow-up

Base: `4a10e935ef8bd4cb3d4beecaa38ebf8c6f1508c2`; isolated branch
`work/ipqc-filter-audit-20261110`. The prior delivery and root checkout were not
edited. Only local synthetic fixtures were written; no live data, migrations,
permissions settings, remote writes, publication or unknown resend occurred.

## Actual page coverage

| Page/control | Verified behavior |
| --- | --- |
| A/B line, group, stage, outside-route toggle | Existing module snapshots, exact original bases and File objects survive A→B→A and stage/route filtering; no POST or photo PUT. All retained groups still share one module Save. |
| A/B equipment category/subcategory/group/search | In-progress item fields and original selected File survive picker filtering and return; no write. |
| C product search, product, stage and error selection | Same working object, original localBase and journal objects/bytes and selected File survive view changes; hidden other-product edits participate in the same global Save. |
| C equipment category/subcategory/group/search | In-progress modal fields, File and existing module journal/base survive actual picker events and return; no write. |

A/B has no main-page search or separate draft subtab: items and matrix are on the
same page. C has no separate category draft or draft subtab: categories belong
to its equipment picker. Changing the top quality module from A/B to C is an
actual module departure, handled by the existing root navigation adapters, not
one of these filters. This follow-up does not introduce new draft scopes.

## Confirmed bug and fix

The A/B client treated `standardPhotos`, `methodPhotos` and `rules` as whole-array
conflicts. Two independent photo-note changes on different photo IDs asked an
unnecessary conflict; choosing a side could then replace the peer's independent
photo/rule fields. Five new actual-route/DOM cases failed against the exact
immutable base source (0/5) and pass after this fix (5/5).

The client now builds disposable Save candidates using stable IDs. Independent
photo/rule additions, removals and scalar changes compose; delete-versus-edit,
incompatible order and actual same-field changes use the existing single global
mine/theirs choice. Rule cadence/kind variants remain coherent atomic units.
Independent added photos remain even when the global choice uses theirs for an
unrelated field. Both order choices retain other IDs' independent fields and
peer additions. Exact latest arrays become the command guards; original RAM,
base, File ownership pins, global revisions, CAS, server validation and receipt
identity are unchanged. Cancel never commits the disposable candidate.

No C production change was needed. Its existing ID/field/photo-list merge retains
other-product edits through global mine/theirs choices; only fixture visibility
and new event-based tests were added.

## Verification and limits

- Final combined actual-handler/DOM regressions: **204/204 PASS** (A/B conflict
  UI, Save revision fences and C filter tests).
  `node --test --test-timeout=30000 tests/ipqc-ab-conflict-ui.test.mjs tests/ipqc-ab-save-revision-fence.test.mjs tests/ipqc-c-filter-preservation.test.mjs`
- Added targeted cases pass: 5 scalar structured-list cases, 4 order/deletion
  cases, A/B main filters, A/B equipment filters, and 3 C filter/choice cases.
- The 22 revision-fence tests pass after making the extracted-function fixture's
  disposable-merge dependency explicit. Full actual-IIFE tests cover that merge.
- Affected typed lint, script syntax and diff checks: **PASS**.
- Fixtures use normal synthetic logins, actual module IIFEs/shared transport,
  actual routes and isolated SQLite/R2. They do not prove real browser layout,
  mobile/device input behavior, root module departure or production acceptance.

No server, API, schema, permission-policy, workflow metadata or business-model
change. Root integration owns shared documentation and AB asset/cache pins;
this change depends on the existing exact revision/generation/unknown guards.
