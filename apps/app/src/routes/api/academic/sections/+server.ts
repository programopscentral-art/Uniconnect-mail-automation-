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
            'SELECT * FROM sections WHERE program_id = $1 AND term_id = $2 AND is_active = true ORDER BY name',
            [programId, termId]
        );
        if (result.rows.length === 0) {
            result = await db.query(
                'SELECT * FROM sections WHERE program_id = $1 AND is_active = true ORDER BY name',
                [programId]
            );
        }
        return json(result.rows);
    } else if (programId) {
        const { db } = await import('@uniconnect/shared');
        const result = await db.query(
            'SELECT * FROM sections WHERE program_id = $1 AND is_active = true ORDER BY name',
            [programId]
        );
        return json(result.rows);
    } else {
        const sections = await AcademicService.getSections(termId!);
        return json(sections);
    }
};

export const POST: RequestHandler = async ({ request, locals }: { request: Request, locals: App.Locals }) => {
    if (locals.user?.role !== 'ADMIN' && locals.user?.role !== 'PROGRAM_OPS') {
        throw error(403, 'Forbidden');
    }

    const { university_id, program_id, term_id, name, batch_code, strength } = await request.json();

    if (!university_id || !program_id || !term_id || !name || !batch_code) {
        throw error(400, 'Missing required fields');
    }

    const section = await AcademicService.createSection(university_id, program_id, term_id, {
        name,
        batch_code,
        strength: strength || 0
    });
    return json(section);
};
