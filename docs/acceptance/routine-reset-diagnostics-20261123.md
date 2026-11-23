# Reset exception-stage diagnostics (not a root-cause fix)

Base: reviewed #142 merge `173ad9be78e3ccff5975f89bcfa10da4c5d4deaa`, targeting `review/v68-reset-base-20261123`. No main/#140/schema/migration/hosting/workflow changes.

Only the existing Reset GET/POST exception handlers gain a best-effort server log. Fixed event/version, operation, stage and error category are the entire payload. Stages distinguish state read, authorization, receipt processing, target validation, reset preparation, encoding, recheck and commit. Categories are draft conflict, syntax error, type error or unknown; exception messages, stacks, names, custom codes, IDs, paths, headers, bodies and records are never serialized. No extra response fields or correlation headers are added. Logging failure is swallowed without changing existing response/status behavior. A commit-stage error alone does not establish whether the database committed.

Native Sites worker-log readback exposes source level/message and platform request metadata, including request ID and worker status/outcome. It does not expose the caught application exception automatically. After a separately reviewed publication, platform metadata can correlate the fixed log with its invocation without copying IDs into application logs. Delivery of this new log has NOT been verified hosted; this patch is not published. No Reset retry is part of this work.

Prior read-only incident evidence established unchanged durable shared-state revision and timestamp after the attempted Reset; no commit effect was observed. A missing receipt by itself is not evidence of failure. The underlying 503 cause remains unproven; no timeout or storage fault is asserted. IQC scheduling/overdue issues are separate.

Validation: six synthetic failure-injection tests exercise full state read, receipt processing, encoding, commit rejection, GET receipt failure, throwing logger and typed conflicts; their expected public responses and noncommit checks pass. Relevant Reset/Admin/enrollment/pending/restart/period suites: 233 passed, zero failed. TypeScript noEmit passed. Existing regression tests cover successful resets, per-module isolation, authorization and replay fencing. No live data, accounts, settings or credentials were used in tests.

Existing Actions jobs for this review base are pinned to PR #141/#142 and will not validate a new PR; no workflow was changed or manually dispatched. Frank remains final reviewer. Review/publication and any subsequent live diagnostic action remain separate from this source-only draft.
