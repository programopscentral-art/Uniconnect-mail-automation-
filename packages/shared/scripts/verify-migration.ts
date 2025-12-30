import { db } from '../src/db/client';

async function verify() {
    try {
        const { rows: userCount } = await db.query('SELECT COUNT(*) FROM users');
        const { rows: univCount } = await db.query('SELECT COUNT(*) FROM universities');
        const { rows: taskCount } = await db.query('SELECT COUNT(*) FROM tasks');

        console.log('--- Migration Statistics ---');
        console.log(`Users: ${userCount[0].count}`);
        console.log(`Universities: ${univCount[0].count}`);
        console.log(`Tasks: ${taskCount[0].count}`);

        const { rows: sampleUsers } = await db.query('SELECT name, email, role FROM users ORDER BY created_at DESC LIMIT 5');
        console.log('\n--- Recent Migrated Users ---');
        console.log(JSON.stringify(sampleUsers, null, 2));

    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        process.exit(0);
    }
}

verify();
