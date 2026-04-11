-- Create a globally-unique, system-wide receipt number sequence.
-- Every receipt number is unique across ALL schools, forever.
-- Using a native PostgreSQL SEQUENCE is the industry-standard approach:
--   - Atomic: nextval() is lock-free and collision-proof under any concurrency
--   - Global: single counter for the entire platform, not per-school or per-year
--   - No gaps on success: each nextval() consumes a slot even if the transaction later rolls back
--
-- Why not COUNT()-based? COUNT() inside a transaction still races under
-- concurrent requests (two reads see the same count before either commits),
-- requiring Serializable isolation just for receipt numbering. A SEQUENCE
-- is designed for exactly this problem and needs no special isolation level.

CREATE SEQUENCE IF NOT EXISTS receipt_number_seq;

-- Seed the sequence above the highest receipt number already in the database
-- so existing production records are never re-issued.
-- Existing format is RCP-NNNNN; we extract the numeric suffix.
-- setval(seq, n, true) means the NEXT nextval() call returns n+1.
-- If no receipts exist yet, COALESCE returns 0 → next receipt is RCP-00001.
SELECT setval(
  'receipt_number_seq',
  COALESCE(
    (
      SELECT MAX(CAST(SUBSTRING(receipt_number FROM 5) AS INTEGER))
      FROM   fee_payments
      WHERE  receipt_number ~ '^RCP-[0-9]+$'
        AND  deleted_at IS NULL
    ),
    0
  ),
  true   -- is_called=true: next nextval() returns this value + 1
);
