import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/academic/faculty/me — get current user's faculty profile + assigned subjects
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    try {
        const fpRes = await db.query(
            `SELECT fp.id, fp.employee_code, fp.department, fp.designation, fp.specialization, fp.university_id
             FROM faculty_profiles fp
             WHERE fp.user_id = $1 AND fp.is_active = true
             LIMIT 1`,
            [locals.user.id]
        );

        if (fpRes.rows.length === 0) {
            return json({ profile: null, subjects: [] });
        }

        const profile = fpRes.rows[0];

        // Get assigned subjects with section info
        const subRes = await db.query(
            `SELECT DISTINCT s.id as subject_id, s.name as subject_name, s.code as subject_code,
                    t.name as term_name, t.id as term_id,
                    p.name as program_name, p.id as program_id,
                    sec.id as section_id, sec.name as section_name, sec.batch_code
             FROM faculty_subject_mappings fsm
             JOIN subjects s ON fsm.subject_id = s.id
             LEFT JOIN terms t ON s.term_id = t.id
             LEFT JOIN programs p ON s.program_id = p.id
             LEFT JOIN sections sec ON sec.term_id = t.id
             WHERE fsm.faculty_profile_id = $1
             ORDER BY t.name, s.name, sec.name`,
            [profile.id]
        );

        return json({ profile, subjects: subRes.rows });
    } catch (e: any) {
        console.error('[GET /api/academic/faculty/me]', e.message);
        return json({ profile: null, subjects: [] });
    }
};
