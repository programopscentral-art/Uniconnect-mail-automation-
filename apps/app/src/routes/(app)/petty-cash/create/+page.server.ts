import { db } from '@uniconnect/shared';
import { isGlobalAdmin } from '$lib/server/petty_cash_access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const user = locals.user!;
    let universities: Array<{ id: string; name: string }>;
    if (isGlobalAdmin(user)) {
        const { rows } = await db.query(`SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE status = 'ACTIVE' ORDER BY name`);
        universities = rows;
    } else {
        universities = (user.universities || []).map((u: any) => ({ id: u.id, name: u.name }));
        if (universities.length === 0 && user.university_id) {
            const { rows } = await db.query(`SELECT id, COALESCE(short_name, name) AS name FROM universities WHERE id = $1`, [user.university_id]);
            universities = rows;
        }
    }
    return { universities };
};
