import { db } from './packages/shared/src/db/client';

async function checkConstraints() {
    try {
        const res = await db.query(`
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'students'::regclass AND contype = 'u';
        `);
        console.log('Unique Constraints:', res.rows.map(r => r.conname));

        const res2 = await db.query(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'students' AND indexdef LIKE '%UNIQUE%';
        `);
        console.log('Unique Indices:', res2.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkConstraints();
