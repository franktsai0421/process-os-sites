# FQC authority-body compatibility regression

Base: fetched GitHub main `f23fb5e9cce9e4c1cb89e556151e8d5ff229d830`, including merged PR #63/#64. Work branch: `fix/fqc-authority-body-recovery-20261103`. Remote branches and open FQC PRs were checked before work; no competing open FQC PR or earlier authority-body candidate was found. The checkout had no uncommitted changes.

## Cause and scope

The supplied live v37 observation at 2026-11-03 10:33:55 UTC reported POST 500 with `stage=required-state-read`, `reason=AUTHORITY_BODY_INVALID`. This task did not access the live Site or its data. An independent synthetic reproduction through the production serializer generated `processAccessControl.audit[].before.__immutableBody`; the unmodified base then returned the same stage/reason for both Apply and Save. This establishes the storage-reader incompatibility for that shape, not that every historical 500 has this cause.

`encodeRecordValues` normally externalizes object-valued `before`, `snapshot`, `content` and `working` fields. FQC's required-state reader had rejected all actual immutable authority references before the ordinary decoder could verify and hydrate them. It now uses that existing SHA-verified decoder on the same five pinned authority keys, with no deferred history. Raw aggregate JSON is validated even when a maintenance overlay later overrides it; hydrated values are also validated before any maintenance overlay and again after it, and remaining nested immutable references are rejected. Missing objects, SHA mismatch, invalid JSON and transient failures do not fall back to a second snapshot or reader.

The original current identity/permission and revocation checks still precede all business hydration. The one-use write capability, original manifest, preserved authority/unrelated pointers, field guards, revision retries/CAS, receipts and anti-replay behavior are unchanged. The authority fix introduces no writer/schema/migration/data-package change. The separately authorized safe-temporary-departure follow-up below adds a private browser session archive and advances the affected frontend cache versions; it does not change server storage. Hydrating required audit bodies adds their necessary reads; this is not a latency improvement claim.

## Recovery and safe departure

The main branch already contains PR #63's recovery behavior. Browser regressions now run with a real serializer-produced authority audit body:

- Begin, edit/create error and item, Apply, explicit Save, reload.
- Lost ACK, second click, receipt-only lookup, retained later input, a new explicit guarded Apply after confirmed recovery, and no duplicate creation.
- Missing receipt and failed terminal readback keep the original uncertainty and input; no POST retry or unknown-marker deletion.
- Two actors' different fields merge; same-field changes require reconfirmation without overwriting the other actor.
- Unknown state prevents Save/Discard departure. After a verified original receipt, explicit Apply and Save, the actual departure adapter is clean, `canLeave()` is true, and Chromium navigates away without an unload warning.
- Matrix recovery, historical receipts after withdraw/return/approve, durable cleanup failure and new-runtime recovery retain existing protections.

**Existing unknown operations without a verifiable receipt retain their write lock.** Fixing the first-Apply cause prevents this failure chain for new operations; it does not prove that an earlier unknown operation never committed. There is no automatic reset, resend, force leave or live recovery. The explicit verified input checkpoint described below permits temporary SPA departure in the new client while retaining that write lock. The task therefore does not claim to have unlocked the already affected browser/session. A separate verified recovery decision is needed if its receipt remains unavailable.

## Verification

Cloud Linux, Node 24.19.0, native Chromium, actual TypeScript routes with ephemeral SQLite and in-memory R2 only. Synthetic network interception permits the fixture origin; no production credentials or business content were used.

| Check | Result and boundary |
| --- | --- |
| Before-fix reproduction | Apply and Save failed with the exact supplied stage/reason using normally serialized synthetic audit data |
| Focused authority regression | PASS 10: Apply/Save, unchanged pointer/no authority leakage, missing/SHA/JSON/transient faults, ordinary-reader equivalence, revocation during hydration, current permission denial despite historical granted rights, and unresolved bodies hidden by a maintenance overlay |
| Required dependencies/capabilities | PASS 80 plus 10 focused tests (90 total in the follow-up run); preserved maintenance precedence, denied permissions, unrelated-fault isolation, selected snapshots, CAS races, one-use capabilities and compatibility |
| Apply/receipt/matrix/navigation regression | PASS 207; first actual 500 before/after CAS, retained form, second-click guard, receipt lookup, ACK projection, generation recovery, multiuser matrix and departure coordinator |
| Actual browser forms/recovery | PASS 29; 390/1280 px, Traditional Chinese/Vietnamese, plus collaborator, historical and matrix cases described above |
| Clean source clone | PASS for the initial candidate: standalone clone of implementation commit `c9fcc4a799e1db518dfb41fae34d5db17696cdfa`, locked dependency install, 9 focused tests, source-boundary check and clean worktree; no original node_modules or business package reused |
| Full typed lint | PASS, exit 0 |
| Build | PASS, exit 0, existing postbuild auth-client check passes; build stamped with the verified base SHA, not represented as a deployed candidate |

