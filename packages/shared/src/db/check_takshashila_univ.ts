import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../../.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkUniv() {
    try {
        const { rows } = await pool.query("SELECT * FROM universities WHERE id = '2d93e269-4242-4db9-9907-682c98b699e2'");
        console.log('--- Takshashila Univ Record ---');
        console.log(rows[0]);

    } catch (err: any) {
        console.error('Check failed:', err.message);
    } finally {
        await pool.end();
    }
}

checkUniv();
