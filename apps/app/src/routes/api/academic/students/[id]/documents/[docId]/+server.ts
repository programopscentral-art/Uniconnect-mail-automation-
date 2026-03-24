import { json, error } from '@sveltejs/kit';
import { StudentDocumentService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, request }) => {
    if (!locals.user) throw error(401);

    try {
        const result = await StudentDocumentService.getDocumentFile(
            params.docId,
            locals.user.id,
            locals.user.role as string,
            request.headers.get('x-forwarded-for') || undefined,
            request.headers.get('user-agent') || undefined
        );

        // Block serving tampered documents
        if (!result.integrityVerified) {
            throw error(422, 'Document integrity check failed — file may have been tampered with. This incident has been logged.');
        }

        // Decrypt and return — document only exists encrypted in DB, never on disk
        const buffer = Buffer.from(result.content, 'base64');
        const ext = result.fileName.split('.').pop()?.toLowerCase() || 'pdf';
        const mimeTypes: Record<string, string> = {
            pdf: 'application/pdf',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp'
        };

        return new Response(buffer, {
            headers: {
                'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                'Content-Disposition': `inline; filename="${result.fileName}"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'X-Content-Type-Options': 'nosniff',
                'X-Integrity-Verified': 'true',
                'X-Encryption': 'AES-256-GCM'
            }
        });
    } catch (e: any) {
        if (e.status) throw e;
        throw error(e.message?.includes('permission') ? 403 : 500, e.message);
    }
};

export const DELETE: RequestHandler = async ({ params, locals, request }) => {
    if (!locals.user) throw error(401);

    try {
        await StudentDocumentService.deleteDocument(
            params.docId,
            locals.user.id,
            locals.user.role as string,
            request.headers.get('x-forwarded-for') || undefined,
            request.headers.get('user-agent') || undefined
        );
        return json({ success: true });
    } catch (e: any) {
        throw error(e.message?.includes('admin') ? 403 : 500, e.message);
    }
};
