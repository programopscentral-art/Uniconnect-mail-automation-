-- ─────────────────────────────────────────────────────────────────────────
-- Merge 6 duplicate universities created on 2026-05-21 by a stale import.
-- ─────────────────────────────────────────────────────────────────────────
-- Each duplicate has no students/campaigns/recipients/programs/etc.
-- The only data attached is fee tables (1708 student_payments, 1167
-- transactions, 220 daily_log rows, 5 university_meta rows total).
--
-- Strategy per pair (source → target):
--   1. fee_student_payments: UNIQUE (period_id, zoho_user_id) is uni-independent.
--      Drop source rows where (period, student) already exists on target
--      (target's row wins — it's the older, authoritative copy). Move the rest.
--   2. fee_payment_transactions: same approach with UNIQUE (zoho_user_id,
--      payment_date, period_id).
--   3. fee_daily_log: UNIQUE (period_id, university_id, date). Daily totals
--      are additive, so INSERT ... ON CONFLICT DO UPDATE summing amounts.
--   4. fee_university_meta: UNIQUE (period_id, university_id). Move only
--      where target doesn't already have a row for that period; drop the rest.
--   5. DELETE the duplicate universities row. All remaining FK children
--      (zero rows per the pre-audit) cascade harmlessly.
--
-- Idempotent: re-running is a no-op because the source IDs no longer exist
-- after the first successful run (DELETE/UPDATE matches zero rows).
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
    pairs CONSTANT TEXT[][] := ARRAY[
        -- source (delete)                          target (keep)
        ['bce17c4b-7a55-4efc-a1bb-237964be6796', 'f4f3915c-bb8d-42b3-a756-219d9a5f9c2b'],  -- ADYPU → Ajeenkya DY Patil University
        ['51aad9b1-e522-4cb0-9810-767e9ec479fd', '0b67ea9a-024b-4420-99cb-8134e35011c3'],  -- amet term 2 & 3 → AMET
        ['ba64ca53-872c-491e-8b2e-7732ca2d273a', '34320c82-ccd8-444a-ace2-8c8bc62b1294'],  -- CIET&CITY-Chalapathi → CITY& CIET
        ['204b17f9-2ba4-44dc-ab4e-09b8bac0d3de', '7267bddd-0d75-4c7c-a25a-e9f8dd303869'],  -- MRV → Mallareddy
        ['c832b1d2-5224-47c9-8f57-b64f468717d7', 'd0aed78f-0d86-45a0-8943-d7d17133755c'],  -- NIU → Noida International University
        ['129c7042-b90f-47a3-8e05-cceae19a6b29', '2d93e269-4242-4db9-9907-682c98b699e2']   -- Takshasila → Takshashila University
    ];
    v_src UUID;
    v_tgt UUID;
    i     INT;
BEGIN
    FOR i IN 1..array_length(pairs, 1) LOOP
        v_src := pairs[i][1]::uuid;
        v_tgt := pairs[i][2]::uuid;

        -- 1. fee_student_payments: drop conflicts, move the rest
        DELETE FROM fee_student_payments sp
        WHERE sp.university_id = v_src
          AND EXISTS (
              SELECT 1 FROM fee_student_payments tp
              WHERE tp.university_id = v_tgt
                AND tp.period_id = sp.period_id
                AND tp.zoho_user_id = sp.zoho_user_id
          );
        UPDATE fee_student_payments
           SET university_id = v_tgt, updated_at = NOW()
         WHERE university_id = v_src;

        -- 2. fee_payment_transactions: drop conflicts, move the rest
        DELETE FROM fee_payment_transactions tx
        WHERE tx.university_id = v_src
          AND EXISTS (
              SELECT 1 FROM fee_payment_transactions tt
              WHERE tt.university_id = v_tgt
                AND tt.zoho_user_id = tx.zoho_user_id
                AND tt.payment_date = tx.payment_date
                AND tt.period_id = tx.period_id
          );
        UPDATE fee_payment_transactions
           SET university_id = v_tgt
         WHERE university_id = v_src;

        -- 3. fee_daily_log: sum amounts on (period, target, date) conflict
        INSERT INTO fee_daily_log
               (period_id, university_id, date, amount, students_count, notes, created_by)
        SELECT  period_id, v_tgt,         date, amount, students_count, notes, created_by
          FROM fee_daily_log
         WHERE university_id = v_src
        ON CONFLICT (period_id, university_id, date) DO UPDATE
           SET amount         = fee_daily_log.amount + EXCLUDED.amount,
               students_count = fee_daily_log.students_count + EXCLUDED.students_count,
               updated_at     = NOW();
        DELETE FROM fee_daily_log WHERE university_id = v_src;

        -- 4. fee_university_meta: move non-conflicting periods, drop the rest
        UPDATE fee_university_meta
           SET university_id = v_tgt, updated_at = NOW()
         WHERE university_id = v_src
           AND period_id NOT IN (
               SELECT period_id FROM fee_university_meta WHERE university_id = v_tgt
           );
        DELETE FROM fee_university_meta WHERE university_id = v_src;

        -- 5. Delete the duplicate universities row.
        -- Remaining FK children (students/campaigns/etc.) are zero rows
        -- per the pre-merge audit; CASCADE is harmless.
        DELETE FROM universities WHERE id = v_src;
    END LOOP;
END $$;

-- Post-merge assertion: the 6 source IDs must not exist anymore.
DO $$
DECLARE
    remaining INT;
BEGIN
    SELECT COUNT(*) INTO remaining
      FROM universities
     WHERE id IN (
        'bce17c4b-7a55-4efc-a1bb-237964be6796',
        '51aad9b1-e522-4cb0-9810-767e9ec479fd',
        'ba64ca53-872c-491e-8b2e-7732ca2d273a',
        '204b17f9-2ba4-44dc-ab4e-09b8bac0d3de',
        'c832b1d2-5224-47c9-8f57-b64f468717d7',
        '129c7042-b90f-47a3-8e05-cceae19a6b29'
     );
    IF remaining <> 0 THEN
        RAISE EXCEPTION 'Merge failed: % duplicate universities still exist', remaining;
    END IF;
END $$;

COMMIT;
