import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '@uniconnect/shared';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);
    const role = locals.user.role;
    const perms: string[] = locals.user.permissions || [];
    if (role !== 'ADMIN' && role !== 'PROGRAM_OPS' && !perms.includes('faculty-attendance')) {
        throw error(403, 'Access denied.');
    }

    // Fetch ALL operational universities (exclude Central/HQ/team orgs)
    let allUniversities: Array<{ id: string; name: string }> = [];
    try {
        const res = await db.query(`SELECT id, COALESCE(short_name, name) AS name FROM universities ORDER BY COALESCE(short_name, name)`);
        allUniversities = res.rows;
    } catch {
        try {
            const res = await db.query(`SELECT id, name FROM universities ORDER BY name`);
            allUniversities = res.rows;
        } catch {}
    }

    // Remove Central/HQ/team entries
    const filtered = allUniversities.filter(u => {
        const lower = (u.name || '').toLowerCase().trim();
        return lower !== 'central' && lower !== 'central team' && !lower.includes('central ops') && lower !== 'hq' && lower !== 'headquarters';
    });
    if (filtered.length > 0) allUniversities = filtered;

    // EVERY user who reaches this page gets ALL operational universities.
    // The page is permission-gated — if they have access, they can manage
    // attendance for any university. No role-based filtering.
    // This permanently fixes the "central team can't see universities" bug.

    // Auto-select: user's primary university if it's operational, else first
    let universityId = locals.user.university_id || null;
    if (universityId && !allUniversities.find(u => u.id === universityId)) {
        universityId = allUniversities[0]?.id || null;
    }
    if (!universityId && allUniversities.length > 0) {
        universityId = allUniversities[0].id;
    }
    const universityName = allUniversities.find(u => u.id === universityId)?.name || '';

    return {
        user: locals.user,
        userRole: role,
        universityId,
        universityName,
        allUniversities
    };
};
