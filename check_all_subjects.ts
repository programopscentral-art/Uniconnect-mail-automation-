import { db } from './packages/shared/src/db/client';

async function checkAll() {
    const { rows: data } = await db.query(`
        SELECT s.name as subject_name, u.name as uni_name, s.university_id 
        FROM assessment_subjects s
        JOIN universities u ON s.university_id = u.id
    `);
    console.log(JSON.stringify(data, null, 2));
}

checkAll().finally(() => process.exit());
