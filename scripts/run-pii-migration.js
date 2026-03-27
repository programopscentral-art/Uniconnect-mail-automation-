// Standalone PII migration script (no TypeScript deps needed)
const crypto = require('crypto');
module.paths.push(require('path').join(__dirname, '..', 'node_modules', '.pnpm', 'pg@8.17.2', 'node_modules'));
const { Client } = require('pg');

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY_BASE64, 'base64');
const PII_FIELDS = ['date_of_birth', 'gender', 'blood_group', 'father_name', 'mother_name'];
const BATCH_SIZE = 100;

function encryptString(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + encrypted + ':' + tag;
}

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log('[PII_MIGRATION] Starting PII field encryption migration...');

    let processed = 0, encrypted = 0;
    while (true) {
        const batch = await client.query(
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
            const newPii = {};
            const newFields = [];

            for (const field of PII_FIELDS) {
                const value = row[field];
                if (value && String(value).trim() && !existingPii[field]) {
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
                await client.query(
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
                await client.query(
                    'UPDATE student_profiles SET pii_migration_complete = TRUE WHERE id = $1',
                    [row.id]
                );
            }
            processed++;
        }
        console.log(`[PII_MIGRATION] Processed ${processed} profiles (${encrypted} encrypted)...`);
    }

    console.log(`[PII_MIGRATION] Complete! ${processed} profiles processed, ${encrypted} had PII to encrypt.`);
    await client.end();
}

migrate().catch(err => {
    console.error('[PII_MIGRATION] FATAL ERROR:', err);
    process.exit(1);
});
