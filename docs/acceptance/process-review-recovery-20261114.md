# Process review recovery candidate

Base: actual GitHub main `b41b993d3d80580214de7cf1af122deb1c0745bf` (#113).
Independent cloud checkout and `fix/process-review-recovery-20261114` branch.
No company workstation, existing browser tab, deployed Site or business data was accessed.

## Findings and correction

The genuine-main controller has no error details, operation ID or original-receipt recovery entry on the version-confirmation page, although the editor already provides them. A lost POST response followed by a temporarily missing receipt leaves the actor permanently at UNKNOWN on this page. A genuine-main inverse reproduction retains this failure as a regression control. The API kernel permits authorized nonprimary ADMIN and other authorized actors to withdraw; there is no submitter-only or primary-admin-only rule in this path. Signed isolated tests confirm this; no permission change is part of the fix.

A review confirmation previously remained outside `busy` and lacked actor/page/generation/revision/case pins across its awaits. Review actions also used `currentBegin=()=>true`, allowing a late completion to adopt/render after navigation. These are corrected with a single confirmation flight, explicit final expectedRevision and delivery/page ownership fences. Cancel and stale confirmations send zero writes. Editor withdrawal uses the same guarded decision path. Normal processing is distinct from UNKNOWN.

The existing process transport aborts lifecycle POSTs at 45 seconds. A fake-clock test demonstrates that a still-valid response after that boundary would be aborted; the candidate allows at most 180 seconds for submit/withdraw/approve/return. This is tolerance, not a measured server performance improvement. Other authoring mutations and reads retain their budgets. The UI shows processing while the original request is awaited. Timeout/loss still retains the original command, and no code retries POST automatically.

Receipt recovery uses the retained operationId, GET with accessEvent=1 and matching server operationAction, and the existing validated receipt envelope. A 403/404/503 or mismatched action preserves the marker; a successful unrelated state read cannot clear UNKNOWN. The operation ID is escaped and visible after reload. The original receipt remains actor-scoped. Existing CAS, role policy, pending locks, immutable snapshot and self-review/content-issue acknowledgement requirements are unchanged. No schema/data-model change.

The latest confirmed module/platform split is retained: under trusted adopted page-v1 policy, a module reviewer can submit/correct but cannot finally approve; a confirmed platform approver can submit/correct/approve without edit rights. New signed tests exposed a separate UI defect: the Submit button reused the canvas edit lock, incorrectly disabling a valid submit-only grant. Submit now uses its own view/pending/draft-state gate plus explicit submit permission, with no new backend grants. Return and withdraw share correction authority; an already approved case cannot withdraw. Missing final-approval provenance fails closed. Legacy unadopted policy is tested separately and is not silently converted; no live policy marker or grant is installed.

The cause or result of Diem's real V31 withdrawal is **not established**. The supplied saved snapshot ID is not an operationId. No guessed identity, replay, pending cleanup or success/failure inference was made. The cloud source defects above are proven independently; they do not establish what happened to that real write.

## Scope and parallel work

Read #114 at `7751989cb827859ba6a0fba47928c6d9135f10ad` and #115 at `4ec19c40d04fb389d6c6329a7aa2c31341176802`. Neither ref was changed or merged. #114 overlaps shared-draft-client/index; #115 also overlaps shared-draft-client/index, historical source helpers and documentation. Reconcile these semantic differences before combining candidates; separate CI passes do not prove a combined tree. This branch independently changes only process lifecycle budgets, receipt identification and review UI/controller behavior.

The source-only exact inverse proves current changed bytes back to actual main and plugs into the retained password/catalog/equipment/Submit/quality proof chain. Unknown or effective-drift bytes are rejected; existing historical fingerprints and negative controls remain.

## Verification matrix

| Risk | Evidence |
| --- | --- |
| Authorized actors | Signed real handlers with generated nonprimary ADMIN and STAFF, original submitter and another account, same-role different accounts, both inline and records storage |
| Refusal | Fresh explicit submit/withdraw/approve denial for ADMIN/STAFF; another account cannot read an actor's receipt; zero state change |
| Confirmation | Cancel and duplicate click during dialog or request; final expectedRevision; self-review and advisory acknowledgement |
| Lost response | Server commits then reply lost; 404 stays UNKNOWN; wrong-action receipt stays UNKNOWN; exact original receipt recovers with one POST total |
| Navigation/reload | Changed page during confirmation sends no write; late response cannot repaint destination; fresh controller rediscovers the exact stored operation |
| Time | Fake-clock 179999ms pending / 180000ms abort; receipt-only recovery; original non-lifecycle deadlines retained |
| Existing process flow | Existing Submit refusal/saved lifecycle, signed process-draft lifecycle, shared recovery and historical source checks |
| UI | Real dialogs/review overlay/transport with signed isolated handlers at 1440px Chinese and 390px Vietnamese; GitHub native execution provides screenshots/report |

Local verification output is recorded outside the checkout. Native local Chromium was blocked by socket/ptrace restrictions at launch, before any browser scenario executed; the committed native test is run by GitHub CI. Exact candidate CI and final status are reported on the draft PR. Do not count an unrun or pending native test as PASS.

## Not verified

Diem's retained operation/result; deployed test/formal Site; real latency or production dataset scale; physical phone, cross-computer user acceptance or OS IME. No live data/account/password/ACL/migration/deletion/backup change, merge or deployment. Native UI harness is an isolated module entry; existing compiled-SPA CI provides separate coverage and neither replaces real Site acceptance.
