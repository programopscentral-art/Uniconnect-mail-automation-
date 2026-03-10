import { getAllUniversities } from '@uniconnect/shared';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    const isPrivileged = locals.user?.role === 'ADMIN' || locals.user?.role === 'PROGRAM_OPS';

    // Load all universities so the inline selector always works,
    // even when user.universities is empty (ADMIN/PROGRAM_OPS have global access)
    const allUniversities = isPrivileged ? await getAllUniversities().catch(() => []) : [];

    return { allUniversities };
};
