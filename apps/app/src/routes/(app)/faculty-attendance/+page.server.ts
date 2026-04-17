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

    // Step 1: Fetch all universities (with fallback if short_name column missing)
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

    // Step 2: For non-admin users, try to filter to assigned universities
    if (role !== 'ADMIN' && role !== 'PROGRAM_OPS') {
        const assignedIds = new Set<string>();
        // Add primary university
        if (locals.user.university_id) assignedIds.add(locals.user.university_id);
        // Add from user_role_assignments
        try {
            const res = await db.query(
                `SELECT DISTINCT university_id FROM user_role_assignments WHERE user_id = $1 AND university_id IS NOT NULL`,
                [locals.user.id]
            );
            for (const r of res.rows) assignedIds.add(r.university_id);
        } catch {}

        // If they have specific assignments, filter. Otherwise keep all (fallback).
        if (assignedIds.size > 0) {
            const filtered = allUniversities.filter(u => assignedIds.has(u.id));
            if (filtered.length > 0) allUniversities = filtered;
            // If all their assignments are "Central" type and no operational
            // universities match, keep the full list as fallback
        }
    }

    // Step 3: Remove "Central" / HQ entries — they're org units, not operational universities
    const skipNames = ['central', 'central team', 'hq', 'headquarters', 'nxtwave', 'central ops'];
    const operational = allUniversities.filter(u => {
        const lower = (u.name || '').toLowerCase().trim();
        return !skipNames.some(s => lower === s || lower.includes('central'));
    });
    // Only use filtered if we still have options
    if (operational.length > 0) allUniversities = operational;

    // Step 4: Auto-select
    let universityId = locals.user.university_id || null;
    // If their primary is Central (filtered out), pick first operational
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
