import { db } from './packages/shared/src/db/client';

async function checkNames() {
    const { rows } = await db.query("SELECT DISTINCT TRIM(name) as name FROM assessment_subjects ORDER BY name");
    console.log("Unique Subject Names:");
    rows.forEach((r: any) => console.log(`- ${r.name}`));
}

checkNames().finally(() => process.exit());
