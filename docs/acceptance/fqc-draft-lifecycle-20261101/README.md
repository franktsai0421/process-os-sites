# FQC 草稿按鈕驗收 / FQC draft-button acceptance

## 範圍與來源

This tests-only extension preserves #56's process/canvas history and merges the
already-public main `0008df71130fb165054fd38e9f801a86749237aa` (#58). It does not
change production JavaScript, APIs, permissions, schemas or live data. The prior
18 process phases × 5 cycles are **not** FQC evidence. The new matrix-toolbar
position and its user screenshot approval are a separate UI change; this runner
uses the existing control IDs, not an unapproved layout assertion.

The authorized target is Begin, stored-draft readback, Save, Submit, error/item
form edits and Apply, matrix edit/Apply, plus withdraw/resubmit and distinct
reviewer Return/Approve with guards intact.

## Existing coverage, and why this adds a separate runner

| Existing source | Actual layer | Coverage / boundary |
|---|---|---|
| `tests/fqc-apply-browser.test.mjs` | Native Chromium, actual module/TS handlers, isolated memory ports | Four width/language combinations of Begin, new/edit error and item, Save, reload; not complete compiled-shell review workflow |
| `tests/fqc-matrix-browser.test.mjs` | Native Chromium, actual module/client, in-memory HTTP oracle | Six width/language combinations of matrix/local recovery/focus/layout; not real backend workflow/CAS |
| `tests/fqc-apply-reliability.test.mjs`, `tests/fqc-matrix-batch.test.mjs`, `tests/fqc-required-dependencies.test.mjs` | Actual functions/transport/routes with synthetic ports | Permission/owner, unknown and batch/CAS failures; not click-to-ready timings |
| `scripts/test-fqc-browser.cjs` | Older shared-state mock | Includes conditional `if (count)` flow; **not** accepted as proof that every required button ran |
| New `tests/fqc-draft-lifecycle-route*` | Actual TS routes, signed actors, ephemeral SQLite/Map R2 | Five lifecycle cycles, explicit request/SQL/R2 accounting and negative cases; no browser timing claim |
| New `tests/fqc-draft-lifecycle-browser*` | Prepared compiled Worker + native Chromium in existing CI | 33 mandatory action phases × 5 fresh synthetic cycles; not passed until exact CI result is available |

## Exact native scenarios

Each of the following requires a unique visible enabled control, real click,
asserted usable UI, completed request accounting and independent persisted-state
verification. Missing controls are failures, never skipped branches.

- Begin.
- Error: existing edit/open + Apply; new/open + Apply; edit/open + Cancel.
- Item: existing edit/open + Apply (name, description, fixed-count rule and product);
  new/open + Apply; edit/open + Cancel.
- Matrix: local choice + Discard; local choice + explicit batch Apply. Local choice
  and Discard must produce zero POSTs and no shared-state changes.
- Save; fresh signed-context stored readback; select the saved editable draft.
- Submit open/confirm; Withdraw open/confirm; Resubmit open/confirm.
- Real approval quality-tab entry, exact pending case select; Return open/confirm.
- Returned draft Submit open/confirm; exact case select; Approve open/confirm.
- Each cycle also checks read-only UI has no mutable form/workflow controls, all
  explicit FQC mutation grants remain false, unchanged unrelated scopes, and the
  three case outcomes `withdrawn`, `returned`, `approved`.

The route tests keep no-change/Save prerequisites, pending lock, reader denials,
original field guard and stale revision conflicts, malformed structure, server
allocation, distinct reviewer and receipt-only lost-ACK checks. These route
negatives are reported separately from the positive native UI samples; they do
not become measured UI failure-recovery cases.

The quality review shell intentionally includes modules this synthetic reviewer
cannot read. Their actual denied responses/error panels are checked without
adding unrelated privileges. Overall shell readiness plus the exact usable FQC
panel is required; sibling denial panels do not count as FQC success or as an
all-modules-clean claim. Any HTTP error inside a measured FQC action still fails
its strict collector; there is no blanket 403/404 exemption.

## Measurement and execution

The CI entry is the existing `local-safety.yml` compiled-browser step, **after**
the unchanged process runner. All existing gates remain, with native exit checks
and new Node suites running at concurrency 1. No new workflow or local browser
capability bypass is introduced.

Every completed action must have five distinct cycles before median/max are
emitted. The report retains each sample and GET/POST count, request/response
bytes, available client phases and optional Server-Timing. Missing Server-Timing
is `null`; it cannot establish DB, network or CPU causality. No timing is filled
from VM execution or the prior process samples.

The UI clock starts at the DOM click and ends after the specified readiness and
two animation frames. It includes automation/IPC readiness observation. Text
entry and independent authoritative DB checks are outside that clock. The draft
version selection includes a real select click followed by automated selection.
Fresh-context Save readback is a correctness checkpoint, not falsely reported as
same-document click timing. Same-window background API requests remain counted.

All browser contexts are fresh per cycle; the shared-state row is reset only in
the owned nonpersistent fixture. Worker/R2 reuse retains earlier immutable
objects, so this is not a cold-cache/fresh-R2 measurement. Signers are ephemeral;
no employee account, station or credential is used. Desktop CI is not live HTTPS
latency, a physical phone, or a promise that every action stays under one second.

## Explicit remaining boundaries

This first FQC lifecycle batch does not silently mark photo uploads, equipment
picker subflows, import/export, delete, history/restore, reload/navigation timing,
conflict/unknown **UI** recovery, or physical mobile as covered. Those have
separate existing tests or remain unmeasured and need their own named scenarios.
The overall 173-row draft inventory is not complete merely because this batch
passes. No merge/deployment is performed by the test runner.
