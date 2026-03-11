import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';

// GET /api/academic/subjects/by-university?universityId=X
// Returns all subjects across all programs/terms for a university (for onboarding subject picker)
export const GET = async ({ url, locals }: { url: URL; locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const universityId = url.searchParams.get('universityId');
    if (!universityId) throw error(400, 'universityId is required');

    try {
        const result = await db.query(
            `SELECT DISTINCT
                s.id,
                s.name,
                s.code,
                s.term_id,
                t.name AS term_name,
                p.id AS program_id,
                p.name AS program_name,
                p.code AS program_code
             FROM subjects s
             JOIN terms t ON t.id = s.term_id
             JOIN programs p ON p.id = t.program_id
             WHERE p.university_id = $1
             ORDER BY p.name, t.name, s.name`,
            [universityId]
        );
        return json(result.rows);
    } catch (e: any) {
        console.error('[GET /api/academic/subjects/by-university]', e.message);
        return json([]);
    }
};
