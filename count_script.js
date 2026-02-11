import { db } from './packages/shared/src/db/client';

async function test() {
    try {
        const uCount = await db.query('SELECT count(*) FROM universities');
        console.log('Universities:', uCount.rows[0].count);

        const cCount = await db.query('SELECT count(*) FROM campaigns');
        console.log('Campaigns:', cCount.rows[0].count);

        const rCount = await db.query('SELECT count(*) FROM campaign_recipients');
        console.log('Recipients:', rCount.rows[0].count);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

test();
