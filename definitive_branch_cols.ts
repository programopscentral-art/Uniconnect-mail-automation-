import { db } from './packages/shared/src/db/client';

async function checkBranchCols() {
    const { rows } = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'assessment_branches'
        ORDER BY ordinal_position
    `);
    console.log("assessment_branches columns:");
    rows.forEach((r: any) => console.log(`- ${r.column_name} (${r.data_type})`));
}

checkBranchCols().finally(() => process.exit());
