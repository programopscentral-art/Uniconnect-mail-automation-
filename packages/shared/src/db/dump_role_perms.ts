import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../../.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkRolePermissions() {
    try {
        const { rows: roles } = await pool.query("SELECT role, features FROM role_permissions");
        console.log('--- All Role Permissions ---');
        roles.forEach(r => {
            console.log(`Role: ${r.role}`);
            console.log(`Features: ${JSON.stringify(r.features)}`);
            console.log('---------------------------');
        });

    } catch (err: any) {
        console.error('Check failed:', err.message);
    } finally {
        await pool.end();
    }
}

checkRolePermissions();
