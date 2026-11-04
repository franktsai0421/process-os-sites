# IPQC-C create-item latency and unknown-result candidate

2026-11-04, isolated Linux/Node 24.19.0 checkout. Base main:
`35949445ad073812863c0004acbee13ed3535747`.
Implementation commit: `779d8280d6705f909b631af0e62ba11adb6ba517`.
Branch: `fix/ipqc-c-create-latency`. No deployment, real business mutation,
unknown-lock release, original-operation retry, or FQC V31 modification.

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
| GitHub CI | Runs on PR creation; no deployment workflow is triggered | Pending |

Source inverse contracts retain the old Save/permission/history proof rather than
weakening it: 13 create-span negative cases and the prior 29 composed-span negative
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
