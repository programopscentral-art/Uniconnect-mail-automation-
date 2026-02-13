import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const { rows: tables } = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        `);
        console.log('Tables:', tables.map(t => t.table_name).join(', '));

        const { rows: columns } = await pool.query(`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_name IN ('assessment_questions', 'assessment_course_outcomes', 'course_outcomes');
        `);
        console.log('Columns:', columns);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
