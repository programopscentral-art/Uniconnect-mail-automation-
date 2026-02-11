import { db } from './packages/shared/src/db/client';

async function findDupes() {
    try {
        const res = await db.query(`
            SELECT university_id, external_id, count(*)
            FROM students
            GROUP BY university_id, external_id
            HAVING count(*) > 1
            LIMIT 10
        `);
        console.log('Duplicate (Univ, ExternalId) pairs:');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

findDupes();
