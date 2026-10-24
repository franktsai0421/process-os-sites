# Owner-session continuous verification (local implementation)

Entry: `/setup/import?continue=verify`. Normal owner login/master.export and
same-origin protections remain in the existing API. Login once; the normal
session expires after8h and must never be extracted or silently extended.
No file selection, API key, native grant registration/replacement or repeated
human batch approval is involved. The client derives the pinned transfer ID,
fresh-reads configuration and durable transfer state, then automatically verifies
and audits until `sealed`. It never calls begin/upload/copy/restore/activate.

The server already hashes the data. This change keeps16-object windows/CAS and
the existing audit limits unchanged; it improves continuous operation and removes
the extra native credential/host review lifecycle, not provider speed. No queue
or background execution is installed. Closing the page stops subsequent sends;
a new run first reads durable progress. Normal application use does not run this
one-time migration verifier.

Budget compatibility: owner dispatch still calls the original budget.run. Its
atomic active_request claim, policy/expiry checks, charges, stopped state and
retirement fencing remain. Native grants/requests/history are not edited. Owner
POST verify/audit replies add only the already-authorized post-release budget
status. Client requires open/no in-flight before advancing. Active recovery mode
still rejects owner mutations; this UI cannot bypass it. An open/null-lock state
must be fresh-read, not inferred from this document's historic21/288 checkpoint.

One client permits one run; the durable server lock also rejects parallel pages.
POST deadline120s, GET10s. Stop aborts immediately even if the HTTP provider ignores
the signal; reconciliation is bounded to2 read-only GETs (budget plus appropriate
transfer/audit status). Ambiguous/malformed/contradictory mutations stop, never
automatically replay. Reopening requires fresh status and still refuses a stopped
or active budget. No lock clearing or expiry override exists.

Local evidence:8 owner-client cases;3 actual SQLite budget/native-history cases;
18 existing transfer and20 activation/audit cases; full types and actual build.
The last two suites use synthetic data; their restore/activation tests do not
grant or imply live activation. Seven compiled Worker/actual D1/R2 groups pass:
normal login/HTML entry/288 state; unauthorized/nonowner/demo/expired/changed epoch
and cross-site refusal; active/stopped locks; revocation after first window;
lost ACK/Stop/reload/continuous sealing with native history retained; required
retirement; active recovery refusing owner mutation. The isolated fixtures have
no remote bindings or real credentials. No production code changed in this
additional validation round. This code is not published.

The sandbox initially refused the fixture's127.0.0.1 connection with EACCES;
formal exec escalation for the same Node/file/loopback was approved and used.
No firewall/ACL/port/executor/guard change was made. The first completed run
exposed a test-only comparison of D1 response metadata timings; comparing all
result rows instead preserves the complete native-history assertion.

Desktop/mobile visual QA is NOT performed: the current test fixture uses a
synthetic logical origin through dispatchFetch and disposes on completion, with
no retained same-origin authenticated browser preview. HTTP200/HTML is not a
rendering or physical iOS acceptance claim.

Single owner-only PR allowlist: this document, snapshot-owner-verifier.mjs,
verify-client.tsx, setup/import/page.tsx, snapshots/import/route.ts, two owner test
files, sites-owner-continuation-native.test.mjs and the Local safety test-command
addition. Do not include abandoned v21
replacement/prototype changes or their documents/receipts. No dependency, schema,
credentials, original3000/R1 or live data change belongs to this PR.

After review and authorized PR/CI/private publication, verify with a normal owner
session and fresh pinned state. One Start runs continuously; only actual failure,
expiry or Stop interrupts. Live data materialization/restore/activation remain a
separate decision after full verification/audit. Preserve Frank's current password.
