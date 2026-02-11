import { db } from './packages/shared/src/db/client';

async function applyMigration() {
    try {
        console.log('Applying migration 0039...');
        await db.query(`CREATE INDEX IF NOT EXISTS campaigns_template_id_idx ON campaigns(template_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS campaigns_mailbox_id_idx ON campaigns(mailbox_id)`);
        console.log('Done.');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

applyMigration();