326 distinct tests passed after the overlay follow-up (10 focused + 80 dependency + 207 regression + 29 browser). The initial extra focused rerun is not counted twice. New focused tests are included in the existing Local safety CI job; the browser job already executes the augmented browser files.

Commands:

```sh
node --test tests/fqc-authority-bodies.test.mjs tests/fqc-required-dependencies.test.mjs
node --test tests/fqc-write-failure.test.mjs tests/fqc-generation-recovery.test.mjs tests/fqc-recovery-diagnostics.test.mjs tests/fqc-known-rejection.test.mjs tests/fqc-unknown-recovery.test.mjs tests/fqc-apply-reliability.test.mjs tests/fqc-apply-ack.test.mjs tests/fqc-matrix-apply-lifecycle.test.mjs tests/fqc-matrix-last-apply.test.mjs tests/fqc-matrix-rejection.test.mjs tests/fqc-matrix-conflict-discard.test.mjs tests/fqc-matrix-multiuser.test.mjs tests/navigation-departure.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test tests/fqc-apply-browser.test.mjs tests/fqc-unknown-recovery-browser.test.mjs
npm run lint -- --format unix
PROCESS_PROGRAM_COMMIT=9736f8991b049c4358e9d6bfe3b5cc242bb0cc47 CLOUDFLARE_CF_FETCH_ENABLED=false WRANGLER_SEND_METRICS=false WRANGLER_WRITE_LOGS=false npm run build
```

NOT_RUN: live Site acceptance/recovery, physical iPhone/IME, real data performance, remote Cloudflare deployment or migrations. Viewport simulation is not physical-device acceptance. This is a source-only PR candidate; GitHub CI/review and any future release have separate gates. No merge or deployment is authorized here.

Reusable test improvement: storage compatibility tests should build their authority data through the real serializer, not solely hand-written inline JSON; otherwise normal audit history is absent from all success fixtures and the reader/writer mismatch is invisible.


## Investigation before the safe-departure follow-up

The task remains **BLOCKED for the already affected session**, even if CI passes. GitHub had no submitted independent reviews at the follow-up status query. The author performed the analysis below; that is not independent reviewer approval.

Two additional isolated probes used the actual routes and synthetic data:

1. In Chromium at 390px, a never-committed unknown error-form attempt followed by later input retained neither input in persistent storage. Accepting the synthetic unload warning and reloading preserved the exact unknown marker and sent no POST, but reopening showed the server's old value. This is a reproduced blocker, not acceptance of a safe-departure feature. Do not advise the user to force reload/close.
2. Holding one Apply immediately before its database CAS produced a genuine receipt 404; releasing that same single POST committed it, after which the receipt GET returned 200. No second POST occurred. Therefore 404, elapsed time or a matching current field value cannot certify noncommit.

The source explains both: ordinary form baselines/attempts live in `formOwners` and the DOM; the bounded session marker stores operation identity/context, not input/patches/guards or requestId. Matrix recovery's persisted unknown record stores a receipt reference instead of a local payload. The departure coordinator deliberately refuses unknown Save/Discard. A new page cannot reconstruct missing ordinary-form input from those markers.

A feasible safe-departure design would explicitly checkpoint the complete form, original baseline/guards, attempted operation identity, later input, stable IDs and all required media, verify exact readback and ownership/lineage locks, and then park the UI while retaining its independent unknown write barrier. Storage/quota/file/identity/lease failures must keep the source page open. Reopening would present a quarantined copy for comparison and original-receipt lookup, never automatically apply it. This new departure contract was subsequently authorized and implemented as described below; it never relabels unknown as clean.

