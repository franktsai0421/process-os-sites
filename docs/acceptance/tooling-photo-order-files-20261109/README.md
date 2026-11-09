# Tooling photo ordering and File timing continuation

Base: `7ef04ed741249816aac2f1336cf15f888ff92fa0`, isolated local contribution.
No remote, native browser, backend scope, schema/data or approved-view policy changes.

## Ordering

Two actual stageChanges → signed route/kernel → Save cases reproduced silent
loss of local photo order: `[a,b]` → `[b,a]` saved as `[a,b]`; a peer append `c`
also saved `[a,b,c]` without a conflict, clearing the local journal. The first
photo is used as the list image, so this loses the local primary-image choice.
Negative log: `/tmp/tooling-photo-order-before.log`, 2/2 FAIL.

The stable-ID merge now retains the single changed surviving order, preserves
independent additions in their relative slots (tail additions stay after all
existing photos), and groups incompatible order/anchor changes into the existing
single Mine/Theirs/Cancel decision. Row fields and disjoint appends remain merged.
The existing post-choice fresh read/recomparison, owner, revision/CAS, pending,
permissions and original receipt/no-resend paths are unchanged.

PASS: `tests/tooling-global-save-choice.test.mjs`, 32/32 with actual full frontend
closure/event handlers and signed real handlers against synthetic SQLite/R2.
Includes original grouped choices/recompare/authority/unknown, new reorder-only,
reorder plus peer append, incompatible order choices/cancel and shared-slot controls.
Log: `/tmp/tooling-photo-order-after.log`. These are synthetic DOM/clock tests,
not native rendering or live account acceptance. The File timing follow-up is
separate from this ordering change.

## Save-only File follow-up

The original actual File-change control issued a photo PUT immediately, even
when the editor was subsequently canceled. The two baseline interaction tests
fail their zero-PUT assertions (`/tmp/tooling-save-only-file-before.log`). File
selection now keeps the exact File, temporary photo identity and blob preview in
page RAM. Completing a form remains local. Only explicit Save, after the fresh
comparison and stable global choice, resolves photos selected by the final
patches. Cancel or a rejected whole insertion uploads none; choosing Theirs for
an unrelated field retains a nonconflicting File. Final workflow commands contain
confirmed photo IDs, never temporary IDs or File contents.

The existing lossless `photo-policy.mjs` prepares the actual upload payload.
The client pins its SHA-256 before PUT. Confirmed matching photo URIs are reused,
including after a known workflow CAS rejection and reselection of that same File.
A dispatched PUT without a matching confirmation is not repeated for that File.
A later explicit Save may only GET its original normalized content-hash URI and
verify returned bytes. 404, unavailable or mismatching bytes remain unresolved;
they never authorize another PUT. Removing/reselecting the exact File preserves
that RAM dispatch state. Original business UNKNOWN Save/Begin operations continue
to use their unchanged persistent receipt path and are never reposted.

Every File entry and upload step retains actor object, epoch, delivery,
generation, client/transport lifecycle, view and original local snapshot/base
ownership. A late upload ACK after ownership changes cannot send a workflow Save.
Fresh pending/permission refusal happens before PUT. New tool editing/staging is
blocked while Save is busy so an earlier ACK cannot erase a new private batch.
Same-page filters/subtabs retain Files/previews. Explicit cancel/true departure,
version departure or owner reset revoke previews and clear unsent RAM; no business
snapshot, approved version or original workflow receipt is deleted.

PASS: `node --test tests/tooling-save-only-files.test.mjs tests/tooling-local-atomic-save.test.cjs`,
51/51 (28.5 s), including the original 32 full Tooling grouped-save tests imported
by the File test, 16 File interaction cases, and 3 atomic route tests. Final log:
`/tmp/tooling-save-only-files-final2.log`. The synthetic File/photo fixtures grant
only their memory-only test actor's existing `view:data` permission, and provide
the R2 response-body port needed by the actual photo GET route. No production ACL
or photo endpoint is modified. Scoped runtime oxlint and diff checks PASS.

