import { db } from '../packages/shared/src/db/client';

async function fix() {
    try {
        const univs = await db.query('SELECT id, name FROM universities WHERE name ILIKE \'%AMET%\'');
        for (const univ of univs.rows) {
            console.log(`Checking students for ${univ.name}...`);
            const students = await db.query('SELECT id, name, metadata FROM students WHERE university_id = $1 AND name = \'AMET\'', [univ.id]);

            console.log(`Found ${students.rows.length} students to fix.`);

            let fixedCount = 0;
            for (const s of students.rows) {
                // Try to find a real name in metadata
                const meta = s.metadata || {};
                const potentialName = meta['Name'] || meta['Full Name'] || meta['student name'] || meta['Student Name'];

                if (potentialName && potentialName !== 'AMET') {
                    await db.query('UPDATE students SET name = $1 WHERE id = $2', [potentialName, s.id]);
                    fixedCount++;
                }
            }
            console.log(`Successfully fixed ${fixedCount} student names for ${univ.name}.`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await db.pool.end();
    }
}

fix();