Evidence-based settlement still requires the matching original receipt and fresh authorized readback. The supplied stage/reason needs binding to the exact original requestId/operationId/actor/scope/generation and deployed source. The current persisted marker does not preserve all that information. If the receipt remains unavailable, a future atomic server-side noncommit disposition would need a durable operation-specific rejection/fence checked by every writer/retry. It must race safely with late commits: either return the real winning receipt or install a fence that makes a stale CAS/retry refuse, preserving all working/saved/active and peer data. Mixed deployments, legacy paths, authority and command-digest binding require independent design review and isolated races before live use. Such a protocol is not implemented or authorized for live execution here.

The author's follow-up also found an authority-validation gap: an inline maintenance overlay could hide an unresolved nested body after hydration. The synthetic probe returned 200 on `9736f899`; the follow-up private decoder validation now rejects before the overlay and business reads. A new regression covers it, and affected local suites/lint/build were rerun. This finding reinforces why the earlier green tests and author review are not independent approval or complete unknown-recovery acceptance.

## Authorized safe temporary departure (source candidate)

The explicit navigation choice **保全輸入並暫離（結果仍未確認）** / **Bảo toàn đầu vào và tạm rời (chưa xác nhận kết quả)** is available only for a current, authorized FQC Apply unknown with exactly one intact receipt marker and capturable local buffers. Save and Discard remain unavailable for unknown. The original unknown flag, mutation admission, receipts and native reload/close warning are unchanged.

Before departure, an immutable UUID-keyed sessionStorage record captures raw form controls (including inactive rule fields), text, checkboxes/indeterminate state, selected options, original baselines/attempt snapshots, stable IDs, local version state, tool/equipment selection, photo data/order/notes, matrix selections/base/complete scope/pending identity and view context. Inputs are frozen while exact storage readback, actor/epoch, form ownership and full input equality are checked. An independent navigation-only coverage capability is tied to the original client/marker and the exact archive bytes. Queued work, another module's unknown/failure, foreign dialogs, stale actor/generation, IME composition, pending files, invalid number input, unsupported object/external image URLs, storage/readback/size/count faults and changed inputs all keep the original page. Target-load failure releases the edit lock and preserves both live input and any already written archive.

The coordinator recognizes a distinct `parked` state plus matching checkpoint lease; it does not treat the draft as clean. Only the final checked handoff closes the captured dialogs/matrix buffers. The original receipt marker and matrix unknown recovery records are not deleted. A destination notice points back to FQC; the actual archive is shown only after fresh authorized FQC/catalog reads. Returning/reloading discovers the original unknown normally. Archives are restored as **read-only comparison views**, including the complete captured data; they are never rebound to a new editable form, re-based over peer changes, replayed or used as receipt/permission evidence. Once the original operation is proven, the user must compare the latest draft and explicitly enter/apply any remaining desired changes. A 404 still proves nothing about late commit.

Privacy and limits: the explicit choice explains that text/photos and captured FQC baselines are stored in this browser tab's sessionStorage, not uploaded or put in long-lived localStorage by this feature. This is plaintext same-origin session storage, not encrypted or suitable for shared devices. Origin/path/actor keys isolate UI discovery; fresh authorization gates rendering. Session restore/duplicated tabs follow browser behavior, so closing a tab or clearing browser data can lose the archive; no cross-device or permanent-backup promise is made. Copied storage cannot grant navigation coverage, mutation rights or resolution; only the live client can issue coverage, and rendering accepts a fixed inert element/attribute vocabulary, never executable HTML. Records are append-only (maximum 16 per actor/path and 2,000,000 JSON characters per record, plus actual browser quota); no expiry or cleanup silently deletes unresolved inputs. Unsupported/over-limit cases remain blocked.

**Live-session blocker:** an already open v37 page does not contain this checkpoint code. It cannot acquire the new implementation by reloading while also guaranteeing preservation of its old RAM-only input. This task neither reads/changes live business data nor prescribes force reload, marker deletion or resend. PR review/merge/deployment and a separately verified plan for the currently open old-client form remain necessary. Independent review is still pending; author analysis and test results are not independent approval.

