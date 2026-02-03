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
    type?: 'NORMAL' | 'MCQ' | 'SHORT' | 'LONG' | 'FILL_IN_BLANK' | 'PARAGRAPH';
    options?: string[]; // (a), (b), (c), (d)
    answer_key?: string;
    image_url?: string;
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

export interface AssessmentTemplate {
    id: string;
    university_id: string;
    name: string;
    slug?: string;
    exam_type: string;
    version: number;
    status: 'draft' | 'published' | 'archived';
    source_type: 'imported' | 'manual';
    config: any;
    layout_schema: any;
    assets: any; // Renamed from assets_json for contract alignment
    base_template_id?: string;
    created_by?: string;
    updated_by?: string;
    created_at: Date;
    updated_at: Date;
}

export interface UniversityAsset {
    id: string;
    university_id: string;
    name: string;
    url: string;
    type: 'image' | 'logo' | 'seal' | 'other';
    metadata?: any;
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
        'INSERT INTO assessment_questions (unit_id, topic_id, co_id, question_text, bloom_level, marks, type, options, answer_key, image_url, is_important) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
        [data.unit_id, data.topic_id, data.co_id, data.question_text, data.bloom_level, data.marks, data.type || 'NORMAL', data.options ? JSON.stringify(data.options) : null, data.answer_key, data.image_url, data.is_important || false]
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
    if (data.image_url !== undefined) { fields.push(`image_url = $${i++}`); params.push(data.image_url); }
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

// Assessment Templates
export async function getAssessmentTemplates(universityId: string): Promise<AssessmentTemplate[]> {
    const { rows } = await db.query(
        'SELECT * FROM assessment_templates WHERE university_id = $1 AND (status IS NULL OR status != \'archived\') ORDER BY name ASC, version DESC',
        [universityId]
    );
    return rows;
}

export async function getAssessmentTemplateById(id: string, universityId?: string): Promise<AssessmentTemplate | null> {
    let query = 'SELECT * FROM assessment_templates WHERE id = $1';
    const params = [id];
    if (universityId) {
        query += ' AND university_id = $2';
        params.push(universityId);
    }
    const { rows } = await db.query(query, params);
    return rows[0] || null;
}

export async function createAssessmentTemplate(data: Partial<AssessmentTemplate>): Promise<AssessmentTemplate> {
    const deepClone = (val: any) => {
        if (!val) return {};
        try {
            return JSON.parse(JSON.stringify(val));
        } catch (e) {
            return {};
        }
    };

    const slug = data.slug || data.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `template-${Date.now()}`;
    const { rows } = await db.query(
        `INSERT INTO assessment_templates
        (university_id, name, slug, exam_type, config, layout_schema, assets_json, source_type, base_template_id, version, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
            data.university_id,
            data.name,
            slug,
            data.exam_type,
            JSON.stringify(deepClone(data.config)),
            JSON.stringify(deepClone(data.layout_schema)),
            JSON.stringify(deepClone(data.assets || [])),
            data.source_type || 'manual',
            data.base_template_id,
            data.version || 1,
            data.status || 'published',
            data.created_by
        ]
    );
    return rows[0];
}

export async function updateAssessmentTemplate(id: string, data: Partial<AssessmentTemplate>, universityId?: string): Promise<AssessmentTemplate> {
    // 1. Get the current state
    const current = await getAssessmentTemplateById(id, universityId);
    if (!current) throw new Error('Template not found or access denied');

    // 2. If template is published, any "edit" should actually create a new draft (except for status changes to archived)
    if (current.status === 'published' && !data.status) {
        // Forking into a new draft version
        const newData: Partial<AssessmentTemplate> = {
            ...current,
            ...data,
            id: undefined, // New ID
            version: current.version + 1,
            status: 'draft',
            base_template_id: current.id,
            created_by: data.updated_by || current.created_by,
            created_at: undefined,
            updated_at: undefined
        };
        return createAssessmentTemplate(newData);
    }

    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;

    const safeStringify = (val: any) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'string') return val;
        return JSON.stringify(val);
    };

    if (data.name) { fields.push(`name = $${i++}`); params.push(data.name); }
    if (data.slug) { fields.push(`slug = $${i++}`); params.push(data.slug); }
    if (data.exam_type) { fields.push(`exam_type = $${i++}`); params.push(data.exam_type); }
    if (data.config) { fields.push(`config = $${i++}`); params.push(JSON.stringify(data.config)); }
    if (data.layout_schema) { fields.push(`layout_schema = $${i++}`); params.push(JSON.stringify(data.layout_schema)); }
    if (data.assets) { fields.push(`assets_json = $${i++}`); params.push(JSON.stringify(data.assets)); }
    if (data.version) { fields.push(`version = $${i++}`); params.push(data.version); }
    if (data.status) { fields.push(`status = $${i++}`); params.push(data.status); }
    if (data.updated_by) { fields.push(`updated_by = $${i++}`); params.push(data.updated_by); }

    fields.push(`updated_at = NOW()`);
    params.push(id);
    let whereClause = `id = $${i++}`;
    if (universityId) {
        whereClause += ` AND university_id = $${i++}`;
        params.push(universityId);
    }

    const { rows } = await db.query(
        `UPDATE assessment_templates SET ${fields.join(', ')} WHERE ${whereClause} RETURNING *`,
        params
    );

    // Create revision history record
    if (rows[0]) {
        await db.query(
            `INSERT INTO assessment_template_revisions (template_id, version, config, layout_schema, changed_by)
            VALUES ($1, $2, $3, $4, $5)`,
            [id, rows[0].version, safeStringify(rows[0].config), safeStringify(rows[0].layout_schema), data.updated_by]
        );
    }

    return rows[0];
}

export async function cloneAssessmentTemplate(id: string, universityId?: string, created_by?: string): Promise<AssessmentTemplate> {
    const source = await getAssessmentTemplateById(id);
    if (!source) throw new Error('Source template not found');

    // Deep clone by removing IDs and resetting version
    const newData: Partial<AssessmentTemplate> = {
        university_id: universityId || source.university_id,
        name: universityId && universityId !== source.university_id ? source.name : `${source.name} (Copy)`,
        slug: universityId && universityId !== source.university_id ? source.slug : `${source.slug}-copy-${Date.now()}`,
        exam_type: source.exam_type,
        config: JSON.parse(JSON.stringify(source.config || [])),
        layout_schema: JSON.parse(JSON.stringify(source.layout_schema || { pages: [] })),
        assets: JSON.parse(JSON.stringify(source.assets || [])),
        source_type: source.source_type,
        base_template_id: source.id,
        version: 1,
        status: 'draft',
        created_by
    };

    return createAssessmentTemplate(newData);
}

export async function deleteAssessmentTemplate(id: string, universityId?: string): Promise<void> {
    let query = 'DELETE FROM assessment_templates WHERE id = $1';
    const params = [id];
    if (universityId) {
        query += ' AND university_id = $2';
        params.push(universityId);
    }
    await db.query(query, params);
}

export async function getAssessmentTemplateRevisions(templateId: string): Promise<any[]> {
    const { rows } = await db.query(
        `SELECT * FROM assessment_template_revisions WHERE template_id = $1 ORDER BY version DESC`,
        [templateId]
    );
    return rows;
}

// --- University Asset Management ---
export async function getUniversityAssets(universityId: string): Promise<UniversityAsset[]> {
    const { rows } = await db.query(
        'SELECT * FROM university_assets WHERE university_id = $1 ORDER BY created_at DESC',
        [universityId]
    );
    return rows;
}

export async function createUniversityAsset(data: {
    university_id: string;
    name: string;
    url: string;
    type: 'image' | 'logo' | 'seal' | 'other';
    metadata?: any;
}): Promise<UniversityAsset> {
    const { rows } = await db.query(
        `INSERT INTO university_assets (university_id, name, url, type, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [data.university_id, data.name, data.url, data.type, data.metadata || {}]
    );
    return rows[0];
}

export async function deleteUniversityAsset(id: string, universityId?: string): Promise<void> {
    let query = 'DELETE FROM university_assets WHERE id = $1';
    const params = [id];
    if (universityId) {
        query += ' AND university_id = $2';
        params.push(universityId);
    }
    await db.query(query, params);
}
