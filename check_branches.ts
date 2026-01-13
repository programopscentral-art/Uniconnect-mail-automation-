import { db } from './packages/shared/src/db/client';

async function checkBranches() {
    const { rows: cols } = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'assessment_branches'
        ORDER BY ordinal_position
    `);
    console.log("Branches Columns:");
    console.log(JSON.stringify(cols, null, 2));

    const { rows: sample } = await db.query("SELECT * FROM assessment_branches LIMIT 1");
    console.log("\nSample Branch:");
    console.log(JSON.stringify(sample, null, 2));
}

checkBranches().finally(() => process.exit());
