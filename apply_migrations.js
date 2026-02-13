import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function runMigrations() {
    try {
        console.log('Running migration 0040...');
        await pool.query(`ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'MEDIUM';`);

        console.log('Running migration 0041...');
        await pool.query(`
            ALTER TABLE assessment_questions 
            ADD COLUMN IF NOT EXISTS image_url TEXT,
            ADD COLUMN IF NOT EXISTS explanation TEXT,
            ADD COLUMN IF NOT EXISTS answer_key TEXT,
            ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT false;
        `);

        // Bonus: change marks to numeric to support half marks if it's integer
        console.log('Updating marks column to NUMERIC...');
        await pool.query(`ALTER TABLE assessment_questions ALTER COLUMN marks TYPE NUMERIC;`);

        console.log('Migration completed successfully!');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}
runMigrations();
