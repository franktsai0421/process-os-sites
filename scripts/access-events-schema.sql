-- Candidate only: explicitly applied to owned synthetic fixtures. No live or
-- standard migration adoption until retention/activation policy is confirmed.
CREATE TABLE access_events (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL,
 module TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 action TEXT NOT NULL,
 occurred_at INTEGER NOT NULL,
 received_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('unknown','receipt-confirmed')),
 verified_at TEXT,
 status TEXT NOT NULL CHECK(status IN ('open','handled')),
 version INTEGER NOT NULL,
 notes TEXT NOT NULL,
 history TEXT NOT NULL,
 update_receipts TEXT NOT NULL,
 UNIQUE(actor_id,module,operation_id)
);
CREATE INDEX access_events_status_cursor ON access_events(status,id);
