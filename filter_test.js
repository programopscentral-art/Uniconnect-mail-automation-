import { db } from './packages/shared/src/db/client';

async function testFilter() {
    try {
        const u = await db.query('SELECT id FROM universities LIMIT 1');
        if (u.rows.length === 0) return;
        const id = u.rows[0].id;

        console.log(`Testing with filter: ${id}`);
        const start = Date.now();
        const result = await db.query(
            `SELECT c.*, t.name as template_name, m.email as mailbox_email 
             FROM campaigns c
             JOIN templates t ON c.template_id = t.id
             JOIN mailbox_connections m ON c.mailbox_id = m.id
             WHERE c.university_id = $1
             ORDER BY c.created_at DESC`,
            [id]
        );
        console.log(`Campaigns fetched: ${result.rows.length} in ${Date.now() - start}ms`);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

testFilter();
