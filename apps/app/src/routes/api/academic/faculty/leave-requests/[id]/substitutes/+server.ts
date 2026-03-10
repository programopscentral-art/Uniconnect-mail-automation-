import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';

// GET — returns faculty who can substitute for the leave requester's subjects
export const GET = async ({ params, locals }: { params: Record<string, string>; locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const result = await db.query(
        `SELECT DISTINCT
            fp2.id,
            u2.full_name as name,
            fp2.employee_code,
            fp2.department,
            fp2.designation,
            json_agg(DISTINCT s.name ORDER BY s.name) as shared_subjects
         FROM faculty_leave_requests flr
         JOIN faculty_profiles fp ON fp.id = flr.faculty_profile_id
         JOIN faculty_subject_mappings fsm ON fsm.faculty_profile_id = fp.id
         JOIN faculty_subject_mappings fsm2 ON fsm2.subject_id = fsm.subject_id
              AND fsm2.faculty_profile_id != fp.id
              AND fsm2.can_substitute = true
         JOIN faculty_profiles fp2 ON fp2.id = fsm2.faculty_profile_id
         JOIN users u2 ON u2.id = fp2.user_id
         JOIN subjects s ON s.id = fsm.subject_id
         WHERE flr.id = $1 AND fp2.university_id = fp.university_id AND fp2.is_active = true
         GROUP BY fp2.id, u2.full_name, fp2.employee_code, fp2.department, fp2.designation
         ORDER BY u2.full_name`,
        [params.id]
    );

    return json(result.rows);
};
