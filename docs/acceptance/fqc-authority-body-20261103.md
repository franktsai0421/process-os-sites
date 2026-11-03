# FQC authority-body compatibility regression

Base: fetched GitHub main `f23fb5e9cce9e4c1cb89e556151e8d5ff229d830`, including merged PR #63/#64. Work branch: `fix/fqc-authority-body-recovery-20261103`. Remote branches and open FQC PRs were checked before work; no competing open FQC PR or earlier authority-body candidate was found. The checkout had no uncommitted changes.

## Cause and scope

The supplied live v37 observation at 2026-11-03 10:33:55 UTC reported POST 500 with `stage=required-state-read`, `reason=AUTHORITY_BODY_INVALID`. This task did not access the live Site or its data. An independent synthetic reproduction through the production serializer generated `processAccessControl.audit[].before.__immutableBody`; the unmodified base then returned the same stage/reason for both Apply and Save. This establishes the storage-reader incompatibility for that shape, not that every historical 500 has this cause.

`encodeRecordValues` normally externalizes object-valued `before`, `snapshot`, `content` and `working` fields. FQC's required-state reader had rejected all actual immutable authority references before the ordinary decoder could verify and hydrate them. It now uses that existing SHA-verified decoder on the same five pinned authority keys, with no deferred history. Raw aggregate JSON is validated even when a maintenance overlay later overrides it; hydrated values are also validated, and remaining nested immutable references are rejected. Missing objects, SHA mismatch, invalid JSON and transient failures do not fall back to a second snapshot or reader.

The original current identity/permission and revocation checks still precede all business hydration. The one-use write capability, original manifest, preserved authority/unrelated pointers, field guards, revision retries/CAS, receipts and anti-replay behavior are unchanged. No new writer, schema, storage format, migration, data package or frontend asset is introduced. Thus no frontend cache-version change is needed. Hydrating required audit bodies adds their necessary reads; this is not a latency improvement claim.

## Recovery and safe departure

The main branch already contains PR #63's recovery behavior. Browser regressions now run with a real serializer-produced authority audit body:

- Begin, edit/create error and item, Apply, explicit Save, reload.
- Lost ACK, second click, receipt-only lookup, retained later input, a new explicit guarded Apply after confirmed recovery, and no duplicate creation.
- Missing receipt and failed terminal readback keep the original uncertainty and input; no POST retry or unknown-marker deletion.
- Two actors' different fields merge; same-field changes require reconfirmation without overwriting the other actor.
- Unknown state prevents Save/Discard departure. After a verified original receipt, explicit Apply and Save, the actual departure adapter is clean, `canLeave()` is true, and Chromium navigates away without an unload warning.
- Matrix recovery, historical receipts after withdraw/return/approve, durable cleanup failure and new-runtime recovery retain existing protections.

**Existing unknown operations without a verifiable receipt remain blocked.** Fixing the first-Apply cause prevents this failure chain for new operations; it does not prove that an earlier unknown operation never committed. There is no automatic reset, resend, force leave or live recovery. The task therefore does not claim to have unlocked the already affected browser/session. A separate verified recovery decision is needed if its receipt remains unavailable.

## Verification

Cloud Linux, Node 24.19.0, native Chromium, actual TypeScript routes with ephemeral SQLite and in-memory R2 only. Synthetic network interception permits the fixture origin; no production credentials or business content were used.

| Check | Result and boundary |
| --- | --- |
| Before-fix reproduction | Apply and Save failed with the exact supplied stage/reason using normally serialized synthetic audit data |
| Focused authority regression | PASS 9: Apply/Save, unchanged pointer/no authority leakage, missing/SHA/JSON/transient faults, ordinary-reader equivalence, revocation during hydration, current permission denial despite historical granted rights |
| Required dependencies/capabilities | PASS 80, plus the then-six focused tests (86 total in that run); preserved maintenance precedence, denied permissions, unrelated-fault isolation, selected snapshots, CAS races, one-use capabilities and compatibility |
| Apply/receipt/matrix/navigation regression | PASS 207; first actual 500 before/after CAS, retained form, second-click guard, receipt lookup, ACK projection, generation recovery, multiuser matrix and departure coordinator |
| Actual browser forms/recovery | PASS 29; 390/1280 px, Traditional Chinese/Vietnamese, plus collaborator, historical and matrix cases described above |
| Full typed lint | PASS, exit 0 |
| Build | PASS, exit 0, existing postbuild auth-client check passes; build stamped with the verified base SHA, not represented as a deployed candidate |

325 distinct tests passed (9 focused + 80 dependency + 207 regression + 29 browser). The initial extra focused rerun is not counted twice. New focused tests are included in the existing Local safety CI job; the browser job already executes the augmented browser files.

Commands:

```sh
node --test tests/fqc-authority-bodies.test.mjs tests/fqc-required-dependencies.test.mjs
node --test tests/fqc-write-failure.test.mjs tests/fqc-generation-recovery.test.mjs tests/fqc-recovery-diagnostics.test.mjs tests/fqc-known-rejection.test.mjs tests/fqc-unknown-recovery.test.mjs tests/fqc-apply-reliability.test.mjs tests/fqc-apply-ack.test.mjs tests/fqc-matrix-apply-lifecycle.test.mjs tests/fqc-matrix-last-apply.test.mjs tests/fqc-matrix-rejection.test.mjs tests/fqc-matrix-conflict-discard.test.mjs tests/fqc-matrix-multiuser.test.mjs tests/navigation-departure.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test tests/fqc-apply-browser.test.mjs tests/fqc-unknown-recovery-browser.test.mjs
npm run lint -- --format unix
PROCESS_PROGRAM_COMMIT=f23fb5e9cce9e4c1cb89e556151e8d5ff229d830 CLOUDFLARE_CF_FETCH_ENABLED=false WRANGLER_SEND_METRICS=false WRANGLER_WRITE_LOGS=false npm run build
```

NOT_RUN: live Site acceptance/recovery, physical iPhone/IME, real data performance, remote Cloudflare deployment or migrations. Viewport simulation is not physical-device acceptance. This is a source-only PR candidate; GitHub CI/review and any future release have separate gates. No merge or deployment is authorized here.

Reusable test improvement: storage compatibility tests should build their authority data through the real serializer, not solely hand-written inline JSON; otherwise normal audit history is absent from all success fixtures and the reader/writer mismatch is invisible.
