import { db } from '../src/db/client';

async function listAllUniversities() {
    const client = await db.pool.connect();
    try {
        const { rows } = await client.query('SELECT id, name FROM universities ORDER BY name');

        console.log(`\n=== All Universities (${rows.length} total) ===\n`);
        rows.forEach((u, i) => {
            console.log(`${String(i + 1).padStart(2, ' ')}. ${u.name}`);
        });

        // Check for any name-based duplicates
        console.log('\n=== Checking for duplicates ===');
        const names = rows.map(r => r.name.toLowerCase().trim());
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

        if (duplicates.length === 0) {
            console.log('✅ No exact duplicates found');
        } else {
            console.log('⚠️ Found duplicates:');
            duplicates.forEach(d => console.log(`  - ${d}`));
        }

        // Check for similar names
        console.log('\n=== Checking for similar names ===');
        const similar = [];
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const name1 = rows[i].name.toLowerCase();
                const name2 = rows[j].name.toLowerCase();

                if (name1.includes(name2) || name2.includes(name1)) {
                    similar.push(`${rows[i].name} <-> ${rows[j].name}`);
                }
            }
        }

        if (similar.length === 0) {
            console.log('✅ No similar names found');
        } else {
            console.log('⚠️ Found similar names:');
            similar.forEach(s => console.log(`  - ${s}`));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

listAllUniversities();
