import { json, error } from '@sveltejs/kit';
import { getMailboxes, getMailboxCredentials, decryptString, TemplateRenderer, getStudents } from '@uniconnect/shared';
import { google } from 'googleapis';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import fs from 'fs';

function logMailboxDebug(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    let dataStr = '';
    if (data) {
        if (data instanceof Error) {
            dataStr = `${data.message}\nStack: ${data.stack}`;
        } else {
            try {
                dataStr = JSON.stringify(data, (key, value) =>
                    value instanceof Error ? { message: value.message, stack: value.stack } : value,
                    2);
            } catch (e) {
                dataStr = '[Circular or Unserializable Data]';
            }
        }
    }
    const logLine = `[${timestamp}] [TEST_API] ${message} ${dataStr}\n`;
    try {
        fs.appendFileSync('debug_mailbox_auth.log', logLine);
        console.log(`[TEST_API] ${message}`, data || '');
    } catch (e) {
        console.error('Failed to write to debug_mailbox_auth.log', e);
    }
}

export const POST: RequestHandler = async ({ request, locals }) => {
    logMailboxDebug('Request received at endpoint');

    if (!locals.user) {
        logMailboxDebug('Unauthorized: No locals.user');
        throw error(401);
    }

    // Populate process.env for shared package crypto
    process.env.ENCRYPTION_KEY_BASE64 = env.ENCRYPTION_KEY_BASE64;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        logMailboxDebug('Parsing request JSON...');
        const body = await request.json().catch(e => {
            logMailboxDebug('JSON Parse Error', e);
            throw e;
        });

        const { testEmail, subject, html, universityId, config } = body;

        if (!testEmail || !subject || !html || !universityId) {
            logMailboxDebug('Missing fields', { testEmail: !!testEmail, subject: !!subject, html: !!html, universityId: !!universityId });
            throw error(400, 'Missing required fields. Please ensure Subject and Content are not empty.');
        }

        logMailboxDebug('Started processing test email', { universityId, testEmail });

        const mailboxes = await getMailboxes(universityId);
        const activeMailbox = mailboxes.find(m => m.status === 'ACTIVE');
        if (!activeMailbox) {
            logMailboxDebug('No active mailbox');
            throw error(400, 'No active mailbox connected for this university. Please connect a mailbox first.');
        }

        const credentials = await getMailboxCredentials(activeMailbox.id);
        if (!credentials?.refresh_token_enc) {
            logMailboxDebug('Refresh token missing in DB');
            throw new Error('Storage Error: Refresh token missing for this mailbox.');
        }

        logMailboxDebug('ENCRYPTION_KEY_BASE64 (first 10 chars):', (process.env.ENCRYPTION_KEY_BASE64 || '').substring(0, 10));
        logMailboxDebug('Decrypting refresh token...');
        const refreshToken = decryptString(credentials.refresh_token_enc);
        if (!refreshToken) {
            logMailboxDebug('Decryption returned empty string');
            throw new Error('Decryption Failed: Refresh token is empty after decryption.');
        }

        const clientId = env.GOOGLE_CLIENT_ID;
        const clientSecret = env.GOOGLE_CLIENT_SECRET;

        logMailboxDebug('Using Client ID:', clientId.substring(0, 15) + '...');

        const oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        logMailboxDebug('Authenticating with Google (getAccessToken)...');
        const tokenRes = await oauth2Client.getAccessToken();
        const token = tokenRes.token;

        if (!token) {
            logMailboxDebug('Google REJECTED fresh token request');
            throw new Error('Google rejection: Failed to get access token.');
        }

        logMailboxDebug('Token identity verification...');
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!userRes.ok) {
            const errText = await userRes.text();
            logMailboxDebug('UserInfo Failed', { status: userRes.status, response: errText });
            throw new Error('Token Validation Failed: Could not verify identity with Google.');
        }

        const userData = await userRes.json();
        logMailboxDebug('Token belongs to:', userData.email);

        if (userData.email.toLowerCase() !== activeMailbox.email.toLowerCase()) {
            logMailboxDebug('Identity Mismatch', { db: activeMailbox.email, google: userData.email });
            throw new Error(`Identity Mismatch: Connected mailbox is "${activeMailbox.email}" but Google Account is "${userData.email}". Please DELETE and RE-CONNECT using the correct account.`);
        }

        logMailboxDebug('Rendering template...');

        // Fetch a sample student for this university to get real data
        const students = await getStudents(universityId, 1);
        const sampleStudent = students[0];

        const mockVariables = {
            STUDENT_NAME: sampleStudent?.name || sampleStudent?.full_name || '',
            ...sampleStudent,
            ...(sampleStudent?.metadata || {})
        };

        const renderConfig = config;

        const finalHtml = TemplateRenderer.render(html, mockVariables, { config: renderConfig });
        const finalSubject = TemplateRenderer.render(subject, mockVariables, { config: renderConfig, noLayout: true }).replace(/<[^>]*>/g, '').trim();

        logMailboxDebug('Final Subject:', finalSubject);

        logMailboxDebug('Sending email via Gmail API...');
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Create raw email message (Standard RFC 2822)
        const utf8Subject = `=?utf-8?B?${Buffer.from(finalSubject).toString('base64')}?=`;
        const rawMessage = [
            `MIME-Version: 1.0`,
            `To: ${testEmail}`,
            `From: "NIAT Support" <${activeMailbox.email}>`,
            `Subject: [TEST PREVIEW] ${utf8Subject}`,
            `Content-Type: text/html; charset=utf-8`,
            `Content-Transfer-Encoding: base64`,
            '',
            Buffer.from(finalHtml).toString('base64')
        ].join('\r\n');

        const encodedMail = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMail
            }
        });

        logMailboxDebug('Success!');
        return json({ success: true });
    } catch (err: any) {
        logMailboxDebug('CAUGHT ERROR', err);

        let message = err.message || 'Unknown error';
        if (
            message.includes('535') ||
            message.includes('Username and Password not accepted') ||
            message.includes("Can't create new access token") ||
            message.includes('invalid_grant') ||
            message.includes('401')
        ) {
            message = `Google Login Expired/Refused. Cause: ${message}. ACTION REQUIRED: Please DELETE this mailbox and ADD it again to refresh permissions.`;
        }
        return json({ success: false, message }, { status: 500 });
    }
};
