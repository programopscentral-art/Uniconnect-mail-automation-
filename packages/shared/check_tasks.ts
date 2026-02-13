
import { db } from './src/db/client.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

async function check() {
    try {
        const res = await db.query("SELECT id, message_title, status, scheduled_at, creation_notified_at, notified_at FROM communication_tasks WHERE status != 'Completed' ORDER BY created_at DESC LIMIT 5");
        console.log(JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
