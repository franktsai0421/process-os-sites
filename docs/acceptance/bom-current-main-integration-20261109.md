# BOM approved history on current main, local integration

The reviewed BOM branch `ab306562540415b8dec4f3584e540577911cd551` is
integrated with main `b06394ce0065849733399423afd2d906761d69c1` through
real merge `494d638`. Main's equipment source is retained. This is a local
source candidate, not a published PR, merged main or deployed acceptance.

## Scope and behavior

- The page lists approved versions only. Selecting an older version displays
  immutable historical content read-only; returning to the current draft keeps
  the same current writer and the in-page RAM state. Viewing makes no POST.
- The existing BOM local Save and occurrence conflict choices remain. Unsent
  edits do not create a private recovery copy or reappear after leaving the page.
  Original pending operations remain durable and recover by their own receipts;
  missing receipts do not authorize resending.
- Shared-client integration adds the BOM-only approved-history methods to the
  exact main client. Equipment explicit delivery recheck, structural ACK equality,
  original operation identity and UNKNOWN safeguards remain.
- No schema, permission grant, account, real data, import, automatic cleanup,
  release configuration or deployment change is made.

## Change, risk and verification

The shared client and cache URL are the only product merge overlaps. The BOM
runtime/backend/UI files retain the exact BOM parent bytes; equipment runtime
retains exact main bytes. A unique shared-client cache tag is
`20261109-bom-main-history1`. BOM and equipment keep their own existing tags.

A test-only integration proof independently attests actual current runtime and
inner proof dependencies. Exact full-file hashes, lengths and inverse byte spans
recover both real parents for the overlapping client and shell. Inner BOM,
equipment, reporting and original historical pins remain unchanged. Some source
suites explicitly run on those parent projections, never as runtime acceptance.
Actual BOM/shared/equipment behavioral suites load the actual integrated source.
Whole rollback, partial/repeated spans, changed authority/helper bytes, invalid
UTF-8, non-Buffer inputs and wrong paths are rejected separately.

Both source CI jobs execute the integration proof. Feedback now fetches ancestry
because exact-parent assertions need both real merge parents. Windows local
safety already fetches full history. This fixes a newly reproduced depth-one CI
failure without weakening source checks or inventing missing Git history.

## Local evidence and limits

The separate delivery manifest records exact checked heads, command arguments,
exit codes, log hashes and final artifact hashes. The initial integrated source
run found two CI-fixture failures: duplicate merged path triggers and a missing
new history command. Both were corrected. Independent review then identified
Feedback's shallow checkout; a fresh shallow clone reproduced the failure and
fetch-depth was corrected. A real Git CRLF checkout also exposed thirteen
older unsent-source fixture failures. That reader now verifies byte-level
checkout EOL equality before using committed bytes; static pins, span offsets
and semantic refusal assertions are unchanged. Original failure logs are retained.

Behavioral verification includes the real BOM caller/common selector and handler
with synthetic DOM/SQLite/R2, approved-only filtering, read-only current-return,
late ownership/permission changes, original unknown receipts and conflict Save.
These are not native browser, iPhone, live account or production-data acceptance.

The inherited shallow boundary still lacks the original f0ab/cfb historical
objects, the e3f7be2 source-review anchor and a c991 fixture blob. The original
historical suites, full-history preflight and preflight unit fail at those missing
objects, as on the earlier parent. Two legacy BOM scripts still need the absent
imported-data.js. No real data or fabricated objects are added to make them pass.
Changed-file source inspection does not establish full-history/privacy approval.

Remote CI, native Windows/browser/device and live acceptance, publication and
deployment remain uncompleted. No blocked or uncertain external operation is
retried. Missing evidence for a prior uncertain source transfer is not treated as
proof it failed. Do not call this candidate release-ready or all tests passed.
