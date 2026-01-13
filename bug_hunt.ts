import { db } from './packages/shared/src/db/client';

async function bugHunt() {
    const { rows } = await db.query("SELECT * FROM assessment_subjects LIMIT 5");
    console.log("Subjects Raw Data:");
    console.log(JSON.stringify(rows, null, 2));
}

bugHunt().finally(() => process.exit());
