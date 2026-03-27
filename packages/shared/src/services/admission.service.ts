import { db } from '../db/client';

export type AdmissionStatus = 'INITIATED' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'ENROLLED' | 'CANCELLED';
export type AdmissionStep = 'PERSONAL_INFO' | 'DOCUMENT_UPLOAD' | 'PAYMENT' | 'VERIFICATION' | 'FINAL_APPROVAL';

const VALID_TRANSITIONS: Record<string, string[]> = {
    'INITIATED': ['DOCUMENTS_PENDING'],
    'DOCUMENTS_PENDING': ['DOCUMENTS_SUBMITTED', 'CANCELLED'],
    'DOCUMENTS_SUBMITTED': ['UNDER_REVIEW', 'DOCUMENTS_PENDING'],
    'UNDER_REVIEW': ['APPROVED', 'REJECTED'],
    'APPROVED': ['ENROLLED'],
    'REJECTED': ['DOCUMENTS_PENDING', 'CANCELLED'],
    'ENROLLED': [],
    'CANCELLED': ['INITIATED'] // Allow restart
};

const STEP_ORDER: AdmissionStep[] = ['PERSONAL_INFO', 'DOCUMENT_UPLOAD', 'PAYMENT', 'VERIFICATION', 'FINAL_APPROVAL'];

export class AdmissionService {

    /**
     * Create or get an admission workflow for a student.
     */
    static async createWorkflow(studentProfileId: string, universityId: string) {
        // Check if workflow already exists
        const existing = await db.query(
            'SELECT * FROM admission_workflows WHERE student_profile_id = $1',
            [studentProfileId]
        );
        if (existing.rows[0]) return existing.rows[0];

        const result = await db.query(
            `INSERT INTO admission_workflows (student_profile_id, university_id, workflow_status, current_step)
             VALUES ($1, $2, 'INITIATED', 'PERSONAL_INFO')
             RETURNING *`,
            [studentProfileId, universityId]
        );
        return result.rows[0];
    }

    /**
     * Advance the workflow step.
     */
    static async advanceStep(workflowId: string, nextStep: AdmissionStep, actorId: string) {
        const currentIdx = STEP_ORDER.indexOf(nextStep);
        if (currentIdx < 0) throw new Error(`Invalid step: ${nextStep}`);

        await db.query(
            `UPDATE admission_workflows
             SET current_step = $1, updated_at = NOW(),
                 metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('last_step_by', $3, 'last_step_at', NOW()::text)
             WHERE id = $2`,
            [nextStep, workflowId, actorId]
        );
    }

