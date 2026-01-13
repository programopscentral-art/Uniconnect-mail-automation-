import { db } from './packages/shared/src/db/client';

async function findUniLink() {
    const { rows } = await db.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE column_name = 'university_id'
        AND table_schema = 'public'
    `);
    console.log("All tables with university_id:");
    console.log(JSON.stringify(rows, null, 2));
}

findUniLink().finally(() => process.exit());
