# Integration with merged navigation diagnostics

Historical integration record: the diagnostic feature was subsequently removed at the user's request. See [removal acceptance](../remove-navigation-diagnostics-20261103/README.md). The FQC functionality and its acceptance evidence below remain applicable; statements about retaining diagnostics describe only this original integration.

Main was freshly fetched as `668601b8fd2ad2fc6ea5db564b25af853bfbc626` (tree `6891661838e805eeac08fb0a1ba84097162b4355`). Original matrix candidate `869a08249c63784dc46a45a151e2f9a243c82593` and its private evidence remain preserved. A normal merge produced private integration `04fd98b`; only CHANGELOG required manual conflict resolution, retaining both entries. Workflow merged both test steps and their failure exits.

This is preparation for the user's requested PR. Push/PR remains held for independent review; merge and Sites publication are coordinated by the parent task after required checks. No business data, schema, credentials, account permissions or deployment were changed.

## Delta and evidence reuse

| Change or dependency | Risk | Verification |
| --- | --- | --- |
| FQC whole-matrix projection/UI/client | Core bytes unchanged from original candidate | Reuse original isolated matrix, lifecycle, native layout and recovery evidence, bounded by its documented limits |
| #61 route/state/receipt timing wrappers | Shared read/write dependency behavior | Integrated whole-matrix/rejection/discard suites: 56 PASS |
| #61 default-off diagnostics and source inverses | Privacy/auth/byte-contract preservation | Integrated diagnostic unit/auth/client/source/page suites: 37 PASS |
| Workflow and CHANGELOG | Lost CI steps or history | Both steps retained, exact failure exits preserved; both changelog sections retained |
| Browser entry resource references | Old cached JS/CSS after update | Advance only fqc-master.css, shared-draft-client.js and fqc-master.js to 20261102-fqc-whole-matrix1; receipt/recovery and diagnostic page checks: 47 PASS |
| Type compatibility | Adapter context and new diagnostic imports | tsc --noEmit PASS after merge |
| Compiled output | Integrated build/runtime compatibility | Frozen candidate build and lint results are recorded in the external integration receipt; hosted Windows CI remains required |

The new matrix command still takes the conservative full-state reader, with no claim of improved live speed. User-visible behavior, unknown-result protection, whole-snapshot Save, permission/pending/generation checks and no-change Submit semantics remain as in the matrix report. #61 diagnostics are preserved without changing their authorization or default-off policy.

The original acceptance README/verification files describe the pinned matrix candidate, not a claim of integrated full CI. Unchanged broad suites are not rerun solely to increase counts. Full compiled Worker native lifecycle/multiuser acceptance, live employee acceptance and physical devices remain separate gates unless an external integration receipt records their actual execution.

## Public source boundary

The early unpublished local-stage history contained a private attachment identifier. It remains private as prior evidence. The public candidate is one clean source commit on the fetched main using the complete integrated diff, with the same reviewed source tree plus this integration note and cache-reference fix; old local-stage commits are excluded from public ancestry. This does not rewrite main or delete private evidence. The public diff includes only source, tests, workflow and text documentation: no DB, business export, credentials, screenshots, ZIP, dependencies or build output.
