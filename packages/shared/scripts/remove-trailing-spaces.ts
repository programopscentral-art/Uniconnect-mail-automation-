import { db } from '../src/db/client';

async function removeTrailingSpaces() {
    const client = await db.pool.connect();
    try {
        console.log('=== Removing Entries with Trailing Spaces ===\n');

        // Get all universities
        const { rows: allUnivs } = await client.query('SELECT id, name FROM universities');

        // Find "Crescent" (with or without spaces)
        const crescent = allUnivs.find(u => u.name.trim() === 'Crescent');
        const crescentUniv = allUnivs.find(u => u.name.trim() === 'Crescent University');

        if (crescent && crescentUniv) {
            console.log(`Found "Crescent" (ID: ${crescent.id})`);
            console.log(`Found "Crescent University" (ID: ${crescentUniv.id})`);
            console.log(`Merging "${crescent.name}" → "Crescent University"\n`);

            await client.query('BEGIN');
            try {
                await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [crescentUniv.id, crescent.id]);
                await client.query('DELETE FROM universities WHERE id = $1', [crescent.id]);
                await client.query('COMMIT');
                console.log('✅ Successfully merged and deleted "Crescent"\n');
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('❌ Failed:', err);
            }
        } else {
            console.log('✅ No "Crescent" entry found - already clean\n');
        }

        console.log('=== FINAL RESULT ===\n');
        const { rows: finalUnivs } = await client.query('SELECT name FROM universities ORDER BY name');
        console.log(`🎉 Total: ${finalUnivs.length} universities\n`);
        finalUnivs.forEach((u, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${u.name}`));

        // Final verification
        console.log('\n=== Final Verification ===');
        const names = finalUnivs.map(u => u.name.toLowerCase().trim());
        const hasDuplicates = names.some((name, index) => names.indexOf(name) !== index);

        if (hasDuplicates) {
            console.log('⚠️ Still have duplicates!');
        } else {
            console.log('✅ All clean - no duplicates!');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

removeTrailingSpaces();
