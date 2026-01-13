import { db } from './packages/shared/src/db/client';

async function checkBatches() {
    const { rows: cols } = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'assessment_batches'
        ORDER BY ordinal_position
    `);
    console.log("Batches Columns:");
    console.log(JSON.stringify(cols, null, 2));

    const { rows: sample } = await db.query("SELECT * FROM assessment_batches LIMIT 1");
    console.log("\nSample Batch:");
    console.log(JSON.stringify(sample, null, 2));
}

checkBatches().finally(() => process.exit());
