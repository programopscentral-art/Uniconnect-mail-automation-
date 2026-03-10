import { db } from '../db/client';

export interface FacultyProfile {
    id: string;
    user_id: string;
    university_id: string;
    employee_code: string;
    department?: string;
    specialization?: string;
    designation?: string;
    joining_date?: Date;
    employment_status: string;
}

export interface FacultySubjectMapping {
    id: string;
    faculty_profile_id: string;
    subject_id: string;
    priority_level: number;
    can_substitute: boolean;
    preferred_section_id?: string;
}

export class FacultyService {
    // --- Profile Management ---

    static async createProfile(data: Omit<FacultyProfile, 'id'>) {
        const result = await db.query(
            `INSERT INTO faculty_profiles (user_id, university_id, employee_code, department, specialization, designation, joining_date, employment_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [data.user_id, data.university_id, data.employee_code, data.department, data.specialization, data.designation, data.joining_date, data.employment_status]
        );
        return result.rows[0] as FacultyProfile;
    }

    static async getProfileByUserId(userId: string) {
        const result = await db.query(
            'SELECT * FROM faculty_profiles WHERE user_id = $1 AND is_active = true',
            [userId]
        );
        return result.rows[0] as FacultyProfile | null;
    }

    // --- Subject Mappings ---

    static async mapSubject(data: Omit<FacultySubjectMapping, 'id'>) {
        const result = await db.query(
            `INSERT INTO faculty_subject_mappings (faculty_profile_id, subject_id, priority_level, can_substitute, preferred_section_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [data.faculty_profile_id, data.subject_id, data.priority_level, data.can_substitute, data.preferred_section_id]
        );
        return result.rows[0] as FacultySubjectMapping;
    }

    static async getFacultyMappings(facultyProfileId: string) {
        const result = await db.query(
            `SELECT m.*, s.name as subject_name, s.code as subject_code
             FROM faculty_subject_mappings m
             JOIN subjects s ON m.subject_id = s.id
             WHERE m.faculty_profile_id = $1`,
            [facultyProfileId]
        );
        return result.rows;
    }

    // --- Availability & Leave ---

    static async updateAvailability(facultyProfileId: string, availabilityGroups: any[]) {
        // Clear existing and insert new
        await db.query('DELETE FROM faculty_availability WHERE faculty_profile_id = $1', [facultyProfileId]);

        if (availabilityGroups.length === 0) return;

        const values = [];
        const placeholders = [];
        let i = 1;

        for (const slot of availabilityGroups) {
            values.push(facultyProfileId, slot.day_of_week, slot.slot_start, slot.slot_end, slot.availability_type || 'AVAILABLE');
            placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        }

        await db.query(
            `INSERT INTO faculty_availability (faculty_profile_id, day_of_week, slot_start, slot_end, availability_type)
             VALUES ${placeholders.join(', ')}`,
            values
        );
    }

    static async requestLeave(facultyProfileId: string, data: { leave_date: Date; leave_type: string; reason: string }) {
        const result = await db.query(
            `INSERT INTO faculty_leave_requests (faculty_profile_id, leave_date, leave_type, reason, approval_status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             RETURNING *`,
            [facultyProfileId, data.leave_date, data.leave_type, data.reason]
        );

        // Also create a entry in approvals table for generic workflow support
        await db.query(
            `INSERT INTO approvals (workflow_type, entity_type, entity_id, requested_by, requested_at)
             SELECT 'leave_request', 'faculty_leave_request', $1, u.id, NOW()
             FROM faculty_profiles fp
             JOIN users u ON fp.user_id = u.id
             WHERE fp.id = $2`,
            [result.rows[0].id, facultyProfileId]
        );

        return result.rows[0];
    }

    static async ensureFacultyProfilesSchema() {
        await db.query(`ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id) ON DELETE CASCADE`);
        await db.query(`ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS employee_code TEXT`);
        await db.query(`ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'ACTIVE'`);
        await db.query(`ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS joining_date DATE`);
        await db.query(`ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS department TEXT`);
        await db.query(`ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS specialization TEXT`);
        await db.query(`ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS designation TEXT`);
        await db.query(`ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
        await db.query(`ALTER TABLE faculty_profiles ALTER COLUMN user_id DROP NOT NULL`);
        // Convert specialization from text[] to text if needed
        await db.query(`
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_attribute a
                    JOIN pg_class c ON c.oid = a.attrelid
                    JOIN pg_type t ON t.oid = a.atttypid
                    WHERE c.relname = 'faculty_profiles' AND a.attname = 'specialization'
                    AND t.typname = '_text'
                ) THEN
                    ALTER TABLE faculty_profiles ALTER COLUMN specialization TYPE TEXT USING array_to_string(specialization, ', ');
                END IF;
            END $$`);
        await db.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'faculty_profiles_university_id_employee_code_key'
                ) THEN
                    ALTER TABLE faculty_profiles ADD CONSTRAINT faculty_profiles_university_id_employee_code_key UNIQUE (university_id, employee_code);
                END IF;
            END $$`);
    }

