# Fixed-candidate independent review and compiled acceptance

Candidate: `8c773a49e6005f4ed763ebfcd36cc408cbd4fe71`.
Dependency/base: #77 `0af6d57e912e5615250959c9e76210fecd55d96b`.
No product files were changed in this follow-up. Subsequent local commits contain
only this evidence and the manual acceptance script, not a new product candidate.

## Independent read-only review

A separate agent (`ab_readonly_review`) reviewed the exact committed diff against
#77, excluding this follow-up's uncommitted acceptance script. It reported no
confirmed new code defect. It independently executed the actual handler suite:
`node --test tests/ipqc-ab-local-save.test.mjs`: 11 PASS / 0 FAIL.

Reviewed areas: old-response ownership pins; reload with no runtime sent snapshot;
receipt-only settlement and fresh authorized readback; per-cell membership merge;
request-private multi-group candidate plus final CAS; edit/Save versus nested
create/delete and independent Submit rights; module/group pending and generation/
base guards; deletion reference checks and retained receipts/history. The review
specifically does not claim cross-generation unknown recovery is automatic.

A follow-up read-only review examined an apparently stalled review transition.
It found no demonstrated synchronous recursion in moduleSave/finally/drawReview/
bindReview or reset. It noted the navigation blocked-result retry chain as a
possible diagnostic point, not a proven cause or a justification for a patch.
The stall was subsequently traced to test readiness: queued HTTP had ended while the
controller was still busy reading back. The normal departure guard waited for a
decision and an awaited approval navigation Promise therefore did not return.
The test now also requires the public `navigation.canLeave()` readiness signal,
then waits for actual DOM completion. No product guard or timeout was relaxed.
This is independent source review, not independent compiled-browser acceptance.

## Supported local compiled execution

The existing `createRootEntryFixture` / `createABCFixture` supports Linux:
Miniflare runs the actual `dist/server/index.js` and `dist/client` assets on an
allocated 127.0.0.1 port, with temporary synthetic D1/R2, offline outbound guards
and a synthetic signed session. No Windows/CI-only guard was modified and no
platform/environment identity was forged. Browser: installed `/usr/bin/chromium`.

Build command (PASS, exit 0):

```
PROCESS_PROGRAM_COMMIT=8c773a49e6005f4ed763ebfcd36cc408cbd4fe71 npm run build
```

Safe build result: `PASS_BUILD_EXIT0_AND_POSTBUILD_KNOWN_AUTH_CLIENT_CHECK`,
postbuild authentication check 1 PASS / 0 FAIL. Log `/tmp/ab-compiled-build.log`.
Compiled entry SHA-256:
`2d0fcd401c8a4a6f52d45e87866f66c513357ae0d247b8375db2feb7e7f44745`.
Actual loaded hashed script bundles were compared to their built bytes and to
contained candidate A/B/shared-client source. A raw per-file URL assertion was
replaced with this stronger compiled-bundle check; the build combines scripts.

Manual continuation/reproduction command:

```
PROCESS_PROGRAM_COMMIT=8c773a49e6005f4ed763ebfcd36cc408cbd4fe71 node --test --test-concurrency=1 tests/ipqc-ab-compiled-browser.acceptance.mjs
```

This manually invoked acceptance script is not added to the remote CI workflow. It retains assertions
for the later lifecycle/recovery steps and a 90-second case deadline. There are
no forced clicks, expanded application timeouts, disabled assertions, or mocked
workflow handlers. Photo upload and ordinary requests hit the compiled worker.
The executed lost-ACK step uses route.fetch against that worker before aborting
its response; receipt 404 is an explicit transport fault injection. Ordinary
workflow handlers and persisted data are not mocked.

## Observed results and exact limits

