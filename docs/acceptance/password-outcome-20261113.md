# Password outcome repair — isolated candidate

Base: GitHub main `ba315149e7478c288d2f3af45c8668aa60070919`, rechecked by `git ls-remote` on 2026-11-13. Independent branch `fix/password-outcome-20261113`. Draft review only; no merge, deployment, real password, account, permission, schema or business-data change.

## Evidence and cause

The reported v44 UI shows an authorized administrator resetting a passwordless account and receiving `WRITE_RESULT_UNKNOWN_RELOAD_REQUIRED`. The internally inspected screenshot agrees with the supplied UI transcript. It is not evidence of a definite failure or of every account being affected. Neither the screenshot nor any actual account or credential is included here. The supplied Site source `95b12c7052ef922da2f7369ffa0a2845ebff7ee2` is a hosting derivative; this repair follows GitHub main.

Two source-level defects are reproduced in isolation:

1. `/api/user-access` password POST previously hydrated the entire shared business state. On records-v1, a slow, absent or corrupt unrelated business aggregate could delay or fail a credential-only operation. The new fault test first proves that the previous full reader rejects an unrelated unreadable aggregate, then proves that the real password handler does not fetch or rewrite that aggregate.
2. The browser aborted every account POST after 15 seconds, including response JSON consumption. A valid delayed password response therefore became UNKNOWN even if the credential had already committed. The actual controller/handler fixture delays headers/body beyond that deadline and accepts one terminal response. The compiled Chromium runner additionally holds a successful response for over 16 seconds; its execution is tracked separately below.

This establishes concrete common risks in administrator reset and own-password change, not the precise outcome or timing of the historical live request. Existing Node handler tests and native workerd scrypt round-trip pass on the base implementation. Login has its own selected credential read and does not use the account POST deadline. There is no evidence of a universal login/password outage. No live login or status check was attempted with a real account.

## Historical source comparison

The supplied v44 source pin was checked from its exact local Git object: `lib/passwords.ts`, `app/api/platform-login/route.ts`, `app/api/user-access/route.ts` and `public/process/user-access.js` are byte-identical to main `ba315149`. This is a source comparison, not a new live-site or historical-write acceptance.

Earlier same-role/effective-permission observations do not establish credential equality. Main's existing account-priority regression explicitly tests this distinction; its diagnostics and crypto-outage guards are retained and rerun. The supplied older candidate SHAs `efa7b75fd8be09317729c8c607c2837e3f5d8b61` and `40bb24a5e3185b04b10a27024c900f9cbf02ffc5` are not present in the accessible cloud Git repositories, and GitHub's exact commit API returns 422 / no commit found for both. Their exact trees/deltas cannot be compared or represented as reused PASS evidence. No workstation or alternate credential source was consulted. Their reported isolated acceptance does not prove any real account was repaired.

## Change, risk and verification matrix

| Change | Protection retained | Verification |
| --- | --- | --- |
| Password-only records overlay | Full SHA verification of selected authority/account/audit inputs; protected primary/peer/self rules; original password verification; revision check and final CAS | Generated missing/legacy/scrypt accounts; ordinary-user and protected-target denial; wrong old password; stale revision and CAS race |
| Opaque unrelated records | Original refs, legacySources, allocation refs, metadata and business ownership preserved; no migration | Byte-identical unrelated refs; unreadable unrelated business object is neither fetched nor rewritten |
| Server-issued one-use overlay | Generic partial-state writer still refuses; exact account-only credential/epoch delta plus one matching audit append; other fields/keys/accounts cannot change | Forged/copied handle, generic partial save, role/business changes and corrupt selected aggregate rejected before writes |
| Password response wait | One in-flight POST, current actor/generation fence, busy/disabled controls; no background polling or mutation replay | Delayed headers/body; invalid ACK; lost body; same-ID reauthentication; normal writes/GET retain 15s/45s deadlines |
| Unknown result | No success message, no automatic retry; read-only state reload cannot certify an unacknowledged password change | Fail before CAS, fail after committed CAS, lost response, explicit read-only check; fresh generated-account login distinguishes real commit |
| Storage compatibility | Inline, chunked-v1 and monolithic-R2 use existing read/write codec | Administrator initializes missing and changes legacy/scrypt accounts in all four formats; new login succeeds, old password/session rejected |

The new records overlay can replace only `platformUsers` and `processAccessControl`. It cannot be used for other account actions. It validates manifest-reference shapes and retains the exact unrelated reference maps; it intentionally does not hydrate unrelated business bytes. Authority still comes from verified selected user/role/policy objects, never inline credentials or a client payload. Inline versus referenced account duplication must agree. The normal general-purpose partial-save guard is unchanged. No SQL schema or persistent protocol field is added.

The account audit remains credential-free. Password hashing parameters and verification are unchanged. Password changes still increment only the target's authEpoch. Synthetic tests verify unrelated sessions stay usable. Real users were never signed out.

## Verification commands and results

Environment: Dot Linux cloud computer, Node 24.22.1, locked dependencies installed by `npm ci --offline --no-audit --no-fund`; the existing main push guard was installed by the existing postinstall. No workstation or remote binding was used.

