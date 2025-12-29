import { markRecipientOpen } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
    const { token } = params;
    if (token) {
        try {
            // Fire and forget update (or await if critical)
            await markRecipientOpen(token);
        } catch (e) {
            console.error('Tracking Error', e);
        }
    }

    // Return 1x1 transparent GIF
    const pixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
    );

    return new Response(pixel, {
        headers: {
            'Content-Type': 'image/gif',
            'Content-Length': pixel.length.toString(),
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    });
};
