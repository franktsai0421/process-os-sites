# Inactive line and stage reducer

This increment prepares separate A/B and C line/stage draft reducers. It does not register an endpoint, UI entry, persistence key, adoption procedure or activation switch. Existing routes, public UI, shared kernel, master adapter and business data remain unchanged. Full G13 persistence/client integration and activation require their own acceptance.

## Source and dependency boundary

The source starts from main `1d02e90c3723211fbdc1a710d014f057fac62e47`, tree `d195885f1c1b4876799a2ce7bf8349f76937713d`. The initial source is published in [Draft PR #95](https://github.com/franktsai0421/process-os-sites/pull/95) at `03ace1e81f0f1069f5742ac5057c26b4df65c9dc`, tree `89fa1c053eef0d51094f0d396aebd8f8816f0c2a`.

The required `lib/master-document-boundary.ts` is included, with blob `dde17e65fa86631a79ec7bb5a9437c1fec356139` identical to [PR #94](https://github.com/franktsai0421/process-os-sites/pull/94). PR #95 does not depend on assuming #94 has merged. It does not include #94's runtime selector guard or its test command. This follow-up changes only CI registration and this document; the three reducer/helper/test source files remain exact initial PR #95 bytes. Before combining later updates, verify both current heads and preserve both CI commands.

## Contracts

- Identified Begin, explicit atomic Save, fixed saved-content submission and approval use the existing kernel and master validators on private request-local copies.
- Owned line/stage content cannot write product/category collections. Complete approved references and other scope working/saved/pending reservations remain enforced. Linked PROCESS effects are returned as staged values, never persisted by this reducer.
- New restore requests are disabled inside the reducer itself, independent of any unpublished shared-kernel policy. Existing permission/effects and operation-identity admission remain.
- Original committed receipt reads and exact command replay require current access, matching actor and original fingerprint. Restore replay requires current restore rights. Current create/delete withdrawal does not reapply a completed operation. Missing receipts remain unknown and never cause a retry.
- No data migration, deletion, permission-setting change or deployment is part of this increment.

## Verification

Run `node scripts/test-master-line-draft.cjs`. It executes 42 synthetic no-storage groups across A/B and C, including the original 36 groups unchanged and six added restore permission, identity, receipt and effects cases. The harness executes the real reducer and dependencies; unexpected DB/R2 access throws.

The existing AB/C workflow now runs this exact command in the `Inactive line reducer contracts` step. It is not optional and does not ignore failures. Existing triggers, permissions, dependency installation, test commands, build and browser steps remain unchanged. No deployment or credential step is added.

The initial exact source tree passed 42 reducer groups, 155 current master tests, 92 legacy/product-route groups, full lint, TypeScript, source check and normal build. Independent review closed the restore replay-permission and admission-order findings. Those results cover the unchanged source files; follow-up CI/document checks and remote results must be evaluated for the latest commit, not inferred from an older head.

The active-catalog excluded-body owner-policy HOLD remains. Synthetic tests and a local build do not constitute browser/native/physical-device, live-data, persistence/cutover or activation acceptance. Keep the PR in Draft until all applicable review and CI requirements are satisfied. No merge or deployment is authorized by this document.
