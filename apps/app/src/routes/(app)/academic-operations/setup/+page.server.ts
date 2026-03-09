import { getAllUniversities } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const universities = await getAllUniversities();
    return {
        universities
    };
};
