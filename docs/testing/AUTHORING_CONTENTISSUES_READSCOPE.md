# 製程內容檢查唯讀閉包 / Authoring content-inspection read closure

## 範圍 / Scope

`GET /api/process-authoring/workflow?contentIssues=1` 在 records-v1 使用固定的
server-owned 10-key selector。不是 HTTP 可自訂的 key 清單，也不是寫入最佳化。
其他 selector、POST、完整 validation、權限與每次 session revocation 查核原樣保留。
本機候選不等於已發布；owner 已於 2026-10-27 16:20 UTC 明確接受下述限定唯讀故障政策，不包含寫入保護變更。

| 讀取鍵 / Keys | 用途 / Required contract |
| --- | --- |
| `platformUsers`, `processCustomRoles`, `processRoleTemplateOverrides`, `processAccessControl`, `maintenanceMode` | 保留既有身分／存取閉包；不快取身分、不合併撤權查驗。 |
| `processAuthoringControl` | working、saved、pending／指定歷史 case、active fixed issues。原 deferHistory/caseId 不變。 |
| `masterDataControl` | 完整 active AB/C 產品與路由、PROCESS templates／equipment IDs。不可用 legacy `processMasterData` 代替。 |
| `bomOverrides` | 完整 BOM 來源及 root validation；不可用 `bomMasterControl` 代替。 |
| `ipqcABMasterControl`, `ipqcCMasterControl` | 核准來源、標準、圖片／規則與已指派引用檢查；不可刪減 validation。 |

The current adapter has no fallback to `canonicalQuality`, legacy editor keys, or
old IPQC aliases. Their omission does not authorize dropping a future dependency:
any new context dependency must update this closure and regression together.
Records decoding verifies every selected aggregate/body as before. Legacy inline,
chunks-v1, and whole-R2 representations retain full decoding, so this selector
provides no read-scope saving in those formats.

## 故障政策 / Fault-policy decision

- Required authoring/IPQC/auth body corruption remains an error. Malformed BOM
  stays 422; incomplete BOM stays 409; missing master stays 422.
- A missing IPQC catalog already produced explicit `IPQC_REFERENCE_CHANGED`
  advisory issues (HTTP 200) in this route; the candidate preserves that behavior.
- **Intentional policy delta, owner accepted 2026-10-27:** an unrelated tooling body that
  is missing/corrupt, or its corrupt aggregate, made the old full read return 503.
  The selected read does not touch it and can return this module's valid 200 DTO.
  This is not whole-storage integrity verification and not complete fault parity.
- Reads remain read-only. `Partial read cannot be saved` is unchanged. No partial
  writer, global CAS, receipt/idempotency, photo, permission or schema change.
- This endpoint still reports its pinned state; `since` does not bypass content
  validation. No new final revision fence or cross-request cache is introduced.

## 隔離證據 / Isolated regression

Run from repository root with the repository's normal Node/TypeScript dependencies:

```sh
node scripts/test-authoring-contentissues-readscope.cjs
```

The portable runner loads exact baseline commit
`1c40495c4ee31d10501a6e46979ac8305db550c0` and the current route through the same
actual-handler loader. It asserts different route hashes, baseline override use,
Windows separator normalization, and LF/CRLF strict selector-only reversal.
Missing historical Git input fails the test; it is not silently replaced.

- Normal synthetic HTTPS login and actual guarded Apply/Save/Submit/Return/Approve,
  Begin, subsequent draft/pending and logout. AB/C quality catalogs and the
  unrelated 600 KiB payload are explicitly **derived fixtures**, not normal quality
  approval or live-data migration evidence.
- 37 old/new pairs: 34 exact DTO/status/header/validation/auth pairs plus the three
  documented fault-policy deltas. All 74 measured GETs attempt no SQL/R2 writes;
  complete SQL-table and R2 key/bytes/metadata snapshots remain equal per GET.
- Normal Apply+Save sample: **17 → 14 R2 reads; 668,313 → 44,090 read bytes**.
  Both sides retain **9 SQL reads, including 8 fresh session-revocation checks**.
  The avoided bytes include the derived unrelated body and legacy source aggregate;
  they do not quantify the live site's data distribution.
- Node process CPU/wall samples are recorded, but instrumentation, GC and scheduling
  vary. They are not Workers CPU, heap-peak measurements, matched live latency or
  a guaranteed speed percentage. This change does not speed up mutation POSTs.
- Actual editor-module history permission equals view. The explicit-case denial
  test covers that real contract, not a fabricated independent history cell.

Required integration gates: independent review, explicit unrelated-fault-policy
acceptance, dedicated CI command with its normal exit guard, full project CI/build,
and separately authorized native verification. No live/browser acceptance is
claimed by this synthetic runner.
