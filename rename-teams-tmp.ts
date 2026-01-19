import { db } from './packages/shared/src/db/client';

async function run() {
    try {
        console.log('--- Renaming Teams ---');

        // 1. Rename Central University
        const centralRes = await db.query(
            "UPDATE universities SET name = 'Central Team' WHERE id = '6bd1174c-9974-4643-bde9-9ea39ddfa741' RETURNING id, name"
        );
        console.log('Central Rename:', JSON.stringify(centralRes.rows));

        // 2. Rename CRM Team to CRM
        const crmRes = await db.query(
            "UPDATE universities SET name = 'CRM' WHERE id = '2e6ace3a-a3c3-4770-ad85-5e230558cf64' RETURNING id, name"
        );
        console.log('CRM Rename:', JSON.stringify(crmRes.rows));

        process.exit(0);
    } catch (err) {
        console.error('Failed to rename teams:', err);
        process.exit(1);
    }
}

run();
