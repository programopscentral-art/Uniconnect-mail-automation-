import { db } from './client';

async function main() {
    console.log('Adding recipient_email_key column to campaigns table...');
    await db.query(
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recipient_email_key TEXT"
    );
    console.log('Successfully added recipient_email_key column.');
    process.exit(0);
}

main().catch(console.error);
