import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllRolePermissions, updateRolePermissions, seedDefaultPermissions } from '@uniconnect/shared';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user || (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS')) {
        throw error(403, 'Forbidden');
    }

    let permissions = await getAllRolePermissions();
    if (permissions.length === 0) {
        await seedDefaultPermissions();
        permissions = await getAllRolePermissions();
    }
    return json(permissions);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user || (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS')) {
        throw error(403, 'Forbidden');
    }

    const { role, features } = await request.json();
    if (!role || !Array.isArray(features)) {
        throw error(400, 'Invalid request body');
    }

    await updateRolePermissions(role, features);
    return json({ success: true });
};

export const PATCH: RequestHandler = async ({ locals }) => {
    if (!locals.user || (locals.user.role !== 'ADMIN' && locals.user.role !== 'PROGRAM_OPS')) {
        throw error(403, 'Forbidden');
    }

    await seedDefaultPermissions();
    const permissions = await getAllRolePermissions();
    return json(permissions);
};
