import { db } from './packages/shared/src/db/client';

async function findUniCol() {
    const { rows } = await db.query(`
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'university_id' 
        AND table_name LIKE 'assessment_%'
    `);
    console.log("Tables with university_id:");
    console.log(JSON.stringify(rows, null, 2));

    // Also check batches, branches, etc schema again
    const tables = ['assessment_batches', 'assessment_branches', 'assessment_subjects'];
    for (const t of tables) {
        const { rows: cols } = await db.query(`
            SELECT column_name FROM information_schema.columns WHERE table_name = $1
        `, [t]);
        console.log(`\n${t} columns:`, cols.map((c: any) => c.column_name).join(', '));
    }
}

findUniCol().finally(() => process.exit());
