import { db } from '../db/client';
import { encryptString, decryptString } from '../crypto';

export type PIIField =
    | 'niat_id' | 'phone' | 'aadhaar' | 'email'
    | 'father_phone' | 'mother_phone' | 'emergency_contact'
    | 'date_of_birth' | 'gender' | 'blood_group' | 'father_name' | 'mother_name';

export type PIIPermission = 'MASKED_VIEW' | 'FULL_VIEW' | 'EDIT';

const PII_PERMISSION_MATRIX: Record<string, PIIPermission[]> = {
    ADMIN: ['MASKED_VIEW', 'FULL_VIEW', 'EDIT'],
    PROGRAM_OPS: ['MASKED_VIEW', 'FULL_VIEW', 'EDIT'],
    UNIVERSITY_OPERATOR: ['MASKED_VIEW', 'FULL_VIEW', 'EDIT'],
    COS: ['MASKED_VIEW', 'FULL_VIEW'],
    PM: ['MASKED_VIEW', 'FULL_VIEW'],
    PMA: ['MASKED_VIEW'],
    BOA: ['MASKED_VIEW'],
};

const PII_ACCESS_MATRIX: Record<string, PIIField[]> = {
    ADMIN: ['niat_id', 'phone', 'aadhaar', 'email', 'father_phone', 'mother_phone', 'emergency_contact', 'date_of_birth', 'gender', 'blood_group', 'father_name', 'mother_name'],
    PROGRAM_OPS: ['niat_id', 'phone', 'aadhaar', 'email', 'father_phone', 'mother_phone', 'emergency_contact', 'date_of_birth', 'gender', 'blood_group', 'father_name', 'mother_name'],
    UNIVERSITY_OPERATOR: ['niat_id', 'phone', 'email', 'father_phone', 'mother_phone', 'emergency_contact', 'date_of_birth', 'gender', 'blood_group', 'father_name', 'mother_name'],
    COS: ['niat_id', 'phone', 'email', 'gender', 'date_of_birth'],
    PM: ['niat_id', 'phone', 'email', 'gender', 'date_of_birth'],
    PMA: ['niat_id', 'phone', 'email'],
    BOA: ['niat_id', 'phone', 'email'],
};

export class StudentPIIService {

    static hasPIIPermission(role: string, permission: PIIPermission): boolean {
        return (PII_PERMISSION_MATRIX[role] || []).includes(permission);
    }

    /**
     * Encrypt and store PII data for a student profile.
     * Each field is individually encrypted with AES-256-GCM.
     */
    static async encryptAndStorePII(
        studentProfileId: string,
        piiData: Partial<Record<PIIField, string>>,
        actorId: string
    ) {
        // Encrypt each non-empty field
        const encryptedPii: Record<string, string> = {};
        const fieldsPresent: string[] = [];

        for (const [key, value] of Object.entries(piiData)) {
            if (value && value.trim()) {
                encryptedPii[key] = encryptString(value.trim());
                fieldsPresent.push(key);
            }
        }

        // Merge with existing encrypted_pii (don't overwrite fields not provided)
        await db.query(
            `UPDATE student_profiles
             SET encrypted_pii = COALESCE(encrypted_pii, '{}'::jsonb) || $1::jsonb,
                 pii_fields_present = (
                     SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(pii_fields_present, '{}') || $2::text[]))
                 ),
                 updated_at = NOW()
             WHERE id = $3`,
            [JSON.stringify(encryptedPii), fieldsPresent, studentProfileId]
        );

        return { fieldsStored: fieldsPresent.length };
    }

