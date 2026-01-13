import { db } from './packages/shared/src/db/client';

const SANJAY_UNI_ID = '1e5f88db-2e3e-4f52-8810-7168e9dec84c';

async function listSubjects() {
    const { rows } = await db.query("SELECT id, name FROM assessment_subjects WHERE university_id = $1", [SANJAY_UNI_ID]);
    console.log(JSON.stringify(rows, null, 2));
}

listSubjects().finally(() => process.exit());
