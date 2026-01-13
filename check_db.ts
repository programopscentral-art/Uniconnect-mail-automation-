import { db } from './packages/shared/src/db/client';

async function check() {
    try {
        const { rows } = await db.query('SELECT marks, COUNT(*) as count FROM assessment_questions GROUP BY marks ORDER BY marks');
        console.log('Marks Distribution:', rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

check();
