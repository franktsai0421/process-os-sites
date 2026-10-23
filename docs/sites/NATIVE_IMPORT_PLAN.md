# Native import transport: preparation, not hosted acceptance

The owner rejected the browser upload as the primary workflow on 2026-10-23.
Keep the existing 275,566,702-byte handoff and original snapshots unchanged.
Do not start a second uploader until the old browser sender is confirmed closed
and the last durable request/receipt has been reconciled. Never reset its lock.

## Evidence

At 10:37:37.792Z the deployed import `POST action=batch` returned 401 in 204 ms;
the following `GET action=budget-status` returned 401 in 209 ms. The log's transfer
ID is redacted/unavailable, so exact transfer correlation is not claimed. The
parent's durable ledger has 41 completed admissions (begin plus 40 batches),
581 charged R2 calls including the manifest, and no active request. The first
40 planned batches contain 580 chunks / 20,819,696 bytes. The next batch is only
271,992 bytes before framing. This boundary is not the first large-body request.
Login sessions have a fixed eight-hour expiry; expiration versus another invalid
identity cause cannot be proved without a user-facing fresh login. Do not read
the existing cookie or reset Frank's password to answer that question.

The browser uploader stops on this HTTP refusal, then tries a ten-second bounded
budget read and clears busy state. Its stop button is disabled when not busy.
Without the actual current DOM, an already-stopped error state is a supported
explanation for an apparently unresponsive stop button, not a confirmed UI fact.
File reading/hash/gzip are not cancellable mid-operation; request fetches have
an abort signal but no ordinary per-request deadline. Do not describe either as
the cause of the recorded 401.

## Local implementation allowed now

- `snapshot-native-source.mjs` reads only explicit handoff members from the two
  existing folders, bounded to 16 MiB metadata / 1 MiB chunks. It reuses all
  browser handoff pin, alias, checksum and incomplete-package checks. No payload
  copy, credential lookup or global fetch is installed. A trusted caller must
  provide the transport; this is not yet a usable authenticated remote CLI.
- A single batch's R2 puts use four workers within the same durable reservation.
  Every mutation still checks the existing durable fence. On failure, no new
  work is scheduled and already-started writes are awaited before budget failure
  handling. Receipts are written only after every put succeeds. No multi-request
  concurrency, extra budget, refund, deletion or changed activation rule.

## Authorization design requiring parent review before implementation

Sites native tools do not expose general business D1/R2 bulk import. Source Git
credentials are not data credentials. A standalone client needs BOTH:

1. A platform-supported route through the existing private Sites entry. The
   explicit native SIWC bearer-token operation can serve identity-less requests,
   but requires a user's specific request, creates/rotates a credential and may
   have broader entry scope than this import. Do not call it based on generic
   upload approval. No public-audience change is proposed.
2. A separately approved application import capability: random independent
   credential, exact project/origin/owner/target/manifest/transfer, short absolute
   expiry, only configuration/status/batch/verify/audit/copy/restore actions.
   No general identity, data export, account edits, retirement or activation.
   Authentication must fail closed if its pins, owner status/role/export permission
   or expiry are wrong. It must use the SAME budget/retirement/receipt service,
   not manufacture an owner session or use the session signing secret. Exact
   provisioning/storage/revocation and private tool-to-tool delivery need review
   before adding this new auth entry point. No real secret is generated now.

After approval, a CLI can consume both credentials through bounded stdin only,
retain them in memory, send exact-origin requests with redirects/cookies refused,
and redact errors to stable codes. No secret argv, files, console, source or
environment dump. One authenticated read-only handshake must prove both layers
before any data mutation. SIGINT/deadlines stop further sends; after an uncertain
write, bounded read-only reconciliation is required before an explicit resume.
No automatic retry for quota/payment/permission, auth or uncertain writes.

## Validation and live transition gates

Synthetic checks: exact bytes/pins, corrupt/missing/path/incomplete refusals,
bounded concurrency, failure drain, lost ACK, budget/fence races, origin and
capability expiry/scope/revocation, cancellation/deadline/readback, redirect
refusal, log/argv secret exclusion, owner verifier preservation and activation
remaining closed until full audit. Add required type/build/compiled checks for
the final reviewed version; fixture success is not native hosted acceptance.

Only after the browser is confirmed closed and no request remains: inspect the
same campaign's durable status/receipts, preserve confirmed chunks, and explicitly
resume missing chunks with the SAME pinned handoff. Never restart begin as a new
campaign or use budget debits as confirmed-byte progress. New auth/source changes
require review/PR and parent-coordinated publication before any live attempt.
