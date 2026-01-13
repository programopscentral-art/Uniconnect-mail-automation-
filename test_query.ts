import { db } from './packages/shared/src/db/client';

const SANJAY_UNI_ID = '1e5f88db-2e3e-4f52-8810-7168e9dec84c';

async function testQuery() {
    const { rows } = await db.query(`
        SELECT DISTINCT s.id, s.name 
        FROM assessment_subjects s
        JOIN assessment_branches b ON s.branch_id = b.id
        WHERE b.university_id = $1
    `, [SANJAY_UNI_ID]);
    console.log("Subjects in Sanjay Uni:");
    console.log(JSON.stringify(rows, null, 2));
}

testQuery().finally(() => process.exit());
