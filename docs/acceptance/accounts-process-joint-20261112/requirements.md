# Joint requirements audit and remaining acceptance

Scope: the same #108 branch, fixed account source fb62c259 and process source 15a5acb4 on main 9fbba823. The first published joint head is 481297ed; follow-up changes are independently derived from that verified tree. Source PRs remain unchanged. This table distinguishes installed behavior, synthetic evidence and actual adoption; it is not a merge/deployment approval.

**Latest owner boundary:** retain all old backups, data, branches and original operation receipts. Stop new backup creation/retries and backup/restore rehearsals. Nothing was deleted. The earlier completed synthetic retention findings remain historical evidence; the dedicated snapshot rehearsal stays in the repository and is omitted from the two future joint test commands. Read-only/automatic-backup-disabled safety guards remain. No backup requirement is used to delay the code changes.

## Account and permission requirements

| Requirement | Actual implementation and retained evidence | Missing / unaccepted |
| --- | --- | --- |
| Existing login, multilingual/Unicode passwords and failure notices | #103 password/API/session sources unchanged; account-priority, dialog-feedback and compiled user-permissions tests | Real accounts/password compatibility not exercised |
| Own password always needs old password; authorized manager reset differs | Backend primary/peer/self/DEMO restrictions retained; compiled role API 16 cases passed at 481297ed | No real password/reset operation |
| Role template / individual override / source / reset | Single policy projection, no derived Save grants written back; existing reset/alignment/review-preview tests | Physical IME/focus and real role migration |
| Edit includes necessary Save in 13 installed modules | Existing withEditSave projection retained, including Lines pre-adoption effective cells; actual patch still needs fresh Edit | Does not itself adopt new page layout or grant View/Submit/final approval |
| Protected primary, same-level ADMIN, self, disabled/deleted, grant ceiling | Fresh server projection/CAS retained; compiled denial/revocation success at 481297ed | Real ACL not changed |
| Account / role entire-group conflict choices | **New:** profile and complete permission-source groups; show my/latest saved values; mine/theirs/cancel; preserve nonconflicting groups. Choices never POST; another Save rereads and checks authority/revision | New compiled joint-head account UI test pending. User test uses two distinct actors; role test uses two primary sessions because ordinary ADMIN cannot manage roles |
| Cancel / second conflict / revoked rights / stale choices | New actual editUser/editRole/submit tests cover these cases; protected/missing target, changed actor and new input refuse stale selection | Same-person browser sessions are not two actual people |
| Confirmed Save versus UNKNOWN | Original POST/readback/owner epochs and writeUncertain remain; no choice offered for an already sent unverified/committed operation; read-only verification cannot resend | Real lost connection not simulated on a live site |
| Module Submit/Withdraw/Return versus final approval | Existing managed page-v1 policy uses explicit primary audit proof and fail-closed invalid/revoked source; final approved case cannot be withdrawn | **Adoption dependency:** marker-absent legacy compatibility is still legacy behavior. Real reviewer-source conversion, exact grant inventory and policy activation are NOT_RUN, not silently declared complete |
| Feedback view / operations / originals / archive | Active valid accounts can view; source/image/archive/export authorities retained; Feedback workflow passed at 481297ed | No real employee report/export or live activation |
| Navigation abandons unsent forms; no form recovery/polling | Existing silent navigation and generation fences retained; new conflict choices remain RAM-only. No new timer/storage or automatic write | Real phone/IME and prolonged use remain unaccepted |

## Full process-platform list

The numbered rows correspond to the original complete 20-item list, not only the latest two omissions.

