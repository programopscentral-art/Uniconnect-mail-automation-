import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    let prompt, context;
    try {
        const body = await request.json();
        prompt = body.prompt;
        context = body.context;
    } catch (e) {
        throw error(400, 'Invalid JSON body');
    }

    // 1. Check for n8n Webhook Fallback (as requested by user)
    const n8nWebhook = env.N8N_AI_WEBHOOK_URL || process.env.N8N_AI_WEBHOOK_URL;
    if (n8nWebhook) {
        console.log('AI Generation: Using n8n webhook...');
        try {
            const n8nRes = await fetch(n8nWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, context, system: 'NIAT Assistant' })
            });
            if (n8nRes.ok) {
                return json(await n8nRes.json());
            }
        } catch (e) {
            console.error('n8n Webhook failed, falling back to Gemini', e);
        }
    }

    // 2. Try standard SvelteKit env
    let apiKey = (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').replace(/^["']|["']$/g, '');

    // 3. Direct .env file read fallback with DIAGNOSTICS
    if (!apiKey) {
        console.log(`AI Generation: Env vars empty. CWD is: ${process.cwd()}`);
        const possiblePaths = [
            path.resolve(process.cwd(), '.env'),
            path.resolve(process.cwd(), 'apps/app/.env'),
            path.resolve(process.cwd(), '../../.env'), // Root from apps/app
            path.resolve('C:/Desktop/uniconnect-mail-automation/.env'), // Hardcoded root
            path.resolve('C:/Desktop/uniconnect-mail-automation/apps/app/.env') // Hardcoded app
        ];

        for (const p of possiblePaths) {
            try {
                if (fs.existsSync(p)) {
                    console.log(`AI Generation: Reading file ${p}`);
                    const content = fs.readFileSync(p, 'utf-8');
                    const match = content.match(/GEMINI_API_KEY=["']?([^"'\n\r]+)["']?/);
                    if (match && match[1]) {
                        apiKey = match[1].replace(/["']$/g, '');
                        console.log(`AI Generation: Successfully recovered key from ${p} (length: ${apiKey.length})`);
                        break;
                    }
                }
            } catch (fsErr) {
                console.warn(`AI Generation: Can't read ${p}`, fsErr);
            }
        }
    }

    if (!apiKey) {
        throw error(500, { message: 'Gemini API key not configured. I searched root and app .env files but found no key. Please check spelling or restart server.' });
    }

    const systemPrompt = `You are a professional assistant for NIAT. 
    Generate an email template. 
    PLACEHOLDERS: {{STUDENT_NAME}}, {{TERM_FEE}}, {{PAY_LINK}}, {{COUPON_CODE}}, {{FEE_TABLE}}.
    Rules: Use HTML tables for fees. No markdown. Tone: Professional.
    Response: JSON ONLY with keys "subject" and "html".`;

    try {
        // Use verified model from diagnostics: gemini-2.0-flash
        const apiUri = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        console.log(`AI Generation: Fetching from Gemini 2.0 Flash...`);

        const response = await fetch(apiUri, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\nRequest: ${prompt}\nContext: ${context || ''}` }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('Gemini API Error:', errData);
            const msg = errData.error?.message || JSON.stringify(errData);
            throw error(502, { message: `Google API Error (${response.status}): ${msg}` });
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) {
            console.error('AI Generation: Empty response', data);
            throw error(500, { message: 'AI returned an empty response.' });
        }

        try {
            const cleanText = rawText.replace(/```json|```/g, '').trim();
            const result = JSON.parse(cleanText);
            return json(result);
        } catch (parseErr) {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try { return json(JSON.parse(jsonMatch[0])); } catch (e) { }
            }
            console.error('AI Generation: Parse Failure', rawText);
            throw error(500, { message: 'AI returned invalid JSON formatting. Please rephrase your request.' });
        }
    } catch (err: any) {
        console.error('AI Generation Critical Err:', err);

        // DISK LOGGING FALLBACK
        try {
            const logPath = path.resolve(process.cwd(), 'ai-error.log');
            const timestamp = new Date().toISOString();
            const logMsg = `[${timestamp}] ERROR: ${err.message}\nSTACK: ${err.stack}\n\n`;
            fs.appendFileSync(logPath, logMsg);
        } catch (e) { }

        const detail = err.message || (typeof err === 'string' ? err : 'Internal Server Error');
        throw error(err.status || 500, { message: `AI Error: ${detail}` });
    }
};
