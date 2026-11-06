# IPQC C local gauge display

Fresh base: origin/main `339df7564091e2c46a74bb36298bbd2408a68a84` (#89/#90). Independent branch `fix/ipqc-c-local-gauge-caption-20261106`. No PR91 route-speed delta or A/B integration imported; PR91 branch untouched. All fixture data/gauge names/photos are synthetic. No hosted Site, real records, approved live snapshot, backup or diagnostic path used.

## Reproduction and root cause

On unchanged main, the actual application picker → Complete → stageLocal/patch/render path changes the local item's equipmentId from `old` to `next`, but its collapsed card shows `SYN-OLD / 01` and the old photo. The expanded card reads the same old snapshot. Browser assertion expected SYN-NEXT and failed with the actual historical old caption; no Save was sent.

The picker updates modal.fields.equipmentId and modal.fields.equipmentSnapshot. submitEditor intentionally allows equipmentId but not equipmentSnapshot in wire patches; stageLocal therefore patches the ID while retaining the prior server snapshot. equipmentListPreview preferred that snapshot unconditionally, and expanded markup read it directly. Save later refreshes the authoritative snapshot on the server, explaining why the saved display appeared correct. `lib/ipqc-c-workflow.ts` explicitly rejects equipmentSnapshot patches; adding it to the allowlist would be incorrect.

## Minimal display-only fix

`equipmentForDisplay` returns a retained snapshot only when snapshot.id matches equipmentId. Otherwise it resolves only the registry entry for that selected ID. A cleared ID renders visual inspection, and an unknown ID cannot borrow another gauge's snapshot/photo. equipmentListPreview and expanded equipmentDetailHTML use the same resolver. An unavailable registry row is display data, never permission to select/save; existing disabled picker and server checks remain.

No working, saved, formal or fixed-case snapshot is rewritten. No derived wire field, allowlist change or whole-row/child-set guard modification. Matching historical IDs retain their original stored label/photo even if current registry metadata differs. The fixed-case viewer remains unchanged. The only shell change advances the C script asset pin; no other asset pin changes.

Exact B coordination: new helpers adjacent to equipmentListPreview, its selected-equipment lookup, and the expanded item-body equipment markup. No stageLocal/submitEditor/Save/scheduler changes. Parent should preserve B's newer combined C asset pin during semantic integration. No shared auth/transport/read/storage/backend/schema edits.

## Verification

Actual browser fixture uses normal synthetic logins, current C application source, actual HTTP handlers and private SQLite/R2. It exercises public DOM picker/Complete/Save/history/version entrypoints, not a substitute implementation. Image bytes alone are synthetic fixture responses; authoritative equipment snapshot/Save remains real handler code.

- Desktop 1440×844 Chinese and narrow 390×844 Vietnamese: old retained snapshot + new selected ID, a second gauge, unrelated field edits, cancel, disabled picker choice, clearing to visual mode, reselecting, no mutation before Save, one Save, exact authoritative registry snapshot after Save, reload, unchanged formal snapshot and actual fixed-case before/after viewer.
- Pure actual display-function tests supplement those browser entrypoints for matching historical metadata, missing/disabled/cleared IDs, correct photos and no row mutation.
- Local batch contains no equipmentSnapshot patch. API regression submits one deliberately and expects UNSUPPORTED_ITEM_PATCH/422 with identical persisted state. Existing structural/equipment/guard/CAS/role/pending/receipt checks are retained.
- Required final committed-head checks: gauge browser, existing local browser, atomic API, display/case/rejection units, projection/read-recovery and source-contract suites, lint, TypeScript, source-boundary and pinned build. Exact results belong to final-head execution and CI; no physical-device or live acceptance claim.

## Separate existing legacy-field observation

The first hand-built fixture omitted optional notApplicableReason. Existing Complete defaulted it to empty but serialized a guard whose undefined value was omitted, causing INVALID_LOCAL_SAVE. This is outside the display fix; no validator or Save adapter was relaxed. The gauge fixture now explicitly includes the normal UI-created empty field. Parent/B should track legacy optional-field guard encoding separately. Current tested UI-created rows and this gauge fix do not repair that separate compatibility gap.

## Existing authority boundaries

An A→B→A local selection still displays the retained historical A snapshot when its ID matches. If registry A metadata changed, explicit Save can capture the current approved registry metadata while sequentially normalizing the journal; the preview does not promise to override that server boundary. The browser covers A→B→A before Save and exact final registry-derived metadata after Save.

Separately, a preexisting change-gauge-then-delete/full-row-guard batch can receive 409 when the server-normalized snapshot differs from the retained local snapshot. The transaction rolls back. This display-only change neither introduces nor fixes that boundary; a separate workstream owns its regression/fix. No guard relaxation, automatic retry or snapshot wire patch is used here.

No data-model or persistent-format impact. No ready/approve/merge/deploy authorization is implied.
