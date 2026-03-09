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
}
