# Pinned installation, native tests and exact remaining boundaries

This continues the same independent source. Real R1 output, original D source,
M1, daily 3000 and their credentials remain untouched. No Git or remote writes.

## Actual progress

- Fixed-lock installation completed: 567 packages, exit 0. Package and lock hashes
  are unchanged. All 784 lock download URLs use `https://registry.npmjs.org`.
  `npm ci --ignore-scripts --no-audit --no-fund` ran against only package/lock
  copies in a fresh clean project. Explicit empty user/global config, private
  cache/temp/log paths and an environment allowlist avoided reading `.npmrc` or
  account credentials. No lifecycle, Git hook/configuration or dependency upgrade
  ran. Installed modules were moved into the previously absent `node_modules`.
  This is not G3 candidate adoption or G3 dependency-upgrade resolution.
- Exact write namespace: this copy's `node_modules` and
  `.sites-runtime/pinned-install-20261022`. Original sources were read-only.
  `scripts/prepare-pinned-dependencies.mjs` refuses a preexisting module target
  and retains a failed/partial installation instead of deleting and repeating it.
  The first preparation stopped before writing because `.npmrc` existed; the
  implemented clean-metadata staging avoids opening it. This was an application
  precondition, not a policy denial.
- Host facts: Windows x64 10.0.26200; AVX/AVX2 supported; all four inspected VC/UCRT
  DLLs exist. No installer, OS setting or permission change was justified by those
  facts. Existing/new workerd binaries have identical SHA-256
  `74550de7abef9a2b86fa43491d57c7ecf6809e45b3f123222b2256b57a0839dc`.
- Same workerd `--version` and help exit 0. Socketless native CLI unit: 1 PASS.
  Actual `lib/passwords.ts` in native Worker CLI tests: 4 PASS (scrypt roundtrip
  including wrong-password refusal, legacy plaintext compatibility, malformed
  verifier refusal, WebCrypto HMAC integrity). Only synthetic inputs; generated
  verifiers stayed in request memory. No account or persistent signer was created.
  This is native primitive compatibility, not an application login acceptance or
  evidence about Sites CPU/memory quotas.
- Reduced Miniflare worker, without business source/DB/R2, still failed natively:
  PID 30476, exit 1, closed; `std::terminate() called with no exception` retained.
  Miniflare `dispose()` rejected. Original Node PID 14428 is absent. No new-binary
  workerd process remained when read-only checked. Scratch/logs were retained.
- Direct native `serve` reached a control message for its owned ephemeral listener
  (`127.0.0.1`, not 3000), without native terminate. Its client then failed; only
  that owned child (14648) was terminated and its close recorded. The initial
  generic diagnostic status incorrectly conflates readiness/client failure: the
  preserved control log proves native listener readiness. Read the supplemental
  interpretation receipt rather than claiming raw serve itself crashed.
- An independent Node-only synthetic server/client diagnostic established the
  client's exact failure: `connect EACCES 127.0.0.1:<owned-ephemeral-port>`.
  That server was closed. No network variant, alternate transport or elevated
  runtime retry followed the access denial. This narrows a real readiness-check
  access problem; it does **not** establish the entire cause of Miniflare's native
  crash. The native socketless successes remain independent valid evidence.

Windows Application event-log read returned `UnauthorizedAccessException`.
That read stopped; no privilege or alternate log-reading mechanism was used.
No pending event-log approval exists. Old C1/observer/G3 targets and quotas were
not retried or reset. [Phase eleven](PHASE_ELEVEN_RUNTIME_HANDOFF.md) preserves
their exact operation distinction; its statement about absent dependencies is
now historical.

## Actual source repair and verification

The first full `tsc --noEmit --incremental false` found eight diagnostics caused
by IQC's static company-source import, excluded from this program-only delivery.
The API now uses `readIqcImportSource`, a bounded private read with an explicit
object key plus independently configured file SHA-256. It refuses unset/unsafe
configuration, missing/oversized/short/excess content, wrong hash, bad UTF-8 and
missing legacy manifest fields. It never substitutes current editable IQC data
for the original reviewed Excel baseline. Existing same-origin, account,
maintenance, role, revision/CAS, source-version, row/photo and no-overwrite checks
remain before the existing write path.

`PROCESS_IQC_IMPORT_SOURCE_KEY` / `PROCESS_IQC_IMPORT_SOURCE_SHA256` are optional,
unconfigured non-secret source pins for the legacy first-Excel-import operation.
No actual baseline object was read, uploaded or configured. Absence returns a
clear 503 for that maintenance import. Existing IQC reads/edit/review paths do
not require it; the browser's source-preview request is button-triggered, not a
startup requirement. The separate old preview URL remains unavailable until a
reviewed private bootstrap source/preview is supplied. Do not claim full legacy
Excel bootstrap acceptance, or assume true R1 contains that missing original file.
The already converted R1 current/history IQC business records were not changed.

