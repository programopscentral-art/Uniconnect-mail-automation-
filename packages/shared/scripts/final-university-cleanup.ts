import { db } from '../src/db/client';

async function cleanupRemainingDuplicates() {
    const client = await db.pool.connect();
    try {
        console.log('=== Final Cleanup of Remaining Duplicates ===\n');

        // Define merge rules based on actual database content
        const mergeRules = [
            { keep: 'Crescent University', merge: ['Crescent'] },
            { keep: 'Takshashila University', merge: ['Takshasila'] },
            { keep: 'VGU University', merge: ['VGU'] },
            { keep: 'Sanjay Ghodawat University', merge: ['SGU'] },
            { keep: 'Yenepoya', merge: ['Yenepoya Mangalore'] },
            { keep: 'NIAT', merge: ['NIAT Chevella', 'NIAT-KKH'] },
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
                    const { rowCount: tasks } = await client.query(
                        'UPDATE tasks SET university_id = $1 WHERE university_id = $2',
                        [keeper.id, dup.id]
                    );
                    const { rowCount: users } = await client.query(
                        'UPDATE users SET university_id = $1 WHERE university_id = $2',
                        [keeper.id, dup.id]
                    );
                    const { rowCount: mailboxes } = await client.query(
                        'UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2',
                        [keeper.id, dup.id]
                    );
                    const { rowCount: templates } = await client.query(
                        'UPDATE templates SET university_id = $1 WHERE university_id = $2',
                        [keeper.id, dup.id]
                    );
                    const { rowCount: campaigns } = await client.query(
                        'UPDATE campaigns SET university_id = $1 WHERE university_id = $2',
                        [keeper.id, dup.id]
                    );

                    await client.query('DELETE FROM universities WHERE id = $1', [dup.id]);
                    await client.query('COMMIT');

                    console.log(`    ✅ Merged: ${tasks} tasks, ${users} users, ${mailboxes} mailboxes`);
                    totalMerged++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`    ❌ Failed:`, err);
                }
            }
        }

        console.log('\n=== Final Results ===');
        console.log(`Total merged: ${totalMerged}`);

        const { rows: finalCount } = await client.query('SELECT COUNT(*) FROM universities');
        console.log(`Final count: ${finalCount[0].count}`);

        console.log('\n=== All Universities (Alphabetical) ===');
        const { rows: allUnivs } = await client.query('SELECT name FROM universities ORDER BY name');
        allUnivs.forEach((u, i) => console.log(`${i + 1}. ${u.name}`));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

cleanupRemainingDuplicates();
