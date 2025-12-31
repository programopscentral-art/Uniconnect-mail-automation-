import { db } from '../src/db/client';
import fs from 'fs';

async function debugCampaign() {
    try {
        const id = '431ce091-d089-4b7d-a063-f0a8df79d823';
        const { rows: campaign } = await db.query('SELECT * FROM campaigns WHERE id = $1', [id]);
        const { rows: recipients } = await db.query('SELECT * FROM campaign_recipients WHERE campaign_id = $1', [id]);

        let output = '--- Campaign ---\n' + JSON.stringify(campaign[0], null, 2) + '\n\n--- Recipients ---\n';
        recipients.forEach(r => {
            output += `${r.to_email}: ${r.status} (Ack: ${r.acknowledged_at}) | Token: ${r.tracking_token}\n`;
        });

        fs.writeFileSync('debug-output.txt', output);
    } catch (err) {
        fs.writeFileSync('debug-output.txt', String(err));
    } finally {
        await db.pool.end();
    }
}
debugCampaign();
