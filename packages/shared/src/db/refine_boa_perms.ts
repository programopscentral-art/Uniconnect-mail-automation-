import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../../.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function refineBOAPerms() {
    try {
        // Standard BOA: Only Dashboard, Analytics, Tasks, Day-Plan
        const standardBOAFeatures = [
            "dashboard",
            "tasks",
            "analytics",
            "day-plan"
        ];

        console.log('--- Refining BOA role permissions to standard set ---');
        await pool.query(
            "UPDATE role_permissions SET features = $1 WHERE role = 'BOA'",
            [JSON.stringify(standardBOAFeatures)]
        );
        console.log('Standard BOA permissions applied.');

        // Verify
        const { rows: updated } = await pool.query("SELECT role, features FROM role_permissions WHERE role = 'BOA'");
        console.log('\n--- Final Base BOA Permissions ---');
        console.log(JSON.stringify(updated[0], null, 2));

    } catch (err: any) {
        console.error('Refinement failed:', err.message);
    } finally {
        await pool.end();
    }
}

refineBOAPerms();