    /**
     * Update workflow status with state machine validation.
     */
    static async updateStatus(workflowId: string, newStatus: AdmissionStatus, actorId: string, remarks?: string) {
        const current = await db.query('SELECT workflow_status FROM admission_workflows WHERE id = $1', [workflowId]);
        if (!current.rows[0]) throw new Error('Workflow not found');

        const currentStatus = current.rows[0].workflow_status;
        const allowed = VALID_TRANSITIONS[currentStatus] || [];

        if (!allowed.includes(newStatus)) {
            throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowed.join(', ')}`);
        }

        const updates: string[] = ['workflow_status = $1', 'updated_at = NOW()'];
        const params: any[] = [newStatus, workflowId, actorId];
        let pi = 4;

        if (newStatus === 'DOCUMENTS_SUBMITTED') {
            updates.push(`submitted_at = COALESCE(submitted_at, NOW())`);
        } else if (newStatus === 'UNDER_REVIEW') {
            updates.push(`reviewed_at = NOW()`);
        } else if (newStatus === 'APPROVED' || newStatus === 'ENROLLED') {
            updates.push(`approved_at = COALESCE(approved_at, NOW())`);
        }

        if (remarks) {
            updates.push(`remarks = $${pi++}`);
            params.push(remarks);
        }

        // Log actor in metadata
        updates.push(`metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('last_status_by', $3, 'last_status_at', NOW()::text)`);

        await db.query(
            `UPDATE admission_workflows SET ${updates.join(', ')} WHERE id = $2`,
            params
        );

        // If enrolled, update student_profiles status too
        if (newStatus === 'ENROLLED') {
            await db.query(
                `UPDATE student_profiles SET student_status = 'ENROLLED', updated_at = NOW()
                 WHERE id = (SELECT student_profile_id FROM admission_workflows WHERE id = $1)`,
                [workflowId]
            );
        }
    }

    /**
     * Assign a reviewer.
     */
    static async assignReviewer(workflowId: string, reviewerId: string) {
        await db.query(
            'UPDATE admission_workflows SET assigned_reviewer_id = $1, updated_at = NOW() WHERE id = $2',
            [reviewerId, workflowId]
        );
    }

    /**
     * Get workflow detail with student info.
     */
    static async getWorkflow(studentProfileId: string) {
        const result = await db.query(
            `SELECT aw.*,
                    sp.enrollment_number, sp.niat_id, sp.phone, sp.pii_fields_present,
                    sp.father_name, sp.mother_name, sp.date_of_birth, sp.gender,
                    sp.address_city, sp.address_state,
                    u.name as student_name, u.email as student_email,
                    rv.name as reviewer_name,
                    prog.name as program_name,
                    univ.name as university_name
             FROM admission_workflows aw
             JOIN student_profiles sp ON aw.student_profile_id = sp.id
             LEFT JOIN users u ON sp.user_id = u.id
             LEFT JOIN users rv ON aw.assigned_reviewer_id = rv.id
             LEFT JOIN programs prog ON sp.program_id = prog.id
             LEFT JOIN universities univ ON aw.university_id = univ.id
             WHERE aw.student_profile_id = $1`,
            [studentProfileId]
        );
        return result.rows[0] || null;
    }

    /**
     * List workflows by university with filtering.
     */
    static async getWorkflowsByUniversity(universityId: string, filters?: {
        status?: string;
        step?: string;
        search?: string;
        programId?: string;
        limit?: number;
        offset?: number;
    }) {
        const conditions = ['aw.university_id = $1'];
        const params: any[] = [universityId];
        let pi = 2;

        if (filters?.status) {
            conditions.push(`aw.workflow_status = $${pi++}`);
            params.push(filters.status);
        }
        if (filters?.step) {
            conditions.push(`aw.current_step = $${pi++}`);
            params.push(filters.step);
        }
        if (filters?.programId) {
            conditions.push(`sp.program_id = $${pi++}`);
            params.push(filters.programId);
        }
        if (filters?.search) {
            conditions.push(`(u.name ILIKE $${pi} OR sp.enrollment_number ILIKE $${pi} OR sp.niat_id ILIKE $${pi})`);
            params.push(`%${filters.search}%`);
            pi++;
        }

        let limitClause = '';
        if (filters?.limit) {
            limitClause = ` LIMIT $${pi++}`;
            params.push(filters.limit);
        }
        if (filters?.offset) {
            limitClause += ` OFFSET $${pi++}`;
            params.push(filters.offset);
        }

        const result = await db.query(
            `SELECT aw.*,
                    sp.enrollment_number, sp.niat_id,
                    u.name as student_name, u.email as student_email,
                    rv.name as reviewer_name,
                    prog.name as program_name,
                    (SELECT COUNT(*) FROM documents d
                     WHERE d.owner_entity_type = 'STUDENT' AND d.owner_entity_id = sp.id AND d.file_status = 'ACTIVE') as doc_count
             FROM admission_workflows aw
             JOIN student_profiles sp ON aw.student_profile_id = sp.id
             LEFT JOIN users u ON sp.user_id = u.id
             LEFT JOIN users rv ON aw.assigned_reviewer_id = rv.id
             LEFT JOIN programs prog ON sp.program_id = prog.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY aw.updated_at DESC${limitClause}`,
            params
        );
        return result.rows;
    }

    /**
     * Get admission stats for dashboard.
     */
    static async getWorkflowStats(universityId: string) {
        const result = await db.query(
            `SELECT
                workflow_status,
                COUNT(*) as count
             FROM admission_workflows
             WHERE university_id = $1
             GROUP BY workflow_status`,
            [universityId]
        );

        const stats: Record<string, number> = {
            INITIATED: 0, DOCUMENTS_PENDING: 0, DOCUMENTS_SUBMITTED: 0,
            UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0, ENROLLED: 0, CANCELLED: 0
        };
        for (const row of result.rows) {
            stats[row.workflow_status] = parseInt(row.count);
        }
        stats.TOTAL = Object.values(stats).reduce((a, b) => a + b, 0);
        return stats;
    }
}
