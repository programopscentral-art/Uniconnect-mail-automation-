import { db } from '../src/db/client';

async function finalCleanup() {
    const client = await db.pool.connect();
    try {
        console.log('=== FINAL Comprehensive Cleanup ===\n');

        // Remaining duplicates from the list
        const mergeRules = [
            // Still have both "Crescent" and "Crescent University"
            { keep: 'Crescent University', merge: ['Crescent'] },

            // NIAT variations
            { keep: 'NIAT Chevella', merge: ['NIAT', 'NIAT-KKH'] }, // Keep the most specific one
        ];

        let totalMerged = 0;

        for (const rule of mergeRules) {
            console.log(`\n📍 Processing: "${rule.keep}"`);

            const { rows: keeperRows } = await client.query(
                'SELECT * FROM universities WHERE name = $1',
                [rule.keep]
            );

            if (keeperRows.length === 0) {
                console.log(`  ⚠️ Keeper "${rule.keep}" not found, skipping...`);
                continue;
            }

            const keeper = keeperRows[0];
            console.log(`  ✅ Found keeper: ${keeper.id}`);

            for (const mergeName of rule.merge) {
                const { rows: dupRows } = await client.query(
                    'SELECT * FROM universities WHERE name = $1',
                    [mergeName]
                );

                if (dupRows.length === 0) {
                    console.log(`  ⏭️ "${mergeName}" not found, skipping...`);
                    continue;
                }

                const dup = dupRows[0];
                console.log(`  🔄 Merging "${mergeName}" (${dup.id})`);

                await client.query('BEGIN');
                try {
                    await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('DELETE FROM universities WHERE id = $1', [dup.id]);
                    await client.query('COMMIT');

                    console.log(`    ✅ Merged successfully`);
                    totalMerged++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`    ❌ Failed:`, err);
                }
            }
        }

        console.log('\n=== FINAL RESULTS ===');
        console.log(`Total merged in this run: ${totalMerged}`);

        const { rows: finalCount } = await client.query('SELECT COUNT(*) FROM universities');
        console.log(`\n✅ FINAL UNIVERSITY COUNT: ${finalCount[0].count}\n`);

        console.log('=== All Universities (Clean List) ===');
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

finalCleanup();
