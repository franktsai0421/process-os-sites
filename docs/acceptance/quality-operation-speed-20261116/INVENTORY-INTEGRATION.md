# Inventory main integration — 2026-11-17

Integrates PR126 remote24942ad64469f247cc628b4df693b00fc4faaaac with latest main0f2c8ec5 (merged PR121) in the existing checkout. The previous quality/account integration remains in ancestry. No unrelated candidate, business data, schema, role, merge-to-main or deployment change.

Six conflicts are resolved semantically: both HANDOFF/CHANGELOG entries are retained; shared workflow GET/POST scheduling admits both exact inventory predicates and existing quality/process predicates; account/quality source adapters retain both proof chains; the account/process runtime inventory explicitly retains both inventory and quality helpers. No command eligibility, fresh permission fence, history, CAS or error-order condition was removed.

A new test-only exact dual-parent inverse restores complete genuine24942ad6 and0f2c8ec5 bytes. Existing manifests/hashes/negative tests remain unchanged. It covers all changed pre-existing parent files, not only conflict markers, and rejects unknown source/targets. The PR121 source normalization cache is retained unchanged, including private Buffer ownership and bounded cache admission. Its fixture revision/URL observer, native conflict-dialog timing, and delivery diagnostic workflow remain unchanged from main.

Validation:258 source/dual-parent/origin checks PASS;66 actual scheduling, atomic-save/CAS and readback checks PASS; lint, typecheck and guarded build PASS. The build was on runtime commit9acc48a2;54d9e99f changes only test-source adapters/manifest. Initial proof failures were fixed by complete parent mappings and preserving unknown-target identity; original tests were rerun without relaxing assertions. Retained fixture and Local safety readscope/EOL results are in the local evidence logs and must be confirmed before upload completion.

Full new-head CI remains required, including Local safety's complete downstream steps. Old Windows EADDRINUSE identifies a local D1 bridge connection failure but not a unique resource-lifecycle cause. Original Feedback INVISIBLE_TARGET lacks failure geometry; later green results cannot establish the original cause. Neither issue is declared fixed from this merge. Prior performance measurements remain synthetic; this integration adds no new live performance claim.

No PR description update is attempted because its separate publication was previously denied. Remote head/tree and CI outcomes must be reported from actual receipts, not this local document.
