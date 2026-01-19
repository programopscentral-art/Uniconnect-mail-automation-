import { db } from './packages/shared/src/db/client';

async function run() {
    try {
        const res = await db.query("SELECT id, name FROM universities WHERE name ILIKE '%Central%' OR name ILIKE '%CRM%'");
        console.log('UNIVERSITY_SEARCH_RESULTS:' + JSON.stringify(res.rows));
        process.exit(0);
    } catch (err) {
        console.error('Failed to query universities:', err);
        process.exit(1);
    }
}

run();
