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
        const { rows: roles } = await pool.query("SELECT * FROM role_permissions");
        console.log('--- Role Permissions ---');
        console.log(roles);

        const boaRole = roles.find(r => r.role === 'BOA');
        if (boaRole) {
            console.log('\nBOA Role found with features:', boaRole.features);
        } else {
            console.log('\nBOA Role NOT FOUND in role_permissions table.');
        }

    } catch (err: any) {
        console.error('Check failed:', err.message);
    } finally {
        await pool.end();
    }
}

checkRolePermissions();
