import { db } from '@uniconnect/shared';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);
    const id = params.id;
    const body = await request.json();

    const { name, email, metadata } = body;

    // Verify ownership if needed
    // ...

    await db.query(
        `UPDATE students SET name = $1, email = $2, metadata = $3, updated_at = NOW() WHERE id = $4`,
        [name, email, JSON.stringify(metadata), id]
    );

    return json({ success: true });
};
