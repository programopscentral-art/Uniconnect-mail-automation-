import { db } from '../src/db/client';

async function cleanupSimilarUniversities() {
    const client = await db.pool.connect();
    try {
        console.log('=== Cleaning Up Similar University Names ===\n');

        // Define merge rules: [keep_this, merge_these]
        const mergeRules = [
            // Keep the full name, merge shorter versions
            { keep: 'Annamacharya University', merge: ['Annamacharya'] },
            { keep: 'Aurora University', merge: ['Aurora'] },
            { keep: 'Central University', merge: ['Central'] },
            { keep: 'Crescent University', merge: ['Crescent'] },
            { keep: 'S-VYASA University', merge: ['S-Vyasa'] },
            { keep: 'Takshashila University', merge: ['Takshashila'] },
            { keep: 'VKU University', merge: ['VKU'] },
            { keep: 'Sanjay Ghodawat University', merge: ['Sanjay Ghodawat'] },
            { keep: 'Student Engagement', merge: ['Student Engagement '] }, // trailing space

            // NIAT variations - keep the main one
            { keep: 'NIAT', merge: ['NIAT Chervila', 'NIAT-KKH', 'NIAT -KKH'] },

            // NSRIT variations
            { keep: 'NSRIT', merge: ['NSRIT '] }, // trailing space
        ];

        let totalMerged = 0;

        for (const rule of mergeRules) {
            console.log(`\n📍 Processing: "${rule.keep}"`);

            // Find the keeper university
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

            // Find and merge each duplicate
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
                console.log(`  🔄 Merging "${mergeName}" (${dup.id}) into "${rule.keep}"`);

                await client.query('BEGIN');
                try {
                    // Update all related records
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

                    // Delete the duplicate
                    await client.query('DELETE FROM universities WHERE id = $1', [dup.id]);
                    await client.query('COMMIT');

                    console.log(`    ✅ Merged: ${tasks} tasks, ${users} users, ${mailboxes} mailboxes, ${templates} templates, ${campaigns} campaigns`);
                    totalMerged++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`    ❌ Failed to merge "${mergeName}":`, err);
                }
            }
        }

        console.log('\n=== Cleanup Complete ===');
        console.log(`Total universities merged: ${totalMerged}`);

        const { rows: finalCount } = await client.query('SELECT COUNT(*) FROM universities');
        console.log(`Final university count: ${finalCount[0].count}`);

        // List all remaining universities
        console.log('\n=== Remaining Universities ===');
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

cleanupSimilarUniversities();
