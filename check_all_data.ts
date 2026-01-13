import { db } from './packages/shared/src/db/client';

async function checkAll() {
    const { rows: unis } = await db.query("SELECT id, name FROM universities");
    console.log("Universities:");
    console.log(JSON.stringify(unis, null, 2));

    const { rows: subjects } = await db.query(`
        SELECT s.name as subject_name, u.name as uni_name, s.university_id 
        FROM assessment_subjects s
        JOIN universities u ON s.university_id = u.id
        LIMIT 20
    `);
    console.log("\nSubjects:");
    console.log(JSON.stringify(subjects, null, 2));
}

checkAll().finally(() => process.exit());
