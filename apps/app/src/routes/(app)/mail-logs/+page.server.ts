import { getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const userRole = locals.user?.role as string;
    const isGlobalAdmin = userRole === 'ADMIN' || userRole === 'PROGRAM_OPS';

    let universities: any[] = [];
    if (isGlobalAdmin) {
        universities = await getAllUniversities();
    }

    return {
        universities
    };
};