Private-baseline synthetic cases: 5 PASS. Full project TypeScript after repair:
exit 0, zero diagnostics, using this copy's pinned dependencies. `checkJs:false`
still means JavaScript behavior requires separate tests/syntax checks. Affected
source-boundary/security checks and syntax have separate phase-twelve receipts.
No browser, true D1/R2 restore, actual session cookie or hosted Site was tested.

Source handoff policy additionally excludes `.npmrc`, `.yarnrc*` and `.netrc`
without opening them. Existing local configuration stays on disk; no `.npmrc`
contents or credentials were read. Three previously held legacy scripts remain
excluded and unopened. Runtime/cache/package trees are omitted from source pins.
This is a known-path source review, not proof of universal secret absence.

## Forming a real reviewed derivative commit (parent-owned, not executed)

1. Use `sites-source-handoff-phase-twelve.json` as the explicit file allowlist,
   verify its current hashes, review the listed delta and retained M1 provenance.
   It is a source-only candidate with held legacy scripts/local config omitted;
   no dependency, data, snapshot, R2, secret, runtime or Git directory is included.
   Do not blindly add the entire workstation directory.
2. In a parent-controlled fresh local Git work area, create/reuse the intended
   source repository, materialize exactly that reviewed source and commit it.
   The six M1 commits identify input provenance; they are not the modified source
   SHA. Preserving/importing any old Git object history needs its own content
   review; the source allowlist alone does not audit historical Git objects.
3. Record the actual resulting 40-hex source commit and clean reviewed tree.
   Set `PROCESS_PROGRAM_COMMIT` for the build to that real program commit; do not
   use M1, the 64-hex allowlist hash, an invented value, or remove the guard.
   Further source changes require another real commit. No local Git operation was
   performed by this child.
4. The Site-bound source remote/commit remains separate from the intended private
   GitHub destination. Parent records reviewed program commit, each returned
   project ID, exact pushed Site source commit and matching build/archive/version.
   Site-specific hosting metadata can make Site source SHAs differ; do not invent
   IDs or assert equality without checking actual source synchronization.

The root install lifecycle sets collaboration hooks/configuration. It was not run
under this no-Git-write phase. Parent must retain/review applicable collaboration
protection when forming the actual repository; installation success is not a
publication safety exemption.

## Exact minimum remaining actions

- Parent-controlled Git writes to form the real reviewed derivative SHA are the
  remaining build-guard prerequisite; fixed dependencies and full types now exist.
  Build remains unrun. Generated Sites binding/compatibility metadata is unverified.
- A new Sites synthetic runtime readiness test needs actual authorization for
  loopback listen/connect in the tool-reviewed execution context: only the owned
  dynamic `127.0.0.1` listener, excluding 3000, no external network, true data,
  credentials, firewall/ACL/system changes or old denied operations. This is
  required by observed EACCES, not an inferred blanket SDK prohibition. No retry
  should occur until the relevant access grant/recovery is established. The
  official [local preview guidance](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/references/preview/local.md)
  says: “Request network permissions when required for the server and its
  readiness check.” The parent's explicit security-permission boundary also applies.
- Event-log access is unavailable; it is not necessary to install a replacement
  binary, alter Windows security or switch machines. The startup logs, exact args,
  exit/close, native unit successes and connection denial are retained for a
  supported diagnosis. Underlying Miniflare crash cause remains unproven.
- Actual Site/GitHub writes, independent D1/R2/session settings, real verifier
  bootstrap, protected resumable import implementation/true upload and release
  remain parent-controlled future actions. The minimum transfer design in phase
  eleven still applies. No such platform or true-data action happened here.

Receipts live in the parent task: `sites-pinned-install-inventory-phase-twelve.json`,
`sites-runtime-host-facts-phase-twelve.json`,
`sites-runtime-native-diagnostics-phase-twelve-01.json`,
`sites-workerd-version-diagnostic-phase-twelve.json`,
`sites-runtime-minimal-phase-twelve-results.json`,
`sites-runtime-unit-phase-twelve-results.json`,
`sites-runtime-password-phase-twelve-results.json`,
`sites-runtime-serve-phase-twelve-results.json`,
`sites-node-loopback-phase-twelve-results.json`,
`sites-runtime-interpretation-phase-twelve.json`,
`sites-iqc-source-phase-twelve-results.json`,
`sites-full-types-phase-twelve-results.json` (initial eight diagnostics),
`sites-full-types-phase-twelve-after-iqc-results.json` (zero),
and the phase-twelve source freeze/diff/handoff/checkpoint files.
