import { db } from './client';

export interface AssessmentBatch {
    id: string;
    university_id: string;
    name: string;
    created_at: Date;
    updated_at: Date;
}

export interface AssessmentBranch {
    id: string;
    university_id: string;
    batch_id?: string;
    name: string;
    code: string;
    created_at: Date;
    updated_at: Date;
}

export interface AssessmentSubject {
    id: string;
    branch_id: string;
    batch_id?: string;
    name: string;
    code: string;
    semester: number;
    syllabus_content?: string;
    difficulty_levels?: string[]; // e.g. ["L1", "L2", "L3"]
    created_at: Date;
    updated_at: Date;
}

export interface AssessmentUnit {
    id: string;
    subject_id: string;
    unit_number: number;
    name?: string;
}

export interface AssessmentTopic {
    id: string;
    unit_id: string;
    name: string;
    parent_topic_id?: string;
}

export interface AssessmentQuestion {
    id: string;
    unit_id?: string;
    topic_id?: string;
    co_id?: string;
    question_text: string;
    bloom_level: string;
    marks: number;
    type?: 'NORMAL' | 'MCQ' | 'SHORT' | 'LONG';
    options?: string[]; // (a), (b), (c), (d)
    answer_key?: string;
    is_important?: boolean;
    created_at?: Date;
    updated_at?: Date;
}

export interface AssessmentCourseOutcome {
    id: string;
    subject_id: string;
    code: string;
    description: string;
    created_at: Date;
    updated_at: Date;
}

// Batches
export async function getAssessmentBatches(universityId: string): Promise<AssessmentBatch[]> {
    const { rows } = await db.query(
        'SELECT * FROM assessment_batches WHERE university_id = $1 ORDER BY created_at DESC',
        [universityId]
    );
    return rows;
}

export async function createAssessmentBatch(data: Partial<AssessmentBatch>): Promise<AssessmentBatch> {
    const { rows } = await db.query(
        'INSERT INTO assessment_batches (university_id, name) VALUES ($1, $2) RETURNING *',
        [data.university_id, data.name]
    );
    return rows[0];
}

export async function updateAssessmentBatch(id: string, data: Partial<AssessmentBatch>): Promise<AssessmentBatch> {
    const { rows } = await db.query(
        'UPDATE assessment_batches SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [data.name, id]
    );
    return rows[0];
}

export async function deleteAssessmentBatch(id: string): Promise<void> {
    await db.query('DELETE FROM assessment_batches WHERE id = $1', [id]);
}

// Branches
export async function getAssessmentBranches(universityId: string, batchId?: string): Promise<AssessmentBranch[]> {
    let query = 'SELECT * FROM assessment_branches WHERE university_id = $1';
    const params: any[] = [universityId];

    if (batchId) {
        query += ' AND batch_id = $2';
        params.push(batchId);
    }

    query += ' ORDER BY name ASC';
    const { rows } = await db.query(query, params);
    return rows;
}

export async function createAssessmentBranch(data: Partial<AssessmentBranch>): Promise<AssessmentBranch> {
    const { rows } = await db.query(
        'INSERT INTO assessment_branches (university_id, batch_id, name, code) VALUES ($1, $2, $3, $4) RETURNING *',
        [data.university_id, data.batch_id, data.name, data.code]
    );
    return rows[0];
}

export async function updateAssessmentBranch(id: string, data: Partial<AssessmentBranch>): Promise<AssessmentBranch> {
    const { rows } = await db.query(
        'UPDATE assessment_branches SET name = $1, code = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
        [data.name, data.code, id]
    );
    return rows[0];
}

export async function deleteAssessmentBranch(id: string): Promise<void> {
    await db.query('DELETE FROM assessment_branches WHERE id = $1', [id]);
}

// Subjects
export async function getAssessmentSubjects(branchId: string, semester?: number, batchId?: string): Promise<AssessmentSubject[]> {
    let query = 'SELECT * FROM assessment_subjects WHERE branch_id = $1';
    const params: any[] = [branchId];
    let i = 2;

    if (batchId) {
        query += ` AND batch_id = $${i++}`;
        params.push(batchId);
    }

    if (semester) {
        query += ` AND semester = $${i++}`;
        params.push(semester);
    }

    query += ' ORDER BY semester ASC, name ASC';
    const { rows } = await db.query(query, params);
    return rows;
}

export async function createAssessmentSubject(data: Partial<AssessmentSubject>): Promise<AssessmentSubject> {
    const { rows } = await db.query(
        'INSERT INTO assessment_subjects (branch_id, batch_id, name, code, semester, difficulty_levels) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [data.branch_id, data.batch_id, data.name, data.code, data.semester, data.difficulty_levels || ['L1', 'L2', 'L3']]
    );
    return rows[0];
}

