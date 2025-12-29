import { google } from 'googleapis';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

function logDebug(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message} ${data ? JSON.stringify(data, null, 2) : ''}\n`;
    try {
        fs.appendFileSync('debug_auth.log', logLine);
    } catch (e) {
        console.error('Failed to write to debug_auth.log', e);
    }
}

function getOAuth2Client() {
    logDebug('SSL Bypass Status (NODE_TLS_REJECT_UNAUTHORIZED):', process.env.NODE_TLS_REJECT_UNAUTHORIZED);
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const redirectUri = env.GOOGLE_LOGIN_REDIRECT_URI || "http://localhost:3001/api/auth/google/callback";

    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
    );
}

export function getGoogleAuthUrl() {
    const oauth2Client = getOAuth2Client();
    const redirectUri = env.GOOGLE_LOGIN_REDIRECT_URI || "http://localhost:3001/api/auth/google/callback";

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'openid'
        ],
        prompt: 'consent',
        redirect_uri: redirectUri
    });

    logDebug('Generated Auth URL', { url, redirectUri });
    return url;
}

export async function getGoogleUserFromCode(code: string) {
    const oauth2Client = getOAuth2Client();

    logDebug('Starting token exchange', {
        code: code.substring(0, 5) + '...',
        redirect_uri: env.GOOGLE_LOGIN_REDIRECT_URI
    });

    try {
        const { tokens } = await oauth2Client.getToken(code);
        logDebug('Token exchange successful');

        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });

        logDebug('Fetching user info');
        const userinfo = await oauth2.userinfo.get();
        logDebug('User info fetched', { email: userinfo.data.email });

        return userinfo.data;
    } catch (err: any) {
        const errorData = {
            message: err.message,
            response: err.response?.data,
            stack: err.stack
        };
        logDebug('Token exchange failed', errorData);
        throw new Error(`Token exchange failed: ${err.message}${err.response?.data ? ' - ' + JSON.stringify(err.response.data) : ''}`);
    }
}


