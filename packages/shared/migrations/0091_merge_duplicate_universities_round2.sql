-- ─────────────────────────────────────────────────────────────────────────
-- Merge 9 duplicate universities (round 2) re-created by fee_import after
-- migration 0089. Same structure as 0089 — additive only, idempotent.
-- ─────────────────────────────────────────────────────────────────────────
-- Root cause: fee_import.ts:findOrCreateUniversity() auto-creates a new
-- universities row whenever the fuzzy matcher fails. Fee sheets keep
-- arriving with name variations ("ADYPU", "KKH (sem 5)", "Yennapoya",
-- "amet term 2 & 3", etc.) and each one created a new row.
--
-- This migration cleans up those 9 rows. A companion code fix in
-- fee_import.ts removes the auto-create behavior so this can't recur.
--
-- Pairs (source → target):
--   ADYPU                  → Ajeenkya DY Patil University
--   CIET&CITY-Chalapathi   → CITY& CIET
--   NIU                    → Noida International University
--   Takshasila             → Takshashila University
--   amet term 2 & 3        → AMET
--   MRV                    → Mallareddy
--   Yennapoya              → Yenepoya
--   Taksahashila           → Takshashila University
--   KKH (sem 5)            → KKH Hyderabad
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
    pairs CONSTANT TEXT[][] := ARRAY[
        -- source (delete)                          target (keep)
        ['b830537e-53f3-4a84-bd9a-249848d6f510', 'f4f3915c-bb8d-42b3-a756-219d9a5f9c2b'],  -- ADYPU → Ajeenkya DY Patil
        ['9783f36e-a9ee-4b0c-bae0-552fcb58d036', '34320c82-ccd8-444a-ace2-8c8bc62b1294'],  -- CIET&CITY-Chalapathi → CITY& CIET
        ['28a30d6e-3481-43ee-8607-2057d73739c3', 'd0aed78f-0d86-45a0-8943-d7d17133755c'],  -- NIU → Noida International
        ['bd2e60e7-d0c0-4fc5-85de-c2988909bf47', '2d93e269-4242-4db9-9907-682c98b699e2'],  -- Takshasila → Takshashila University
        ['ea60d8fc-fcfe-44a0-b0df-553dd5db83c1', '0b67ea9a-024b-4420-99cb-8134e35011c3'],  -- amet term 2 & 3 → AMET
        ['9bda13c7-a5ee-49bc-bb75-36e474dd1d14', '7267bddd-0d75-4c7c-a25a-e9f8dd303869'],  -- MRV → Mallareddy
        ['7998db8b-3639-4b9e-b5fc-a4cdb0e0a205', 'c38f8d81-cf61-4be8-a738-b53f32b96052'],  -- Yennapoya → Yenepoya (typo)
        ['b5ffce90-6c8d-42d4-b4f4-c290336ad2e2', '2d93e269-4242-4db9-9907-682c98b699e2'],  -- Taksahashila → Takshashila (typo)
        ['a7a5997b-c921-47c7-ba4b-26b5cb11e9f2', '64a0e9d5-af34-4d19-9ffb-51a6bd8ef4c2']   -- KKH (sem 5) → KKH Hyderabad
    ];
    v_src UUID;
    v_tgt UUID;
    i     INT;
BEGIN
    FOR i IN 1..array_length(pairs, 1) LOOP
        v_src := pairs[i][1]::uuid;
        v_tgt := pairs[i][2]::uuid;

        -- ─── Fee tables (same pattern as 0089) ────────────────────────────

        -- 1. fee_student_payments: drop conflicts (target's data wins), move the rest
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

        -- 2. fee_payment_transactions
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

        -- ─── Other operational tables that might have rows ───────────────
        -- Use UPDATEs (no-op if 0 rows match). Tables with CASCADE on delete
        -- would lose data if we relied on cascade; explicit moves preserve.

        UPDATE students            SET university_id = v_tgt WHERE university_id = v_src;
        UPDATE campaigns           SET university_id = v_tgt WHERE university_id = v_src;
        UPDATE user_universities
           SET university_id = v_tgt
         WHERE university_id = v_src
           AND NOT EXISTS (
               SELECT 1 FROM user_universities uu2
               WHERE uu2.user_id = user_universities.user_id
                 AND uu2.university_id = v_tgt
           );
        DELETE FROM user_universities WHERE university_id = v_src;

        -- ─── ops_os.campus_dim: re-point to canonical (NO ACTION FK) ─────
        -- If a campus_dim row already exists for the target, drop the
        -- duplicate; otherwise re-point.
        DELETE FROM ops_os.campus_dim cd
         WHERE cd.university_id = v_src
           AND EXISTS (
               SELECT 1 FROM ops_os.campus_dim cd2
               WHERE cd2.university_id = v_tgt
           );
        UPDATE ops_os.campus_dim
           SET university_id = v_tgt
         WHERE university_id = v_src;

        -- 5. Delete the duplicate universities row.
        DELETE FROM universities WHERE id = v_src;
    END LOOP;
END $$;

-- Post-merge assertion: the 9 source IDs must not exist anymore.
DO $$
DECLARE
    remaining INT;
BEGIN
    SELECT COUNT(*) INTO remaining
      FROM universities
     WHERE id IN (
        'b830537e-53f3-4a84-bd9a-249848d6f510',
        '9783f36e-a9ee-4b0c-bae0-552fcb58d036',
        '28a30d6e-3481-43ee-8607-2057d73739c3',
        'bd2e60e7-d0c0-4fc5-85de-c2988909bf47',
        'ea60d8fc-fcfe-44a0-b0df-553dd5db83c1',
        '9bda13c7-a5ee-49bc-bb75-36e474dd1d14',
        '7998db8b-3639-4b9e-b5fc-a4cdb0e0a205',
        'b5ffce90-6c8d-42d4-b4f4-c290336ad2e2',
        'a7a5997b-c921-47c7-ba4b-26b5cb11e9f2'
     );
    IF remaining <> 0 THEN
        RAISE EXCEPTION 'Merge failed: % duplicate universities still exist', remaining;
    END IF;
END $$;

COMMIT;
