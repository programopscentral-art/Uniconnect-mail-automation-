import { db } from '../src/db/client';

async function verifyCleanup() {
    const client = await db.pool.connect();
    try {
        const { rows: universities } = await client.query(`
            SELECT name, COUNT(*) as count 
            FROM universities 
            GROUP BY name
            HAVING COUNT(*) > 1
            ORDER BY count DESC, name
        `);

        if (universities.length === 0) {
            console.log('✅ No duplicate universities found! All clean.');
        } else {
            console.log(`⚠️ Still found ${universities.length} duplicates:`);
            universities.forEach(u => {
                console.log(`  - "${u.name}": ${u.count} entries`);
            });
        }

        const { rows: total } = await client.query('SELECT COUNT(*) FROM universities');
        console.log(`\nTotal universities: ${total[0].count}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

verifyCleanup();
