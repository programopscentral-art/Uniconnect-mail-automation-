import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getOpsTableSchemas, executeReadOnlyQuery } from '@uniconnect/shared';

const GEMINI_KEY = () => (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

const ALLOWED_TABLES = [
    'ops_daily_data', 'ops_instructor_daily', 'tasks', 'task_assignees',
    'schedule_events', 'budget_proposals', 'budget_proposal_reports',
    'users', 'universities',
];

const FORBIDDEN_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
    'GRANT', 'REVOKE', 'COPY', 'EXECUTE', 'CALL', 'SET ', 'VACUUM',
];

function validateSQL(sql: string): { valid: boolean; reason?: string } {
    const trimmed = sql.trim().replace(/;+$/, '').trim();
    const upper = trimmed.toUpperCase();

    // Must be a SELECT
    if (!upper.startsWith('SELECT')) {
        return { valid: false, reason: 'Only SELECT queries are allowed' };
    }

    // No multiple statements
    if (trimmed.includes(';')) {
        return { valid: false, reason: 'Multiple statements are not allowed' };
    }

    // No forbidden keywords
    for (const kw of FORBIDDEN_KEYWORDS) {
        // Check for standalone keyword (not as part of column names)
        const regex = new RegExp(`\\b${kw.trim()}\\b`, 'i');
        if (regex.test(trimmed) && kw.trim() !== 'SET') continue; // SET is only forbidden at start
        if (kw.trim() === 'SET' && upper.startsWith('SET')) {
            return { valid: false, reason: `Forbidden keyword: ${kw.trim()}` };
        }
    }
    for (const kw of FORBIDDEN_KEYWORDS.filter(k => k.trim() !== 'SET')) {
        const regex = new RegExp(`\\b${kw.trim()}\\b`, 'i');
        if (regex.test(upper)) {
            return { valid: false, reason: `Forbidden keyword: ${kw.trim()}` };
        }
    }

    // Ensure LIMIT exists, add if missing
    // (handled in caller)

    return { valid: true };
}

function ensureLimit(sql: string): string {
    const upper = sql.toUpperCase();
    if (!upper.includes('LIMIT')) {
        return sql.replace(/;*$/, '') + ' LIMIT 100';
    }
    return sql;
}

async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash'];
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
                }),
            });
            if (response.status === 429) {
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            if (!response.ok) continue;
            const data = await response.json();
            return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        } catch { continue; }
    }
    return null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const apiKey = GEMINI_KEY();
    if (!apiKey || apiKey.length < 10) {
        return json({ answer: 'AI is not configured. Please set GEMINI_API_KEY.', query: null, data: null });
    }

    const { question } = await request.json();
    if (!question || typeof question !== 'string' || question.trim().length < 3) {
        throw error(400, 'Please provide a question');
    }

    const schemas = getOpsTableSchemas();

    // Step 1: Generate SQL from question
    const sqlPrompt = `You are a PostgreSQL SQL assistant. Given the user question, generate a SINGLE SELECT query to answer it.

${schemas}

RULES:
- Only generate SELECT queries, never INSERT/UPDATE/DELETE/DROP
- Always include LIMIT (max 100)
- Use COALESCE for nullable numeric columns
- Use appropriate JOINs when data spans tables
- For date filtering, today is ${new Date().toISOString().split('T')[0]}
- "last week" means the 7 days before today, "this month" means current calendar month
- University names in ops_daily_data are short names (e.g., "CDU", "VGU", "Aurora")
- Return ONLY the SQL query, nothing else — no markdown, no explanation, no backticks

USER QUESTION: ${question}`;

    const sqlResult = await callGemini(sqlPrompt, apiKey);
    if (!sqlResult) {
        return json({ answer: 'Could not generate a query. Please try rephrasing your question.', query: null, data: null });
    }

    // Clean up — remove markdown fences if any
    let sql = sqlResult.trim()
        .replace(/^```sql\s*/i, '').replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '').trim();

    // Validate
    const validation = validateSQL(sql);
    if (!validation.valid) {
        return json({ answer: `Query validation failed: ${validation.reason}. Please rephrase.`, query: sql, data: null });
    }

    sql = ensureLimit(sql);

    // Step 2: Execute query
    let queryResult;
    try {
        queryResult = await executeReadOnlyQuery(sql);
    } catch (e: any) {
        return json({
            answer: `Query failed: ${e.message?.slice(0, 200)}. Try rephrasing your question.`,
            query: sql,
            data: null
        });
    }

    // Step 3: Format results with AI
    const dataPreview = JSON.stringify(queryResult.rows.slice(0, 20), null, 2);
    const formatPrompt = `You are a data analyst for UniConnect, an ed-tech operations platform. The user asked: "${question}"

The database query returned ${queryResult.rowCount} row(s). Here is the data:
${dataPreview}

Provide a clear, concise natural language answer to the user's question based on this data. Include specific numbers and names. Use plain text paragraphs (no markdown, no bullet symbols). If the data is empty, say so. Keep the response under 200 words.`;

    const answer = await callGemini(formatPrompt, apiKey);

    return json({
        answer: answer || (queryResult.rows.length > 0 ? 'Query returned data — see the table below.' : 'No data found for your question.'),
        query: sql,
        data: queryResult.rows,
        rowCount: queryResult.rowCount,
    });
};
