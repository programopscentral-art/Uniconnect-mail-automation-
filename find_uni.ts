import { db } from './packages/shared/src/db/client';

async function findUni() {
    const res = await db.query("SELECT id, name FROM universities WHERE name ILIKE '%Sanjay%'");
    console.log(JSON.stringify(res.rows, null, 2));
}

findUni().finally(() => process.exit());
