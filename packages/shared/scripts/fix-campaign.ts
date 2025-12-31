import { db } from '../src/db/client';

async function fixCampaign() {
    try {
        const id = '9a234e48-a344-4886-bde9-aff0959c94bc';
        console.log(`Fixing campaign: ${id}`);

        await db.query(
            `UPDATE campaigns 
             SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() 
             WHERE id = $1`,
            [id]
        );

        console.log('Campaign marked as COMPLETED.');

    } catch (err) {
        console.error(err);
    } finally {
        await db.pool.end();
    }
}
fixCampaign();
