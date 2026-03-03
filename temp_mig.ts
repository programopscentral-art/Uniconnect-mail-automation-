import { db } from './packages/shared/src/db/client';

(async () => {
    try {
        await db.query('ALTER TABLE communication_tasks ADD COLUMN IF NOT EXISTS completions JSONB DEFAULT \'[]\'::jsonb');
        console.log('Migration done');
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
