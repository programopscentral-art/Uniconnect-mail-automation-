import { db } from './packages/shared/src/db/client';
import dotenv from 'dotenv';
dotenv.config({ path: './apps/app/.env' });

async function check() {
    try {
        const campaignId = 'ba4ef9dc-344d-4ff1-afdf-949953147a84';
        const res = await db.query(`
            SELECT c.id, c.status, c.total_recipients, u.id as university_id, 
                   (SELECT COUNT(*) FROM students WHERE university_id = c.university_id) as student_count,
                   (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id) as current_recipients
            FROM campaigns c 
            JOIN universities u ON c.university_id = u.id 
            WHERE c.id = $1;
        `, [campaignId]);

        console.log(JSON.stringify(res.rows[0], null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