    static async importFaculty(universityId: string, facultyList: any[]) {
        const results = { success: 0, failed: 0, errors: [] as string[] };
        if (!facultyList.length) return results;

        // Auto-migrate schema before importing
        await FacultyService.ensureFacultyProfilesSchema();

        const today = new Date().toISOString().split('T')[0];

        // Step 1: resolve/create users in batch
        const emails = facultyList.map(f => (f.email || `${f.employee_code}@uniconnect.edu`).trim().toLowerCase());
        const existRes = await db.query(`SELECT id, email FROM users WHERE email = ANY($1)`, [emails]);
        const emailToUserId = new Map<string, string>(existRes.rows.map((r: any) => [r.email.toLowerCase(), r.id]));

        const newOnes = facultyList.filter(f => {
            const em = (f.email || `${f.employee_code}@uniconnect.edu`).trim().toLowerCase();
            return !emailToUserId.has(em);
        });
        if (newOnes.length > 0) {
            const vals = newOnes.map((_, i) => `($${i*4+1}, $${i*4+2}, 'FACULTY', $${i*4+3}, $${i*4+4})`).join(', ');
            const params = newOnes.flatMap(f => [
                (f.email || `${f.employee_code}@uniconnect.edu`).trim().toLowerCase(),
                f.name,
                universityId,
                f.phone ? String(f.phone).trim() : null
            ]);
            const inserted = await db.query(
                `INSERT INTO users (email, name, role, university_id, phone) VALUES ${vals}
                 ON CONFLICT (email) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, users.phone)
                 RETURNING id, email`,
                params
            );
            for (const r of inserted.rows) emailToUserId.set(r.email.toLowerCase(), r.id);
            // pick up any that conflicted
            const stillMissing = newOnes
                .map(f => (f.email || `${f.employee_code}@uniconnect.edu`).trim().toLowerCase())
                .filter(em => !emailToUserId.has(em));
            if (stillMissing.length > 0) {
                const recheck = await db.query(`SELECT id, email FROM users WHERE email = ANY($1)`, [stillMissing]);
                for (const r of recheck.rows) emailToUserId.set(r.email.toLowerCase(), r.id);
            }
        }

        // Step 2: update phone for existing users
        const withPhone = facultyList.filter(f => {
            const em = (f.email || `${f.employee_code}@uniconnect.edu`).trim().toLowerCase();
            return f.phone && existRes.rows.some((r: any) => r.email.toLowerCase() === em);
        });
        await Promise.all(withPhone.map(f => {
            const em = (f.email || `${f.employee_code}@uniconnect.edu`).trim().toLowerCase();
            const uid = emailToUserId.get(em);
            return uid ? db.query(`UPDATE users SET phone = $1 WHERE id = $2`, [String(f.phone).trim(), uid]) : Promise.resolve();
        }));

        // Step 3: batch upsert faculty_profiles
        const valid = facultyList.filter(f => f.employee_code?.trim());
        if (valid.length > 0) {
            const pVals = valid.map((_, i) =>
                `($${i*7+1}, $${i*7+2}, $${i*7+3}, $${i*7+4}, $${i*7+5}, $${i*7+6}, $${i*7+7}, 'ACTIVE', true)`
            ).join(', ');
            const pParams = valid.flatMap(f => {
                const em = (f.email || `${f.employee_code}@uniconnect.edu`).trim().toLowerCase();
                return [
                    emailToUserId.get(em) ?? null,
                    universityId,
                    f.employee_code.trim(),
                    f.department || 'General',
                    f.specialization || 'Teaching',
                    f.designation || 'Assistant Professor',
                    today
                ];
            });
            await db.query(
                `INSERT INTO faculty_profiles (user_id, university_id, employee_code, department, specialization, designation, joining_date, employment_status, is_active)
                 VALUES ${pVals}
                 ON CONFLICT (university_id, employee_code) DO UPDATE SET
                     user_id = COALESCE(EXCLUDED.user_id, faculty_profiles.user_id),
                     department = EXCLUDED.department,
                     updated_at = NOW()`,
                pParams
            );
        }

        // Step 4: role assignments in batch
        const userIds = [...emailToUserId.values()];
        if (userIds.length > 0) {
            const roleRes = await db.query(`SELECT id FROM roles WHERE code = 'faculty' LIMIT 1`);
            const roleId = roleRes.rows[0]?.id;
            if (roleId) {
                const rVals = userIds.map((_, i) => `($${i+1}, '${roleId}', '${universityId}', TRUE)`).join(', ');
                await db.query(
                    `INSERT INTO user_role_assignments (user_id, role_id, university_id, is_primary)
                     VALUES ${rVals} ON CONFLICT DO NOTHING`,
                    userIds
                );
            }
        }

        // Step 5: subject mappings (batch lookup then batch insert)
        const allSubjectCodes = [...new Set(
            facultyList.flatMap(f => (f.subject_codes || []).map((c: string) => c.trim().toUpperCase()).filter(Boolean))
        )];
        const codeToSubjectId = new Map<string, string>();
        if (allSubjectCodes.length > 0) {
            const subRes = await db.query(
                `SELECT id, UPPER(code) as code FROM subjects WHERE university_id = $1 AND UPPER(code) = ANY($2) AND is_active = true`,
                [universityId, allSubjectCodes]
            );
            for (const r of subRes.rows) codeToSubjectId.set(r.code, r.id);
        }

        // Get faculty profile ids
        const empCodes = valid.map(f => f.employee_code.trim());
        const profileRes = await db.query(
            `SELECT id, employee_code FROM faculty_profiles WHERE university_id = $1 AND employee_code = ANY($2)`,
            [universityId, empCodes]
        );
        const codeToProfileId = new Map<string, string>(profileRes.rows.map((r: any) => [r.employee_code, r.id]));

        const mappingRows: string[] = [];
        for (const f of facultyList) {
            const profileId = codeToProfileId.get(f.employee_code?.trim());
            if (!profileId) continue;
            for (const code of (f.subject_codes || [])) {
                const subjectId = codeToSubjectId.get(code.trim().toUpperCase());
                if (subjectId) mappingRows.push(`('${profileId}', '${subjectId}', 1, true)`);
            }
        }
        if (mappingRows.length > 0) {
            await db.query(
                `INSERT INTO faculty_subject_mappings (faculty_profile_id, subject_id, priority_level, can_substitute)
                 VALUES ${mappingRows.join(', ')} ON CONFLICT DO NOTHING`
            );
        }

        results.success = valid.length;
        results.failed = facultyList.length - valid.length;
        for (let i = 0; i < results.failed; i++) results.errors.push('Row skipped — missing employee code');
        return results;
    }
}