| Item | Status | Evidence / boundary |
| --- | --- | --- |
| Full root/authenticated SPA A/B entry, actual compiled API and assets | PASS | Native localhost Miniflare + Chromium; no source handler interception. Exact bundle verification also passed in the later partial runs. |
| A:GROUP-1, A:GROUP-2, B:GROUP-1, B:GROUP-2 local error/item forms | PASS | All four groups in the synthetic catalog; no workflow/photo write before Save. |
| Matrix edits in each group | PASS | One visible product cell per group; other cells/all stages are not exhaustively claimed. |
| One click Begin + photo PUT + atomic module Save | PASS | Real compiled requests: Begin POST, photo PUT, Save POST. Stored saved snapshot contains all four groups and the photo digest. |
| Reopen and inspect each group | PASS | Browser reload then group selection; persisted forms and checked matrix cell verified. |
| Photo retrieval/display | PASS | Actual isolated R2 GET; browser image has nonzero naturalWidth. |
| Source page Submit -> Withdraw -> Resubmit | PASS | Saved case snapshot, whole-group pending versions, withdrawn original case and distinct resubmitted case verified from decoded D1/R2. |
| Review page whole-module Withdraw | PASS, both viewports | Normal collapsed review sections were expanded through their summaries; compiled action committed and pendingId became null. |
| SPA review Withdraw -> return to source | PASS, both viewports | Real navigation after controller readiness; then resubmitted from the source page. The initial harness readiness error is resolved. |
| Subsequent review-page Approve after second withdrawal | PASS, both viewports | Explicit ADMIN self-review checkbox; every formal group snapshot equals the original saved group content, including photos/matrix. Separate-person compiled approval is not claimed. |
| Compiled lost Save ACK -> safe departure -> reload -> receipt 404 -> original recovery | PASS, desktop and narrow | Original suite covers desktop; targeted gap suite now covers 390px Vietnamese with one Save POST, same marker through reload/404, exact original receipt GET and unchanged savedId. |
| Silent local abandonment through actual router | PASS, desktop only | Unsent form content discarded with no mutation request or departure dialog; source reentry shows unchanged shared content. |
| Actual business catalog group inventory | NOT_VERIFIED | Source-only repository and synthetic-only authorization; the four fixture groups do not establish coverage of every real business group. |
| Restricted roles in compiled full shell | PASS for four specified profiles, denial UX limit | Targeted real compiled UI/API checks cover view-only, edit-only, submit-only, and edit+submit without view. No-view API is 403 and exposes no business content; normal shell readiness is not claimed for that forbidden destination. |
| Physical phone/native IME/Windows/live Site | NOT_RUN | Viewports simulate desktop/narrow sizes only; no live connection was used. |

Final command exited 0: **2 PASS / 0 FAIL / 0 CANCELLED / 0 SKIP**.
Desktop 1280/zh has 17 explicit PASS checkpoints, narrow 390/vi has 15.
Log `/tmp/ab-compiled-final.log`; runtime build entry hash matches the fixed
candidate above. Screenshots `/tmp/ipqc-ab-compiled-1280-zh.png` and
`/tmp/ipqc-ab-compiled-390-vi.png` remain local synthetic artifacts.
The actual `processUILanguage` preference and resulting html.lang are verified.

Earlier harness failures are not counted as passing checks. Corrections were:
wait for the permission-driven group render; use a visible matrix cell rather
than one obscured by the sticky label column; enter quality rather than default
master review; expand the real collapsed review section; validate compiled
hashed bundles instead of raw per-file URL assumptions; and wait for controller
readback readiness before requesting departure. The last issue produced a normal
busy departure dialog, not a demonstrated renderer infinite loop. Independent
review found no proven recursion and no speculative product patch was made.
All earlier incomplete/failed attempts are superseded by the completed final
run; no product assertion, business authority or guard was disabled.

This is coverage of all four **synthetic** fixture groups, one matrix cell per
group and one uploaded photo. It is not evidence for every live group, every
product cell, all stages or real users. Existing legacy group review has Approve/
Return buttons but no separate review Withdraw button in the inspected source;
that review withdrawal entry is NOT_APPLICABLE. Source-header withdrawal of
legacy pre-module data is NOT_RUN in this compiled fixture. Read-only history
has no withdrawal action (NOT_APPLICABLE). Two current whole-module withdrawal
entries are both exercised: source header and review module action. Restricted
roles now have the additional scoped compiled evidence below; it is not exhaustive
coverage of every custom-role/line/group combination.

## Existing evidence retained

Product source is unchanged from 8c773a4, so the prior 177 current-source browser
cases, 321 related core tests, 93 transport/Canvas checks, numbering/lifecycle/
history checks, lint and TypeScript remain applicable within their original
limits. They were not all repeated. New script scoped lint passed (`/tmp/ab-compiled-lint-final.log`). No database
schema, permissions, business records or existing saved/formal/history data was
changed outside the disposable fixture.

## Publication blocker

Action: earlier denied `create_tree` upload. Target:
`franktsai0421/process-os-sites`. Reason: automatic approval review denied twice;
original reason text unavailable. Status: DENIED previously / NOT_RETRIED here.
This review/build is not authorization to retry. No push, PR, #69/#77 operation,
merge, deployment, connector operation, live unknown or real-data cleanup occurred.

## Targeted compiled gap follow-up

Product remains exact `8c773a49e6005f4ed763ebfcd36cc408cbd4fe71`, same compiled
entry SHA-256 `2d0fcd401c8a4a6f52d45e87866f66c513357ae0d247b8375db2feb7e7f44745`.
No product, permission configuration outside the disposable fixture, build or
full regression suite was changed/repeated. Only the two requested gaps were run.

Script: `tests/ipqc-ab-compiled-gaps.acceptance.mjs`. It uses the same actual
compiled Miniflare application, fresh synthetic D1/R2 and real application
permission checks. Fixture setup creates its draft through compiled APIs before
counting the browser's Save. It does not intercept ordinary workflow handlers.

