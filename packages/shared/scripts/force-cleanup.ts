import { db } from '../src/db/client';

async function forceCleanupRemaining() {
    const client = await db.pool.connect();
    try {
        console.log('=== Force Cleanup Remaining Entries ===\n');

        // Get all universities
        const { rows: allUnivs } = await client.query('SELECT id, name FROM universities ORDER BY name');

        console.log('Current universities:');
        allUnivs.forEach((u, i) => console.log(`${i + 1}. ${u.name} (${u.id})`));

        // Find the specific duplicates
        const crescent = allUnivs.find(u => u.name === 'Crescent');
        const crescentUniv = allUnivs.find(u => u.name === 'Crescent University');
        const niat = allUnivs.find(u => u.name === 'NIAT');
        const niatChevella = allUnivs.find(u => u.name === 'NIAT Chevella');

        console.log('\n=== Checking for duplicates ===');

        if (crescent && crescentUniv) {
            console.log(`\n📍 Found: "Crescent" and "Crescent University"`);
            console.log(`   Merging ${crescent.id} → ${crescentUniv.id}`);

            await client.query('BEGIN');
            try {
                await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('DELETE FROM universities WHERE id = $1', [crescent.id]);
                await client.query('COMMIT');
                console.log('   ✅ Merged successfully');
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('   ❌ Failed:', err);
            }
        } else {
            console.log('✅ Crescent already clean');
        }

        if (niat && niatChevella) {
            console.log(`\n📍 Found: "NIAT" and "NIAT Chevella"`);
            console.log(`   Merging ${niat.id} → ${niatChevella.id}`);

            await client.query('BEGIN');
            try {
                await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [niatChevella.id, niat.id]);
                await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [niatChevella.id, niat.id]);
                await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [niatChevella.id, niat.id]);
                await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [niatChevella.id, niat.id]);
                await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [niatChevella.id, niat.id]);
                await client.query('DELETE FROM universities WHERE id = $1', [niat.id]);
                await client.query('COMMIT');
                console.log('   ✅ Merged successfully');
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('   ❌ Failed:', err);
            }
        } else {
            console.log('✅ NIAT already clean');
        }

        console.log('\n=== FINAL RESULT ===\n');
        const { rows: finalUnivs } = await client.query('SELECT name FROM universities ORDER BY name');
        console.log(`Total: ${finalUnivs.length} universities\n`);
        finalUnivs.forEach((u, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${u.name}`));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

forceCleanupRemaining();
