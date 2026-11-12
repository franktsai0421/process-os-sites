# Product selection retention: latest requirement and bounded audit

Frank's latest requirement supersedes any opposite product-switch rule: switching products inside the same module retains unsaved edits and photos; leaving to another module (for example FQC) abandons unsent input. Selection must not write, submit, restore an archived form, or overwrite saved/pending/approved records. Original unknown-operation receipts remain protected.

At `04c807f`, the inspected product entry points already retain their in-memory data; no product handler rewrite is justified by this audit:

- IPQC C's actual `data-ipqcc-product` handler changes only selection IDs and redraws. Switching A→B→A preserves the module working rows, per-product media and the current modal's unsent fields/photos. Module reset clears unsent working/modal state but leaves the transport object and original receipt identity alone.
- The process operation modal's actual `data-work-product-select` handler changes `m.product` and repaints. Per-product notes, steps and photos remain in the same draft. It does not complete the block or Save.
- Product selection is not the same action as changing a Canvas line/stage. The latter existing rules/tests were not silently broadened by this audit. If those views are also intended to retain unsent work, they require their own explicit boundary review.

Validation: `node --test tests/module-product-retention-contract.test.mjs tests/process-editor-departure.test.mjs tests/editor-selection-departure.test.mjs` passes **34/34**, zero skipped. Three behavioral cases execute uniquely selected actual handler/reset bodies in VM contexts, checking per-product fields/photos and no saved-content mutation. A fourth source assertion checks that the actual redraw/repaint functions keep the same draft references and contain no direct draft-reset/clear calls. The new test file is included in the existing Process platform integration CI command. Existing form-departure and checked line/stage handoff tests also pass unchanged. `git diff --check` passes.

Limits: this is not a complete native-browser click/upload test, photo upload-in-flight test, every module navigation route, or physical-device acceptance. The redraw and shell routing are not executed by the new small handler tests. Further quality-branch (#105–107) changes require checking their actual heads. Do not label the entire website compliant solely from this bounded audit. No runtime source or source-contract hash changed; no backups, data writes, merge or deployment occurred.
