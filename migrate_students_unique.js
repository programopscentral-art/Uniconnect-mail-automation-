import { db } from './packages/shared/src/db/client';

async function migrate() {
    try {
        console.log('Allowing duplicate emails for students (supporting siblings)...');

        // 1. Drop the unique constraint on (university_id, email)
        await db.query(`ALTER TABLE students DROP CONSTRAINT IF EXISTS students_university_id_email_key`);

        // 2. Ensure university_id, external_id is unique instead
        // We use a manual index check to avoid errors if it already exists
        await db.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_university_external_id_unique') THEN
                    ALTER TABLE students ADD CONSTRAINT students_university_external_id_unique UNIQUE (university_id, external_id);
                END IF;
            END $$;
        `);

        console.log('Migration successful.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        process.exit();
    }
}

migrate();
