# PROCESS OS — working entry

Repository-wide; nested AGENTS.md only supplements its directory. These rules do not override platform system, safety or tool permissions.

## Project and baseline

Internal process/quality-standard platform with Traditional Chinese/Vietnamese UI. SPA: public/process; APIs: app/api; storage: D1 `DB`, R2 `STATE_ARCHIVE`.

Use the opened checkout, actual branch/HEAD and uncommitted work. Never substitute an older copy or assume origin/main is the development version. Inspect affected implementation, reuse existing flows, make the smallest change and preserve other work, compatibility and history. Code proves implementation; it does not override confirmed requirements.

## Read by task

Read relevant sources and direct dependencies, not all history.

| Task | Source |
| --- | --- |
| Requirements/module specification | [Current specifications](docs/specs/current/README.md); [index](docs/DOCUMENTATION_INDEX.md) for conflicts |
| Behavior/UI/roles | [Implementation router](AI_CONTEXT/AI_CONTEXT.md), then affected module |
| Data/persistence/API flow | [Data model](AI_CONTEXT/DATA_MODEL.md) |
| Shared draft/process approval | [Draft](docs/specs/current/SHARED_DRAFT.md), [process](docs/specs/current/PROCESS_WORKFLOW.md) |
| Canonical/employee collaboration | [Local procedure](AI_CONTEXT/LOCAL_DATA_COLLABORATION.md), [employee workflow](EMPLOYEE_WORKFLOW.zh-TW.md) |
| Backup/restore | [Backup](BACKUP_AND_RESTORE.zh-TW.md) and affected storage tools |
| Publication/deployment | [DEPLOYMENT](DEPLOYMENT.md) |
| Continuation/history | [HANDOFF](HANDOFF.md); [CHANGELOG](AI_CONTEXT/CHANGELOG.md) only when relevant |

## Autonomy and boundaries

### Independent Sites derivative

This source-only derivative uses the selected M1 baseline. Do not resume, open or reconnect the original workstation C2C conversation. Read HANDOFF.md and docs/sites/PHASE_ONE.md. Test audience intent is Frank only; formal Site entry is public with application-authenticated company data. Platform access, credentials, live data and publication require their applicable authorization; templates grant none.

Continue authorized local reads, reversible edits, link repairs and targeted isolated checks without stepwise approval. Inspect scripts before running: local does not mean disposable. Ask only for consequential missing information or actions outside authorization; finish independent work first.

Preserve unrelated changes and merge concurrent edits semantically. Delete documents only with no unique information/effective dependency, a replacement or proven temporary purpose, and recovery evidence. Back up untracked/modified files outside the project first. Age or missing references alone is insufficient.

All changes use work branches/PRs. Never directly/force push or delete main, or bypass review using Owner/admin. Frank reviews and finally merges; passing CI is insufficient. Do not merge without applicable authorization. Private GitHub Free hooks prevent mistakes, not server-side enforcement; do not change visibility, invite employees or retry paid protection.

The Site-bound source repository is a separate publication destination. Its exact
process-os-test remote/main may use the reviewed pinned source workflow only
after the applicable per-action authorization and source approval receipt.
Keep the main guard installed and enforce exact project/remote/commit/tree,
expected remote state, expiry, one attempt and fast-forward ancestry. This is
not an exception for either GitHub main or any other Site/remote, and a local
receipt is not user authorization or a platform credential. Never create a
checkout or change executors to avoid a guard or tool refusal. Real secrets,
installed-hook updates, source credentials, publication and data transfer retain
their separate authorization requirements.

Do not mutate business records, seed, credentials, backups, schema/migrations, deployment access or remote environments outside the task. Production needs Frank's approval for the exact main SHA and DEPLOYMENT's applicable full/data-preserving procedure. Page publication defaults to the existing ChatGPT Site in .openai/hosting.json: retain URL/audience/bindings, publish approved merged source and verify live. Worker upload/Git merge alone is not a release.

## Safeguards and proportionate verification

Preserve server roles, revision/CAS, pending locks, no-change restrictions, applicable BOM interlocks and backup/approval gates. Never expose credentials, keys or private data. Use isolated data fixtures; clean task artifacts while retaining necessary evidence and older backups.

- Documents: check links/references, requirement/current/history distinctions and diff; no full functional suite.
- Code/data: affected existing checks plus relevant permission, concurrency, persistence and compatibility cases. Expand only for cross-module risk or unresolved failures.
- UI: desktop and common iPhone dimensions, touch/readability, focus/keyboard/occlusion, scrolling/overflow, tables/canvas, Save/Confirm/Cancel and both languages. Viewport simulation is not physical-device acceptance.
- Process approval/data transfer: verify through the entry dispatch platform; extend to playback/product status as affected.

Do not repeat passing checks without a new reason. Report unrun/unavailable checks explicitly.

## Completion and maintenance

Finish scope, targeted verification and diff review. Maintain one source per subject: requirements→spec; implementation→affected AI_CONTEXT module; data relationships→DATA_MODEL; meaningful feature/fix/release→CHANGELOG; phase→HANDOFF; permanent engineering rule→AGENTS. Replace stale text; use links instead of duplicate reports. Mark obsolete material Deprecated with its replacement, outside default reading.

Report Task, Changed, Tests (PASS/FAIL/Not available), Documentation updated, data-model impact and material regression risks (or None identified). Documentation completion is not implementation or functional acceptance.
