import { db } from '../src/db/client';

async function fixRecipients() {
    try {
        const campaignId = '9a234e48-a344-4886-bde9-aff0959c94bc';
        console.log(`Fixing recipients for campaign: ${campaignId}`);

        await db.query(
            `UPDATE campaign_recipients 
             SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(), updated_at = NOW() 
             WHERE campaign_id = $1 AND status = 'SENT'`,
            [campaignId]
        );

        await db.query(
            `UPDATE campaigns SET ack_count = sent_count WHERE id = $1`,
            [campaignId]
        );

        console.log('Recipients marked as ACKNOWLEDGED.');

    } catch (err) {
        console.error(err);
    } finally {
        await db.pool.end();
    }
}
fixRecipients();
