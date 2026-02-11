import { db } from './packages/shared/src/db/client';
import crypto from 'crypto';

async function testSessionLatency() {
    try {
        const s = await db.query('SELECT token_hash FROM sessions LIMIT 1');
        if (s.rows.length === 0) {
            console.log('No sessions found');
            process.exit();
        }
        const tokenHash = s.rows[0].token_hash;

        console.log(`Testing session latency for hash: ${tokenHash}`);
        const start = Date.now();
        const result = await db.query(
            `
        SELECT 
            u.id, u.email, u.role, u.university_id, u.name, u.is_active,
            u.display_name, u.phone, u.age, u.bio, u.profile_picture_url, u.presence_mode,
            COALESCE(
                (
                    SELECT json_agg(json_build_object('id', un.id, 'name', un.name, 'is_team', un.is_team) ORDER BY un.name)
                    FROM user_universities uu
                    JOIN universities un ON uu.university_id = un.id
                    WHERE uu.user_id = u.id
                ),
                '[]'::json
            ) as universities,
            rp.features as permissions
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN role_permissions rp ON u.role = rp.role
        WHERE s.token_hash = $1 AND s.expires_at > NOW()
        `,
            [tokenHash]
        );
        console.log(`Session validated in ${Date.now() - start}ms`);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

testSessionLatency();
