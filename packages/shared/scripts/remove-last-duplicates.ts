import { db } from '../src/db/client';

async function removeRemainingDuplicates() {
    const client = await db.pool.connect();
    try {
        console.log('=== Removing Last Remaining Duplicates ===\n');

        // Final cleanup - these are the exact duplicates still showing
        const mergeRules = [
            // Keep "Crescent University", remove "Crescent"
            { keep: 'Crescent University', remove: 'Crescent' },

            // Keep "NIAT Chevella", remove "NIAT"
            { keep: 'NIAT Chevella', remove: 'NIAT' },
        ];

        for (const rule of mergeRules) {
            console.log(`\n📍 Merging: "${rule.remove}" → "${rule.keep}"`);

            const { rows: keeperRows } = await client.query(
                'SELECT id FROM universities WHERE name = $1',
                [rule.keep]
            );

            const { rows: removeRows } = await client.query(
                'SELECT id FROM universities WHERE name = $1',
                [rule.remove]
            );

            if (keeperRows.length === 0) {
                console.log(`  ⚠️ Keeper "${rule.keep}" not found!`);
                continue;
            }

            if (removeRows.length === 0) {
                console.log(`  ⏭️ "${rule.remove}" already removed`);
                continue;
            }

            const keeperId = keeperRows[0].id;
            const removeId = removeRows[0].id;

            console.log(`  Keeper ID: ${keeperId}`);
            console.log(`  Remove ID: ${removeId}`);

            await client.query('BEGIN');
            try {
                // Move all data to keeper
                await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [keeperId, removeId]);
                await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [keeperId, removeId]);
                await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [keeperId, removeId]);
                await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [keeperId, removeId]);
                await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [keeperId, removeId]);

                // Delete the duplicate
                await client.query('DELETE FROM universities WHERE id = $1', [removeId]);

                await client.query('COMMIT');
                console.log(`  ✅ Successfully merged and removed "${rule.remove}"`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  ❌ Failed:`, err);
            }
        }

        console.log('\n=== ✅ CLEANUP COMPLETE ===\n');

        const { rows: finalCount } = await client.query('SELECT COUNT(*) FROM universities');
        console.log(`Final Count: ${finalCount[0].count} universities\n`);

        console.log('=== All Universities ===');
        const { rows: allUnivs } = await client.query('SELECT name FROM universities ORDER BY name');
        allUnivs.forEach((u, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${u.name}`));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

removeRemainingDuplicates();
