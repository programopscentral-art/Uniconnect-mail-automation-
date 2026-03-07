import { db } from './client';

export interface Program {
    id: string;
    university_id: string;
    name: string;
    code: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface AcademicPeriod {
    id: string;
    university_id: string;
    name: string;
    start_date: Date;
    end_date: Date;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface Subject {
    id: string;
    program_id: string | null;
    name: string;
    code: string;
    credits: number;
    total_sessions_required: number;
    created_at: Date;
    updated_at: Date;
}

export interface Section {
    id: string;
    program_id: string;
    name: string;
    academic_period_id: string | null;
    capacity: number;
    created_at: Date;
    updated_at: Date;
}

export interface Classroom {
    id: string;
    university_id: string;
    name: string;
    building: string | null;
    floor: string | null;
    capacity: number;
    amenities: string[];
    created_at: Date;
    updated_at: Date;
}

export interface FacultyProfile {
    id: string;
    user_id: string;
    employee_id: string | null;
    designation: string | null;
    department: string | null;
    specialization: string[];
    availability_config: any;
    created_at: Date;
    updated_at: Date;
}

export interface StudentProfile {
    id: string;
    user_id: string;
    roll_number: string | null;
    program_id: string | null;
    section_id: string | null;
    current_semester: number | null;
    created_at: Date;
    updated_at: Date;
}

// Queries for Programs
export async function getPrograms(universityId: string) {
    const result = await db.query(`SELECT * FROM programs WHERE university_id = $1 ORDER BY name ASC`, [universityId]);
    return result.rows as Program[];
}

export async function createProgram(data: { university_id: string; name: string; code: string; description?: string }) {
    const result = await db.query(
        `INSERT INTO programs (university_id, name, code, description) VALUES ($1, $2, $3, $4) RETURNING *`,
        [data.university_id, data.name, data.code, data.description || null]
    );
    return result.rows[0] as Program;
}

// Queries for Academic Periods
export async function getAcademicPeriods(universityId: string) {
    const result = await db.query(`SELECT * FROM academic_periods WHERE university_id = $1 ORDER BY start_date DESC`, [universityId]);
    return result.rows as AcademicPeriod[];
}

// Queries for Subjects
export async function getSubjects(programId: string) {
    const result = await db.query(`SELECT * FROM subjects WHERE program_id = $1 ORDER BY name ASC`, [programId]);
    return result.rows as Subject[];
}

// Queries for Sections
export async function getSections(programId: string) {
    const result = await db.query(`SELECT * FROM sections WHERE program_id = $1 ORDER BY name ASC`, [programId]);
    return result.rows as Section[];
}

// Queries for Classrooms
export async function getClassrooms(universityId: string) {
    const result = await db.query(`SELECT * FROM classrooms WHERE university_id = $1 ORDER BY name ASC`, [universityId]);
    return result.rows as Classroom[];
}