export async function updateAssessmentSubject(id: string, data: Partial<AssessmentSubject>): Promise<AssessmentSubject> {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (data.name) { fields.push(`name = $${i++}`); params.push(data.name); }
    if (data.code) { fields.push(`code = $${i++}`); params.push(data.code); }
    if (data.semester) { fields.push(`semester = $${i++}`); params.push(data.semester); }
    if (data.difficulty_levels) { fields.push(`difficulty_levels = $${i++}`); params.push(data.difficulty_levels); }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await db.query(
        `UPDATE assessment_subjects SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        params
    );
    return rows[0];
}

export async function deleteAssessmentSubject(id: string): Promise<void> {
    await db.query('DELETE FROM assessment_subjects WHERE id = $1', [id]);
}

// Units
export async function getAssessmentUnits(subjectId: string): Promise<AssessmentUnit[]> {
    const { rows } = await db.query(
        'SELECT * FROM assessment_units WHERE subject_id = $1 ORDER BY unit_number ASC',
        [subjectId]
    );
    return rows;
}

export async function createAssessmentUnit(data: Partial<AssessmentUnit>): Promise<AssessmentUnit> {
    const { rows } = await db.query(
        'INSERT INTO assessment_units (subject_id, unit_number, name) VALUES ($1, $2, $3) RETURNING *',
        [data.subject_id, data.unit_number, data.name]
    );
    return rows[0];
}

export async function deleteAssessmentUnit(id: string): Promise<void> {
    await db.query('DELETE FROM assessment_units WHERE id = $1', [id]);
}

// Topics
export async function getAssessmentTopics(unitId: string): Promise<AssessmentTopic[]> {
    const { rows } = await db.query(
        'SELECT * FROM assessment_topics WHERE unit_id = $1 ORDER BY name ASC',
        [unitId]
    );
    return rows;
}

export async function createAssessmentTopic(data: Partial<AssessmentTopic>): Promise<AssessmentTopic> {
    const { rows } = await db.query(
        'INSERT INTO assessment_topics (unit_id, name, parent_topic_id) VALUES ($1, $2, $3) RETURNING *',
        [data.unit_id, data.name, data.parent_topic_id]
    );
    return rows[0];
}

export async function deleteAssessmentTopic(id: string): Promise<void> {
    await db.query('DELETE FROM assessment_topics WHERE id = $1', [id]);
}

// Questions
export async function getAssessmentQuestions(topicId?: string, unitId?: string): Promise<AssessmentQuestion[]> {
    let query = 'SELECT * FROM assessment_questions WHERE 1=1';
    const params: any[] = [];
    let i = 1;

    if (topicId) {
        query += ` AND topic_id = $${i++}`;
        params.push(topicId);
    }

    if (unitId) {
        query += ` AND unit_id = $${i++}`;
        params.push(unitId);
    }

    query += ' ORDER BY marks ASC, created_at DESC';
    const { rows } = await db.query(query, params);
    return rows;
}

export async function getQuestionsByTopics(topicIds: string[]): Promise<AssessmentQuestion[]> {
    if (!topicIds || topicIds.length === 0) return [];
    const { rows } = await db.query(
        'SELECT * FROM assessment_questions WHERE topic_id = ANY($1)',
        [topicIds]
    );
    return rows;
}

export async function getQuestionsByUnits(unitIds: string[]): Promise<AssessmentQuestion[]> {
    if (!unitIds || unitIds.length === 0) return [];
    const { rows } = await db.query(
        'SELECT * FROM assessment_questions WHERE unit_id = ANY($1)',
        [unitIds]
    );
    return rows;
}

export async function createAssessmentQuestion(data: Partial<AssessmentQuestion>): Promise<AssessmentQuestion> {
    const { rows } = await db.query(
        'INSERT INTO assessment_questions (unit_id, topic_id, co_id, question_text, bloom_level, marks, type, options, answer_key, is_important) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [data.unit_id, data.topic_id, data.co_id, data.question_text, data.bloom_level, data.marks, data.type || 'NORMAL', data.options ? JSON.stringify(data.options) : null, data.answer_key, data.is_important || false]
    );
    return rows[0];
}

export async function updateAssessmentQuestion(id: string, data: Partial<AssessmentQuestion>): Promise<AssessmentQuestion> {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (data.question_text) { fields.push(`question_text = $${i++}`); params.push(data.question_text); }
    if (data.co_id !== undefined) { fields.push(`co_id = $${i++}`); params.push(data.co_id); }
    if (data.bloom_level) { fields.push(`bloom_level = $${i++}`); params.push(data.bloom_level); }
    if (data.marks !== undefined) { fields.push(`marks = $${i++}`); params.push(data.marks); }
    if (data.answer_key !== undefined) { fields.push(`answer_key = $${i++}`); params.push(data.answer_key); }
    if (data.is_important !== undefined) { fields.push(`is_important = $${i++}`); params.push(data.is_important); }

    if (data.type) { fields.push(`type = $${i++}`); params.push(data.type); }
    if (data.options !== undefined) {
        fields.push(`options = $${i++}`);
        params.push(data.options ? JSON.stringify(data.options) : null);
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await db.query(
        `UPDATE assessment_questions SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        params
    );
    return rows[0];
}

export async function deleteAssessmentQuestion(id: string): Promise<void> {
    await db.query('DELETE FROM assessment_questions WHERE id = $1', [id]);
}

// Course Outcomes
export async function getCourseOutcomes(subjectId: string): Promise<AssessmentCourseOutcome[]> {
    const { rows } = await db.query(
        'SELECT * FROM assessment_course_outcomes WHERE subject_id = $1 ORDER BY code ASC',
        [subjectId]
    );
    return rows;
}

export async function createCourseOutcome(data: Partial<AssessmentCourseOutcome>): Promise<AssessmentCourseOutcome> {
    const { rows } = await db.query(
        'INSERT INTO assessment_course_outcomes (subject_id, code, description) VALUES ($1, $2, $3) RETURNING *',
        [data.subject_id, data.code, data.description]
    );
    return rows[0];
}

export async function updateCourseOutcome(id: string, data: Partial<AssessmentCourseOutcome>): Promise<AssessmentCourseOutcome> {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (data.code) { fields.push(`code = $${i++}`); params.push(data.code); }
    if (data.description) { fields.push(`description = $${i++}`); params.push(data.description); }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await db.query(
        `UPDATE assessment_course_outcomes SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        params
    );
    return rows[0];
}

export async function deleteCourseOutcome(id: string): Promise<void> {
    await db.query('DELETE FROM assessment_course_outcomes WHERE id = $1', [id]);
}