Verification entry: `tests/fqc-input-checkpoint-browser.test.mjs`, using the actual navigation coordinator/FQC UI/shared transport and actual TS routes over isolated SQLite/R2. It covers 390/1280 px zh/vi, same-tab navigation/return, real reload with text/photos/equipment, storage/context/foreign-work failure, matrix plus form capture, an original delayed CAS commit after genuine receipt 404, collaborator changes, inert untrusted restoration and quota/size/count/composition/file/number boundaries. The existing 29 native form/receipt tests remain in the same CI step. Shared navigation and transport regressions, lint/build/source-boundary checks are run for this wider change.

### Safe-departure local verification result

PASS: 413 isolated authority/route/transport/CAS/matrix/navigation/pagehide regressions; 49 distinct native Chromium cases (4 normal Apply forms + 25 existing unknown recovery + 20 new checkpoint cases). Additional reruns are not counted twice. The new checkpoint suite also verifies actual duplicated-tab session storage does not transfer navigation coverage, fresh FQC read failure hides private input, mobile 44px action targets/no page overflow, and native unload still warns. Author inspected restored 390px zh/vi and 1280px screenshots; this is not physical-device/IME acceptance. Full typed lint, build (stamped with pre-commit `e3b34d6`, not a deployment), source boundaries, changed-file secret scan and diff whitespace checks pass.

The first combined browser run exposed a test-fixture extraction error (`scripts` was not exported for an existing new-runtime test); the shared fixture now exports the original loaders and that full existing suite passes. New photo/equipment tests use actual photo policy plus valid native PNG bytes and synthetic active equipment; initial missing-fixture failures were corrected without weakening assertions.

Commands for the new scope: `node --test tests/navigation-adapters.test.mjs tests/navigation-departure.test.mjs tests/delivery-departure.test.mjs tests/delivery-navigation.test.mjs tests/navigation-lifecycle.test.mjs tests/shared-draft-pagehide-generation.test.mjs`; `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test tests/fqc-input-checkpoint-browser.test.mjs tests/fqc-unknown-recovery-browser.test.mjs`; `npm run lint -- --format unix`; the existing guarded build command above with `PROCESS_PROGRAM_COMMIT=e3b34d677e13dc56cff562ce105a5913e6a0fc1c`. Existing same-origin media remains an authenticated reference; newly selected photo bytes are stored in the archive. An identical already-verified payload reuses its existing record; no unresolved archive is overwritten or deleted.

### CI cache-contract follow-up

Matrix preview run 20 on `41bdfa3` failed before browser rendering because `test-fqc-matrix-layout.mjs` still pinned the preceding FQC asset tag. The source cache version was correctly advanced; the follow-up updates that strict assertion and the receipt-recovery asset assertion (also covering the new checkpoint helper), and aligns bootstrap's navigation-module preload/version with the new import. Assertions are retained. PASS locally: 16 actual-renderer/CSS cases, 6 native matrix browser cases, and 73 Node test entries covering cache/receipt/navigation plus the normal bootstrap fixture; full lint passes. The bootstrap fixture requires its existing CI `--experimental-vm-modules` invocation: an initial local invocation without that flag failed, then passed with the documented flag and unchanged behavioral assertions. Latest-head CI and independent review remain required.

Separate clean checkout of `41bdfa3`: PASS 30 focused tests (10 authority + 20 checkpoint), source boundaries and clean worktree, using separately installed locked dependencies. No business data package was copied.

### Failed-photo conservative admission

The final author audit identified a separate input-completeness boundary: the existing file handler clears its native FileList even after reading fails. A reset FileList alone is not proof that all selected photos were captured. The item form now tracks reading/failed/ready status for checkpoint admission; a failure remains blocking until an explicit successful reselection. No unknown marker is cleared, and this does not settle or resend the Apply. PASS all 21 checkpoint browser cases, including corrupt-photo rejection, retained input/no archive, and successful explicit reselection; full lint passes. The native total is now 50 distinct cases (4 normal forms + 25 existing recovery + 21 checkpoint), with the prior 413 core regressions reusable because authority/transport/navigation semantics did not change in this follow-up.

The preceding exact `ac2ba8a` clean checkout passed 73 cache/receipt/bootstrap/navigation entries and an exact-SHA guarded build. Matrix preview run 21 passed on that head; those results do not replace latest-head CI after this photo gate.
