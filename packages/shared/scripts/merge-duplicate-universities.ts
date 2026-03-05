import { db } from '../src/db/client';

async function findAndMergeDuplicates() {
    const client = await db.pool.connect();
    try {
        console.log('=== Finding Duplicate Universities ===\n');

        // Find universities with similar names (case-insensitive)
        const { rows: universities } = await client.query(`
            SELECT id, name, slug, 
                   (SELECT COUNT(*) FROM tasks WHERE university_id = universities.id) as task_count,
                   (SELECT COUNT(*) FROM users WHERE university_id = universities.id) as user_count,
                   (SELECT COUNT(*) FROM mailbox_connections WHERE university_id = universities.id) as mailbox_count
            FROM universities 
            ORDER BY LOWER(name), created_at
        `);

        console.log(`Total universities: ${universities.length}\n`);

        // Group by normalized name
        const groups = new Map<string, typeof universities>();
        for (const univ of universities) {
            const normalized = univ.name.toLowerCase().trim();
            if (!groups.has(normalized)) {
                groups.set(normalized, []);
            }
            groups.get(normalized)!.push(univ);
        }

        // Find duplicates
        const duplicates = Array.from(groups.entries()).filter(([_, univs]) => univs.length > 1);

        if (duplicates.length === 0) {
            console.log('✅ No duplicates found!');
            return;
        }

        console.log(`Found ${duplicates.length} duplicate groups:\n`);

        for (const [name, univs] of duplicates) {
            console.log(`\n📍 "${name}" (${univs.length} entries):`);
            univs.forEach((u, i) => {
                console.log(`  ${i + 1}. ID: ${u.id} | Slug: ${u.slug} | Tasks: ${u.task_count} | Users: ${u.user_count} | Mailboxes: ${u.mailbox_count}`);
            });

            // Determine which to keep (the one with most data)
            const keeper = univs.reduce((prev, curr) => {
                const prevTotal = parseInt(prev.task_count) + parseInt(prev.user_count) + parseInt(prev.mailbox_count);
                const currTotal = parseInt(curr.task_count) + parseInt(curr.user_count) + parseInt(curr.mailbox_count);
                return currTotal > prevTotal ? curr : prev;
            });

            const toMerge = univs.filter(u => u.id !== keeper.id);

            console.log(`  ✅ KEEP: ${keeper.id} (${keeper.slug})`);
            console.log(`  🔄 MERGE: ${toMerge.map(u => u.id).join(', ')}`);

            // Perform merge
            await client.query('BEGIN');
            try {
                for (const dup of toMerge) {
                    // Update all related records
                    await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);
                    await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [keeper.id, dup.id]);

                    // Delete the duplicate
                    await client.query('DELETE FROM universities WHERE id = $1', [dup.id]);
                    console.log(`  ✅ Merged and deleted: ${dup.id}`);
                }
                await client.query('COMMIT');
                console.log(`  ✅ Successfully merged "${name}"`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  ❌ Failed to merge "${name}":`, err);
            }
        }

        console.log('\n=== Final Count ===');
        const { rows: finalCount } = await client.query('SELECT COUNT(*) FROM universities');
        console.log(`Total universities after cleanup: ${finalCount[0].count}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

findAndMergeDuplicates();
