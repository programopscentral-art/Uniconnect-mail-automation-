import { db } from '../src/db/client';

async function list() {
    try {
        const { rows } = await db.query('SELECT id, name, slug FROM universities');
        console.log('Current Universities in Target:');
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error('List failed:', err);
    } finally {
        process.exit(0);
    }
}

list();