| # | Requirement | Joint coverage and exact limits |
| --- | --- | --- |
| 1 | Horizontal stages/search/zoom/fullscreen | Reuse existing main implementation; original compiled lifecycle passes at 481297ed. Physical gestures/fullscreen not accepted |
| 2 | Add/drag/pan/connect/highlight | Preserve existing graph paths; atomic client/stack and grouped deletion/connection regressions. No claim for every touch gesture |
| 3 | Applicable type tabs; retain hidden old records | Preserve #99 and type scope; no data deletion or migration. Whole-page manual visual acceptance remains |
| 4 | Bilingual cards/text/own-block photos | Existing source-adoption and photo guards retained; desktop/mobile synthetic Canvas passed 481297ed. Real images/IME not tested |
| 5 | Connection/deletion impact/layout | Keep producer/guard dependency groups and inverse/negative tests; layout display reused, no measured new performance claim |
| 6 | Editor modal/Apply/Save/input across tabs | Existing RAM-only input, single Save and late input guards; current compiled lifecycle passes. No restored local form archive |
| 7 | BOM uniqueness/across stages | Existing server and final Save validation retained; core synthetic tests. No real multi-person BOM run |
| 8 | IPQC occupation/approved machine source | Preserve approved-source/reference checks; new master drafts never become an approved source. Later #106/#107 photo/history changes excluded |
| 9 | Content first; failure is not an empty flow | Keep bootstrap/flow guards and source exactness. Cold Site acceptance and actual large data latency remain |
| 10 | Empty scaffold is not dirty | Existing actual controller regressions retained; intentional add/remove still dirty. No invented timing result |
| 11 | Silent page/line/stage departure | Original 5-cycle process runner with 15 navigation checks passes at 481297ed; extra 1365/390px × zh/vi Canvas Save/departure also passes. UNKNOWN stays original-receipt-only |
| 12 | Save current canvas, preserve other saved canvases; submit all saved process | Existing atomic saved snapshot/journal contracts and 5-cycle lifecycle preserved. No filter-scoped submission |
| 13 | Fresh comparison; grouped mine/theirs/cancel; preserve nonconflicts | Existing Canvas groups retain node/edge/delete dependencies and repeated-peer/CAS tests; new account groups separately implemented |
| 14 | No fixed polling / unsent recovery / undo-redo | Existing #100/no-poll proof remains; only explicit reads and original sent-operation recovery. New history loads on focus/selection, no polling |
| 15 | Category defaultStages | Preserve approved category priority, explicit empty config, legacy fallback, five-stage C/GIA CONG and product exception tests. Real category acceptance not performed |
| 16 | Approved stage types / machine links | Existing source validation and synthetic Lines→approval→category→Canvas Save chain retained. No real factory data used |
| 17 | Truly independent pages / independent draft and permissions | AB.catalog, C.catalog, LINES and Routine whole-page installed; same-page line/group/stage remain filters. **Real page-v1 adoption not performed**; legacy data not silently split |
| 18 | Separate module review and final approval | Managed policy code and source proof retained; actual approved versions immutable. Real marker-absent legacy conversion remains a documented adoption dependency |
| 19 | Approved history on original page / back to current draft | Canvas/AB/C/LINES/Routine existing views retained. **New PROCESS view:** existing strict approved-only source, same-page read-only snapshot, all bridge writes/stale callbacks fenced, then fresh authoritative draft+permissions. 16 current route/client/DOM tests pass (including denied-access journal preservation and review-platform entry); new compiled mobile/desktop test pending. BOM/IPQC and later quality history work remains coordinated with #105–107 |
| 20 | Visible step counts and measured performance | Preserve #101 projected counts and original 90-sample process/160-sample FQC/60-sample matrix runners. They are synthetic timing samples, not real Site latency or a guaranteed threshold |

## Independent-page inventory

Registry `lib/draft-page-boundaries.ts` has 13 functional owners: PROCESS_EDITOR (whole process), AB.catalog, C.catalog, LINES (AB/C inside is a filter), PROCESS templates, FQC, IQC, IPQC A/B whole module, IPQC C, BOM, equipment, tooling, Routine FQC whole page. Private Feedback drafts are a separate origin/actor store, not a shared workflow. A registry entry alone does not activate a migration or prove every page passed a full lifecycle.

AB/C/LINES and Routine have managed implementations. Actual activation needs real-state pending/UNKNOWN/baseline/audit classification and a separately authorized compatible switch; no real values were read. In the old layout, legacy endpoints remain deliberately guarded. The paused backup/recovery work is not resumed here and no true cutover is attempted.

## External coordination and remaining blockers

- #105–107 remain separate active repair branches. Their complete payloads are not imported. Shared paths are recorded in adjacent-dependencies.json; future integration must recheck then-current source and preserve this PROCESS history opt-in/lease, account comparison, their quality photo/receipt guards and every source proof.
- Original UNKNOWN32 remains an unresolved historical object operation. No retry, split or alternate delivery occurred. The current PROCESS UI solution uses only confirmed 481297ed source plus independent new code; it does not establish the old operation's outcome.
- No live policy/layout switch, real account/data change, deployment, source PR closure or branch deletion. Frank decides eventual merge.
- Real two-person/two-computer, staging HTTPS, physical iPhone, actual Chinese/Vietnamese IME, production-sized data and true performance remain NOT_RUN. Synthetic context/session/viewport results do not replace these.
