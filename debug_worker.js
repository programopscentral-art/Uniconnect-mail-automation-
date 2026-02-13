const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

async function debug() {
    dotenv.config();

    console.log('--- Environment Check ---');
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (b64) {
        console.log('FIREBASE_SERVICE_ACCOUNT length:', b64.length);
        console.log('First 20 chars:', b64.substring(0, 20));
        try {
            const decoded = Buffer.from(b64, 'base64').toString();
            console.log('Decoded start:', decoded.substring(0, 50));
            const parsed = JSON.parse(decoded);
            console.log('✅ JSON Parse Success. Project ID:', parsed.project_id);
        } catch (e) {
            console.log('❌ JSON Parse Failed:', e.message);
        }
    } else {
        console.log('❌ FIREBASE_SERVICE_ACCOUNT not found');
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.log('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    console.log('\n--- Database Check ---');
    try {
        const users = await pool.query("SELECT id, email, university_id, role, display_name FROM users WHERE email = 'programopscentral@nxtwave.in'");
        console.log('User found:', users.rows[0]);

        if (users.rows[0]) {
            const userId = users.rows[0].id;
            const tokens = await pool.query("SELECT fcm_token FROM user_fcm_tokens WHERE user_id = $1", [userId]);
            console.log('FCM Tokens:', tokens.rows.map(r => r.fcm_token));

            // Check if user is associated with the universities in the task
            const userUnivs = await pool.query("SELECT university_id FROM user_universities WHERE user_id = $1", [userId]);
            console.log('User Universities (user_universities):', userUnivs.rows.map(r => r.university_id));
        }

        const tasks = await pool.query("SELECT id, universities, channel, status, scheduled_at, creation_notified_at FROM communication_tasks WHERE status = 'Scheduled' ORDER BY created_at DESC LIMIT 5");
        console.log('\nRecent Scheduled Tasks:');
        tasks.rows.forEach(t => {
            console.log(`ID: ${t.id}, Univ: ${t.universities}, Channel: ${t.channel}, Scheduled: ${t.scheduled_at}, Notified: ${t.creation_notified_at}`);
        });

    } catch (e) {
        console.error('DB Error:', e);
    } finally {
        await pool.end();
        process.exit();
    }
}

debug();
