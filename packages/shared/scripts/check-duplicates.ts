import { db } from '../src/db/client';
import fs from 'fs';

async function debugDuplicates() {
    try {
        const { rows } = await db.query(
            `SELECT r.id, r.campaign_id, c.name as campaign_name, r.to_email, r.tracking_token, r.status, r.acknowledged_at 
             FROM campaign_recipients r 
             JOIN campaigns c ON r.campaign_id = c.id 
             ORDER BY r.created_at DESC`,
        );
        let output = '--- All Campaign Recipients ---\n';
        rows.forEach(r => {
            output += `[${r.campaign_name}] ${r.to_email} | Status: ${r.status} | Token: ${r.tracking_token} | Ack: ${r.acknowledged_at}\n`;
        });
        fs.writeFileSync('debug-duplicates.txt', output);
        console.log('Dump complete to debug-duplicates.txt');

    } catch (err) {
        console.error(err);
    } finally {
        await db.pool.end();
    }
}
debugDuplicates();
