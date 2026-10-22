-- Dedicated store. Local opt-in fixture only; production migration NOT applied.
CREATE TABLE IF NOT EXISTS web_feedback_store (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL);
INSERT OR IGNORE INTO web_feedback_store VALUES (1,0,'{"issues":[],"attachments":[],"batches":[],"handoffs":[]}');
