import { db } from '../src/db/client';

async function directMerge() {
    const client = await db.pool.connect();
    try {
        console.log('=== Direct Merge of Remaining Duplicates ===\n');

        // Merge Crescent → Crescent University
        console.log('1. Merging "Crescent" into "Crescent University"');
        const crescentId = '54ea7cbf-6b56-4d8b-9045-2efa02b13856';
        const crescentUnivId = 'c6c8c4f0-d5b0-46a1-bbb5-d48dce91d60c';

        await client.query('BEGIN');
        try {
            await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [crescentUnivId, crescentId]);
            await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [crescentUnivId, crescentId]);
            await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [crescentUnivId, crescentId]);
            await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [crescentUnivId, crescentId]);
            await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [crescentUnivId, crescentId]);
            await client.query('DELETE FROM universities WHERE id = $1', [crescentId]);
            await client.query('COMMIT');
            console.log('   ✅ Crescent merged successfully\n');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('   ❌ Failed:', err);
        }

        // Merge NIAT → NIAT Chevella
        console.log('2. Merging "NIAT" into "NIAT Chevella"');
        const niatId = '572f2394-2945-423f-9358-6188b42694a3';
        const niatChevellaId = '6eebf3cb-8718-421b-bf31-3f341c9d19fe';

        await client.query('BEGIN');
        try {
            await client.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [niatChevellaId, niatId]);
            await client.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [niatChevellaId, niatId]);
            await client.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [niatChevellaId, niatId]);
            await client.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [niatChevellaId, niatId]);
            await client.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [niatChevellaId, niatId]);
            await client.query('DELETE FROM universities WHERE id = $1', [niatId]);
            await client.query('COMMIT');
            console.log('   ✅ NIAT merged successfully\n');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('   ❌ Failed:', err);
        }

        console.log('=== ✅ FINAL CLEANUP COMPLETE ===\n');

        const { rows: finalUnivs } = await client.query('SELECT name FROM universities ORDER BY name');
        console.log(`🎉 Total: ${finalUnivs.length} universities\n`);
        finalUnivs.forEach((u, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${u.name}`));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

directMerge();
