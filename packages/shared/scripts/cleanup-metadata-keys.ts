import { db } from '../src/db/client';

async function trimMetadataKeys() {
    const client = await db.pool.connect();
    try {
        console.log('=== Trimming all Student Metadata Keys ===\n');

        const { rows: students } = await client.query('SELECT id, metadata FROM students');
        console.log(`Found ${students.length} students to process.`);

        let updatedCount = 0;

        for (const student of students) {
            if (!student.metadata) continue;

            const newMetadata: any = {};
            let changed = false;

            Object.entries(student.metadata).forEach(([k, v]) => {
                const trimmedKey = k.trim();
                const trimmedValue = typeof v === 'string' ? v.trim() : v;

                if (trimmedKey !== k || trimmedValue !== v) {
                    changed = true;
                }
                newMetadata[trimmedKey] = trimmedValue;
            });

            if (changed) {
                await client.query(
                    'UPDATE students SET metadata = $1, updated_at = NOW() WHERE id = $2',
                    [newMetadata, student.id]
                );
                updatedCount++;
            }
        }

        console.log(`\n✅ Done! Updated ${updatedCount} students.`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await db.pool.end();
        process.exit(0);
    }
}

trimMetadataKeys();
