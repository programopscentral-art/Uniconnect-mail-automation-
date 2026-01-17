import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    return {
        user: locals.user ? JSON.parse(JSON.stringify(locals.user)) : null,
        theme: locals.theme
    };
};
