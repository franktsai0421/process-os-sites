# Independent approved-history read helpers

## Scope

This source-only candidate adds `lib/approved-history.ts` and `lib/ipqc-ab-approved-history.ts` with exact bytes from reviewed history source `a678afb6637f3b54c8da6333bfa180340616197c`. These pure read helpers do not register an API, UI entry, storage adapter or activation switch. No existing product caller is changed. They do not mutate business data, permission settings, schema or credentials.

The base is merged GitHub main `1f91d060bd8ccaf3007b3bae27db427daa5c5d62`, tree `20612337f360e925c689aa7c2644466fc5c98d3b`. The local validation checkout uses the same exact tree, without claiming synthetic local commit ancestry is GitHub ancestry. Both helper dependencies are existing main types; no unpublished shared kernel or transport is included.

## Contracts

- A matching workflow case must be approved and match creator, base and creation identity. An invalid matching case cannot fall back to legacy evidence or the formal pointer. Approved detail comes from immutable case content.
- Legacy evidence requires an approved/superseded version and an actual approval event. Shared temporary rows and unapproved historical rows are excluded. The authoritative formal baseline is labeled as a baseline without fabricating reviewer/time evidence.
- Metadata proof does not hydrate numeric snapshots or case bodies. AB read projections retain source scope/identity, exclude whole-module duplicates and aliases, and never append projected IDs to storage.

## Reproducible checks

Run `node scripts/test-approved-history-evidence.cjs`. It exercises twelve groups against the real TypeScript helpers through the repository harness, including positive/negative approval evidence, identity mismatches, metadata getter traps, opaque legacy IDs, scope ownership and frozen input preservation. DB/R2 access throws. Existing tests are unchanged.

The existing AB/C workflow runs the new command as a separate normal step, with no failure masking. Workflow triggers, permissions and existing checks are unchanged. Evaluate CI for the exact published head; local checks are not remote CI.

## Acceptance boundary

This is not delivery or activation of the complete approved-history UI, G13 history/persistence, restore, adoption or migration. The other integration work remains separate. No browser, physical device, live-data or deployment acceptance is claimed for these inactive helpers. Existing active-catalog owner-policy HOLD remains unchanged.
