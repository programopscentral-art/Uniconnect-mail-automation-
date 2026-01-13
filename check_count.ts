import { db } from './packages/shared/src/db/client';

async function checkCount() {
    const res = await db.query("SELECT COUNT(*) FROM assessment_subjects");
    console.log("Subject count:", res.rows[0].count);

    const res2 = await db.query("SELECT * FROM assessment_subjects LIMIT 5");
    console.log("Sample subjects:", JSON.stringify(res2.rows, null, 2));

    const res3 = await db.query("SELECT * FROM universities LIMIT 5");
    console.log("Sample universities:", JSON.stringify(res3.rows, null, 2));
}

checkCount().finally(() => process.exit());
