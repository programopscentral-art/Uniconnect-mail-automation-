import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../../.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function findUniversity() {
    try {
        const { rows: univs } = await pool.query("SELECT id, name, slug FROM universities WHERE name ILIKE '%Takshashila%' OR name ILIKE '%Takshashilla%'");
        console.log('--- Universities found ---');
        console.log(univs);

        if (univs.length > 0) {
            for (const univ of univs) {
                const univId = univ.id;
                const { rows: userCount } = await pool.query("SELECT count(*) FROM users WHERE university_id = $1", [univId]);
                const { rows: taskCount } = await pool.query("SELECT count(*) FROM tasks WHERE university_id = $1", [univId]);
                const { rows: assessmentCount } = await pool.query("SELECT count(*) FROM assessment_templates WHERE university_id = $1", [univId]);

                console.log(`\nStatistics for ${univ.name} (${univ.id}):`);
                console.log(`Users: ${userCount[0].count}`);
                console.log(`Tasks: ${taskCount[0].count}`);
                console.log(`Assessment Templates: ${assessmentCount[0].count}`);

                // Check for users
                const { rows: users } = await pool.query("SELECT id, email, role FROM users WHERE university_id = $1 LIMIT 5", [univId]);
                console.log('Sample Users:', users);
            }

            // Check for any obvious errors in task table structure
            const { rows: columns } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tasks'");
            console.log('\n--- Task Table Columns ---');
            columns.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));
        } else {
            console.log('No university matching name found.');
        }
    } catch (err: any) {
        console.error('Search failed:', err.message);
    } finally {
        await pool.end();
    }
}

findUniversity();
