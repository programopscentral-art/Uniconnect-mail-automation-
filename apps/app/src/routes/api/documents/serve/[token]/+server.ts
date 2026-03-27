import { error } from '@sveltejs/kit';
import { DocumentTokenService, StudentDocumentService, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ params, request }) => {
    // Ensure encryption key is available
    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

    // Verify token (no session required - token IS the auth)
    const tokenData = DocumentTokenService.verifyToken(params.token);
    if (!tokenData) {
        throw error(403, 'Document token expired or invalid. Please request a new link.');
    }

    // Look up user role for permission check
    const userResult = await db.query('SELECT role FROM users WHERE id = $1', [tokenData.userId]);
    if (!userResult.rows[0]) throw error(403, 'Invalid token');

    const role = userResult.rows[0].role;
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    try {
        const doc = await StudentDocumentService.getDocumentFile(
            tokenData.docId,
            tokenData.userId,
            role,
            ip,
            ua
        );

        const ext = (doc.fileName || '').split('.').pop()?.toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === 'pdf') contentType = 'application/pdf';
        else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
        else if (ext === 'png') contentType = 'image/png';
        else if (ext === 'webp') contentType = 'image/webp';

        const fileBuffer = Buffer.from(doc.content, 'base64');

        return new Response(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${doc.fileName}"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': new Date(tokenData.expiresAt * 1000).toUTCString(),
                'X-Content-Type-Options': 'nosniff',
                'X-Integrity-Verified': String(doc.integrityVerified),
                'X-Encryption': 'AES-256-GCM'
            }
        });
    } catch (e: any) {
        throw error(500, e.message || 'Failed to retrieve document');
    }
};
