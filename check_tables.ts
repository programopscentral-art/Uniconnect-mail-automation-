import { db } from './packages/shared/src/db/client';

async function checkTables() {
    const { rows } = await db.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
    console.log(JSON.stringify(rows, null, 2));

    // Also try counting common tables
    const tables = ['universities', 'assessment_subjects', 'assessment_batches', 'assessment_branches'];
    for (const t of tables) {
        try {
            const res = await db.query(`SELECT COUNT(*) FROM ${t}`);
            console.log(`${t} count:`, res.rows[0].count);
        } catch (e) {
            console.log(`${t} error:`, e.message);
        }
    }
}

checkTables().finally(() => process.exit());
