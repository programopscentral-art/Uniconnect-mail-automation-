import { db } from './packages/shared/src/db/client';

async function applyMigration() {
    try {
        console.log('Applying migration 0038...');
        await db.query(`CREATE INDEX IF NOT EXISTS campaigns_created_at_desc_idx ON campaigns(created_at DESC)`);
        console.log('Done.');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

applyMigration();
