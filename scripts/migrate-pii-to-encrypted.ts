/**
 * One-time migration script to encrypt existing plain-text PII fields
 * (date_of_birth, gender, blood_group, father_name, mother_name)
 * into the encrypted_pii JSONB column.
 *
 * Run with: npx tsx scripts/migrate-pii-to-encrypted.ts
 * Requires: ENCRYPTION_KEY_BASE64 and DATABASE_URL in environment
 */

import { db } from '../packages/shared/src/db/client';
import { encryptString } from '../packages/shared/src/crypto';

const PII_FIELDS_TO_MIGRATE = ['date_of_birth', 'gender', 'blood_group', 'father_name', 'mother_name'];
const BATCH_SIZE = 100;

async function migrate() {
    console.log('[PII_MIGRATION] Starting PII field encryption migration...');

    let processed = 0;
    let encrypted = 0;

    while (true) {
        const batch = await db.query(
            `SELECT id, date_of_birth, gender, blood_group, father_name, mother_name,
                    encrypted_pii, pii_fields_present
             FROM student_profiles
             WHERE pii_migration_complete = FALSE OR pii_migration_complete IS NULL
             LIMIT $1`,
            [BATCH_SIZE]
        );

        if (batch.rows.length === 0) break;

        for (const row of batch.rows) {
            const existingPii = row.encrypted_pii || {};
            const existingFields = row.pii_fields_present || [];
            const newPii: Record<string, string> = {};
            const newFields: string[] = [];

            for (const field of PII_FIELDS_TO_MIGRATE) {
                const value = row[field];
                if (value && String(value).trim() && !existingPii[field]) {
                    // Convert date_of_birth to string format
                    const strValue = field === 'date_of_birth' && value instanceof Date
                        ? value.toISOString().split('T')[0]
                        : String(value).trim();

                    newPii[field] = encryptString(strValue);
                    newFields.push(field);
                }
            }

            if (Object.keys(newPii).length > 0) {
                const mergedPii = { ...existingPii, ...newPii };
                const mergedFields = [...new Set([...existingFields, ...newFields])];

                await db.query(
                    `UPDATE student_profiles
                     SET encrypted_pii = $1::jsonb,
                         pii_fields_present = $2,
                         pii_migration_complete = TRUE,
                         updated_at = NOW()
                     WHERE id = $3`,
                    [JSON.stringify(mergedPii), mergedFields, row.id]
                );
                encrypted++;
            } else {
                await db.query(
                    'UPDATE student_profiles SET pii_migration_complete = TRUE WHERE id = $1',
                    [row.id]
                );
            }

            processed++;
        }

        console.log(`[PII_MIGRATION] Processed ${processed} profiles (${encrypted} encrypted)...`);
    }

    console.log(`[PII_MIGRATION] Complete! ${processed} profiles processed, ${encrypted} had PII to encrypt.`);
    process.exit(0);
}

migrate().catch(err => {
    console.error('[PII_MIGRATION] FATAL ERROR:', err);
    process.exit(1);
});
