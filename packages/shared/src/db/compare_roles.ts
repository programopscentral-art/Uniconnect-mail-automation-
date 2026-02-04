import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../../.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function compareRoles() {
    try {
        const { rows: roles } = await pool.query("SELECT role, features FROM role_permissions WHERE role IN ('BOA', 'UNIVERSITY_OPERATOR', 'ADMIN', 'PROGRAM_OPS')");
        console.log('--- Target Role Permissions ---');
        console.log(JSON.stringify(roles, null, 2));

    } catch (err: any) {
        console.error('Check failed:', err.message);
    } finally {
        await pool.end();
    }
}

compareRoles();
