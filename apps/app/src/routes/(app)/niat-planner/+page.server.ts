import { error } from '@sveltejs/kit';
import { getAllUniversities, db } from '@uniconnect/shared';

export const load = async ({ locals }: { locals: any }) => {
    if (!locals.user) throw error(401);

    // Check for niat-planner permission
    if (!locals.user.permissions?.includes('niat-planner') && locals.user.role !== 'ADMIN') {
        throw error(403, 'You do not have permission to access NIAT Planner');
    }

    const [universities, imports] = await Promise.all([
        getAllUniversities(),
        db.query('SELECT * FROM curriculum_imports ORDER BY uploaded_at DESC LIMIT 20')
    ]);

    return {
        user: locals.user,
        universities,
        imports: imports.rows
    };
};
