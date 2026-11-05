# PROCESS master local editing / atomic Save candidate

Source-only work on `feature/process-local-save-20261105`, based on fixed #80
`d05a85eab2a49e735a604078873578898edf1535`. PR base must remain
`feature/abc-local-save-20261105`. Dependency: #80 → #77
`0af6d57e912e5615250959c9e76210fecd55d96b`. Both remote heads were checked
before branching and again before handoff; neither prerequisite is merged here.
This is PROCESS templates and machine master data, not process authoring canvas,
AB/C products, quality inspection equipment, or routine FQC.

## Behavior and risk boundaries

- Production master-data opts PROCESS into the existing ordered local batch Save
  protocol. Completing a template/type/photo/machine change records an in-memory
  overlay; it does not POST workflow Apply. Name keystrokes and composition stay
  in the original actor/generation-bound name buffer. One explicit Save stages
  completed names and submits all captured local batches in one request/CAS,
  saving working, saved snapshot and the original receipt atomically.
- Intermediate server Apply calls exist only inside that Save request, retain
  every field/entity guard, and leave no partial state when a later batch fails.
  Independent fields/entities merge against fresh server state; same-field,
  deletion, parent and reference conflicts still reject. Poll overlays project
  over the latest working snapshot without changing their original guards.
- Save captures a batch prefix. Later local batches and name input remain unsaved
  after its ACK; repeated Save clicks share the same flight. Submission checks
  unstaged names/open machine forms and local batches both before and after its
  confirmation; it never saves or submits an older snapshot on their behalf.
- Edit implies Save for PROCESS; create/delete/submit/approve/restore remain
  separately checked. Existing presets, editor types, equipment provenance,
  `assertProcessLinkAvailable`, pending locks and linked AB/C approvals remain.
- Navigation/version changes abandon only unsent local input, without a custom
  departure prompt, server inverse, automatic Save, or replay. Sent/unknown
  operations retain their original receipt identifiers and generation. A 404 is
  not proof of no write. PROCESS keeps `externalDurableBounded`; identified Begin
  is additionally durable. Save settlement requires original receipt and a fresh
  authorized readback, never a new generation binding.
- Photo preparation uses the existing temporary bytes/upload mechanism. Only a
  successful workflow Save adds shared references; no object cleanup is added.
  Existing non-BOM import entrypoints remain disabled. No new consolidated
  pending-confirmation tab or export interface is introduced.

Common transport/permission opt-in is a separate commit. AB/C defaults and
validation are retained. Historical Begin hashes and offsets remain unchanged:
the test-only PROCESS source projection must first reproduce the exact reviewed
AB/C hash, then the original historical inverse. Both original AB/C and new
PROCESS negative source/permission/scope mutations are tested.

## Verification matrix and provenance

All writes use synthetic memory SQLite/Map-R2 or nonpersistent Miniflare D1/R2.
Chromium requests are restricted to their generated loopback origin; Workers deny
outbound calls. No hosted Site, real account, business data, migration, cleanup,
permission setup, connector reconnection, merge or deployment was used.

| Surface | Verification |
| --- | --- |
| Atomic persistence and review | `tests/process-local-save.test.mjs`: inline/records, single CAS/replay, late-batch rollback, distinct fields, stale guards, permissions, source/parent/reference locks, linked-case lock, Save→Submit→Return→Resubmit→Approve |
| Real bridge + client + handlers | `tests/process-local-bridge.test.mjs`: local zero POST, poll projection, one Save, later input, unknown Save/Begin reload + 404, generation fence, original guard retention, late Submit input |
| Compiled browser | `tests/process-local-save-browser.mjs`: name burst/composition, photo display, type, machine forms/search/create, two actors, real conflicts, silent SPA/native departure, Chinese desktop/Vietnamese 390px, complete review cycle, restricted reader, lost Save/Begin ACK |
| Existing compatibility | AB/C local tests/browser, auth phase/replay, clone/ownership, receipt and Begin suites, historical old-server inverse, field guards, master/stage linked lifecycle, route modes, legacy formats, references and cold-start/departure contracts |
| Final checks | Dedicated `.github/workflows/process-local-save.yml`: lint, typecheck, tests, source boundary, build, Chromium PROCESS + AB/C and native startup/departure checks. Exact final HEAD results and CI links are supplied in the task handoff; earlier upstream CI is not candidate evidence. |

Independent review remains a separate handoff gate; this author does not label
self-review independent. Native OS IME, physical phones, separate machines, live
latency/data acceptance and publication are NOT_RUN.

## Paired synthetic performance

`tests/process-local-save-benchmark.mjs` uses the same signed-handler fixture:
one stage, five existing presets, three explicit name completions then Save.
The fixed #80 source was extracted with `git archive` into ignored runtime output;
no baseline source or private data was changed. One warm-up plus five measured
runs, no artificial network delay:

| Source | POST / CAS | Median handler elapsed | SQL | R2 GET / PUT |
| --- | --- | --- | --- | --- |
| Fixed #80 | 4 / 4 | 61.8616 ms | 64 | 31 / 7 |
| PROCESS candidate (initial measurement) | 1 / 1 | 17.8495 ms | 16 | 7 / 2 |

This is request/storage work in an isolated fixture, not real Site performance.
The final run retains the raw JSON locally and verifies the same complete saved
snapshot. Reproduce baseline with `MASTER_AB_SOURCE_ROOT=<fixed-source-root>
PROCESS_SAVE_BENCH_MODE=baseline node tests/process-local-save-benchmark.mjs`;
run candidate with `node tests/process-local-save-benchmark.mjs`.

## Existing evidence that must not be hidden

`tests/process-equipment-snapshot.test.mjs` has two failures on both fixed #80
and this candidate: it still expects canvas `beforeSave()` to reject with
`CANVAS_UNSYNCHRONIZED`, although #77 changed the canvas Save contract. Its source
and assertions remain untouched; this is not a new PROCESS master-data failure.
The dedicated applicable candidate workflow does not substitute this legacy
canvas fixture for PROCESS coverage.

Full-tree `safety:scan` reports two unchanged public negative-test sentinels:
`tests/multiuser-local-recovery-helper.test.mjs` contains a private-key header
string; `tests/multiuser-iqc-local-recovery-composition.test.mjs` contains a fake
Bearer string. These are rejection inputs, not credentials. Changed-file scanning
and `sites:source-check` are separate gates and must have zero new findings.
No negative safety assertion was removed to make a scan pass.

Persistent schema/data model: unchanged. Existing saved/pending/effective/history,
receipts, media objects and references are not migrated, rewritten or deleted.
