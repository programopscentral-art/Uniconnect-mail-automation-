const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

async function check() {
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'FOUND' : 'NOT FOUND');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- User Info ---');
        const userRes = await pool.query("SELECT id, email, university_id FROM users WHERE email = 'programopscentral@nxtwave.in'");
        const user = userRes.rows[0];
        console.log('User:', user);

        if (user) {
            const uuRes = await pool.query("SELECT university_id FROM user_universities WHERE user_id = $1", [user.id]);
            const uuIds = uuRes.rows.map(r => r.university_id);
            console.log('User Universities (uuIds):', uuIds);

            const allUids = [user.university_id, ...uuIds].filter(Boolean);
            if (allUids.length > 0) {
                const univDetails = await pool.query("SELECT id, name, short_name FROM universities WHERE id = ANY($1)", [allUids]);
                console.log('University Details:', univDetails.rows);
            }
        }

        console.log('\n--- Task Info ---');
        const taskRes = await pool.query("SELECT * FROM communication_tasks WHERE scheduled_at >= '2026-02-12 11:00:00' ORDER BY scheduled_at ASC");
        console.log('Tasks found:', taskRes.rows.length);
        taskRes.rows.forEach(t => {
            console.log(`ID: ${t.id}, Universities: ${JSON.stringify(t.universities)}, Status: ${t.status}, Scheduled: ${t.scheduled_at}`);
            console.log(`  Creation Notified: ${t.creation_notified_at}, Day Start: ${t.day_start_notified_at}, 10m: ${t.ten_min_reminder_sent}, Notified At: ${t.notified_at}`);
        });

        console.log('\n--- FCM Tokens ---');
        if (user) {
            const tokens = await pool.query("SELECT fcm_token, last_active FROM user_fcm_tokens WHERE user_id = $1", [user.id]);
            console.log('Tokens count:', tokens.rows.length);
            tokens.rows.forEach(t => console.log(`  Token: ${t.fcm_token.substring(0, 20)}..., Last Active: ${t.last_active}`));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
