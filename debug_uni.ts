import { db } from './packages/shared/src/db/client';

async function debug() {
    const id = 'f4f3915c-bb8d-42b3-a756-219d9a5f9c2b';
    console.log('--- Debugging University ID:', id, '---');

    try {
        const uni = await db.query('SELECT * FROM universities WHERE id = $1', [id]);
        console.log('University Row:', JSON.stringify(uni.rows[0], null, 2));

        const batches = await db.query('SELECT * FROM assessment_batches WHERE university_id = $1', [id]);
        console.log('Batches Count:', batches.rows.length);
        console.log('Batches:', JSON.stringify(batches.rows, null, 2));

        const branches = await db.query('SELECT * FROM assessment_branches WHERE university_id = $1', [id]);
        console.log('Branches Count:', branches.rows.length);
        console.log('Branches:', JSON.stringify(branches.rows, null, 2));

    } catch (err) {
        console.error('DEBUG FAILED:', err);
    } finally {
        process.exit(0);
    }
}

debug();
