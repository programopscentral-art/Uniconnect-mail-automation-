
import { db, getCampaignById, getTemplateById } from './packages/shared/src/index';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function debugRecipient(recipientId: string) {
    try {
        console.log(`\n=== DIAGNOSTIC REPORT FOR RECIPIENT: ${recipientId} ===`);

        const recipientRes = await db.query(`
            SELECT r.*, s.name as student_name, s.external_id, s.metadata 
            FROM campaign_recipients r 
            JOIN students s ON r.student_id = s.id 
            WHERE r.id = $1
        `, [recipientId]);

        if (recipientRes.rows.length === 0) {
            console.error('❌ Recipient not found.');
            return;
        }

        const recipient = recipientRes.rows[0];
        const metaObj = recipient.metadata || {};
        const keys = Object.keys(metaObj);

        console.log(`Student Name: ${recipient.student_name}`);
        console.log(`Student Email (Global): ${recipient.email}`); // Wait, email is in students too but we use r.to_email
        console.log(`Recipient To-Email: ${recipient.to_email}`);
        console.log(`Total Metadata Keys: ${keys.length}`);

        const key1 = "Term 1 Fee adjustment (O/S +ve and Excess -Ve)";
        const key2 = "Total Term 2 Fee Payabale (Includes Term 2 & Term 1 adjustments)";

        console.log(`\nTarget Key 1: "${key1}"`);
        console.log(`Exists (Case Sensitive): ${metaObj.hasOwnProperty(key1)}`);
        console.log(`Value: ${JSON.stringify(metaObj[key1])}`);

        if (!metaObj.hasOwnProperty(key1)) {
            const fuzzyKey1 = keys.find(k => k.toLowerCase().includes('term 1 fee adjustment'));
            if (fuzzyKey1) console.log(`Fuzzy Match found: "${fuzzyKey1}" -> ${JSON.stringify(metaObj[fuzzyKey1])}`);
        }

        console.log(`\nTarget Key 2: "${key2}"`);
        console.log(`Exists (Case Sensitive): ${metaObj.hasOwnProperty(key2)}`);
        console.log(`Value: ${JSON.stringify(metaObj[key2])}`);

        if (!metaObj.hasOwnProperty(key2)) {
            const fuzzyKey2 = keys.find(k => k.toLowerCase().includes('total term 2 fee'));
            if (fuzzyKey2) console.log(`Fuzzy Match found: "${fuzzyKey2}" -> ${JSON.stringify(metaObj[fuzzyKey2])}`);
        }

        console.log(`\n--- ALL KEYS ---`);
        console.log(JSON.stringify(keys, null, 2));

        console.log(`\n=== END REPORT ===`);

    } catch (err) {
        console.error('Error during diagnostic:', err);
    } finally {
        await db.pool.end();
    }
}

const rid = process.argv[2];
if (!rid) {
    console.error('Please provide a Recipient ID');
    process.exit(1);
}

debugRecipient(rid);
