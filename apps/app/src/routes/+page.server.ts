import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Root landing. SME is examinations-only (no dashboard permission), so it must
// land on the Examinations page rather than /dashboard (which would 403).
export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(302, '/login');
    throw redirect(302, locals.user.role === 'SME' ? '/assessments' : '/dashboard');
};