| Capability profile | Observed compiled UI/API behavior | Result |
| --- | --- | --- |
| view only | No edit/Save/Submit controls; direct valid local Save and Submit receive 403; stored row/revision unchanged | PASS |
| view + edit; independent save cell=false, create/delete/submit=false | Effective module Save=true; can edit and Save through the UI; no enabled create/delete/Submit control; direct nested create/delete Save and Submit receive 403 without stored-state changes | PASS |
| view + submit, no edit/save/withdraw/approve | No edit/Save control; direct local Save receives 403; UI submits the last saved snapshot under the submitter identity; direct Withdraw/Approve receive 403 without state changes | PASS |
| edit + submit without view | Compiled GET and Save receive 403; no item content or A/B editor displayed | PASS for authorization / confidentiality; entry UX limitation below |

No-view entry currently displays the generic Chinese loading-failure page and
retains the boot attribute. This is **not** a passing normal shell-startup or
friendly permission-denial-page acceptance. The first harness assumed every
role would finish normal startup and timed out; this assumption was removed
from the authorization case and the limitation is retained here. API denial,
nonexposure and stored-state assertions remain. The editor's delete control is
disabled rather than absent: the test checks no enabled forbidden control and
separately asserts the backend's 403, not just its appearance. No UI permission
was loosened to pass these checks.

Restricted-profile final run: **1 PASS / 0 FAIL**,
`/tmp/ab-compiled-roles-final.log` (four profiles in one case). Scoped script
lint PASS, `/tmp/ab-gaps-lint.log`.

Narrow unknown final run: **1 PASS / 0 FAIL**,
`/tmp/ab-compiled-gaps1.log` (the other, initial role-test failure in that log is
superseded by the targeted role run above; do not describe the initial combined
run as all green). Viewport 390x850, actual Vietnamese preference, real compiled
Save committed before an injected lost ACK. Exactly one browser workflow POST;
unknown persists through normal router departure, return, full reload and receipt
404. Original marker bytes match throughout. A later GET queries the captured
original operationId, settles against fresh readback, preserves the original
savedId/content and sends no second POST. No browser JavaScript errors.

Reproduction commands (only these targeted cases):

```
PROCESS_PROGRAM_COMMIT=8c773a49e6005f4ed763ebfcd36cc408cbd4fe71 node --test --test-name-pattern='restricted role' tests/ipqc-ab-compiled-gaps.acceptance.mjs
PROCESS_PROGRAM_COMMIT=8c773a49e6005f4ed763ebfcd36cc408cbd4fe71 node --test --test-name-pattern='compiled narrow' tests/ipqc-ab-compiled-gaps.acceptance.mjs
```

The narrow case's code was unchanged after its passing run; later edits concern
only role assertions and formatting. No need to repeat the whole suite. Real
custom-role combinations, every business group, physical devices, native IME,
Windows and live environments remain outside these results. The publication
blocker above is unchanged; no denied upload was retried.

## Clarification: edit includes effective Save

The previous Chinese phrase "修改但無保存權" was imprecise. This case does
**not** deny effective Save to an editor. It sets the independent persisted
`ipqc-ab.save` cell to false while `ipqc-ab.view` and `ipqc-ab.edit` are true.
The compiled module workflow derives effective Save=true from edit, and the
browser successfully saves. Submit remains false and its POST is rejected.

This is a supported raw override combination, not an impossible fixture:
`public/process/access-policy.mjs` effectiveCells processes each catalog operation
and its boolean override independently. The synthetic user explicitly supplies
those boolean cells; no account/default/role data outside the fixture is changed.
The module then applies its intentional action-specific rule:

- `lib/versioned-shared-workflow.ts` currentPermissions promotes A/B module
  `limited.save` with `limited.edit`; it does not promote Submit.
- `lib/ipqc-ab-module-workflow.ts` save-local-v1 authorizes its atomic Save using
  edit and independently checks nested create/delete capabilities.
- `public/process/ipqc-ab.js` renders/admit Save via edit, while Submit uses
  submit. The group transport's raw save metadata does not disable module Save.
- Existing view, pending, generation and integrity checks still apply; the rule
  does not grant editing to someone without view or bypass pending locks.

Added exact compiled assertions: raw `view=true`, `edit=true`, `save=false`,
`submit/create/delete=false`; real module permission GET returns
`view/edit/save=true` and `submit/create/delete=false`; UI Save commits the edited
text; direct Submit remains 403 with unchanged stored row/revision.
Targeted result **1 PASS / 0 FAIL**, `/tmp/ab-save-rights-clarification.log`.
Scoped lint PASS, `/tmp/ab-save-rights-lint.log`. No product fix was required,
no Submit authority was expanded, and the full regression suite was not repeated.
This supersedes the ambiguous wording, not the user rule or prior test outcome.
