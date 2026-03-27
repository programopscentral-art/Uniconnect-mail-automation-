import { error, redirect } from '@sveltejs/kit';
import { NumberChallengeService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

/** GET: Verify a challenge from email link click */
export const GET: RequestHandler = async ({ url }) => {
    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;

    const token = url.searchParams.get('t');
    if (!token) throw error(400, 'Missing verification token');

    const result = await NumberChallengeService.verifyChallenge(token);

    if (result.valid) {
        // Redirect to a success page that tells the user to go back to their tab
        return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Verified — UniConnect</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: white; }
                    .card { text-align: center; background: #1e293b; padding: 48px; border-radius: 16px; max-width: 400px; }
                    .check { font-size: 64px; margin-bottom: 16px; }
                    h2 { margin: 0 0 12px; color: #22c55e; }
                    p { color: #94a3b8; line-height: 1.6; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="check">✓</div>
                    <h2>Identity Verified</h2>
                    <p>You can now go back to the UniConnect tab.<br>The sensitive content will be unlocked automatically.</p>
                    <script>
                        // Auto-close after 3 seconds if opened as popup
                        setTimeout(() => { try { window.close(); } catch {} }, 3000);
                    </script>
                </div>
            </body>
            </html>
        `, {
            headers: { 'Content-Type': 'text/html' }
        });
    } else {
        return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Verification Failed — UniConnect</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: white; }
                    .card { text-align: center; background: #1e293b; padding: 48px; border-radius: 16px; max-width: 400px; }
                    .x { font-size: 64px; margin-bottom: 16px; }
                    h2 { margin: 0 0 12px; color: #ef4444; }
                    p { color: #94a3b8; line-height: 1.6; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="x">✗</div>
                    <h2>Verification Failed</h2>
                    <p>The link is expired, already used, or the wrong number was selected.<br>Please try again from the UniConnect app.</p>
                </div>
            </body>
            </html>
        `, {
            status: 403,
            headers: { 'Content-Type': 'text/html' }
        });
    }
};
