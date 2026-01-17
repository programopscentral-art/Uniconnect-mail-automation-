import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent }) => {
    const parentData = await parent();
    return {
        user: parentData.user,
        theme: (parentData as any).theme as 'light' | 'dark'
    };
};