- PASS: `node --experimental-vm-modules --test tests/account-password-outcome.test.mjs` (25 cases: storage/persistence/login/privacy/CAS/fault and scoped-writer guards).
- PASS: `node --experimental-vm-modules --test tests/account-password-transport.test.mjs` (10 actual-controller/actual-handler cases).
- PASS: existing `tests/account-priority-api.test.mjs` (15), `tests/account-dialog-feedback.test.mjs` (36), `tests/account-result-notice.test.mjs` (14). An initial combined run had 100 PASS / 1 FAIL because its toast fixture sliced by the old comment prefix; restoring that exact extraction prefix made all 36 dialog cases pass. No assertions were relaxed.
- PASS: native workerd `scripts/test-passwords-workerd.cjs`: hash creation, original password accepted, wrong password refused; zero external requests.
- PASS: full nonincremental TypeScript, full lint, source-only history/worktree preflight and guarded build. Initial new TypeScript/lint findings were corrected and rechecked.
- Exact source witnesses: `scripts/password-outcome-source-contract.*` reconstruct real main bytes for route/controller/cache entry changes and compose ahead of the unchanged historical account/cache proofs. Prefix/partial/extra/path/guard drift remains rejected. Restored bytes never execute as application code.
- PASS: compiled native `tests/user-permissions-native.test.mjs`, 16 groups / 186 timed requests, including own-password changes, administrator reset, fresh login, old-session revocation and unchanged account authorization.
- PASS: 91 current/legacy account source, cache, entry and permission proof cases.
- BLOCKED locally: Chromium package download returned a truncated/empty ZIP. Discovered system Chromium also fails before page creation with process-singleton `socket() ... Operation not permitted`. No UI case ran locally; no repeated socket workaround was attempted after identifying this restriction. The compiled browser runner is added to existing authorized Account permissions CI. A pending remote result is not a PASS.

The browser runner uses only ephemeral compiled D1/R2 and generated credentials. It covers zh/vi × 1280/390, empty masked fields, native validation, administrator reset, own change with rejected old password then explicit correction, fresh login, a >15s response, lost committed ACK and read-only recovery with zero POST replay. It logs fixed metadata only; generated secrets/request bodies/cookies are never logged. Empty-field screenshots stay under ignored local runtime output.

## Boundaries and independent work

Open Draft #112 was inspected as independent A/B/C master-data work. Its approved-proof/effective-delivery repair is not imported or duplicated. This password fix does not modify IPQC A/B or C workflow, records codec, effective-delivery or shared-state functions. Both tasks touch the general shared storage architecture, but this repair has its own credential-only entry and tests. Cache/source-proof deltas must be combined semantically if merged alongside another index change.

NOT_RUN: real Site/production request, historical password outcome, actual affected person's login, physical iPhone, true IME, cross-machine acceptance and real-data scale measurements. Legacy storage retains its existing full-decode cost; the password wait has no artificial timer and can remain busy until the platform/network returns. A true disconnect, platform termination, invalid ACK or failure after CAS remains UNKNOWN. Read-only account metadata alone cannot prove which password is installed; the account holder's explicit fresh login remains necessary. No automatic replay or credential test endpoint is introduced. An old UNKNOWN operation must not be resent on the assumption it failed. Tests prove an identical original request with its original baseRevision is refused after commit, and concurrent requests from one revision commit once. This does not add a cross-reload operation receipt: a newly built request using a refreshed revision is a new operation, not an idempotent replay.

Frank must review this account-security PR. No merge or deployment is authorized.

## First draft CI follow-up

Remote head `c4a2aaf4f75f6a464f0a02a3cde77660bd01a57e` passed Account install/lint/types, grouped authority, existing UI/API, new password isolation and existing session protections. Account run `43459666983` then failed `tests/navigation-adapters.test.mjs`: its source extractor still required the old two-argument requestValue signature, before its cache-tag assertion. AB/C `43459666807`, Quality C `43459666814` and PROCESS `43459667874` failed at the same exact test. These are stale test-source dependencies introduced by the new signature/tag, not an environment restriction. The browser steps were skipped, not passed.

The follow-up aligns only that actual signature and exact new cache tag, retaining request cleanup, no-replay, native AbortSignal, identity/epoch and all other navigation assertions. Direct equipment/Submit predecessor proofs also need the exact password inverse at their public entry, not only the account/quality wrapper; local reproduction exposed the index/entry-test hash failures before CI reached those cases. The new layer composes both LF/CRLF forms into the unchanged exact predecessor, with hash/span/path/extra/partial negatives retained. It never runs restored application code and does not modify product inputs or old pins.

Follow-up local verification: 161 affected navigation/source/cache/bundle cases PASS, plus 17 direct equipment/background/line-snapshot cases PASS; full lint PASS. An intermediate composed-source negative caught an unknown-target passthrough change; the helper now checks its own path/target before projecting, and the original negatives pass unchanged. Application runtime inputs are byte-identical to the first draft; earlier isolated password/native/build evidence remains applicable. Remote replacement-head CI must still complete independently.
