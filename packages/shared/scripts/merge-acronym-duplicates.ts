import { db } from '../src/db/client';

async function mergeAcronymDuplicates() {
    const client = await db.pool.connect();
    try {
        console.log('=== Merging Acronym-Based Duplicates ===\n');

        // Merge rules based on user's clarification
        const mergeRules = [
            // AMET - Keep full name, merge acronym
            {
                keep: 'Academy of Maritime Education & Training (AMET)',
                merge: ['AMET'],
                reason: 'AMET is the acronym for Academy of Maritime Education & Training'
            },

            // ADYPU - Keep full name, merge acronym
            {
                keep: 'Ajeenkya DY Patil University',
                merge: ['ADYPU'],
                reason: 'ADYPU is the acronym for Ajeenkya DY Patil University'
            },

            // Mallareddy / MRV - Keep Mallareddy, merge MRV
            {
                keep: 'Mallareddy',
                merge: ['MRV'],
                reason: 'MRV is under Mallareddy'
            },

            // NIU - Keep full name, merge acronym
            {
                keep: 'Noida International University',
                merge: ['NIU'],
                reason: 'NIU is the acronym for Noida International University'
            },

            // NRI - Keep full name, merge acronym
            {
                keep: 'NRI Institute of Technology',
                merge: ['NRI'],
                reason: 'NRI is the acronym for NRI Institute of Technology'
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
            console.log(`   Keeper ID: ${keeperId}`);

            for (const mergeName of rule.merge) {
                const { rows: mergeRows } = await client.query(
                    'SELECT id FROM universities WHERE name = $1',
                    [mergeName]
                );

                if (mergeRows.length === 0) {
                    console.log(`   ⏭️ "${mergeName}" not found, skipping...`);
                    continue;
                }

                const mergeId = mergeRows[0].id;
                console.log(`   Merging ID: ${mergeId}`);

                await client.query('BEGIN');
                try {
                    // Count data before merge
                    const { rows: taskCount } = await client.query(
                        'SELECT COUNT(*) FROM tasks WHERE university_id = $1',
                        [mergeId]
                    );
                    const { rows: userCount } = await client.query(
                        'SELECT COUNT(*) FROM users WHERE university_id = $1',
                        [mergeId]
                    );
                    const { rows: mailboxCount } = await client.query(
                        'SELECT COUNT(*) FROM mailbox_connections WHERE university_id = $1',
                        [mergeId]
                    );

                    // Move all data to keeper
                    await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);
                    await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [keeperId, mergeId]);

                    // Delete the duplicate
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

        console.log('\n=== ✅ ACRONYM CLEANUP COMPLETE ===\n');
        console.log(`Total merged: ${totalMerged}`);

        const { rows: finalCount } = await client.query('SELECT COUNT(*) FROM universities');
        console.log(`Final Count: ${finalCount[0].count} universities\n`);

        console.log('=== All Universities (Alphabetical) ===');
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

mergeAcronymDuplicates();
