import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const HARDCODED_DB_URL = "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || HARDCODED_DB_URL,
});

async function checkTemplates() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT id, name, university_id, status, exam_type FROM assessment_templates');
        console.log('--- Current Assessment Templates ---');
        console.table(rows);

        const { rows: unis } = await client.query('SELECT id, name FROM universities');
        console.log('\n--- Universities ---');
        console.table(unis);
    } finally {
        client.release();
        await pool.end();
    }
}

checkTemplates();
