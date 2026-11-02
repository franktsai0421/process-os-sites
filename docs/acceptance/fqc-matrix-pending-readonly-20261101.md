# FQC matrix pending/read-only controls

## Finding and scope

PR #56 CI [41333228538](https://github.com/franktsai0421/process-os-sites/actions/runs/41333228538) ran merge `371f2e2cbf698ab68666fe8db4ed75bc7e1ecb5f`, tree `acf2b0f7130725613da742f26420f87ec715a99c`, equal to public head `99e783266cb8a08ad083bcb141e8dfb9685663d6` and local `f8c5af9e0dbbae3d6c6857a61c98b93dca63c660`.

- The FQC main lifecycle completed all **33 phases × 5 cycles = 165** measured samples. They are synthetic desktop Chromium results, not live-site or phone timing; the largest sample was **239.2 ms**.
- The two-actor matrix suite then failed in cycle 1: the peer had already received a pending case, but six matrix controls were enabled. Its 12 earlier samples are partial evidence, **not five complete cycles** or a successful two-actor suite.
- `matrixHTML` initially disabled read-only controls, but `paintMatrixActions` could enable them using only permission/recovery/busy state. The permission helper did not mean that the selected version was a draft.
- A whole-module/actual-route synthetic proof reproduced the display error. Calling the pending cell handler did not change local input or POST; a direct signed Apply received `409 PENDING_LOCKED`, with D1 and R2 unchanged. This is a read-only UI defect, **not evidence of a successful unauthorized write**.

## Narrow correction

The matrix-only predicate requires an editable selected version, no pending case, and the existing edit permission. It is used for cell state, the toggle handler and non-query Apply availability. Rebuilt DOM resets the existing cell-gate cache so the new controls receive the current gate. A status-only repaint still uses the cache; there is no new per-input serialization, GET, POST, server rule or permission grant.

Unknown-result receipt queries keep their existing separate availability and remain GET-only. Discard/reconciliation rules, original field guards, pending enforcement and the native assertion of zero enabled pending cells are not relaxed. Only the FQC script cache tag changes; the shared transport tag from #60 is retained.

## Local evidence and limits

- Existing `tests/fqc-matrix-multiuser.test.mjs` plus six new groups: **26 PASS**, including pending/Withdraw, approved/history projection, read-only grant, same-root busy and delayed-recovery repaint, and unknown receipt query on a read-only view. The history display-state case uses a synthetic projection; it does not replace native history acceptance.
- The new pending group is red against the prior product source and green against this candidate. The original private CI failure and route proof are retained without relabeling.
- Exact navigation cache-tag test: **1 PASS**; existing matrix layout/reference script: **16 PASS**. Type-aware lint passed for the four affected source/test files. Independent selected checks overlap these counts and are not additional samples.
- Actual handler tests use isolated SQLite/R2, two signed synthetic actors and production module/transport code; DOM, timer and version-bar mount ports are synthetic. They are not two live employees or native UI performance evidence.
- The unchanged full native matrix suite must still run on the corrected tree. The prior random setup timeout and fixture `fetch failed` did not repeat in the latest main-lifecycle run, but their cause remains unproved. No timeout, error oracle or retry behavior was changed here.

See the [two-actor matrix acceptance scope](fqc-matrix-multiuser-20261101/README.md) and [FQC lifecycle scope](fqc-draft-lifecycle-20261101/README.md). No schema, business data, actor permission or deployment change is part of this local correction.
