import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../../.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixPermissions() {
    try {
        // Define standard University Person features
        const univFeatures = [
            "dashboard",
            "tasks",
            "students",
            "analytics",
            "mailboxes",
            "templates",
            "campaigns",
            "assessments"
        ];

        console.log('--- Updating BOA role permissions ---');
        await pool.query(
            "UPDATE role_permissions SET features = $1 WHERE role = 'BOA'",
            [JSON.stringify(univFeatures)]
        );
        console.log('BOA permissions updated.');

        console.log('\n--- Ensuring UNIVERSITY_OPERATOR has everything ---');
        await pool.query(
            "UPDATE role_permissions SET features = $1 WHERE role = 'UNIVERSITY_OPERATOR'",
            [JSON.stringify([...univFeatures, "users", "universities"])]
        );
        console.log('UNIVERSITY_OPERATOR updated.');

        // Verify
        const { rows: updated } = await pool.query("SELECT role, features FROM role_permissions WHERE role IN ('BOA', 'UNIVERSITY_OPERATOR')");
        console.log('\n--- Final Permissions ---');
        console.log(JSON.stringify(updated, null, 2));

    } catch (err: any) {
        console.error('Fix failed:', err.message);
    } finally {
        await pool.end();
    }
}

fixPermissions();
