# BOM / equipment same-page input and conflict audit

Local contribution on integrated `4a10e935ef8bd4cb3d4beecaa38ebf8c6f1508c2`.
The earlier delivery and candidate checkouts remain unchanged. No remote writes,
schema/migration/data change, permission-setting change or new cross-scope
transaction is included. Parent integration owns cache URLs and exact source
proof/CI composition.

## Page findings and outcome

| Page/control | Observed behavior and acceptance |
| --- | --- |
| BOM root/code/occurrence, parents/children/forest/edit | Completed RAM edits and their original guards survive all actual controls, including multiple roots and reused material codes at different occurrences. No remote draft comparison or local unsent persistence occurs. |
| BOM unfinished edit | Existing specification requires completion/discard before position changes. Root/view/search attempts stay on that edit with its field value and original basis intact. This audit preserves that policy. |
| BOM import preview | Actual File event and bundled XLSX parser create the preview. Per-field edited decision/value and original preview basis survive root/occurrence/view/search changes. Unapplied preview cannot silently join Save; applied ordered operations remain through the same controls. |
| BOM hidden/filtered edits and Save | One Mine/Theirs decision changes only conflicting fields; local and peer disjoint fields survive even when the edited occurrence is hidden. No product change was needed. |
| Equipment hierarchy filters | Reproduced loss of new-drawer input/File and closure of existing editor/cancel basis on category/subcategory/group selection. Filters now retain the open RAM form/editor, exact File/preview and original comparison basis. Search already retains them. |
| Equipment new subcategory/group | Reproduced silent parent retargeting: the dialog survived filtering but completion used the latest list filter. Dialog now captures original parent IDs. A missing/inconsistent original parent retains the dialog/input and refuses insertion. |
| Equipment new drawer group | Header, group choices and completion use the retained form's group rather than the current list filter. An invalid group refuses completion instead of falling back to the current filter. |
| Equipment node/catalog/search/Save | Existing category/subcategory/group private name/photo survives filtering until explicit completion/cancel. Completed hidden edits retain original basis; Mine/Theirs preserves both disjoint sides. |
| Equipment reference and cross-entry view | Existing full-script readonly reference-view/FQC/IPQC-AB entry checks pass. The full 30,850-byte readonly/reference region and 46,517-byte transfer region remain identical to the integrated base. No new transfer or authority path is added. |
| Tooling cross-entry | Owned by the canvas/tooling agent. This contribution does not certify its behavior. |

## Verification

- PASS: 329 affected tests: new page retention plus existing equipment grouped
  Save, sent-batch/insert ACK, no-poll, BOM grouped Save and actual router/unknown
  departure cases. Log: `/tmp/bom-equipment-page-retention-regression.log`.
- PASS: final strengthened new page suite, 17/17. Includes multiple BOM roots,
  reused occurrence codes and actual File → bundled XLSX → preview path.
  Log: `/tmp/bom-equipment-page-retention-final.log`.
- PASS: existing `test-equipment-reference-view.cjs`, 21 groups. Actual full
  frontend handlers with synthetic readonly HTTP DTOs; no writes. Log:
  `/tmp/bom-equipment-page-reference-view.log`.
- PASS: scoped runtime oxlint and `git diff --check`.

Initial failure evidence is retained. The initial equipment-only tests reproduced
five failing cases. The synthetic input helper then gained native-equivalent
property-handler delivery (`oninput` plus registered input listeners); two
intermediate failures were fixture delivery gaps, not additional product bugs.
The final test suite is also executed against immutable base bytes to retain a
precise before/after control. No old failure is relabeled as a pass.

The earlier minimal equipment fixture reports missing FQC reference confirmation
when opening an edit form because that fixture intentionally supplies incomplete
reference DTOs. It does not assert those references are empty/healthy. Separate
21-group readonly reference tests cover the proper synthetic view DTOs; live
API/ACL/database reference acceptance is outside that test.

Unchanged reference region SHA-256:
`9cd8a937f94ffea61d8433309d7f825ae9e748117f4f9b357c708c7f85b92207`.
Unchanged transfer region SHA-256:
`e2e878705bb9ce23fa6e8b20206eb8ee00f96cdbaae193a8bbf35e5ca2e06ac4`.

## Remaining gates and impact

No native browser layout/hit-testing, mobile/IME, new compiled build, remote CI,
real account/data, hosted or publication acceptance is claimed. The tests use
shipped closures/event handlers and synthetic DOM/File/HTTP ports; existing
route/ACK regression fixtures use isolated synthetic SQLite/R2. Final integrated
cache/source pins and build must be checked by the parent. Equipment is the only
runtime file changed; BOM changes are tests only. Data-model impact: none.
