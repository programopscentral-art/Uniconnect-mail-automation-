import { db, markRecipientAck } from '../src/index';

async function testAck() {
    try {
        const token = 'dedfcdbefe22c81d00df9cf4287c8bea'; // From dragonballz student
        console.log(`Testing ack for token: ${token}`);

        const res = await markRecipientAck(token);
        console.log('Result:', JSON.stringify(res, null, 2));

        const { rows: recipient } = await db.query('SELECT status FROM campaign_recipients WHERE tracking_token = $1', [token]);
        console.log('New status:', recipient[0]?.status);

    } catch (err) {
        console.error(err);
    } finally {
        await db.pool.end();
    }
}
testAck();
