# Persistent destination navigation — not published

## Behavior and compatibility

Ordinary internal navigation retains one document and its static shell/code while
preparing a fresh authorized projection for the destination. Existing visible
menus, URLs, layouts, features, workflows, data models and session/data/action
rights remain. The primary-administrator management distinction is unchanged;
no new page ACL or cross-actor business cache is introduced.

Explicit module guards check local edits, IME composition, queued/in-flight/
unknown writes and recovery before and after preparation. There is no automatic
save, discard or replay. Only GET preparation can be superseded. Actor, delivery,
mount and read ownership reject stale results and stale error/finalizer callbacks.

A committed switch resets old models and owned polling, replaces the authorized
projection rather than merging missing keys, and mounts the target. Precommit
failure preserves the source. Target denial does not silently become logout.
Uncertain account-write acknowledgments remain guarded and are not retried.
Partial installation fails closed; ordinary read errors preserve owned input and
recovery UI instead of claiming readiness.

Cold entry still verifies the session and authorized projection. The shell can
appear before business reads finish, but only successful destination-owned reads
mark that generation ready. Normal internal switches do not reload scripts or
show a full-document startup gate. External/history/account boundaries retain
necessary revalidation. Back/Forward, superseding clicks and duplicate targets
have explicit ownership and physical-history restoration rules.

## Destination coverage

- Views (11): dashboard, player, dispatch, productStatus, editor, approval,
  quality-dashboard, quality-search, quality-reports, quality-fpy,
  quality-inspections.
- Data tabs (13): AB, C, line-admin, process-master, bom, users, quality-fqc,
  quality-iqc, quality-ipqc-ab, quality-ipqc-c, quality-mold-equipment,
  quality-routine-equipment, quality-routine-reports.
- Approval panels (4): master, process, quality, routine.
- Normal login to its initial destination.

Each destination retains its existing data owner and workflows. Placeholders do
not acquire speculative business loads. Routine generation does not run before
commit. Five dedicated quality tabs omit unused bootstrap aggregates while their
own authorized endpoint reads remain. FQC's dedicated reads are still serial:
a persistent shell does not make business data instantaneous.

[Bounded read/image changes](BOUNDED_LOADING_20261025.md) retain original images,
critical viewers/print, layout and authorization. No all-data/image preload is added.

## Validation status

The application baseline is
`fff6a8231f58af817e19e2b2d2828f1b86e95a28`, plus two narrow navigation corrections.
Cold quality entry no longer falls back to an absent master scope before module
registration. Legacy master-tab and player-intent listeners now yield to the
persistent history owner; native fallback remains available without that owner.
Neither correction adds reads or bypasses actual-data readiness. The latest
correction passes 51 focused router/player/adapter cases, including legacy-first
history races, pending-write guards and post-install player intent.
Portable Chrome discovery retains its 15 focused preflight/launcher checks.
Actual compiled-browser runs exercised navigation and original-image paths but
failed on a legacy popstate page error, not the separately reproduced cold-entry
edge. Those partial runs are not an overall PASS. The corrected exact-head full
CI remains pending.
Reused application evidence is not a new run and overlapping suites are not summed:

- PASS: 140-check earlier integration checkpoint and shared-client recovery checks.
- PASS: 54 targeted correction checks, including history ownership, stale reads,
  input preservation and uncertain acknowledgments; 10 IQC/route handler groups.
- PASS: full TypeScript, source checks and official build for that code candidate.
- NOT_RUN: exact-head compiled-browser CI for this revision. The existing test
  covers actual 24+4 destination UI, login, generation readiness, same-shell
  identity, history/click races, duplicate clicks, revocation, dirty/unknown guards,
  denied targets, original synthetic images/viewer/scroll, repeated resources and
  the retained manual-save/lost-acknowledgment/denied-write assertions.
- NOT_RUN: user visual preview, native Chinese/Vietnamese IME, real-data latency
  and long-run peak browser memory. Automated coverage is not manual acceptance.

The seven audit concerns remain separate: duplicate reads, hidden polling,
large-list/search/IME, image layout/scroll, rapid navigation/stale responses,
read errors/unknown writes, and long-run resource ownership. No whole-site speed
or release-readiness claim follows from shell visibility or synthetic checks.
This candidate has not been published.
