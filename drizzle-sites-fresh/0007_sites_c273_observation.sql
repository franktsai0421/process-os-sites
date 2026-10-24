-- One consumed observation slot, not an authentication or reusable grant table.
CREATE TABLE process_import_c273_observation (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id=1),
 case_sha TEXT NOT NULL, program_commit TEXT NOT NULL, claim_nonce TEXT NOT NULL,
 issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, claimed_at INTEGER NOT NULL,
 finished_at INTEGER, state TEXT NOT NULL CHECK(state IN ('claimed','finished')),
 r2_get_reserved INTEGER NOT NULL CHECK(r2_get_reserved=1), receipt TEXT,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+600000),
 CHECK(receipt IS NULL OR json_valid(receipt))
);
