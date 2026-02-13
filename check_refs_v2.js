import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        console.log('Checking for any hard references to assessment_questions...');
        const { rows } = await pool.query(`
            SELECT
                conname AS constraint_name,
                conrelid::regclass AS table_name,
                a.attname AS column_name,
                confrelid::regclass AS foreign_table_name,
                af.attname AS foreign_column_name
            FROM
                pg_constraint AS c
                JOIN pg_attribute AS a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
                JOIN pg_attribute AS af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
            WHERE
                c.contype = 'f' AND confrelid = 'assessment_questions'::regclass;
        `);
        console.log('References:', rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
