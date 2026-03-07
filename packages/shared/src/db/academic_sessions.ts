import { db } from './client';

export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'RESCHEDULED' | 'CANCELLED';
export type SessionType = 'LECTURE' | 'LAB' | 'EXAM' | 'WORKSHOP';

export interface AcademicSession {
    id: string;
    university_id: string;
    subject_id: string;
    faculty_id: string | null;
    section_id: string;
    classroom_id: string | null;
    start_time: Date;
    end_time: Date;
    status: SessionStatus;
    session_type: SessionType;
    version: number;
    parent_session_id: string | null;
    metadata: any;
    created_at: Date;
    updated_at: Date;
}

export interface Attendance {
    id: string;
    session_id: string;
    student_id: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    marked_at: Date;
    marked_by_user_id: string | null;
}

export async function getSessionsForDate(universityId: string, date: string) {
    const result = await db.query(
        `SELECT s.*, sub.name as subject_name, sec.name as section_name, c.name as classroom_name, u.name as faculty_name
         FROM academic_sessions s
         JOIN subjects sub ON s.subject_id = sub.id
         JOIN sections sec ON s.section_id = sec.id
         LEFT JOIN classrooms c ON s.classroom_id = c.id
         LEFT JOIN faculty_profiles f ON s.faculty_id = f.id
         LEFT JOIN users u ON f.user_id = u.id
         WHERE s.university_id = $1 AND s.start_time::date = $2::date
         ORDER BY s.start_time ASC`,
        [universityId, date]
    );
    return result.rows;
}

export async function createSession(data: any) {
    const result = await db.query(
        `INSERT INTO academic_sessions (university_id, subject_id, faculty_id, section_id, classroom_id, start_time, end_time, session_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [data.university_id, data.subject_id, data.faculty_id, data.section_id, data.classroom_id, data.start_time, data.end_time, data.session_type, data.metadata || {}]
    );
    return result.rows[0] as AcademicSession;
}

export async function markAttendance(sessionId: string, studentId: string, status: Attendance['status'], markedBy: string) {
    const result = await db.query(
        `INSERT INTO attendance (session_id, student_id, status, marked_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_id, student_id) DO UPDATE SET
            status = EXCLUDED.status,
            marked_at = NOW(),
            marked_by_user_id = EXCLUDED.marked_by_user_id
         RETURNING *`,
        [sessionId, studentId, status, markedBy]
    );
    return result.rows[0] as Attendance;
}
