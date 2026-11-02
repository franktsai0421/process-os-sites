# Draft lifecycle acceptance: explicit scenarios, not optional clicks

This tests-only candidate is based on public source `e4e485108fa69600a0832b1dfe27e00b6bd0903b`.
It does not change product permissions, shared-draft behavior, schema, live data,
deployment configuration or the employee site. The deleted acceptance Site is
not recreated. Publication and a new hosted CI run require their own approval.

## Executable first batch

- [Actual process route fixture](../../tests/process-draft-lifecycle-route-fixture.mjs)
  is linked from repository root as `tests/process-draft-lifecycle-route-fixture.mjs`.
  It invokes the production route/kernel with signed synthetic actors, in-memory
  SQLite and a Map R2 port, without opening a socket. The seed has a real approved
  baseline and no open draft, so Begin cannot silently be an already-open no-op.
- `tests/process-draft-lifecycle-route.test.mjs` runs five fresh logical cycles:
  Begin, guarded canvas Apply, Save, Submit, Withdraw, resubmit, Return, resubmit,
  Approve. It also checks permissions, pending locks, stale guards, replay and an
  acknowledged server commit whose response is discarded followed by receipt
  lookup without another POST. These are API/VM results, not browser timings.
- `tests/process-draft-lifecycle-browser.mjs` prepares 18 mandatory button phases
  per cycle against the actual compiled Worker and Chromium. The intended five
  cycles cover Begin, local form completion, current-canvas Sync, Save, opening
  and confirming Submit, opening and confirming Withdraw, resubmission, review
  detail, Return and Approve with a distinct reviewer. Every target must be
  unique, visible and enabled. Missing or skipped controls fail the scenario.
  **This native browser runner has not run locally.** It is an executable CI
  candidate, not evidence that its 90 intended samples have passed.
- `tests/draft-lifecycle-scenarios.mjs` is a source-backed plan catalog for the
  remaining modules, not a generic browser runner. Its 173 inventory entries are
  either mapped to explicit plans or marked NOTIMPLEMENTED with reasons. The
  187 plan records are not 187 test passes. All corresponding browser timings
  remain NOTRUN/UNMEASURED until a concrete seeded adapter runs them.

The catalog's 24 NOTIMPLEMENTED entries include 15 Canvas entries owned outside
that non-canvas catalog, two BOM import/recovery entries and seven dynamic
routine-document entries. The separate Canvas runner above prepares ten of its
15 action categories as 18 distinct phases; it does not cover the remaining
five (load/reload/return navigation, history/restore and receipt-fault UI).
External ownership is not a claim that no Canvas code exists, and prepared
code is not a browser pass. The other 149 mapped inventory entries also remain
unexecuted plans, not complete adapters.

The non-canvas catalog keeps group IPQC-AB editing distinct from module-wide
Save/Submit; lines use separate AB and C scopes; BOM local Finish is not a POST;
FQC membership input is not matrix Apply; routine documents have no generic
Begin or independent Sync button. Routine load can legitimately generate jobs
before its read, so it requires an explicit calendar/data seed, not a blanket
zero-POST assertion. Form/media/import/recovery variants are not covered by a
single scalar-edit plan.

## Measurement contract

`tests/draft-action-measurement.mjs` is test-only instrumentation. For same-document
buttons it marks the **actual DOM click**, waits for the scenario's correct,
usable UI and two animation frames, then closes the timing window. This includes
automation readiness polling/IPC and frame observation; it is not isolated CPU.
Reason typing is outside the window. Authoritative fixture inspection is also
outside it and is required before a successful sample is admitted.

Each registered action needs five distinct successful cycles before median/max
are populated. Incomplete, failed or unexecuted actions retain null times, not
zero. Median-over-1000ms and max-over-1000ms are separate flags, not p95 or a speed
guarantee. Function-only and API/VM results cannot fill browser timing rows.

Requests beginning within that window are counted by GET/POST/other method.
The collector drains their responses after the UI clock stops, with a bounded
deadline; new requests after the window are excluded. It records safe path,
status, request/response body byte counts and available browser network phases.
`Server-Timing` absent means null, not an invented database or CPU duration.
It does not store credentials, request/response bodies or private query strings.
Background API calls within the window remain visible in the counts; they are
not silently attributed to the command alone.

The click marker is document-local. A login or another full-document navigation
requires a separate correctly bridged timing contract; this helper must not be
used to pretend its marker survives navigation.

Browser cycles reset the owned synthetic shared-state row and create new browser
contexts. They reuse one nonpersistent Worker/R2 bucket; immutable objects from
prior cycles remain. This is not a claimed cold-cache benchmark or completely
fresh storage instance per browser cycle. The socket-free route cycles do use
separate in-memory instances. Neither layer measures employee-site HTTPS time.

Configured module endpoint URLs in the plan catalog are not claimed to be exact
wire URLs: shared transport appends `compact=1`, IQC can add its edit projection,
and receipt/history/conditional reads add their own parameters. Authority-only
verification GETs are explicitly outside the UI action window. Full-response
timings must never be presented as compact UI-request timings.

## Known source behavior retained, not concealed

The canonical process fixture contains entry → manual → exit, and endpoint
product lists are empty under the existing endpoint contract. The current
authoring validator nevertheless emits `CONNECTION_TARGET_MISSING` because its
product-filtered node set omits the existing exit. This is a known advisory
false-positive, not a nonexistent node or lost data. The API test asserts the
exact advisory, rejects Approve without acknowledgment, then supplies the fixed
issue list. The browser candidate requires exactly one corresponding real
confirmation. It does not auto-accept arbitrary dialogs or remove the guard.
A product fix is deliberately separate from this acceptance-only change.

## Supported commands and remaining gate

Run supported Node contracts with Node 24 and the locked development dependencies:

```sh
node --test --test-concurrency=1 tests/draft-action-measurement.test.mjs tests/draft-lifecycle-scenarios.test.mjs tests/process-draft-lifecycle-browser-contract.test.mjs tests/process-draft-lifecycle-route.test.mjs
```

The existing Windows CI browser step retains its original test and exit gate,
then runs those contracts and `node tests/process-draft-lifecycle-browser.mjs`
against the CI-built application. Do not set CI flags locally to bypass denied
browser/socket capabilities. No native local browser attempt was made for this
candidate. No additional workflow, broad build, live station or remote run is
created by these test sources.

The browser runner prints its synthetic report and writes
`.sites-runtime/process-draft-lifecycle-browser-result.json`. A public CI result
must be read for the exact new head before claiming browser execution. Existing
green CI and the new local route/contracts do not establish all-draft-button
completion, all 173 UI entries, live before/after performance or a <1 second SLA.
