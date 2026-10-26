# Input and read-only viewer lifecycle — local candidate

PROCESS equipment search retains the existing input and updates only the
existing result region. Interim composition events do not rebuild results;
completion adopts a changed final value once. Deferred repaint scroll/focus is
bound to the exact rendered root, input/dialog and delivery generation. Existing
filter matching, editor actions, menus and layout are unchanged.

IQC search suppresses a duplicate composition-end/input refresh for an identical
value. Search normalization and result-list size are not changed.

IQC read-only photo viewers now dispose their owned key/button handlers and
image source attributes before removing their nodes on delivery invalidation or
clean navigation reset. Repeated disposal and retained old callbacks are inert.
Same-ID identity changes and reload-required state invalidate old ownership.
A forbidden target does not dispose the still-authorized current viewer.

This is viewer-only cleanup, not editing-dialog cleanup. Editor close/reset,
unsaved input, shared-draft transports, unknown-operation receipts and actor-owned
recovery storage are not cleared. Editing overlays need a separate preservation
and quarantine design before any forced invalidation treatment.

Focused tests execute actual functions and the directly relevant application
invalidation cascade with synthetic DOM/storage/fetch ports. They do not certify
physical Chinese/Vietnamese IME, browser focus/layout, real image latency, heap
usage, all large lists or real Site performance. Real speed acceptance remains
not passed. This candidate is not published and contains no backup-strategy,
authentication, schema, business-data or server-read dependency changes.

For the subsequent integrated local IQC editor containment and mutation-admission scope, see [integrated read/input notes](INTEGRATED_READ_INPUT_20261026.md). This does not extend viewer-only evidence to all editors.
