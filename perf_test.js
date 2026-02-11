import { db } from './packages/shared/src/db/client';

async function testTimer() {
    const start = Date.now();
    try {
        console.log('Querying campaigns...');
        const result = await db.query(
            `SELECT c.*, t.name as template_name, m.email as mailbox_email 
             FROM campaigns c
             JOIN templates t ON c.template_id = t.id
             JOIN mailbox_connections m ON c.mailbox_id = m.id
             ORDER BY c.created_at DESC`
        );
        console.log(`Campaigns fetched: ${result.rows.length} in ${Date.now() - start}ms`);

        const start2 = Date.now();
        console.log('Querying universities...');
        const result2 = await db.query('SELECT * FROM universities ORDER BY name ASC');
        console.log(`Universities fetched: ${result2.rows.length} in ${Date.now() - start2}ms`);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

testTimer();
