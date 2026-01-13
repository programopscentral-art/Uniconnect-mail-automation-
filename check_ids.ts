import { db } from './packages/shared/src/db/client';

async function checkIds() {
    const { rows: subjects } = await db.query("SELECT DISTINCT university_id FROM assessment_subjects");
    console.log("University IDs in assessment_subjects:");
    console.log(JSON.stringify(subjects, null, 2));

    const { rows: unis } = await db.query("SELECT id, name FROM universities");
    const uniMap: any = {};
    unis.forEach((u: any) => uniMap[u.id] = u.name);

    console.log("\nMapping:");
    subjects.forEach((s: any) => {
        console.log(`${s.university_id} -> ${uniMap[s.university_id] || 'NOT FOUND'}`);
    });
}

checkIds().finally(() => process.exit());
