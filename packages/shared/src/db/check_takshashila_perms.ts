import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../../.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkPermissions() {
    const univId = '2d93e269-4242-4db9-9907-682c98b699e2';
    try {
        const { rows: users } = await pool.query("SELECT id, email, role, permissions FROM users WHERE university_id = $1", [univId]);
        console.log(`--- Users for Takshashila (${univId}) ---`);
        users.forEach(u => {
            console.log(`${u.email}: role=${u.role}, permissions=${JSON.stringify(u.permissions)}`);
        });

        const { rows: univ } = await pool.query("SELECT * FROM universities WHERE id = $1", [univId]);
        console.log('\n--- University Config ---');
        console.log(univ[0]);

    } catch (err: any) {
        console.error('Check failed:', err.message);
    } finally {
        await pool.end();
    }
}

checkPermissions();
