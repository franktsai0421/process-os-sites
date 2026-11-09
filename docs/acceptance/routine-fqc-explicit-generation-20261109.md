# Routine FQC explicit generation

Independent work branch based on main b06394ce0065849733399423afd2d906761d69c1.
Only routine-fqc.js and its own index cache tag change shipped behavior. Shared
clients, equipment, FQC/IQC masters, backend, permissions, schema and stored data
remain unchanged.

Normal entry, return from history and Update use fresh state and eligible
generation through the existing server route, followed by readback. Update does
not Apply, Save or Submit unsent input. History/review/preview and denial recovery
remain read-only. No interval or focus polling replaces the removed 15-second
loop. Original operation/generation/receipt metadata and UNKNOWN no-resend guards
remain. Root, actor object, epoch, delivery and view fences also cover rejected
fetch/body responses, preventing late failures from repainting another context.

Tests execute complete production modules, actual route/kernel/CAS code and the
shipped shared helpers with synthetic DOM/clock and isolated SQLite/R2 ports.
Scoped-read D2 now distinguishes read-only recovery from normal Update generation.
All unrelated main assertions remain. New source checks attest the exact main
preimage and committed successor; predecessor bytes are never executed as runtime.

Exact local commands, results and candidate hashes are retained in the task
evidence. Counts overlap and must not be added as unique coverage. Local safety
registers source and runtime tests and preserves per-command Windows exit checks.

Native browser/Windows/mobile/IME, hosted CI and live performance remain separate
acceptance. No company data, migration or deployment occurs in these tests.
An idle page observes date/source changes only at normal reentry or Update.

## Local verification

The main-based candidate passes 210 Routine FQC runtime/route/receipt cases and
72 navigation/shared-receipt cases, with no skips. The full scoped-read script
and existing poll-wiring script pass; their imported equipment cases overlap
other suites. TypeScript noEmit and normal typed lint pass. Original failed
setup logs are retained separately; copying installed npm executable links was
corrected without changing dependency versions or lockfiles.

The unchanged unload regression uses one separately verified immutable Git blob
51bda3eda99c98ab30d3c46b6615065588be564c for its historical source comparison.
That local test cache does not establish complete history or privacy acceptance.
Full-history, browser/device and hosted CI remain unverified here.
