# Tooling local-edit / atomic-save integration audit

Status: verified integration proposal, **not implemented or deployed**. Audited
checkout `85fa4a36442b3b72323eb4a6eeb105b867c4856a`, 2026-11-04. This is the
delegated tooling-only investigation; other tasks own FQC, IQC, IPQC C and canvas.
No business data, migration, shared source, runtime permission or history changed.
The checkout has no `.agents/skills` directory; `/workspace/.agents` is empty.
Repository `AGENTS.md` and relevant tooling/draft/model instructions were read.

## Confirmed current behavior and data boundaries

- `public/process/tooling.js` reads draft content from `workflow.working`.
  `applyRow`, `remove` and tool-dialog submit call shared `command('apply')`;
  successful form Apply therefore already changes the shared working draft.
  `saveOrSubmit('save')` separately calls `command('save')`. These are distinct
  server writes, not a local editor plus one atomic Save.
- `toolingMasterControl` schemaVersion 1 contains versions, reservedCodes,
  importSource, transferApprovals and workflow. Workflow separates working,
  immutable saved/saves, fixed cases, receipts and active content. The generic
  Begin path adopts an existing legacy open snapshot into working only if no
  workflow exists. Old working is not disposable browser input. No live dataset
  inventory was performed, so counts or cleanup eligibility are unknown.
- `lib/shared-draft.ts` Save snapshots existing working; it does not apply Save
  payload patches. Simply changing the UI to send patches on Save would lose the
  edits. Sending Apply followed by Save still exposes an intermediate shared
  draft and partial success and is not an acceptable implementation.
- `lib/tooling-workflow.ts` handles server code allocation only on Apply. It
  checks patch/guard shape, code/source immutability, approved IQC references,
  transfer source/corrections, catalog references and deletion history. Preserve
  these checks and reserved codes in any atomic Save path.
- Photos currently PUT when selected; the snapshot contains hashes, not image
  bytes. Losing an uncommitted reference must not trigger object deletion, since
  saved/history content may reference the same object. Tooling's related picker
  is approved IQC parts; it is not the separate routine inspection-tools page.

## Shared integration requirements (do not fork independently)

1. **Save permission.** `versioned-shared-workflow.ts/currentPermissions`
   intersects adapter permissions with defaults. An adapter-only `save || edit`
   change is insufficient. Agree one scoped opt-in with the integration owner;
   editing grants Save for tooling, existing Save-only grants remain compatible,
   and Submit/Approve/Delete/Create stay separately enforced. The same result
   must govern read metadata, POST and receipt recovery after revocation.
2. **Atomic Save adapter contract.** Reuse the selected shared receipt/transport
   design, with tooling-specific guarded patches and allocation in
   `lib/tooling-workflow.ts`. Apply changes and produce saved in request-local
   state, then persist once through the existing outer CAS. Preserve the original
   command fingerprint and one externally recoverable operation receipt. Do not
   persist an intermediate Apply or replay internally generated operation IDs.
   A failed guard, photo/reference check or CAS leaves all stored state unchanged.
3. **Batch allocation and ordering.** Existing allocation looks up categories and
   records in `flow.working`. A newly staged category followed by a newly staged
   tool in the same Save needs ordered candidate lookup. Multiple new tools need
   distinct reserved codes. Repeated local edits must collapse against the
   original server basis; insert/edit/delete must not leave invalid intermediate
   patches. Final-state validation alone must not permit deleting a historical
   transfer and then bypassing its tool deletion protection.
4. **Navigation and unknown results.** Current tooling departure recognizes only
   open forms as local input, and `unknownReady:()=>!beginRecovery` refuses an
   uncertain Begin. Shared `createDeparture` requires receipt-based unknown
   anchors, while tooling Begin has a separate actor-keyed session marker.
   Coordinate silent local abandonment and Begin-safe navigation with the shared
   owner. Keep original uncertain markers across departure/reentry; never clear
   them to unlock a retry. A GET finding an existing draft is not a Begin receipt.
5. **Polling/local state.** Keep a private base plus staged candidate keyed by
   actor, delivery, generation and active version; never mutate the shared DTO
   to impersonate a save. Polls can refresh shared status but cannot overwrite
   local input or silently change its guard basis. Reset local input on departure
   only. Advisory server checks describe the saved/server basis, not unpersisted
   staged content; label that distinction.
