import { db } from './packages/shared/src/db/client';

async function testPlan() {
    try {
        console.log('Query Plan for campaigns list:');
        const result = await db.query(
            `EXPLAIN ANALYZE SELECT c.*, t.name as template_name, m.email as mailbox_email 
             FROM campaigns c
             JOIN templates t ON c.template_id = t.id
             JOIN mailbox_connections m ON c.mailbox_id = m.id
             ORDER BY c.created_at DESC`
        );
        console.log(result.rows.map(r => r['QUERY PLAN']).join('\n'));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

testPlan();
