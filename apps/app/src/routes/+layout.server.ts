import { getAllUniversities } from '@uniconnect/shared';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    const isGlobal = locals.user?.permissions?.includes('universities');
    const universities = isGlobal ? await getAllUniversities() : [];

    return {
        user: locals.user ? JSON.parse(JSON.stringify(locals.user)) : null,
        theme: locals.theme,
        universities
    };
};
