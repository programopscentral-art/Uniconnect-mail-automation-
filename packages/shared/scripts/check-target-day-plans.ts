import { Pool } from 'pg';

const url = 'postgresql://neondb_owner:npg_47uYdBVDTxXq@ep-raspy-field-adz2oa26.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: url });

async function check() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query("SELECT title FROM day_plans LIMIT 20");
        console.log('Target Day Plans:', JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

check();