6. **Shared entry/cache publication.** Parent integrates navigation, shared
   client/workflow and entry asset versions, then publishes coordinated API/UI
   only after review. This task does not edit those common files.

Remote PR inspection found open [FQC #74](https://github.com/franktsai0421/process-os-sites/pull/74),
[IPQC C #75](https://github.com/franktsai0421/process-os-sites/pull/75) and
[IQC #76](https://github.com/franktsai0421/process-os-sites/pull/76).
The actual #76 file list includes shared client, workflow, navigation and entry;
its inspected workflow patch grants `save || edit` specifically for IQC. It does
not yet provide tooling opt-in. PR descriptions are coordination context, not
verification of their tests. No PR branch was merged or copied into this checkout.

## Baseline verification and performance evidence

All tests below use unchanged production source and isolated synthetic fixtures.

| Check | Result | Boundary |
| --- | --- | --- |
| `node scripts/test-tooling-ui-request.mjs` | PASS, 48 groups | Actual UI/shared client; synthetic DOM, HTTP and clock, not Chromium |
| `node scripts/test-tooling-workflow-request.mjs` | PASS, 126 recorded operations | Actual authenticated handlers; SQLite memory and R2 Map |
| `node scripts/test-tooling-checks-input.mjs` | PASS, 5 source shapes and 2 malformed-content cases | Readonly projection |

Handler coverage includes two existing/two new tools, exact photo storage/read,
IQC references, transfers/corrections, Save/Submit/Return/Resubmit/Approve, fixed
case/history reads, legacy missing-reason retention and guarded deletion. The
fixture users are admins; this is **not** proof of edit-only versus submit-only
permission behavior. UI tests cover stale delivery/read fencing, unknown Begin
and reentry, late checks, inputs and filters. No new multi-actor atomic Save,
silent departure or save permission implementation exists to accept yet.

One baseline run's successful-operation medians: Apply 15.319 ms (29), Save
16.692 ms (5), read 19.197 ms (49), Begin 16.148 ms (3). These are Node handler
fixture times, not Site latency, paired improvement or an SLA. Source-level
request evidence is stronger here: each ordinary tool form Apply performs a
workflow POST and fresh GET before later explicit Save; catalog Apply does too.
Reducing N edits plus Save from N+1 workflow writes to one is a design target,
not an achieved result. Advisory checks may add reads; photos are separate PUTs.

First handler run lacked TypeScript. Dependency installation initially failed
because npm's default cache was outside the writable workspace. Installation
with `npm ci --cache /tmp/tooling-npm-cache --ignore-scripts --no-audit --no-fund`
succeeded; the handler suite then passed. No lockfile or hook changes were made.
Run output is retained in `/tmp/tooling-ui-baseline.json`,
`/tmp/tooling-workflow-baseline.json`, `/tmp/tooling-checks-baseline.log`.

## Required acceptance after integration

- Two authenticated editors: disjoint fields survive, same-field conflict rejects
  the entire Save, duplicate/stale generation and CAS race cannot lose changes.
- Unknown/timeout/malformed ACK: original receipt-only resolution, no blind retry,
  unrelated navigation remains usable; actor/revocation changes reject adoption.
- Edit-only Save succeeds; view-only fails; Submit/Approve remain independent;
  Create/Delete and pending locks are enforced server-side on staged patches.
- New catalog + tool + transfer ordering, multiple code allocation, photo failure,
  approved/disabled/removed IQC references, used/history-linked deletion rejection.
- Local edit/apply yields zero workflow writes; one Save yields one persisted CAS;
  leave/reload drops only local input while saved/cases/active/history remain exact.
- Real browser Chinese/Vietnamese at desktop and 390px, image decoding, keyboard
  and focus; controlled test-Site acceptance is a separate parent-coordinated gate.

No test-Site write/read acceptance, physical-device test, deployment, schema/data
change, source publication or implementation PR was performed. Current blocker is
the shared integration contract, not a denied safety action. Deliver this report
to the integration owner before adapting tooling; do not advertise the requested
behavior as complete. A docs-only PR would not constitute the requested feature PR.
