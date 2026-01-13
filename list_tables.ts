import { db } from './packages/shared/src/db/client';

async function listTables() {
    const res = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name LIKE 'assessment_%'
    `);
    res.rows.forEach(r => console.log(r.table_name));
}

listTables().finally(() => process.exit());
