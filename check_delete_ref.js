import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        console.log('Checking foreign keys referencing assessment_questions...');
        const { rows } = await pool.query(`
            SELECT
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name='assessment_questions';
        `);
        console.log('FKs referencing assessment_questions:', rows);

        console.log('\nChecking for any papers using these topics...');
        // Just checking if papers table exists and what it has
        const { rows: papersCols } = await pool.query(`
            SELECT column_name FROM information_schema.columns WHERE table_name = 'assessment_papers';
        `);
        console.log('Papers columns:', papersCols.map(c => c.column_name));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
