# Routine FQC validator dependency extraction

Base: `7ef04ed741249816aac2f1336cf15f888ff92fa0`. This isolated change prepares one dependency for the inactive #102 page core, without integrating that core or changing page ownership.

## Change and equivalence

`lib/routine-fqc.ts` exports `validateRoutineContentEdit(c, doc, content, previous)` and calls it from the existing per-document `draftContext.structure`. Its declaration is byte-identical to the declaration in #102 local candidate `8560869`; SHA-256 of the declaration is `d591b9831c6538a20c1c29d63a08464c0109797fb1d2f70dca01bc0f8679b31e`. The extracted body has exactly the same nontrivia TypeScript tokens as the original 7ef closure body. It uses the same `structure`, `linkedCase`, `demand` and `stableDraftJSON`, with the same references, validation order, errors and status codes.

All per-document `save-local-v1` admission, edit/save separation, required revision and guards, request-local staging, full-command fingerprint, one revision/Save, replay and unknown-operation handling remain. No whole-file replacement, new scope, route, UI, codec, migration, ACL or business side effect is added.

The new test fixture freezes the actual 7ef `demand`, `linkedCase` and structure closure body, with source commit/file SHA and fragment hashes. The original file SHA is `36f63ff98d7b5a1ed48de99ebe9ffa1a1e3503e05cc522d4a3ed6399a7769cf3`. Tests use these genuine predecessor fragments and the current production structural/kernel helpers. They need no external candidate checkout or historical Git object at runtime and work with a shallow clone. No Git history was fabricated.

## Verification

- `node --test tests/routine-fqc-content-validator.test.mjs`: **14 PASS, 0 FAIL/SKIP**. Exact predecessor/current outcomes and statuses, immutable sources/membership, result/photo/text validation, retest and correction linkage, unchanged legacy samples, source nonmutation, actual Save atomic rejection, one-revision Save and exact full-command receipt replay. A structural-only negative control demonstrates the retest protection would otherwise be lost.
- `node --test tests/routine-fqc-durable-route.test.mjs tests/routine-fqc-durable-receipt.test.mjs tests/routine-fqc-manual-generation.test.mjs`: **191 PASS, 0 FAIL/SKIP**. Existing actual Workers route, signed synthetic users, isolated SQLite/Map-R2, rendered UI/transport, conflict choices, source/permission/revision refusals, CAS races and original unknown receipts remain covered. No assertions were changed in these suites.
- Nonincremental `tsc --noEmit`, targeted oxlint and `git diff --check`: PASS.
- Independent one-off provenance check: #102 declaration exact; predecessor body tokens exact; predecessor full source digest exact.

An initial test launch did not execute because the dependency symlink pointed to a checkout without node_modules. Correcting that symlink to the existing same-lockfile installation yielded the results above; no install or network dependency resolution occurred. The workspace filesystem was full, so this independent clone uses the available local `/tmp` filesystem; no candidate, evidence or backup was deleted. No native/browser/live/remote test or write was attempted.

## Ownership and remaining dependency boundary

The #102 owner can now import the same exported validator while retaining its inactive page core. This change does not load or verify that core and does not supply whole-page Begin, document creation, fixed page review/approval effects, media admission, HTTP/CAS/codec, legacy receipt fencing, UI or real cutover. Those remain with #102. Current per-document APIs and receipts remain authoritative.

Parent integration should carry this narrow extraction, rather than taking #102's older complete routine file. Run the new 14-case command in the existing routine CI batch and refresh any exact-source witness affected by the new library bytes while preserving predecessor proofs. CI workflows/source ledgers are outside this change. No persisted model or data migration is required for the extraction itself.
