import { db } from './packages/shared/src/db/client';

async function createPracticalsTable() {
    console.log('Creating assessment_practicals table...');
    await db.query(`
        CREATE TABLE IF NOT EXISTS assessment_practicals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            subject_id UUID NOT NULL REFERENCES assessment_subjects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    console.log('Table created!');
}

createPracticalsTable().finally(() => process.exit());
