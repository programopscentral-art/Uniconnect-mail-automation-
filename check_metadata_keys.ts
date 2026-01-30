/**
 * Debug script to check actual student metadata keys vs template expectations
 * This will help identify key mismatches causing merge failures
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
const pool = new Pool({ connectionString: DATABASE_URL });

async function checkMetadata() {
    try {
        console.log('=== Checking Student Metadata Keys ===\n');

        // Get a sample student with metadata
        const result = await pool.query(`
            SELECT id, name, email, metadata 
            FROM students 
            WHERE metadata IS NOT NULL 
            AND metadata::text != '{}' 
            LIMIT 5
        `);

        if (result.rows.length === 0) {
            console.log('❌ No students found with metadata!');
            process.exit(1);
        }

        console.log(`Found ${result.rows.length} students with metadata:\n`);

        result.rows.forEach((student, idx) => {
            console.log(`\n--- Student ${idx + 1}: ${student.name} (${student.email}) ---`);

            let metadata = student.metadata;
            if (typeof metadata === 'string') {
                try {
                    metadata = JSON.parse(metadata);
                } catch (e) {
                    console.log('Failed to parse metadata:', e);
                    return;
                }
            }

            const keys = Object.keys(metadata);
            console.log(`Total keys: ${keys.length}`);
            console.log('\nMetadata keys:');
            keys.forEach(key => {
                const value = metadata[key];
                console.log(`  "${key}": "${value}"`);
            });

            // Check for the specific keys we're looking for
            console.log('\n🔍 Checking for expected keys:');
            const expectedKeys = [
                'Term 1 Fee adjustment (O/S +ve and Excess -Ve)',
                'Total Term 2 Fee Payabale (Includes Term 2 & Term 1 adjustments)',
                'Total Term 2 Fee Payable (Includes Term 2 & Term 1 adjustments)', // Check both spellings
                'Semester 2 General Fee Amount'
            ];

            expectedKeys.forEach(expectedKey => {
                const exists = keys.includes(expectedKey);
                console.log(`  ${exists ? '✅' : '❌'} "${expectedKey}"`);
                if (!exists) {
                    // Try to find similar keys
                    const similar = keys.filter(k =>
                        k.toLowerCase().includes('term') ||
                        k.toLowerCase().includes('fee') ||
                        k.toLowerCase().includes('adjustment')
                    );
                    if (similar.length > 0) {
                        console.log(`     Similar keys found: ${similar.join(', ')}`);
                    }
                }
            });
        });

        await pool.end();

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkMetadata();