    /**
     * Decrypt PII fields based on the accessor's role.
     * Only returns fields the role is authorized to see.
     */
    static async decryptPII(
        studentProfileId: string,
        accessorRole: string,
        accessorId: string,
        fields?: PIIField[]
    ): Promise<Record<string, string>> {
        if (!this.hasPIIPermission(accessorRole, 'FULL_VIEW')) {
            throw new Error('Insufficient permissions to access student PII');
        }

        const allowedFields = PII_ACCESS_MATRIX[accessorRole] || [];
        if (allowedFields.length === 0) {
            throw new Error('Insufficient permissions to access student PII');
        }

        const result = await db.query(
            'SELECT encrypted_pii, pii_fields_present FROM student_profiles WHERE id = $1',
            [studentProfileId]
        );

        if (!result.rows[0]) throw new Error('Student profile not found');

        const encryptedPii = result.rows[0].encrypted_pii || {};
        const decrypted: Record<string, string> = {};

        const targetFields = fields
            ? fields.filter(f => allowedFields.includes(f))
            : allowedFields;

        for (const field of targetFields) {
            if (encryptedPii[field]) {
                try {
                    decrypted[field] = decryptString(encryptedPii[field]);
                } catch {
                    decrypted[field] = '[DECRYPTION_ERROR]';
                }
            }
        }

        // Log PII access (document_id is nullable after migration 0069)
        try {
            await db.query(
                `INSERT INTO document_access_logs (document_id, student_profile_id, accessed_by, access_type, ip_address)
                 VALUES (NULL, $1, $2, 'PII_ACCESS', $3)`,
                [studentProfileId, accessorId, `fields:${targetFields.join(',')}`]
            );
        } catch {
            // Audit log failure should not block PII access
        }

        return decrypted;
    }

    /**
     * Get masked PII for display (safe for any role to see).
     */
    static async getMaskedPII(studentProfileId: string): Promise<Record<string, string>> {
        const result = await db.query(
            'SELECT pii_fields_present, encrypted_pii FROM student_profiles WHERE id = $1',
            [studentProfileId]
        );

        if (!result.rows[0]) return {};

        const encryptedPii = result.rows[0].encrypted_pii || {};
        const masked: Record<string, string> = {};

        for (const field of (result.rows[0].pii_fields_present || [])) {
            if (encryptedPii[field]) {
                try {
                    const value = decryptString(encryptedPii[field]);
                    masked[field] = this.maskValue(value, field);
                } catch {
                    masked[field] = '••••••••';
                }
            }
        }

        return masked;
    }

    /**
     * Update a single PII field.
     */
    static async updatePIIField(
        studentProfileId: string,
        fieldName: PIIField,
        value: string,
        actorId: string
    ) {
        return this.encryptAndStorePII(studentProfileId, { [fieldName]: value }, actorId);
    }

    /**
     * Remove a PII field entirely.
     */
    static async removePIIField(studentProfileId: string, fieldName: PIIField, actorId: string) {
        await db.query(
            `UPDATE student_profiles
             SET encrypted_pii = encrypted_pii - $1,
                 pii_fields_present = array_remove(pii_fields_present, $1),
                 updated_at = NOW()
             WHERE id = $2`,
            [fieldName, studentProfileId]
        );
    }

    // ─── Masking helpers ───

    private static maskValue(value: string, fieldType: string): string {
        if (!value) return '••••';

        switch (fieldType) {
            case 'aadhaar':
                return `••••••${value.slice(-4)}`;
            case 'phone':
            case 'father_phone':
            case 'mother_phone':
            case 'emergency_contact':
                return `••••••${value.slice(-4)}`;
            case 'email':
                const [local, domain] = value.split('@');
                return `${local[0]}••••@${domain}`;
            case 'niat_id':
                return value.length > 4 ? `${value.slice(0, 2)}••${value.slice(-2)}` : value;
            case 'date_of_birth': {
                const year = value.split(/[-/]/).pop() || value.slice(-4);
                return `••/••/${year}`;
            }
            case 'gender':
                return value[0] + '••';
            case 'blood_group':
                return value;
            case 'father_name':
            case 'mother_name':
                return value.length > 2 ? `${value.slice(0, 2)}••••` : value;
            default:
                return `${value.slice(0, 2)}••••`;
        }
    }
}
