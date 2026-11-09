# Current canvas projection count

The stage header counted state.editorByCategory, while V2 cards call ProcessCanvasLocal.project. A normal Save can advance projectionBase without replacing the held editor copy; the header therefore stayed stale even after a redraw. This batch counts exactly the current projected rows for the same allowed category stages. It does not write, save, load, reset the journal or change snapshots/roles.

Product scope is editor-line-selection.js plus its own index cache tag. Legacy/unloaded V2 paths retain caller-provided counts. Hidden stages remain excluded; current local additions/deletions count like visible cards; Chinese/Vietnamese labels are unchanged.

The actual editor and selector functions plus CanvasJournal reproduce three failed count cases on main d4ac309; after repair all four cases pass, including the unchanged legacy path. These are synthetic VM assertions, not browser or real-data timing. The existing line-selection CPU script initially fails on main because its sandbox has no window alias; the fixture now mirrors the browser and its original assertions pass.

The one cache tag change needs an exact source-composition layer for Routine FQC. The count helper pins the raw current selector/index pair and exact d4ac309 preimages, projects only that exact cache tag for the original strict Routine checks, and does not restore or execute old code. Original Routine hashes, ancestry and negative assertions stay. New tests reject rollback, byte drift, non-Buffer input and EOL changes beyond independently pinned committed raw bytes. Functional acceptance stays separate from source evidence.

No API, storage/schema migration, permission, business data or deployment change. Do not claim the full platform step-count or live acceptance is complete from this narrow header fix. CI, independent review, browser/iPhone and live Site status must be reported at the actual candidate head.