The photo endpoint has no durable upload operation receipt. The File/hash/URI
recovery described above is RAM-only, not cross-reload or cross-browser upload
recovery. Closing/departing drops it; an uploaded but unreferenced object may
remain in existing content-addressed storage. No automatic deletion or fabricated
receipt is added. Native image/IME/device, hosted, remote CI and combined build
acceptance remain NOT_RUN. Parent integration must update the Tooling cache and
outer exact-source proof; these local tests do not replace those gates.

## Other module dependency review

No BOM or routine-equipment runtime change is included. BOM occurrence imports
retain original ordered decisions, full candidate/review digests and immutable
path/parent/order restrictions; ordinary manual fields use original guards plus
fresh revision. Generation-changing restore is still fenced. The ordinary missing
row case remains a conservative authority boundary to review if a supported
same-generation deletion path is introduced; incremental import currently retains
omitted occurrences. Routine equipment retains whole parent/source/remove guards
and the coupled photoId/photoHidden choice. Tooling IQC links remain set membership;
transfer location/source validation remains the existing backend atomic guard.
No new scope split, transfer transaction or approved-view policy is added here.

## Independent review: normalized hash outcome identity

Review reproduced that a newly constructed File for the same physical contents
could bypass the first exact-File WeakMap and issue a second PUT after unknown
or confirmed outcomes. Both repository counterexamples fail before this fix
(`/tmp/tooling-file-hash-outcome-before.log`, 2/2 FAIL). Outcomes are now also
indexed by normalized payload hash within the same owner/view/generation/client.
The hash registry stores only owner/dispatched/confirmed metadata; it does not
strongly retain File or payload bytes. A new File with the same normalized hash
adopts that original outcome: unknown permits only the hash GET; confirmed reuses
the original URI. True departure/owner reset clears this RAM registry; success
retains its small outcome metadata. Late ACKs hold only their original record
reference and cannot update a replacement owner's registry record.

Final full command above: PASS 53/53 (26.4 s), including 18 File cases, original
32 grouped Tooling cases and 3 atomic route cases. Log:
`/tmp/tooling-file-hash-outcome-final.log`; scoped runtime lint and diff checks PASS.
Cross-reload/native/device/hosted limits and lack of durable photo receipts remain.

## Narrow photo error presentation follow-up

Only the three new `PHOTO_UPLOAD_RESULT_UNKNOWN`, `PHOTO_OWNER_CHANGED` and
`PHOTO_SAVE_CONTEXT_CHANGED` errors receive Tooling-local Chinese/Vietnamese
presentation text. Stored/raised error identifiers, upload outcomes, ownership
checks, receipt handling and endpoint/classifier behavior are unchanged. Their
existing read-only status button uses a status-query label without suggesting
reload; owner/context messages ask the user to check the login/draft/content and
keep the current page so its RAM File remains available. Other errors keep their
existing text and label.

Two actual lost-photo-ACK tests reproduce raw code text before this change
(`/tmp/tooling-photo-error-ui-before.log`, 2/2 FAIL). Both languages now show the
intended text while retaining the original raw identifier, File and dispatched
outcome: first Save has one PUT and no workflow POST; next Save only reads the
original hash and continues the workflow without another PUT. The fixture uses
actual Tooling-rendered error nodes with the shell's error-node move adapted to
the synthetic DOM. Native shell layout/device acceptance remains NOT_RUN.

Full affected command: `node --test tests/tooling-save-only-files.test.mjs tests/tooling-local-atomic-save.test.cjs`, PASS 55/55 (27.7 s).
Log: `/tmp/tooling-photo-error-ui-final.log`. Scoped runtime oxlint and
`git diff --check` PASS. Data-model impact: none; no new endpoint, classifier,
permission or remote/native acceptance claim.
