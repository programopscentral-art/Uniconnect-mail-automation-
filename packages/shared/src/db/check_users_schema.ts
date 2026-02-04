import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../../.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        const { rows: columns } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'");
        console.log('--- Columns in users table ---');
        columns.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));

        const { rows: sample } = await pool.query("SELECT * FROM users LIMIT 1");
        console.log('\n--- Sample User Row ---');
        console.log(sample[0]);

    } catch (err: any) {
        console.error('Check failed:', err.message);
    } finally {
        await pool.end();
    }
}

checkSchema();
