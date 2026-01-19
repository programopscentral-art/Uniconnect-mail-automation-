import { db } from './packages/shared/src/db/client';

async function run() {
    try {
        const results = await db.query("SELECT id, name FROM universities");
        console.log(JSON.stringify(results.rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
