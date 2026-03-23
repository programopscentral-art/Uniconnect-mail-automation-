import { AcademicService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }: { url: URL, locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const termId = url.searchParams.get('termId');
    const programId = url.searchParams.get('programId');

    if (!termId && !programId) throw error(400, 'termId or programId is required');

    if (termId && programId) {
        // Try exact match first, fallback to just programId
        const { db } = await import('@uniconnect/shared');
        let result = await db.query(
            'SELECT * FROM subjects WHERE program_id = $1 AND term_id = $2 AND is_active = true ORDER BY name',
            [programId, termId]
        );
        if (result.rows.length === 0) {
            result = await db.query(
                'SELECT * FROM subjects WHERE program_id = $1 AND is_active = true ORDER BY name',
                [programId]
            );
        }
        return json(result.rows);
    } else if (programId) {
        const { db } = await import('@uniconnect/shared');
        const result = await db.query(
            'SELECT * FROM subjects WHERE program_id = $1 AND is_active = true ORDER BY name',
            [programId]
        );
        return json(result.rows);
    } else {
        const subjects = await AcademicService.getSubjects(termId!);
        return json(subjects);
    }
};

export const POST: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, program_id, term_id, name, code, credit_value, total_sessions } = await request.json();

    if (!university_id || !program_id || !term_id || !name) {
        throw error(400, 'Missing required fields (university_id, program_id, term_id, name)');
    }

    const subject = await AcademicService.createSubject(university_id, program_id, term_id, {
        name,
        code: code || undefined,
        credit_value: Number(credit_value) || 0,
        total_sessions: Number(total_sessions) || 30
    });
    return json(subject);
};
