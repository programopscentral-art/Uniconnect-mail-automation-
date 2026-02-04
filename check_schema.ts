import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkSchema() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'assessment_templates'
        `);
        console.log('--- Columns in assessment_templates ---');
        rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

        const { rows: migrations } = await client.query('SELECT name FROM _migrations');
        console.log('\n--- Applied Migrations ---');
        migrations.forEach(m => console.log(m.name));
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkSchema();
