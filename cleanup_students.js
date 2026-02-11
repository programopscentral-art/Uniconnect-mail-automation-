import { db } from './packages/shared/src/db/client';

async function cleanup() {
    try {
        console.log('Cleaning up duplicate students by external_id...');
        // Delete all but the newest for each (univ, external_id)
        await db.query(`
            DELETE FROM students a USING (
                SELECT MIN(ctid) as ctid, university_id, external_id
                FROM students 
                GROUP BY university_id, external_id 
                HAVING COUNT(*) > 1
            ) b
            WHERE a.university_id = b.university_id 
            AND a.external_id = b.external_id 
            AND a.ctid > b.ctid
        `);

        console.log('Cleaning up duplicate students by email...');
        // Delete all but the newest for each (univ, email)
        await db.query(`
            DELETE FROM students a USING (
                SELECT MIN(ctid) as ctid, university_id, email
                FROM students 
                GROUP BY university_id, email 
                HAVING COUNT(*) > 1
            ) b
            WHERE a.university_id = b.university_id 
            AND a.email = b.email 
            AND a.ctid > b.ctid
        `);

        console.log('Cleanup complete.');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

cleanup();
