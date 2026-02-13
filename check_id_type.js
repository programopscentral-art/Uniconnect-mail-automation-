import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'assessment_questions' AND column_name = 'id'
        `);
        console.log('ID Column:', res.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
