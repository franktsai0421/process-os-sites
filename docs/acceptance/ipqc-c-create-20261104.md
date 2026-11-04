# IPQC-C create-item latency and unknown-result candidate

2026-11-04, isolated Linux/Node 24.19.0 checkout. Base main:
`35949445ad073812863c0004acbee13ed3535747`.
Implementation commit: `779d8280d6705f909b631af0e62ba11adb6ba517`.
Branch: `fix/ipqc-c-create-latency`. No deployment, real business mutation,
unknown-lock release, original-operation retry, or FQC V31 modification.

## Additional latency improvement (Draft PR #73)

[Draft PR #73](https://github.com/franktsai0421/process-os-sites/pull/73) was
created after explicit user authorization. This follow-up keeps the original
POST and mandatory terminal GET. Only runtime create-item terminal checks opt in
to `readback=ipqc-c-create-v1`, which reads the fixed six auth/C workflow keys.
The complete workflow/permission response and the existing owner/version/unknown
checks remain. History, receipt, restore or unexpected combined selectors use
the old full reader; historical unknown discovery does not assume create intent.
No POST authority is substituted for the fresh GET, and no authorization result
is cached. Unrelated records no longer delay this explicit terminal check.

The expanded benchmark enables session revocation, supplies all five authority
keys, and uses a newly uploaded synthetic PNG reference (one HEAD per POST).
It compares the current handler with creation selection disabled (full-reader
control, **not an exact historical executable**), first-PR behavior (selected
POST/full GET), and this follow-up (selected POST/GET). Each scenario runs five
measured rounds after warmup in alternating order, with 24 unrelated aggregates.
Upload precedes measurement; network, browser render and live storage are excluded.

| Synthetic profile / working items | Full-reader control median | First PR median | Follow-up median |
| --- | ---: | ---: | ---: |
| In-memory, 100 | 86.32 ms | 84.44 ms | 96.20 ms |
| In-memory, 1,000 | 258.58 ms | 302.00 ms | 296.84 ms |
| R2 10ms + SQL 1ms artificial delay, 100 | 1,121.23 ms | 860.34 ms | 455.01 ms |
| R2 10ms + SQL 1ms artificial delay, 1,000 | 1,288.81 ms | 1,064.92 ms | 660.75 ms |

These are POST response-consumption plus fresh GET times. The expanded fixture
has 46+45 R2 GETs for the full control, 21+45 for the first PR, and 21+8 for the
follow-up. All three retain 3 PUTs, 1 photo HEAD and 17+14 SQL operations; the SQL
session-revocation checks are unchanged. The differing GET counts from the first
small fixture below reflect complete authority keys and larger working content.
[All samples, minima/maxima, stage timings and source hashes](ipqc-c-create-20261104/latency.json)
are retained. Reproduce with:

```
node scripts/test-ipqc-c-create-mutation.cjs --benchmark=100
node scripts/test-ipqc-c-create-mutation.cjs --benchmark=1000
```

The no-delay scenario does **not** demonstrate a CPU speedup: the 1,000-item
follow-up is ~38 ms slower than the full control and ~5 ms faster than first PR.
Selection/encoding verification has CPU cost; the measured benefit is mainly
reduced remote I/O. The artificial-delay result is not a promise of live speed
or proof that the historical 14.765-second cancellation is resolved. Real Site
latency, browser/device acceptance and an exact-head CI result remain release
requirements. No deployment is authorized by this PR.

Follow-up verification: create suite 24 groups, actual primary C stack 42 tests
(including selector dispatch and readback-denial unknown retention), 13 deadline
cases, and the preserved 16+29 source-contract negative cases pass. The
independent reviewer found no blocking source/safety finding and confirmed the
benchmark's scope/limitations. Lint/build and committed-source checks are rerun
for this follow-up; their final status is reported with the delivered commit.

## Finding and scope

The delegated observation was a photo PUT completing in 1.214 seconds, followed
by a create-item POST canceled after 14.765 seconds and two receipt GET 404s.
Those observations were not reproduced against the live Site in this task.
The old shared client gives this route 15 seconds including response-body
consumption; the timing is consistent with that deadline but does not prove
which live storage step was slow or whether the original write committed.
A missing receipt never proves non-commit. The original unknown remains intact.

Source inspection confirms the independent `/api/ipqc-c/workflow` create-item
route used the full state reader. Its existing canonical Save capability does
not cover creation. The new server-only capability selects a fixed eight-key
closure: users, custom roles, role overrides, access control, maintenance,
IPQC-C, master data, and routine equipment. Required aggregates/live bodies and
the C allocation index retain SHA validation. The authenticated route still
validates equipment, photo existence, structure, permissions and command receipts.

The encoder patches only the C aggregate and monotonic allocation pointer into
the original manifest. Other module pointers, legacy sources, approved content,
saves and cases remain intact. The index includes historical numbers, so creation
cannot reuse a number simply because its item is absent from the current draft.
Generic partial-state persistence remains prohibited. The private mutation handle
is tied to its state, bucket, revision, manifest and verified references and is
single-use. Every CAS retry rereads/revalidates state; four attempts remain the limit.
Canonical create also rechecks session revocation after immutable writes and before
the final CAS. Account and permission edits still invalidate the shared revision.

Intentional fault-boundary change: canonical records creation no longer fetches
unrelated aggregates or bodies. Their pointers are preserved without asserting
that their content is healthy. Required corruption fails closed. Missing indexes,
legacy/chunk/R2 layouts, noncanonical commands, non-V3 and pending states use the
original full reader. Save and other mutation capabilities are unchanged.

Only exact IPQC-C workflow `apply` + `create-item` requests get a 45-second
bounded client deadline. Create-error, Save and neighbouring paths retain their
prior budgets. Timeout still retains unknown and permits receipt queries only;
repeated 404s do not clear the barrier or issue another POST. The longer deadline
is a reliability adjustment, not a speed claim. Existing owned terminal readback
and actor/delivery protection remain in place.

## Verification and risk matrix

| Change/risk | Evidence | Result |
| --- | --- | --- |
| Fixed create reader/encoder, full-reader parity | `node scripts/test-ipqc-c-create-mutation.cjs` | PASS, 20 groups |
| Photo PUT/reference, equipment snapshot, CPK and rule persistence | Same actual handlers with normal synthetic login and approved fixtures | PASS |
| Same-ID concurrent replay, changed-payload refusal, two writers, stale revision, four-CAS exhaustion | Same suite | PASS |
| Required aggregate/live-body integrity, missing image/equipment, pending lock, PUT failure | Same suite | PASS, no D1 commit on rejection |
| Session revoked during PUT, create permission revoked during read | Same suite | PASS, final CAS refused/fresh attempt denied |
| History-only number, approved version/cases/saves, other module pointers | Same suite | PASS |
| Generic partial writer, foreign/reused handle | Same suite | PASS |
| 24-second response, headers/body 45-second limit, repeated 404/no resend, other deadlines | `node tests/hosted-read-deadline.test.mjs` | PASS, 13 cases |
| Actual C local-recovery composition | `node --test tests/multiuser-ipqc-c-local-recovery-actual-stack.test.mjs` | PASS, 40 tests |
| Actual C UI/client operation admission | `node --test tests/ipqc-c-operation-admission.test.cjs` | PASS, 15 tests, independent run |
| Operation permission matrix | `node scripts/test-ipqc-c-operation-permissions.cjs` | PASS, 7 groups/218 handler calls, independent run |
| Existing Save server/client projection, Save boundary, read recovery | Corresponding `scripts/test-ipqc-c-*.cjs` | PASS |
| Historical read/permission proofs | `test-ipqc-c-bounded-read.cjs`, `test-ipqc-c-permissions-read.cjs` | PASS, 9 + 8 groups on implementation commit |
| Type-aware lint and build | `npm run lint -- --format unix`; `PROCESS_PROGRAM_COMMIT=<base> npm run build` | PASS; build stamp identifies base, not uncommitted source |
| Source/publication boundary scan | `node scripts/sites-source-check.mjs`; changed-file `scanFiles` | PASS |
| Repository-wide safety scan | `node scripts/safety-scan.mjs` | FAIL: two unchanged synthetic-test findings already byte-identical to base; changed files have zero findings |
| Native browser, physical device, real Site latency, hosted D1/R2 | Not executed | NOT_RUN |
| GitHub CI | Runs on PR creation; no deployment workflow is triggered | First-head run started; follow-up exact-head result pending |

Source inverse contracts retain the old Save/permission/history proof rather than
weakening it: 16 create-span negative cases after the follow-up and the prior 29 composed-span negative
cases passed independent review. CRLF route bytes are retained; whitespace check
uses `git -c core.whitespace=cr-at-eol diff --check`.

Independent reviewer reran the create suite, deadline tests (11 cases at review;
two additional body-timeout/path-neighbour cases passed afterward), admission and
permission tests and inspected the final mutation/authority paths. No blocking
finding remained. Synthetic logs stay in `/tmp/ipqcc-*.log` in this execution
environment; no live credentials or business fixtures are included in the PR.

## Performance evidence and limits

Three same-handler comparisons disable only the create optimization for the
full-reader control. A synthetic fixture includes 24 unrelated aggregates and
an artificial 2ms delay per R2 GET. Both paths produce identical working content
and receipts: full reader 41 GETs, selected reader 16 GETs; both 3 PUTs. An
independent reviewer reproduced those counts. Timing varies with CPU contention;
no percentage or real-Site latency target is asserted from this experiment.
The test records counts and duration without payload/identity diagnostics.

This removes demonstrably unnecessary storage reads; it does not prove the cause
of the historical cancellation, settle that operation, or establish acceptable
real response time. Existing final readback and live network/storage costs still
need authorized test-Site measurement after a separately reviewed deployment.
No new diagnostic page, sensitive runtime log, schema, migration, data package,
account or storage binding is introduced. Frank reviews and merges independently.
