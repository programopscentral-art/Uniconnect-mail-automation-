import { json, error } from '@sveltejs/kit';
import { StudentDocumentService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);
    const types = await StudentDocumentService.getDocumentTypes();
    return json(types);
};
