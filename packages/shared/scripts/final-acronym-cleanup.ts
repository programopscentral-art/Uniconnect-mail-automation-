import { db } from '../src/db/client';

async function finalAcronymCleanup() {
    const client = await db.pool.connect();
    try {
        console.log('=== Final Acronym Cleanup ===\n');

        // Still have "Crescent" and "Crescent University"
        // Still have "NIAT" and "NIAT Chevella"
        const mergeRules = [
            {
                keep: 'Crescent University',
                merge: ['Crescent'],
                reason: 'Crescent is short for Crescent University'
            },
            {
                keep: 'NIAT Chevella',
                merge: ['NIAT'],
                reason: 'NIAT Chevella is the full name'
            },
        ];

        let totalMerged = 0;

        for (const rule of mergeRules) {
            console.log(`\n📍 ${rule.reason}`);
            console.log(`   Merging: "${rule.merge.join(', ')}" → "${rule.keep}"`);

            const { rows: keeperRows } = await client.query(
                'SELECT id FROM universities WHERE name = $1',
                [rule.keep]
            );

            if (keeperRows.length === 0) {
                console.log(`   ⚠️ Keeper "${rule.keep}" not found!`);
                continue;
            }

            const keeperId = keeperRows[0].id;

            for (const mergeName of rule.merge) {
                const { rows: mergeRows } = await client.query(
                    'SELECT id FROM universities WHERE name = $1',
                    [mergeName]
                );

                if (mergeRows.length === 0) {
                    console.log(`   ⏭️ "${mergeName}" already merged`);
                    continue;
                }

                const mergeId = mergeRows[0].id;

                await client.query('BEGIN');
                try {
                    const { rows: taskCount } = await client.query('SELECT COUNT(*) FROM tasks WHERE university_id = $1', [mergeId]);
                    const { rows: userCount } = await client.query('SELECT COUNT(*) FROM users WHERE university_id = $1', [mergeId]);
                    const { rows: mailboxCount } = await client.query('SELECT COUNT(*) FROM mailbox_connections WHERE university_id = $1', [mergeId]);

                    await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('DELETE FROM universities WHERE id = $1', [mergeId]);

                    await client.query('COMMIT');
                    console.log(`   ✅ Merged: ${taskCount[0].count} tasks, ${userCount[0].count} users, ${mailboxCount[0].count} mailboxes`);
                    totalMerged++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`   ❌ Failed:`, err);
                }
            }
        }

        console.log('\n=== ✅ ALL CLEANUP COMPLETE ===\n');
        console.log(`Total merged in this run: ${totalMerged}`);

        const { rows: finalCount } = await client.query('SELECT COUNT(*) FROM universities');
        console.log(`\n🎉 FINAL COUNT: ${finalCount[0].count} universities\n`);

        console.log('=== Final University List ===');
        const { rows: allUnivs } = await client.query('SELECT name FROM universities ORDER BY name');
        allUnivs.forEach((u, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${u.name}`));

        // Verify no duplicates
        console.log('\n=== Verification ===');
        const { rows: dupCheck } = await client.query(`
            SELECT name, COUNT(*) as count 
            FROM universities 
            GROUP BY name 
            HAVING COUNT(*) > 1
        `);

        if (dupCheck.length === 0) {
            console.log('✅ No duplicates found! Database is clean.');
        } else {
            console.log('⚠️ Still have duplicates:');
            dupCheck.forEach(d => console.log(`  - ${d.name}: ${d.count} entries`));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

finalAcronymCleanup();
